const test = require('node:test');
const assert = require('node:assert/strict');
const { Game3D, launchVector, pointAt, SUN, CELL, occupied } = require('../engine3d.js');
const random = (seed = 42) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const make = options => new Game3D(options, random());
const run = (g, fps = 60) => { for (let i = 0; i < fps * 70 && g.phase === 'flying'; i++) g.update(1 / fps); return g; };
function clear(g) { g.buildings = []; g.wind = 0; g.windZ = 0; g.gorillas = [{ x: -200, y: 80, z: -70, alive: true }, { x: 200, y: 80, z: 70, alive: true }]; }
function block(x,y,z,nx=1,ny=20,nz=8) { return {x,z,nx,ny,nz,width:nx*CELL,height:ny*CELL,depth:nz*CELL,color:0,seed:1,removed:new Set()}; }

test('100 spatial cities have parks, streets, distinct roof positions and supported actors', () => {
  for (let seed=0;seed<100;seed++) {
    const g=new Game3D({},random(seed));assert.equal(g.plots.length,80);assert.ok(g.plots.filter(p=>p.kind==='park').length>=2);
    assert.ok(g.gorillas[0].x<g.gorillas[1].x);assert.notEqual(g.gorillas[0].z,g.gorillas[1].z);
    for(const a of g.gorillas)assert.ok(g.terrainAt(a.x,a.y-.1,a.z));
    for(let i=0;i<g.buildings.length;i++)for(let j=i+1;j<g.buildings.length;j++){
      const a=g.buildings[i],b=g.buildings[j];assert.ok(a.x+a.width<b.x||b.x+b.width<a.x||a.z+a.depth<b.z||b.z+b.depth<a.z);
    }
  }
});
test('Elevation and azimuth preserve speed and mirror consistently for both players', () => {
  for(const a of [0,45,90,180,270,360])for(const d of [-180,-90,0,45,90,180]){
    const p=launchVector(0,a,80,d),q=launchVector(1,a,80,d);
    assert.ok(Math.abs(Math.hypot(p.vx,p.vy,p.vz)-80)<1e-8);assert.ok(Math.abs(p.vx+q.vx)<1e-8);assert.ok(Math.abs(p.vz+q.vz)<1e-8);assert.equal(p.vy,q.vy);
  }
  assert.ok(launchVector(0,0,80,90).vz>79);assert.ok(launchVector(0,0,80,-90).vz< -79);
});
test('Ballistics apply gravity vertically and independent wind along both street axes', () => {
  const s={startX:0,startY:100,startZ:0,vx:30,vy:40,vz:20};
  assert.deepEqual(pointAt(s,2,10,10,-5),{x:80,y:175,z:47.5});
});
test('A fast projectile cannot tunnel through a thin wall at different frame rates', () => {
  const impacts=[20,60,144].map(fps=>{
    const g=make();clear(g);g.buildings=[block(-100,0,-100)];g.fire(0,360,0);run(g,fps);assert.equal(g.impact.type,'building');assert.ok(g.buildings[0].removed.size>0);return g.impact;
  });
  for(const hit of impacts){assert.ok(Math.abs(hit.x-impacts[0].x)<.02);assert.ok(Math.abs(hit.y-impacts[0].y)<.02);assert.equal(hit.z,-70);}
});
test('Depth separates a clean miss from a direct hit for either player', () => {
  for(const player of [0,1]){
    const g=make();clear(g);g.turn=player;
    const a=g.gorillas[player],b=g.gorillas[1-player],dx=b.x-a.x,dz=b.z-a.z;
    const direction=(Math.atan2(dz,dx)*180/Math.PI-player*180+540)%360-180;
    g.fire(0,360,direction);run(g);assert.equal(g.impact.type,'gorilla');assert.equal(g.impact.player,1-player);assert.equal(g.scores[player],1);
    const wrong=make();clear(wrong);wrong.turn=player;wrong.fire(0,360,0);run(wrong);assert.deepEqual(wrong.scores,[0,0]);
  }
});
test('Spherical destruction opens a traversable volume and leaves neighboring voxels intact', () => {
  const g=make();clear(g);const b=block(-20,0,-20,8,12,8);g.buildings=[b];
  assert.ok(g.terrainAt(0,40,0));g.destroy(0,40,0,15);assert.equal(g.terrainAt(0,40,0),0);assert.ok(g.terrainAt(35,40,35));
  for(let y=0;y<b.ny;y++)for(let z=0;z<b.nz;z++)for(let x=0;x<b.nx;x++)assert.equal(Boolean(g.terrainAt(b.x+(x+.5)*CELL,(y+.5)*CELL,b.z+(z+.5)*CELL)),occupied(b,x,y,z));
});
test('Low-power and returning vertical shots can hit the thrower and score only once', () => {
  for(const power of [0,1,30]){
    const g=make({target:2});g.wind=g.windZ=0;g.fire(90,power,0);run(g);assert.equal(g.impact.type,'gorilla');assert.equal(g.impact.player,0);assert.deepEqual(g.scores,[0,1]);
    assert.equal(g.fire(45,65,0),false);g.update(1);g.update(3);assert.equal(g.phase,'roundOver');assert.equal(g.turn,1);assert.deepEqual(g.scores,[0,1]);
    g.continue();assert.equal(g.round,2);assert.equal(g.turn,1);assert.deepEqual(g.scores,[0,1]);
  }
});
test('Misses leave the city and alternate once; ground contact ends a shot', () => {
  const g=make();clear(g);g.fire(90,30,90);g.gorillas.forEach(a=>a.alive=false);run(g);assert.equal(g.impact.type,'building');assert.ok(g.impact.y<=0);
  const miss=make();clear(miss);miss.fire(30,360,-90);run(miss);assert.equal(miss.lastEvent,'miss');assert.equal(miss.phase,'aiming');assert.equal(miss.turn,1);assert.deepEqual(miss.scores,[0,0]);
});
test('The sun charges in 3D space without changing velocity and increases crater size', () => {
  const g=make();g.wind=g.windZ=0;g.gorillas[0]={x:SUN.x,y:SUN.y-65,z:SUN.z,alive:true};g.fire(90,40,0);
  for(let i=0;i<400&&!g.shot?.charged;i++)g.update(1/60);
  assert.equal(g.shot.charged,true);assert.ok(Math.abs(g.shot.vy-40)<1e-8);
  const copy=make();assert.ok(copy.restore(g.snapshot()));copy.shot.charged=false;
  const hit={type:'building',x:0,y:80,z:0};g.collide(hit);copy.collide(hit);assert.ok(Math.abs(g.impact.radius-copy.impact.radius*1.2)<1e-8);
});
test('Spatial session resumes damage, rules, azimuth, wind and an in-flight shot exactly', () => {
  const g=make({names:['Ada','Ben'],gravity:1.6,target:7,aimAssist:true});
  const b=g.buildings[4];g.destroy(b.x+10,40,b.z+10,18);g.lastShots[1]={angle:42,power:90,direction:-19};g.fire(80,100,12);g.update(.03);
  const restored=make();assert.ok(restored.restore(JSON.parse(JSON.stringify(g.snapshot()))));assert.deepEqual(restored.snapshot(),g.snapshot());
  for(let i=0;i<600;i++){g.update(1/60);restored.update(1/60);}assert.deepEqual(restored.snapshot(),g.snapshot());
});
test('Match ending and a restored celebration retain shared scoring rules', () => {
  const g=make({target:1});g.fire(0,0,0);g.update(1);
  const restored=make();assert.ok(restored.restore(g.snapshot()));restored.update(3);assert.equal(restored.phase,'matchOver');assert.equal(restored.winner,1);assert.equal(restored.fire(45,65,0),false);
  restored.reset();assert.equal(restored.mode,'3d');assert.deepEqual(restored.scores,[0,0]);assert.equal(restored.options.target,1);
});
test('Reject invalid spatial inputs and incomplete or incompatible snapshots', () => {
  const g=make();for(const args of [[45,65,181],[45,65,-181],[NaN,65,0],[45,Infinity,0],[45,65,NaN],[-1,65,0],[45,361,0]])assert.equal(g.fire(...args),false);
  assert.equal(g.restore({version:1}),false);assert.equal(g.restore({version:3,mode:'3d',phase:'aiming'}),false);
  const s=g.snapshot();s.buildings[0].removed=[Infinity];assert.equal(g.restore(s),false);
});

