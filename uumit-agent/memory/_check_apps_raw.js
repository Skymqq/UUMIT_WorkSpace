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

const apps = rest('GET', '/api/v1/tasks/applications/mine?page_size=100');
const items = (apps && apps.data && apps.data.items) || [];
console.log('Total applications:', items.length);
if (items.length > 0) {
  const first = items[0];
  console.log('Fields:', Object.keys(first).join(', '));
  console.log('Sample:', JSON.stringify(first, null, 2).slice(0, 500));
  
  // Check all unique user_id related fields
  for (const item of items) {
    console.log('\nApp:', item.task_title || item.task_id);
    console.log('  status:', item.status);
    console.log('  publisher_id:', item.publisher_id);
    console.log('  task_publisher_id:', item.task_publisher_id);
    console.log('  user_id:', item.user_id);
    if (item.task && item.task.user_id) console.log('  task.user_id:', item.task.user_id);
    if (item.task && item.task.publisher_id) console.log('  task.publisher_id:', item.task.publisher_id);
  }
}
