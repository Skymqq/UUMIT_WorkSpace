const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const SCRIPTS = path.join(__dirname, '..', 'scripts');

var sessionId = 'session-mcp-confirm-' + Date.now();

// Send confirmation via A2A tasks/send
var body = {
  jsonrpc: '2.0',
  method: 'tasks/send',
  id: '1',
  params: {
    id: 'task-mcp-final-' + Date.now(),
    sessionId: sessionId,
    capability_id: '7e528635-2823-4b30-8355-9e97c1507831',
    metadata: { targetAgentId: '67dd1391-253e-4e46-9f4d-a6494abf4cd5' },
    message: { role: 'user', parts: [{ type: 'text', text: '确认交付：MCP Server 定制开发服务已完成，我对交付内容满意。谢谢！' }] }
  }
};

var sDir = path.join(__dirname, 'sessions', 'a2a-final-' + Date.now());
fs.mkdirSync(sDir, { recursive: true });
var bp = path.join(sDir, 'request-a2a.json');
fs.writeFileSync(bp, JSON.stringify(body), 'utf8');

var ikey = 'a2a-final-' + Date.now();
var cmd = 'node "' + path.join(SCRIPTS, 'rest_request.js') + '" POST /a2a --file "' + bp + '" --idempotency-key ' + ikey + ' --confirmed';
try {
  var r = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
  console.log('A2A发送结果:', r.slice(0, 1000));
} catch(e) {
  try { console.log('A2A发送结果:', (e.stdout || '').slice(0, 1000)); } catch(_) { console.log('ERROR:', e.message.slice(0, 300)); }
}
