#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const DEFAULT_BASE_URL = 'https://oss.uumit.com/skills/';
const DEFAULT_ADAPTER_BASE_URL = 'https://oss.uumit.com/skills/uumit-agent/adapters/';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function ensureWritableDirectory(dir) {
  ensureDir(dir);
  const probe = path.join(dir, `.write-test-${process.pid}`);
  fs.writeFileSync(probe, 'ok');
  fs.unlinkSync(probe);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, payload) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function download(url, dest, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const mod = urlObj.protocol === 'https:' ? https : http;
    const req = mod.get(urlObj, { timeout: timeoutMs }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirected = new URL(res.headers.location, urlObj).toString();
        res.resume();
        download(redirected, dest, timeoutMs).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        return;
      }
      const tmp = `${dest}.tmp`;
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on('finish', () => out.close(() => {
        fs.renameSync(tmp, dest);
        resolve();
      }));
      out.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function removeDirectory(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function extractZip(zipFile, destDir) {
  removeDirectory(destDir);
  ensureDir(destDir);
  if (process.platform === 'win32') {
    const ps = spawnSync('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      `Expand-Archive -LiteralPath ${JSON.stringify(zipFile)} -DestinationPath ${JSON.stringify(destDir)} -Force`,
    ], { encoding: 'utf8' });
    if (ps.status !== 0) throw new Error(`Expand-Archive failed: ${(ps.stderr || ps.stdout || '').trim()}`);
    return;
  }
  const unzip = spawnSync('unzip', ['-q', '-o', zipFile, '-d', destDir], { encoding: 'utf8' });
  if (unzip.status !== 0) throw new Error(`unzip failed: ${(unzip.stderr || unzip.stdout || '').trim()}`);
}

function normalizePlatformId(platform) {
  const raw = (platform || '').trim();
  if (!raw) return '';
  const map = {
    codex: 'codex',
    cursor: 'cursor',
    'claude-code': 'claude-code',
    claude_desktop: 'claude-code',
    trae_solo: 'trae-solo',
    'trae-solo': 'trae-solo',
    workbuddy: 'workbuddy',
    custom_mcp: '',
    openclaw: '',
    hermes_agent: 'claude-code',
  };
  return map[raw] !== undefined ? map[raw] : raw;
}

function inferPlatformFromFiles(skillDir) {
  const checks = [
    ['AGENTS.md', 'codex'],
    ['CLAUDE.md', 'claude-code'],
    ['uumit-skill.mdc', 'cursor'],
    ['trae-rules.md', 'trae-solo'],
    ['workbuddy-rules.md', 'workbuddy'],
  ];
  for (const [file, platform] of checks) {
    if (fs.existsSync(path.join(skillDir, file))) return platform;
  }
  return '';
}

function loadLocalPlatform(skillDir, explicitPlatform = '') {
  const normalizedExplicit = normalizePlatformId(explicitPlatform);
  if (normalizedExplicit) return normalizedExplicit;
  const policyPath = path.join(skillDir, 'policy.json');
  if (fs.existsSync(policyPath)) {
    const policy = readJson(policyPath);
    const fromPolicy = normalizePlatformId(policy.platform || policy.agent_platform_type);
    if (fromPolicy) return fromPolicy;
  }
  const overlayPath = path.join(skillDir, 'manifest.overlay.json');
  if (fs.existsSync(overlayPath)) {
    const overlay = readJson(overlayPath);
    const fromOverlay = normalizePlatformId(overlay.platform);
    if (fromOverlay) return fromOverlay;
  }
  const fromEnv = normalizePlatformId(process.env.UUMIT_AGENT_PLATFORM_TYPE || process.env.UUMIT_ADAPTER_PLATFORM || '');
  if (fromEnv) return fromEnv;
  return inferPlatformFromFiles(skillDir);
}

function defaultPolicyForPlatform(platform) {
  const normalized = normalizePlatformId(platform);
  const common = {
    version: '1.1.0',
    transport_priority: ['rest'],
    mcp_enabled: false,
    write_policy: 'confirm_by_risk',
    auto_apply: false,
    auto_accept_application: false,
    auto_deliver: false,
    allow_background_runtime: true,
    expose_local_env: false,
  };
  if (normalized === 'codex') return { ...common, platform: 'codex', agent_platform_type: 'custom_mcp', write_policy: 'dry_run_then_confirm', allow_background_runtime: false };
  if (normalized === 'cursor') return { ...common, platform: 'cursor', agent_platform_type: 'cursor', transport_priority: ['mcp', 'rest'], mcp_enabled: true, auto_apply: true };
  if (normalized === 'claude-code') return { ...common, platform: 'claude-code', agent_platform_type: 'claude_desktop' };
  if (normalized === 'trae-solo') return { ...common, platform: 'trae-solo', agent_platform_type: 'custom_mcp', transport_priority: ['mcp', 'rest'], mcp_enabled: true };
  if (normalized === 'workbuddy') return { ...common, platform: 'workbuddy', agent_platform_type: 'custom_mcp' };
  return { ...common, platform: '', agent_platform_type: process.env.UUMIT_AGENT_PLATFORM_TYPE || 'openclaw' };
}

function loadLocalPolicy(skillDir, explicitPlatform = '') {
  const policyPath = path.join(skillDir, 'policy.json');
  const fallbackPlatform = loadLocalPlatform(skillDir, explicitPlatform);
  if (fs.existsSync(policyPath)) {
    return { ...defaultPolicyForPlatform(fallbackPlatform), ...readJson(policyPath) };
  }
  return defaultPolicyForPlatform(fallbackPlatform);
}

function resolveAgentPlatformTypeValue(skillDir, explicitPlatform = '') {
  const policy = loadLocalPolicy(skillDir, explicitPlatform);
  return (policy.agent_platform_type || process.env.UUMIT_AGENT_PLATFORM_TYPE || 'openclaw').trim();
}

module.exports = {
  DEFAULT_ADAPTER_BASE_URL,
  DEFAULT_BASE_URL,
  defaultPolicyForPlatform,
  download,
  ensureDir,
  ensureWritableDirectory,
  extractZip,
  inferPlatformFromFiles,
  loadLocalPlatform,
  loadLocalPolicy,
  normalizePlatformId,
  readJson,
  removeDirectory,
  resolveAgentPlatformTypeValue,
  sha256File,
  writeJson,
};
