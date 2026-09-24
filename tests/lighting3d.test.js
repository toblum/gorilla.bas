const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const engine=require('../engine3d.js'),view=require('../view3d.js');
const make=()=>new engine.Game3D({},()=>.5);
function rendererPrototype(){
 const window={Gorillas3D:engine,GorillaView3D:view};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../city3d.js'),'utf8'),{window});
 return window.GorillaCity3D.prototype;
}
test('Daylight varies by round, survives reload and does not consume gameplay randomness',()=>{
 const game=make(),labels=new Set();
 for(let i=0;i<5;i++){
  if(i)game.newRound();game.setDayHour([15,6,12,18.5,9][i]);
  const before=game.snapshot(),copy=make();assert.ok(copy.restore(before));
  const random=game.random;game.random=()=>{throw Error('lighting consumed RNG');};
  const light=view.daylight(game);labels.add(light.label);
  assert.deepEqual(view.daylight(copy),light);assert.deepEqual(game.snapshot(),before);
  assert.ok(Math.abs(Math.hypot(...light.direction)-1)<1e-9);
  assert.ok([...light.ambient,...light.direct,...light.fog,...light.sky].every(n=>Number.isFinite(n)&&n>=0&&n<=1));
  if(light.label==='Sonnenuntergang')assert.ok(light.sun.z>engine.cityBounds(game).shore);
  if(light.label==='Mittag')assert.ok(light.windowRate<.1);
  if(light.label==='Morgengrauen')assert.ok(light.windowRate>.5);
  game.random=random;
 }
 assert.equal(labels.size,5);
});
test('The rendered sun position charges shots in all five daylight conditions after save/restore',()=>{
 const source=make();
 for(let i=0;i<5;i++){
  if(i)source.newRound();source.setDayHour([15,6,12,18.5,9][i]);
  const game=make();assert.ok(game.restore(source.snapshot()));
  const sun=view.daylight(game).sun;
  assert.deepEqual(sun,engine.sunPosition(game));
  game.wind=game.windZ=0;game.gorillas[0]={x:sun.x,y:sun.y-65,z:sun.z,alive:true};
  game.fire(90,40,0);
  for(let frame=0;frame<400&&!game.shot?.charged;frame++)game.update(1/60);
  assert.equal(game.shot?.charged,true,`round ${game.round}`);
 }
});
test('Daylight and sea-facing sunset also support 24- and 48-plot saved cities',()=>{
 for(const ring of [0,1]){
  const saved=make().snapshot();
  const inside=p=>p.x>=-270-ring*94&&p.x<294+ring*94&&p.z>=-170-ring*94&&p.z<206+ring*94;
  saved.plots=saved.plots.filter(inside);saved.buildings=saved.buildings.filter(inside);saved.round=4;saved.dayHour=18.5;
  const game=make();assert.ok(game.restore(saved));const sun=engine.sunPosition(game);
  assert.ok([sun.x,sun.y,sun.z].every(Number.isFinite));assert.ok(sun.z>engine.cityBounds(game).shore);
 }
});
test('Window identities are uniform across each pane, distinct and disappear with destroyed facade cells',()=>{
 const renderer=Object.create(rendererPrototype()),b=make().buildings[0];
 const collect=()=>{
  const panes=[];
  const mesh={box(){},lamp(){},lightPool(){},line(){},quad(...args){const normal=args[5];if(normal&&Math.hypot(...normal)===2)panes.push({points:args.slice(0,4),id:args[4],normal});}};
  renderer.building(mesh,b);return panes;
 };
 const before=collect();assert.ok(before.length>100);
 const ids=before.map(p=>JSON.stringify([p.id,p.normal]));assert.equal(new Set(ids).size,ids.length);
 assert.ok(before.every(p=>p.id.every(v=>v>=0&&v<=1)));
 const pane=before[0],x=Math.floor((pane.points[0][0]-b.x)/8),y=Math.floor(pane.points[0][1]/8);
 // Remove a facade column across all depths to include either outer face.
 for(let dz=0;dz<b.nz;dz++)b.removed.add(engine.cellIndex(b,Math.min(x,b.nx-1),y,dz));
 assert.ok(collect().length<before.length);
});
test('Window clock freezes on pause/reduced motion, and shadows refresh only on city changes',()=>{
 const renderer=Object.create(rendererPrototype()),game=make();let shadows=0,builds=0;
 const noop=()=>{},gl=new Proxy({},{get:()=>noop});
 Object.assign(renderer,{canvas:{clientWidth:1000,clientHeight:600,width:1750,height:1050,style:{}},hud:{},ctx:{setTransform:noop},gl,camera:new view.CameraRig(),clock:0,
  staticCity(){builds++;this.windSites=[];},cacheShadows(){shadows++;},applyLighting:noop,setExplosionLight:noop,observeReplay:noop,renderBuffer:noop,drawAmbient:noop,sun:noop,gorilla:noop,upload:noop,drawHUD:noop,drawReplay:noop});
 const draw=(t,reduced=false,paused=false)=>renderer.draw(game,t,{angle:45,power:80,direction:0},reduced,paused);
 draw(0);draw(50);assert.equal(renderer.windowTime,.05);assert.equal(shadows,1);
 draw(100,true);draw(10000,true);assert.equal(renderer.windowTime,.05);
 draw(20000,false,true);assert.equal(renderer.windowTime,.05);
 draw(20010);assert.ok(Math.abs(renderer.windowTime-.06)<1e-9);assert.equal(shadows,1);
 game.revision++;draw(20020);assert.equal(shadows,2);
 game.newRound();draw(20030);assert.equal(shadows,3);assert.equal(builds,3);
 game.setDayHour(6);draw(20040);assert.equal(shadows,4);assert.equal(builds,3);
 game.setDayHour(18);draw(20050);assert.equal(shadows,5);assert.equal(builds,3);
});

