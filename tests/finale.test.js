const test = require('node:test');
const assert = require('node:assert/strict');
const { Finale } = require('../finale.js');
test('Finale stays open for twenty seconds and returns to welcome exactly once', () => {
  let returns = 0; const finale = new Finale(() => returns++);
  finale.update(19.9); assert.equal(returns, 0);
  finale.update(.1); assert.equal(returns, 1);
  finale.update(1); finale.skip(); assert.equal(returns, 1);
});
test('Skipping ends immediately and a restored finale only plays its remaining time', () => {
  let returns = 0; const skipped = new Finale(() => returns++);
  skipped.skip(); assert.equal(returns, 1);
  const restored = new Finale(() => returns++, 18);
  restored.update(1.9); assert.equal(returns, 1);
  restored.update(.1); assert.equal(returns, 2);
});
test('Finale draws the rider last on an integer pixel grid', () => {
  let translated, scaled, riderDrawn = false;
  const ctx = new Proxy({}, { get: (_, key) => (...args) => {
    if (key === 'translate') translated = args;
    if (key === 'scale') scaled = args;
    if (riderDrawn && ['fill', 'stroke', 'fillRect'].includes(key)) assert.fail('Scenery drawn over rider');
  } });
  const finale = new Finale(() => {}, 15.123);
  finale.draw(ctx, 0, false, () => { riderDrawn = true; });
  assert.ok(riderDrawn);
  assert.ok(translated.every(Number.isInteger));
  assert.ok(scaled.every(Number.isInteger));
});
