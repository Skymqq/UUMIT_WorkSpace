const https = require('https');
const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, '..', 'memory', 'toku-auth.json');
const STATE_FILE = path.join(__dirname, '..', 'memory', 'toku-state.json');

function readJSON(p, def) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return def || null; }
}

function writeJSON(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const auth = readJSON(AUTH_FILE);
    if (!auth) return reject(new Error('toku-auth.json not found'));
    const opts = {
      hostname: 'www.toku.agency',
      path: path,
      method: method,
      headers: { 'Authorization': 'Bearer ' + auth.api_key },
      timeout: 15000
    };
    let data = null;
    if (body) {
      data = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = https.request(opts, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(b) }); }
        catch { resolve({ status: res.statusCode, data: b }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('API timeout ' + path)); });
    if (data) req.write(data);
    req.end();
  });
}

const SKIP_TITLE_PREFIXES = ['AVAILABLE:', 'INSTANT:', 'FREE:', 'Hire ', 'AI Dream Team'];
const SKIP_CATEGORIES = ['maintenance', 'security'];
const MAX_BID_COUNT = 25;

function isBiddable(job, history) {
  if (!job || !job.id) return false;
  if (history[job.id]) return false;
  if (SKIP_TITLE_PREFIXES.some(p => job.title?.startsWith(p))) return false;
  if (SKIP_CATEGORIES.includes((job.category || '').toLowerCase())) return false;
  if (job.bidCount > MAX_BID_COUNT) return false;
  if (!job.budgetCents || job.budgetCents < 100) return false;
  return true;
}

async function run() {
  const start = Date.now();
  const history = readJSON(STATE_FILE, {});
  const bidHistory = history.bid_history || {};
  const results = { tick_at: new Date().toISOString(), profile_url: 'https://toku.agency/agents/uumit-agent', auto_bids: [], errors: [] };

  try {
    const jobsResp = await api('GET', '/api/agents/jobs?status=open&limit=20');
    if (jobsResp.status !== 200) {
      results.errors.push('Jobs fetch status ' + jobsResp.status);
      finish(results);
      return;
    }

    const allJobs = jobsResp.data?.jobPosts || [];
    results.checked = allJobs.length;
    const biddable = allJobs.filter(j => isBiddable(j, bidHistory));
    results.filtered = biddable.length;

    for (const job of biddable) {
      const bidAmount = Math.min(job.budgetCents, 500);

      try {
        const bid = await api('POST', '/api/agents/jobs/' + job.id + '/bids', {
          priceCents: bidAmount,
          message: 'I can handle this. Fast delivery, quality work. I have access to extensive data APIs and automation capabilities.'
        });

        if (bid.status === 200 || bid.status === 201) {
          results.auto_bids.push({
            job_id: job.id, title: job.title, category: job.category,
            budget_cents: job.budgetCents, bid_cents: bidAmount
          });
        }
        bidHistory[job.id] = true; // prevent re-bid
      } catch (e) {
        results.errors.push('Bid ' + job.id + ': ' + e.message);
        bidHistory[job.id] = true;
      }
    }
  } catch (e) {
    results.errors.push(e.message);
  }

  // Save state
  writeJSON(STATE_FILE, { bid_history: bidHistory, last_tick: new Date().toISOString() });

  finish(results);
}

function finish(results) {
  console.log(JSON.stringify(results, null, 2));
  // Summary to stderr
  if (results.auto_bids.length > 0) {
    process.stderr.write('toku: ' + results.auto_bids.length + ' bids placed\n');
  }
  if (results.errors.length > 0) {
    process.stderr.write('toku: ' + results.errors.length + ' non-fatal issues\n');
  }
  process.exit(results.errors.length > 2 ? 1 : 0);
}

run();
