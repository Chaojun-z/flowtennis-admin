#!/usr/bin/env node
'use strict';

const DEFAULT_BASE_URL = 'https://www.flowtennis.cn';

function normalizeBaseUrl(value = DEFAULT_BASE_URL) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function parseAssetCheck(raw = '') {
  const [assetPath, ...markerParts] = String(raw || '').split('::');
  const marker = markerParts.join('::');
  if (!assetPath || !marker) throw new Error('asset check must use /path.js::marker');
  return { assetPath, marker };
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = { baseUrl: DEFAULT_BASE_URL, timeoutMs: 20000, checks: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base') {
      options.baseUrl = argv[++i];
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = Number(argv[++i]) || options.timeoutMs;
    } else if (arg === '--asset') {
      options.checks.push(parseAssetCheck(argv[++i]));
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function assetUrl(baseUrl, assetPath) {
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  const url = new URL(assetPath, `${normalizeBaseUrl(baseUrl)}/`);
  url.searchParams.set('_deploy_verify', String(Date.now()));
  return url.toString();
}

async function fetchText(url, { fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available');
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(url, {
      headers: { 'cache-control': 'no-cache' },
      signal: controller ? controller.signal : undefined
    });
    if (!res || !res.ok) throw new Error(`request failed: ${res ? res.status : 'no response'}`);
    return await res.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function verifyAssetMarkers({ baseUrl = DEFAULT_BASE_URL, checks = [], fetchImpl, timeoutMs } = {}) {
  if (!Array.isArray(checks) || !checks.length) throw new Error('at least one --asset /path::marker is required');
  const results = [];
  for (const check of checks) {
    const url = assetUrl(baseUrl, check.assetPath);
    const body = await fetchText(url, { fetchImpl, timeoutMs });
    const found = body.includes(check.marker);
    results.push({ assetPath: check.assetPath, marker: check.marker, found });
  }
  const missing = results.filter(item => !item.found);
  return {
    ok: missing.length === 0,
    baseUrl: normalizeBaseUrl(baseUrl),
    results,
    missing
  };
}

function printHelp() {
  console.log([
    'Usage:',
    '  node scripts/verify-production-deployment-assets.js --asset /assets/scripts/pages/packages.js::coursePackageBusinessDedupeKey',
    '',
    'Options:',
    '  --base <url>          default: https://www.flowtennis.cn',
    '  --asset <path::text>  repeatable marker check',
    '  --timeout-ms <ms>     default: 20000'
  ].join('\n'));
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }
  const report = await verifyAssetMarkers(options);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(err => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_BASE_URL,
  parseAssetCheck,
  parseArgs,
  assetUrl,
  verifyAssetMarkers
};
