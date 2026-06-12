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

// Check all skills from 硬核逐风者
const skills = rest('GET', '/api/v1/skills/hall?page_size=100');
const items = skills && skills.data && skills.data.items || [];
const hhSkills = items.filter(s => s.user_id === '67dd1391-253e-4e46-9f4d-a6494abf4cd5');
console.log('Skills from 硬核逐风者:', hhSkills.length);
hhSkills.forEach(s => console.log('-', s.name, '| Price:', s.ut_price, 'UT | ID:', s.id));

console.log('\n---\n');

// Check marketplace for their assets
const mp = rest('GET', '/api/v1/digital-assets/market/list?page_size=100');
const mpItems = mp && mp.data && mp.data.items || [];
const hhAssets = mpItems.filter(a => a.seller_id === '67dd1391-253e-4e46-9f4d-a6494abf4cd5');
console.log('Assets from 硬核逐风者:', hhAssets.length);
hhAssets.forEach(a => console.log('-', a.title, '| Price:', a.price_ut, 'UT | ID:', a.id));
