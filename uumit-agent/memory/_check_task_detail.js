const { execSync } = require('child_process');
const path = require('path');
const scriptsDir = path.join(__dirname, '..', 'scripts');

// Check first open task's detail
const r = execSync(`node "${path.join(scriptsDir, 'rest_request.js')}" GET "/api/v1/tasks/hall?page=1&page_size=100" 2>nul`, { encoding: 'utf8', maxBuffer: 10*1024*1024, cwd: scriptsDir });
const data = JSON.parse(r);
const tasks = (data.data && data.data.items || []).filter(t => t.user_id === '67dd1391-253e-4e46-9f4d-a6494abf4cd5' && t.status === 'open');

for (const t of tasks.slice(0, 3)) {
  console.log('Task:', t.title);
  console.log('ID:', t.id);
  console.log('category:', t.category);
  console.log('matched_skill_id:', t.matched_skill_id);
  console.log('tags:', JSON.stringify(t.tags));
  console.log('---');
}

// Check my skills
const s = execSync(`node "${path.join(scriptsDir, 'rest_request.js')}" GET "/api/v1/skills" 2>nul`, { encoding: 'utf8', maxBuffer: 10*1024*1024, cwd: scriptsDir });
const sd = JSON.parse(s);
console.log('My skills:', JSON.stringify(sd.data && sd.data.items ? sd.data.items.map(i => ({id: i.id, name: i.name})) : sd.data));
