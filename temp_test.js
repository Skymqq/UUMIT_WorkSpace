#!/usr/bin/env node
/**
 * UUMit Skill — Auth Script (Node.js version)
 *
 * Usage:
 *   node auth.js --start [--platform <type>]  # 发起设备授权；platform 见 API_REFERENCE.md（默认 openclaw）
 *   node auth.js --wait <device_code>         # Agent 友好：单次轮询并返回结构化 JSON
 *   node auth.js --check                      # 检查现有凭证
 *   node auth.js --reset            # Clear credentials and re-auth
 *   node auth.js --cron-active      # Mark cruise schedule as active
 *   node auth.js --cruise-unavailable  # Mark cruise as unavailable
 *
 * Design: auth.js is optimized for Agent tool calls. Commands are short-lived,
 * deterministic, and return machine-readable JSON on stdout.
 *
 * Output: JSON to stdout, diagnostics to stderr
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadLocalPolicy } = require('./package_common');

const SKILL_DIR_AUTH = path.resolve(__dirname, '..');
function _resolveBaseUrl() {
  if (process.env.UUMIT_BASE_URL) return process.env.UUMIT_BASE_URL;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(SKILL_DIR_AUTH, 'memory', 'uumit-config.json'), 'utf8'));
    if (cfg.base_url) return cfg.base_url;
  } catch (_) {}
  return 'https://api.uumit.com';
}
const BASE_URL = _resolveBaseUrl();
const TIMEOUT = 15000;
const DEFAULT_AUTH_TIMEOUT_SECONDS = 600; // 10 minutes
const CRUISE_INTERVAL_SECONDS = 6 * 60 * 60;     // 6 小时：状态对账巡航
const INBOX_CRUISE_INTERVAL_SECONDS = 15 * 60;   // 15 分钟：收件箱（申请+推送）
const APPLY_CRUISE_INTERVAL_SECONDS = 30 * 60;   // 30 分钟：任务大厅申请
const DELIVER_CRUISE_INTERVAL_SECONDS = 60 * 60; // 60 分钟：已承接任务交付
// 兼容旧字段，保留引用不报错
const WORK_CRUISE_INTERVAL_SECONDS = APPLY_CRUISE_INTERVAL_SECONDS;

const SKILL_DIR = path.resolve(__dirname, '..');
const AUTH_FILE = path.join(SKILL_DIR, 'memory', 'uumit-auth.json');
const STATE_FILE = path.join(SKILL_DIR, 'memory', 'uumit-state.json');
const authCommon = require('./auth_common');

/** 须与 API_REFERENCE.md「认证与互通」中 `agent_platform_type` 枚举一致 */
const ALLOWED_AGENT_PLATFORM_TYPES = new Set([
  'openclaw',
  'claude_desktop',
  'cursor',
  'custom_mcp',
  'hermes_agent',
]);

const baseUrlObj = new URL(BASE_URL);
const isHttps = baseUrlObj.protocol === 'https:';

function log(msg) {
  console.error(msg);
}

function emitJson(payload) {
  process.stdout.write(JSON.stringify(payload) + '\n');
}

function buildScheduleDedupeKey(baseKey, intervalSeconds) {
  return `${baseKey}-${intervalSeconds}s`;
}

function buildScheduleCompatMeta(baseKey, intervalSeconds) {
  return {
    dedupe_key: buildScheduleDedupeKey(baseKey, intervalSeconds),
    legacy_dedupe_keys: [baseKey],
    schedule_version: `${baseKey}@${intervalSeconds}s`,
  };
}

function makeRequest(method, urlPath, headers = null, bodyData = null) {
  return new Promise((resolve, reject) => {
    const url = BASE_URL + urlPath;
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers: headers || { 'Content-Type': 'application/json' },
      timeout: TIMEOUT,
    };

    const mod = isHttps ? https : http;
    const req = mod.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error(`invalid JSON: ${raw.slice(0, 200)}`));
        }
      });
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

function apiRequest(method, urlPath, body = null, headers = null) {
  const h = headers || { 'Content-Type': 'application/json' };
  const bodyStr = body ? JSON.stringify(body) : null;
  return makeRequest(method, urlPath, h, bodyStr);
}

/** 解析授权绑定的宿主类型：CLI `--platform` 优先，其次 UUMIT_AGENT_PLATFORM_TYPE，默认 openclaw */
function resolveAgentPlatformType(argv) {
  const platIdx = argv.indexOf('--platform');
  const next = platIdx !== -1 ? argv[platIdx + 1] : '';
  const fromCli = next && !next.startsWith('--') ? next : '';
  const localPolicy = loadLocalPolicy(SKILL_DIR, fromCli || process.env.UUMIT_AGENT_PLATFORM_TYPE || '');
  const raw = (fromCli || localPolicy.agent_platform_type || process.env.UUMIT_AGENT_PLATFORM_TYPE || 'openclaw').trim();
  if (ALLOWED_AGENT_PLATFORM_TYPES.has(raw)) return raw;
  log(`警告: agent_platform_type="${raw}" 不在白名单，改用 custom_mcp`);
  return 'custom_mcp';
}

async function deviceAuth(agentPlatformType) {
  const resp = await apiRequest('POST', '/api/v1/auth/device-auth', {
    agent_platform_type: agentPlatformType,
  });
  if (resp.code !== 0) {
    log(`授权失败: ${resp.message}`);
    return null;
  }
  return resp.data;
}

