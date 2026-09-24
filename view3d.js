/* Presentation state only: independent of scoring, physics updates and WebGL. */
(function(root) {
  'use strict';
  const spatial=typeof module!=='undefined'&&module.exports?require('./engine3d.js'):root.Gorillas3D;
  const copy=value=>JSON.parse(JSON.stringify(value));
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
  function daylight(game) {
    const sun=spatial.sunPosition(game),bounds=spatial.cityBounds(game),z=(bounds.back+bounds.front)/2;
    const direction=[sun.x,sun.y,sun.z-z],length=Math.hypot(...direction);
    const warmth=clamp(Math.abs(sun.hour-12)/6.5,0,1),artificial=clamp((warmth-.55)/.3,0,1);
    const night=clamp(-sun.y/200,0,1),sunlight=clamp(sun.y/110,0,1);
    const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
    const overnight=sun.hour<12?sun.hour+24:sun.hour;
    const sleeping=smooth((overnight-22)/4)*(1-smooth((overnight-28)/2));
    const mix=(a,b)=>a.map((n,i)=>n+(b[i]-n)*warmth);
    const darken=(color,nightColor)=>color.map((n,i)=>n+(nightColor[i]-n)*night);
    return {sun,direction:direction.map(v=>v/length),
      ambient:darken(mix([.67,.69,.73],[.61,.58,.63]),[.30,.34,.46]),direct:mix([.35,.32,.27],[.34,.21,.12]).map(v=>v*sunlight),
      artificial,night,
      fog:darken(mix([.72,.84,.88],[.83,.57,.44]),[.08,.12,.21]),sky:darken(mix([.34,.64,.84],[.24,.28,.48]),[.025,.04,.095]),
      windowRate:(.07+.51*artificial)*(1-.8*sleeping),seed:(game.plots[0]?.seed||0)%997,
      label:sun.y<=0?'Nacht':sun.hour<7?'Morgengrauen':sun.hour<11?'Vormittag':sun.hour<14?'Mittag':sun.hour<17?'Nachmittag':'Sonnenuntergang'};
  }
  function explosionLight(hit,reduced=false) {
    if(!hit||reduced||!Number.isFinite(hit.age)||hit.age<0||hit.age>=1.35)return {strength:0,radius:1};
    const pulse=1+.22*Math.sin(hit.age*28);
    return {strength:2.7*Math.exp(-hit.age*3.5)*(1-hit.age/1.35)*pulse,radius:Math.max(110,Math.min(250,hit.radius*10))};
  }
  class CameraRig {
    constructor(){this.pose={yaw:.42,pitch:.6,distance:1080,target:[0,55,30]};this.views=[null,null];this.player=null;this.round=null;this.game=null;this.time=0;}
    defaultPose(game){
      const a=game.gorillas[game.turn],b=game.gorillas[1-game.turn];
      return {yaw:Math.atan2(a.x-b.x,a.z-b.z),pitch:.48,distance:780,target:[(a.x+b.x)/2,(a.y+b.y)/2+20,(a.z+b.z)/2]};
    }
    remember(pose=this.pose){
      if(this.player===null||!this.anchor)return;
      this.views[this.player]={yaw:pose.yaw,pitch:pose.pitch,distance:pose.distance,offset:pose.target.map((n,i)=>n-this.anchor[i])};
    }
    moveTo(pose,instant=false){
      this.transition=instant?null:{from:copy(this.pose),to:copy(pose),start:this.time};
      if(instant)this.pose=copy(pose);
    }
    update(game,time,reduced=false){
      this.time=time;
      const fresh=this.game!==game;
      if(fresh||this.round!==game.round||(game.phase==='aiming'&&this.player!==game.turn)){
        if(!fresh)this.remember(this.transition?.to||this.pose);
        else if(this.game)this.views=[null,null];
        this.game=game;this.round=game.round;this.player=game.turn;
        const destination=this.defaultPose(game);this.anchor=[...destination.target];
        const saved=this.views[this.player];
        if(saved)Object.assign(destination,{yaw:saved.yaw,pitch:saved.pitch,distance:saved.distance,target:saved.offset.map((n,i)=>n+this.anchor[i])});
        this.moveTo(destination,fresh||reduced);
      }
      if(this.transition){
        const {from,to,start}=this.transition,t=reduced?1:clamp((time-start)/1400,0,1),s=t*t*t*(t*(t*6-15)+10);
        this.pose={yaw:from.yaw+angleDelta(from.yaw,to.yaw)*s,pitch:from.pitch+(to.pitch-from.pitch)*s,distance:from.distance+(to.distance-from.distance)*s,target:from.target.map((n,i)=>n+(to.target[i]-n)*s)};
        if(t===1)this.transition=null;
      }
      return this.pose;
    }
    orbit(yaw,pitch){this.transition=null;this.pose.yaw+=yaw;this.pose.pitch=clamp(this.pose.pitch+pitch,.22,1.35);this.remember();}
    zoom(factor){this.transition=null;this.pose.distance=clamp(this.pose.distance*factor,330,1500);this.remember();}
    pan(right,forward) {
      if(![right,forward].every(Number.isFinite))return;
      this.transition=null;
      const {yaw,target}=this.pose,c=Math.cos(yaw),s=Math.sin(yaw);
      // Move across the ground in camera-relative directions, retaining roof height.
      const anchor=this.anchor||[0,0,0];
      target[0]=clamp(target[0]+right*c-forward*s,anchor[0]-2200,anchor[0]+2200);
      target[2]=clamp(target[2]-right*s-forward*c,anchor[2]-2200,anchor[2]+2200);
      this.remember();
    }
    overview(){const pose={yaw:.42,pitch:.6,distance:1080,target:[0,55,30]};this.moveTo(pose);this.remember(pose);}
    behind(game){const pose=this.defaultPose(game);this.moveTo(pose);this.remember(pose);}
    snapshot(){this.remember(this.transition?.to||this.pose);return copy(this.views);}
    restore(views){
      if(!Array.isArray(views)||views.length!==2||views.some(v=>v&&(!['yaw','pitch','distance'].every(k=>Number.isFinite(v[k]))||v.pitch<.22||v.pitch>1.35||v.distance<330||v.distance>1500||!Array.isArray(v.offset)||v.offset.length!==3||!v.offset.every(n=>Number.isFinite(n)&&Math.abs(n)<3000))))return false;
      this.views=copy(views);return true;
    }
  }
  class ImpactReplay {
    constructor(shot,hit,wind,gravity,windZ){
      this.shot=copy(shot);this.hit=copy(hit);this.wind=wind;this.gravity=gravity;this.windZ=windZ;
      const velocity=[shot.vx+wind/5*shot.time,shot.vy-gravity*shot.time,shot.vz+windZ/5*shot.time];
      const speed=Math.hypot(...velocity)||1;
      this.start=Math.max(0,shot.time-Math.min(2.4,85/(speed*1.25)));
      this.approach=Math.min(1.25,(shot.time-this.start)/1.65);
      this.explosionDuration=1.7/.65+1;
      this.duration=this.approach+this.explosionDuration;
      // Look back along the incoming path so the struck facade faces the replay camera.
      this.target=[hit.x,hit.y+5,hit.z];
      this.eye=[hit.x-velocity[0]/speed*125,hit.y+85-velocity[1]/speed*70,hit.z-velocity[2]/speed*125];
      if(Math.hypot(this.eye[0]-hit.x,this.eye[2]-hit.z)<30)this.eye[2]+=65;
    }
    frame(elapsed){
      const t=clamp(elapsed/Math.max(.001,this.approach),0,1);
      const point=spatial.pointAt(this.shot,this.start+(this.shot.time-this.start)*t,this.wind,this.gravity,this.windZ);
      // Physics may stop at a sub-step collision point; use that exact point at contact.
      if(t===1)Object.assign(point,{x:this.hit.x,y:this.hit.y,z:this.hit.z});
      return {point,impactAge:(elapsed-this.approach)*1.7/this.explosionDuration,done:elapsed>=this.duration,progress:clamp(elapsed/this.duration,0,1)};
    }
  }
  // Decorative traffic owns no game state and never consumes the gameplay RNG.
  class AmbientLife {
    constructor(game) {
      const {left,right,back,front,shore}=spatial.cityBounds(game);
      const columns=[...new Set(game.plots.map(p=>p.x))].sort((a,b)=>a-b);
      this.actors=[];
      const add=(kind,route,speed,offset,y=1.5)=>{
        const lengths=route.map((p,i)=>Math.hypot(p[0]-route[(i+1)%route.length][0],p[1]-route[(i+1)%route.length][1]));
        this.actors.push({kind,route,lengths,length:lengths.reduce((a,b)=>a+b,0),speed,offset,y,pose:[0,y,0],heading:0});
      };
      // Two separated circuits use the centres of real lanes, including the outer streets.
      const circuits=[[0,2],columns.length>7?[5,7]:[3,5]];
      for(const [a,b] of circuits) {
        const route=[[columns[a]+87,back+13],[columns[b]+79,back+13],[columns[b]+79,front-25],[columns[a]+87,front-25]];
        for(let i=0;i<6;i++)add(i%3===1?(a===0?'taxi':'bus'):'car',route,12,.08+i/6);
      }
      // Wrapping happens in the distance haze, beyond the playable city.
      add('bus',[[-1750,front-5],[1750,front-5]],16,.48,.5);
      add('taxi',[[1750,front-13],[-1750,front-13]],19,.57,.5);
      add('car',[[-1750,front-5],[1750,front-5]],16,.58,.5);
      add('car',[[-1750,front-5],[1750,front-5]],16,.38,.5);
      add('taxi',[[1750,front-13],[-1750,front-13]],19,.47,.5);
      add('car',[[1750,front-13],[-1750,front-13]],19,.67,.5);
      add('sailboat',[[-1600,shore+185],[1600,shore+185]],5,.53,-2);
      add('boat',[[1600,shore+330],[-1600,shore+330]],8,.44,-2);
      for(let i=0;i<5;i++)add('walker',[[left+45,front+6],[right-45,front+6],[right-45,front+12],[left+45,front+12]],2.2,i/5,4);
      add('airship',[[-1600,back-370],[1600,back-370]],7,.55,335);
      this.time=0;this.lastClock=null;
      this.update(0,true);
    }
    update(clock,frozen=false) {
      if(this.lastClock!==null&&!frozen)this.time+=Math.max(0,Math.min(50,clock-this.lastClock))/1000;
      this.lastClock=clock;
      for(const actor of this.actors) {
        // Two-point routes wrap instead of reversing direction at the horizon.
        const length=actor.route.length===2?actor.lengths[0]:actor.length;
        let distance=(actor.offset*length+this.time*actor.speed)%length,index=0;
        while(distance>actor.lengths[index])distance-=actor.lengths[index++];
        const a=actor.route[index],b=actor.route[(index+1)%actor.route.length],t=distance/actor.lengths[index];
        actor.pose[0]=a[0]+(b[0]-a[0])*t;actor.pose[2]=a[1]+(b[1]-a[1])*t;
        actor.heading=Math.atan2(b[0]-a[0],b[1]-a[1]);
      }
      return this.actors;
    }
  }
  const api={daylight,explosionLight,CameraRig,ImpactReplay,AmbientLife};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GorillaView3D=api;
})(typeof globalThis!=='undefined'?globalThis:this);
