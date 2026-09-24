const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const classic = require('../classic.js');

function preview() {
  const commands = [], frames = [];
  const context = new Proxy({}, {
    get: (_, method) => (...args) => {
      if (method === 'putImageData') frames.push(args[0].data);
      commands.push([method, ...args.map(value => value?.data
        ? createHash('sha256').update(value.data).digest('hex') : value)]);
    },
    set: (_, property, value) => { commands.push([property, value]); return true; }
  });
  const canvas = { getContext: () => context };
  const window = { GorillasClassic: classic, Gorillas: require('../engine.js') };
  const scope = vm.createContext({ ...window, document: { createElement: () => canvas },
    ImageData: class { constructor(data) { this.data = data; } } });
  scope.window = scope;
  vm.runInContext(fs.readFileSync(require.resolve('../visuals.js'), 'utf8'), scope);
  vm.runInContext(fs.readFileSync(require.resolve('../welcome.js'), 'utf8'), scope);
  return { welcome: new scope.GorillaWelcome(canvas), commands, frames, scope, canvas };
}

test('Welcome: 3D mode renders the real city on its own canvas and restores the 2D canvas', () => {
  const { welcome, commands, scope, canvas } = preview();
  const spatialCanvas = { hidden: true }, draws = [];
  scope.Gorillas3D = { Game3D: class { setDayHour(hour) { this.hour = hour; } } };
  scope.GorillaCity3D = class { draw(game, time, aim, reduced) { draws.push({ game, time, aim, reduced }); } };
  welcome.spatialCanvas = spatialCanvas;
  welcome.setMode('3d');
  assert.equal(canvas.hidden, true);
  assert.equal(spatialCanvas.hidden, false);
  commands.length = 0;
  welcome.draw(960, false);
  assert.equal(commands.length, 0, 'the 2D sprite preview is not drawn');
  assert.equal(draws.length, 1);
  assert.equal(draws[0].game.hour, 18);
  assert.equal(draws[0].aim.angle, 45);
  welcome.spatialRenderer.lost = true;
  welcome.draw(960, false);
  assert.equal(canvas.hidden, false, 'the 2D fallback appears as soon as WebGL is lost');
  assert.equal(spatialCanvas.hidden, true);
  assert.ok(commands.length > 0, 'the fallback is drawn even within the same animation tick');
  welcome.setMode('2d');
  assert.equal(canvas.hidden, false);
  assert.equal(spatialCanvas.hidden, true);
});

test('Welcome: each mode renders a distinct scene using the real actor artwork', () => {
  const { welcome, commands } = preview();
  const scenes = [];
  for (const mode of ['classic', '2d', '3d']) {
    welcome.setMode(mode); commands.length = 0; welcome.draw(960, false);
    assert.ok(commands.length > 0);
    scenes.push(JSON.stringify(commands));
  }
  assert.equal(new Set(scenes).size, 3);
});

test('Welcome: all three previews animate, even without a running match clock', () => {
  for (const mode of ['classic', '2d', '3d']) {
    const { welcome, commands } = preview(); welcome.setMode(mode);
    welcome.draw(960, false); const first = JSON.stringify(commands); commands.length = 0;
    welcome.draw(1920, false);
    assert.ok(commands.length > 0); assert.notEqual(JSON.stringify(commands), first, mode);
  }
});

test('Welcome: reduced motion freezes the entire scene but still allows mode changes', () => {
  const { welcome, commands } = preview();
  for (const mode of ['classic', '2d', '3d']) {
    welcome.setMode(mode); commands.length = 0; welcome.draw(960, true);
    assert.ok(commands.length > 0, `${mode} is rendered after selection`);
    commands.length = 0; welcome.draw(100000, true);
    assert.equal(commands.length, 0, `${mode} stays static`);
  }
});

test('Welcome: rendering is throttled between animation ticks', () => {
  const { welcome, commands } = preview();
  welcome.draw(960, false); commands.length = 0; welcome.draw(961, false);
  assert.equal(commands.length, 0);
});


test('Welcome: Classic sun matches the original filled EGA face and rays pixel for pixel', () => {
  const { welcome, frames } = preview();
  const original = new classic.Screen(); classic.drawSun(original);
  const expected = original.get(298, 7, 45, 37).rgba();
  welcome.setMode('classic'); welcome.draw(0, false);
  const actual = frames[0];
  for (let y = 0; y < 37; y++) {
    const start = ((22 + y) * 400 + 178) * 4;
    assert.deepEqual(actual.slice(start, start + 45 * 4), expected.slice(y * 45 * 4, (y + 1) * 45 * 4));
  }
});
