const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {Score, Speaker, melodies, introPhrases} = require('../classic-sound');
const {Sound} = require('../sound');
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);

test('Classic: every score is taken verbatim from the original BASIC PLAY statements', () => {
  const source = fs.readFileSync(require.resolve('../reference/GORILLA.BAS'),'utf8').toUpperCase();
  for (const mml of [...Object.values(melodies), ...introPhrases]) assert.ok(source.includes(`PLAY "${mml}"`),mml);
});
test('Classic: QBasic O3 C is middle C; N1 is O0 C; N0 remains a rest', () => {
  const score = new Score(), notes = score.compile('O3C O0C N1 N0 O2A').notes;
  close(notes[0].hz,261.6255653005986);close(notes[1].hz,32.70319566257483);
  close(notes[2].hz,notes[1].hz);assert.equal(notes[3].hz,0);close(notes[4].hz,220);
});
test('Classic: original throw frequencies, lengths and inherited T160 match the score', () => {
  const score = new Score();score.compile(melodies.title);
  const result = score.compile(melodies.throw);
  const frequencies = [51.91308719749314,32.70319566257483,61.7354126570155,58.27047018976124];
  const durations = [1.5/32,1.5/64,1.5/16,1.5/64];
  result.notes.forEach((n,i)=>{close(n.hz,frequencies[i]);close(n.duration,durations[i]);close(n.gate,7/8);});
  close(result.duration,.1875);
  const building = score.compile(melodies.building), gorilla = score.compile(melodies.gorilla);
  close(building.duration,.328125);close(gorilla.duration,.65625);
});
test('Classic: rests, accidentals, note lengths and articulation preserve PLAY state', () => {
  const score = new Score();const result = score.compile('T120O2L16 B9N0BAA C#D- ML C MS D MN E..');
  close(result.notes[0].duration,2/9);close(result.notes[1].duration,.125);
  close(result.notes[2].duration,.125);close(result.notes[5].hz,result.notes[6].hz);
  assert.equal(result.notes[7].gate,1);assert.equal(result.notes[8].gate,.75);
  close(result.notes[9].duration,.125*1.75);close(result.notes[9].gate,.875);
  close(score.compile('C').notes[0].duration,.125);
});
test('Classic: intro retains all four phrases, eight closing motifs and the 32-note buffer delay', () => {
  const score = new Score();score.compile(melodies.title);const intro = score.intro();
  assert.equal(intro.notes.length,144);assert.equal(intro.poses.length,12);
  close(intro.poses[0].time,1);close(intro.poses[1].time,1.3);
  assert.ok(intro.poses[2].time>2.8);close(intro.duration,15.402777777777775);
  for(let i=1;i<intro.notes.length;i++)assert.ok(intro.notes[i].time>=intro.notes[i-1].time+intro.notes[i-1].duration-1e-8);
  assert.equal(score.tempo,160);
});
function stub() {
  const voices=[],gains=[];
  return {voices,gains,state:'running',currentTime:10,destination:{},
    createOscillator(){const v={frequency:{setValueAtTime(hz){v.hz=hz;}},connect(){},disconnect(){},start(t){v.startTime=t;},stop(t){v.stopTime=t;}};voices.push(v);return v;},
    createGain(){const g={gain:{setValueAtTime(value,time){g.values.push({value,time});}},values:[],connect(){},disconnect(){}};gains.push(g);return g;}
  };
}
test('Classic: audible square-wave gate, monophonic queue, mute and resume inside notes/rests', () => {
  const context=stub(),sound=new Sound(()=>context),speaker=new Speaker(sound),score=new Score();
  const music=score.compile('T120O3L4 C N0 D');speaker.play(music);
  assert.equal(context.voices.length,2);assert.equal(context.voices[0].type,'square');
  close(context.gains[0].values[0].value,.28);close(context.voices[0].stopTime-context.voices[0].startTime,.4375);
  speaker.play(music);assert.ok(context.voices[2].startTime>=context.voices[1].stopTime);
  sound.setEnabled(false);speaker.reset();const count=context.voices.length;speaker.play(music);assert.equal(context.voices.length,count);
  sound.setEnabled(true);speaker.play(music,.7);assert.equal(context.voices.length,count+1);
  close(context.voices.at(-1).startTime,10.305);
  sound.stop();speaker.reset();speaker.play(music,.2);close(context.voices.at(-2).stopTime-context.voices.at(-2).startTime,.2375);
  for(const v of context.voices)v.onended();assert.equal(sound.voices.size,0);
});
