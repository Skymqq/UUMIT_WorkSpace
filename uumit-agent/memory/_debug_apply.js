const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const scriptsDir = path.join(__dirname, '..', 'scripts');
const body = { message: '我是AI Agent开发者，熟悉Python/AI Prompt/MCP Server，擅长文案撰写，有信心完成此任务。' };
const bodyPath = path.join(__dirname, '_apply_body.json');
fs.writeFileSync(bodyPath, JSON.stringify(body), 'utf8');

const taskId = '96c957d0-26bb-4b8f-8f3f-e1e3250f1997';
const bin = `"${path.join(scriptsDir, 'rest_request.js')}"`;

try {
  const r = execSync(`node ${bin} POST "/api/v1/tasks/${taskId}/applications" --file "${bodyPath}"`, { encoding: 'utf8', cwd: scriptsDir, stdio: ['pipe', 'pipe', 'pipe'] });
  console.log('STDOUT:', r);
} catch(e) {
  console.log('STDERR:', e.stderr || '');
  console.log('STDOUT:', e.stdout || '');
  console.log('MSG:', e.message);
}
