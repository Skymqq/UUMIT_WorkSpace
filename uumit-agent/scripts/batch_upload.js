#!/usr/bin/env node
/**
 * UUMit Skill — 批量上架服务技能脚本
 *
 * Usage:
 *   node batch_upload.js <SKILLS_JSON_FILE> --dry-run
 *   node batch_upload.js <SKILLS_JSON_FILE> --confirmed [--idempotency-prefix KEY]
 *
 * Credentials: env vars UUMIT_API_KEY + UUMIT_USER_ID, or auth file
 * stdout: final JSON; stderr: progress and diagnostics
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SKILL_DIR_BU = path.resolve(__dirname, '..');
function _resolveBaseUrl() {
  if (process.env.UUMIT_BASE_URL) return process.env.UUMIT_BASE_URL;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(SKILL_DIR_BU, 'memory', 'uumit-config.json'), 'utf8'));
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

function normalizeKeyPart(value) {
  return String(value || 'item').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 48) || 'item';
}

function failCli(message) {
  log(JSON.stringify({ error: message }));
  process.exit(2);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    failCli('Usage: node batch_upload.js <SKILLS_JSON_FILE> --dry-run | --confirmed [--idempotency-prefix KEY]');
  }

  const skillsFile = args[0];
  let dryRun = false;
  let confirmed = false;
  let idempotencyPrefix = `skill-batch-${path.basename(skillsFile, path.extname(skillsFile))}`;

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        dryRun = true;
        break;
      case '--confirmed':
        confirmed = true;
        break;
      case '--idempotency-prefix':
        if (i + 1 >= args.length || args[i + 1].startsWith('--')) {
          failCli('missing value for --idempotency-prefix');
        }
        idempotencyPrefix = args[++i];
        if (!idempotencyPrefix.trim()) failCli('--idempotency-prefix cannot be empty');
        break;
      default:
        failCli(`unknown argument: ${args[i]}`);
    }
  }

  if (dryRun && confirmed) {
    failCli('--dry-run and --confirmed cannot be used together');
  }

  if (!dryRun && !confirmed) {
    log(JSON.stringify({
      error: 'confirmation required',
      hint: 'Run with --dry-run first, then rerun with --confirmed after user confirmation.',
    }));
    process.exit(1);
  }

  if (!fs.existsSync(skillsFile)) {
    log(JSON.stringify({ error: `file not found: ${skillsFile}` }));
    process.exit(1);
  }

  let skills;
  try {
    skills = JSON.parse(fs.readFileSync(skillsFile, 'utf-8'));
  } catch (e) {
    log(JSON.stringify({ error: `invalid JSON: ${e.message}` }));
    process.exit(1);
  }

  if (!Array.isArray(skills)) skills = [skills];

  const preview = skills.map((skill, index) => ({
    index,
    name: skill.name || null,
    category: skill.category || null,
    pricing_model: skill.pricing_model || null,
    ut_price: skill.ut_price || null,
    idempotency_key: `${idempotencyPrefix}-${index + 1}-${normalizeKeyPart(skill.name)}`,
  }));

  if (dryRun) {
    console.log(JSON.stringify({
      dry_run: true,
      total: skills.length,
      idempotency_prefix: idempotencyPrefix,
      items: preview,
      note: 'No request was sent. Review items, then rerun with --confirmed.',
    }));
    return;
  }

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

  const results = [];
  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    const idempotencyKey = preview[i].idempotency_key;
    log(`[${i + 1}/${skills.length}] Uploading: ${skill.name || 'unnamed'}`);
    try {
      const { statusCode, data } = await makeRequest(
        'POST',
        '/api/v1/skills',
        { ...headers, 'Idempotency-Key': idempotencyKey },
        JSON.stringify(skill),
      );
      if (statusCode === 200 && data.code === 0) {
        results.push({ index: i, status: 'ok', skill_id: data.data && data.data.id, idempotency_key: idempotencyKey });
        log(`  OK: ${data.data && data.data.id}`);
      } else {
        results.push({ index: i, status: 'error', error: data.message || `HTTP ${statusCode}`, idempotency_key: idempotencyKey });
        log(`  FAIL: ${data.message || `HTTP ${statusCode}`}`);
      }
    } catch (err) {
      results.push({ index: i, status: 'error', error: err.message, idempotency_key: idempotencyKey });
      log(`  FAIL: ${err.message}`);
    }
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const failed = results.filter(r => r.status === 'error').length;
  log(`Done: ${ok} ok, ${failed} failed`);
  console.log(JSON.stringify({ total: skills.length, ok, failed, results }));
}

main().catch(err => {
  log(JSON.stringify({ error: err.message }));
  process.exit(1);
});