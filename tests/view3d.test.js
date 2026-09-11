const test=require('node:test');
const assert=require('node:assert/strict');
const {Game3D,pointAt,windsockSites}=require('../engine3d.js');
const {CameraRig,ImpactReplay}=require('../view3d.js');
const make=()=>new Game3D({},()=>.5);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('Default camera is behind the thrower and looks down toward both roof positions',()=>{
 const game=make(),rig=new CameraRig();
 for(const turn of [0,1]){
  game.turn=turn;const p=rig.update(game,turn*2000,true),a=game.gorillas[turn],b=game.gorillas[1-turn];
  assert.ok(Math.sin(p.yaw)*(a.x-b.x)+Math.cos(p.yaw)*(a.z-b.z)>0);
  near(p.target[0],(a.x+b.x)/2);near(p.target[2],(a.z+b.z)/2);assert.ok(p.pitch>.3&&p.pitch<.7);
 }
});
test('Alternating turns ease the camera and restore each player’s exact manual orbit and zoom',()=>{
 const game=make(),rig=new CameraRig();rig.update(game,0);rig.orbit(.32,.1);rig.zoom(.87);const first=structuredClone(rig.pose);
 game.turn=1;rig.update(game,10);assert.deepEqual(rig.pose,first);rig.update(game,710);assert.notEqual(rig.pose.yaw,first.yaw);rig.update(game,1410);
 rig.orbit(-.21,.06);rig.zoom(1.12);const second=structuredClone(rig.pose);
 game.turn=0;rig.update(game,1500);rig.update(game,2900);near(rig.pose.yaw,first.yaw);assert.deepEqual({...rig.pose,yaw:first.yaw},first);
 game.turn=1;rig.update(game,3000);rig.update(game,4400);near(rig.pose.yaw,second.yaw);near(rig.pose.distance,second.distance);
});
test('Camera changes do not follow a dead player during celebration; saved views adapt to new roofs and reload',()=>{
 const game=make(),rig=new CameraRig();rig.update(game,0);rig.orbit(.4,.1);rig.zoom(1.1);
 const saved=rig.snapshot();game.turn=1;game.phase='celebrating';rig.update(game,1000);assert.equal(rig.player,0);
 game.phase='aiming';game.turn=0;game.newRound();game.gorillas.forEach(g=>g.y+=24);rig.update(game,2000);rig.update(game,3400);
 near(rig.pose.target[1],rig.defaultPose(game).target[1]);near(rig.pose.yaw,saved[0].yaw);
 const restored=new CameraRig();assert.ok(restored.restore(saved));restored.update(game,0);near(restored.pose.distance,saved[0].distance);near(restored.pose.yaw,saved[0].yaw);
 assert.equal(restored.restore([{yaw:0,pitch:NaN,distance:800,offset:[0,0,0]},null]),false);
});
test('Manual input interrupts camera travel; reduced motion jumps to the destination',()=>{
 const game=make(),rig=new CameraRig();rig.update(game,0);game.turn=1;rig.update(game,100);rig.update(game,500);
 rig.orbit(.1,0);const pose=structuredClone(rig.pose);rig.update(game,2000);assert.deepEqual(rig.pose,pose);
 game.turn=0;rig.update(game,2100,true);assert.equal(rig.transition,null);near(rig.pose.yaw,rig.defaultPose(game).yaw);
});
test('Replay uses the real trajectory and exact contact point without changing a match',()=>{
 const game=make();game.fire(20,60,12);
 for(let i=0;i<3000&&game.phase==='flying';i++)game.update(1/60);
 assert.equal(game.phase,'impact');const saved=game.snapshot();
 const clip=new ImpactReplay(game.shot,game.impact,game.wind,game.options.gravity,game.windZ);
 assert.deepEqual(clip.frame(0).point,pointAt(game.shot,clip.start,game.wind,game.options.gravity,game.windZ));
 assert.deepEqual(clip.frame(clip.approach).point,{x:game.impact.x,y:game.impact.y,z:game.impact.z});
 assert.ok(clip.frame(clip.approach+.5).impactAge<.5);assert.equal(clip.frame(clip.duration).done,true);
 near(clip.duration-(clip.approach+1.7/.65),1);
 assert.equal(clip.frame(clip.duration-.5).done,false);assert.ok(clip.frame(clip.duration-.5).impactAge<1.7);
 assert.deepEqual(game.snapshot(),saved);assert.ok(clip.eye.every(Number.isFinite));
 const self=make();self.fire(0,0,0);const short=new ImpactReplay(self.shot,self.impact,0,9.8,0);assert.ok(short.frame(0).point.y>0);assert.ok(Number.isFinite(short.duration));
});
test('Replay defaults on, persists off, and wind markers mix one flag and one windsock at each location',()=>{
 const game=make();assert.equal(game.options.replay,true);game.reset({replay:false});assert.equal(game.options.replay,false);
 const restored=make();assert.ok(restored.restore(game.snapshot()));assert.equal(restored.options.replay,false);
 const old=game.snapshot();delete old.options.replay;assert.ok(restored.restore(old));assert.equal(restored.options.replay,true);
 const sites=windsockSites(game);assert.equal(sites.length,4);
 for(const pair of [sites.slice(0,2),sites.slice(2)])assert.deepEqual(pair.map(p=>p.type).sort(),['flag','windsock']);
});
