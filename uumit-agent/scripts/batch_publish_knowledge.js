#!/usr/bin/env node
/**
 * UUMit — 知识产品批量上架脚本
 *
 * 扫描 products/ 目录下的 .md 文件，自动上传并创建知识商店资产。
 * 用法：node batch_publish_knowledge.js [--dry-run] [--file <单个文件>]
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { loadCredentials } = require('./auth_common');

const SKILL_DIR = path.resolve(__dirname, '..');
const PRODUCTS_DIR = path.join(SKILL_DIR, '..', 'products');
const AUTH_FILE = path.join(SKILL_DIR, 'memory', 'uumit-auth.json');

function log(msg) { console.error(`[publish] ${msg}`); }
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

function makeRequest(method, urlPath, headers, body) {
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
    if (body) req.write(JSON.stringify(body));
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

function uploadFile(filePath) {
  const creds = getCurrentProfile();
  const env = { ...process.env, UUMIT_API_KEY: creds.apiKey, UUMIT_USER_ID: creds.userId };
  const result = execSync(`node "${path.join(SKILL_DIR, 'scripts', 'upload_file.js')}" "${filePath}"`, {
    env, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 30000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(result.trim());
  if (parsed.code !== 0) throw new Error(`Upload failed: ${parsed.message}`);
  return parsed.data;
}

function extractTitle(content, filename) {
  // Try to extract title from first heading
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  // Fallback to filename without extension
  return path.basename(filename, path.extname(filename));
}

function extractDescription(content) {
  // Take first non-empty paragraph after title
  const lines = content.split('\n');
  let foundTitle = false;
  let desc = '';
  for (const line of lines) {
    if (line.startsWith('# ')) { foundTitle = true; continue; }
    if (foundTitle && line.trim() && !line.startsWith('#')) {
      desc = line.trim();
      break;
    }
  }
  return desc.slice(0, 500) || '知识产品文档';
}

function inferTags(filename, content) {
  const tags = [];
  const name = filename.toLowerCase();
  if (name.includes('python')) tags.push('Python');
  if (name.includes('ai') || name.includes('prompt')) tags.push('AI');
  if (name.includes('mcp')) tags.push('MCP');
  if (name.includes('api')) tags.push('API');
  if (name.includes('hustle') || name.includes('赚钱')) tags.push('副业');
  if (name.includes('prompt') || name.includes('prompt-engineering')) tags.push('Prompt工程');
  if (content.includes('Agent') || content.includes('agent')) tags.push('AI Agent');
  if (content.includes('自动化') || content.includes('automation')) tags.push('自动化');
  if (tags.length === 0) tags.push('技术文档');
  return tags;
}

function inferPrice(filename, content) {
  const len = content.length;
  if (len > 15000) return '200';  // 大型文档
  if (len > 5000) return '150';   // 中型文档
  return '100';                    // 小型文档
}

function estimateQualityScore(content) {
  let score = 0;
  const len = content.length;

  // Length scoring (0-30 points)
  if (len > 10000) score += 30;
  else if (len > 5000) score += 20;
  else if (len > 2000) score += 10;

  // Heading structure (0-20 points)
  const headings = (content.match(/^#{1,3}\s+/gm) || []).length;
  if (headings >= 5) score += 20;
  else if (headings >= 3) score += 15;
  else if (headings >= 1) score += 10;

  // Code examples (0-15 points)
  const codeBlocks = (content.match(/```/g) || []).length / 2;
  if (codeBlocks >= 3) score += 15;
  else if (codeBlocks >= 1) score += 10;

  // Lists/structured content (0-15 points)
  const listItems = (content.match(/^[\s]*[-*]\s+/gm) || []).length;
  if (listItems >= 10) score += 15;
  else if (listItems >= 5) score += 10;
  else if (listItems >= 1) score += 5;

  // No spam indicators (0-10 points)
  const spamWords = ['加微信', '加群', '免费领取', '限时优惠', '扫码'];
  const spamCount = spamWords.filter(w => content.includes(w)).length;
  if (spamCount === 0) score += 10;
  else if (spamCount <= 1) score += 5;

  // Paragraph density (0-10 points)
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 50).length;
  if (paragraphs >= 5) score += 10;
  else if (paragraphs >= 3) score += 5;

  // Normalize to 0-1 range
  const normalized = Math.min(score / 100, 1.0);
  return Math.round(normalized * 100) / 100;
}

async function publishAsset(filePath, dryRun) {
  const filename = path.basename(filePath);
  log(`Processing: ${filename}`);

  // Read content
  const content = fs.readFileSync(filePath, 'utf-8');
  const title = extractTitle(content, filename);
  const description = extractDescription(content);
  const tags = inferTags(filename, content);
  const price = inferPrice(filename, content);
  const fileSize = Buffer.byteLength(content, 'utf-8');
  const qualityScore = estimateQualityScore(content);

  log(`  Title: ${title}`);
  log(`  Price: ${price} UT`);
  log(`  Tags: ${tags.join(', ')}`);
  log(`  Quality score: ${qualityScore}`);

  // Quality gate: must be >= 0.7
  if (qualityScore < 0.7) {
    log(`  SKIPPED: Quality score ${qualityScore} < 0.7 threshold`);
    return { filename, title, price, quality_score: qualityScore, status: 'skipped_low_quality' };
  }

  if (dryRun) {
    log(`  [DRY-RUN] Would upload and create asset`);
    return { filename, title, price, status: 'dry_run' };
  }

  // Step 1: Upload file
  log(`  Uploading...`);
  const uploadData = uploadFile(filePath);
  const storageKey = uploadData.filename;
  log(`  Uploaded: ${storageKey}`);

  // Step 2: Create asset via quick-upload
  const body = {
    storage_key: storageKey,
    file_name: filename,
    file_size: fileSize,
    file_type: uploadData.content_type || 'text/markdown',
    title: title,
    description: description,
    tags: tags,
    price_ut: price,
  };

  const creds = getCurrentProfile();
  const res = await makeRequest('POST', '/api/v1/digital-assets/quick-upload', authHeaders(creds), body);

  if (res.statusCode === 422) throw new Error(`422: ${JSON.stringify(res.data)}`);
  if (res.statusCode >= 500) throw new Error(`HTTP ${res.statusCode}`);
  if (res.data && res.data.code !== 0) throw new Error(`API ${res.data.code}: ${res.data.message}`);

  const asset = res.data ? res.data.data : null;
  log(`  Created: ${asset ? asset.id : 'unknown'}`);

  return {
    filename,
    title,
    price,
    asset_id: asset ? asset.id : null,
    status: asset ? (asset.status || 'created') : 'unknown',
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const singleFile = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;

  // Find products
  let files;
  if (singleFile) {
    files = [path.resolve(singleFile)];
  } else {
    files = fs.readdirSync(PRODUCTS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(PRODUCTS_DIR, f));
  }

  if (files.length === 0) {
    log('No .md files found in products/');
    return;
  }

  log(`Found ${files.length} products to publish`);
  if (dryRun) log('[DRY-RUN MODE]');

  const results = [];
  for (const file of files) {
    try {
      const res = await publishAsset(file, dryRun);
      results.push(res);
    } catch (e) {
      log(`  ERROR: ${e.message}`);
      results.push({ filename: path.basename(file), status: 'error', error: e.message });
    }
  }

  // Summary
  const summary = {
    timestamp: new Date().toISOString(),
    total: results.length,
    success: results.filter(r => r.status !== 'error').length,
    failed: results.filter(r => r.status === 'error').length,
    results,
  };

  result(summary);
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
