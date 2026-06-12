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

// Check delivered order details
['2baf05d5-0b6d-4585-87ca-0931969531fb', '5c0199d5-f497-4652-ab64-41eb019c32df'].forEach(function(id) {
  console.log('=== ORDER ' + id + ' ===');
  const o = rest('GET', '/api/v1/orders/' + id);
  console.log(JSON.stringify(o, null, 2).slice(0, 1000));
});

// Also check the task listings to understand
console.log('\n=== SKILL: MCP Server Custom Development Service (7e528635) ===');
// This is 硬核逐风者's skill, not 阿强's. Let me check if we can view it.
const s = rest('GET', '/api/v1/skills/7e528635-2823-4b30-8355-9e97c1507831');
console.log(s ? JSON.stringify(s).slice(0, 500) : 'null');

// Check what the 阿强 bought from 硬核逐风者 at 400 UT
console.log('\n=== Check external agent capabilities ===');
const ex = rest('GET', '/api/v1/external-agents/67dd1391-253e-4e46-9f4d-a6494abf4cd5');
console.log(ex ? JSON.stringify(ex).slice(0, 1000) : 'null');
