import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export async function readLive(url) {
  const freshUrl = new URL(url);
  freshUrl.searchParams.set('source_snapshot', String(Date.now()));
  let failure;
  for (const proxyFlags of [['--noproxy', '*'], []]) {
    try {
      // Each attempt owns its stdout: partial failed transfers are discarded.
      const { stdout } = await execute('curl', ['--http1.1', ...proxyFlags, '-fLsS', '--connect-timeout', '5', '--max-time', '20', freshUrl.href], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 });
      return stdout;
    } catch (error) { failure = error.code; }
  }
  throw new Error(`Cannot read static asset: ${url} (curl ${failure})`);
}
