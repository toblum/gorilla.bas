const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../gorilla3d.js'),{Game3D}=require('../engine3d.js');
function mesh(g={x:0,y:0,z:0,heading:Math.PI/2,alive:true},player=0,time=0,cheer=0,reduced=false,age=-1){
 const m={data:[]};model.append(m,g,player,time,cheer,reduced,age);return m.data;
}
test('Rounded rig has finite, smooth unit normals, bounded geometry and grounded feet',()=>{
 const a=mesh();assert.ok(a.length/9<22000);
 let minY=Infinity,maxY=-Infinity,maxX=0,oblique=0;
 for(let i=0;i<a.length;i+=9){
  assert.ok(a.slice(i,i+9).every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(...a.slice(i+3,i+6))-7)<1e-5);
  if(a.slice(i+3,i+6).every(n=>Math.abs(n)>.1))oblique++;
  minY=Math.min(minY,a[i+1]);maxY=Math.max(maxY,a[i+1]);maxX=Math.max(maxX,Math.abs(a[i]));
 }
 assert.ok(oblique>100);assert.ok(Math.abs(minY)<1e-6);assert.ok(maxY<30);assert.ok(maxX<17);
});
test('Rig transforms match player heading, leave snapshots unchanged, and skip dead actors',()=>{
 const game=new Game3D({},()=>.5),before=game.snapshot();game.random=()=>{throw Error('visual RNG');};
 for(let p=0;p<2;p++)mesh(game.gorillas[p],p,1500,1);
 assert.deepEqual(game.snapshot(),before);assert.deepEqual(mesh({...game.gorillas[0],alive:false}),[]);
 const front=mesh(),turned=mesh({x:100,y:20,z:-50,heading:0,alive:true});
 for(let i=0;i<front.length;i+=9){assert.ok(Math.abs(turned[i]-100-front[i+2])<1e-5);assert.ok(Math.abs(turned[i+2]+50+front[i])<1e-5);}
});
test('Animation is continuous across former pose-switch boundaries and throw settles to idle',()=>{
 const a=mesh(undefined,0,160,1),b=mesh(undefined,0,160.01,1);
 let delta=0;for(let i=0;i<a.length;i+=9)delta=Math.max(delta,Math.hypot(a[i]-b[i],a[i+1]-b[i+1],a[i+2]-b[i+2]));
 assert.ok(delta<.01);
 assert.deepEqual(mesh(undefined,0,1000,0,false,.72),mesh(undefined,0,1000));
 assert.notDeepEqual(mesh(undefined,0,1000,0,false,0),mesh(undefined,0,1000));
});
test('Reduced motion produces stable idle and celebration, with no throwing movement',()=>{
 for(const c of [0,1])assert.deepEqual(mesh(undefined,1,0,c,true,0),mesh(undefined,1,99999,c,true,.3));
 assert.deepEqual(mesh(),mesh()); // Reusing cached models must not accumulate transforms.
});
test('Renderer freezes actor poses when paused and blends celebration without changing the engine',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),view=require('../view3d.js');
 const window={Gorillas3D:require('../engine3d.js'),GorillaView3D:view,GorillaModel3D:model};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../city3d.js'),'utf8'),{window});
 const r=Object.create(window.GorillaCity3D.prototype),game=new Game3D({},()=>.5),noop=()=>{};
 const calls=[];
 Object.assign(r,{canvas:{clientWidth:1000,clientHeight:600,width:1750,height:1050,style:{}},hud:{},ctx:{setTransform:noop},gl:new Proxy({},{get:()=>noop}),camera:new view.CameraRig(),clock:0,
 staticCity(){this.windSites=[];},cacheShadows:noop,applyLighting:noop,setExplosionLight:noop,observeReplay:noop,renderBuffer:noop,drawAmbient:noop,sun:noop,gorilla(...args){calls.push(args.slice(3));},upload:noop,drawHUD:noop,drawReplay:noop});
 const draw=(t,reduced=false,paused=false)=>{calls.length=0;r.draw(game,t,{angle:45,power:80,direction:0},reduced,paused);return structuredClone(calls);};
 draw(0);game.winner=0;game.phase='celebrating';const first=draw(50);
 assert.ok(first[0][1]>0&&first[0][1]<1);
 assert.deepEqual(draw(1000,false,true),first);
 const reduced=draw(1050,true);assert.equal(reduced[0][1],1);assert.equal(reduced[0][2],true);
 assert.equal(draw(1100,true)[0][0],reduced[0][0]);
 game.newRound();const next=draw(1150);assert.equal(next[0][1],0);
 game.fire(45,80,0);const launch=draw(1200);assert.equal(launch[0][3],0);
 game.phase='impact';const follow=draw(1250);assert.equal(follow[0][3],.05);
 assert.deepEqual(draw(2000,false,true),follow);
 draw(2050);assert.equal(calls[0][3],.1);
});
test('Idle gestures blink occasionally, stay continuous, and dance lifts both feet',()=>{
 const open=model.pose(0),blink=model.pose(2520),after=model.pose(3100);
 assert.equal(open[9][4],1);assert.ok(blink[9][4]<.1);assert.equal(after[9][4],1);
 assert.notDeepEqual(model.pose(6600)[2],open[2]);
 assert.notDeepEqual(model.pose(9200)[4],open[4]);
 const hop=model.pose(Math.PI/10*1000,1);
 assert.ok(hop[0][1][1]>2.7);assert.notEqual(model.pose(200,1)[7][2],model.pose(200,1)[8][2]);
 for(let t=0;t<2000;t+=50){
  const vertices=mesh(undefined,0,t,1);
  let min=Infinity;for(let i=1;i<vertices.length;i+=9)min=Math.min(min,vertices[i]);
  assert.ok(min>=-1e-5,'dancing feet must not enter the roof');
 }
 const still=model.pose(2520,1,-1,true);assert.equal(still[0][1][1],0);assert.equal(still[9][4],1);
});
test('Gorilla light sources follow roof height and switch off when an actor dies',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const window={Gorillas3D:require('../engine3d.js'),GorillaView3D:require('../view3d.js'),GorillaModel3D:model};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../city3d.js'),'utf8'),{window});
 const r=Object.create(window.GorillaCity3D.prototype),calls=[];
 r.gl={uniform4f(...args){calls.push(args);}};r.lightingUniforms={uActorLight0:'orange',uActorLight1:'mint'};
 r.setActorLights([{x:1,y:100,z:3,alive:true},{x:4,y:200,z:6,alive:false}]);
 assert.deepEqual(calls,[['orange',1,118,3,1.8],['mint',4,218,6,0]]);
});
