import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

execFileSync(process.execPath, ['scripts/build.mjs'], {
  cwd: fileURLToPath(new URL('../sites/rocket/', import.meta.url)),
  stdio: 'inherit',
});
console.log('MC and AP CSP use their checked-in static site directories.');
