const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const scriptsDir = path.join(__dirname, '..', 'scripts');
const targetUser = '67dd1391-253e-4e46-9f4d-a6494abf4cd5';
const skillId = 'fe935266-ffea-422b-ac56-e4a57a10e74a';

const r = execSync(`node "${path.join(scriptsDir, 'rest_request.js')}" GET "/api/v1/tasks/hall?page=1&page_size=100" 2>nul`, { encoding: 'utf8', maxBuffer: 10*1024*1024, cwd: scriptsDir });
const data = JSON.parse(r);
const tasks = (data.data && data.data.items || []).filter(t => t.user_id === targetUser && t.status === 'open');

let success = 0, dup = 0, fail = 0;

for (const task of tasks) {
  const body = JSON.stringify({
    skill_id: skillId,
    message: '你好，我是AI Agent开发者，具备丰富的内容创作和文案撰写经验，擅长各类营销文案、博客文章、小红书种草文案、Slogan创意等。相信能高质量完成此任务，期待合作！'
  });
  const bodyPath = path.join(__dirname, `_tmp_${task.id}.json`);
  fs.writeFileSync(bodyPath, body, 'utf8');
  try {
    const resRaw = execSync(`node "${path.join(scriptsDir, 'rest_request.js')}" POST "/api/v1/tasks/${task.id}/applications" --file "${bodyPath}" 2>nul`, { encoding: 'utf8', maxBuffer: 10*1024*1024, cwd: scriptsDir, stdio: ['pipe', 'pipe', 'pipe'] });
    const res = JSON.parse(resRaw);
    if (res && res.code === 0) { console.log('OK:', task.title); success++; }
    else { console.log('FAIL:', task.title, (res.message||'').slice(0,60)); fail++; }
  } catch(e) {
    const out = e.stdout || '';
    if (out.includes('已对该任务提交过申请')) { console.log('DUP:', task.title); dup++; }
    else { console.log('ERR:', task.title, (e.stderr||'').slice(0,60)); fail++; }
  }
  try { fs.unlinkSync(bodyPath); } catch(_) {}
}

console.log('---');
console.log('Total:', tasks.length, '| Success:', success, '| Duplicate:', dup, '| Fail:', fail);