async function pollAuth(deviceCode) {
  const resp = await apiRequest('POST', '/api/v1/auth/device-auth/poll', { device_code: deviceCode });
  const data = resp.data || {};
  const status = data.status || '';
  if (status === 'approved') return { status: 'approved', ...data };
  if (status === 'expired') { log('授权码已过期'); return { status: 'expired' }; }
  if (status === 'denied') { log('用户拒绝授权'); return { status: 'denied' }; }
  return { status: 'pending' }; // still waiting
}

async function handleApprovedAuth(result, agentPlatformType = process.env.UUMIT_AGENT_PLATFORM_TYPE || 'openclaw', profileName = '') {
  const apiKey = result.api_key;
  const userId = result.user_id;
  const policy = loadLocalPolicy(SKILL_DIR, agentPlatformType);
  saveCredentials(apiKey, userId, profileName);
  const scheduleRequest = registerCruiseSchedule();
  const inboxScheduleRequest = buildInboxCruiseScheduleRequest(policy);
  const applyScheduleRequest = buildApplyCruiseScheduleRequest(policy);
  const deliverScheduleRequest = buildDeliverCruiseScheduleRequest(policy);
  const mcpRequest = buildMcpRegistrationRequest(apiKey, userId, policy);
  const runtimeConnectRequest = buildRuntimeConnectRequest();
  const postAuth = buildPostAuthOnboarding(apiKey, userId, agentPlatformType);
  savePostAuthOnboarding(postAuth);

  log('获取账户信息...');
  let wallet = {};
  let cruise = {};
  let snapshotError = null;
  try {
    ({ wallet, cruise } = await getAccountInfo(apiKey, userId));
  } catch (e) {
    snapshotError = e.message;
    log(`账户快照获取失败，但授权凭证已保存: ${snapshotError}`);
  }
  const ut = (wallet && wallet.ut) || {};
  const profile = (cruise && cruise.profile && cruise.profile.profile) || {};
  return {
    ok: true,
    status: snapshotError ? 'authorized_with_snapshot_error' : 'authorized',
    user_id: userId,
    wallet: { ut },
    profile: {
      nickname: profile.nickname || 'unknown',
      completeness: profile.completeness || 0,
    },
    cruise: {
      registered: true,
      host_schedule_required: true,
      host_schedule_status: 'pending',
      interval_seconds: CRUISE_INTERVAL_SECONDS,
      schedule_name: 'uumit-account-cruise',
      schedule_request: scheduleRequest,
    },
    inbox_cruise: { registered: true, host_schedule_required: true, host_schedule_status: 'pending', interval_seconds: INBOX_CRUISE_INTERVAL_SECONDS, schedule_name: 'uumit-inbox-cruise', schedule_request: inboxScheduleRequest },
    apply_cruise: { registered: true, host_schedule_required: true, host_schedule_status: 'pending', interval_seconds: APPLY_CRUISE_INTERVAL_SECONDS, schedule_name: 'uumit-apply-cruise', schedule_request: applyScheduleRequest },
    deliver_cruise: { registered: true, host_schedule_required: true, host_schedule_status: 'pending', interval_seconds: DELIVER_CRUISE_INTERVAL_SECONDS, schedule_name: 'uumit-deliver-cruise', schedule_request: deliverScheduleRequest },
    runtime_connect: {
      ...runtimeConnectRequest,
      auto_started: false,
      skipped_auto_start: true,
      agent_must_start_explicitly: true,
    },
    mcp_request: mcpRequest,
    schedule_request: scheduleRequest,
    work_schedule_request: applyScheduleRequest,
    schedule_requests: [scheduleRequest, inboxScheduleRequest, applyScheduleRequest, deliverScheduleRequest],
    policy,
    post_auth: postAuth,
    next_actions: postAuth.next_actions,
    snapshot_error: snapshotError,
  };
}

async function waitForApprovedAuth(deviceCode, agentPlatformType, profileName = '') {
  log('单次轮询授权状态；Agent 应按 retry_after_seconds 重复调用 --wait。');
  const result = await pollAuth(deviceCode);
  if (result.status === 'approved') {
    return handleApprovedAuth(result, agentPlatformType, profileName);
  }
  if (result.status === 'expired' || result.status === 'denied') {
    return {
      ok: false,
      status: result.status,
      error: 'authorization_failed',
      retryable: false,
      next_command: `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --start`,
    };
  }
  return {
    ok: true,
    status: 'pending',
    retryable: true,
    retry_after_seconds: 5,
    required_next_command: `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --wait ${deviceCode}`,
    agent_loop_instruction: 'Run required_next_command again after retry_after_seconds until status is authorized, authorized_with_snapshot_error, expired, or denied.',
  };
}

function saveCredentials(apiKey, userId, profileName) {
  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (profileName && profileName !== 'default') {
    authCommon.saveProfile(profileName, apiKey, userId);
    log(`凭证已保存至 profile「${profileName}」`);
  } else {
    authCommon.saveProfile('default', apiKey, userId);
    authCommon.switchProfile('default');
    log('凭证已保存');
  }
  process.env.UUMIT_API_KEY = apiKey;
  process.env.UUMIT_USER_ID = userId;
}

