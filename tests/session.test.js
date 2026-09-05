const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../engine.js');

test('Session restores names, scores, inputs history and exact destroyed terrain', () => {
  const game = new Game({ names: ['Ada', 'Ben'], target: 5, gravity: 1.6 });
  game.destroy(240, 350, 22); game.scores = [2, 1]; game.turn = 1;
  game.lastShots = [{ angle: 62, power: 74 }, null];
  const restored = new Game();
  assert.equal(restored.restore(JSON.parse(JSON.stringify(game.snapshot()))), true);
  assert.deepEqual(restored.terrain, game.terrain);
  assert.deepEqual(restored.snapshot(), game.snapshot());
});
test('Reload mid-flight resumes the same trajectory and outcome', () => {
  const game = new Game(); game.fire(85, 100); game.update(.02);
  const restored = new Game(); assert.equal(restored.restore(game.snapshot()), true);
  for (let i = 0; i < 1000; i++) { game.update(.016); restored.update(.016); }
  assert.deepEqual(restored.snapshot(), game.snapshot());
  assert.deepEqual(restored.terrain, game.terrain);
});
test('Session resumes victory and rejects incompatible or incomplete saves', () => {
  const game = new Game(); game.fire(0, 0); game.update(.9); game.update(.5);
  const restored = new Game(); assert.equal(restored.restore(game.snapshot()), true);
  restored.update(2); game.update(2); assert.deepEqual(restored.snapshot(), game.snapshot());
  assert.equal(restored.restore(null), false);
  assert.equal(restored.restore({ version: 99 }), false);
  assert.equal(restored.restore({ version: 1, phase: 'aiming' }), false);
});
