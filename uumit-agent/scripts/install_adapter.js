#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  DEFAULT_ADAPTER_BASE_URL,
  defaultPolicyForPlatform,
  download,
  ensureWritableDirectory,
  extractZip,
  normalizePlatformId,
  sha256File,
  writeJson,
} = require('./package_common');

const SKILL_DIR = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

function argValue(name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length || args[idx + 1].startsWith('--')) return null;
  return args[idx + 1];
}

function emit(payload) {
  process.stdout.write(JSON.stringify(payload) + '\n');
}

async function fetchOverlay(baseUrl, platform) {
  const url = argValue('--manifest-url') || new URL(`${platform}/manifest.overlay.json`, baseUrl).toString();
  const dest = path.join(os.tmpdir(), `uumit-adapter-${platform}-${process.pid}.json`);
  await download(url, dest, 15000);
  const manifest = JSON.parse(fs.readFileSync(dest, 'utf8'));
  fs.unlinkSync(dest);
  return { manifest, url };
}

async function installZip(manifest, baseUrl, platform) {
  const zipName = manifest.distribution && manifest.distribution.zip ? manifest.distribution.zip : `uumit-agent-${platform}-adapter.zip`;
  const zipUrl = new URL(`${platform}/${zipName}`, baseUrl).toString();
  const zipFile = path.join(os.tmpdir(), `uumit-adapter-${platform}-${process.pid}.zip`);
  const stagingDir = path.join(os.tmpdir(), `uumit-adapter-${platform}-${process.pid}`);
  await download(zipUrl, zipFile, 60000);
  if (manifest.distribution && manifest.distribution.zip_sha256) {
    const actual = sha256File(zipFile);
    if (actual !== manifest.distribution.zip_sha256) throw new Error(`zip sha256 mismatch: expected=${manifest.distribution.zip_sha256}, actual=${actual}`);
  }
  extractZip(zipFile, stagingDir);
  const sourceDir = fs.existsSync(path.join(stagingDir, 'manifest.overlay.json'))
    ? stagingDir
    : path.join(stagingDir, fs.readdirSync(stagingDir)[0]);
  for (const file of Object.keys(manifest.files || {})) {
    const src = path.join(sourceDir, file);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(SKILL_DIR, file), { recursive: true, force: true });
  }
  fs.unlinkSync(zipFile);
  return { zip_url: zipUrl };
}

async function installFiles(manifest, baseUrl, platform) {
  const installed = [];
  for (const file of Object.keys(manifest.files || {})) {
    const url = new URL(`${platform}/${file}`, baseUrl).toString();
    const dest = path.join(SKILL_DIR, file);
    ensureWritableDirectory(path.dirname(dest));
    await download(url, dest, 30000);
    installed.push(file);
  }
  return { files: installed };
}

async function main() {
  const platform = normalizePlatformId(argValue('--platform') || process.env.UUMIT_ADAPTER_PLATFORM || '');
  if (!platform) {
    emit({ ok: false, status: 'adapter_platform_required', error: 'pass --platform on first bridge migration' });
    process.exit(2);
  }
  const baseUrl = argValue('--adapter-base-url') || DEFAULT_ADAPTER_BASE_URL;
  const { manifest, url } = await fetchOverlay(baseUrl, platform);
  let install;
  try {
    install = await installZip(manifest, baseUrl, platform);
  } catch (e) {
    install = await installFiles(manifest, baseUrl, platform);
    install.zip_error = e.message;
  }
  writeJson(path.join(SKILL_DIR, 'manifest.overlay.json'), manifest);
  if (!fs.existsSync(path.join(SKILL_DIR, 'policy.json'))) {
    writeJson(path.join(SKILL_DIR, 'policy.json'), manifest.default_policy || defaultPolicyForPlatform(platform));
  }
  emit({ ok: true, status: 'adapter_installed', platform, manifest_url: url, install });
}

main().catch((error) => {
  emit({ ok: false, status: 'adapter_install_failed', error: error.message });
  process.exit(1);
});
