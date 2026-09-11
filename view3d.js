/* Presentation state only: independent of scoring, physics updates and WebGL. */
(function(root) {
  'use strict';
  const spatial=typeof module!=='undefined'&&module.exports?require('./engine3d.js'):root.Gorillas3D;
  const copy=value=>JSON.parse(JSON.stringify(value));
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
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
  const api={CameraRig,ImpactReplay};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GorillaView3D=api;
})(typeof globalThis!=='undefined'?globalThis:this);
