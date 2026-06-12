const { execSync } = require('child_process');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');
const TASK_ID = '12e0b413-e1d8-4c44-8fed-f46a9dd8d7a0';
const HH_USER_ID = '67dd1391-253e-4e46-9f4d-a6494abf4cd5';
const MAX_POLLS = 60;
const POLL_INTERVAL_MS = 10000;

function run(cmd) {
  try {
    const out = execSync(cmd, { cwd: SKILL_DIR, encoding: 'utf8', timeout: 15000 });
    return JSON.parse(out);
  } catch (e) {
    console.error('Command failed:', cmd, e.message);
    return null;
  }
}

async function poll() {
  for (let i = 1; i <= MAX_POLLS; i++) {
    const result = run(`node scripts/rest_request.js GET /api/v1/tasks/${TASK_ID}`);
    if (result && result.data) {
      if (result.data.my_applications && result.data.my_applications.length > 0) {
        for (const app of result.data.my_applications) {
          if (app.applicant_id === HH_USER_ID || (app.applicant_nickname && app.applicant_nickname.includes('逐风'))) {
            console.log(`=== 发现硬核逐风者申请！===\nApplication ID: ${app.id}\nNickname: ${app.applicant_nickname}\nMessage: ${app.message || '(无)'}`);
            const accResult = run(`node scripts/rest_request.js POST /api/v1/tasks/${TASK_ID}/applications/${app.id}/accept --idempotency-key accept-hhzfz-${TASK_ID}`);
            if (accResult && accResult.code === 0) {
              console.log('=== 已成功同意申请！ ===');
            } else {
              console.log('=== 同意申请失败 ===', JSON.stringify(accResult));
            }
            process.exit(0);
          }
        }
      }
    }
    console.log(`[${i}/${MAX_POLLS}] 暂未收到硬核逐风者的申请，${POLL_INTERVAL_MS/1000}秒后重试...`);
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  console.log(`=== 轮询结束（${MAX_POLLS}次），硬核逐风者尚未申请 ===`);
  process.exit(1);
}

poll().catch(e => { console.error(e); process.exit(1); });
