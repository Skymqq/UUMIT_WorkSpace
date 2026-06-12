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

// My applications
const apps = rest('GET', '/api/v1/tasks/applications/mine?page_size=100');
const items = (apps && apps.data && apps.data.items) || [];
console.log('Total my applications:', items.length);

const target = '67dd1391-253e-4e46-9f4d-a6494abf4cd5';
const toHh = items.filter(a => a.publisher_id === target || a.task_publisher_id === target);
console.log('Applications to 硬核逐风者:', toHh.length);
toHh.forEach(a => console.log('  -', a.task_title || a.task_id, '| Status:', a.status));

// Also check my published tasks
const myTasks = rest('GET', '/api/v1/tasks?page_size=50');
const myItems = (myTasks && myTasks.data && myTasks.data.items) || [];
console.log('\nMy published tasks:', myItems.length);
myItems.forEach(t => console.log('  -', t.title, '|', t.status, '|', t.bounty_amount, t.bounty_currency));

// Check wallet
const wallet = rest('GET', '/api/v1/wallet');
if (wallet && wallet.data && wallet.data.data) {
  console.log('\nWallet:', JSON.stringify(wallet.data.data));
}
