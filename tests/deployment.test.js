const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Self-hosting manifest includes every local script and linked asset', () => {
  const root = path.join(__dirname, '..');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const section = readme.split('## Selbst hosten')[1].split('###')[0];
  const files = section.match(/```text\n([\s\S]*?)```/)[1].trim().split('\n');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const assets = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/g)]
    .map(match => match[1].split('?')[0]).filter(asset => !/^(?:https?:)?\/\//.test(asset));
  assert.deepEqual([...files].sort(), ['index.html', ...assets].sort());
  assert.equal(new Set(files).size, files.length);
  for (const file of files) assert.ok(fs.existsSync(path.join(root, file)), `${file} exists`);
});
