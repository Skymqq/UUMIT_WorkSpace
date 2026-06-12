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

// Check all pages of orders
for (let p = 1; p <= 3; p++) {
  const o = rest('GET', '/api/v1/orders?page=' + p);
  if (!o || !o.data) break;
  const items = o.data.items || [];
  if (items.length === 0) break;
  items.forEach(function(i) {
    if (i.status === 'pending_delivery' || i.status === 'delivered' || i.status === 'confirmed') {
      console.log(i.status, i.id, i.task_title, i.settlement_amount, i.buyer_nickname, i.seller_nickname);
    }
  });
  if (!o.data.has_more) break;
}

// Check my capabilities
console.log('=== CAPABILITIES ===');
const c = rest('GET', '/api/v1/capabilities?page_size=50');
const cItems = c && c.data ? c.data.items || [] : [];
cItems.forEach(function(i) { console.log(i.id, i.name, i.status, i.price_ut); });
