#!/usr/bin/env node
/**
 * update_skill.js — UUMit Skill 自动更新器
 *
 * Usage:
 *   node update_skill.js --check
 *   node update_skill.js --update
 *   node update_skill.js --fill-missing
 *   node update_skill.js --reconcile-version
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadLocalPlatform, normalizePlatformId } = require('./package_common');

const SKILL_DIR = path.resolve(__dirname, '..');
const STATE_FILE = path.join(SKILL_DIR, 'memory', 'uumit-state.json');
const OSS_BASE = 'https://oss.uumit.com';
const MANIFEST_FILE = 'manifest.json';

const baseUrlObj = new URL(OSS_BASE);
const isHttps = baseUrlObj.protocol === 'https:';

function log(msg) { console.error(`[update_skill] ${msg}`); }

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return {};
}

function saveState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function httpGet(urlPath, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: baseUrlObj.hostname,
      port: baseUrlObj.port || (isHttps ? 443 : 80),
      path: urlPath,
      method: 'GET',
      timeout: timeoutMs,
    };
    const mod = isHttps ? https : http;
    const req = mod.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ statusCode: res.statusCode, data: Buffer.concat(chunks) }));
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function getLocalVersion() {
  const skillMdPath = path.join(SKILL_DIR, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;
  const content = fs.readFileSync(skillMdPath, 'utf-8');
  const match = content.match(/version:\s*([\d.]+)/);
  return match ? match[1] : null;
}

function loadLocalManifest() {
  const manifestPath = path.join(SKILL_DIR, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
}

function getRequiredFilesFromManifest(manifest) {
  const files = manifest && manifest.files ? manifest.files : {};
  const required = Object.entries(files)
    .filter(([, meta]) => !meta || meta.required !== false)
    .map(([file]) => file.replace(/\\/g, '/'));

  if (!required.includes(MANIFEST_FILE)) {
    required.unshift(MANIFEST_FILE);
  }
  return required;
}

function getRequiredFiles() {
  return getRequiredFilesFromManifest(loadLocalManifest());
}

async function fetchRemoteManifest(timeoutMs = 10000) {
  const { statusCode, data } = await httpGet('/skills/manifest.json', timeoutMs);
  if (statusCode !== 200) {
    throw new Error(`HTTP ${statusCode} fetching remote manifest.json`);
  }
  return {
    manifest: JSON.parse(data.toString('utf-8')),
    raw: data,
  };
}

function writeFileSafely(file, data) {
  const normalized = file.replace(/\\/g, '/');

  const dest = path.join(SKILL_DIR, normalized);
  if ((normalized === 'memory' || normalized.startsWith('memory/')) && fs.existsSync(dest)) {
    throw new Error(`refuse to overwrite local memory path: ${file}`);
  }

  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, dest);
}

async function fetchRequiredFile(file, filled) {
  try {
    const remotePath = `/skills/${file.replace(/\\/g, '/')}`;
    const { statusCode, data } = await httpGet(remotePath, 10000);
    if (statusCode === 200) {
      writeFileSafely(file, data);
      filled.push(file);
      log(`Filled: ${file}`);
      return true;
    }
    log(`Remote not found: ${file} (HTTP ${statusCode})`);
  } catch (e) {
    log(`Failed to fetch ${file}: ${e.message}`);
  }
  return false;
}

async function checkVersion() {
  const local = getLocalVersion();
  log(`Local version: ${local || 'unknown'}`);

  try {
    const { manifest } = await fetchRemoteManifest(5000);
    const remote = manifest.version || null;
    log(`Remote version: ${remote}`);

    if (!remote) {
      throw new Error('remote manifest.json missing version field');
    }

    if (local === remote) {
      log('Version match');
      console.log(JSON.stringify({ status: 'ok', local_version: local, remote_version: remote }));
    } else {
      log(`Version mismatch: local=${local}, remote=${remote}`);
      console.log(JSON.stringify({ status: 'update_available', local_version: local, remote_version: remote }));
    }
  } catch (e) {
    log(`Check failed: ${e.message}`);
    console.log(JSON.stringify({ status: 'error', error: e.message }));
  }
}

async function updateSkill() {
  const local = getLocalVersion();
  log(`Local version: ${local || 'unknown'}`);

  const { manifest, raw } = await fetchRemoteManifest(10000);
  const remote = manifest.version || null;
  if (!remote) {
    throw new Error('remote manifest.json missing version field');
  }
  log(`Remote version: ${remote}`);

  if (local === remote) {
    log('Version match, no update needed');
    console.log(JSON.stringify({
      status: 'up_to_date',
      local_version: local,
      remote_version: remote,
      updated_files: [],
      preserved: ['memory/'],
    }));
    return;
  }

  const required = getRequiredFilesFromManifest(manifest);
  const updated = [];
  const failed = [];
  const preserved = ['memory/'];

  for (const file of required) {
    try {
      const normalized = file.replace(/\\/g, '/');
      if ((normalized === 'memory' || normalized.startsWith('memory/')) && fs.existsSync(path.join(SKILL_DIR, normalized))) {
        preserved.push(normalized);
        log(`Preserved local memory file: ${file}`);
        continue;
      }

      if (file === MANIFEST_FILE) {
        writeFileSafely(file, raw);
      } else {
        const remotePath = `/skills/${file.replace(/\\/g, '/')}`;
        const { statusCode, data } = await httpGet(remotePath, 10000);
        if (statusCode !== 200) {
          throw new Error(`HTTP ${statusCode}`);
        }
        writeFileSafely(file, data);
      }
      updated.push(file);
      log(`Updated: ${file}`);
    } catch (e) {
      failed.push({ file, error: e.message });
      log(`Failed to update ${file}: ${e.message}`);
    }
  }

  const state = loadState();
  state.last_update_at = Date.now();
  state.previous_version = local;
  state.local_version = remote;
  state.updated_files = updated;
  state.failed_files = failed;
  saveState(state);

  const status = failed.length > 0 ? 'partial' : 'updated';
  console.log(JSON.stringify({
    status,
    from_version: local,
    to_version: remote,
    updated_files: updated,
    failed_files: failed,
    preserved,
  }));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

async function fillMissing() {
  let required = getRequiredFiles();
  const filled = [];

  if (!fs.existsSync(path.join(SKILL_DIR, MANIFEST_FILE))) {
    log('Local manifest missing, fetching manifest first');
    await fetchRequiredFile(MANIFEST_FILE, filled);
    required = getRequiredFiles();
  }

  const missing = required.filter(f => !fs.existsSync(path.join(SKILL_DIR, f)));

  if (missing.length === 0) {
    log('No missing files');
    console.log(JSON.stringify({ status: 'ok', filled: filled.length, files: filled }));
    return;
  }

  log(`Missing ${missing.length} files: ${missing.join(', ')}`);

  for (const file of missing) {
    await fetchRequiredFile(file, filled);
  }

  console.log(JSON.stringify({ status: 'ok', filled: filled.length, files: filled }));
}

async function reconcileVersion() {
  const local = getLocalVersion();
  log(`Reconciling version: ${local}`);

  const state = loadState();
  state.last_reconcile_at = Date.now();
  state.local_version = local;
  saveState(state);

  console.log(JSON.stringify({ status: 'ok', version: local }));
}

async function main() {
  const explicitPlatform = normalizePlatformId(args.includes('--platform') ? args[args.indexOf('--platform') + 1] : '');
  const platform = explicitPlatform || loadLocalPlatform(SKILL_DIR);

  if (args.includes('--check')) {
    await checkVersion();
  } else if (args.includes('--update')) {
    await updateSkill();
    if (platform) {
      const adapterScript = path.join(SKILL_DIR, 'scripts', 'update_adapter.js');
      spawnSync(process.execPath, [adapterScript, '--platform', platform, '--update'], {
        cwd: SKILL_DIR,
        encoding: 'utf8',
        env: { ...process.env },
      });
    }
  } else if (args.includes('--fill-missing')) {
    await fillMissing();
    if (platform) {
      const adapterScript = path.join(SKILL_DIR, 'scripts', 'update_adapter.js');
      spawnSync(process.execPath, [adapterScript, '--platform', platform, '--fill-missing'], {
        cwd: SKILL_DIR,
        encoding: 'utf8',
        env: { ...process.env },
      });
    }
  } else if (args.includes('--reconcile-version')) {
    await reconcileVersion();
  } else {
    log('Usage: node update_skill.js --check | --update | --fill-missing | --reconcile-version');
    process.exit(2);
  }
}

main().catch(err => {
  log(`Error: ${err.message}`);
  process.exit(1);
});