function buildCruiseScheduleRequest() {
  const compat = buildScheduleCompatMeta('uumit-account-cruise', CRUISE_INTERVAL_SECONDS);
  return {
    action: 'register_schedule',
    name: 'UUMit 状态巡航',
    dedupe_key: compat.dedupe_key,
    legacy_dedupe_keys: compat.legacy_dedupe_keys,
    schedule_version: compat.schedule_version,
    interval_seconds: CRUISE_INTERVAL_SECONDS,
    run_immediately: false,
    description: 'UUMit 每 6 小时自动状态对账巡航，由 Agent 按 SKILL.md §4.1 执行。',
    agent_prompt: [
      '请每 6 小时执行一次 UUMit 状态巡航任务。',
      '第一步：运行 node {UUMIT_SKILL_DIR}/scripts/cruise_tick.js，并只在内部解析返回的 JSON，不要把原始 JSON、stdout、stderr 或完整快照直接发给用户。',
      '第二步：cruise_tick.js 只负责账户、钱包、订单、交易、审核、资料完整度等状态对账，以及 Skill 更新检查；不要在此任务里主动找可接任务。',
      '第三步：只有状态变化且需要用户行动时才通知用户；没有需要处理或值得用户知道的变化时保持静默。',
      '不得暴露密码、API Key、私有文件、浏览器会话、私有仓库、shell 访问或原始本地数据。',
    ].join(' '),
  };
}

function buildInboxCruiseScheduleRequest(policy) {
  const strictWrites = policy.write_policy === 'dry_run_then_confirm';
  const compat = buildScheduleCompatMeta('uumit-inbox-cruise', INBOX_CRUISE_INTERVAL_SECONDS);
  return {
    action: 'register_schedule',
    name: 'UUMit 收件箱巡航',
    dedupe_key: compat.dedupe_key,
    legacy_dedupe_keys: compat.legacy_dedupe_keys,
    schedule_version: compat.schedule_version,
    interval_seconds: INBOX_CRUISE_INTERVAL_SECONDS,
    run_immediately: false,
    description: 'UUMit 每 15 分钟检查别人对用户任务的申请和平台推送。',
    agent_prompt: [
      '请每 15 分钟执行一次 UUMit 收件箱巡航。',
      '第一步：运行 node {UUMIT_SKILL_DIR}/scripts/cruise_inbox_tick.js，内部解析 JSON，不要把原始输出发给用户。',
      strictWrites
        ? '第二步：只输出审核建议、风险说明和 dry-run 请求，不得自动 accept/reject。'
        : '第二步：若策略允许，可在低风险场景下自动处理申请或推送，并向用户汇报摘要。',
      strictWrites
        ? '第三步：对 push_candidates 只做匹配分析和下一步建议，不得直接提交。'
        : '第三步：对 push_candidates 判断是否匹配用户技能，仅在策略允许时才真实提交响应。',
      '无新申请和推送时保持静默。不得暴露密码、API Key、私有文件或原始数据。',
    ].join(' '),
  };
}

function buildApplyCruiseScheduleRequest(policy) {
  const strictWrites = policy.write_policy === 'dry_run_then_confirm';
  const compat = buildScheduleCompatMeta('uumit-apply-cruise', APPLY_CRUISE_INTERVAL_SECONDS);
  return {
    action: 'register_schedule',
    name: 'UUMit 申请巡航',
    dedupe_key: compat.dedupe_key,
    legacy_dedupe_keys: compat.legacy_dedupe_keys,
    schedule_version: compat.schedule_version,
    interval_seconds: APPLY_CRUISE_INTERVAL_SECONDS,
    run_immediately: false,
    description: 'UUMit 每 30 分钟浏览任务大厅，技能匹配后主动申请。',
    agent_prompt: [
      '请每 30 分钟执行一次 UUMit 申请巡航。',
      '第一步：运行 node {UUMIT_SKILL_DIR}/scripts/cruise_apply_tick.js，内部解析 JSON。',
      '第二步：调用 GET /api/v1/skills?page_size=50 获取用户技能列表，对 task_market.candidates 做语义匹配。',
      strictWrites
        ? '第三步：只输出匹配候选、理由和 dry-run 请求，不得自动提交申请。'
        : policy.auto_apply
          ? '第三步：在策略允许且无需确认时，可自动提交申请；否则先输出建议。'
          : '第三步：默认不自动提交申请，只输出建议与下一步动作。',
      '已申请（already_done=true）的任务跳过。无合适任务时保持静默。',
    ].join(' '),
  };
}

function buildDeliverCruiseScheduleRequest(policy) {
  const strictWrites = policy.write_policy === 'dry_run_then_confirm';
  const compat = buildScheduleCompatMeta('uumit-deliver-cruise', DELIVER_CRUISE_INTERVAL_SECONDS);
  return {
    action: 'register_schedule',
    name: 'UUMit 交付巡航',
    dedupe_key: compat.dedupe_key,
    legacy_dedupe_keys: compat.legacy_dedupe_keys,
    schedule_version: compat.schedule_version,
    interval_seconds: DELIVER_CRUISE_INTERVAL_SECONDS,
    run_immediately: false,
    description: 'UUMit 每 60 分钟检查已承接任务进度和待发布资产。',
    agent_prompt: [
      '请每 60 分钟执行一次 UUMit 交付巡航。',
      '第一步：运行 node {UUMIT_SKILL_DIR}/scripts/cruise_deliver_tick.js，内部解析 JSON。',
      strictWrites
        ? '第二步：可以准备交付内容和 request-delivery.json，但不得真实提交 deliverables；必须等待用户确认。'
        : policy.auto_deliver
          ? '第二步：仅在策略允许且交付边界明确时，才自动准备并提交交付。'
          : '第二步：默认只准备交付方案与 payload，不自动真实提交。',
      '第三步：无待交付订单时保持静默。任何情况下都不得暴露密码、API Key、私有文件或原始本地数据。',
    ].join(' '),
  };
}

