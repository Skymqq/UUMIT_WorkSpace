const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const SCRIPTS = path.join(__dirname, '..', 'scripts');

function rest(method, url) {
  const cmd = `node "${path.join(SCRIPTS, 'rest_request.js')}" ${method} "${url}"`;
  try {
    return JSON.parse(execSync(cmd, { encoding: 'utf8', cwd: SCRIPTS, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }));
  } catch(e) {
    try { return JSON.parse(e.stdout); } catch(_) { return { error: e.message }; }
  }
}

// Wait 3 seconds
execSync('powershell -Command "Start-Sleep -Seconds 3"', { timeout: 10000 });

const txn = rest('GET', '/api/v1/transactions/2a5719a6-4a36-43a6-b688-50321ed6fc96');
console.log('Transaction status:', JSON.stringify(txn && txn.data, null, 2));

// Also check wallet
const wallet = rest('GET', '/api/v1/wallet');
console.log('\nWallet:', JSON.stringify(wallet && wallet.data, null, 2));

// Also check balance needed
const rates = rest('GET', '/api/v1/wallet/rates');
console.log('\nRates:', JSON.stringify(rates && rates.data, null, 2));
