#!/usr/bin/env node
/**
 * UUMit Skill — 工作候选巡航脚本
 *
 * 只收集可接任务、推送、申请、已承接任务和待发布资产候选。
 * 脚本不判断是否可做，不执行写操作；候选处理交给 Agent 按 SKILL/SAFETY 判断。
 *
 * Usage:
 *   node cruise_work_tick.js [--dry-run]
 *
 * Credentials: env vars UUMIT_API_KEY + UUMIT_USER_ID, or auth file
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

function loadCredentials() {
  let apiKey = process.env.UUMIT_API_KEY || '';
  let userId = process.env.UUMIT_USER_ID || '';
  if (apiKey && userId) return { apiKey, userId };
  const authPath = path.join(SKILL_DIR, 'memory', 'uumit-auth.json');
  try {
    if (fs.existsSync(authPath)) {
      const auth = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
      apiKey = auth.cached_api_key || '';
      userId = auth.cached_user_id || '';
    }
  } catch (_) {}
  return { apiKey, userId };
}

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
  const cfgPath = path.join(SKILL_DIR, 'memory', 'runtime', 'agent-autonomy-config.json');
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  } catch (_) {
    return {};
  }
}

function readActionState() {
  try {
    if (!fs.existsSync(DEFAULT_ACTION_STATE_FILE)) return { actions: {} };
    const state = JSON.parse(fs.readFileSync(DEFAULT_ACTION_STATE_FILE, 'utf-8'));
    return { ...state, actions: state.actions || {} };
  } catch (_) {
    return { actions: {} };
  }
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

async function collectWorkCandidates(headers) {
  const cfg = loadAutonomyConfig();
  const applyCfg = cfg.auto_apply || {};
  if (applyCfg.enabled === false) {
    return { skipped: true, reason: 'auto_apply disabled' };
  }

  const autoRespondPushes = applyCfg.auto_respond_pushes !== false;
  const autoProcessTasks = applyCfg.auto_process_tasks !== false;
  const recommendTaskLimit = Math.max(1, Number(applyCfg.recommend_task_limit) || 5);
  const actionState = readActionState();
  const day = todayKey();

  const result = {
    account: {},
    action_state: {
      file: DEFAULT_ACTION_STATE_FILE,
      total_recorded_actions: Object.keys(actionState.actions || {}).length,
      note: '脚本只读取动作记录做去重/重试提示；是否执行动作仍由 Agent 判断。',
    },
    task_market: {
      candidates: [],
      recommended_task_candidates: [],
      push_candidates: [],
    },
    task_owner: {
      received_application_candidates: [],
    },
    task_processing: {
      task_process_candidates: [],
    },
    assets: {
      asset_publish_candidates: [],
    },
    notifications: [],
  };

  let pendingCount = 0;
  try {
    const res = await makeRequest('GET', '/api/v1/tasks/applications/mine?status=pending&page_size=1', headers);
    if (res.statusCode === 200 && res.data.code === 0) {
      pendingCount = res.data.data?.total || 0;
    }
  } catch (_) {}

  result.account.pending_application_count = pendingCount;

  try {
    const res = await makeRequest('GET', '/api/v1/tasks/hall?page_size=20', headers);
    if (res.statusCode === 200 && res.data.code === 0) {
      const tasks = res.data.data?.items || [];
      for (const task of tasks) {
        const bounty = Number(task.bounty_amount) || 0;
        const actionKey = `apply-task-${task.id}`;
        result.task_market.candidates.push({
          task_id: task.id,
          title: task.title,
          description: (task.description || '').slice(0, 200),
          bounty,
          category: task.category || '',
          mode: task.mode || '',
          recommendation_hint: '脚本仅拉取候选；是否可接、是否自动申请由 Agent 结合技能和安全边界判断。',
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

  result.task_market.recommended_task_candidates = result.task_market.candidates
    .slice()
    .sort((a, b) => {
      const bountyDelta = (b.bounty || 0) - (a.bounty || 0);
      if (bountyDelta !== 0) return bountyDelta;
      return String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hans-CN');
    })
    .slice(0, recommendTaskLimit)
    .map((task, index) => ({
      ...task,
      rank: index + 1,
      recommend_reason: [
        `悬赏 ${task.bounty} UT`,
        task.mode ? `任务模式：${task.mode}` : '任务模式未填写',
        task.category ? `分类：${task.category}` : '分类未填写',
        '脚本不判断是否可接；Agent 需结合技能、工具、数据、权限和安全边界决定是否自动申请',
      ],
    }));

  if (autoRespondPushes) {
    try {
      const res = await makeRequest('GET', '/api/v1/tasks/pushes?status=pending&page_size=10', headers);
      if (res.statusCode === 200 && res.data.code === 0) {
        const pushes = res.data.data?.items || [];
        for (const push of pushes) {
          const pushId = push.id;
          result.task_market.push_candidates.push({
            push_id: push.id,
            task_id: push.task_id || push.task?.id,
            title: push.title || push.task?.title,
            description: (push.description || push.task?.description || '').slice(0, 200),
            bounty: Number(push.bounty_amount || push.task?.bounty_amount) || 0,
            category: push.category || push.task?.category || '',
            mode: push.mode || push.task?.mode || '',
            action: actionMetadata(actionState, {
              action: 'accept_push',
              targetId: pushId,
              actionKey: `accept-push-${pushId}`,
              idempotencyKey: `auto-push-${pushId}`,
              sessionFile: 'memory/sessions/<session_id>/request-task.json',
            }),
          });
        }
      }
    } catch (_) {}
  }

  if (autoProcessTasks) {
    try {
      const res = await makeRequest('GET', '/api/v1/tasks?status=active&page_size=20', headers);
      if (res.statusCode === 200 && res.data.code === 0) {
        const tasks = res.data.data?.items || res.data.data?.active || [];
        for (const task of tasks) {
          const taskId = task.id;
          result.task_processing.task_process_candidates.push({
            task_id: task.id,
            title: task.title,
            description: (task.description || '').slice(0, 200),
            status: task.status || null,
            bounty: Number(task.bounty_amount) || 0,
            category: task.category || '',
            mode: task.mode || '',
            delivery_protocol: {
              agent_decides_self_deliverable: true,
              decision_hint: 'Agent 自行判断是否可做、是否可安全交付；脚本只提供交付记录协议。',
              request_file: 'memory/sessions/<session_id>/request-delivery.json',
              delivery_endpoint_candidates: [
                'POST /api/v1/orders/{order_id}/deliverables',
                'POST /api/v1/transactions/{transaction_id}/deliver',
              ],
            },
            action: actionMetadata(actionState, {
              action: 'deliver_task',
              targetId: taskId,
              actionKey: `deliver-task-${taskId}`,
              idempotencyKey: `deliver-task-${taskId}`,
              sessionFile: 'memory/sessions/<session_id>/request-delivery.json',
            }),
          });
        }
      }
    } catch (_) {}
  }

  try {
    const res = await makeRequest('GET', '/api/v1/tasks?page_size=20', headers);
    if (res.statusCode === 200 && res.data.code === 0) {
      const tasks = res.data.data?.items || [];
      for (const task of tasks.slice(0, 10)) {
        const taskId = task.id;
        if (!taskId) continue;
        try {
          const appRes = await makeRequest('GET', `/api/v1/tasks/${taskId}/applications?status=pending&page_size=10`, headers);
          if (appRes.statusCode !== 200 || appRes.data.code !== 0) continue;
          const applications = appRes.data.data?.items || [];
          for (const application of applications) {
            const applicationId = application.id;
            result.task_owner.received_application_candidates.push({
              task_id: taskId,
              task_title: task.title,
              task_description: (task.description || '').slice(0, 200),
              bounty: Number(task.bounty_amount) || 0,
              application_id: application.id,
              applicant_id: application.applicant_id || application.user_id || application.skill_owner_id || null,
              applicant_name: application.applicant_name || application.user_name || application.skill_owner_name || null,
              skill_id: application.skill_id || null,
              skill_title: application.skill_title || application.skill?.title || null,
              message: (application.message || application.apply_message || '').slice(0, 200),
              proposed_price: application.proposed_price || application.proposed_price_ut || null,
              status: application.status || 'pending',
              decision_hint: '脚本只拉取别人对用户任务的申请；是否接受由 Agent 根据申请说明、技能匹配、价格和交付风险判断。',
              action: actionMetadata(actionState, {
                action: 'accept_application',
                targetId: applicationId,
                actionKey: `accept-application-${applicationId}`,
                idempotencyKey: `accept-application-${applicationId}`,
                sessionFile: null,
              }),
            });
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  try {
    const res = await makeRequest('GET', '/api/v1/digital-assets?page=1&page_size=20', headers);
    if (res.statusCode === 200 && res.data.code === 0) {
      const assets = res.data.data?.items || [];
      const pendingAssets = assets.filter(asset => asset.content_review_status === 'approved' && asset.status !== 'published');
      for (const asset of pendingAssets.slice(0, 10)) {
        const suggestedPrice = asset.suggested_price_ut || asset.suggested_price || null;
        result.assets.asset_publish_candidates.push({
          asset_id: asset.id,
          title: asset.name || asset.title,
          category: asset.category || '',
          status: asset.status || null,
          content_review_status: asset.content_review_status || null,
          suggested_price_ut: suggestedPrice,
          pricing_reason: asset.pricing_reason || asset.price_reason || null,
          suggested_action: suggestedPrice
            ? 'Agent 可向用户展示建议价格；用户确认后调用 batch_publish.js --publish --asset-id 或资产发布接口。'
            : '建议价格未获取到；Agent 需要补充定价判断或询问用户。',
          action: actionMetadata(actionState, {
            action: 'publish_asset',
            targetId: asset.id,
            actionKey: `publish-asset-${asset.id}`,
            idempotencyKey: `publish-asset-${asset.id}`,
            sessionFile: 'memory/sessions/<session_id>/request-asset.json',
          }),
        });
      }
    }
  } catch (_) {}

  result.agent_instruction = [
    '脚本已按模块输出 task_market、task_owner、task_processing、assets 和 account。',
    '脚本只负责拉取候选并附带动作记录状态，不按金额/类别/模式过滤，也不判断是否可做。',
    '所有可接判断、风险判断、技能匹配、自动申请、自动接受推送、接受别人申请、自动处理任务和资产发布建议均由 Agent 自行完成。',
    'Agent 成功执行动作后，必须运行候选 action.record_command_after_success 记录结果；失败时使用 cruise_action_record.js --status failed --retryable true/false 记录失败，避免下轮重复或丢失重试。',
    '请根据用户已上架的技能（GET /api/v1/skills）、当前 Agent 能力、工具、数据、权限和 SAFETY.md 判断哪些任务可接。',
    '没有可自动执行、需要确认或需要用户知道的事项时，应保持静默，不要向用户报告 ok/status/计数字段。',
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
    switch (arg) {
      case '--dry-run':
        dryRun = true;
        break;
      default:
        failCli(`unknown argument: ${arg}`);
    }
  }

  if (dryRun) {
    console.log(JSON.stringify({
      ok: true,
      status: 'dry_run',
      dry_run: true,
      work_candidates: { skipped: true, reason: 'dry_run' },
    }));
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

  log('收集工作候选...');
  const workCandidates = await collectWorkCandidates(headers);
  console.log(JSON.stringify({
    ok: true,
    status: 'collected',
    dry_run: false,
    user_id: userId,
    checked_at: new Date().toISOString(),
    work_candidates: workCandidates,
  }));
}

main().catch(err => {
  console.log(JSON.stringify({ ok: false, status: 'failed', error: err.message, retryable: true }));
  process.exit(1);
});
