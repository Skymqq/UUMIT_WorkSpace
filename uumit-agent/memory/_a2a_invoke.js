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

// Check external agents registration
console.log('=== External Agents ===');
const ext = rest('GET', '/api/v1/external-agents');
console.log('Ext agents:', ext.ok ? JSON.stringify(ext.data).slice(0, 800) : ext.err);

// Try A2A tasks/send
console.log('\n=== A2A Invoke ===');
const body = {
  jsonrpc: '2.0',
  method: 'tasks/send',
  id: '1',
  params: {
    id: 'task-mcp-' + Date.now(),
    sessionId: 'session-mcp-' + Date.now(),
    skillId: '7e528635-2823-4b30-8355-9e97c1507831',
    metadata: {
      targetAgentId: '67dd1391-253e-4e46-9f4d-a6494abf4cd5'
    },
    message: {
      role: 'user',
      parts: [{
        type: 'text',
        text: '我需要定制开发一个MCP Server，请提供你的服务。具体需求：我需要一个基于Node.js/TypeScript的MCP Server，包含自定义工具（Tools）、资源（Resources）和提示模板（Prompts），支持Docker部署。请提供方案和报价。'
      }]
    }
  }
};

const bp = path.join(__dirname, '_a2a_invoke.json');
fs.writeFileSync(bp, JSON.stringify(body), 'utf8');

const r = rest('POST', '/a2a', bp, '--idempotency-key a2a-mcp-' + Date.now());
console.log('A2A result:', r.ok ? JSON.stringify(r.data).slice(0, 800) : 'ERR: ' + r.err);
