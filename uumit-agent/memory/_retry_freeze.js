const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const SCRIPTS = path.join(__dirname, '..', 'scripts');
const EMPTY = path.join(__dirname, '_empty.json');

const k = 'fz-' + Date.now();
const cmd = `node "${path.join(SCRIPTS, 'rest_request.js')}" POST "/api/v1/transactions/2a5719a6-4a36-43a6-b688-50321ed6fc96/freeze" --file "${EMPTY}" --idempotency-key ${k}`;
try {
  const r = execSync(cmd, { encoding: 'utf8', cwd: SCRIPTS, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
  console.log('OK:', r);
} catch(e) {
  console.log('ERR:', e.stdout || e.message);
}
