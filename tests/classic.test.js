const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { ClassicGame, Screen, cint, drawSun, sprites, bananas } = require('../classic.js');
const sample = require('../reference/gameplay-random.json');
function fixture(options = {}) { let i=0;return new ClassicGame(options,()=>sample[i++ % sample.length]); }
function until(g, condition, fps=60, limit=20000) { for(let i=0;i<limit&&!condition();i++)g.update(1/fps);assert.ok(condition(),`Timed out in ${g.phase}`); }
function blank() {const g=fixture();g.screen.pixels.fill(0);g.wind=0;return g;}
// Decode the independent, indexed 4-bit PNG screenshot (no image dependency).
function screenshot() {
  const png=fs.readFileSync(require.resolve('../reference/qbasic-gameplay.png'));let at=8,colors,data=[];
  while(at<png.length){const n=png.readUInt32BE(at),type=png.toString('ascii',at+4,at+8),chunk=png.subarray(at+8,at+8+n);if(type==='IHDR'){assert.equal(chunk.readUInt32BE(0),640);assert.equal(chunk.readUInt32BE(4),350);assert.equal(chunk[8],4);assert.equal(chunk[9],3);assert.equal(chunk[12],0);}if(type==='PLTE')colors=chunk;if(type==='IDAT')data.push(chunk);at+=n+12;}
  const raw=zlib.inflateSync(Buffer.concat(data)),rgba=new Uint8ClampedArray(640*350*4),stride=320;let previous=new Uint8Array(stride),pos=0;
  for(let y=0;y<350;y++) {const filter=raw[pos++],row=new Uint8Array(stride);for(let x=0;x<stride;x++){const a=row[x-1]||0,b=previous[x],c=previous[x-1]||0,p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);const predict=[0,a,b,Math.floor((a+b)/2),pa<=pb&&pa<=pc?a:pb<=pc?b:c][filter];assert.notEqual(predict,undefined);row[x]=(raw[pos++]+predict)&255;}
    for(let x=0;x<640;x++){const index=(row[x>>1]>>(x%2?0:4))&15,i=(y*640+x)*4;rgba.set(colors.subarray(index*3,index*3+3),i);rgba[i+3]=255;}previous=row;}
  return rgba;
}
test('Classic: entire 640×350 reference screenshot matches all 224,000 pixels',()=>{assert.deepEqual(fixture().screen.rgba(),screenshot());});
test('Classic: CINT is nearest-even; angle keeps decimals and velocity becomes INTEGER',()=>{
  assert.deepEqual([.5,1.5,2.5,-.5,-1.5].map(cint),[0,2,2,0,-2]);const g=fixture();assert.ok(g.enter('45.5'));assert.equal(g.inputStage,'velocity');assert.ok(g.enter('60.5'));assert.ok(Math.abs(Math.hypot(g.shot.vx,g.shot.vy)-60)<1e-10);
});
test('Classic: original two-stage numeric input accepts empty zero and rejects out-of-range',()=>{
 const g=fixture();for(const value of ['361','-1','NaN','1.2.3']){assert.equal(g.enter(value),false);assert.equal(g.phase,'aiming');}assert.ok(g.enter(''));assert.ok(g.enter(''));assert.equal(g.phase,'throwing');assert.equal(g.fire(45,60),false);
});
test('Classic: bitmap bananas use the exact EGA DATA dimensions, colors and XOR erase',()=>{
 assert.deepEqual(bananas.map(b=>[b.width,b.height]),[[6,7],[9,4],[9,4],[6,7]]);const s=new Screen();for(const b of bananas){assert.deepEqual([...new Set(b.pixels)].sort((a,b)=>a-b),[0,14]);s.put(50,50,b);s.put(50,50,b,true);assert.ok(s.pixels.every(p=>p===0));}
});
test('Classic: MakeCityScape follows original bounds and second/third roof placement',()=>{
 let seed=12;for(let n=0;n<100;n++){const g=new ClassicGame({},()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32));assert.ok(g.wind>=-14&&g.wind<=15);assert.ok(g.buildings.length>=9&&g.buildings.length<=17);for(let p=0;p<2;p++){const gori=g.gorillas[p],indices=p===0?[1,2]:[g.buildings.length-2,g.buildings.length-3];assert.ok(indices.some(i=>gori.y===g.buildings[i].y-30&&gori.x===cint(g.buildings[i].x+(g.buildings[i+1].x-g.buildings[i].x)/2-14)));}}
});
test('Classic: sampled PlotShot coordinates match the original equations and mirrored launch points',()=>{
 for(const player of [0,1]){const g=blank();g.turn=player;g.wind=-3;g.fire(45,80);g.update(.1);assert.equal(g.phase,'flying');g.stepShot();assert.equal(g.shot.x,g.gorillas[player].x+(player?25:0));assert.equal(g.shot.y,g.gorillas[player].y-7);g.stepShot();assert.ok(Math.abs(g.shot.x-(g.shot.sx+g.shot.vx*.1-.003))<1e-10);assert.ok(Math.abs(g.shot.y-(g.shot.sy-g.shot.vy*.1+.049))<1e-10);}
});
test('Classic: zero and one velocity hit self, score the opponent once, then auto-advance',()=>{
 for(const player of [0,1])for(const v of [0,1]){const g=fixture();g.turn=player;g.fire(45,v);until(g,()=>g.phase==='celebrating');assert.equal(g.winner,1-player);assert.deepEqual(g.scores,[0,0]);until(g,()=>g.round===2);assert.equal(g.scores[1-player],1);assert.equal(g.turn,1-player);assert.equal(g.phase,'aiming');}
});
test('Classic: fixed total rounds, including tied game; does not play first-to-target',()=>{
 const g=fixture({target:2});for(let n=0;n<2;n++){g.fire(45,0);until(g,()=>n===0?g.round===2:g.phase==='gameOver');}assert.deepEqual(g.scores,[1,1]);assert.equal(g.round,2);assert.equal(g.fire(45,50),false);
});
test('Classic: collision reads the leading two POINT samples, including original tunneling',()=>{
 const g=blank();g.gorillas=[{x:100,y:100},{x:500,y:100}];g.fire(0,360);g.update(.1);g.screen.pixels.fill(0);g.screen.box(120,0,120,349,6);g.stepShot();g.stepShot();assert.equal(g.phase,'flying','36px jump deliberately skips thin wall');
 const h=blank();h.gorillas=[{x:100,y:100},{x:500,y:100}];h.fire(0,60);h.update(.1);h.screen.pixels.fill(0);h.screen.pset(104,99,6);h.stepShot();assert.equal(h.phase,'buildingExplosion','second sample (+4,+6) detects wall');
});
test('Classic: both players can hit their opponent and get the point',()=>{
 for(const player of [0,1]){const g=blank();g.turn=player;g.gorillas=[{x:100,y:100},{x:500,y:100}];g.fire(0,60);g.update(.1);g.screen.pixels.fill(0);g.shot.sx=player?100:500;g.screen.pset(g.shot.sx+(player?0:8),g.shot.sy,1);g.stepShot();assert.equal(g.winner,player);until(g,()=>g.phase==='roundPause');assert.equal(g.scores[player],1);}
});
test('Classic: sun is passable and hides banana without adding power; resets after shot',()=>{
 const g=blank();g.gorillas[0]={x:280,y:32};g.fire(0,50);g.update(.1);g.screen.pixels.fill(0);drawSun(g.screen);g.shot.sx=310;g.shot.sy=20;g.stepShot();assert.equal(g.sunHit,true);assert.equal(g.shot.inSun,true);assert.equal(g.shot.erase,false);assert.equal(g.shot.charged,undefined);assert.equal(g.shot.vx,50);until(g,()=>g.phase==='aiming');assert.equal(g.sunHit,false);
});
test('Classic: seven-pixel crater is independent of velocity and RAF frequency',()=>{
 function hit(v,fps){const g=blank();g.gorillas[0]={x:100,y:100};g.fire(0,v);g.update(.1);g.screen.pixels.fill(6);until(g,()=>g.phase==='aiming',fps);return g.screen.pixels;}
 const baseline=hit(20,20);for(const v of [20,100,360])for(const fps of [20,60,144])assert.deepEqual(hit(v,fps),baseline);
});
test('Classic: no upper-screen shortcut or path acceleration',()=>{
 const g=blank();g.gorillas[0]={x:100,y:100};g.fire(90,360);g.update(.1);g.screen.pixels.fill(0);for(let i=0;i<10;i++)g.stepShot();assert.ok(g.shot.y<0);assert.equal(g.phase,'flying');assert.ok(Math.abs(g.shot.t-1)<1e-10);
});
