const { execSync } = require('child_process');
const path = require('path');
const SCRIPTS = path.join(__dirname, '..', 'scripts');
function rest(m, u) { try { const r = execSync('node "' + path.join(SCRIPTS, 'rest_request.js') + '" ' + m + ' "' + u + '"', { encoding: 'utf8', timeout: 30000 }); return JSON.parse(r); } catch(e) { try { return JSON.parse(e.stdout); } catch(_) { return null; } } }
const o = rest('GET', '/api/v1/orders?page_size=200');
if (o && o.data) { const items = o.data.items || []; console.log('Total:', items.length); items.forEach(function(i) { if (i.status !== 'settled') console.log('NON-SETTLED:', i.id, i.status, i.task_title, i.settlement_amount, i.negotiated_price); }); items.forEach(function(i) { if (i.settlement_amount === '400.00' || i.negotiated_price === '400.00') console.log('FOUND 400:', i.id, i.status, i.task_title, i.settlement_amount, i.negotiated_price); }); } else { console.log('FAILED'); }
