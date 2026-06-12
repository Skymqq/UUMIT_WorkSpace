const { execSync } = require('child_process');
const path = require('path');
const SCRIPTS = path.join(__dirname, '..', 'scripts');

function rest(method, url, bodyFile) {
  let cmd = `node "${path.join(SCRIPTS, 'rest_request.js')}" ${method} "${url}"`;
  if (bodyFile) cmd += ` --file "${bodyFile}"`;
  try {
    const r = execSync(cmd, { encoding: 'utf8', cwd: SCRIPTS, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(r);
  } catch(e) {
    try { return JSON.parse(e.stdout); } catch(_) { return null; }
  }
}

// Full agent card
const card = rest('GET', '/api/v1/agents/67dd1391-253e-4e46-9f4d-a6494abf4cd5/card');
console.log('Full card:', JSON.stringify(card && card.data, null, 2));
