#!/usr/bin/env node
/**
 * UUMit Skill — Agent Runtime SSE 连接脚本
 *
 * 建立并维持与平台 /api/v1/agent-runtime/connect 的 SSE 长连接，
 * 接收任务分发（job_dispatch）、Agent 间消息（agent_msg）和状态变更。
 * 与巡航（cruise_tick.js）独立并存：SSE 负责实时推送，巡航负责定期对账。
 *
 * 用法：
 *   node runtime_connect.js                                    # stdout 流式输出（默认）
 *   node runtime_connect.js --output-dir memory/runtime/       # 写文件模式
 *   node runtime_connect.js --last-event-id <id>               # 断线续传
 *   node runtime_connect.js --max-reconnect-delay 30           # 最大重连间隔（秒）
 *   node runtime_connect.js --platform <type>                  # 覆盖 agent_platform_type
 *
 * stdout 模式：每个 SSE 事件一行 JSON（heartbeat 静默不输出）
 * --output-dir 模式：events.jsonl + latest-state.json + pending-jobs.json
 *
 * stderr 输出连接状态日志
 * 退出码：0=正常退出（SIGINT/SIGTERM），2=认证失败不重连
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');
function _resolveBaseUrl() {
  if (process.env.UUMIT_BASE_URL) return process.env.UUMIT_BASE_URL;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'memory', 'uumit-config.json'), 'utf8'));
    if (cfg.base_url) return cfg.base_url;
  } catch (_) {}
  return 'https://api.uumit.com';
}
const BASE_URL = _resolveBaseUrl();

const DEFAULT_MAX_RECONNECT_DELAY = 30;
const INITIAL_RECONNECT_DELAY = 1;
const EVENTS_JSONL_MAX_LINES = 10000;
const EVENTS_JSONL_TRIM_TO = 5000;

const baseUrlObj = new URL(BASE_URL);
const isHttps = baseUrlObj.protocol === 'https:';

// ── 日志 ──

function log(msg) {
  console.error(`[runtime] ${msg}`);
}

function emitStdout(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

// ── 凭证 ──

const { loadCredentials } = require('./auth_common');

// ── 参数解析 ──

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    outputDir: null,
    lastEventId: null,
    maxReconnectDelay: DEFAULT_MAX_RECONNECT_DELAY,
    platform: process.env.UUMIT_AGENT_PLATFORM_TYPE || null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output-dir' && args[i + 1]) {
      opts.outputDir = path.resolve(args[++i]);
    } else if (args[i] === '--last-event-id' && args[i + 1]) {
      opts.lastEventId = args[++i];
    } else if (args[i] === '--max-reconnect-delay' && args[i + 1]) {
      opts.maxReconnectDelay = Math.max(1, parseInt(args[++i], 10) || DEFAULT_MAX_RECONNECT_DELAY);
    } else if (args[i] === '--platform' && args[i + 1]) {
      opts.platform = args[++i];
    }
  }
  return opts;
}

// ── 文件模式辅助 ──

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function readJsonSafe(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return fallback;
}

function appendJsonl(filePath, obj) {
  fs.appendFileSync(filePath, JSON.stringify(obj) + '\n', 'utf-8');

  // 超过上限时截断
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    if (lines.length > EVENTS_JSONL_MAX_LINES) {
      const trimmed = lines.slice(lines.length - EVENTS_JSONL_TRIM_TO);
      fs.writeFileSync(filePath, trimmed.join('\n') + '\n', 'utf-8');
    }
  } catch (e) { /* ignore */ }
}

// ── pending-jobs.json 管理 ──

function addPendingJob(outputDir, jobData) {
  const filePath = path.join(outputDir, 'pending-jobs.json');
  const jobs = readJsonSafe(filePath, []);
  if (!jobs.find((j) => j.job_id === jobData.job_id)) {
    jobs.push({
      job_id: jobData.job_id,
      transaction_id: jobData.transaction_id,
      capability_id: jobData.capability_id,
      price_ut: jobData.price_ut,
      expires_at: jobData.expires_at,
      received_at: new Date().toISOString(),
    });
    writeJson(filePath, jobs);
  }
}

