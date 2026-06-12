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

const card = rest('GET', '/api/v1/agents/67dd1391-253e-4e46-9f4d-a6494abf4cd5/card');
const skills = card && card.data && card.data.skills || [];
console.log('Skills from 硬核逐风者:', skills.length);
skills.forEach(s => {
  console.log('ID:', s.id);
  console.log('Name:', s.name);
  console.log('Price:', s.pricing && s.pricing.price_ut, 'UT');
  console.log('Model:', s.pricing && s.pricing.model);
  console.log('---');
});
