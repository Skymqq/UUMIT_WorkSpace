#!/usr/bin/env node
/**
 * UUMit Skill — 批量发布已审核知识商店资产脚本
 *
 * Usage:
 *   node batch_publish.js --list [--all-pages] [--asset-id UUID]
 *   node batch_publish.js --publish --asset-id UUID --use-suggested --confirmed
 *   node batch_publish.js --publish --all-pages --price-file prices.json --confirmed
 *
 * Credentials: env vars UUMIT_API_KEY + UUMIT_USER_ID, or auth file
 * stdout: final JSON; stderr: progress and diagnostics
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SKILL_DIR_BP = path.resolve(__dirname, '..');
function _resolveBaseUrl() {
  if (process.env.UUMIT_BASE_URL) return process.env.UUMIT_BASE_URL;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(SKILL_DIR_BP, 'memory', 'uumit-config.json'), 'utf8'));
    if (cfg.base_url) return cfg.base_url;
  } catch (_) {}
  return 'https://api.uumit.com';
}
const BASE_URL = _resolveBaseUrl();
const baseUrlObj = new URL(BASE_URL);
const isHttps = baseUrlObj.protocol === 'https:';

function log(msg) { console.error(msg); }

const { loadCredentials } = require('./auth_common');

function makeRequest(method, urlPath, headers, bodyData) {
  return new Promise((resolve, reject) => {
    const url = BASE_URL + urlPath;
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers,
      timeout: 30000,
    };
    const mod = isHttps ? https : http;
    const req = mod.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        try { resolve({ statusCode: res.statusCode, data: JSON.parse(raw) }); }
        catch (e) { reject(new Error(`invalid JSON: ${raw.slice(0, 200)}`)); }
      });
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

function getArgValue(args, flag) {
  const idx = args.indexOf(flag);
  if (idx < 0) return null;
  if (idx + 1 >= args.length || args[idx + 1].startsWith('--')) {
    log(JSON.stringify({ error: `missing value for ${flag}` }));
    process.exit(2);
  }
  return args[idx + 1];
}

async function fetchAssets(headers, { allPages, assetId }) {
  const items = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const pathWithQuery = `/api/v1/digital-assets?page=${page}&page_size=${pageSize}`;
    const { data } = await makeRequest('GET', pathWithQuery, headers);
    if (data.code !== 0) {
      log(JSON.stringify({ error: data.message }));
      process.exit(1);
    }

    const pageItems = (data.data && data.data.items) || [];
    items.push(...pageItems);

    if (assetId && items.some(a => a.id === assetId)) break;
    const hasMore = data.data && data.data.has_more;
    if (!allPages || !hasMore) break;
    page += 1;
  }

  return assetId ? items.filter(a => a.id === assetId) : items;
}

async function main() {
  const args = process.argv.slice(2);
  const isList = args.includes('--list');
  const isPublish = args.includes('--publish');
  const useSuggested = args.includes('--use-suggested');
  const confirmed = args.includes('--confirmed');
  const allPages = args.includes('--all-pages');
  const assetId = getArgValue(args, '--asset-id');

  const priceFile = getArgValue(args, '--price-file');

  const { apiKey, userId } = loadCredentials();
  if (!apiKey || !userId) {
    log('Credentials not found.');
    process.exit(2);
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Key': apiKey,
    'X-Platform-User-Id': userId,
  };

  // List mode
  if (isList) {
    const items = await fetchAssets(headers, { allPages: allPages || !!assetId, assetId });
    const pending = items.filter(a => a.content_review_status === 'approved' && a.status !== 'published');
    log(`Found ${pending.length} assets ready to publish`);
    console.log(JSON.stringify({ total: pending.length, all_pages: allPages, asset_id: assetId, items: pending }));
    return;
  }

  // Publish mode
  if (isPublish) {
    if (!confirmed) {
      log('Use --confirmed to confirm publishing');
      process.exit(1);
    }
    if (!assetId && !allPages) {
      log(JSON.stringify({
        error: 'publish scope required',
        hint: 'Use --asset-id UUID for one asset, or --all-pages to intentionally publish every matching asset.',
      }));
      process.exit(1);
    }
    if (!useSuggested && !priceFile) {
      log(JSON.stringify({
        error: 'price source required',
        hint: 'Use --price-file prices.json for explicit prices, or --use-suggested to use server suggestions.',
      }));
      process.exit(1);
    }

    let prices = {};
    if (priceFile) {
      if (!fs.existsSync(priceFile)) {
        log(JSON.stringify({ error: `price file not found: ${priceFile}` }));
        process.exit(1);
      }
      try { prices = JSON.parse(fs.readFileSync(priceFile, 'utf-8')); }
      catch (e) { log(JSON.stringify({ error: `invalid price file: ${e.message}` })); process.exit(1); }
    }

    const items = await fetchAssets(headers, { allPages: allPages || !!assetId, assetId });
    const pending = items.filter(a => a.content_review_status === 'approved' && a.status !== 'published');

    if (pending.length === 0) {
      log('No assets ready to publish');
      console.log(JSON.stringify({ published: 0, all_pages: allPages, asset_id: assetId }));
      return;
    }

    const results = [];
    for (const asset of pending) {
      let priceUt = prices[asset.id];
      if (!priceUt && useSuggested) {
        priceUt = asset.suggested_price_ut || asset.suggested_price || null;
      }
      if (!priceUt) {
        results.push({ id: asset.id, status: 'skipped', error: 'missing price' });
        log(`  SKIP: missing price for ${asset.name || asset.id}`);
        continue;
      }

      log(`Publishing: ${asset.name || asset.id} @ ${priceUt} UT`);
      try {
        const { statusCode, data: pubData } = await makeRequest(
          'POST', `/api/v1/digital-assets/${asset.id}/publish`, headers,
          JSON.stringify({ price_ut: priceUt })
        );
        if (statusCode === 200 && pubData.code === 0) {
          results.push({ id: asset.id, status: 'ok', price_ut: priceUt });
          log(`  OK`);
        } else {
          results.push({ id: asset.id, status: 'error', error: pubData.message || `HTTP ${statusCode}` });
          log(`  FAIL: ${pubData.message || `HTTP ${statusCode}`}`);
        }
      } catch (err) {
        results.push({ id: asset.id, status: 'error', error: err.message });
        log(`  FAIL: ${err.message}`);
      }
    }

    const ok = results.filter(r => r.status === 'ok').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    log(`Published: ${ok}/${pending.length}, skipped: ${skipped}`);
    console.log(JSON.stringify({ total: pending.length, ok, skipped, all_pages: allPages, asset_id: assetId, results }));
    return;
  }

  log('Usage: node batch_publish.js --list [--all-pages] [--asset-id UUID] | --publish (--asset-id UUID | --all-pages) (--use-suggested | --price-file prices.json) --confirmed');
  process.exit(2);
}

main().catch(err => {
  log(JSON.stringify({ error: err.message }));
  process.exit(1);
});