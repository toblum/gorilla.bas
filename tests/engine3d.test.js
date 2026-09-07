const test = require('node:test');
const assert = require('node:assert/strict');
const { Game3D, WORLD_X, WORLD_Z, BLOCK, SUN, launchVector3, pointAt3 } = require('../engine3d.js');

function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function emptyGame(options = {}, seed = 42) {
  const game = new Game3D(options, seeded(seed));
  game.wind = 0;
  for (const b of game.blocks) { b.type = 'plaza'; b.height = 0; b.chunkCount = 0; }
  for (const c of game.chunks) c.alive = false;
  game.gorillas = [{ x: 100, y: 200, z: 120, alive: true }, { x: 650, y: 200, z: 380, alive: true }];
  return game;
}
function settle(game, fps = 60) {
  let frames = 0;
  while (['flying', 'impact', 'celebrating'].includes(game.phase) && frames++ < fps * 180) game.update(1 / fps);
  assert.ok(frames < fps * 180, 'Shot must settle within bounded time');
}

test('3D ballistics: gravity pulls down, wind pushes along x, direction adds lateral drift', () => {
  const shot = { startX: 10, startY: 20, startZ: 30, vx: 40, vy: 60, vz: 15 };
  assert.deepEqual(pointAt3(shot, 0, 0, 9.8), { x: 10, y: 20, z: 30 });
  const calm = pointAt3(shot, 2, 0, 9.8), windy = pointAt3(shot, 2, 5, 9.8);
  assert.equal(calm.x, 110); assert.equal(calm.z, 30 + 1.25 * 30);
  assert.ok(Math.abs(calm.y - (20 + 1.25 * (120 - 19.6))) < 1e-9);
  assert.equal(windy.x - calm.x, 2.5); assert.equal(windy.z, calm.z, 'Wind never blows laterally');
  assert.ok(pointAt3(shot, 2, 0, 20).y < calm.y, 'Stronger gravity sinks the banana');
});
test('Direction rotates the throw around the vertical axis, mirrored per player', () => {
  const straight = launchVector3(0, 45, 100, 0);
  assert.ok(straight.vx > 0 && straight.vy > 0 && Math.abs(straight.vz) < 1e-9);
  const right = launchVector3(0, 45, 100, 30);
  assert.ok(right.vz > 0, 'Player 1 throws screen-right toward +z');
  assert.ok(right.vx < straight.vx, 'Lateral aim costs forward speed');
  const other = launchVector3(1, 45, 100, 30);
  assert.ok(other.vx < 0 && other.vz < 0, 'Player 2 is mirrored on both axes');
  assert.ok(Math.abs(Math.hypot(right.vx, right.vz) - straight.vx) < 1e-9, 'Horizontal speed is preserved');
});
test('The 3D city has blocks, streets, parks and supported gorillas on opposite sides', () => {
  const types = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const game = new Game3D({}, seeded(seed));
    assert.equal(game.blocks.length, 40);
    for (const b of game.blocks) { types.add(b.type); assert.ok(b.x >= 0 && b.x + BLOCK <= WORLD_X && b.z >= 0 && b.z + BLOCK <= WORLD_Z); }
    const [g0, g1] = game.gorillas;
    assert.ok(g0.x < WORLD_X / 2 && g1.x > WORLD_X / 2);
    for (const g of game.gorillas) {
      const block = game.blocks.find(b => g.x >= b.x && g.x <= b.x + BLOCK && g.z >= b.z && g.z <= b.z + BLOCK);
      assert.equal(block.type, 'building'); assert.equal(block.height, g.y, 'Gorilla stands on the roof');
      assert.ok(block.height >= 48);
    }
    assert.ok(game.wind >= -14 && game.wind <= 15);
  }
  assert.ok(types.has('park') && types.has('building'), 'Parks interrupt the building grid');
});
test('Fire validates the third dimension and refuses double shots', () => {
  const game = emptyGame();
  assert.equal(game.fire(45, 65, 61), false);
  assert.equal(game.fire(45, 65, -61), false);
  assert.equal(game.fire(45, 65, Number.NaN), false);
  assert.equal(game.fire(45, 65, 20), true);
  assert.equal(game.fire(45, 65, 0), false, 'Cannot fire twice');
  assert.ok(game.shot.vz > 0 && game.lastShots[0].direction === 20);
});
test('A backward miss switches the turn exactly once; a street hit counts as ground impact', () => {
  const game = emptyGame();
  game.fire(180, 80, 0); settle(game);
  assert.equal(game.lastEvent, 'miss'); assert.equal(game.turn, 1); assert.deepEqual(game.scores, [0, 0]);
  const second = emptyGame();
  second.fire(90, 40, 0); settle(second);
  assert.equal(second.lastEvent, 'ground'); assert.equal(second.turn, 1);
  assert.equal(second.craters.length, 1); assert.equal(second.craters[0].y, 0, 'Scorch mark on the street');
});
test('Explosions remove building chunks in a sphere and keep a crater record', () => {
  const game = new Game3D({}, seeded(3));
  const block = game.blocks.find(b => b.type === 'building');
  const chunk = game.chunks.slice(block.chunkStart, block.chunkStart + block.chunkCount)
    .find(c => c.alive && c.y > 0);
  const cx = chunk.x + chunk.w / 2, cy = chunk.y + chunk.h / 2, cz = chunk.z + chunk.d / 2;
  assert.ok(game.collisionAt(cx, cy, cz)?.type === 'building');
  game.destroy(cx, cy, cz, 20);
  assert.equal(chunk.alive, false); assert.equal(game.craters.length, 1);
  assert.equal(game.collisionAt(cx, cy, cz), null, 'The crater is passable');
});
test('A direct gorilla hit scores for the opponent and celebrates', () => {
  const game = emptyGame();
  game.fire(45, 1, 0); // too weak: falls back onto the thrower
  assert.equal(game.phase, 'impact'); assert.equal(game.winner, 1);
  assert.deepEqual(game.scores, [0, 1]); assert.equal(game.gorillas[0].alive, false);
  settle(game);
  assert.equal(game.phase, 'roundOver');
  assert.equal(game.continue(), true); assert.equal(game.phase, 'aiming'); assert.equal(game.round, 2);
});
test('Snapshot and restore keep phase, destruction and gorillas intact', () => {
  const game = new Game3D({}, seeded(11));
  const block = game.blocks.find(b => b.type === 'building');
  const chunk = game.chunks[block.chunkStart];
  game.destroy(chunk.x + 17, chunk.y + 8, chunk.z + 17, 20);
  const copy = new Game3D({}, seeded(99));
  assert.equal(copy.restore(game.snapshot()), true);
  assert.equal(copy.phase, game.phase); assert.deepEqual(copy.scores, game.scores);
  assert.deepEqual(copy.chunks.map(c => c.alive), game.chunks.map(c => c.alive));
  assert.deepEqual(copy.gorillas, game.gorillas);
  assert.equal(copy.restore({ version: 2 }), false);
});
test('The aim assist predicts a path that ends in a hit', () => {
  const game = new Game3D({}, seeded(5));
  const { points, hit } = game.predict(45, 65, 0);
  assert.ok(points.length > 5); assert.ok(hit, 'Prediction reports where the banana lands');
  assert.ok(game.predict(45, 65, Number.NaN).points.length > 0);
});
test('Sun contact charges the banana exactly once', () => {
  const game = emptyGame();
  game.gorillas[0] = { x: SUN.x - 150, y: SUN.y - 40, z: SUN.z, alive: true };
  game.options.gravity = 0.5; // nearly straight flight through the sun
  game.fire(6, 126, 0);
  let charged = false, sunEvent = false;
  for (let i = 0; i < 240 * 20 && ['flying', 'impact', 'celebrating'].includes(game.phase); i++) {
    game.update(1 / 240);
    charged ||= game.shot?.charged === true;
    sunEvent ||= game.lastEvent === 'sun';
  }
  assert.ok(charged && sunEvent, 'The banana glows after touching the sun');
});
