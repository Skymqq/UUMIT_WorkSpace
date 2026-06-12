#!/usr/bin/env node
/**
 * UUMit 一键赚钱自动化脚本
 *
 * 整合：扫描任务 → 技能匹配 → 自动申请 → 交付跟踪 → 钱包对账
 * 用法：node uumit_earn.js [--dry-run] [--scan-only] [--apply-only] [--status]
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SKILL_DIR = path.resolve(__dirname, '..');
const AUTH_FILE = path.join(SKILL_DIR, 'memory', 'uumit-auth.json');
const STATE_FILE = path.join(SKILL_DIR, 'memory', 'runtime', 'earn-state.json');
const LOG_DIR = path.join(SKILL_DIR, 'memory', 'runtime', 'logs');

function log(msg) { console.error(`[earn] ${msg}`); }
function result(obj) { console.log(JSON.stringify(obj, null, 2)); }

function loadAuth() {
  const auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
  const profile = auth.profiles[auth.current] || auth.profiles['硬核逐风者'];
  return {
    apiKey: profile.cached_api_key,
    userId: profile.cached_user_id,
    name: auth.current,
  };
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch { return { applied_tasks: [], delivered_orders: [], last_scan: null }; }
}

function saveState(state) {
  if (!fs.existsSync(path.dirname(STATE_FILE))) fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function makeRequest(method, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(urlPath.startsWith('http') ? urlPath : `https://api.uumit.com${urlPath}`);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method,
      headers,
      timeout: 30000,
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        try { resolve({ statusCode: res.statusCode, data: JSON.parse(raw) }); }
        catch (e) { reject(new Error(`Invalid JSON: HTTP ${res.statusCode}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function authHeaders(creds) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Api-Key': creds.apiKey,
    'X-Platform-User-Id': creds.userId,
    'Idempotency-Key': crypto.randomUUID(),
  };
}

async function api(method, urlPath, body, creds) {
  const res = await makeRequest(method, urlPath, authHeaders(creds), body);
  if (res.statusCode === 422) throw new Error(`422: ${JSON.stringify(res.data)}`);
  if (res.statusCode >= 500) throw new Error(`HTTP ${res.statusCode}`);
  if (res.data && res.data.code !== 0) throw new Error(`API ${res.data.code}: ${res.data.message}`);
  return res.data ? res.data.data : null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// === Core Functions ===

async function getWallet(creds) {
  const data = await api('GET', '/api/v1/wallet', null, creds);
  return data.ut;
}

async function getMySkills(creds) {
  const data = await api('GET', '/api/v1/skills?page_size=50', null, creds);
  return data.items || [];
}

async function scanTaskHall(creds, keywords) {
  const allTasks = [];
  for (const kw of keywords) {
    try {
      const data = await api('GET', `/api/v1/tasks/hall?keyword=${encodeURIComponent(kw)}&page_size=10&status=open`, null, creds);
      if (data && data.items) allTasks.push(...data.items);
    } catch (e) { log(`Scan error for "${kw}": ${e.message}`); }
  }
  // Dedupe by task_id
  const seen = new Set();
  return allTasks.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
}

function matchSkills(tasks, skills) {
  const skillNames = skills.map(s => s.name.toLowerCase());
  const skillTags = skills.flatMap(s => (s.tags || []).map(t => t.toLowerCase()));
  return tasks.map(t => {
    const title = (t.title || '').toLowerCase();
    const desc = (t.description || '').toLowerCase();
    const tags = (t.tags || []).map(t => t.toLowerCase());
    let score = 0;
    // Tag match
    for (const tag of tags) {
      if (skillTags.includes(tag)) score += 3;
    }
    // Name/desc keyword match
    for (const sn of skillNames) {
      const words = sn.split(/[\s\/]+/);
      for (const w of words) {
        if (w.length >= 2 && (title.includes(w) || desc.includes(w))) score += 1;
      }
    }
    return { ...t, match_score: score };
  }).filter(t => t.match_score > 0).sort((a, b) => b.match_score - a.match_score);
}

async function applyToTask(task, skill, creds) {
  const body = { skill_id: skill.id, message: `我有相关技能"${skill.name}"，可以高质量完成此任务。` };
  try {
    await api('POST', `/api/v1/tasks/${task.id}/applications`, body, creds);
    return { success: true, task_id: task.id, task_title: task.title, bounty: task.bounty_amount };
  } catch (e) {
    if (e.message.includes('4001') || e.message.includes('已对')) {
      return { success: false, reason: 'already_applied', task_id: task.id };
    }
    return { success: false, reason: e.message, task_id: task.id };
  }
}

async function checkPendingDeliveries(creds) {
  const data = await api('GET', '/api/v1/orders?status=in_progress&page_size=20', null, creds);
  return data ? (data.items || []) : [];
}

// === Main ===

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const scanOnly = args.includes('--scan-only');
  const applyOnly = args.includes('--apply-only');
  const statusOnly = args.includes('--status');

  const creds = loadAuth();
  const state = loadState();
  const report = { timestamp: new Date().toISOString(), actions: [] };

  // 1. Wallet status
  log('Checking wallet...');
  const wallet = await getWallet(creds);
  report.wallet = { balance: wallet.balance, available: wallet.available, frozen: wallet.frozen };

  if (statusOnly) {
    const skills = await getMySkills(creds);
    const pendingOrders = await checkPendingDeliveries(creds);
    report.skills_count = skills.length;
    report.pending_deliveries = pendingOrders.length;
    result(report);
    return;
  }

  // 2. Get my skills
  log('Loading skills...');
  const skills = await getMySkills(creds);
  report.skills_count = skills.length;

  // 3. Scan task hall
  log('Scanning task hall...');
  const keywords = ['Python', 'AI', '数据', '自动化', '翻译', '测试', 'API', 'SEO', '文档', '脚本', '分析', '开发'];
  const tasks = await scanTaskHall(creds, keywords);
  report.tasks_scanned = tasks.length;
  log(`Found ${tasks.length} tasks`);

  if (scanOnly) {
    const matched = matchSkills(tasks, skills);
    report.matched_tasks = matched.slice(0, 10).map(t => ({
      id: t.id, title: t.title, bounty: t.bounty_amount, score: t.match_score,
    }));
    result(report);
    return;
  }

  // 4. Match and apply
  const matched = matchSkills(tasks, skills);
  report.matched_count = matched.length;
  log(`Matched ${matched.length} tasks`);

  const applyResults = [];
  for (const task of matched.slice(0, 5)) { // Apply to top 5
    if (dryRun) {
      log(`[DRY-RUN] Would apply to: ${task.title} (${task.bounty_amount} UT)`);
      applyResults.push({ task_id: task.id, title: task.title, dry_run: true });
      continue;
    }
    // Find best matching skill
    const bestSkill = skills.find(s => {
      const name = s.name.toLowerCase();
      const tags = (s.tags || []).map(t => t.toLowerCase());
      const taskText = `${task.title} ${task.description}`.toLowerCase();
      return tags.some(t => taskText.includes(t)) || name.split(/\s\/+/).some(w => w.length >= 2 && taskText.includes(w));
    }) || skills[0];

    log(`Applying to: ${task.title} with skill: ${bestSkill.name}`);
    const res = await applyToTask(task, bestSkill, creds);
    applyResults.push(res);
    await sleep(1000); // Rate limit protection
  }
  report.applications = applyResults;

  // 5. Check pending deliveries
  log('Checking pending deliveries...');
  const pendingOrders = await checkPendingDeliveries(creds);
  report.pending_deliveries = pendingOrders.length;

  // 6. Save state
  state.last_scan = new Date().toISOString();
  state.applied_tasks.push(...applyResults.filter(r => r.success).map(r => r.task_id));
  saveState(state);

  // 7. Log report
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  const logFile = path.join(LOG_DIR, `earn-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(logFile, JSON.stringify(report, null, 2), 'utf-8');

  result(report);
}

main().catch(err => {
  log(`Error: ${err.message}`);
  process.exit(1);
});
