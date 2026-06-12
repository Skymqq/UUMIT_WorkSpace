const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const SCRIPTS = path.join(__dirname, '..', 'scripts');

function rest(method, url, bodyFile) {
  let cmd = `node "${path.join(SCRIPTS, 'rest_request.js')}" ${method} "${url}"`;
  if (bodyFile) cmd += ` --file "${bodyFile}"`;
  try {
    const r = execSync(cmd, { encoding: 'utf8', cwd: SCRIPTS, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    return { ok: true, data: JSON.parse(r) };
  } catch(e) {
    try { if (e.stdout) return { ok: true, data: JSON.parse(e.stdout) }; } catch(_) {}
    return { ok: false, err: (e.stderr || e.message || '').slice(0, 200), stdout: e.stdout };
  }
}

const orderId = 'a23b3323-a01a-4ad8-ad43-ff5d608c721e'; // 小红书文案润色

// Test 1: text only, no deliverables array
const body1 = { deliverable_type: 'text', content: '测试交付内容123' };
const bp1 = path.join(__dirname, '_test_del1.json');
fs.writeFileSync(bp1, JSON.stringify(body1), 'utf8');
const r1 = rest('POST', `/api/v1/orders/${orderId}/deliverables`, bp1);
console.log('Test 1 (text only):', r1.ok ? (r1.data.code + ' ' + (r1.data.message||'')) : r1.err);

// Test 2: with empty deliverables
const body2 = { deliverable_type: 'text', content: '测试交付内容123', deliverables: [] };
const bp2 = path.join(__dirname, '_test_del2.json');
fs.writeFileSync(bp2, JSON.stringify(body2), 'utf8');
const r2 = rest('POST', `/api/v1/orders/${orderId}/deliverables`, bp2);
console.log('Test 2 (empty deliverables):', r2.ok ? (r2.data.code + ' ' + (r2.data.message||'')) : r2.err);

// Test 3: upload file first, then reference
const body3 = JSON.stringify({ content: '测试内容', file_name: 'delivery.txt' });
const bp3 = path.join(__dirname, '_test_up.json');
fs.writeFileSync(bp3, body3, 'utf8');
const r3 = rest('POST', '/api/v1/deliverables/upload', bp3);
console.log('Test 3 (upload deliverable):', r3.ok ? JSON.stringify(r3.data).slice(0, 200) : r3.err);

// Test 4: upload file endpoint
const body4 = JSON.stringify({ content: '测试文件内容', file_name: 'delivery.txt', file_size: 100 });
const bp4 = path.join(__dirname, '_test_up2.json');
fs.writeFileSync(bp4, body4, 'utf8');
const r4 = rest('POST', '/api/v1/upload/file', bp4);
console.log('Test 4 (upload/file):', r4.ok ? JSON.stringify(r4.data).slice(0, 200) : r4.err);
