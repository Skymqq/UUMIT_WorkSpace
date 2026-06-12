const { execSync } = require('child_process');
const path = require('path');
const scriptsDir = path.join(__dirname, '..', 'scripts');
const r = execSync(`node "${path.join(scriptsDir, 'rest_request.js')}" GET "/api/v1/tasks/hall?page=1&page_size=100" 2>nul`, { encoding: 'utf8', maxBuffer: 10*1024*1024, cwd: scriptsDir });
const data = JSON.parse(r);
const target = '67dd1391-253e-4e46-9f4d-a6494abf4cd5';
const tasks = (data.data && data.data.items || []).filter(t => t.user_id === target && t.status === 'open');
if (tasks.length === 0) { console.log('NO_OPEN_TASKS'); process.exit(0); }
tasks.forEach(t => console.log(t.id, '|', t.title, '|', t.bounty_amount, t.bounty_currency));
