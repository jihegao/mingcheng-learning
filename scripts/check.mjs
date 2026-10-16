import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { Script } from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { sites } from './sites.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let assets = 0;
let links = 0;
for (const site of sites) {
  for (const file of site.assets) {
    const fullPath = path.join(root, site.directory, file);
    const body = await readFile(fullPath, 'utf8');
    assets += 1;
    if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', fullPath]);
    if (file.endsWith('.html')) {
      for (const match of body.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (!match[1].includes('src=') && !match[1].includes('type="module"') && match[2].trim()) new Script(match[2], { filename: file });
      }
      for (const match of body.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
        const reference = match[1];
        if (/^(?:https?:|data:|mailto:|#|javascript:)/.test(reference)) continue;
        const resolved = decodeURIComponent(new URL(reference, `${site.origin}/${file}`).pathname.slice(1));
        const target = !resolved || resolved.endsWith('/') ? `${resolved}index.html` : resolved;
        assert.ok(site.assets.includes(target), `${site.name}/${file}: missing public target ${target}`);
        links += 1;
      }
    }
  }
}
execFileSync(process.execPath, ['--check', path.join(root, 'services/assignment-upload/src/index.js')]);
console.log(`Checked ${assets} public assets, ${links} local links, page scripts and upload-service syntax.`);
