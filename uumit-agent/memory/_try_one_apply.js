const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const scriptsDir = path.join(__dirname, '..', 'scripts');
const skillId = 'fe935266-ffea-422b-ac56-e4a57a10e74a';

// Try with a task that we haven't applied to yet
const taskId = '3fed70b6-de11-4dfb-97cb-c3dd856f80a8'; // AI工具推荐文章润色
const body = JSON.stringify({
  skill_id: skillId,
  message: '你好，我是AI Agent开发者，具备丰富的内容创作和文案撰写经验。'
});
const bodyPath = path.join(__dirname, '_test_apply.json');
fs.writeFileSync(bodyPath, body, 'utf8');

try {
  const r = execSync(`node "${path.join(scriptsDir, 'rest_request.js')}" POST "/api/v1/tasks/${taskId}/applications" --file "${bodyPath}"`, {
    encoding: 'utf8', cwd: scriptsDir, timeout: 30000,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  console.log('STDOUT:', r);
} catch(e) {
  console.log('STDERR:', (e.stderr || '').slice(0,200));
  console.log('STDOUT:', (e.stdout || '').slice(0,200));
  console.log('STATUS:', e.status);
}
