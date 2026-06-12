#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { getProfileCredentials } = require('./auth_common');

const BASE_URL = 'https://api.uumit.com';
const SKILL_DIR = path.resolve(__dirname, '..');

function makeRequest(method, urlPath, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(BASE_URL + urlPath);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method,
      headers,
      timeout: timeoutMs || 30000,
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(raw) });
        } catch (e) {
          reject(new Error(`Invalid JSON: HTTP ${res.statusCode} body=${raw.slice(0,200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function authHeaders(profileName) {
  const creds = getProfileCredentials(profileName);
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Api-Key': creds.apiKey,
    'X-Platform-User-Id': creds.userId,
    'Idempotency-Key': crypto.randomUUID(),
  };
}

async function api(method, path, body, profile) {
  const res = await makeRequest(method, path, authHeaders(profile), body);
  if (res.statusCode === 422) throw new Error(`[${profile}] 422: params validation failed`);
  if (res.statusCode >= 500) throw new Error(`[${profile}] HTTP ${res.statusCode}: server error`);
  if (res.data && res.data.code !== 0) {
    throw new Error(`[${profile}] API ${res.data.code}: ${res.data.message}`);
  }
  return res.data ? res.data.data : null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function uploadFile(localPath, profileName) {
  const creds = getProfileCredentials(profileName);
  const env = { ...process.env, UUMIT_API_KEY: creds.apiKey, UUMIT_USER_ID: creds.userId };
  const result = execSync(`node "${path.join(SKILL_DIR, 'scripts', 'upload_file.js')}" "${localPath}"`, {
    env, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 20000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(result.trim());
  if (parsed.code !== 0) throw new Error(`[${profileName}] upload failed: ${parsed.message}`);
  return parsed.data;
}

function createDeliverableFile(content, fileName, profileName) {
  const tmpDir = path.join(SKILL_DIR, 'memory', 'tmp_workflow');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const localFile = path.join(tmpDir, fileName);
  fs.writeFileSync(localFile, content, 'utf-8');
  const uploaded = uploadFile(localFile, profileName);
  try { fs.unlinkSync(localFile); } catch (e) {}
  return uploaded.url;
}

const flows = [
  {
    publisher: '阿星',
    worker: '硬核逐风者',
    task: {
      title: 'Python数据处理脚本开发',
      description: '开发一个Python数据处理脚本，包括CSV文件读取、数据清洗、统计分析并生成可视化报告。',
      mode: 'online', billing_model: 'fixed_deadline',
      bounty_amount: '200', bounty_currency: 'UT', delivery_hours: 48,
    },
    workerSkillId: 'b1c26339-4954-4c73-b7e6-ae315994d6e8',
    deliverableFile: 'data_processing.py',
    deliverableContent: '#!/usr/bin/env python3\n# Data Processing Script\nimport pandas as pd\nimport matplotlib.pyplot as plt\n\ndf = pd.read_csv("input.csv")\ndf = df.drop_duplicates().dropna()\nprint("Cleaned data:", df.shape)\ndf.describe().to_csv("summary.csv")\nprint("Done")',
  },
  {
    publisher: '硬核逐风者',
    worker: '阿星',
    task: {
      title: 'Web应用自动化测试',
      description: '为Web应用编写自动化测试脚本，使用Selenium/Pytest框架覆盖核心业务流程和边界情况。',
      mode: 'online', billing_model: 'fixed_deadline',
      bounty_amount: '200', bounty_currency: 'UT', delivery_hours: 48,
    },
    workerSkillId: '224ad819-af11-4a53-8813-9520c4627ef7',
    deliverableFile: 'test_suite.py',
    deliverableContent: '#!/usr/bin/env python3\n# Automated Test Suite\nimport pytest\nfrom selenium import webdriver\n\ndef test_login():\n    driver = webdriver.Chrome()\n    driver.get("https://example.com/login")\n    assert "Login" in driver.title\n    driver.quit()\n\ndef test_checkout():\n    pass\n',
  },
  {
    publisher: '硬核逐风者',
    worker: '阿强',
    task: {
      title: '技术文档翻译与整理',
      description: '将英文API技术文档翻译为中文，并进行结构化整理，输出Markdown格式的中文文档。',
      mode: 'online', billing_model: 'fixed_deadline',
      bounty_amount: '100', bounty_currency: 'UT', delivery_hours: 48,
    },
    workerSkillId: '1c9ff94a-86c7-45fa-8a0e-96d3feb10471',
    deliverableFile: 'api_docs_zh.md',
    deliverableContent: '# API 技术文档（中文翻译）\n\n## 概述\n本文档翻译自英文原版 API 文档。\n\n## 认证\n使用 API Key 进行认证，在请求头中添加 `Authorization: Bearer <token>`。\n\n## 端点\n- `GET /api/v1/users` - 获取用户列表\n- `POST /api/v1/users` - 创建新用户',
  },
];

async function runFlow(f, idx) {
  console.log(`\n========== 流程 ${idx + 1}: ${f.publisher} → ${f.worker} ==========`);
  console.log(`任务: ${f.task.title} (${f.task.bounty_amount} ${f.task.bounty_currency})`);

  // Step 1: Publisher creates task
  console.log(`\n[1/6] ${f.publisher} 发布任务...`);
  const task = await api('POST', '/api/v1/tasks', f.task, f.publisher);
  const taskId = task.id;
  console.log(`  OK 任务ID: ${taskId}`);

  await sleep(1500);

  // Step 2: Worker applies
  console.log(`[2/6] ${f.worker} 申请任务...`);
  let appId;
  try {
    const appBody = { skill_id: f.workerSkillId, message: '可以按时高质量完成此任务。' };
    await api('POST', `/api/v1/tasks/${taskId}/applications`, appBody, f.worker);
    console.log(`  OK 申请已提交`);
  } catch (e) {
    if (e.message.includes('4001') || e.message.includes('已对该任务提交过申请')) {
      console.log(`  ~ 已申请过，继续处理`);
    } else {
      throw e;
    }
  }

  await sleep(1500);

  // Step 3: Publisher accepts the application
  console.log(`[3/6] ${f.publisher} 同意申请...`);
  let orderId;
  const apps = await api('GET', `/api/v1/tasks/${taskId}/applications`, null, f.publisher);
  const myApp = apps.find(a =>
    a.applicant_nickname === f.worker ||
    a.skill_id === f.workerSkillId
  );
  if (myApp) {
    appId = myApp.id;
    await api('POST', `/api/v1/tasks/${taskId}/applications/${appId}/accept`, null, f.publisher);
    console.log(`  OK 已同意申请`);
  } else {
    // Could not find app by name/skill — check if task already matched
    const t = await api('GET', `/api/v1/tasks/${taskId}`, null, f.publisher);
    if (t.status === 'matched' && t.matched_order_id) {
      orderId = t.matched_order_id;
      console.log(`  ~ 任务已匹配, 直接取订单ID`);
    } else if (apps.length > 0) {
      // Accept first pending app as fallback
      const fallback = apps.find(a => a.status === 'pending');
      if (fallback) {
        await api('POST', `/api/v1/tasks/${taskId}/applications/${fallback.id}/accept`, null, f.publisher);
        console.log(`  OK 已同意申请(备选)`);
      } else {
        throw new Error(`找不到 ${f.worker} 的申请, 且无可接受的申请`);
      }
    } else {
      throw new Error(`找不到 ${f.worker} 的申请`);
    }
  }

  if (!orderId) {
    await sleep(1500);
    const t = await api('GET', `/api/v1/tasks/${taskId}`, null, f.publisher);
    orderId = t.matched_order_id;
    if (!orderId) throw new Error('未生成订单ID');
  }
  console.log(`  OK 订单ID: ${orderId}`);

  // Step 4: Worker delivers (upload file + submit)
  console.log(`[4/6] ${f.worker} 交付任务...`);
  const fileUrl = createDeliverableFile(f.deliverableContent, f.deliverableFile, f.worker);
  const deliverable = {
    deliverables: [{ url: fileUrl, name: f.deliverableFile }],
    deliverable_type: 'digital',
  };
  try {
    await api('POST', `/api/v1/orders/${orderId}/deliverables`, deliverable, f.worker);
    console.log(`  OK 交付物已提交`);
  } catch (e) {
    if (e.message.includes('already') || e.message.includes('already_delivered')) {
      console.log(`  ~ 已交付过`);
    } else {
      throw e;
    }
  }

  await sleep(1500);

  // Step 5: Publisher confirms
  console.log(`[5/6] ${f.publisher} 确认收货...`);
  try {
    await api('POST', `/api/v1/orders/${orderId}/confirm`, {}, f.publisher);
    console.log(`  OK 已确认收货！`);
  } catch (e) {
    if (e.message.includes('4501') || e.message.includes('已被确认')) {
      console.log(`  ~ 已确认过`);
    } else {
      throw e;
    }
  }

  await sleep(1000);

  // Step 6: Publisher rates worker 5 stars
  console.log(`[6/6] ${f.publisher} 为 ${f.worker} 评分...`);
  try {
    await api('POST', `/api/v1/orders/${orderId}/rating`, { score: 5, comment: '五星好评' }, f.publisher);
    console.log(`  OK 五星好评已提交！`);
  } catch (e) {
    if (e.message.includes('already') || e.message.includes('has_rated')) {
      console.log(`  ~ 已评过分`);
    } else {
      throw e;
    }
  }

  return { taskId, orderId };
}

async function main() {
  console.log('========================================');
  console.log('跨账号任务自动化流程');
  console.log('账号: 阿强 | 阿星 | 硬核逐风者');
  console.log('========================================');

  const results = [];
  for (let i = 0; i < flows.length; i++) {
    const r = await runFlow(flows[i], i);
    results.push(r);
  }

  console.log(`\n========== 全部完成 ==========`);
  for (let i = 0; i < results.length; i++) {
    const f = flows[i];
    console.log(`${f.publisher}→${f.worker}: 任务 ${results[i].taskId} | 订单 ${results[i].orderId}`);
  }
}

main().catch(err => {
  console.error(`\n错误: ${err.message}`);
  process.exit(1);
});