test('Gorillas turn toward the actual throw and rotate their collision volume with the body', () => {
  const { facingHeading } = require('../engine3d.js');
  const g=make();clear(g);const a=g.gorillas[0];
  a.heading=0;assert.equal(g.collisionAt(a.x+12,a.y+12,a.z),null);
  a.heading=Math.PI/2;assert.equal(g.collisionAt(a.x+12,a.y+12,a.z)?.player,0);
  for(const player of [0,1])for(const angle of [0,45,110,230,270])for(const direction of [-90,0,80]){
    const h=facingHeading(player,angle,direction),v=launchVector(player,angle,80,direction);
    if(Math.hypot(v.vx,v.vz)>.0001)assert.ok(Math.cos(h)*v.vx+Math.sin(h)*v.vz>0,'Actor faces along the horizontal launch vector');
  }
  g.setAim(45,35);assert.ok(Math.abs(a.heading-35*Math.PI/180)<1e-8);
  g.fire(45,80,-25);const heading=a.heading;g.setAim(45,90);assert.equal(a.heading,heading,'Heading is fixed during flight');
  const saved=make();saved.setAim(50,-27);const restored=make();assert.ok(restored.restore(saved.snapshot()));assert.equal(restored.gorillas[0].heading,saved.gorillas[0].heading);
});
test('The new perimeter surrounds the two starting roofs and default aim faces the opponent', () => {
  const { cityBounds }=require('../engine3d.js');const g=make(),bounds=cityBounds(g);
  assert.equal(g.plots.length,80);assert.equal(new Set(g.plots.map(p=>p.x)).size,10);assert.equal(new Set(g.plots.map(p=>p.z)).size,8);
  for(let player=0;player<2;player++){
    const a=g.gorillas[player],b=g.gorillas[1-player];
    assert.ok(a.x-bounds.left>100&&bounds.right-a.x>100&&a.z-bounds.back>100&&bounds.front-a.z>100);
    const v=launchVector(player,0,1,g.defaultDirection(player)),target=Math.atan2(b.z-a.z,b.x-a.x);
    assert.ok(Math.cos(target)*v.vx+Math.sin(target)*v.vz>.9998);
  }
});
test('Windsocks occupy the two highest intact roofs and two beach positions; calm wind has no direction', () => {
  const { windsockSites,windPose,cityBounds }=require('../engine3d.js');const g=make(),sites=windsockSites(g);
  assert.equal(sites.length,4);assert.deepEqual(sites.slice(0,2).map(p=>p.y),g.buildings.map(b=>b.height).sort((a,b)=>b-a).slice(0,2));
  for(const s of sites.slice(0,2))assert.ok(g.terrainAt(s.x,s.y-.1,s.z));
  for(const s of sites.slice(2)){assert.ok(s.z>cityBounds(g).shore);assert.equal(s.scale,1);}
  assert.ok(sites[3].x-sites[2].x>300);
  for(const s of sites.slice(0,2))assert.equal(s.scale,.9);
  const roof=sites[0];g.destroy(roof.x,roof.y,roof.z,28);for(const s of windsockSites(g).slice(0,2))assert.ok(g.terrainAt(s.x,s.y-.1,s.z));
  assert.deepEqual(windPose(0,0),{x:0,z:0,extension:0,speed:0});
  const p=windPose(-3,4);assert.equal(p.x,-.6);assert.equal(p.z,.8);assert.ok(windPose(-12,8).extension>p.extension);
});
test('Existing 24- and 48-block saves load without moving roofs or discarding scores', () => {
  for(const ring of [0,1]){
  const g=make();g.scores=[2,1];const saved=g.snapshot();
  saved.plots=saved.plots.filter(p=>p.x>=-270-ring*94&&p.x<294+ring*94&&p.z>=-170-ring*94&&p.z<206+ring*94);
  saved.buildings=saved.buildings.filter(b=>b.x>=-270-ring*94&&b.x<294+ring*94&&b.z>=-170-ring*94&&b.z<206+ring*94);
  saved.gorillas.forEach(a=>delete a.heading);
  const restored=make();assert.ok(restored.restore(saved));assert.equal(restored.plots.length,ring?48:24);assert.deepEqual(restored.scores,[2,1]);
  for(let i=0;i<2;i++){assert.equal(restored.gorillas[i].x,saved.gorillas[i].x);assert.equal(restored.gorillas[i].z,saved.gorillas[i].z);assert.ok(Number.isFinite(restored.gorillas[i].heading));}
  restored.newRound();assert.equal(restored.plots.length,80);assert.deepEqual(restored.scores,[2,1]);
  }
});
