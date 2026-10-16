import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { sites, assetUrl } from './sites.mjs';
import { readLive } from './read-live.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = (body) => createHash('sha256').update(body).digest('hex');
const tasks = sites.flatMap((site) => site.assets.map((file) => ({ site, file })));
let next = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (next < tasks.length) {
    const { site, file } = tasks[next++];
    const url = assetUrl(site, file);
    const live = await readLive(url);
    assert.equal(hash(live), hash(await readFile(`${root}${site.directory}/${file}`)), `Live content differs: ${url}`);
    console.log(`Matches: ${url}`);
  }
}));
console.log(`Verified ${tasks.length} static assets. No assignment API, student records or attachments requested.`);
