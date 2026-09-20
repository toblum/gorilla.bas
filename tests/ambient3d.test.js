const test=require('node:test');
const assert=require('node:assert/strict');
const {Game3D,cityBounds}=require('../engine3d.js');
const {AmbientLife}=require('../view3d.js');
const make=()=>new Game3D({},()=>.5);
test('Ambient life is bounded, deterministic and does not alter gameplay or consume randomness',()=>{
 const game=make(),before=game.snapshot();game.random=()=>{throw Error('Gameplay RNG consumed');};
 const life=new AmbientLife(game),other=new AmbientLife(game);
 assert.equal(life.actors.length,14);
 for(let time=0;time<10000;time+=16){life.update(time);other.update(time);}
 assert.deepEqual(life.actors,other.actors);assert.deepEqual(game.snapshot(),before);
});
test('Traffic stays on streets, walkers on the promenade and boats clear of the pier',()=>{
 const game=make(),life=new AmbientLife(game),bounds=cityBounds(game);
 for(let time=0;time<600000;time+=50) {
  for(const actor of life.update(time)) {
   const [x,y,z]=actor.pose;assert.ok([x,y,z,actor.heading].every(Number.isFinite));
   if(['car','taxi','bus'].includes(actor.kind)) {
    const halfLength=actor.kind==='bus'?11.5:6;
    const dx=Math.abs(Math.cos(actor.heading))*3.5+Math.abs(Math.sin(actor.heading))*halfLength;
    const dz=Math.abs(Math.sin(actor.heading))*3.5+Math.abs(Math.cos(actor.heading))*halfLength;
    assert.ok(!game.plots.some(p=>x+dx>p.x-3&&x-dx<p.x+75&&z+dz>p.z-3&&z-dz<p.z+75),'traffic intersects a sidewalk');
    assert.ok(z>=bounds.back&&z<=bounds.front);
    if(actor.route.length===2)assert.equal(actor.route[0][1],actor.route[1][1],'coastal traffic must remain in one lane');
   }
   if(actor.kind==='walker')assert.ok(z>=bounds.front+6&&z<=bounds.front+12);
   if(['boat','sailboat'].includes(actor.kind))assert.ok(z>bounds.shore+140);
  }
 }
});
test('Decorative motion freezes without jumping on resume and is frame-rate independent',()=>{
 const life=new AmbientLife(make());life.update(50);const pose=structuredClone(life.actors);
 life.update(5000,true);assert.deepEqual(life.actors,pose);
 life.update(5000);assert.deepEqual(life.actors,pose);
 life.update(5010);assert.ok(Math.abs(life.time-.06)<1e-9);
 const slow=new AmbientLife(make()),fast=new AmbientLife(make());
 for(let t=0;t<=10000;t+=50)slow.update(t);
 for(let t=0;t<=10000;t+=10)fast.update(t);
 slow.actors.forEach((actor,i)=>actor.pose.forEach((n,j)=>assert.ok(Math.abs(n-fast.actors[i].pose[j])<1e-7)));
});

test('Renderer reuses a bounded GPU batch; pause, reduced motion and damage do not allocate or upload it again',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const window={Gorillas3D:require('../engine3d.js'),GorillaView3D:require('../view3d.js')};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../city3d.js'),'utf8'),{window});
 const renderer=Object.create(window.GorillaCity3D.prototype);
 let allocations=0,uploads=0,draws=0;
 Object.assign(renderer,{clock:0,gl:{bindBuffer(){},bufferData(){allocations++;},bufferSubData(){uploads++;}},renderBuffer(){draws++;}});
 const game=make();renderer.drawAmbient(game,false);
 assert.equal(allocations,1);assert.equal(uploads,1);assert.equal(draws,1);
 assert.ok(renderer.ambientData.length/27<1500,'triangle budget exceeded');
 const data=renderer.ambientData;const first=Array.from(data);
 renderer.clock=50;renderer.drawAmbient(game,false);assert.notDeepEqual(Array.from(data),first);
 const moved=Array.from(data);renderer.drawAmbient(game,false);assert.equal(uploads,2);
 renderer.clock=1000;renderer.drawAmbient(game,true);assert.deepEqual(Array.from(data),moved);assert.equal(uploads,2);
 game.revision++;renderer.drawAmbient(game,true);assert.equal(allocations,1);assert.equal(renderer.ambientData,data);
 game.newRound();renderer.drawAmbient(game,true);assert.equal(allocations,2);assert.equal(uploads,3);
 assert.ok(Array.from(renderer.ambientData).every(Number.isFinite));
});
