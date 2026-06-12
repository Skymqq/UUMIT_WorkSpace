#!/usr/bin/env node
/**
 * UUMit Skill — 巡航动作记录脚本
 *
 * 只记录 Agent 已经执行或失败的动作，不判断任务是否可做。
 *
 * Usage:
 *   node cruise_action_record.js --action apply_task --target-id <id> --action-key <key> --idempotency-key <key> --status done
 *   node cruise_action_record.js --action deliver_task --target-id <id> --action-key <key> --idempotency-key <key> --status failed --retryable true --result-summary "缺少数据"
 */
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');
const DEFAULT_ACTION_STATE_FILE = path.join(SKILL_DIR, 'memory', 'runtime', 'cruise-actions.json');

function fail(message) {
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(2);
}

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { actions: {} };
    const state = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return { ...state, actions: state.actions || {} };
  } catch (_) {
    return { actions: {} };
  }
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function parseArgs(argv) {
  const out = {
    stateFile: DEFAULT_ACTION_STATE_FILE,
    status: 'done',
    retryable: null,
    resultSummary: '',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const needValue = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) fail(`missing value for ${arg}`);
      return argv[++i];
    };

    switch (arg) {
      case '--action':
        out.action = needValue();
        break;
      case '--target-id':
        out.targetId = needValue();
        break;
      case '--action-key':
        out.actionKey = needValue();
        break;
      case '--idempotency-key':
        out.idempotencyKey = needValue();
        break;
      case '--status':
        out.status = needValue();
        break;
      case '--retryable':
        out.retryable = needValue() === 'true';
        break;
      case '--result-summary':
        out.resultSummary = needValue();
        break;
      case '--state-file':
        out.stateFile = needValue();
        break;
      default:
        fail(`unknown argument: ${arg}`);
    }
  }

  if (!out.action) fail('--action is required');
  if (!out.targetId) fail('--target-id is required');
  if (!out.actionKey) fail('--action-key is required');
  if (!out.idempotencyKey) fail('--idempotency-key is required');
  if (!['done', 'failed', 'skipped', 'in_progress'].includes(out.status)) {
    fail('--status must be one of done, failed, skipped, in_progress');
  }

  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = readJson(args.stateFile);
  const now = new Date().toISOString();
  const prev = state.actions[args.actionKey] || {};
  const attemptCount = Number(prev.attempt_count || 0) + 1;

  state.actions[args.actionKey] = {
    action: args.action,
    target_id: args.targetId,
    action_key: args.actionKey,
    idempotency_key: args.idempotencyKey,
    status: args.status,
    retryable: args.retryable,
    attempt_count: attemptCount,
    first_attempt_at: prev.first_attempt_at || now,
    last_attempt_at: now,
    result_summary: args.status === 'done' || args.status === 'skipped' ? args.resultSummary : prev.result_summary || '',
    last_error: args.status === 'failed' ? args.resultSummary : '',
  };

  state.updated_at = now;
  writeJson(args.stateFile, state);

  console.log(JSON.stringify({
    ok: true,
    state_file: args.stateFile,
    action_key: args.actionKey,
    status: args.status,
    attempt_count: attemptCount,
  }));
}

main();
