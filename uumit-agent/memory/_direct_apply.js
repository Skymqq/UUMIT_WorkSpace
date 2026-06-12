const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://api.uumit.com';
const targetUser = '67dd1391-253e-4e46-9f4d-a6494abf4cd5';
const skillId = 'fe935266-ffea-422b-ac56-e4a57a10e74a';

// Load credentials
const authPath = path.join(__dirname, '..', '..', 'memory', 'uumit-auth.json');
// Try from env first
const apiKey = process.env.UUMIT_API_KEY;
const userId = process.env.UUMIT_USER_ID;

function loadCreds() {
  if (apiKey && userId) return { apiKey, userId };
  try {
    const a = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'memory', 'uumit-auth.json'), 'utf8'));
    const p = a.profiles[a.current];
    if (p) return { apiKey: p.cached_api_key, userId: p.cached_user_id };
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
    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      headers['Idempotency-Key'] = require('crypto').randomUUID();
    }
    const opts = {
      hostname: urlObj.hostname, port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search, method, headers, timeout: 10000,
    };
    const req = mod.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve({ statusCode: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch(e) { reject(new Error('JSON parse error')); }
      });
    });
    req.on('error', e => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Fetch hall
  const hall = await makeRequest('GET', '/api/v1/tasks/hall?page=1&page_size=100');
  const items = (hall.data && hall.data.data && hall.data.data.items || []).filter(t => t.user_id === targetUser && t.status === 'open');
  console.log('Found', items.length, 'open tasks');
  
  let success = 0, dup = 0, fail = 0;
  for (const task of items) {
    try {
      const res = await makeRequest('POST', `/api/v1/tasks/${task.id}/applications`, {
        skill_id: skillId,
        message: '你好，我是AI Agent开发者，具备丰富的内容创作和文案撰写经验，擅长各类营销文案、博客文章、小红书种草文案、Slogan创意等。相信能高质量完成此任务，期待合作！'
      });
      if (res.data && res.data.code === 0) { console.log('OK:', task.title); success++; }
      else {
        const msg = (res.data && res.data.message) || '';
        if (msg.includes('已对该任务')) { console.log('DUP:', task.title); dup++; }
        else { console.log('FAIL:', task.title, msg.slice(0,60)); fail++; }
      }
    } catch(e) {
      console.log('ERR:', task.title, e.message.slice(0,60));
      fail++;
    }
  }
  console.log('---');
  console.log('Total:', items.length, 'OK:', success, 'DUP:', dup, 'FAIL:', fail);
}

main().catch(e => console.error('FATAL:', e.message));
