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

// Search skill hall
const skills = rest('GET', '/api/v1/skills/hall?page_size=50');
console.log('Skills Hall:', JSON.stringify(skills && skills.data).slice(0, 500));

// Also check marketplace for digital assets
const mp = rest('GET', '/api/v1/digital-assets/market/list?page_size=50');
console.log('\nMarketplace:', JSON.stringify(mp && mp.data).slice(0, 500));

// Search for MCP related
const search = rest('GET', '/api/v1/marketplace/search?keyword=MCP+Server');
console.log('\nSearch:', JSON.stringify(search && search.data).slice(0, 500));
