const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const SCRIPTS = path.join(__dirname, '..', 'scripts');

function rest(method, url, bodyFile, idempotencyKey) {
  let cmd = `node "${path.join(SCRIPTS, 'rest_request.js')}" ${method} "${url}"`;
  if (bodyFile) cmd += ` --file "${bodyFile}"`;
  if (idempotencyKey) cmd += ` --idempotency-key ${idempotencyKey}`;
  try {
    const r = execSync(cmd, { encoding: 'utf8', cwd: SCRIPTS, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    return { ok: true, data: JSON.parse(r) };
  } catch(e) {
    try { if (e.stdout) return { ok: true, data: JSON.parse(e.stdout) }; } catch(_) {}
    const errMsg = (e.stderr || '').trim() || e.message || '';
    let stdoutData = null;
    try { if (e.stdout) stdoutData = JSON.parse(e.stdout); } catch(_) {}
    return { ok: false, err: errMsg.slice(0, 200), stdout: stdoutData };
  }
}

// Dry-run first to see what format is needed
console.log('=== Try creating a transaction for MCP Server Custom Development Service ===');

const body = {
  agent_skill_id: '7e528635-2823-4b30-8355-9e97c1507831',
  target_agent_id: '67dd1391-253e-4e46-9f4d-a6494abf4cd5',
  amount_ut: 400,
  memo: 'MCP Server Custom Development Service'
};

const bp = path.join(__dirname, '_purchase.json');
fs.writeFileSync(bp, JSON.stringify(body), 'utf8');

// Try creating a transaction
console.log('Attempting to create transaction...');
const r = rest('POST', '/api/v1/transactions', bp, 'purchase-mcp-skill-001');
console.log('Result:', r.ok ? JSON.stringify(r.data).slice(0, 500) : 'ERR: ' + r.err);
if (r.stdout) console.log('STDOUT data:', JSON.stringify(r.stdout).slice(0, 500));
