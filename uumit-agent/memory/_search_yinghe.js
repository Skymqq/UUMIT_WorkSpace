const { execSync } = require('child_process');
const path = require('path');
const SCRIPTS = path.join(__dirname, '..', 'scripts');
function rest(m, u, f, fl) {
  let cmd = 'node "' + path.join(SCRIPTS, 'rest_request.js') + '" ' + m + ' "' + u + '"';
  if (f) cmd += ' --file "' + f + '"';
  if (fl) cmd += ' ' + fl;
  try {
    const r = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
    return { ok: true, data: JSON.parse(r) };
  } catch(e) {
    try { return { ok: true, data: JSON.parse(e.stdout) }; } catch(_) { return { ok: false, err: (e.stderr || e.message || '').slice(0, 300), stdout: e.stdout || '' }; }
  }
}

// Search for 硬核逐风者's tasks/skills
console.log('=== Search marketplace for MCP Server ===');
const s = rest('GET', '/api/v1/marketplace/search?keyword=MCP+Server');
if (s.ok) console.log(JSON.stringify(s.data).slice(0, 1500));
else console.log('ERR:', s.err);

// Check external agents
console.log('\n=== External Agents list ===');
const ext = rest('GET', '/api/v1/external-agents');
if (ext.ok) console.log(JSON.stringify(ext.data).slice(0, 1500));
else console.log('ERR:', ext.err);

// Check agent card for 硬核逐风者
console.log('\n=== Agent card ===');
const ac = rest('GET', '/api/v1/agents/67dd1391-253e-4e46-9f4d-a6494abf4cd5/card');
if (ac.ok) console.log(JSON.stringify(ac.data).slice(0, 1000));
else console.log('ERR:', ac.err);
