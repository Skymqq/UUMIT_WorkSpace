const { execSync } = require('child_process');
const path = require('path');
const SCRIPTS = path.join(__dirname, '..', 'scripts');

function rest(method, url) {
  try {
    const r = execSync(`node "${path.join(SCRIPTS, 'rest_request.js')}" ${method} "${url}"`, { encoding: 'utf8', cwd: SCRIPTS, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(r);
  } catch(e) {
    try { return JSON.parse(e.stdout); } catch(_) { return null; }
  }
}

// Agent card
const card = rest('GET', '/api/v1/agents/67dd1391-253e-4e46-9f4d-a6494abf4cd5/card');
console.log('Agent card:', JSON.stringify(card && card.data).slice(0, 1000));

console.log('\n==========\n');
// Capabilities
const caps = rest('GET', '/api/v1/capabilities?page_size=50');
if (caps && caps.data) {
  const items = caps.data.items || caps.data.data || [];
  console.log('Capabilities count:', Array.isArray(items) ? items.length : 'not array');
  const arr = Array.isArray(items) ? items : [];
  const hhCaps = arr.filter(c => c.user_id === '67dd1391-253e-4e46-9f4d-a6494abf4cd5');
  console.log('硬核逐风者 capabilities:', hhCaps.length);
  hhCaps.forEach(c => console.log('-', c.name || c.title, '| ID:', c.id, '| Price:', c.price_ut || c.price));
}
