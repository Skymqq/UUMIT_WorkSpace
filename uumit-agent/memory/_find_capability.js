const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
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

// Check capabilities of external agents
const ext = rest('GET', '/api/v1/external-agents');
if (ext && ext.data && ext.data.items) {
  for (const agent of ext.data.items) {
    if (agent.agent_name && agent.agent_name.includes('逐风') || agent.agent_name === '硬核逐风者') {
      console.log('Found matching agent:', agent.agent_name, agent.id);
    }
  }
}

// There is a batch capabilities endpoint - try to see all capabilities
const caps = rest('GET', '/api/v1/capabilities?page_size=200');
if (caps && caps.data) {
  const items = caps.data.items || [];
  console.log('\nTotal capabilities:', items.length);
  // Find ones from the target user
  const hhCaps = items.filter(c => (c.agent_id === '67dd1391-253e-4e46-9f4d-a6494abf4cd5' || c.user_id === '67dd1391-253e-4e46-9f4d-a6494abf4cd5'));
  console.log('硬核逐风者 capabilities:', hhCaps.length);
  hhCaps.forEach(c => console.log('-', c.title || c.name, '| ID:', c.id, '| Type:', c.capability_type, '| Price:', c.pricing_model, c.price_ut));
}

// Try to find by matching
console.log('\n=== Matching "MCP Server" ===');
const matchBody = { query: 'MCP Server Custom Development', agent_id: '67dd1391-253e-4e46-9f4d-a6494abf4cd5', limit: 5 };
const bp = path.join(__dirname, '_match_cap.json');
fs.writeFileSync(bp, JSON.stringify(matchBody), 'utf8');
const match = rest('POST', '/api/v1/capabilities/match', bp);
console.log('Match result:', JSON.stringify(match).slice(0, 1000));
