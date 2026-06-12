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

// Map orders to task titles via applications
const apps = rest('GET', '/api/v1/tasks/applications/mine?page_size=100');
const appItems = apps.data && apps.data.items || [];
const appByTaskId = {};
for (const a of appItems) {
  if (a.task_id && !appByTaskId[a.task_id]) {
    appByTaskId[a.task_id] = a;
  }
}

const orders = rest('GET', '/api/v1/orders?page_size=100');
const oItems = (orders.data && (orders.data.items || orders.data.data || [])) || [];
const pending = oItems.filter(o => o.status === 'pending_delivery');

console.log('=== Pending Delivery Orders (' + pending.length + ') ===\n');

for (const o of pending) {
  const app = appByTaskId[o.task_id];
  const title = (app && app.task_title) || o.task_id;
  console.log('Order:', o.id);
  console.log('TaskID:', o.task_id);
  console.log('Title:', title);
  console.log('---');
}
