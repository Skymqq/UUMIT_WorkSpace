#!/usr/bin/env node
/**
 * UUMit Skill — package self-check.
 *
 * Checks:
 * - manifest files exist and sha256 values match
 * - SKILL.md / metadata / manifest versions are consistent
 * - adapter overlay / policy files are complete and versioned
 * - deprecated paths or old script names are not present
 * - documented REST endpoints are covered by rest_request.js allowlist
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const SKILL_DIR = path.resolve(__dirname, '..');
const ADAPTERS_DIR = path.join(SKILL_DIR, 'adapters');
const MANIFEST_PATH = path.join(SKILL_DIR, 'manifest.json');
const OVERLAY_PATH = path.join(SKILL_DIR, 'manifest.overlay.json');
const POLICY_PATH = path.join(SKILL_DIR, 'policy.json');
const SKILL_PATH = path.join(SKILL_DIR, 'SKILL.md');
const REST_PATH = path.join(SKILL_DIR, 'scripts', 'rest_request.js');

const DOC_FILES = [
  'SKILL.md',
  'PLAYBOOKS.md',
  'INTEROP.md',
  'API_REFERENCE.md',
  'DEEP_LINKS.md',
  'HOSTS.md',
  'SAFETY.md',
  'TROUBLESHOOTING.md',
];

const OPENAPI_SPEC_TOKEN = 'openapi-spec';
const NOT_IMPLEMENTED_ZH = '\u672a\u5b9e\u73b0';

const DEPRECATED_PATTERNS = [
  /1\.0\.4/,
  /exchange-rates\/latest/,
  /upload_file\.py/,
  /chunked_upload\.py/,
  /tasks\/pushes\/mine/,
  new RegExp(`${OPENAPI_SPEC_TOKEN}\`?\\s*.*${NOT_IMPLEMENTED_ZH}`),
];

const JWT_ONLY_SKILL_PATTERNS = [
  /\/api\/v1\/daily\/(checkin|lucky-flip|time-capsule)/,
  /\/api\/v1\/invite\/(codes\/refresh|chain|records|queue\/list|queue\/invite)/,
];

const JWT_ONLY_ALLOWLIST_PATTERNS = [
  /daily\\\/\(checkin\|lucky-flip\|time-capsule/,
  /invite\\\/\(codes\\\/refresh\|chain\|records\|queue\\\/list\|queue\\\/invite/,
];

function read(file) {
  return fs.readFileSync(path.join(SKILL_DIR, file), 'utf8');
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function extractFrontmatterVersion(skillText) {
  const m = skillText.match(/^version:\s*([^\n\r]+)/m);
  return m ? m[1].trim() : null;
}

function extractMetadataVersion(skillText) {
  const line = skillText.split(/\r?\n/).find((l) => l.startsWith('metadata: '));
  if (!line) return null;
  try {
    const metadata = JSON.parse(line.slice('metadata: '.length));
    return metadata.agent_skill && metadata.agent_skill.version;
  } catch (e) {
    throw new Error(`metadata JSON parse failed: ${e.message}`);
  }
}

function loadAllowlist() {
  const code = fs.readFileSync(REST_PATH, 'utf8');
  const start = code.indexOf('const ALLOWED_ROUTES = [');
  const end = code.indexOf('];', start);
  if (start === -1 || end === -1) {
    throw new Error('ALLOWED_ROUTES block not found');
  }
  const snippet = code.slice(start, end + 2) + '\nALLOWED_ROUTES;';
  const script = new vm.Script(snippet);
  return script.runInNewContext({});
}

function normalizeEndpoint(raw) {
  let endpoint = raw.trim();
  endpoint = endpoint.replace(/^https?:\/\/[^/]+/, '');
  endpoint = endpoint.replace(/\?[^`\s|)]*/g, '');
  endpoint = endpoint.replace(/\{[a-zA-Z0-9_]+\}/g, '00000000-0000-0000-0000-000000000000');
  endpoint = endpoint.replace(/<[^>]+>/g, '00000000-0000-0000-0000-000000000000');
  return endpoint;
}

