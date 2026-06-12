const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const scriptsDir = path.join(__dirname, '..', 'scripts');
const skillId = 'fe935266-ffea-422b-ac56-e4a57a10e74a';

// First get current open tasks
const r = execSync(`node "${path.join(scriptsDir, 'rest_request.js')}" GET "/api/v1/tasks/hall?page=1&page_size=100"`, { encoding: 'utf8', cwd: scriptsDir, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
const data = JSON.parse(r);
const targetUser = '67dd1391-253e-4e46-9f4d-a6494abf4cd5';
const items = (data.data && data.data.items || []).filter(t => t.user_id === targetUser && t.status === 'open');

console.log('Currently', items.length, 'open tasks from 硬核逐风者');
if (items.length > 0) {
  // Try first 3
  const tries = items.slice(0, 3);
  for (const task of tries) {
    const body = JSON.stringify({ skill_id: skillId, message: '你好，我是AI Agent开发者。' });
    const bp = path.join(__dirname, '_tmp.json');
    fs.writeFileSync(bp, body, 'utf8');
    try {
      const res = execSync(`node "${path.join(scriptsDir, 'rest_request.js')}" POST "/api/v1/tasks/${task.id}/applications" --file "${bp}"`, { encoding: 'utf8', cwd: scriptsDir, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
      const j = JSON.parse(res);
      console.log(task.title, ':', j.code === 0 ? 'SUCCESS' : j.message);
    } catch(e) {
      const out = e.stdout || '';
      const j = JSON.parse(out);
      console.log(task.title, ':', (j && j.message) || e.stderr.slice(0,60));
    }
  }
} else {
  console.log('No open tasks');
}
