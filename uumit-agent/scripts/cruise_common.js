#!/usr/bin/env node
/**
 * UUMit Cruise Common — 巡航系统公共模块
 *
 * 从 4 个 tick 脚本中抽取的重复代码，统一维护。
 * 各 tick 脚本通过 require('./cruise_common') 使用。
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');

// === Base URL Resolution ===

function resolveBaseUrl() {
  if (process.env.UUMIT_BASE_URL) return process.env.UUMIT_BASE_URL;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'memory', 'uumit-config.json'), 'utf8'));
    if (cfg.base_url) return cfg.base_url;
  } catch (_) {}
  return 'https://api.uumit.com';
}

const BASE_URL = resolveBaseUrl();
const baseUrlObj = new URL(BASE_URL);
const isHttps = baseUrlObj.protocol === 'https:';

// === Logging ===

function log(msg) { console.error(msg); }

// === CLI Helpers ===

function failCli(message) {
  log(JSON.stringify({ error: message }));
  process.exit(2);
}

function parseDryRun(args) {
  for (const arg of args) {
    if (arg === '--dry-run') return true;
  }
  return false;
}

// === HTTP Request ===

function makeRequest(method, urlPath, baseHeaders, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = { ...baseHeaders, ...(extraHeaders || {}) };
    if (bodyStr) {
      headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const urlObj = new URL(BASE_URL + urlPath);
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
        catch (_) { resolve({ statusCode: res.statusCode, data: { raw: raw.slice(0, 200) } }); }
      });
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// === Auth ===

function loadAuth() {
  const { loadCredentials } = require('./auth_common');
  const { apiKey, userId } = loadCredentials();
  if (!apiKey || !userId) {
    failCli('Credentials not found. Run scripts/auth.js first.');
  }
  return { apiKey, userId };
}

function authHeaders(creds) {
  return {
    'Content-Type': 'application/json',
    'X-Api-Key': creds.apiKey,
    'X-Platform-User-Id': creds.userId,
  };
}

// === State Management ===

const ACTION_STATE_FILE = path.join(SKILL_DIR, 'memory', 'runtime', 'cruise-actions.json');

function readActionState() {
  try {
    if (!fs.existsSync(ACTION_STATE_FILE)) return { actions: {} };
    const state = JSON.parse(fs.readFileSync(ACTION_STATE_FILE, 'utf-8'));
    return { ...state, actions: state.actions || {} };
  } catch (_) { return { actions: {} }; }
}

function writeActionState(state) {
  const dir = path.dirname(ACTION_STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ACTION_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function readState(stateFile) {
  try {
    if (!fs.existsSync(stateFile)) return {};
    return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  } catch (_) { return {}; }
}

function writeState(stateFile, state) {
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
}

// === Config ===

function loadAutonomyConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'memory', 'runtime', 'agent-autonomy-config.json'), 'utf-8'));
  } catch (_) { return {}; }
}

// === Action Metadata ===

function actionMetadata(actionState, { action, targetId, actionKey, idempotencyKey, sessionFile }) {
  const record = actionState.actions?.[actionKey] || null;
  const status = record?.status || 'new';
  const alreadyDone = status === 'done';
  const retryAllowed = !alreadyDone
    && status !== 'in_progress'
    && (status !== 'failed' || record.retryable !== false);
  const recordCommand = [
    'node {UUMIT_SKILL_DIR}/scripts/cruise_action_record.js',
    `--action ${action}`,
    `--target-id ${targetId}`,
    `--action-key ${actionKey}`,
    `--idempotency-key ${idempotencyKey}`,
    '--status done',
  ].join(' ');
  return {
    action_key: actionKey,
    suggested_action: action,
    target_id: targetId,
    idempotency_key: idempotencyKey,
    session_file: sessionFile || null,
    already_done: alreadyDone,
    retry_allowed: retryAllowed,
    action_status: status,
    attempt_count: record?.attempt_count || 0,
    last_attempt_at: record?.last_attempt_at || null,
    last_result: record?.result_summary || record?.last_error || null,
    record_command_after_success: recordCommand,
  };
}

// === Date Helpers ===

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// === Error Handler Factory ===

function errorHandler(moduleName) {
  return (err) => {
    console.log(JSON.stringify({
      ok: false,
      status: 'failed',
      module: moduleName,
      error: err.message,
      retryable: true,
    }));
    process.exit(1);
  };
}

// === Exports ===

module.exports = {
  SKILL_DIR,
  BASE_URL,
  isHttps,
  log,
  failCli,
  parseDryRun,
  makeRequest,
  loadAuth,
  authHeaders,
  readActionState,
  writeActionState,
  readState,
  writeState,
  loadAutonomyConfig,
  actionMetadata,
  todayKey,
  errorHandler,
  ACTION_STATE_FILE,
};
