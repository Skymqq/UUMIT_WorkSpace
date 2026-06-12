#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  DEFAULT_ADAPTER_BASE_URL,
  download,
  loadLocalPlatform,
  normalizePlatformId,
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

async function fetchOverlay(url) {
  const dest = path.join(os.tmpdir(), `uumit-overlay-${process.pid}.json`);
  await download(url, dest, 15000);
  const overlay = JSON.parse(fs.readFileSync(dest, 'utf8'));
  fs.unlinkSync(dest);
  return overlay;
}

async function main() {
  const explicit = normalizePlatformId(argValue('--platform') || '');
  const platform = explicit || loadLocalPlatform(SKILL_DIR);
  if (!platform) {
    emit({ ok: false, status: 'adapter_platform_required', error: 'platform cannot be inferred; agent must pass --platform' });
    process.exit(2);
  }
  const baseUrl = argValue('--adapter-base-url') || DEFAULT_ADAPTER_BASE_URL;
  const overlayUrl = argValue('--manifest-url') || new URL(`${platform}/manifest.overlay.json`, baseUrl).toString();
  const overlay = await fetchOverlay(overlayUrl);
  if (args.includes('--check')) {
    const local = fs.existsSync(path.join(SKILL_DIR, 'manifest.overlay.json'))
      ? JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'manifest.overlay.json'), 'utf8')).version
      : null;
    emit({ ok: true, status: local === overlay.version ? 'up_to_date' : 'update_available', platform, local_version: local, remote_version: overlay.version || null });
    return;
  }
  const updatedFiles = [];
  for (const file of Object.keys(overlay.files || {})) {
    if (args.includes('--fill-missing') && fs.existsSync(path.join(SKILL_DIR, file))) continue;
    const url = new URL(`${platform}/${file}`, baseUrl).toString();
    await download(url, path.join(SKILL_DIR, file), 30000);
    updatedFiles.push(file);
  }
  writeJson(path.join(SKILL_DIR, 'manifest.overlay.json'), overlay);
  emit({ ok: true, status: args.includes('--fill-missing') ? 'filled' : 'updated', platform, updated_files: updatedFiles, to_version: overlay.version || null });
}

main().catch((error) => {
  emit({ ok: false, status: 'adapter_update_failed', error: error.message });
  process.exit(1);
});
