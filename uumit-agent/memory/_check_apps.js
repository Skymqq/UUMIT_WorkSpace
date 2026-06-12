const { execSync } = require('child_process');
const path = require('path');
const scriptsDir = path.join(__dirname, '..', 'scripts');

// Check my applications
const r = execSync(`node "${path.join(scriptsDir, 'rest_request.js')}" GET "/api/v1/tasks/applications/mine?page_size=50" 2>nul`, { encoding: 'utf8', maxBuffer: 10*1024*1024, cwd: scriptsDir });
const data = JSON.parse(r);
const apps = data.data && data.data.items || [];
const targetUser = '67dd1391-253e-4e46-9f4d-a6494abf4cd5';
const relevant = apps.filter(a => a.publisher_id === targetUser);
console.log('My applications to 硬核逐风者 tasks:', relevant.length);
relevant.forEach(a => console.log('- Task:', a.task_title || a.task_id, '| Status:', a.status, '| id:', a.id));

console.log('\n---\n');

// Check open tasks still needing apply
const r2 = execSync(`node "${path.join(scriptsDir, 'rest_request.js')}" GET "/api/v1/tasks/hall?page=1&page_size=100" 2>nul`, { encoding: 'utf8', maxBuffer: 10*1024*1024, cwd: scriptsDir });
const d2 = JSON.parse(r2);
const openTasks = (d2.data && d2.data.items || []).filter(t => t.user_id === targetUser && t.status === 'open');
const appliedIds = new Set(relevant.map(a => a.task_id));
const needApply = openTasks.filter(t => !appliedIds.has(t.id));
console.log('Open tasks not yet applied:', needApply.length);
needApply.forEach(t => console.log('-', t.title, '-', t.id, '-', t.category));
