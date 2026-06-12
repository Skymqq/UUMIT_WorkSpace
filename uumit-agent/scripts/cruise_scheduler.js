#!/usr/bin/env node
/**
 * UUMit Cruise Scheduler — 统一调度器
 *
 * 将 4 个 tick 脚本合并为单一入口，支持配置控制各模块频率和开关。
 * 用法：
 *   node cruise_scheduler.js                    # 运行所有到期的 tick
 *   node cruise_scheduler.js --module tick      # 只运行指定模块
 *   node cruise_scheduler.js --list             # 显示各模块状态
 *   node cruise_scheduler.js --force <module>   # 强制运行指定模块（忽略间隔）
 *
 * 模块列表：
 *   tick      - 账户/钱包/订单对账（默认 6h）
 *   inbox     - 收件箱：申请+推送（默认 15min）
 *   apply     - 任务大厅：扫描+申请（默认 30min）
 *   deliver   - 交付+发布（默认 60min）
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  SKILL_DIR, log, failCli, parseDryRun, readState, writeState, errorHandler,
} = require('./cruise_common');

// === Default Intervals (seconds) ===

const MODULES = {
  tick:          { script: 'cruise_tick.js',          interval: 21600, description: '账户/钱包/订单对账' },
  inbox:         { script: 'cruise_inbox_tick.js',    interval: 900,   description: '收件箱：申请+推送' },
  apply:         { script: 'cruise_apply_tick.js',    interval: 1800,  description: '任务大厅：扫描+申请' },
  deliver:       { script: 'cruise_deliver_tick.js',  interval: 3600,  description: '交付+发布' },
  cross_account: { script: 'cross_account_flow.js',   interval: 43200, description: '跨账号全流水线（12h）' },
};

const SCHEDULER_STATE_FILE = path.join(SKILL_DIR, 'memory', 'runtime', 'scheduler-state.json');

// === State ===

function loadSchedulerState() {
  try {
    if (!fs.existsSync(SCHEDULER_STATE_FILE)) return { last_run: {} };
    return JSON.parse(fs.readFileSync(SCHEDULER_STATE_FILE, 'utf-8'));
  } catch (_) { return { last_run: {} }; }
}

function saveSchedulerState(state) {
  const dir = path.dirname(SCHEDULER_STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SCHEDULER_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function shouldRun(moduleName, state, force) {
  if (force) return true;
  const lastRun = state.last_run?.[moduleName];
  if (!lastRun) return true;
  const elapsed = (Date.now() - new Date(lastRun).getTime()) / 1000;
  return elapsed >= MODULES[moduleName].interval;
}

// === Run Module ===

function runModule(moduleName, dryRun) {
  const mod = MODULES[moduleName];
  const scriptPath = path.join(SKILL_DIR, 'scripts', mod.script);

  if (!fs.existsSync(scriptPath)) {
    log(`[scheduler] Script not found: ${mod.script}`);
    return { module: moduleName, status: 'skipped', reason: 'script_not_found' };
  }

  // Check if script supports --dry-run
  const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
  const supportsDryRun = scriptContent.includes('--dry-run') || scriptContent.includes('dryRun') || scriptContent.includes('dry_run');

  if (dryRun && !supportsDryRun) {
    log(`[scheduler] Skipping ${moduleName} in dry-run mode (script doesn't support --dry-run)`);
    return { module: moduleName, status: 'skipped', reason: 'no_dry_run_support' };
  }

  log(`[scheduler] Running ${moduleName}: ${mod.description}`);

  try {
    const args = dryRun ? '--dry-run' : '';
    const output = execSync(`node "${scriptPath}" ${args}`, {
      encoding: 'utf-8',
      maxBuffer: 5 * 1024 * 1024,
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Parse JSON output (last JSON block in stdout)
    const jsonMatch = output.match(/\{[\s\S]*\}\s*$/);
    let data = null;
    if (jsonMatch) {
      try { data = JSON.parse(jsonMatch[0]); } catch (_) {}
    }

    log(`[scheduler] ${moduleName} completed`);
    return { module: moduleName, status: 'ok', data };
  } catch (e) {
    const errOutput = e.stderr ? e.stderr.toString().slice(0, 500) : e.message;
    log(`[scheduler] ${moduleName} failed: ${errOutput}`);
    return { module: moduleName, status: 'failed', error: errOutput };
  }
}

// === CLI ===

function parseArgs() {
  const rawArgs = process.argv.slice(2);
  const result = { modules: [], force: [], list: false, dryRun: false };

  for (let i = 0; i < rawArgs.length; i++) {
    switch (rawArgs[i]) {
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--list':
        result.list = true;
        break;
      case '--module':
        if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('--')) {
          result.modules.push(rawArgs[++i]);
        }
        break;
      case '--force':
        if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('--')) {
          result.force.push(rawArgs[++i]);
          result.modules.push(rawArgs[i - 1]);
        }
        break;
      default:
        failCli(`unknown argument: ${rawArgs[i]}`);
    }
  }

  // If no modules specified, run all
  if (result.modules.length === 0) {
    result.modules = Object.keys(MODULES);
  }

  return result;
}

// === Main ===

function main() {
  const opts = parseArgs();
  const state = loadSchedulerState();

  // List mode
  if (opts.list) {
    const now = Date.now();
    const result = {};
    for (const [name, mod] of Object.entries(MODULES)) {
      const lastRun = state.last_run?.[name];
      const elapsed = lastRun ? Math.round((now - new Date(lastRun).getTime()) / 1000) : null;
      const nextIn = elapsed !== null ? Math.max(0, mod.interval - elapsed) : 0;
      result[name] = {
        description: mod.description,
        interval: mod.interval,
        last_run: lastRun || 'never',
        next_in_seconds: nextIn,
        overdue: nextIn === 0,
      };
    }
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Run mode
  const results = [];
  for (const moduleName of opts.modules) {
    if (!MODULES[moduleName]) {
      log(`[scheduler] Unknown module: ${moduleName}`);
      results.push({ module: moduleName, status: 'skipped', reason: 'unknown_module' });
      continue;
    }

    const force = opts.force.includes(moduleName);
    if (!shouldRun(moduleName, state, force)) {
      log(`[scheduler] Skipping ${moduleName} (not due yet)`);
      results.push({ module: moduleName, status: 'skipped', reason: 'not_due' });
      continue;
    }

    const result = runModule(moduleName, opts.dryRun);
    results.push(result);

    // Update last_run timestamp
    if (!state.last_run) state.last_run = {};
    state.last_run[moduleName] = new Date().toISOString();
  }

  // Save state
  saveSchedulerState(state);

  // Summary
  const summary = {
    timestamp: new Date().toISOString(),
    dry_run: opts.dryRun,
    results,
    success: results.filter(r => r.status === 'ok').length,
    failed: results.filter(r => r.status === 'failed').length,
    skipped: results.filter(r => r.status === 'skipped').length,
  };

  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (e) {
  errorHandler('scheduler')(e);
}
