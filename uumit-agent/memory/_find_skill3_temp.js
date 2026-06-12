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

// Search marketplace with keyword
const mp = rest('GET', '/api/v1/digital-assets/market/list?page_size=100');
if (mp && mp.data) {
  const items = mp.data.items || [];
  const mcp = items.filter(i => (i.title || '').toLowerCase().includes('mcp'));
  console.log('MCP related marketplace items:', mcp.length);
  mcp.forEach(i => console.log('-', i.title, '|', i.price_ut, 'UT | seller:', i.seller_id));
}

console.log('\n---\n');

// Check data marketplace
const dmp = rest('GET', '/api/v1/data-marketplace?page_size=100');
if (dmp && dmp.data) {
  const items = dmp.data.items || dmp.data.data || [];
  const arr = Array.isArray(items) ? items : [];
  const mcpItems = arr.filter(i => (i.name || i.title || '').toLowerCase().includes('mcp'));
  console.log('Data marketplace MCP items:', mcpItems.length);
  mcpItems.forEach(i => console.log('-', i.name || i.title, '|', i.price_ut, 'UT'));
}

console.log('\n---\n');

// Check demands
const demands = rest('GET', '/api/v1/demands?page_size=50');
console.log('Demands:', JSON.stringify(demands && demands.data).slice(0, 500));
