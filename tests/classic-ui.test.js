const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(){
 const elements=new Map(),events={};
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:false,disabled:false,open:false,handlers:{},addEventListener(t,fn){this.handlers[t]=fn;},focus(){},getContext(){return {};}});return elements.get(id);};
 let ended=0;
 const sound={enabled:false,available:false,stop(){this.stops=(this.stops||0)+1;}};
 const window={GorillasClassic:require('../classic'),ClassicSound:require('../classic-sound')};
 const document={getElementById:element,body:{classList:{contains:()=>true}},addEventListener(t,fn){events[t]=fn;}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../classic-ui'),'utf8'),{window,document});
 const ui=new window.ClassicUI(sound,()=>ended++);ui.start({target:1});
 return {ui,element,sound,ended:()=>ended};
}
test('Classic UI: a completed match returns through the visible submit button',()=>{
 const {ui,element,ended,sound}=fixture();ui.advance();ui.advance();
 ui.game.enter('.');ui.game.enter('.');for(let i=0;i<500&&ui.game.phase!=='gameOver';i++)ui.update(.02);
 assert.equal(ui.game.phase,'gameOver');assert.equal(element('classic-submit').textContent,'Zum Startbildschirm');
 const stops=sound.stops,onEnd=ui.onEnd;ui.speaker.end=100;
 ui.onEnd=()=>{assert.equal(sound.stops,stops+1);assert.equal(ui.speaker.end,0);onEnd();};
 element('classic-form').handlers.submit({preventDefault(){}});assert.equal(ended(),1);
});
test('Classic UI: muted intro keeps all poses and finishes before accepting shots',()=>{
 const {ui}=fixture();ui.advance();ui.advance('v');ui.update(3);assert.equal(ui.stage,'intro');
 for(let i=0;i<650;i++)ui.update(.02);assert.equal(ui.stage,'play');assert.equal(ui.game.phase,'aiming');
});
test('Classic UI: skipping and restarting clear scheduled intro audio',()=>{
 const {ui,sound}=fixture();ui.advance();ui.advance('v');ui.update(2);ui.speaker.end=100;ui.advance();assert.equal(ui.stage,'play');assert.equal(ui.speaker.end,0);assert.equal(sound.stops,2);
 ui.start({});assert.equal(ui.score.tempo,160);assert.equal(ui.resumeIntro,false);
});
