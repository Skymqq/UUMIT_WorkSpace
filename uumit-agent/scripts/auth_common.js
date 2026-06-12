/**
 * UUMit Skill — Shared Auth Credential Module
 *
 * Multi-profile support for uumit-auth.json.
 * Used by all scripts (auth.js, rest_request.js, cruise_*.js, etc.)
 *
 * Auth file structure (memory/uumit-auth.json):
 *   {
 *     "current": "<active-profile-name>",
 *     "profiles": {
 *       "<name>": {
 *         "cached_api_key": "...",
 *         "cached_user_id": "...",
 *         "updated_at": "..."
 *       }
 *     }
 *   }
 *
 * Backward compat: reads old flat format and migrates on first write.
 */
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');
const AUTH_FILE = path.join(SKILL_DIR, 'memory', 'uumit-auth.json');

function getAuthFilePath() {
  return AUTH_FILE;
}

function ensureDir() {
  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Load raw auth file. Auto-migrates old flat format to multi-profile.
 */
function loadAuthFile() {
  try {
    if (!fs.existsSync(AUTH_FILE)) return { current: 'default', profiles: {} };
    const raw = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    // Detect old flat format (single-profile)
    if (raw.cached_api_key) {
      const migrated = {
        current: 'default',
        profiles: {
          default: {
            cached_api_key: raw.cached_api_key,
            cached_user_id: raw.cached_user_id || '',
            updated_at: raw.updated_at || new Date().toISOString(),
          },
        },
      };
      return migrated;
    }
    return raw;
  } catch (e) {
    return { current: 'default', profiles: {} };
  }
}

function saveAuthFile(data) {
  ensureDir();
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Get active profile name.
 */
function getActiveProfileName() {
  const auth = loadAuthFile();
  const name = auth.current || 'default';
  if (!auth.profiles[name]) {
    // Fallback to first available profile
    const keys = Object.keys(auth.profiles);
    return keys.length > 0 ? keys[0] : 'default';
  }
  return name;
}

/**
 * Get credentials for the active (current) profile.
 * Priority: env vars > active profile file
 * Returns { apiKey, userId }
 */
function getActiveCredentials() {
  let apiKey = process.env.UUMIT_API_KEY || '';
  let userId = process.env.UUMIT_USER_ID || '';
  if (apiKey && userId) return { apiKey, userId };

  const auth = loadAuthFile();
  const profileName = getActiveProfileName();
  const profile = auth.profiles[profileName];
  if (profile) {
    apiKey = profile.cached_api_key || '';
    userId = profile.cached_user_id || '';
  }
  return { apiKey, userId };
}

/**
 * Get credentials for a specific named profile.
 */
function getProfileCredentials(profileName) {
  const auth = loadAuthFile();
  const profile = auth.profiles[profileName];
  if (!profile) return { apiKey: '', userId: '' };
  return {
    apiKey: profile.cached_api_key || '',
    userId: profile.cached_user_id || '',
  };
}

/**
 * List all profile names.
 * Returns array of { name, userId, updatedAt, isCurrent }
 */
function listProfiles() {
  const auth = loadAuthFile();
  const current = auth.current || 'default';
  return Object.entries(auth.profiles).map(([name, data]) => ({
    name,
    userId: data.cached_user_id || '',
    updatedAt: data.updated_at || '',
    isCurrent: name === current,
  }));
}

/**
 * Switch active profile.
 * Returns true if successful.
 */
function switchProfile(profileName) {
  const auth = loadAuthFile();
  if (!auth.profiles[profileName]) return false;
  auth.current = profileName;
  saveAuthFile(auth);
  // Also set env vars for current process
  const profile = auth.profiles[profileName];
  if (profile) {
    process.env.UUMIT_API_KEY = profile.cached_api_key || '';
    process.env.UUMIT_USER_ID = profile.cached_user_id || '';
  }
  return true;
}

/**
 * Save/update a profile. If profileName matches current, also sets env vars.
 */
function saveProfile(profileName, apiKey, userId) {
  const auth = loadAuthFile();
  auth.profiles[profileName] = {
    cached_api_key: apiKey,
    cached_user_id: userId,
    updated_at: new Date().toISOString(),
  };
  if (!auth.current) auth.current = profileName;
  saveAuthFile(auth);
  // Update env vars if this is the current profile
  if (auth.current === profileName) {
    process.env.UUMIT_API_KEY = apiKey;
    process.env.UUMIT_USER_ID = userId;
  }
}

/**
 * Delete a profile. If it is the current profile, switches to first available.
 */
function deleteProfile(profileName) {
  const auth = loadAuthFile();
  if (!auth.profiles[profileName]) return false;
  delete auth.profiles[profileName];
  if (auth.current === profileName) {
    const keys = Object.keys(auth.profiles);
    auth.current = keys.length > 0 ? keys[0] : 'default';
    // Update env vars for new current
    if (keys.length > 0) {
      const p = auth.profiles[keys[0]];
      process.env.UUMIT_API_KEY = p.cached_api_key || '';
      process.env.UUMIT_USER_ID = p.cached_user_id || '';
    } else {
      delete process.env.UUMIT_API_KEY;
      delete process.env.UUMIT_USER_ID;
    }
  }
  saveAuthFile(auth);
  return true;
}

/**
 * Backward-compatible loadCredentials for scripts that use the old pattern.
 * Reads from active profile. Priority: env vars > active profile.
 */
function loadCredentials() {
  return getActiveCredentials();
}

module.exports = {
  getAuthFilePath,
  loadAuthFile,
  saveAuthFile,
  getActiveProfileName,
  getActiveCredentials,
  getProfileCredentials,
  listProfiles,
  switchProfile,
  saveProfile,
  deleteProfile,
  loadCredentials,
};
