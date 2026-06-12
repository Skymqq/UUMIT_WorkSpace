const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const SCRIPTS = path.join(__dirname, '..', 'scripts');

function rest(method, url, bodyFile, extraFlags) {
  let cmd = `node "${path.join(SCRIPTS, 'rest_request.js')}" ${method} "${url}"`;
  if (bodyFile) cmd += ` --file "${bodyFile}"`;
  if (extraFlags) cmd += ` ${extraFlags}`;
  try {
    const r = execSync(cmd, { encoding: 'utf8', cwd: SCRIPTS, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    return { ok: true, data: JSON.parse(r) };
  } catch(e) {
    try { if (e.stdout) return { ok: true, data: JSON.parse(e.stdout) }; } catch(_) {}
    const errMsg = (e.stderr || '').trim() || e.message || '';
    return { ok: false, err: errMsg.slice(0, 300), stdout: e.stdout || '' };
  }
}

// Try A2A with capability_id = skill_id
console.log('=== A2A with capability_id ===');
const a2aBody = {
  jsonrpc: '2.0',
  method: 'tasks/send',
  id: '1',
  params: {
    id: 'task-mcp-' + Date.now(),
    sessionId: 'session-mcp-' + Date.now(),
    capability_id: '7e528635-2823-4b30-8355-9e97c1507831',
    metadata: {
      targetAgentId: '67dd1391-253e-4e46-9f4d-a6494abf4cd5'
    },
    message: {
      role: 'user',
      parts: [{
        type: 'text',
        text: '我需要定制开发一个MCP Server，基于Node.js/TypeScript，包含Tools、Resources和Prompts，支持Docker部署。请提供方案。'
      }]
    }
  }
};

const bp = path.join(__dirname, '_a2a2.json');
fs.writeFileSync(bp, JSON.stringify(a2aBody), 'utf8');
const r1 = rest('POST', '/a2a', bp, '--idempotency-key a2a2-' + Date.now());
console.log('A2A result:', r1.ok ? JSON.stringify(r1.data).slice(0, 600) : 'ERR: ' + r1.err);

// Also try negotiation initiate
console.log('\n=== Negotiation Initiate ===');
const negBody = {
  target_user_id: '67dd1391-253e-4e46-9f4d-a6494abf4cd5',
  skill_id: '7e528635-2823-4b30-8355-9e97c1507831',
  amount_ut: 400,
  message: '我想订购MCP Server Custom Development Service，请提供服务方案。'
};
const bp2 = path.join(__dirname, '_nego.json');
fs.writeFileSync(bp2, JSON.stringify(negBody), 'utf8');
const r2 = rest('POST', '/api/v1/negotiation/initiate', bp2, '--idempotency-key nego-' + Date.now());
console.log('Negotiation result:', r2.ok ? JSON.stringify(r2.data).slice(0, 600) : 'ERR: ' + r2.err);
