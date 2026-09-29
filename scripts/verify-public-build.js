import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else files.push(path.replace(/^dist\//, ''));
  }
}
await walk('dist');
const allowed = /^(index\.html|manifest\.webmanifest|sw\.js|icon-(192|512)\.png|assets\/[\w-]+\.(js|css))$/;
const unexpected = files.filter((file) => !allowed.test(file));
if (unexpected.length) throw new Error(`Unexpected public build files: ${unexpected.join(', ')}`);
for (const required of ['index.html', 'manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png']) {
  if (!files.includes(required)) throw new Error(`Missing public PWA asset: ${required}`);
}
const html = await readFile('dist/index.html', 'utf8');
if (!html.includes('/RejseFlex/assets/') || !html.includes('manifest.webmanifest')) throw new Error('Pages base path or PWA manifest missing');
const manifest = JSON.parse(await readFile('dist/manifest.webmanifest', 'utf8'));
if (manifest.start_url !== '/RejseFlex/' || manifest.scope !== '/RejseFlex/' || manifest.display !== 'standalone') throw new Error('Invalid Pages install scope');
console.log(`Verified ${files.length} public build files and Pages install scope.`);
