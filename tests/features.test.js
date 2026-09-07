const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, blastRadius, launchVector, WIDTH, HEIGHT } = require('../engine.js');
const { Scenery, TYPES } = require('../scenery.js');

function seedRandom(seed = 42) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function wallShot(power, angle = 0, fps = 60) {
  const g = new Game({}, seedRandom()); g.terrain.fill(0); g.wind = 0;
  g.gorillas = [{ x: 100, y: 200, alive: true }, { x: 700, y: 200, alive: true }];
  for (let y = 0; y < HEIGHT; y++) g.terrain.fill(1, y * WIDTH + 140, y * WIDTH + 200);
  g.fire(angle, power);
  g.gorillas.forEach(actor => { actor.alive = false; }); // Isolate building damage from self-hits.
  for (let i = 0; i < 10000 && g.phase === 'flying'; i++) g.update(1 / fps);
  return g;
}
test('Impact energy changes actual craters while retaining bounded damage', () => {
  const slow = wallShot(20), fast = wallShot(160);
  assert.equal(slow.impact.type, 'building'); assert.equal(fast.impact.type, 'building');
  assert.ok(fast.craters[0].radius > slow.craters[0].radius + 3);
  for (const g of [slow, fast]) {
    assert.equal(g.craters[0].radius, g.impact.radius);
    assert.equal(g.terrainAt(150, g.impact.y), g.impact.radius > 12 ? 0 : 1);
    assert.ok(g.impact.radius >= 7.5 && g.impact.radius <= 15.5);
  }
  const high = blastRadius({ vx: 0, vy: 80, time: 16 }, 0, 10);
  const apex = blastRadius({ vx: 0, vy: 80, time: 8 }, 0, 10);
  assert.ok(high > apex + 3, 'Descent restores kinetic energy after the apex');
  assert.equal(high, blastRadius({ vx: 80, vy: 0, time: 0 }, 0, 10));
  const radii = [20, 60, 144].map(fps => wallShot(100, 0, fps).impact.radius);
  assert.ok(Math.max(...radii) - Math.min(...radii) < .01);
});
test('Sun charges once, preserves the trajectory, and survives a mid-flight reload', () => {
  const g = new Game({ aimAssist: true }, seedRandom()); g.terrain.fill(0); g.wind = 0;
  g.gorillas[0] = { x: 400, y: 180, alive: true }; g.fire(90, 60);
  const velocity = { vx: g.shot.vx, vy: g.shot.vy };
  for (let i = 0; i < 1000 && !g.shot?.charged; i++) g.update(1 / 60);
  assert.equal(g.shot.charged, true); assert.equal(g.sunHit, true);
  assert.equal(g.shot.vx, velocity.vx); assert.equal(g.shot.vy, velocity.vy);
  const restored = new Game(); assert.ok(restored.restore(g.snapshot()));
  assert.equal(restored.options.aimAssist, true); assert.equal(restored.shot.charged, true);
  const normal = blastRadius({ ...g.shot, charged: false }, 0, 9.8);
  g.collide({ type: 'building', x: 400, y: 300 });
  assert.ok(Math.abs(g.impact.radius - normal * 1.2) < 1e-9);
  assert.equal(g.impact.charged, true);
  const legacy = new Game().snapshot(); delete legacy.options.aimAssist;
  assert.ok(restored.restore(legacy)); assert.equal(restored.options.aimAssist, false);
});
test('Aim vectors match actual launch direction for both players and all quadrants', () => {
  for (const player of [0, 1]) for (const angle of [0, 45, 90, 180, 270, 360]) {
    const g = new Game(); g.turn = player; g.fire(angle, 80);
    const v = launchVector(player, angle, 1);
    assert.ok(Math.abs(g.shot.vx - v.vx * 80) < 1e-9);
    assert.ok(Math.abs(g.shot.vy - v.vy * 80) < 1e-9);
  }
});
test('Sky traffic has weighted rarity, faster UFOs, and quiet gaps', () => {
  const s = new Scenery(seedRandom()), counts = Object.fromEntries(TYPES.map(t => [t.kind, 0]));
  for (let i = 0; i < 10000; i++) {
    s.update(s.wait + .1); assert.ok(s.object); counts[s.object.kind]++;
    s.update(200); assert.equal(s.object, null); assert.ok(s.wait >= 12 && s.wait <= 32);
  }
  for (const t of TYPES) assert.ok(Math.abs(counts[t.kind] / 100 - t.weight) < 2);
  assert.ok(TYPES.find(t => t.kind === 'ufo').speed > TYPES.find(t => t.kind === 'plane').speed);
  const time = s.time; s.update(0); assert.equal(s.time, time);
});
