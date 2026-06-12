/**
 * Poll for new open tasks from 硬核逐风者 and auto-apply
 */
const { execSync } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');
const TARGET_USER_ID = '67dd1391-253e-4e46-9f4d-a6494abf4cd5';
const POLL_INTERVAL_MS = 15000;
const MAX_POLLS = 120; // 30 minutes max
const SEEN_FILE = path.join(__dirname, '_seen_tasks.json');

let seen = new Set();
try { seen = new Set(JSON.parse(require('fs').readFileSync(SEEN_FILE, 'utf8'))); } catch (_) {}

function runRest(method, urlPath, bodyFile) {
  let cmd = `node "${path.join(SCRIPTS_DIR, 'rest_request.js')}" ${method} "${urlPath}"`;
  if (bodyFile) cmd += ` --file "${bodyFile}"`;
  const r = execSync(cmd + ' 2>nul', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, cwd: SCRIPTS_DIR });
  return JSON.parse(r);
}

function applyForTask(taskId, taskTitle) {
  const sessionDir = path.join(__dirname, 'sessions', `apply-${taskId}`);
  require('fs').mkdirSync(sessionDir, { recursive: true });
  const bodyPath = path.join(sessionDir, 'request-task.json');
  const body = JSON.stringify({ message: `我是 Agent 开发者，擅长 Python/AI Prompt/MCP Server 开发，技能匹配此任务，希望接单完成。` });
  require('fs').writeFileSync(bodyPath, body, 'utf8');
  try {
    const res = runRest('POST', `/api/v1/tasks/${taskId}/applications`, bodyPath);
    if (res && res.code === 0) {
      console.log('APPLY_SUCCESS', taskId, taskTitle);
    } else {
      console.log('APPLY_FAIL', taskId, taskTitle, JSON.stringify(res));
    }
  } catch (e) {
    console.log('APPLY_ERROR', taskId, taskTitle, e.message);
  }
}

console.log('Starting poll for tasks from 硬核逐风者 (user:', TARGET_USER_ID, ')');

for (let i = 0; i < MAX_POLLS; i++) {
  try {
    const data = runRest('GET', '/api/v1/tasks/hall?page=1&page_size=100');
    const items = (data.data && data.data.items || []).filter(t => t.user_id === TARGET_USER_ID && t.status === 'open');
    for (const task of items) {
      if (!seen.has(task.id)) {
        seen.add(task.id);
        console.log('NEW_TASK_FOUND', task.id, task.title, task.bounty_amount, task.bounty_currency);
        applyForTask(task.id, task.title);
      }
    }
    require('fs').writeFileSync(SEEN_FILE, JSON.stringify([...seen]), 'utf8');
  } catch (e) {
    // ignore poll errors
  }
  if (i % 12 === 0) console.log('Poll', i+1, '- still watching...');
  require('child_process').execSync(`timeout /t ${Math.ceil(POLL_INTERVAL_MS / 1000)} /nobreak >nul 2>nul`);
}

console.log('Polling ended after', MAX_POLLS, 'polls');
