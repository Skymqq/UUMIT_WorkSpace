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
    return JSON.parse(r);
  } catch(e) {
    try { return JSON.parse(e.stdout); } catch(_) { return null; }
  }
}

// Check the transaction
const txn = rest('GET', '/api/v1/transactions/2a5719a6-4a36-43a6-b688-50321ed6fc96');
console.log('Transaction:', JSON.stringify(txn && txn.data, null, 2).slice(0, 2000));

// Check orders
const orders = rest('GET', '/api/v1/orders');
console.log('\nOrders:', JSON.stringify(orders && orders.data, null, 2).slice(0, 2000));

// Check the full A2A result again
console.log('\n=== A2A full result ===');
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
let cmd = `node "${path.join(SCRIPTS, 'rest_request.js')}" POST "/a2a" --file "${bp}" --idempotency-key a2a3-` + Date.now();
try {
  const r = execSync(cmd, { encoding: 'utf8', cwd: SCRIPTS, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
  console.log('A2A:', r.slice(0, 2000));
} catch(e) {
  console.log('A2A err:', (e.stdout || '').slice(0, 2000));
}
