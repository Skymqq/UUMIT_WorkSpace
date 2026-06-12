const https = require('https');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://api.uumit.com';
const authPath = path.join(__dirname, 'uumit-auth.json');
const a = JSON.parse(fs.readFileSync(authPath, 'utf8'));
const p = a.profiles[a.current];
const creds = { apiKey: p.cached_api_key, userId: p.cached_user_id };

const OSS_BASE = 'https://oss.uumit.com';

const deliveries = [
  {
    orderId: '537287f1-97d8-4f3c-8817-60de38db4fee',
    title: 'Python数据采集脚本开发',
    notes: '硬核逐风者 - 数据采集',
    url: OSS_BASE + '/uumit-service/prod/deliverables/2026/06/11/dd75ad5f119c44f4.py',
  },
  {
    orderId: '72aeb507-c855-4ac6-a9c5-2d7a3532b4d3',
    title: 'Python数据采集脚本开发',
    notes: '硬核逐风者 - 数据采集',
    url: OSS_BASE + '/uumit-service/prod/deliverables/2026/06/11/dd75ad5f119c44f4.py',
  },
  {
    orderId: '5a1dc3fe-2f38-4687-a81c-01d99bfb3f73',
    title: 'Python数据处理脚本编写',
    notes: '阿星 - 数据处理',
    url: OSS_BASE + '/uumit-service/prod/deliverables/2026/06/11/cb62bbb0c98442d1.py',
  },
  {
    orderId: 'ba2c0215-40e1-4877-a920-3813c800638f',
    title: 'Python数据处理脚本编写',
    notes: '阿星 - 数据处理',
    url: OSS_BASE + '/uumit-service/prod/deliverables/2026/06/11/cb62bbb0c98442d1.py',
  },
  {
    orderId: 'ac03f2c7-15d4-490f-b3b6-347bffc3b155',
    title: 'Python数据处理脚本编写',
    notes: '阿星 - 数据处理',
    url: OSS_BASE + '/uumit-service/prod/deliverables/2026/06/11/cb62bbb0c98442d1.py',
  },
  {
    orderId: '4d0a0dd6-849a-465d-9824-46d603f6bef1',
    title: 'Python数据处理脚本编写',
    notes: '阿星 - 数据处理',
    url: OSS_BASE + '/uumit-service/prod/deliverables/2026/06/11/cb62bbb0c98442d1.py',
  },
];

function makeRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(BASE_URL + urlPath);
    const headers = { 'Content-Type': 'application/json', 'X-Api-Key': creds.apiKey, 'X-Platform-User-Id': creds.userId };
    const opts = { hostname: urlObj.hostname, port: 443, path: urlObj.pathname + urlObj.search, method, headers, timeout: 15000 };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ statusCode: res.statusCode, data: JSON.parse(d) }); } catch(e) { reject(new Error('parse')); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  let ok = 0, dup = 0, fail = 0;
  for (const d of deliveries) {
    const body = {
      deliverable_type: 'digital',
      deliverables: [{ url: d.url, name: d.title + '.py' }],
    };
    try {
      const res = await makeRequest('POST', `/api/v1/orders/${d.orderId}/deliverables`, body);
      const msg = (res.data && res.data.message) || '';
      if (res.data && res.data.code === 0) {
        console.log('OK:', d.title, '-', d.orderId.slice(0,8));
        ok++;
      } else if (msg.includes('已交付') || msg.includes('already')) {
        console.log('DUP:', d.title, d.orderId.slice(0,8));
        dup++;
      } else {
        console.log('FAIL:', d.title, '-', msg.slice(0,60));
        fail++;
      }
    } catch(e) {
      console.log('ERR:', d.title, e.message.slice(0,60));
      fail++;
    }
  }
  console.log(`\nOK: ${ok} | DUP: ${dup} | FAIL: ${fail}`);
}
main().catch(e => console.error('FATAL:', e.message));
