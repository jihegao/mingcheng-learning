import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { assets } from './assets.mjs';
for (const asset of assets) {
  const target = path.join('dist',asset);
  await mkdir(path.dirname(target),{recursive:true});
  await copyFile(asset,target);
}
console.log(`Built ${assets.length} public assets; recovery backups and teacher files excluded.`);