// 兼容旧调用，返回申请巡航请求（cruise_work_tick.js 已废弃）
function buildWorkCruiseScheduleRequest() {
  return buildApplyCruiseScheduleRequest();
}

function buildMcpRegistrationRequest(apiKey, userId, policy) {
  if (!policy.mcp_enabled) {
    return {
      action: 'skip_mcp_registration',
      reason: 'disabled_by_policy',
      transport_priority: policy.transport_priority,
      platform: normalizePlatformId(policy.platform),
    };
  }
  return {
    action: 'register_mcp',
    name: 'UUMit',
    url: `${BASE_URL}/mcp/sse`,
    bridge_url: `${BASE_URL}/api/v1/mcp/bridge`,
    headers: {
      'X-Api-Key': apiKey,
      'X-Platform-User-Id': userId,
    },
  };
}

function buildRuntimeConnectRequest() {
  return {
    action: 'start_runtime_connection_if_supported',
    name: 'UUMit 实时通道',
    description: '启动 SSE 长连接，接收实时 Job 分发和 Agent 间消息。与巡航独立并存。',
    command: `node "${path.join(SKILL_DIR, 'scripts', 'runtime_connect.js')}"`,
    command_with_file_output: `node "${path.join(SKILL_DIR, 'scripts', 'runtime_connect.js')}" --output-dir "${path.join(SKILL_DIR, 'memory', 'runtime')}"`,
    background: true,
    priority: 'high',
    coexists_with: ['cruise_schedule'],
  };
}

function buildPostAuthOnboarding(apiKey, userId, agentPlatformType) {
  return {
    required: true,
    blocking_after_auth: true,
    final_response_allowed_after: 'monetizable candidate scan is completed and candidate summaries are shown to the user, or a clear scan blocker is reported',
    action: 'continue_post_auth_onboarding',
    description: '授权成功后 Agent 必须在同一工作流继续执行宿主能力与可变现资产扫描、A2A/MCP 接入信息读取；不得只回复“已授权”就停止。扫描只生成隔离候选清单，并输出给用户选择。用户逐项选择并确认后，才可上架知识商店、技能、能力或数据 API。',
    interop_debug_request: {
      action: 'fetch_interop_debug',
      command: `node "${path.join(SKILL_DIR, 'scripts', 'rest_request.js')}" GET /api/v1/interop/debug`,
      endpoint: '/api/v1/interop/debug',
    },
    host_capability_scan_request: {
      action: 'scan_host_capabilities',
      agent_platform_type: agentPlatformType,
      required: true,
      required_before_final_user_reply: true,
      scan_targets: [
        'host_tools',
        'installed_non_basic_skills',
        'mcp_servers',
        'agent_card_or_public_url',
        'safe_workflows',
        'local_documents_metadata',
        'local_reports_metadata',
        'local_templates_metadata',
        'local_datasets_metadata',
        'project_docs_metadata',
        'public_templates_or_datasets',
        'digital_assets_or_templates',
        'credential_backed_account_assets_metadata_only',
      ],
      scan_goal: 'Discover monetizable skills and documents/assets owned by the user, including but not limited to reports, documents, templates, datasets, playbooks, guides, reusable workflows, public APIs, MCP servers, and non-basic agent skills.',
      isolation_policy: {
        metadata_only: true,
        session_scoped_candidates_file: 'memory/sessions/<session_id>/monetizable-candidates.json',
        never_store_secret_values: true,
        require_user_selection_before_publish: true,
        show_candidates_to_user: true,
      },
      basic_skill_filters: [
        'generic_chat',
        'generic_search',
        'local_shell',
        'filesystem_read_write',
        'browser_control',
        'terminal_operations',
        'package_management',
        'git_operations',
        'mcp_bridge_itself',
        'system_or_debug_tools',
        'uumit_skill_self',
      ],
      basic_skill_judgement_rule: 'Agent must judge basic skills by capability boundary, not by name alone. Exclude generic host abilities such as chat, search, shell, filesystem, browser, package/git operations, system/debug helpers, and wrapper-only MCP bridges. Keep only differentiated, user-owned, auditable abilities with a clear buyer value and deliverable boundary.',
      safety_exclusions: [
        'local_shell',
        'private_files',
        'private_repositories',
        'secrets',
        'credentials',
        'passwords',
        'api_keys',
        'cookies',
        'oauth_tokens',
        'private_keys',
        'environment_variables',
        'browser_session',
        'personal_identity_information',
        'contacts_or_chat_history',
        'unredacted_customer_data',
      ],
      candidate_schema: {
        id: '<stable-local-candidate-id>',
        title: '<short user-facing name>',
        type: 'skill|knowledge_store_asset|data_api|capability|workflow|account_asset',
        source: '<host|mcp|local_metadata|public_url|user_provided>',
        suggested_listing_path: 'knowledge_store|skill|capability|data_marketplace|do_not_list',
        summary: '<what can be sold or delivered>',
        buyer_value: '<why someone would pay>',
        deliverable_boundary: '<exact output buyer receives>',
        agent_can_self_complete: true,
        agent_can_self_deliver: true,
        self_completion_reason: '<tools/data/permissions that make it feasible, or blocker>',
        privacy_risk: 'low|medium|high',
        needs_desensitization: false,
        needs_user_file_selection: false,
        suggested_price_ut: '<required market-based suggestion when listing path is not do_not_list>',
        suggested_price_range_ut: { low: '<optional>', high: '<optional>' },
        pricing_model: '<fixed|per_hour|per_day|per_use|per_query|negotiable>',
        pricing_basis: '<market samples, comparable listings, delivery cost, or insufficient market data>',
        excluded_reason: '<only when filtered or unsafe>',
      },
      user_output_requirement: 'After scanning, present a short candidate list to the user with title, type, suggested listing path, privacy risk, whether the Agent can self-complete and self-deliver, market-based suggested price/range, and next required confirmation. Prefer Knowledge Store for monetizable documents/assets. Do not publish anything automatically.',
      after_scan: 'Show only non-sensitive candidate summaries, filter out basic skills by judgement rule, mark agent_can_self_complete/agent_can_self_deliver for each candidate, call /api/v1/pricing/suggestion or inspect comparable listings to produce suggested_price_ut, and ask the user which discovered capabilities/assets may be listed on UUMit before any publish/register write call.',
    },
    a2a_onboarding_request: {
      action: 'inspect_a2a_and_mcp_entrypoints',
      a2a_url: `${BASE_URL}/a2a`,
      agent_card_url: `${BASE_URL}/.well-known/agent.json`,
      mcp_sse_url: `${BASE_URL}/mcp/sse`,
      mcp_bridge_url: `${BASE_URL}/api/v1/mcp/bridge`,
      auth_headers: {
        'X-Api-Key': apiKey,
        'X-Platform-User-Id': userId,
      },
    },
    publish_options: {
      capabilities_endpoint: '/api/v1/capabilities',
      skills_endpoint: '/api/v1/skills',
      knowledge_store_endpoint: '/api/v1/digital-assets/quick-upload',
      data_apis_endpoint: '/api/v1/data-marketplace/apis',
      require_user_confirmation: true,
      default_document_listing_path: 'knowledge_store',
    },
    next_actions: [
      'register_cruise_schedules_from_schedule_requests',
      'start_runtime_connection_if_supported',
      'register_mcp_from_mcp_request',
      'fetch_interop_debug',
      'scan_host_capabilities',
      'inspect_a2a_and_mcp_entrypoints',
      'present_monetizable_candidate_summaries_to_user',
      'ask_user_which_candidates_to_publish_or_skip',
    ],
  };
}

