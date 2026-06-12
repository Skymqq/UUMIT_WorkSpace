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

console.log('=== Orders ===');
const orders = rest('GET', '/api/v1/orders?page_size=50');
if (orders && orders.data) {
  const items = orders.data.items || orders.data.data || [];
  const arr = Array.isArray(items) ? items : (items.items || []);
  console.log('Orders count:', arr.length);
  arr.forEach(o => {
    console.log('ID:', o.id, '| Task:', o.task_id || o.task_title, '| Status:', o.status, '| Amount:', o.amount || o.bounty_amount, '| Publisher:', o.publisher_id || o.task_owner_id);
  });
} else {
  console.log('Orders response:', JSON.stringify(orders).slice(0, 300));
}

console.log('\n=== My applications (pending/active) ===');
const apps = rest('GET', '/api/v1/tasks/applications/mine?page_size=100');
if (apps && apps.data) {
  const items = apps.data.items || [];
  const pending = items.filter(a => a.status === 'accepted' || a.status === 'confirmed');
  console.log('Accepted/confirmed count:', pending.length);
  pending.slice(0, 10).forEach(a => {
    console.log('Task:', a.task_title, '| Status:', a.status, '| TaskID:', a.task_id, '| AppID:', a.id, '| Owner:', a.task_owner_id);
  });
}
