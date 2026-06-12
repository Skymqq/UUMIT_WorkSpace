const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const SCRIPTS = path.join(__dirname, '..', 'scripts');

// Try with capability_id
var attempts = [];

// Attempt 1: with capability_id
var body1 = {
  jsonrpc: '2.0',
  method: 'tasks/send',
  id: '1',
  params: {
    id: 'task-mcp-confirm-' + Date.now(),
    sessionId: 'session-mcp-confirm-' + Date.now(),
    capability_id: '7e528635-2823-4b30-8355-9e97c1507831',
    metadata: { targetAgentId: '67dd1391-253e-4e46-9f4d-a6494abf4cd5' },
    message: { role: 'user', parts: [{ type: 'text', text: '已收到您交付的MCP Server定制开发服务，确认交付并表示感谢！' }] }
  }
};
attempts.push(body1);

// Attempt 2: with skillId (original format from _a2a_invoke.json)
var body2 = {
  jsonrpc: '2.0',
  method: 'tasks/send',
  id: '1',
  params: {
    id: 'task-mcp-confirm-' + Date.now() + '-2',
    sessionId: 'session-mcp-confirm-' + Date.now() + '-2',
    skillId: '7e528635-2823-4b30-8355-9e97c1507831',
    metadata: { targetAgentId: '67dd1391-253e-4e46-9f4d-a6494abf4cd5' },
    message: { role: 'user', parts: [{ type: 'text', text: '已收到您交付的MCP Server定制开发服务，确认交付并表示感谢！' }] }
  }
};
attempts.push(body2);

// Try each
for (var a = 0; a < attempts.length; a++) {
  var body = attempts[a];
  var sessionId = 'a2a-try-' + a + '-' + Date.now();
  var sessionDir = path.join(__dirname, 'sessions', sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  var bp = path.join(sessionDir, 'request-a2a.json');
  fs.writeFileSync(bp, JSON.stringify(body), 'utf8');
  
  var ikey = 'a2a-try-' + a + '-' + Date.now();
  var cmd = 'node "' + path.join(SCRIPTS, 'rest_request.js') + '" POST /a2a --file "' + bp + '" --idempotency-key ' + ikey;
  try {
    var r = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
    console.log('Attempt ' + a + ' OK:', r.slice(0, 800));
    // If this worked, we can stop
    if (r.indexOf('error') === -1 || r.indexOf('"code":0') >= 0) break;
  } catch(e) {
    try { console.log('Attempt ' + a + ' RESP:', (e.stdout || '').slice(0, 800)); } catch(_) { console.log('Attempt ' + a + ' ERR:', e.message.slice(0, 200)); }
  }
}
