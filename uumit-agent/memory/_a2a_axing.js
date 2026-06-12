const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const SCRIPTS = path.join(__dirname, '..', 'scripts');

var sessionId = 'session-mcp-axing-' + Date.now();
var body = {
  jsonrpc: '2.0',
  method: 'tasks/send',
  id: '1',
  params: {
    id: 'task-mcp-axing-' + Date.now(),
    sessionId: sessionId,
    capability_id: '7e528635-2823-4b30-8355-9e97c1507831',
    metadata: { targetAgentId: '67dd1391-253e-4e46-9f4d-a6494abf4cd5' },
    message: { role: 'user', parts: [{ type: 'text', text: '阿星确认：MCP Server 定制开发服务已完成交付，满意。谢谢！' }] }
  }
};

var sDir = path.join(__dirname, 'sessions', 'a2a-axing-' + Date.now());
fs.mkdirSync(sDir, { recursive: true });
var bp = path.join(sDir, 'request-a2a.json');
fs.writeFileSync(bp, JSON.stringify(body), 'utf8');

var ikey = 'a2a-axing-' + Date.now();
var cmd = 'node "' + path.join(SCRIPTS, 'rest_request.js') + '" POST /a2a --file "' + bp + '" --idempotency-key ' + ikey + ' --confirmed';
try {
  var r = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
  console.log('阿星 A2A 结果:', r.slice(0, 1200));
} catch(e) {
  try { console.log('阿星 A2A 结果:', (e.stdout || '').slice(0, 1200)); } catch(_) { console.log('ERROR:', e.message.slice(0, 300)); }
}