function removePendingJob(outputDir, jobId) {
  const filePath = path.join(outputDir, 'pending-jobs.json');
  const jobs = readJsonSafe(filePath, []);
  const filtered = jobs.filter((j) => j.job_id !== jobId);
  if (filtered.length !== jobs.length) {
    writeJson(filePath, filtered);
  }
}

// ── 状态文件 ──

function updateState(outputDir, patch) {
  const filePath = path.join(outputDir, 'latest-state.json');
  const state = readJsonSafe(filePath, {});
  Object.assign(state, patch, { updated_at: new Date().toISOString() });
  writeJson(filePath, state);
}

// ── SSE 解析器 ──

class SSEParser {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this._buffer = '';
    this._eventType = '';
    this._data = '';
    this._id = '';
  }

  feed(chunk) {
    this._buffer += chunk;
    const lines = this._buffer.split('\n');
    this._buffer = lines.pop() || '';

    for (const line of lines) {
      if (line === '' || line === '\r') {
        this._dispatch();
      } else if (line.startsWith('event:')) {
        this._eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        this._data += (this._data ? '\n' : '') + line.slice(5).trim();
      } else if (line.startsWith('id:')) {
        this._id = line.slice(3).trim();
      }
      // 忽略 :comment 和 retry: 行
    }
  }

  _dispatch() {
    if (this._data || this._eventType) {
      this.onEvent({
        event: this._eventType || 'message',
        data: this._data,
        id: this._id,
      });
    }
    this._eventType = '';
    this._data = '';
    // id 按 SSE 规范保留到下次更新
  }
}

// ── 核心连接 ──

function connect(opts, credentials) {
  return new Promise((resolve, reject) => {
    const { apiKey, userId } = credentials;
    let urlPath = '/api/v1/agent-runtime/connect';
    const queryParts = [];
    if (opts.lastEventId) queryParts.push(`last_event_id=${encodeURIComponent(opts.lastEventId)}`);
    if (queryParts.length) urlPath += '?' + queryParts.join('&');

    const url = BASE_URL + urlPath;
    const urlObj = new URL(url);
    const requestOpts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'X-Api-Key': apiKey,
        'X-Platform-User-Id': userId,
        'Cache-Control': 'no-cache',
      },
    };

    const mod = isHttps ? https : http;
    const req = mod.request(requestOpts, (res) => {
      if (res.statusCode === 401 || res.statusCode === 403) {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          reject(new AuthError(`认证失败 (${res.statusCode}): ${body}`));
        });
        return;
      }
      if (res.statusCode === 503) {
        const retryAfter = parseInt(res.headers['retry-after'] || '30', 10);
        reject(new RetryError(`服务暂不可用 (503)`, retryAfter));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`意外状态码: ${res.statusCode}`));
        return;
      }
      resolve(res);
    });

    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('连接超时')); });
    req.setTimeout(0); // SSE 长连接不设超时
    req.end();
  });
}

class AuthError extends Error {
  constructor(msg) { super(msg); this.name = 'AuthError'; }
}

class RetryError extends Error {
  constructor(msg, retryAfter) { super(msg); this.name = 'RetryError'; this.retryAfter = retryAfter; }
}

// ── 事件处理 ──

function handleEvent(sseEvent, opts) {
  let data = {};
  try {
    if (sseEvent.data) data = JSON.parse(sseEvent.data);
  } catch (e) {
    log(`事件数据解析失败: ${e.message}`);
    return;
  }

  const eventType = sseEvent.event;
  const eventId = sseEvent.id;
  const receivedAt = new Date().toISOString();

  // 更新 last_event_id
  if (eventId) opts.lastEventId = eventId;

  // heartbeat 静默处理
  if (eventType === 'heartbeat') {
    if (opts.outputDir) {
      updateState(opts.outputDir, {
        connected: true,
        last_event_id: opts.lastEventId,
        last_heartbeat_at: receivedAt,
      });
    }
    return;
  }

  const outputObj = {
    event: eventType,
    id: eventId,
    data,
    received_at: receivedAt,
  };

  // stdout 模式
  if (!opts.outputDir) {
    emitStdout(outputObj);
    return;
  }

  // --output-dir 模式
  ensureDir(opts.outputDir);
  appendJsonl(path.join(opts.outputDir, 'events.jsonl'), outputObj);
  updateState(opts.outputDir, {
    connected: true,
    last_event_id: opts.lastEventId,
    last_event_at: receivedAt,
  });

  if (eventType === 'job_dispatch' && data.job_id) {
    addPendingJob(opts.outputDir, data);
  } else if (eventType === 'job_cancel' && data.job_id) {
    removePendingJob(opts.outputDir, data.job_id);
  }
}

