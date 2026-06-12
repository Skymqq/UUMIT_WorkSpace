#!/usr/bin/env node
/**
 * UUMit Skill — 交付巡航脚本（60 分钟）
 *
 * 职责：
 *   1. 以 GET /api/v1/orders 为主数据源，找到用户作为执行方（seller/worker）
 *      且尚未交付的活跃订单。task 状态不可靠，order 才是交付的真实载体。
 *   2. 为每个待交付订单拼好完整的交付端点和幂等键，输出 required_actions
 *      让 Agent 在同一个 cron 回合里直接执行，不依赖 Agent 的主动推断。
 *   3. 收集已审核待发布资产候选（asset_publish_candidates）。
 *
 * 为什么不在脚本里完成交付：交付需要 AI 理解任务内容并生成交付物，
 * 脚本无法替代这部分；脚本负责数据发现，Agent 负责内容生成 + 调用接口。
 *
 * Usage:
 *   node cruise_deliver_tick.js [--dry-run]
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

function makeRequest(method, urlPath, headers, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers, ...(extraHeaders || {}) };
    if (bodyStr) reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    const urlObj = new URL(BASE_URL + urlPath);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers: reqHeaders,
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

// 判断订单是否是"待交付"状态（用户作为执行方）
function isDeliverable(order, userId) {
  const status = (order.status || '').toLowerCase();
  // 常见的"进行中/待交付"状态枚举，覆盖不同后端命名
  const deliverableStatuses = ['active', 'in_progress', 'accepted', 'working', 'processing', 'pending_delivery'];
  if (!deliverableStatuses.includes(status)) return false;

  // 确认用户是卖方/执行方（不是买方）
  const sellerId = order.seller_id || order.assignee_id || order.worker_id || order.executor_id;
  const buyerId = order.buyer_id || order.requester_id || order.owner_id;
  if (sellerId && String(sellerId) === String(userId)) return true;
  if (buyerId && String(buyerId) === String(userId)) return false; // 用户是买方，无需交付
  // 无法判断角色时保守包含（由 Agent 进一步判断）
  return true;
}

async function collectDeliverCandidates(headers, userId) {
  const cfg = loadAutonomyConfig();
  const applyCfg = cfg.auto_apply || {};
  const autoDeliverCfg = cfg.auto_deliver || {};

  if (applyCfg.auto_process_tasks === false) {
    return {
      task_process_candidates: [],
      asset_publish_candidates: [],
      skipped_reason: 'auto_process_tasks disabled',
    };
  }

  const noConfirmDeliver = autoDeliverCfg.enabled !== false && autoDeliverCfg.no_confirm_required !== false;
  const actionState = readActionState();
  const result = {
    task_process_candidates: [],
    asset_publish_candidates: [],
  };

  // ── 1. 主数据源：订单列表 ──────────────────────────────────────────────
  // 以 orders 为主，而非 tasks，因为接单后创建的是 order，task status 不可靠
  const activeOrders = [];
  try {
    const ordRes = await makeRequest('GET', '/api/v1/orders?page_size=50', headers);
    if (ordRes.statusCode === 200 && ordRes.data.code === 0) {
      for (const ord of (ordRes.data.data?.items || [])) {
        if (isDeliverable(ord, userId)) {
          activeOrders.push(ord);
          log(`[deliver] 发现待交付订单 ${ord.id}，状态: ${ord.status}`);
        }
      }
    }
  } catch (e) {
    log(`[deliver] orders 查询失败: ${e.message}`);
  }

  // ── 2. 兜底数据源：我的申请（已接受状态）────────────────────────────────
  // 用于订单信息不完整时补充 task 信息
  const acceptedApplicationTaskIds = new Set();
  try {
    const appRes = await makeRequest('GET', '/api/v1/tasks/applications/mine?page_size=50', headers);
    if (appRes.statusCode === 200 && appRes.data.code === 0) {
      for (const app of (appRes.data.data?.items || [])) {
        const appStatus = (app.status || '').toLowerCase();
        if (['accepted', 'active', 'in_progress', 'working'].includes(appStatus)) {
          const tid = app.task_id || app.task?.id;
          if (tid) acceptedApplicationTaskIds.add(tid);
        }
      }
    }
  } catch (_) {}

  // ── 3. 合并 order 信息与 task 信息 ──────────────────────────────────────
  // 先按 order 建候选，再用 acceptedApplicationTaskIds 补充没有 order 的情况
  const processedTaskIds = new Set();

  for (const order of activeOrders) {
    const taskId = order.task_id || order.task?.id;
    const orderId = order.id;
    const ikey = `deliver-order-${orderId}`;
    if (actionState.actions?.[ikey]?.status === 'done') continue;

    // 获取任务详情（补充 description 等字段）
    let taskDetail = order.task || {};
    if (taskId && !taskDetail.description) {
      try {
        const tRes = await makeRequest('GET', `/api/v1/tasks/${taskId}`, headers);
        if (tRes.statusCode === 200 && tRes.data.code === 0) {
          taskDetail = tRes.data.data || taskDetail;
        }
      } catch (_) {}
    }

    if (taskId) processedTaskIds.add(taskId);

    const deliveryCommand = `node {UUMIT_SKILL_DIR}/scripts/rest_request.js POST /api/v1/orders/${orderId}/deliverables --file {UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-delivery.json --idempotency-key ${ikey}`;

    result.task_process_candidates.push({
      order_id: orderId,
      task_id: taskId || null,
      title: taskDetail.title || order.title || `订单 ${orderId}`,
      description: (taskDetail.description || order.description || '').slice(0, 500),
      status: order.status,
      bounty: Number(taskDetail.bounty_amount || order.amount || order.bounty_amount) || 0,
      category: taskDetail.category || order.category || '',
      mode: taskDetail.mode || order.mode || '',
      delivery_ready: true,
      delivery_endpoint: `POST /api/v1/orders/${orderId}/deliverables`,
      delivery_idempotency_key: ikey,
      payload_hint: '{"deliverables":[{"url":"","name":"交付说明"}],"deliverable_type":"text","content":"<结果正文>"}',
      no_confirm_required: noConfirmDeliver,
      // Agent 必须执行的完整命令（无需推断，直接运行）
      required_action: {
        step1: '根据 description 生成交付内容，写入 {UUMIT_SKILL_DIR}/memory/sessions/{SESSION_ID}/request-delivery.json',
        step2: deliveryCommand,
        must_execute: true,
        note: 'step2 是 Bash 命令，必须实际运行，不能只分析',
      },
    });
  }

  // 兜底：有被接受的申请但没有找到对应 order（可能 order API 返回有限制）
  for (const taskId of acceptedApplicationTaskIds) {
    if (processedTaskIds.has(taskId)) continue;
    const ikey = `deliver-task-${taskId}`;
    if (actionState.actions?.[ikey]?.status === 'done') continue;

    let taskDetail = {};
    try {
      const tRes = await makeRequest('GET', `/api/v1/tasks/${taskId}`, headers);
      if (tRes.statusCode === 200 && tRes.data.code === 0) taskDetail = tRes.data.data || {};
    } catch (_) {}

    result.task_process_candidates.push({
      order_id: null,
      task_id: taskId,
      title: taskDetail.title || `任务 ${taskId}`,
      description: (taskDetail.description || '').slice(0, 500),
      status: taskDetail.status || 'unknown',
      bounty: Number(taskDetail.bounty_amount) || 0,
      category: taskDetail.category || '',
      mode: taskDetail.mode || '',
      delivery_ready: false,
      delivery_endpoint: null,
      no_confirm_required: noConfirmDeliver,
      required_action: {
        note: '未找到关联订单 order_id，无法直接交付。请先调用 GET /api/v1/orders 确认订单状态，或联系任务发布方。',
        must_execute: false,
      },
    });
  }

  // ── 4. 已审核待发布资产 ──────────────────────────────────────────────────
  try {
    const assRes = await makeRequest('GET', '/api/v1/digital-assets?page=1&page_size=20', headers);
    if (assRes.statusCode === 200 && assRes.data.code === 0) {
      const pendingAssets = (assRes.data.data?.items || []).filter(
        a => a.content_review_status === 'approved' && a.status !== 'published',
      );
      for (const asset of pendingAssets.slice(0, 10)) {
        const suggestedPrice = asset.suggested_price_ut || asset.suggested_price || null;
        result.asset_publish_candidates.push({
          asset_id: asset.id,
          title: asset.name || asset.title,
          category: asset.category || '',
          status: asset.status || null,
          suggested_price_ut: suggestedPrice,
          suggested_action: suggestedPrice
            ? '可向用户展示建议价格；用户确认后发布。'
            : '缺少建议价格，需用户确认后发布。',
        });
      }
    }
  } catch (_) {}

  result.agent_instruction = noConfirmDeliver
    ? [
        '交付巡航完成。',
        `发现 ${result.task_process_candidates.filter(t => t.delivery_ready).length} 个待交付订单。`,
        '对每个 delivery_ready=true 的候选，必须按 required_action 执行：',
        '① 理解 description，生成交付内容，写入 request-delivery.json；',
        '② 直接运行 required_action.step2 中的 Bash 命令（rest_request.js）——这一步是强制的，不能只分析不执行；',
        '③ 执行成功后通知用户任务名和交付结果摘要。',
        'delivery_ready=false 的候选说明缺少 order_id，通知用户查看订单状态。',
      ].join(' ')
    : '交付巡航完成。auto_deliver 未开启，请向用户展示待交付订单，等待用户确认后再执行。';

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
    console.log(JSON.stringify({ ok: true, status: 'dry_run', module: 'deliver', dry_run: true }));
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

  log('交付巡航：查询待交付订单...');
  const deliverResult = await collectDeliverCandidates(headers, userId);
  console.log(JSON.stringify({
    ok: true,
    status: 'collected',
    module: 'deliver',
    dry_run: false,
    user_id: userId,
    checked_at: new Date().toISOString(),
    ...deliverResult,
  }));
}

main().catch(err => {
  console.log(JSON.stringify({ ok: false, status: 'failed', module: 'deliver', error: err.message, retryable: true }));
  process.exit(1);
});
