const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://api.uumit.com';
const targetUser = '67dd1391-253e-4e46-9f4d-a6494abf4cd5';
const skillId = 'fe935266-ffea-422b-ac56-e4a57a10e74a';
const CONCURRENCY = 5;
const MEMORY_DIR = __dirname; // memory/ directory
const AUTH_FILE = path.join(MEMORY_DIR, 'uumit-auth.json');

function loadCreds() {
  if (process.env.UUMIT_API_KEY && process.env.UUMIT_USER_ID)
    return { apiKey: process.env.UUMIT_API_KEY, userId: process.env.UUMIT_USER_ID };
  try {
    const a = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    const p = a.profiles && a.profiles[a.current];
    if (p && p.cached_api_key && p.cached_user_id)
      return { apiKey: p.cached_api_key, userId: p.cached_user_id };
  } catch(_) {}
  return null;
}

function makeRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(BASE_URL + urlPath);
    const isHttps = urlObj.protocol === 'https:';
    const mod = isHttps ? https : http;
    const creds = loadCreds();
    const headers = { 'Content-Type': 'application/json' };
    if (creds) {
      headers['X-Api-Key'] = creds.apiKey;
      headers['X-Platform-User-Id'] = creds.userId;
    }
    if (body && ['POST', 'PUT', 'PATCH'].includes(method))
      headers['Idempotency-Key'] = require('crypto').randomUUID();
    const opts = {
      hostname: urlObj.hostname, port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search, method, headers, timeout: 15000,
    };
    const req = mod.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve({ statusCode: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch(e) { reject(new Error('JSON parse')); }
      });
    });
    req.on('error', e => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function applyOne(task) {
  try {
    const res = await makeRequest('POST', `/api/v1/tasks/${task.id}/applications`, {
      skill_id: skillId,
      message: '你好，我是AI Agent开发者，具备丰富的内容创作和文案撰写经验。'
    });
    if (res.data && res.data.code === 0) return { ok: true, task };
    const msg = (res.data && res.data.message) || '';
    if (msg.includes('已对该任务')) return { dup: true, task };
    return { fail: true, task, msg: msg.slice(0,60) };
  } catch(e) {
    return { fail: true, task, msg: e.message.slice(0,60) };
  }
}

async function main() {
  const hall = await makeRequest('GET', '/api/v1/tasks/hall?page=1&page_size=100');
  const items = (hall.data && hall.data.data && hall.data.data.items || []).filter(t => t.user_id === targetUser && t.status === 'open');
  console.log('Found', items.length, 'open tasks from 硬核逐风者');

  let ok = 0, dup = 0, fail = 0;
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(t => applyOne(t)));
    for (const r of results) {
      if (r.ok) { console.log('OK:', r.task.title); ok++; }
      else if (r.dup) { console.log('DUP:', r.task.title); dup++; }
      else { console.log('FAIL:', r.task.title, r.msg); fail++; }
    }
  }
  console.log('--- Total:', items.length, 'OK:', ok, 'DUP:', dup, 'FAIL:', fail);
}

main().catch(e => console.error('FATAL:', e.message));
