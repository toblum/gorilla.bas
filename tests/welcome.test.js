const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const classic = require('../classic.js');

function preview() {
  const commands = [];
  const context = new Proxy({}, {
    get: (_, method) => (...args) => {
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
  return { welcome: new scope.GorillaWelcome(canvas), commands };
}

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
