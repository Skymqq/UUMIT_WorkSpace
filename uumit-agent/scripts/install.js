#!/usr/bin/env node
/**
 * UUMit Skill — Agent-friendly installer.
 *
 * Usage:
 *   node scripts/install.js [--update] [--manifest-url URL] [--base-url URL] [--verbose]
 *
 * stdout: one JSON object for Agent parsing.
 * stderr: diagnostics only when --verbose is set.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { loadLocalPlatform, resolveAgentPlatformTypeValue } = require('./package_common');

const SKILL_DIR = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(SKILL_DIR, 'manifest.json');
const MEMORY_DIR = path.join(SKILL_DIR, 'memory');
const DEFAULT_BASE_URL = 'https://oss.uumit.com/skills/';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const updateMode = args.includes('--update');

function log(message) {
  if (verbose) process.stderr.write(`[install] ${message}\n`);
}

function emit(payload) {
  process.stdout.write(JSON.stringify(payload) + '\n');
}

function argValue(name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length || args[idx + 1].startsWith('--')) return null;
  return args[idx + 1];
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function ensureWritableDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, `.install-write-test-${process.pid}`);
  fs.writeFileSync(probe, 'ok');
  fs.unlinkSync(probe);
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
      out.on('finish', () => {
        out.close(() => {
          fs.renameSync(tmp, dest);
          resolve();
        });
      });
      out.on('error', reject);
    });
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', reject);
  });
}

function removeDirectory(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function extractZip(zipFile, destDir) {
  removeDirectory(destDir);
  fs.mkdirSync(destDir, { recursive: true });

  if (process.platform === 'win32') {
    const ps = spawnSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath ${JSON.stringify(zipFile)} -DestinationPath ${JSON.stringify(destDir)} -Force`,
    ], { encoding: 'utf8' });
    if (ps.status !== 0) {
      throw new Error(`Expand-Archive failed: ${(ps.stderr || ps.stdout || '').trim()}`);
    }
    return;
  }

  const unzip = spawnSync('unzip', ['-q', '-o', zipFile, '-d', destDir], { encoding: 'utf8' });
  if (unzip.status !== 0) {
    throw new Error(`unzip failed: ${(unzip.stderr || unzip.stdout || '').trim()}`);
  }
}

function copyExtractedPackage(stagingDir) {
  let sourceDir = stagingDir;
  const entries = fs.readdirSync(stagingDir, { withFileTypes: true });
  if (!fs.existsSync(path.join(sourceDir, 'manifest.json')) && entries.length === 1 && entries[0].isDirectory()) {
    sourceDir = path.join(stagingDir, entries[0].name);
  }

  if (!fs.existsSync(path.join(sourceDir, 'manifest.json'))) {
    throw new Error('zip does not contain manifest.json at package root');
  }

  fs.cpSync(sourceDir, SKILL_DIR, {
    recursive: true,
    force: true,
    filter: (src) => {
      const rel = path.relative(sourceDir, src).replace(/\\/g, '/');
      return rel !== 'memory' && !rel.startsWith('memory/');
    },
  });

  const sourceMemory = path.join(sourceDir, 'memory');
  if (fs.existsSync(sourceMemory)) {
    fs.cpSync(sourceMemory, MEMORY_DIR, {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
  }
}

function validateManifestFiles(manifest) {
  const failures = [];
  for (const [file, meta] of Object.entries(manifest.files || {})) {
    if (meta && meta.required === false) continue;
    const full = path.join(SKILL_DIR, file);
    if (!fs.existsSync(full)) {
      failures.push({ file, error: 'missing' });
      continue;
    }
    if (file !== 'manifest.json' && !file.replace(/\\/g, '/').startsWith('memory/') && meta && meta.sha256) {
      const actual = sha256File(full);
      if (actual !== meta.sha256) {
        failures.push({ file, error: 'sha256_mismatch', expected: meta.sha256, actual });
      }
    }
  }
  return failures;
}

async function fetchRemoteManifest(baseUrl) {
  const manifestUrl = argValue('--manifest-url') || new URL('manifest.json', baseUrl).toString();
  const dest = path.join(os.tmpdir(), `uumit-manifest-${process.pid}.json`);
  await download(manifestUrl, dest, 15000);
  const raw = fs.readFileSync(dest);
  fs.unlinkSync(dest);
  return JSON.parse(raw.toString('utf8'));
}

async function installZip(manifest, baseUrl) {
  const zipName = manifest.distribution && manifest.distribution.zip ? manifest.distribution.zip : 'uumit-agent.zip';
  const zipUrl = new URL(zipName, baseUrl).toString();
  const zipFile = path.join(os.tmpdir(), `uumit-agent-${process.pid}.zip`);
  const stagingDir = path.join(os.tmpdir(), `uumit-agent-install-${process.pid}`);

  await download(zipUrl, zipFile, 60000);
  if (manifest.distribution && manifest.distribution.zip_sha256) {
    const actual = sha256File(zipFile);
    if (actual !== manifest.distribution.zip_sha256) {
      throw new Error(`zip sha256 mismatch: expected=${manifest.distribution.zip_sha256}, actual=${actual}`);
    }
  }

  extractZip(zipFile, stagingDir);
  copyExtractedPackage(stagingDir);
  removeDirectory(stagingDir);
  fs.unlinkSync(zipFile);
  return { zip_url: zipUrl };
}

function runAuthStart() {
  const authScript = path.join(SKILL_DIR, 'scripts', 'auth.js');
  const authArgs = [authScript, '--start'];
  const platform = argValue('--platform') || loadLocalPlatform(SKILL_DIR);
  const agentPlatformType = resolveAgentPlatformTypeValue(SKILL_DIR, platform);
  if (agentPlatformType) authArgs.push('--platform', agentPlatformType);

  const result = spawnSync(process.execPath, authArgs, {
    cwd: SKILL_DIR,
    encoding: 'utf8',
    env: { ...process.env },
  });

  if (!result.stdout.trim()) {
    return {
      ok: false,
      status: 'auth_start_failed',
      error: 'empty_stdout',
      stderr: (result.stderr || '').slice(0, 500),
      exit_code: result.status,
    };
  }

  try {
    return JSON.parse(result.stdout.trim());
  } catch (e) {
    return {
      ok: false,
      status: 'auth_start_failed',
      error: `invalid_auth_json: ${e.message}`,
      stdout: result.stdout.slice(0, 500),
      stderr: (result.stderr || '').slice(0, 500),
      exit_code: result.status,
    };
  }
}

async function main() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(nodeMajor) || nodeMajor < 18) {
    emit({ ok: false, status: 'dependency_failed', dependency: 'node', required: '>=18', actual: process.version });
    process.exit(1);
  }

  ensureWritableDirectory(SKILL_DIR);
  ensureWritableDirectory(MEMORY_DIR);

  const localManifest = fs.existsSync(MANIFEST_PATH) ? readJson(MANIFEST_PATH) : null;
  const baseUrl = argValue('--base-url') || (localManifest && localManifest.base_url) || DEFAULT_BASE_URL;

  let manifest = localManifest;
  let zipInstall = null;
  let zipError = null;
  try {
    const remoteManifest = await fetchRemoteManifest(baseUrl);
    manifest = remoteManifest;
    zipInstall = await installZip(remoteManifest, baseUrl);
    manifest = readJson(MANIFEST_PATH);
  } catch (e) {
    zipError = e.message;
    log(`zip install failed: ${zipError}`);
    if (!manifest) throw e;
  }

  const explicitPlatform = argValue('--platform');
  const platform = explicitPlatform || loadLocalPlatform(SKILL_DIR);
  let adapter = null;
  if (platform) {
    const adapterScript = path.join(SKILL_DIR, 'scripts', 'install_adapter.js');
    const adapterResult = spawnSync(process.execPath, [adapterScript, '--platform', platform], {
      cwd: SKILL_DIR,
      encoding: 'utf8',
      env: { ...process.env },
    });
    if (adapterResult.stdout.trim()) {
      try {
        adapter = JSON.parse(adapterResult.stdout.trim());
      } catch (e) {
        adapter = { ok: false, status: 'adapter_install_failed', error: `invalid adapter json: ${e.message}` };
      }
    }
  }
  const validationFailures = manifest ? validateManifestFiles(manifest) : [];
  const auth = runAuthStart();

  emit({
    ok: auth.ok !== false && validationFailures.length === 0 && (!adapter || adapter.ok !== false),
    status: updateMode ? 'updated_or_ready_for_auth' : 'installed_or_ready_for_auth',
    install: {
      node: process.version,
      preferred_distribution: 'zip',
      zip_install: zipInstall,
      zip_error: zipError,
      validation_failures: validationFailures,
    },
    auth,
    adapter,
    install_profile: {
      platform: platform || null,
      auth_agent_platform_type: resolveAgentPlatformTypeValue(SKILL_DIR, platform),
      adapter_installed: !!adapter,
    },
    next_actions: [
      'show_auth_code_if_status_awaiting_approval',
      'repeat_auth_wait_required_next_command_until_authorized',
      'start_runtime_connection_if_supported',
      'register_cruise_schedule_from_schedule_request',
      'register_mcp_from_mcp_request',
      'scan_host_capabilities_from_post_auth_request',
    ],
  });

  if (auth.ok === false || validationFailures.length > 0 || (adapter && adapter.ok === false)) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  emit({ ok: false, status: 'install_failed', error: err.message, retryable: true });
  process.exit(1);
});