// ── 主循环 ──

async function runLoop(opts) {
  const credentials = loadCredentials();
  if (!credentials.apiKey || !credentials.userId) {
    log('凭证未找到。请先运行 auth.js 完成授权。');
    emitStdout({ ok: false, error: 'no_credentials', hint: '请先运行 node scripts/auth.js 完成授权' });
    process.exit(2);
  }

  // 初始化 --output-dir 模式的目录和文件
  if (opts.outputDir) {
    ensureDir(opts.outputDir);
    // 尝试从 latest-state.json 恢复 last_event_id
    if (!opts.lastEventId) {
      const state = readJsonSafe(path.join(opts.outputDir, 'latest-state.json'), {});
      if (state.last_event_id) {
        opts.lastEventId = state.last_event_id;
        log(`从状态文件恢复 last_event_id: ${opts.lastEventId}`);
      }
    }
    updateState(opts.outputDir, { connected: false, status: 'connecting' });
  }

  let reconnectDelay = INITIAL_RECONNECT_DELAY;
  let running = true;

  // 优雅关闭
  const shutdown = () => {
    running = false;
    log('收到退出信号，正在关闭...');
    if (opts.outputDir) {
      updateState(opts.outputDir, {
        connected: false,
        status: 'stopped',
        last_event_id: opts.lastEventId,
      });
    }
    const finalState = {
      ok: true,
      status: 'shutdown',
      last_event_id: opts.lastEventId,
    };
    emitStdout(finalState);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (running) {
    try {
      log(`正在连接 ${BASE_URL}/api/v1/agent-runtime/connect${opts.lastEventId ? '?last_event_id=' + opts.lastEventId : ''}...`);

      const res = await connect(opts, credentials);
      log('connected');
      reconnectDelay = INITIAL_RECONNECT_DELAY;

      if (opts.outputDir) {
        updateState(opts.outputDir, {
          connected: true,
          status: 'connected',
          connected_at: new Date().toISOString(),
          last_event_id: opts.lastEventId,
        });
      }

      const parser = new SSEParser((sseEvent) => handleEvent(sseEvent, opts));

      await new Promise((resolve, reject) => {
        res.on('data', (chunk) => {
          try {
            parser.feed(chunk.toString('utf-8'));
          } catch (e) {
            log(`解析数据失败: ${e.message}`);
          }
        });
        res.on('end', () => resolve());
        res.on('error', (e) => reject(e));
      });

      log('连接已关闭');
    } catch (e) {
      if (e instanceof AuthError) {
        log(e.message);
        if (opts.outputDir) {
          updateState(opts.outputDir, { connected: false, status: 'auth_failed' });
        }
        emitStdout({ ok: false, error: 'auth_failed', message: e.message });
        process.exit(2);
      }

      if (e instanceof RetryError) {
        reconnectDelay = e.retryAfter;
        log(`${e.message}，${reconnectDelay} 秒后重连`);
      } else {
        log(`连接异常: ${e.message}`);
      }
    }

    if (!running) break;

    if (opts.outputDir) {
      updateState(opts.outputDir, { connected: false, status: 'reconnecting' });
    }

    log(`reconnecting (delay ${reconnectDelay}s)`);
    await new Promise((r) => setTimeout(r, reconnectDelay * 1000));

    // 指数退避
    reconnectDelay = Math.min(reconnectDelay * 2, opts.maxReconnectDelay);
  }
}

// ── 入口 ──

const opts = parseArgs();
runLoop(opts).catch((err) => {
  log(`致命错误: ${err.message}`);
  process.exit(1);
});
