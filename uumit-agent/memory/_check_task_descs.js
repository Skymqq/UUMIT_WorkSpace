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

// Get orders
const orders = rest('GET', '/api/v1/orders?page_size=50');
const oItems = orders.data && (orders.data.items || orders.data.data || []);
const pending = oItems.filter(o => o.status === 'pending_delivery');
console.log('Pending delivery orders:', pending.length);

// Check first 5 task details
const targetUser = '67dd1391-253e-4e46-9f4d-a6494abf4cd5';

// Get hall info
const hall = rest('GET', '/api/v1/tasks/hall?page=1&page_size=100');
const hallItems = (hall.data && hall.data.data && hall.data.data.items || []);
const tasksFromHh = hallItems.filter(t => t.user_id === targetUser && t.status === 'open');
console.log('Currently open from 硬核逐风者:', tasksFromHh.length);

// Get pending orders task IDs
for (const o of pending.slice(0, 5)) {
  // Try to get task detail from hall
  const task = hallItems.find(t => t.id === o.task_id);
  if (task) {
    console.log('\nOrder:', o.id);
    console.log('Task:', task.title);
    console.log('Desc:', (task.description || '').slice(0, 150));
    console.log('Category:', task.category);
    console.log('Tags:', JSON.stringify(task.tags));
  } else {
    // Fetch directly
    const td = rest('GET', `/api/v1/tasks/${o.task_id}`);
    const tData = td && td.data && td.data.data;
    if (tData) {
      console.log('\nOrder:', o.id);
      console.log('Task:', tData.title);
      console.log('Desc:', (tData.description || '').slice(0, 150));
      console.log('Category:', tData.category);
    }
  }
}