test('Backlit facades retain fill light and artificial lighting follows dawn/noon/sunset',()=>{
 const game=make();
 for(let i=0;i<5;i++){
  if(i)game.newRound();game.setDayHour([15,6,12,18.5,9][i]);const l=view.daylight(game);
  const luminance=c=>c[0]*.2126+c[1]*.7152+c[2]*.0722;
  const fill=luminance(l.ambient)*.83;
  assert.ok((fill+luminance(l.direct))/fill<1.8,'sun-facing and shaded facades diverge too much');
  if(l.label==='Mittag')assert.equal(l.artificial,0);
  if(['Morgengrauen','Sonnenuntergang'].includes(l.label))assert.ok(l.artificial>.85);
 }
});
test('Moving vehicles carry headlights, tail lights and ground glow in their cached mesh',()=>{
 const r=Object.create(rendererPrototype());
 for(const kind of ['car','taxi','bus','boat','sailboat']){
  const mesh=r.ambientModel(kind),lights=[],pools=[];
  for(let i=0;i<mesh.length;i+=9){
   const n=Math.hypot(mesh[i+3],mesh[i+4],mesh[i+5]);
   if(n>4.5)lights.push(Array.from(mesh.slice(i,i+9)));
   if(n>=3&&n<=4)pools.push(i);
  }
  assert.ok(lights.length>0,kind+' lacks lamps');
  if(['car','taxi','bus'].includes(kind)){
   assert.ok(lights.some(v=>v[2]>0)&&lights.some(v=>v[2]<0));
   assert.ok(pools.length>0);
  }
  assert.ok(Array.from(mesh).every(Number.isFinite));
 }
});

test('Random time covers the daylight range, avoids repeating and leaves gameplay RNG untouched',()=>{
 const game=make();game.random=()=>{throw Error('gameplay RNG used');};
 game.setDayHour(12);
 game.randomizeDaylight(()=>0);assert.equal(game.dayHour,5.5);
 game.randomizeDaylight(()=>.99999);assert.equal(game.dayHour,19);
 game.randomizeDaylight(()=>.99999);assert.notEqual(game.dayHour,19);
 const saved=game.snapshot(),copy=make();assert.ok(copy.restore(saved));assert.equal(copy.dayHour,game.dayHour);
 assert.equal(copy.restore({...saved,dayHour:NaN}),false);
 assert.equal(copy.restore({...saved,dayHour:25}),false);
 assert.equal(game.setDayHour(NaN),false);
 const legacy={...saved};delete legacy.dayHour;assert.ok(copy.restore(legacy));assert.ok(Number.isFinite(copy.dayHour));
});

test('Full-day clock has a dark, illuminated night and continuous midnight lighting',()=>{
 const game=make();
 for(const hour of [0,3,21,287/12]){
  game.setDayHour(hour);const light=view.daylight(game);
  assert.equal(light.label,'Nacht');assert.ok(light.sun.y<0);
  assert.deepEqual(light.direct,[0,0,0]);assert.equal(light.artificial,1);
  assert.ok(light.ambient.every(v=>v>=.3));assert.ok(light.sky.every(v=>v<.1));
  const restored=make();assert.ok(restored.restore(game.snapshot()));assert.equal(restored.dayHour,hour);
 }
 game.setDayHour(0);const midnight=view.daylight(game);
 game.setDayHour(287/12);const before=view.daylight(game);
 assert.deepEqual(before.sky,midnight.sky);assert.deepEqual(before.ambient,midnight.ambient);
 game.setDayHour(12);assert.ok(view.daylight(game).direct.every(v=>v>0));
});

