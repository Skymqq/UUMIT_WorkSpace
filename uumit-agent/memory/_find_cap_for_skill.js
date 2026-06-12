const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const SCRIPTS = path.join(__dirname, '..', 'scripts');

function rest(method, url) {
  try {
    const r = execSync(`node "${path.join(SCRIPTS, 'rest_request.js')}" ${method} "${url}"`, { encoding: 'utf8', cwd: SCRIPTS, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(r);
  } catch(e) {
    try { return JSON.parse(e.stdout); } catch(_) { return null; }
  }
}

// Check capabilities for this agent
// The skill ID on the agent card might map to a capability
const skillId = '7e528635-2823-4b30-8355-9e97c1507831';

// Check all capabilities
const caps = rest('GET', '/api/v1/capabilities?page_size=100');
console.log('Capabilities response:', JSON.stringify(caps && caps.data).slice(0, 500));

// Check skill-pack
const sp = rest('GET', '/api/v1/skill-pack');
console.log('\nSkill pack:', JSON.stringify(sp && sp.data).slice(0, 500));

// Check negotiation
const neg = rest('GET', '/api/v1/negotiation/sessions');
console.log('\nNegotiation:', JSON.stringify(neg && neg.data).slice(0, 500));
