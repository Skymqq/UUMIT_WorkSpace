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

// Get ALL orders across all pages (up to 10 pages)
var allItems = [];
for (let p = 1; p <= 10; p++) {
  const o = rest('GET', '/api/v1/orders?page=' + p);
  if (!o || !o.data) break;
  const items = o.data.items || [];
  if (items.length === 0) break;
  allItems = allItems.concat(items);
  if (!o.data.has_more) break;
}
console.log('Total all orders:', allItems.length);

// Find any with amount 400 or anything related to MCP
allItems.forEach(function(i) {
  const amt = parseFloat(i.settlement_amount || '0');
  const neg = parseFloat(i.negotiated_price || '0');
  if (amt >= 380 || neg >= 380 || i.task_title.toLowerCase().indexOf('mcp') >= 0 || i.skill_name.toLowerCase().indexOf('mcp') >= 0) {
    console.log(i.status, i.task_title, i.settlement_amount, i.buyer_nickname, '->', i.seller_nickname);
  }
});
