const { execSync } = require('child_process');
const path = require('path');
const SCRIPTS = path.join(__dirname, '..', 'scripts');

function rest(method, url, bodyFile, extraFlags) {
  let cmd = `node "${path.join(SCRIPTS, 'rest_request.js')}" ${method} "${url}"`;
  if (bodyFile) cmd += ` --file "${bodyFile}"`;
  if (extraFlags) cmd += ` ${extraFlags}`;
  try {
    const r = execSync(cmd, { encoding: 'utf8', cwd: SCRIPTS, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(r);
  } catch(e) {
    try { return JSON.parse(e.stdout); } catch(_) { return null; }
  }
}

// Cancel the second duplicate
console.log('=== Cancel duplicate ===');
const c1 = rest('POST', `/api/v1/transactions/624a2e58-8ed5-4fa1-8b75-983917906f92/cancel`);
console.log('Cancel result:', JSON.stringify(c1).slice(0, 300));

// Freeze the first transaction (pay)
console.log('\n=== Freeze transaction (buyer commits funds) ===');
const f1 = rest('POST', `/api/v1/transactions/2a5719a6-4a36-43a6-b688-50321ed6fc96/freeze`);
console.log('Freeze result:', JSON.stringify(f1).slice(0, 500));

// Check status
console.log('\n=== Transaction status ===');
const txn = rest('GET', '/api/v1/transactions/2a5719a6-4a36-43a6-b688-50321ed6fc96');
console.log('Status:', txn && txn.data ? txn.data.status : JSON.stringify(txn).slice(0, 500));