function savePostAuthOnboarding(postAuth) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let state = {};
  try {
    if (fs.existsSync(STATE_FILE)) {
      state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (e) { /* ignore */ }

  state.post_auth = {
    ...postAuth,
    status: 'pending',
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function registerCruiseSchedule() {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let state = {};
  try {
    if (fs.existsSync(STATE_FILE)) {
      state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (e) { /* ignore */ }

  const scheduleRequest = buildCruiseScheduleRequest();
  const inboxScheduleRequest = buildInboxCruiseScheduleRequest();
  const applyScheduleRequest = buildApplyCruiseScheduleRequest();
  const deliverScheduleRequest = buildDeliverCruiseScheduleRequest();
  const allScheduleRequests = [scheduleRequest, inboxScheduleRequest, applyScheduleRequest, deliverScheduleRequest];

  state.cruise = {
    registered: true,
    local_state_registered: true,
    host_schedule_required: true,
    host_schedule_status: 'pending',
    schedule_name: 'UUMit 状态巡航',
    interval_seconds: CRUISE_INTERVAL_SECONDS,
    schedule_request: scheduleRequest,
    updated_at: new Date().toISOString(),
  };
  state.inbox_cruise = {
    registered: true,
    local_state_registered: true,
    host_schedule_required: true,
    host_schedule_status: 'pending',
    schedule_name: 'UUMit 收件箱巡航',
    interval_seconds: INBOX_CRUISE_INTERVAL_SECONDS,
    schedule_request: inboxScheduleRequest,
    updated_at: new Date().toISOString(),
  };
  state.apply_cruise = {
    registered: true,
    local_state_registered: true,
    host_schedule_required: true,
    host_schedule_status: 'pending',
    schedule_name: 'UUMit 申请巡航',
    interval_seconds: APPLY_CRUISE_INTERVAL_SECONDS,
    schedule_request: applyScheduleRequest,
    updated_at: new Date().toISOString(),
  };
  state.deliver_cruise = {
    registered: true,
    local_state_registered: true,
    host_schedule_required: true,
    host_schedule_status: 'pending',
    schedule_name: 'UUMit 交付巡航',
    interval_seconds: DELIVER_CRUISE_INTERVAL_SECONDS,
    schedule_request: deliverScheduleRequest,
    updated_at: new Date().toISOString(),
  };
  state.schedule_requests = allScheduleRequests;

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  log('已生成巡航定时任务注册元信息：状态巡航 6 小时，收件箱巡航 15 分钟，申请巡航 30 分钟，交付巡航 60 分钟。');
  return scheduleRequest;
}

function updateCruiseStatus(status) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let state = {};
  try {
    if (fs.existsSync(STATE_FILE)) {
      state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (e) { /* ignore */ }

  state.cruise = state.cruise || {};
  state.cruise.host_schedule_status = status;
  state.cruise.updated_at = new Date().toISOString();

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  const label = { active: '已激活', unavailable: '不可用' }[status] || status;
  log(`巡航定时任务状态已更新: ${label} (${status})`);
  emitJson({ ok: true, cruise: { host_schedule_status: status } });
}

async function getAccountInfo(apiKey, userId) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Key': apiKey,
    'X-Platform-User-Id': userId,
  };
  const wallet = await apiRequest('GET', '/api/v1/wallet', null, headers);
  const cruise = await apiRequest('GET', '/api/v1/agent/cruise?include=all', null, headers);
  return { wallet: wallet.data || {}, cruise: cruise.data || {} };
}

async function main() {
  log('UUMit 授权流程');

  const args = process.argv.slice(2);

  // ── 提取 --save-as 参数 ──
  const saveAsIdx = args.indexOf('--save-as');
  const saveAsProfile = (saveAsIdx !== -1 && args[saveAsIdx + 1] && !args[saveAsIdx + 1].startsWith('--'))
    ? args[saveAsIdx + 1] : '';

  // --list: 列出所有 profile
  if (args.includes('--list')) {
    const profiles = authCommon.listProfiles();
    const current = authCommon.getActiveProfileName();
    emitJson({
      ok: true,
      current_profile: current,
      profiles: profiles.map(p => ({
        name: p.name,
        user_id: p.userId,
        updated_at: p.updatedAt,
        is_active: p.isCurrent,
      })),
    });
    return 0;
  }

  // --switch <name>: 切换活跃 profile
  const switchIdx = args.indexOf('--switch');
  if (switchIdx !== -1 && args[switchIdx + 1] && !args[switchIdx + 1].startsWith('--')) {
    const target = args[switchIdx + 1];
    if (!authCommon.switchProfile(target)) {
      emitJson({ ok: false, error: `profile「${target}」不存在，请先使用 --save-as 添加` });
      return 1;
    }
    const creds = authCommon.getProfileCredentials(target);
    log(`已切换到 profile「${target}」(user_id: ${creds.userId})`);
    emitJson({
      ok: true,
      status: 'switched',
      current_profile: target,
      user_id: creds.userId,
      hint: '后续所有 API 请求将使用当前 profile 的凭证',
    });
    return 0;
  }

  // --delete <name>: 删除 profile
  const deleteIdx = args.indexOf('--delete');
  if (deleteIdx !== -1 && args[deleteIdx + 1] && !args[deleteIdx + 1].startsWith('--')) {
    const target = args[deleteIdx + 1];
    if (!authCommon.deleteProfile(target)) {
      emitJson({ ok: false, error: `profile「${target}」不存在` });
      return 1;
    }
    log(`已删除 profile「${target}」`);
    emitJson({ ok: true, status: 'deleted', profile: target });
    return 0;
  }

  // --cron-active
  if (args.includes('--cron-active') || args.includes('--cruise-registered')) {
    updateCruiseStatus('active');
    return 0;
  }

  // --cruise-unavailable
  if (args.includes('--cruise-unavailable')) {
    updateCruiseStatus('unavailable');
    return 0;
  }

  if (args.includes('--poll') || args.includes('--no-wait') || args.includes('--code-only')) {
    emitJson({
      ok: false,
      status: 'unsupported_auth_mode',
      error: 'deprecated_auth_mode',
      retryable: false,
      supported_commands: [
        `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --start`,
        `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --wait <device_code>`,
        `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --check`,
      ],
      next_command: `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --start`,
    });
    return 1;
  }

  // --wait <device_code>
  const waitIdx = args.indexOf('--wait');
  if (waitIdx !== -1 && args[waitIdx + 1]) {
    const deviceCode = args[waitIdx + 1];
    const agentPlatformType = resolveAgentPlatformType(args);
    const output = await waitForApprovedAuth(deviceCode, agentPlatformType, saveAsProfile);
    emitJson(output);
    return output.ok === false ? 1 : 0;
  }

  // --check
  if (args.includes('--check')) {
    const creds = authCommon.getActiveCredentials();
    const profileName = authCommon.getActiveProfileName();
    if (!creds.apiKey || !creds.userId) {
      log('未找到凭证');
      emitJson({ ok: false, error: 'no_credentials', retryable: false, next_command: `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --start` });
      return 1;
    }
    log(`当前 profile「${profileName}」凭证: ${creds.userId}`);
    try {
      const { wallet, cruise } = await getAccountInfo(creds.apiKey, creds.userId);
      if (wallet && wallet.ut) {
        const agentPlatformType = resolveAgentPlatformType(args);
        const policy = loadLocalPolicy(SKILL_DIR, agentPlatformType);
        const scheduleRequest = registerCruiseSchedule();
        const inboxScheduleRequest = buildInboxCruiseScheduleRequest(policy);
        const applyScheduleRequest = buildApplyCruiseScheduleRequest(policy);
        const deliverScheduleRequest = buildDeliverCruiseScheduleRequest(policy);
        const mcpRequest = buildMcpRegistrationRequest(creds.apiKey, creds.userId, policy);
        const runtimeConnectRequest = buildRuntimeConnectRequest();
        const postAuth = buildPostAuthOnboarding(creds.apiKey, creds.userId, agentPlatformType);
        savePostAuthOnboarding(postAuth);
        const ut = wallet.ut || {};
        const profile = (cruise.profile && cruise.profile.profile) || {};
        emitJson({
          ok: true,
          status: 'already_authorized',
          user_id: creds.userId,
          current_profile: profileName,
          wallet: { ut },
          profile: {
            nickname: profile.nickname || 'unknown',
            completeness: profile.completeness || 0,
          },
          cruise: {
            registered: true,
            host_schedule_required: true,
            host_schedule_status: 'pending',
            interval_seconds: CRUISE_INTERVAL_SECONDS,
            schedule_name: 'uumit-account-cruise',
            schedule_request: scheduleRequest,
          },
          inbox_cruise: { registered: true, host_schedule_required: true, host_schedule_status: 'pending', interval_seconds: INBOX_CRUISE_INTERVAL_SECONDS, schedule_name: 'uumit-inbox-cruise', schedule_request: inboxScheduleRequest },
          apply_cruise: { registered: true, host_schedule_required: true, host_schedule_status: 'pending', interval_seconds: APPLY_CRUISE_INTERVAL_SECONDS, schedule_name: 'uumit-apply-cruise', schedule_request: applyScheduleRequest },
          deliver_cruise: { registered: true, host_schedule_required: true, host_schedule_status: 'pending', interval_seconds: DELIVER_CRUISE_INTERVAL_SECONDS, schedule_name: 'uumit-deliver-cruise', schedule_request: deliverScheduleRequest },
          runtime_connect: {
            ...runtimeConnectRequest,
            auto_started: false,
            skipped_auto_start: true,
            agent_must_start_explicitly: true,
          },
          mcp_request: mcpRequest,
          schedule_request: scheduleRequest,
          work_schedule_request: applyScheduleRequest,
          schedule_requests: [scheduleRequest, inboxScheduleRequest, applyScheduleRequest, deliverScheduleRequest],
          policy,
          post_auth: postAuth,
          next_actions: postAuth.next_actions,
        });
        return 0;
      }
    } catch (e) {
      log(`凭证验证失败: ${e.message}`);
      // Try auto-switch to other profiles
      const allProfiles = authCommon.listProfiles();
      for (const p of allProfiles) {
        if (p.name === profileName) continue;
        const c = authCommon.getProfileCredentials(p.name);
        if (c.apiKey && c.userId) {
          try {
            const { wallet: w } = await getAccountInfo(c.apiKey, c.userId);
            if (w && w.ut) {
              authCommon.switchProfile(p.name);
              log(`已自动切换到 profile「${p.name}」`);
              return await main();
            }
          } catch (_) {}
        }
      }
      log('所有 profile 凭证均已失效');
      emitJson({ ok: false, error: 'credential_check_failed', retryable: true });
      return 1;
    }
    return 1;
  }

  // --reset / --force / --reauth
  if (args.some(a => ['--reset', '--force', '--reauth'].includes(a))) {
    if (fs.existsSync(AUTH_FILE)) {
      fs.unlinkSync(AUTH_FILE);
      log('已清除旧凭证，开始重新授权');
    }
  }

  if (!args.some(a => ['--start', '--reset', '--force', '--reauth'].includes(a))) {
    emitJson({
      ok: false,
      error: 'missing_auth_command',
      retryable: false,
      supported_commands: [
        `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --start`,
        `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --wait <device_code>`,
        `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --check`,
      ],
      next_command: `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --start`,
    });
    return 1;
  }

  // Check existing credentials first (unless --reset was used)
  if (!args.some(a => ['--reset', '--force', '--reauth'].includes(a))) {
    const allProfiles = authCommon.listProfiles();
    if (allProfiles.length > 0) {
      const currentProfile = authCommon.getActiveProfileName();
      const creds = authCommon.getActiveCredentials();
      log(`当前 profile「${currentProfile}」凭证: ${creds.userId || 'unknown'}`);
      log('如需重新授权，请运行 node scripts/auth.js --reset');

      const apiKey = creds.apiKey;
      const userId = creds.userId;
      if (apiKey && userId) {
      try {
        const { wallet, cruise } = await getAccountInfo(apiKey, userId);
        if (wallet && wallet.ut) {
          const agentPlatformType = resolveAgentPlatformType(args);
          const policy = loadLocalPolicy(SKILL_DIR, agentPlatformType);
          const scheduleRequest = registerCruiseSchedule();
          const inboxScheduleRequest = buildInboxCruiseScheduleRequest(policy);
          const applyScheduleRequest = buildApplyCruiseScheduleRequest(policy);
          const deliverScheduleRequest = buildDeliverCruiseScheduleRequest(policy);
          const mcpRequest = buildMcpRegistrationRequest(apiKey, userId, policy);
          const runtimeConnectRequest = buildRuntimeConnectRequest();
          const postAuth = buildPostAuthOnboarding(apiKey, userId, agentPlatformType);
          savePostAuthOnboarding(postAuth);
          const ut = wallet.ut || {};
          const profile = (cruise.profile && cruise.profile.profile) || {};
          emitJson({
            ok: true,
            status: 'already_authorized',
            user_id: userId,
            wallet: { ut },
            profile: {
              nickname: profile.nickname || 'unknown',
              completeness: profile.completeness || 0,
            },
            cruise: {
              registered: true,
              host_schedule_required: true,
              host_schedule_status: 'pending',
              interval_seconds: CRUISE_INTERVAL_SECONDS,
              schedule_name: 'uumit-account-cruise',
              schedule_request: scheduleRequest,
            },
            inbox_cruise: { registered: true, host_schedule_required: true, host_schedule_status: 'pending', interval_seconds: INBOX_CRUISE_INTERVAL_SECONDS, schedule_name: 'uumit-inbox-cruise', schedule_request: inboxScheduleRequest },
            apply_cruise: { registered: true, host_schedule_required: true, host_schedule_status: 'pending', interval_seconds: APPLY_CRUISE_INTERVAL_SECONDS, schedule_name: 'uumit-apply-cruise', schedule_request: applyScheduleRequest },
            deliver_cruise: { registered: true, host_schedule_required: true, host_schedule_status: 'pending', interval_seconds: DELIVER_CRUISE_INTERVAL_SECONDS, schedule_name: 'uumit-deliver-cruise', schedule_request: deliverScheduleRequest },
            runtime_connect: {
              ...runtimeConnectRequest,
              auto_started: false,
              skipped_auto_start: true,
              agent_must_start_explicitly: true,
            },
            mcp_request: mcpRequest,
            schedule_request: scheduleRequest,
            work_schedule_request: applyScheduleRequest,
            schedule_requests: [scheduleRequest, inboxScheduleRequest, applyScheduleRequest, deliverScheduleRequest],
            policy,
            post_auth: postAuth,
            next_actions: postAuth.next_actions,
          });
          return 0;
        }
      } catch (e) {
        log(`凭证验证失败: ${e.message}，重新授权`);
      }
    }
  }

  const agentPlatformType = resolveAgentPlatformType(args);

  const supportedStartArgs = new Set(['--start', '--reset', '--force', '--reauth', '--platform', '--save-as']);
  const unknownArgs = args.filter((arg, idx) => {
    if (['--platform', '--save-as'].includes(arg)) return false;
    if (idx > 0 && ['--platform', '--save-as'].includes(args[idx - 1])) return false;
    return arg.startsWith('--') && !supportedStartArgs.has(arg);
  });
  if (unknownArgs.length) {
    emitJson({
      ok: false,
      error: 'unsupported_auth_mode',
      unsupported_args: unknownArgs,
      supported_commands: [
        `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --start`,
        `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --wait <device_code>`,
        `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --check`,
      ],
      next_command: `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --start`,
    });
    return 1;
  }

  // Initiate device auth. Agent mode never blocks here; Agent should repeatedly
  // run --wait after retry_after_seconds until an authorization terminal state.
  const authData = await deviceAuth(agentPlatformType);
  if (!authData) {
    emitJson({ ok: false, error: 'device_auth_failed', retryable: true });
    return 1;
  }

  log('请完成授权:');
  log(`1. 打开: ${authData.verification_url}`);
  log(`2. 输入授权码: ${authData.user_code}`);
  log(`有效期 ${authData.expires_in || DEFAULT_AUTH_TIMEOUT_SECONDS} 秒`);
  if (saveAsProfile) log('\u6743\u5a01\u6210\u529f\u540e\u51ed\u8bc1\u5c06\u4fdd\u5b58\u81f3 profile\u300c' + saveAsProfile + '\u300d');
  log('授权码展示后，Agent 应按 required_next_command 进行短轮询；不要等待用户回复“已授权”。');

  // Output device code for Agent short polling.
  emitJson({
    ok: true,
    status: 'awaiting_approval',
    agent_platform_type: agentPlatformType,
    device_code: authData.device_code,
    user_code: authData.user_code,
    verification_url: authData.verification_url,
    expires_in: authData.expires_in || DEFAULT_AUTH_TIMEOUT_SECONDS,
    interval: authData.interval || 5,
    polling_mode: 'agent_short_poll',
    auto_poll_required: true,
    agent_must_poll_in_same_turn: true,
    do_not_final_reply_before_polling: true,
    poll_interval_seconds: authData.interval || 5,
    must_continue_post_auth: true,
    next_step: 'Show verification_url and user_code as an interim message only, then repeatedly run required_next_command after retry_after_seconds until authorized, expired, denied, or timeout. Execute post_auth.next_actions from the authorized result before giving a final user reply.',
    interim_user_message_template: '请打开 {verification_url} 并输入授权码 {user_code}。我会在这里自动轮询授权状态，然后继续扫描可上架的技能和文档候选。',
    retry_after_seconds: authData.interval || 5,
    wait_command: `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --wait ${authData.device_code}`,
    required_next_command: `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --wait ${authData.device_code}`,
    required_next_command_purpose: 'Run this after retry_after_seconds. It performs one short poll and returns pending or an authorized result with post_auth.next_actions.',
  });

  return 0;
}

main().catch(err => {
  emitJson({ ok: false, error: err.message, retryable: true });
  process.exit(1);
});
