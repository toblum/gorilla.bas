import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const files = ['index.html', 'style.css', 'engine.js', 'engine3d.js', 'view3d.js', 'city3d.js', 'sound.js', 'visuals.js', 'scenery.js', 'finale.js', 'game.js', 'favicon.svg'];
let commit = process.env.SOURCE_COMMIT || process.env.GITHUB_SHA;
if (!commit) {
  try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { commit = 'local'; }
}
if (!/^(?:[a-f0-9]{7,40}|local)$/.test(commit)) throw new Error('Invalid source commit');
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const label = `${version} · ${commit.slice(0, 7)}`;
await mkdir('dist', { recursive: true });
for (const file of files) await copyFile(file, `dist/${file}`);
const html = await readFile('dist/index.html', 'utf8');
if (!html.includes('id="build-version"')) throw new Error('Missing footer version element');
await writeFile('dist/index.html', html.replace(/(<span id="build-version">)[^<]*(<\/span>)/, `$1VERSION ${label}$2`));
await writeFile('dist/version.json', JSON.stringify({ version, commit }) + '\n');
console.log(`Built Gorillas ${label}`);
