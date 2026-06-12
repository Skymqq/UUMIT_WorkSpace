const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const scriptsDir = path.join(__dirname, '..', 'scripts');
const targetUser = '67dd1391-253e-4e46-9f4d-a6494abf4cd5';
const sessionBase = path.join(__dirname, 'sessions');

// Fetch open tasks
const r = execSync(`node "${path.join(scriptsDir, 'rest_request.js')}" GET "/api/v1/tasks/hall?page=1&page_size=100" 2>nul`, { encoding: 'utf8', maxBuffer: 10*1024*1024, cwd: scriptsDir });
const data = JSON.parse(r);
const tasks = (data.data && data.data.items || []).filter(t => t.user_id === targetUser && t.status === 'open');

console.log('Found', tasks.length, 'open tasks from 硬核逐风者');

let success = 0, fail = 0;

for (const task of tasks) {
  const sessionDir = path.join(sessionBase, `apply-${task.id}`);
  try { fs.mkdirSync(sessionDir, { recursive: true }); } catch (_) {}
  
  const body = { message: '我是AI Agent开发者，熟悉Python、AI Prompt工程和MCP Server开发，擅长文案撰写和内容优化，有信心高质量完成此任务。' };
  const bodyPath = path.join(sessionDir, 'request-task.json');
  fs.writeFileSync(bodyPath, JSON.stringify(body), 'utf8');

  try {
    const resRaw = execSync(`node "${path.join(scriptsDir, 'rest_request.js')}" POST "/api/v1/tasks/${task.id}/applications" --file "${bodyPath}" 2>nul`, { encoding: 'utf8', maxBuffer: 10*1024*1024, cwd: scriptsDir });
    const res = JSON.parse(resRaw);
    if (res && (res.code === 0 || res.code === undefined)) {
      console.log('OK:', task.title, '-', task.id);
      success++;
    } else {
      console.log('FAIL:', task.title, '-', task.id, '-', JSON.stringify(res));
      fail++;
    }
  } catch(e) {
    console.log('ERROR:', task.title, '-', task.id, '-', e.message.slice(0, 100));
    fail++;
  }
}

console.log('---');
console.log('Total:', tasks.length, '| Success:', success, '| Fail:', fail);
