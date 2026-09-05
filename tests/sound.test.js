const test = require('node:test');
const assert = require('node:assert/strict');
const { Sound } = require('../sound.js');

function audioStub() {
  const voices = [];
  const parameter = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  return { state: 'running', currentTime: 5, destination: {}, voices,
    createGain: () => ({ gain: parameter(), connect() {}, disconnect() {} }),
    createOscillator() {
      const voice = { frequency: parameter(), connect() {}, disconnect() {},
        start(time) { this.starts = (this.starts || 0) + 1; this.startTime = time; },
        stop(time) { this.stopTime = time; this.stops = (this.stops || 0) + 1; } };
      voices.push(voice); return voice;
    }
  };
}
test('Audio is lazy, reuses one context and releases completed notes', () => {
  let creations = 0; const context = audioStub();
  const sound = new Sound(() => { creations++; return context; });
  assert.equal(creations, 0);
  sound.play('throw'); sound.play('building'); assert.equal(creations, 1);
  assert.ok(context.voices.every(v => v.starts === 1 && v.stopTime > v.startTime && v.startTime >= context.currentTime));
  for (const voice of context.voices) voice.onended();
  assert.equal(sound.voices.size, 0);
});
test('Muting cancels scheduled sounds immediately and prevents new sounds until enabled', () => {
  const context = audioStub(), sound = new Sound(() => context);
  sound.play('match'); const count = context.voices.length;
  sound.setEnabled(false);
  assert.equal(sound.voices.size, 0); assert.ok(context.voices.every(v => v.stopTime === undefined));
  sound.play('gorilla'); assert.equal(context.voices.length, count);
  sound.setEnabled(true); sound.play('miss'); assert.ok(context.voices.length > count);
});
test('Missing or rejected Web Audio does not crash or retry on every frame', async () => {
  let attempts = 0; const unavailable = new Sound(() => { attempts++; throw new Error('Unavailable'); });
  assert.doesNotThrow(() => { unavailable.play('throw'); unavailable.play('building'); });
  assert.equal(attempts, 1); assert.equal(unavailable.available, false);
  const context = audioStub(); context.state = 'suspended'; context.resume = () => Promise.reject(new Error('Denied'));
  const denied = new Sound(() => context); denied.play('throw'); await Promise.resolve();
  assert.equal(denied.available, false); assert.equal(denied.voices.size, 0);
});
