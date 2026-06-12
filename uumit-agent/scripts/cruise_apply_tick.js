#!/usr/bin/env node
/**
 * UUMit Skill — 任务申请巡航脚本（30 分钟）
 *
 * 只收集：任务大厅候选（供 Agent 匹配后主动申请）。
 * 脚本不做技能匹配，不执行写操作；申请决策交给 Agent 按 SAFETY.md 判断。
 *
 * Usage:
 *   node cruise_apply_tick.js [--dry-run]
 *
 * stdout: final JSON; stderr: progress and diagnostics
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');
const DEFAULT_ACTION_STATE_FILE = path.join(SKILL_DIR, 'memory', 'runtime', 'cruise-actions.json');

function _resolveBaseUrl() {
  if (process.env.UUMIT_BASE_URL) return process.env.UUMIT_BASE_URL;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'memory', 'uumit-config.json'), 'utf8'));
    if (cfg.base_url) return cfg.base_url;
  } catch (_) {}
  return 'https://api.uumit.com';
}

const BASE_URL = _resolveBaseUrl();
const baseUrlObj = new URL(BASE_URL);
const isHttps = baseUrlObj.protocol === 'https:';

function log(msg) { console.error(msg); }

const { loadCredentials } = require('./auth_common');

function makeRequest(method, urlPath, headers) {
  return new Promise((resolve, reject) => {
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
        catch (_) { reject(new Error(`invalid JSON: ${raw.slice(0, 200)}`)); }
      });
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function loadAutonomyConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'memory', 'runtime', 'agent-autonomy-config.json'), 'utf-8'));
  } catch (_) { return {}; }
}

function readActionState() {
  try {
    if (!fs.existsSync(DEFAULT_ACTION_STATE_FILE)) return { actions: {} };
    const state = JSON.parse(fs.readFileSync(DEFAULT_ACTION_STATE_FILE, 'utf-8'));
    return { ...state, actions: state.actions || {} };
  } catch (_) { return { actions: {} }; }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

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

async function collectApplyCandidates(headers) {
  const cfg = loadAutonomyConfig();
  const applyCfg = cfg.auto_apply || {};
  if (applyCfg.enabled === false) {
    return { skipped: true, reason: 'auto_apply disabled' };
  }

  const recommendTaskLimit = Math.max(1, Number(applyCfg.recommend_task_limit) || 5);
  const maxBounty = Number(applyCfg.auto_apply_max_bounty_ut) || 9999;
  const noConfirm = applyCfg.no_confirm_apply !== false;
  const actionState = readActionState();
  const day = todayKey();

  const result = {
    pending_application_count: 0,
    candidates: [],
    recommended_task_candidates: [],
  };

  // 当前待处理申请数（仅作上下文参考）
  try {
    const res = await makeRequest('GET', '/api/v1/tasks/applications/mine?status=pending&page_size=1', headers);
    if (res.statusCode === 200 && res.data.code === 0) {
      result.pending_application_count = res.data.data?.total || 0;
    }
  } catch (_) {}

  // 任务大厅候选
  try {
    const res = await makeRequest('GET', '/api/v1/tasks/hall?page_size=20', headers);
    if (res.statusCode === 200 && res.data.code === 0) {
      const tasks = res.data.data?.items || [];
      for (const task of tasks) {
        const bounty = Number(task.bounty_amount) || 0;
        const actionKey = `apply-task-${task.id}`;
        result.candidates.push({
          task_id: task.id,
          title: task.title,
          description: (task.description || '').slice(0, 200),
          bounty,
          category: task.category || '',
          mode: task.mode || '',
          within_auto_apply_threshold: bounty <= maxBounty,
          action: actionMetadata(actionState, {
            action: 'apply_task',
            targetId: task.id,
            actionKey,
            idempotencyKey: `auto-apply-${task.id}-${day}`,
            sessionFile: 'memory/sessions/<session_id>/request-task.json',
          }),
        });
      }
    }
  } catch (_) {}

  result.recommended_task_candidates = result.candidates
    .slice()
    .sort((a, b) => (b.bounty || 0) - (a.bounty || 0))
    .slice(0, recommendTaskLimit)
    .map((task, index) => ({
      ...task,
      rank: index + 1,
      recommend_reason: [
        `悬赏 ${task.bounty} UT`,
        task.mode ? `模式：${task.mode}` : null,
        task.category ? `分类：${task.category}` : null,
      ].filter(Boolean),
    }));

  result.auto_apply_config = {
    no_confirm_apply: noConfirm,
    max_bounty_ut: maxBounty,
    note: noConfirm
      ? 'no_confirm_apply=true：Agent 技能匹配后直接申请，不询问用户；事后通知。'
      : 'no_confirm_apply=false：每次申请前向用户确认。',
  };

  result.agent_instruction = [
    '申请巡航：输出任务大厅候选，Agent 负责技能匹配和申请决策。',
    `no_confirm_apply=${noConfirm}：匹配后${noConfirm ? '直接申请，不询问用户' : '向用户确认再申请'}。`,
    '申请时 message 由 Agent 根据匹配原因自动生成中文说明。',
    '执行后必须运行 action.record_command_after_success；失败时记录 failed。',
    '没有新候选或全部已申请时保持静默。',
  ].join(' ');

  return result;
}

function failCli(message) {
  log(JSON.stringify({ error: message }));
  process.exit(2);
}

async function main() {
  const args = process.argv.slice(2);
  let dryRun = false;
  for (const arg of args) {
    if (arg === '--dry-run') { dryRun = true; }
    else { failCli(`unknown argument: ${arg}`); }
  }

  if (dryRun) {
    console.log(JSON.stringify({ ok: true, status: 'dry_run', module: 'apply', dry_run: true }));
    return;
  }

  const { apiKey, userId } = loadCredentials();
  if (!apiKey || !userId) {
    log(JSON.stringify({ error: 'Credentials not found. Run scripts/auth.js first.' }));
    process.exit(2);
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Key': apiKey,
    'X-Platform-User-Id': userId,
  };

  log('申请巡航：收集任务大厅候选...');
  const taskMarket = await collectApplyCandidates(headers);
  console.log(JSON.stringify({
    ok: true,
    status: 'collected',
    module: 'apply',
    dry_run: false,
    user_id: userId,
    checked_at: new Date().toISOString(),
    task_market: taskMarket,
  }));
}

main().catch(err => {
  console.log(JSON.stringify({ ok: false, status: 'failed', module: 'apply', error: err.message, retryable: true }));
  process.exit(1);
});
