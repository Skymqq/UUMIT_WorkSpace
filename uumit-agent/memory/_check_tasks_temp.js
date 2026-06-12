const { execSync } = require('child_process');
const path = require('path');
const scriptsDir = __dirname.replace(/\\memory$/, '\\scripts');
const targetId = '67dd1391-253e-4e46-9f4d-a6494abf4cd5';
let found = [];

for (let page = 1; page <= 5; page++) {
  try {
    const result = execSync(`node "${path.join(scriptsDir, 'rest_request.js')}" GET "/api/v1/tasks/hall?page=${page}&page_size=100" 2>nul`, {
      cwd: scriptsDir,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    const data = JSON.parse(result);
    const items = (data.data && data.data.items || []).filter(i => i.user_id === targetId);
    found = found.concat(items);
    if (!data.data || !data.data.has_more) break;
  } catch(e) { break; }
}

console.log('Total:', found.length, 'tasks from 硬核逐风者');
const open = found.filter(i => i.status === 'open');
console.log('Open tasks:', open.length);
open.forEach(i => console.log('- ID:', i.id, '| Title:', i.title, '| Bounty:', i.bounty_amount, i.bounty_currency, '| Status:', i.status));
const completed = found.filter(i => i.status === 'completed');
console.log('Completed tasks:', completed.length);