function collectDocumentedRoutes() {
  const routes = [];
  const seen = new Set();
  const re = /`(GET|POST|PUT|PATCH|DELETE)\s+([^`]+)`/g;

  function addRoute(file, method, rawEndpoint) {
    const endpoint = normalizeEndpoint(rawEndpoint.split(/\s+/)[0]);
    if (!endpoint.startsWith('/') || endpoint.includes('...')) return;

    const key = `${file}:${method}:${endpoint}`;
    if (seen.has(key)) return;
    seen.add(key);
    routes.push({ file, method, endpoint });
  }

  for (const file of DOC_FILES) {
    const filePath = path.join(SKILL_DIR, file);
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, 'utf8');
    let match;
    while ((match = re.exec(text)) !== null) {
      addRoute(file, match[1], match[2]);
    }

    for (const line of text.split(/\r?\n/)) {
      const codeSpans = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
      for (let i = 0; i < codeSpans.length - 1; i++) {
        if (/^(GET|POST|PUT|PATCH|DELETE)$/.test(codeSpans[i])) {
          addRoute(file, codeSpans[i], codeSpans[i + 1]);
        }
      }
    }
  }
  return routes;
}

function routeAllowed(allowlist, method, endpoint) {
  const clean = endpoint.split('?')[0];
  return allowlist.some(([m, re]) => m === method && re.test(clean));
}

function findAdapterDirs() {
  if (!fs.existsSync(ADAPTERS_DIR)) return [];
  return fs.readdirSync(ADAPTERS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(ADAPTERS_DIR, entry.name));
}

function parseJsonFile(file, errors, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    errors.push(`${label} parse failed: ${e.message}`);
    return null;
  }
}

function validatePolicyShape(policy, errors, label) {
  const required = [
    'platform',
    'agent_platform_type',
    'transport_priority',
    'mcp_enabled',
    'write_policy',
    'auto_apply',
    'auto_accept_application',
    'auto_deliver',
    'allow_background_runtime',
    'expose_local_env',
  ];
  for (const key of required) {
    if (!(key in policy)) errors.push(`${label} missing policy field: ${key}`);
  }
  if (!Array.isArray(policy.transport_priority)) {
    errors.push(`${label} policy transport_priority must be an array`);
  }
  if (policy.write_policy === 'dry_run_then_confirm') {
    for (const key of ['auto_apply', 'auto_accept_application', 'auto_deliver']) {
      if (policy[key] !== false) errors.push(`${label} strict policy must set ${key}=false`);
    }
  }
}

function validateAdapterDirs(manifestVersion, errors, warnings) {
  const dirs = findAdapterDirs();
  if (dirs.length === 0) {
    warnings.push('no adapter directories found');
    return 0;
  }

  let adapterFileCount = 0;
  for (const dir of dirs) {
    const label = `adapter ${path.basename(dir)}`;
    const overlayPath = path.join(dir, 'manifest.overlay.json');
    const policyPath = path.join(dir, 'policy.json');
    if (!fs.existsSync(overlayPath)) {
      errors.push(`${label} manifest.overlay.json missing`);
      continue;
    }
    if (!fs.existsSync(policyPath)) {
      errors.push(`${label} policy.json missing`);
      continue;
    }

    const overlay = parseJsonFile(overlayPath, errors, `${label} manifest.overlay.json`);
    const policy = parseJsonFile(policyPath, errors, `${label} policy.json`);
    if (!overlay || !policy) continue;

    if (overlay.version !== manifestVersion) {
      errors.push(`${label} version mismatch: manifest=${manifestVersion}, overlay=${overlay.version || 'missing'}`);
    }
    if (policy.version !== manifestVersion) {
      errors.push(`${label} version mismatch: manifest=${manifestVersion}, policy=${policy.version || 'missing'}`);
    }
    if (overlay.platform !== policy.platform) {
      errors.push(`${label} platform mismatch: overlay=${overlay.platform || 'missing'}, policy=${policy.platform || 'missing'}`);
    }
    if (overlay.default_policy && overlay.default_policy.platform !== policy.platform) {
      errors.push(`${label} default_policy platform mismatch: default_policy=${overlay.default_policy.platform || 'missing'}, policy=${policy.platform || 'missing'}`);
    }
    if (overlay.default_policy && overlay.default_policy.version !== manifestVersion) {
      errors.push(`${label} default_policy version mismatch: manifest=${manifestVersion}, default_policy=${overlay.default_policy.version || 'missing'}`);
    }

    validatePolicyShape(policy, errors, label);

    for (const file of Object.keys(overlay.files || {})) {
      adapterFileCount += 1;
      if (!fs.existsSync(path.join(dir, file))) {
        errors.push(`${label} adapter file missing: ${file}`);
      }
    }

    if (policy.write_policy === 'dry_run_then_confirm') {
      const textFiles = fs.readdirSync(dir).filter((file) => /\.(md|mdc|json)$/.test(file));
      for (const file of textFiles) {
        const text = fs.readFileSync(path.join(dir, file), 'utf8');
        if (/自动申请|自动接受|自动交付|本目录下有\s*`SKILL\.md`/.test(text)) {
          errors.push(`${label} policy conflict in ${file}: strict platform contains auto-write or wrong local-SKILL wording`);
        }
      }
    }
  }

  return adapterFileCount;
}

function main() {
  const errors = [];
  const warnings = [];

  let manifest;
  let overlay = null;
  let policy = null;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (e) {
    errors.push(`manifest parse failed: ${e.message}`);
    manifest = { files: {} };
  }

  if (fs.existsSync(OVERLAY_PATH)) {
    try {
      overlay = JSON.parse(fs.readFileSync(OVERLAY_PATH, 'utf8'));
    } catch (e) {
      errors.push(`manifest.overlay.json parse failed: ${e.message}`);
    }
  }

  if (fs.existsSync(POLICY_PATH)) {
    try {
      policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
    } catch (e) {
      errors.push(`policy.json parse failed: ${e.message}`);
    }
  }

  for (const [file, meta] of Object.entries(manifest.files || {})) {
    const fullPath = path.join(SKILL_DIR, file);
    if (!fs.existsSync(fullPath)) {
      errors.push(`manifest file missing: ${file}`);
      continue;
    }
    const shaOptionalFiles = new Set([...DOC_FILES, 'scripts/validate_skill.js']);
    const isShaOptional = shaOptionalFiles.has(file);
    if (meta && meta.required && !meta.sha256 && file !== 'manifest.json' && !isShaOptional) {
      errors.push(`manifest sha256 missing: ${file}`);
      continue;
    }
    if (meta && meta.sha256 && file !== 'manifest.json') {
      const actual = sha256File(fullPath);
      if (actual !== meta.sha256) {
        errors.push(`manifest sha256 mismatch: ${file} expected=${meta.sha256} actual=${actual}`);
      }
    }
  }
  if (overlay && overlay.files) {
    for (const file of Object.keys(overlay.files)) {
      if (!fs.existsSync(path.join(SKILL_DIR, file))) {
        errors.push(`adapter file missing: ${file}`);
      }
    }
  }

  const skillText = fs.existsSync(SKILL_PATH) ? fs.readFileSync(SKILL_PATH, 'utf8') : '';
  if (/SKILL\.zh-CN\.md/.test(skillText) && !fs.existsSync(path.join(SKILL_DIR, 'SKILL.zh-CN.md'))) {
    errors.push('SKILL.md references missing SKILL.zh-CN.md');
  }
  const frontmatterVersion = extractFrontmatterVersion(skillText);
  let metadataVersion = null;
  try {
    metadataVersion = extractMetadataVersion(skillText);
  } catch (e) {
    errors.push(e.message);
  }

  const versions = [
    ['manifest', manifest.version],
    ['frontmatter', frontmatterVersion],
    ['metadata', metadataVersion],
  ];
  if (overlay) versions.push(['overlay', overlay.version]);
  if (policy) versions.push(['policy', policy.version]);
  const distinctVersions = new Set(versions.map(([, v]) => v).filter(Boolean));
  if (distinctVersions.size !== 1) {
    errors.push(`version mismatch: ${versions.map(([k, v]) => `${k}=${v || 'missing'}`).join(', ')}`);
  }

  if (overlay && policy && overlay.platform && policy.platform && overlay.platform !== policy.platform) {
    errors.push(`platform mismatch: overlay=${overlay.platform}, policy=${policy.platform}`);
  }

  if (policy && policy.write_policy === 'dry_run_then_confirm') {
    const adapterFiles = ['AGENTS.md', 'CLAUDE.md', 'uumit-skill.mdc', 'trae-rules.md', 'workbuddy-rules.md'];
    for (const file of adapterFiles) {
      const fullPath = path.join(SKILL_DIR, file);
      if (!fs.existsSync(fullPath)) continue;
      const text = fs.readFileSync(fullPath, 'utf8');
      if (/自动申请|自动接受|自动交付|本目录 `SKILL\.md`/.test(text)) {
        errors.push(`policy conflict in ${file}: strict platform still contains auto-write or wrong local-SKILL wording`);
      }
    }
  }

  const adapterFileCount = validateAdapterDirs(manifest.version, errors, warnings);

  for (const file of DOC_FILES.concat([
    'scripts/rest_request.js',
    'scripts/upload_file.js',
    'scripts/runtime_connect.js',
  ])) {
    const fullPath = path.join(SKILL_DIR, file);
    if (!fs.existsSync(fullPath)) continue;
    const text = fs.readFileSync(fullPath, 'utf8');
    for (const pattern of DEPRECATED_PATTERNS) {
      if (pattern.test(text)) {
        errors.push(`deprecated pattern ${pattern} found in ${file}`);
      }
    }
  }

  for (const file of ['SKILL.md', 'API_REFERENCE.md']) {
    const fullPath = path.join(SKILL_DIR, file);
    if (!fs.existsSync(fullPath)) continue;
    const text = fs.readFileSync(fullPath, 'utf8');
    for (const pattern of JWT_ONLY_SKILL_PATTERNS) {
      if (pattern.test(text)) {
        errors.push(`JWT-only endpoint or marker found in Skill callable docs: ${pattern} (${file})`);
      }
    }
  }

  if (fs.existsSync(REST_PATH)) {
    const restText = fs.readFileSync(REST_PATH, 'utf8');
    for (const pattern of JWT_ONLY_ALLOWLIST_PATTERNS) {
      if (pattern.test(restText)) {
        errors.push(`JWT-only endpoint remains in rest_request allowlist: ${pattern}`);
      }
    }
  }

  let allowlist = [];
  try {
    allowlist = loadAllowlist();
  } catch (e) {
    errors.push(`allowlist load failed: ${e.message}`);
  }

  const documentedRoutes = collectDocumentedRoutes();
  for (const route of documentedRoutes) {
    if (!routeAllowed(allowlist, route.method, route.endpoint)) {
      warnings.push(`documented route not in allowlist: ${route.method} ${route.endpoint} (${route.file})`);
    }
  }

  const result = {
    ok: errors.length === 0,
    errors,
    warnings,
    checked: {
      manifest_files: Object.keys(manifest.files || {}).length,
      adapter_files: adapterFileCount,
      documented_routes: documentedRoutes.length,
    },
  };

  const output = JSON.stringify(result, null, 2);
  if (errors.length > 0) {
    console.error(output);
    process.exit(1);
  }
  console.log(output);
}

main();
