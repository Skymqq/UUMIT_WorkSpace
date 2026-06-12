#!/usr/bin/env node
/**
 * UUMit — UT 收益统计脚本
 *
 * 查询钱包流水，按日/周/月汇总收入支出。
 * 用法：node earnings_stats.js [--period day|week|month] [--days 7]
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');
const AUTH_FILE = path.join(SKILL_DIR, 'memory', 'uumit-auth.json');

function log(msg) { console.error(`[stats] ${msg}`); }
function result(obj) { console.log(JSON.stringify(obj, null, 2)); }

function getCurrentProfile() {
  const auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
  const profile = auth.profiles[auth.current];
  return {
    apiKey: profile.cached_api_key,
    userId: profile.cached_user_id,
    name: auth.current,
  };
}

function makeRequest(method, urlPath, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(`https://api.uumit.com${urlPath}`);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method,
      headers,
      timeout: 30000,
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        try { resolve({ statusCode: res.statusCode, data: JSON.parse(raw) }); }
        catch (e) { reject(new Error(`Invalid JSON: HTTP ${res.statusCode}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function authHeaders(creds) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Api-Key': creds.apiKey,
    'X-Platform-User-Id': creds.userId,
  };
}

function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

async function main() {
  const args = process.argv.slice(2);
  const daysParam = args.includes('--days') ? parseInt(args[args.indexOf('--days') + 1]) : 7;

  const creds = getCurrentProfile();
  log(`Account: ${creds.name}`);

  // Fetch wallet stats
  const statsRes = await makeRequest('GET', '/api/v1/wallet/stats', authHeaders(creds));
  if (statsRes.data && statsRes.data.code !== 0) {
    throw new Error(`API ${statsRes.data.code}: ${statsRes.data.message}`);
  }
  const stats = statsRes.data ? statsRes.data.data : {};

  // Fetch wallet balance
  const walletRes = await makeRequest('GET', '/api/v1/wallet', authHeaders(creds));
  if (walletRes.data && walletRes.data.code !== 0) {
    throw new Error(`API ${walletRes.data.code}: ${walletRes.data.message}`);
  }
  const wallet = walletRes.data ? walletRes.data.data : {};

  // Fetch recent transactions
  const txRes = await makeRequest('GET', `/api/v1/wallet/transactions?page_size=100`, authHeaders(creds));
  if (txRes.data && txRes.data.code !== 0) {
    throw new Error(`API ${txRes.data.code}: ${txRes.data.message}`);
  }
  const transactions = txRes.data && txRes.data.data ? (txRes.data.data.items || []) : [];

  // Process transactions by day
  const now = new Date();
  const cutoff = new Date(now.getTime() - daysParam * 24 * 60 * 60 * 1000);
  const dailyStats = {};
  let totalIncome = 0;
  let totalExpense = 0;

  for (const tx of transactions) {
    const txDate = new Date(tx.created_at || tx.timestamp);
    if (txDate < cutoff) continue;

    const day = formatDate(txDate);
    if (!dailyStats[day]) dailyStats[day] = { income: 0, expense: 0, count: 0 };

    const amount = parseFloat(tx.amount || tx.ut_amount || 0);
    if (tx.type === 'income' || tx.direction === 'in' || amount > 0) {
      dailyStats[day].income += Math.abs(amount);
      totalIncome += Math.abs(amount);
    } else {
      dailyStats[day].expense += Math.abs(amount);
      totalExpense += Math.abs(amount);
    }
    dailyStats[day].count++;
  }

  // Weekly aggregation
  const weekStart = getWeekStart(now);
  let weekIncome = 0;
  let weekExpense = 0;
  for (const [day, stats] of Object.entries(dailyStats)) {
    if (new Date(day) >= weekStart) {
      weekIncome += stats.income;
      weekExpense += stats.expense;
    }
  }

  // Summary
  const summary = {
    timestamp: now.toISOString(),
    account: creds.name,
    balance: {
      total: wallet.ut ? wallet.ut.balance : '0',
      available: wallet.ut ? wallet.ut.available : '0',
      frozen: wallet.ut ? wallet.ut.frozen : '0',
    },
    period: `${daysParam} days`,
    totals: {
      income: totalIncome.toFixed(2),
      expense: totalExpense.toFixed(2),
      net: (totalIncome - totalExpense).toFixed(2),
    },
    this_week: {
      income: weekIncome.toFixed(2),
      expense: weekExpense.toFixed(2),
      net: (weekIncome - weekExpense).toFixed(2),
    },
    today: {
      income: (stats.ut ? stats.ut.today_income : '0') || '0',
      expense: (stats.ut ? stats.ut.today_expense : '0') || '0',
    },
    daily: dailyStats,
    transaction_count: transactions.length,
  };

  result(summary);
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
