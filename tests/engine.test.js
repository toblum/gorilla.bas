const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, WIDTH, HEIGHT, SPRITE, pointAt, gorillaPixel } = require('../engine.js');

function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function emptyGame(options = {}, seed = 42) {
  const game = new Game(options, seeded(seed));
  game.terrain.fill(0); game.wind = 0;
  game.gorillas = [{ x: 100, y: 300, alive: true }, { x: 650, y: 300, alive: true }];
  return game;
}
function settle(game, fps = 60) {
  let frames = 0;
  while (['flying', 'impact'].includes(game.phase) && frames++ < fps * 180) game.update(1 / fps);
  assert.ok(frames < fps * 180, 'Shot must settle within bounded time');
}

test('Ballistics: gravity pulls down; wind accelerates horizontally; frame timing is irrelevant', () => {
  const shot = { startX: 10, startY: 20, vx: 40, vy: 60 };
  assert.deepEqual(pointAt(shot, 0, 0, 9.8), { x: 10, y: 20 });
  const calm = pointAt(shot, 2, 0, 9.8), right = pointAt(shot, 2, 5, 9.8), left = pointAt(shot, 2, -5, 9.8);
  assert.equal(calm.x, 110); assert.ok(Math.abs(calm.y - (-105.5)) < 1e-9);
  assert.equal(right.x - calm.x, 2.5); assert.equal(calm.x - left.x, 2.5);
  assert.ok(pointAt(shot, 2, 0, 20).y > calm.y);
});
test('Generated cities have two supported gorillas, varied buildings and bounded wind', () => {
  const unique = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const game = new Game({}, seeded(seed));
    assert.ok(game.buildings.length >= 9);
    assert.ok(game.gorillas[0].x < WIDTH / 2 && game.gorillas[1].x > WIDTH / 2);
    for (const g of game.gorillas) { assert.ok(g.y > 40); assert.ok(game.terrainAt(g.x, g.y + SPRITE.length * 2)); }
    assert.ok(game.wind >= -14 && game.wind <= 15); unique.add(game.gorillas[0].y);
  }
  assert.ok(unique.size > 20);
});
test('Both players aim toward the opponent with the same angle', () => {
  const g = emptyGame();
  g.fire(45, 65); const left = { ...g.shot };
  const right = emptyGame(); right.turn = 1; right.fire(45, 65);
  assert.ok(left.vx > 0 && right.shot.vx < 0);
  assert.ok(Math.abs(left.vy - right.shot.vy) < 1e-9);
  assert.equal(g.fire(45, 65), false, 'Cannot fire twice');
});
test('A miss switches players exactly once and keeps scores, terrain and wind', () => {
  const g = emptyGame(); g.wind = 3; const terrain = g.terrain;
  g.fire(180, 80); settle(g);
  assert.equal(g.phase, 'aiming'); assert.equal(g.turn, 1); assert.deepEqual(g.scores, [0, 0]);
  assert.equal(g.terrain, terrain); assert.equal(g.wind, 3);
  g.update(1); assert.equal(g.turn, 1);
});
test('Fast shots cannot tunnel through one-pixel walls; impact creates a passable crater', () => {
  const g = emptyGame();
  for (let y = 0; y < HEIGHT; y++) g.terrain[y * WIDTH + 200] = 1;
  g.fire(0, 360); settle(g, 20);
  assert.equal(g.lastEvent, 'building'); assert.equal(g.craters.length, 1);
  assert.equal(g.turn, 1); assert.deepEqual(g.scores, [0, 0]);
  const hit = g.craters[0]; assert.equal(g.terrainAt(200, hit.y), 0);
  assert.equal(g.terrainAt(200, hit.y + 20), 1);
});
test('Direct opponent hit awards one point and next round preserves score and turn', () => {
  const g = emptyGame({ target: 2 });
  g.gorillas[1] = { x: 200, y: 287, alive: true };
  g.fire(0, 100); settle(g);
  assert.equal(g.phase, 'roundOver'); assert.deepEqual(g.scores, [1, 0]); assert.equal(g.winner, 0);
  assert.equal(g.gorillas[1].alive, false); g.update(5); assert.deepEqual(g.scores, [1, 0]);
  assert.ok(g.continue()); assert.equal(g.round, 2); assert.equal(g.turn, 1);
  assert.deepEqual(g.scores, [1, 0]); assert.ok(g.gorillas.every(gorilla => gorilla.alive));
  assert.equal(g.craters.length, 0); assert.equal(g.phase, 'aiming');
});
test('Right player direct hit awards the right player', () => {
  const g = emptyGame(); g.turn = 1; g.gorillas[0] = { x: 530, y: 287, alive: true };
  g.fire(0, 100); settle(g); assert.deepEqual(g.scores, [0, 1]); assert.equal(g.winner, 1);
});
test('Self hits award the opponent, including zero-strength throws and returning bananas', () => {
  for (const player of [0, 1]) {
    const g = emptyGame(); g.turn = player; g.fire(45, 0); settle(g);
    assert.equal(g.winner, 1 - player); assert.equal(g.scores[1 - player], 1);
  }
  const g = emptyGame(); g.wind = .3; g.fire(90, 30); settle(g);
  assert.equal(g.winner, 1, 'Wind can bring a vertical banana back onto its thrower');
});
test('Match target locks throwing; rematch resets scores, terrain, round and remembered throws', () => {
  const g = emptyGame({ names: ['Ada', 'Linus'], target: 1, gravity: 12 });
  g.fire(45, 0); settle(g); assert.equal(g.phase, 'matchOver'); assert.equal(g.fire(45, 50), false);
  assert.ok(g.continue()); assert.deepEqual(g.scores, [0, 0]); assert.equal(g.round, 1); assert.equal(g.turn, 0);
  assert.equal(g.options.gravity, 12); assert.deepEqual(g.options.names, ['Ada', 'Linus']);
  assert.deepEqual(g.lastShots, [null, null]); assert.equal(g.phase, 'aiming');
});
test('Crater masks match pixel centers and preserve surrounding terrain', () => {
  const g = emptyGame(); g.terrain.fill(1); g.destroy(400, 200, 11);
  assert.equal(g.terrainAt(400, 200), 0); assert.equal(g.terrainAt(412, 200), 1);
  assert.equal(g.collisionAt(400, 200), null);
  assert.equal(gorillaPixel(g.gorillas[0], 100, 302), true);
  assert.equal(gorillaPixel(g.gorillas[0], 85, 300), false);
});
test('Above-screen arcs return and the sun is passable', () => {
  const g = emptyGame(); g.gorillas[0] = { x: 400, y: 180, alive: true };
  g.fire(90, 60); let above = false, sunHit = false;
  for (let frame = 0; frame < 5000 && ['flying', 'impact'].includes(g.phase); frame++) {
    g.update(1 / 60); above ||= Boolean(g.shot && g.shot.y < 0); sunHit ||= g.sunHit;
  }
  assert.ok(above); assert.ok(sunHit); assert.ok(!['flying', 'impact'].includes(g.phase));
});
test('Same shot at 20, 60 and 144 fps hits the same object and point', () => {
  const results = [20, 60, 144].map(fps => {
    const g = new Game({}, seeded(101)); g.fire(55, 80); settle(g, fps);
    return { phase: g.phase, scores: g.scores, hit: g.impact };
  });
  for (const r of results.slice(1)) {
    assert.equal(r.phase, results[0].phase); assert.deepEqual(r.scores, results[0].scores);
    assert.equal(r.hit?.type, results[0].hit?.type);
    if (r.hit) assert.ok(Math.hypot(r.hit.x - results[0].hit.x, r.hit.y - results[0].hit.y) < 1);
  }
});
test('Input guards reject non-finite/out-of-range throws; reset interrupts an active shot', () => {
  const g = emptyGame();
  for (const args of [[NaN, 50], [40, Infinity], [-1, 50], [361, 50], [45, -2], [45, 361]]) assert.equal(g.fire(...args), false);
  g.fire(50, 100); g.update(.05); g.reset({ names: [' X ', ''], target: 5, gravity: 1.6 });
  assert.equal(g.phase, 'aiming'); assert.equal(g.shot, null); assert.equal(g.turn, 0);
  assert.deepEqual(g.options.names, ['X', 'Spieler 2']); assert.deepEqual(g.scores, [0, 0]);
});
