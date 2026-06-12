const { execSync } = require('child_process');
const path = require('path');
const SCRIPTS = path.join(__dirname, '..', 'scripts');
function rest(m, u) {
  try {
    const r = execSync('node "' + path.join(SCRIPTS, 'rest_request.js') + '" ' + m + ' "' + u + '"', { encoding: 'utf8', timeout: 30000 });
    return JSON.parse(r);
  } catch(e) {
    try { return JSON.parse(e.stdout); } catch(_) { return null; }
  }
}

// Check skill packs
console.log('=== SKILL PACKS ===');
const sp = rest('GET', '/api/v1/skill-pack?page_size=50');
const spItems = sp && sp.data ? sp.data.items || sp.data.data || [] : [];
console.log('Count:', Array.isArray(spItems) ? spItems.length : 'not array');
if (Array.isArray(spItems)) {
  spItems.forEach(function(i) { console.log(i.id, i.name, i.price_ut || i.price, i.status); });
}

// Check marketplace search for MCP
console.log('\n=== MARKETPLACE SEARCH MCP ===');
const ms = rest('GET', '/api/v1/marketplace/search?q=MCP');
console.log(JSON.stringify(ms).slice(0, 800));

// Check purchases/digital-assets market
console.log('\n=== DIGITAL ASSETS MARKET ===');
const da = rest('GET', '/api/v1/digital-assets/market/list');
console.log(JSON.stringify(da).slice(0, 800));
