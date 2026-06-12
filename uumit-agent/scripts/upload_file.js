#!/usr/bin/env node
/**
 * UUMit Skill — Smart File Upload Script
 *
 * Usage:
 *   node upload_file.js <FILE_PATH> [--threads N] [--folder attachments]
 *
 * Credentials: env vars UUMIT_API_KEY + UUMIT_USER_ID, or auth file
 *
 * Returns JSON with data.filename as OSS storage key.
 * Files >20 MB are uploaded with the built-in chunked flow.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SKILL_DIR_UF = path.resolve(__dirname, '..');
function _resolveBaseUrl() {
  if (process.env.UUMIT_BASE_URL) return process.env.UUMIT_BASE_URL;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(SKILL_DIR_UF, 'memory', 'uumit-config.json'), 'utf8'));
    if (cfg.base_url) return cfg.base_url;
  } catch (_) {}
  return 'https://api.uumit.com';
}
const BASE_URL = _resolveBaseUrl();
const SMALL_FILE_TIMEOUT = parseInt(process.env.UUMIT_UPLOAD_TIMEOUT_MS || '120000', 10);
const JSON_REQUEST_TIMEOUT = parseInt(process.env.UUMIT_UPLOAD_JSON_TIMEOUT_MS || '60000', 10);
const PART_UPLOAD_TIMEOUT = parseInt(process.env.UUMIT_UPLOAD_PART_TIMEOUT_MS || '300000', 10);
const COMPLETE_TIMEOUT = parseInt(process.env.UUMIT_UPLOAD_COMPLETE_TIMEOUT_MS || '300000', 10);
const SMALL_FILE_LIMIT = 20 * 1024 * 1024; // 20 MB
const PART_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_RETRIES = 3;
const DEFAULT_THREADS = 3;
const MAX_THREADS = 5;

const baseUrlObj = new URL(BASE_URL);
const isHttps = baseUrlObj.protocol === 'https:';

const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.jsx': 'text/jsx',
  '.tsx': 'text/tsx',
  '.py': 'text/x-python',
  '.sql': 'application/sql',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
  '.7z': 'application/x-7z-compressed',
};

function guessContentType(filePath) {
  const override = (process.env.UUMIT_UPLOAD_CONTENT_TYPE || '').trim();
  if (override) return override;
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

function log(msg) {
  console.error(msg);
}

const { loadCredentials } = require('./auth_common');

function makeJsonRequest(method, urlPath, headers, bodyData, timeoutMs = JSON_REQUEST_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const url = BASE_URL + urlPath;
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers,
      timeout: timeoutMs,
    };

    const mod = isHttps ? https : http;
    const req = mod.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(raw) });
        } catch (e) {
          reject(new Error(`invalid JSON: ${raw.slice(0, 200)}`));
        }
      });
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error(`request timeout (${timeoutMs}ms)`)); });
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

function requestWithRetry(method, urlPath, headers, bodyData, timeoutMs, retries = MAX_RETRIES) {
  return makeJsonRequest(method, urlPath, headers, bodyData, timeoutMs).catch(async (err) => {
    if (retries > 1) {
      const wait = Math.pow(2, MAX_RETRIES - retries + 1) * 1000;
      log(`${err.message}, retry in ${wait / 1000}s`);
      await new Promise(r => setTimeout(r, wait));
      return requestWithRetry(method, urlPath, headers, bodyData, timeoutMs, retries - 1);
    }
    throw err;
  });
}

function uploadSmallFile(filePath, apiKey, userId, folder) {
  return new Promise((resolve, reject) => {
    const boundary = '----UUMitUpload' + Date.now();
    const fileName = path.basename(filePath);
    const fileContent = fs.readFileSync(filePath);
    const contentType = guessContentType(filePath);

    const parts = [];
    if (folder) {
      parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="folder"\r\n\r\n` +
        `${folder}\r\n`
      ));
    }
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`
    ));
    parts.push(fileContent);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    const urlObj = new URL(BASE_URL + '/api/v1/upload/file');
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'X-Api-Key': apiKey,
        'X-Platform-User-Id': userId,
      },
      timeout: SMALL_FILE_TIMEOUT,
    };

    const mod = isHttps ? https : http;
    const req = mod.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(raw) });
        } catch (e) {
          reject(new Error(`invalid JSON: ${raw.slice(0, 200)}`));
        }
      });
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error(`upload timeout (${SMALL_FILE_TIMEOUT}ms)`)); });
    req.write(body);
    req.end();
  });
}

function uploadPart(filePath, url, partIndex, totalParts) {
  return new Promise((resolve, reject) => {
    const start = partIndex * PART_SIZE;
    const end = Math.min(start + PART_SIZE, fs.statSync(filePath).size) - 1;
    const stream = fs.createReadStream(filePath, { start, end });
    const contentLength = end - start + 1;
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'PUT',
      headers: { 'Content-Length': contentLength },
      timeout: PART_UPLOAD_TIMEOUT,
    };

    const mod = urlObj.protocol === 'https:' ? https : http;
    const req = mod.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode !== 200 && res.statusCode !== 201) {
          return reject(new Error(`part ${partIndex + 1}/${totalParts} HTTP ${res.statusCode}`));
        }
        const etag = (res.headers.etag || '').replace(/"/g, '');
        if (!etag) return reject(new Error(`part ${partIndex + 1}/${totalParts} no ETag`));
        resolve({ partIndex, etag });
      });
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error(`part ${partIndex + 1} timeout (${PART_UPLOAD_TIMEOUT}ms)`)); });
    stream.on('error', (e) => {
      req.destroy();
      reject(e);
    });
    stream.pipe(req);
  });
}

function uploadPartWithRetry(filePath, url, partIndex, totalParts, retries = MAX_RETRIES) {
  return uploadPart(filePath, url, partIndex, totalParts).catch(async (err) => {
    if (retries > 1) {
      const wait = Math.pow(2, MAX_RETRIES - retries + 1) * 1000;
      log(`part ${partIndex + 1} failed: ${err.message}, retry in ${wait / 1000}s`);
      await new Promise(r => setTimeout(r, wait));
      return uploadPartWithRetry(filePath, url, partIndex, totalParts, retries - 1);
    }
    throw err;
  });
}

async function uploadChunkedFile(filePath, apiKey, userId, threads, folder) {
  const fileName = path.basename(filePath);
  const fileSize = fs.statSync(filePath).size;
  const partCount = Math.ceil(fileSize / PART_SIZE);
  const contentType = guessContentType(filePath);
  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Key': apiKey,
    'X-Platform-User-Id': userId,
  };

  log(`File: ${fileName}`);
  log(`Mode: chunked | Size: ${(fileSize / 1048576).toFixed(1)}MB | Parts: ${partCount} | Threads: ${threads}`);

  const initBody = JSON.stringify({
    file_name: fileName,
    file_size: fileSize,
    file_type: contentType,
    folder,
  });
  const { statusCode: initStatus, data: initData } = await requestWithRetry(
    'POST', '/api/v1/upload/chunked/init', headers, initBody, JSON_REQUEST_TIMEOUT
  );
  if (initStatus !== 200 || initData.code !== 0) {
    throw new Error(JSON.stringify({ error: 'init failed', status: initStatus, body: initData }));
  }

  const { upload_id: uploadId, storage_key: storageKey, part_urls: partUrls } = initData.data;
  log(`Init OK: upload_id=${uploadId.slice(0, 8)}... (${partUrls.length} parts)`);

  const startTime = Date.now();
  const completedEtags = {};
  let completedCount = 0;

  const uploadOne = async (index) => {
    const { etag } = await uploadPartWithRetry(filePath, partUrls[index], index, partCount);
    completedEtags[index] = etag;
    completedCount++;
    const elapsed = (Date.now() - startTime) / 1000;
    const uploadedMB = Math.min(completedCount * PART_SIZE, fileSize) / 1048576;
    const totalMB = fileSize / 1048576;
    const speed = uploadedMB / (elapsed || 0.001);
    const pct = Math.floor(completedCount / partCount * 100);
    log(`[upload] ${completedCount}/${partCount} (${pct}%) | ${uploadedMB.toFixed(1)}/${totalMB.toFixed(1)}MB | ${speed.toFixed(1)}MB/s`);
  };

  for (let i = 0; i < partCount; i += threads) {
    const batch = [];
    for (let j = i; j < Math.min(i + threads, partCount); j++) {
      batch.push(uploadOne(j));
    }
    await Promise.all(batch);
  }

  const partEtags = [];
  for (let i = 0; i < partCount; i++) {
    partEtags.push(completedEtags[i]);
  }

  const completeBody = JSON.stringify({
    upload_id: uploadId,
    storage_key: storageKey,
    file_name: fileName,
    file_size: fileSize,
    file_type: contentType,
    part_etags: partEtags,
  });
  const { statusCode: compStatus, data: compData } = await requestWithRetry(
    'POST', '/api/v1/upload/chunked/complete', headers, completeBody, COMPLETE_TIMEOUT
  );
  if (compStatus !== 200 || compData.code !== 0) {
    throw new Error(JSON.stringify({ error: 'complete failed', status: compStatus, body: compData }));
  }

  const elapsed = (Date.now() - startTime) / 1000;
  log(`Complete: ${elapsed.toFixed(1)}s @ ${(fileSize / elapsed / 1048576).toFixed(1)}MB/s`);
  return { statusCode: compStatus, data: compData };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node upload_file.js <FILE_PATH> [--threads N] [--folder attachments]');
    process.exit(2);
  }

  let threads = DEFAULT_THREADS;
  const threadIdx = args.indexOf('--threads');
  if (threadIdx >= 0 && threadIdx + 1 < args.length) {
    threads = Math.max(1, Math.min(parseInt(args[threadIdx + 1], 10) || DEFAULT_THREADS, MAX_THREADS));
    args.splice(threadIdx, 2);
  }
  let folder = 'attachments';
  const folderIdx = args.indexOf('--folder');
  if (folderIdx >= 0 && folderIdx + 1 < args.length) {
    folder = args[folderIdx + 1];
    args.splice(folderIdx, 2);
  }

  const filePath = args[0];
  if (!fs.existsSync(filePath)) {
    console.error(JSON.stringify({ error: `file not found: ${filePath}` }));
    process.exit(1);
  }

  const fileSize = fs.statSync(filePath).size;
  const { apiKey, userId } = loadCredentials();
  if (!apiKey || !userId) {
    console.error('Credentials not found. Set UUMIT_API_KEY and UUMIT_USER_ID env vars.');
    process.exit(2);
  }

  try {
    const { statusCode, data } = fileSize > SMALL_FILE_LIMIT
      ? await uploadChunkedFile(filePath, apiKey, userId, threads, folder)
      : await uploadSmallFile(filePath, apiKey, userId, folder);
    if (statusCode !== 200 || data.code !== 0) {
      console.error(JSON.stringify({ error: data.message || `HTTP ${statusCode}` }));
      process.exit(1);
    }
    console.log(JSON.stringify(data));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});