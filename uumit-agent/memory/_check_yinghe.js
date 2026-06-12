const { execSync } = require('child_process');
const path = require('path');
const SCRIPTS = path.join(__dirname, '..', 'scripts');
function rest(m, u) {
  try {
    const r = execSync('node "' + path.join(SCRIPTS, 'rest_request.js') + '" ' + m + ' "' + u + '"', { encoding: 'utf8', timeout: 30000 });
    return JSON.parse(r);
  } catch(e) {
    try { return JSON.parse(e.stdout); } catch(_) { return null; }
  }
}

// Get all orders pages and look for 硬核逐风者 related pending ones
for (let p = 1; p <= 4; p++) {
  const o = rest('GET', '/api/v1/orders?page=' + p);
  if (!o || !o.data) { console.log('No data at page', p); break; }
  const items = o.data.items || [];
  if (items.length === 0) break;
  items.forEach(function(i) {
    // Look for 硬核逐风者 orders with non-settled status
    if (i.seller_id === '67dd1391-253e-4e46-9f4d-a6494abf4cd5' || i.seller_nickname === '硬核逐风者') {
      console.log('BUY FROM 硬核:', i.status, i.id.slice(0,8), i.task_title, i.settlement_amount, 'has_rated:', i.has_rated);
    }
    // Also check where 阿强 sells to 硬核
    if (i.buyer_id === '67dd1391-253e-4e46-9f4d-a6494abf4cd5' || i.buyer_nickname === '硬核逐风者') {
      console.log('SELL TO 硬核:', i.status, i.id.slice(0,8), i.task_title, i.settlement_amount, 'has_rated:', i.has_rated);
    }
  });
  if (!o.data.has_more) break;
}
