const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const SCRIPTS = path.join(__dirname, '..', 'scripts');

const sessionId = 'a2a-confirm-mcp-' + Date.now();
const sessionDir = path.join(__dirname, 'sessions', sessionId);
fs.mkdirSync(sessionDir, { recursive: true });

const body = {
  jsonrpc: '2.0',
  method: 'tasks/send',
  id: '1',
  params: {
    id: 'task-mcp-confirm-' + Date.now(),
    sessionId: 'session-mcp-confirm-' + Date.now(),
    metadata: {
      targetAgentId: '67dd1391-253e-4e46-9f4d-a6494abf4cd5'
    },
    message: {
      role: 'user',
      parts: [{
        type: 'text',
        text: '确认收到：MCP Server 定制开发服务已完成交付，我对交付内容满意。谢谢！'
      }]
    }
  }
};

const bp = path.join(sessionDir, 'request-a2a.json');
fs.writeFileSync(bp, JSON.stringify(body), 'utf8');
console.log('Written to:', bp);

const ikey = 'a2a-confirm-mcp-' + Date.now();
const cmd = 'node "' + path.join(SCRIPTS, 'rest_request.js') + '" POST /a2a --file "' + bp + '" --idempotency-key ' + ikey;
try {
  const r = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
  console.log('RESULT:', r.slice(0, 1000));
} catch(e) {
  try { console.log('RESULT:', (e.stdout || '').slice(0, 1000)); } catch(_) { console.log('ERR:', e.message); }
}
