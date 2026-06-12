const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const SCRIPTS = path.join(__dirname, '..', 'scripts');

function rest(method, url, bodyFile, extraFlags) {
  let cmd = `node "${path.join(SCRIPTS, 'rest_request.js')}" ${method} "${url}"`;
  if (bodyFile) cmd += ` --file "${bodyFile}"`;
  if (extraFlags) cmd += ` ${extraFlags}`;
  try {
    const stdout = execSync(cmd, { encoding: 'utf8', cwd: SCRIPTS, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    return { ok: true, data: JSON.parse(stdout) };
  } catch(e) {
    try { if (e.stdout) return { ok: true, data: JSON.parse(e.stdout) }; } catch(_) {}
    return { ok: false, err: (e.stdout || '').slice(0, 600), stderr: e.stderr || '' };
  }
}

// First, let's look at some of 硬核逐风者's previous tasks to understand the format
const hisTasks = rest('GET', '/api/v1/tasks/hall?page_size=5');
console.log('Task hall sample:', hisTasks.ok ? JSON.stringify(hisTasks.data).slice(0, 1000) : hisTasks.err);

// Let me also check the pricing suggestion
const pricing = rest('GET', '/api/v1/pricing/suggestion');
console.log('\nPricing suggestion:', pricing.ok ? JSON.stringify(pricing.data).slice(0, 500) : pricing.err);
