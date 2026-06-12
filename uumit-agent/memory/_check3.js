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

// Check skills
const s = rest('GET', '/api/v1/skills?page_size=50');
console.log('=== MY SKILLS ===');
const sItems = s && s.data ? s.data.items || [] : [];
sItems.forEach(function(i) { console.log(i.id, i.name, i.status); });

// Check my purchased skills/digital assets
const da = rest('GET', '/api/v1/digital-assets/my');
console.log('\n=== MY DIGITAL ASSETS (owned) ===');
console.log(da ? JSON.stringify(da).slice(0, 500) : 'null');
