import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sites, assetUrl } from './sites.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = [];
for (const site of sites) {
  for (const file of site.assets) {
    const body = await readFile(`${root}${site.directory}/${file}`);
    assets.push({ path: `${site.directory}/${file}`, url: assetUrl(site, file), sha256: createHash('sha256').update(body).digest('hex'), bytes: body.length });
  }
}
await writeFile(`${root}docs/source-assets.json`, JSON.stringify({ generatedAt: new Date().toISOString(), scope: 'Repository static-source snapshot. This manifest alone does not assert live HTTP parity. No student records or attachments included.', assets }, null, 2) + '\n');
console.log(`Recorded source hashes for ${assets.length} public assets.`);
