const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const SCRIPTS = path.join(__dirname, '..', 'scripts');

function restWithOutput(method, url, bodyStr, extraFlags) {
  let cmd = `node "${path.join(SCRIPTS, 'rest_request.js')}" ${method} "${url}"`;
  if (bodyStr) cmd += ` --file "${bodyStr}"`;
  if (extraFlags) cmd += ` ${extraFlags}`;
  try {
    const stdout = execSync(cmd, { encoding: 'utf8', cwd: SCRIPTS, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    return { stdout };
  } catch(e) {
    return { stdout: e.stdout || '', stderr: e.stderr || '', msg: e.message };
  }
}

// Try with empty body
const emptyBody = path.join(__dirname, '_empty.json');
fs.writeFileSync(emptyBody, '{}', 'utf8');

console.log('=== Freeze with empty body ===');
const r1 = restWithOutput('POST', '/api/v1/transactions/2a5719a6-4a36-43a6-b688-50321ed6fc96/freeze', emptyBody, '--idempotency-key fz-' + Date.now());
console.log('stdout:', r1.stdout.slice(0, 500));
if (r1.stderr) console.log('stderr:', r1.stderr.slice(0, 500));

console.log('\n=== Cancel duplicate with empty body ===');
const r2 = restWithOutput('POST', '/api/v1/transactions/624a2e58-8ed5-4fa1-8b75-983917906f92/cancel', emptyBody, '--idempotency-key cx-' + Date.now());
console.log('stdout:', r2.stdout.slice(0, 500));
if (r2.stderr) console.log('stderr:', r2.stderr.slice(0, 500));