test('Only new rounds reroll daylight; restoring a manually selected night preserves the clock',()=>{
 const game=make();game.setDayHour(23.5);const saved=game.snapshot();
 const restored=make();assert.ok(restored.restore(saved));assert.equal(restored.dayHour,23.5);
 for(let i=0;i<100;i++){
  restored.newRound();assert.ok(restored.dayHour>=5.5&&restored.dayHour<=19);
 }
});

test('Residential windows wind down overnight and recover toward dawn while street lights stay on',()=>{
 const game=make(),at=hour=>{game.setDayHour(hour);return view.daylight(game);};
 const evening=at(21),midnight=at(0),late=at(3),dawn=at(6);
 assert.ok(evening.windowRate>midnight.windowRate&&midnight.windowRate>late.windowRate);
 assert.ok(late.windowRate>.05&&late.windowRate<.2);assert.ok(dawn.windowRate>late.windowRate*3);
 assert.equal(late.artificial,1);
 assert.ok(Math.abs(at(287/12).windowRate-at(0).windowRate)<.03);
});
test('Explosion illumination is local, decays to zero and is disabled for reduced motion',()=>{
 const hit={x:0,y:30,z:0,radius:20,age:0},saved={...hit};
 const first=view.explosionLight(hit);assert.ok(first.strength>2);assert.ok(first.radius<=250);
 assert.ok(view.explosionLight({...hit,age:.4}).strength<first.strength);
 for(const age of [-.1,1.35,2])assert.equal(view.explosionLight({...hit,age}).strength,0);
 assert.equal(view.explosionLight(hit,true).strength,0);assert.equal(view.explosionLight(null).strength,0);
 assert.deepEqual(hit,saved);
});
test('Explosion lights nearby surfaces by day and the flying banana has its own light',()=>{
 const r=Object.create(rendererPrototype()),calls=[];
 r.gl={uniform4f(...args){calls.push(args);},uniform1f(){}};
 r.lightingUniforms={uFlash:'flash',uFlashRadius:'radius',uBananaLight:'banana'};
 r.light={artificial:0};
 r.setExplosionLight({x:4,y:30,z:6,radius:18,age:0},false);
 assert.ok(calls[0][4]>0,'daylight flash should illuminate the city');
 r.setBananaLight({x:10,y:50,z:12});
 assert.deepEqual(calls.at(-1),['banana',10,50,12,.42]);
 r.setBananaLight(null);
 assert.equal(calls.at(-1)[4],0);
 r.setExplosionLight({x:4,y:30,z:6,radius:18,age:0},true);
 assert.equal(calls.at(-1)[4],0);
});
test('Replay preserves charged banana lighting until impact',()=>{
 const r=Object.create(rendererPrototype()),calls=[],noop=()=>{};
 r.gl=new Proxy({uniform4f(...args){calls.push(args);}},{get:(target,key)=>target[key]||noop});
 Object.assign(r,{clock:0,width:800,height:500,canvas:{width:800,height:500},ctx:{clearRect:noop},light:{fog:[0,0,0]},
  lightingUniforms:{uBananaLight:'banana',uShadowEnabled:'shadow'},replayPanel:{style:{},querySelector:()=>({style:{}})},
  banana:noop,explosion:noop,gorilla:noop,setActorLights:noop,setExplosionLight:noop,renderBuffer:noop,upload:()=>0});
 const frame={done:false,progress:0,impactAge:-.1,point:{x:10,y:50,z:12}};
 r.replay={start:0,beforeBuffer:{},beforeCount:0,gorillas:[],clip:{shot:{charged:true},hit:{type:'building'},eye:[0,80,120],target:[0,50,0],frame:()=>frame}};
 r.drawReplay({},false,1);
 assert.deepEqual(calls.at(-1),['banana',10,50,12,.65]);
 r.replay.clip.shot.charged=false;r.drawReplay({},false,1);
 assert.equal(calls.at(-1)[4],.42);
 frame.impactAge=0;r.drawReplay({},false,1);
 assert.equal(calls.at(-1)[4],0);
});
test('Banana keeps its curved geometry without an opaque halo or the gorilla material tag',()=>{
 const r=Object.create(rendererPrototype()),mesh={data:[],line(){},box(){this.data.push(0,0,0,1,0,0,1,1,1);},sphere(){throw Error('halo sphere hides the banana');}};
 r.banana(mesh,{x:0,y:40,z:0,time:.3,trail:[],charged:false});
 assert.equal(mesh.data.length/9,5);
 for(let i=0;i<mesh.data.length;i+=9)assert.equal(Math.hypot(...mesh.data.slice(i+3,i+6)),11);
 const gorillaMesh={data:[]};require('../gorilla3d.js').append(gorillaMesh,{x:0,y:0,z:0,alive:true,heading:0},0,0,0,true);
 assert.equal(Math.hypot(...gorillaMesh.data.slice(3,6)),7);
});
