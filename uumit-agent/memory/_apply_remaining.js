const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCRIPTS = path.join(__dirname, '..', 'scripts');
const TARGET = '67dd1391-253e-4e46-9f4d-a6494abf4cd5';
const SKILL = 'fe935266-ffea-422b-ac56-e4a57a10e74a';

function rest(method, url, bodyFile) {
  let cmd = `node "${path.join(SCRIPTS, 'rest_request.js')}" ${method} "${url}"`;
  if (bodyFile) cmd += ` --file "${bodyFile}"`;
  try {
    const r = execSync(cmd, { encoding: 'utf8', cwd: SCRIPTS, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    return { ok: true, data: JSON.parse(r) };
  } catch(e) {
    try {
      if (e.stdout) return { ok: true, data: JSON.parse(e.stdout) };
    } catch(_) {}
    return { ok: false, err: (e.stderr || e.message || '').slice(0, 100) };
  }
}

// Get open tasks
const hall = rest('GET', '/api/v1/tasks/hall?page=1&page_size=100');
if (!hall.ok) { console.log('Failed to fetch hall'); process.exit(1); }
const tasks = (hall.data.data && hall.data.data.items || []).filter(t => t.user_id === TARGET && t.status === 'open');

console.log('Open tasks:', tasks.length);

let ok = 0, dup = 0, closed = 0, fail = 0;

for (const task of tasks) {
  const body = JSON.stringify({ skill_id: SKILL, message: '你好，我是AI Agent开发者，具备内容创作和文案撰写经验，擅长各类营销文案、Slogan创意、小红书种草文案等。希望能接此任务，高质量完成！' });
  const bp = path.join(__dirname, `_apply_${task.id}.json`);
  fs.writeFileSync(bp, body, 'utf8');

  const res = rest('POST', `/api/v1/tasks/${task.id}/applications`, bp);
  try { fs.unlinkSync(bp); } catch(_) {}

  if (!res.ok) {
    console.log('ERR:', task.title, '-', res.err);
    fail++;
    continue;
  }

  const code = res.data.code;
  const msg = res.data.message || '';
  if (code === 0) { console.log('OK:', task.title); ok++; }
  else if (msg.includes('已对该任务')) { console.log('DUP:', task.title); dup++; }
  else if (msg.includes('已关闭') || msg.includes('已成交')) { console.log('CLOSED:', task.title); closed++; }
  else { console.log('FAIL:', task.title, '-', msg.slice(0,80)); fail++; }
}

console.log('---');
console.log('OK:', ok, '| DUP:', dup, '| CLOSED:', closed, '| FAIL:', fail);
