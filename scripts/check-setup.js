import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

let failed = false;
function report(ok, message) {
  console.log(`${ok ? 'OK' : 'FIX'}: ${message}`);
  if (!ok) failed = true;
}
report(Number(process.versions.node.split('.')[0]) >= 20, 'Node.js 20 or newer required. Install Node.js LTS from https://nodejs.org/');
const executable = process.env.PANTRY_CLAUDE_BIN || 'claude';
const version = spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
if (version.error || version.status !== 0) {
  report(false, 'Claude Code was not found. Install its native CLI, reopen your terminal, and run claude auth login.');
} else {
  report(true, 'Claude Code is available.');
  const auth = spawnSync(executable, ['auth', 'status'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  let loggedIn = false;
  try { loggedIn = auth.status === 0 && JSON.parse(auth.stdout).loggedIn === true; } catch {}
  report(loggedIn, loggedIn ? 'Claude is signed in. AI requests use this account’s access and usage limits.' : 'Claude login could not be verified. Run claude auth login, then npm run doctor.');
}
try {
  const browser = await chromium.launch();
  await browser.close();
  report(true, 'Shopping browser is installed and can launch.');
} catch {
  report(false, 'Shopping browser could not launch. Run npm run setup. On Linux, you may also need npx playwright install --with-deps chromium.');
}
console.log(failed ? 'Fix the items above, then run npm run doctor again.' : 'Setup checks passed. Run npm start, then open http://127.0.0.1:4320.');
process.exitCode = failed ? 1 : 0;
