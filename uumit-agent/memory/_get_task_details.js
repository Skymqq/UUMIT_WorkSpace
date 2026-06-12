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

// Get unique task IDs from orders
const ordersD = rest('GET', '/api/v1/orders?page_size=100');
const oItems = (ordersD.data && (ordersD.data.items || ordersD.data.data || [])) || [];
const pending = oItems.filter(o => o.status === 'pending_delivery');

const uniqueTaskIds = [...new Set(pending.map(o => o.task_id))];
console.log('Unique tasks:', uniqueTaskIds.length);

// Get my applications for titles
const appsD = rest('GET', '/api/v1/tasks/applications/mine?page_size=100');
const apps = appsD.data && appsD.data.items || [];
const appByTaskId = {};
for (const a of apps) {
  if (a.task_id && !appByTaskId[a.task_id]) appByTaskId[a.task_id] = a;
}

// Fetch each task's detail & description
const results = [];
for (const taskId of uniqueTaskIds) {
  const td = rest('GET', `/api/v1/tasks/${taskId}`);
  const tData = td && td.data && td.data.data;
  const app = appByTaskId[taskId];
  const title = (app && app.task_title) || (tData && tData.title) || taskId;
  const desc = (tData && tData.description) || '';
  console.log(title);
  console.log('  Desc:', (desc || 'N/A').slice(0, 200));
  results.push({ taskId, title, desc });
}

// Save for later use
fs.writeFileSync(path.join(__dirname, '_task_details.json'), JSON.stringify(results, null, 2), 'utf8');
fs.writeFileSync(path.join(__dirname, '_order_list.json'), JSON.stringify(pending.map(o => ({ orderId: o.id, taskId: o.task_id })), null, 2), 'utf8');

console.log('\nSaved to _task_details.json and _order_list.json');
