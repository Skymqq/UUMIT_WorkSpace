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
const o = rest('GET', '/api/v1/orders');
const items = o && o.data ? o.data.items : [];
console.log('Total orders in page:', items.length);
items.forEach(function(i) {
  if (i.status !== 'settled' || i.has_rated === false) {
    console.log(i.status, i.has_rated, i.id, i.task_title, i.settlement_amount, i.negotiated_price);
  }
});
// Also check if any is 400
items.forEach(function(i) {
  if (i.settlement_amount === '400.00' || i.negotiated_price === '400.00') {
    console.log('400 ORDER:', i.status, i.id, i.task_title, i.buyer_nickname, i.seller_nickname);
  }
});
