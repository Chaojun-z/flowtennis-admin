#!/usr/bin/env node

const DEFAULT_TIMEOUT_MS = 15000;

function normalizeBaseUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '');
}

function parseArgs(argv = []) {
  const args = { allowMissingConfig: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--allow-missing-config') args.allowMissingConfig = true;
    if (token === '--base-url') args.baseUrl = argv[i + 1];
    if (token === '--expected-instance') args.expectedInstance = argv[i + 1];
    if (token === '--timeout-ms') args.timeoutMs = Number(argv[i + 1]);
  }
  return args;
}

function resolveSmokeConfig(env = process.env, argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const baseUrl = normalizeBaseUrl(
    args.baseUrl ||
    env.FLOWTENNIS_API_SMOKE_BASE_URL ||
    env.API_SMOKE_BASE_URL
  );
  const errors = [];
  if (!baseUrl) {
    errors.push('缺少 FLOWTENNIS_API_SMOKE_BASE_URL 或 API_SMOKE_BASE_URL，未配置真实接口冒烟目标');
  }
  if (errors.length && !args.allowMissingConfig) {
    return { ok: false, enabled: false, errors };
  }
  if (errors.length && args.allowMissingConfig) {
    return { ok: true, enabled: false, errors };
  }
  return {
    ok: true,
    enabled: true,
    errors: [],
    baseUrl,
    expectedInstance: String(args.expectedInstance || env.API_SMOKE_EXPECTED_INSTANCE || '').trim(),
    token: String(env.FLOWTENNIS_ADMIN_TOKEN || env.API_SMOKE_ADMIN_TOKEN || '').trim(),
    username: String(env.FLOWTENNIS_ADMIN_USERNAME || env.API_SMOKE_ADMIN_USERNAME || '').trim(),
    password: String(env.FLOWTENNIS_ADMIN_PASSWORD || env.API_SMOKE_ADMIN_PASSWORD || '').trim(),
    timeoutMs: Number.isFinite(args.timeoutMs) && args.timeoutMs > 0 ? args.timeoutMs : DEFAULT_TIMEOUT_MS
  };
}

function makeUrl(baseUrl, pathname) {
  return `${normalizeBaseUrl(baseUrl)}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

async function readJsonResponse(response, label) {
  const contentType = response.headers?.get ? String(response.headers.get('content-type') || '') : '';
  if (contentType && !contentType.includes('application/json')) {
    throw new Error(`${label} 返回非 JSON：${contentType}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${label} JSON 解析失败：${error.message}`);
  }
}

async function requestJson({ baseUrl, pathname, method = 'GET', token = '', body, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetchImpl(makeUrl(baseUrl, pathname), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller?.signal
    });
    const json = await readJsonResponse(response, pathname);
    return { pathname, status: response.status, ok: response.ok, json };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function extractToken(loginJson = {}) {
  return loginJson.token || loginJson.accessToken || loginJson.data?.token || loginJson.data?.accessToken || '';
}

async function resolveAuthToken(config, fetchImpl) {
  if (config.token) return config.token;
  if (!config.username || !config.password) return '';
  const login = await requestJson({
    baseUrl: config.baseUrl,
    pathname: '/server/auth/login',
    method: 'POST',
    body: { username: config.username, password: config.password },
    fetchImpl,
    timeoutMs: config.timeoutMs
  });
  if (!login.ok) throw new Error(`登录接口失败：HTTP ${login.status}`);
  const token = extractToken(login.json);
  if (!token) throw new Error('登录接口未返回 token');
  return token;
}

function buildProtectedChecks() {
  return [
    '/server/page-data/finance',
    '/server/page-data/workbench',
    '/server/page-data/courts',
    '/server/page-data/memberships',
    '/server/page-data/purchases',
    '/server/page-data/plans',
    '/server/page-data/coaches'
  ];
}

async function runApiSmoke({ baseUrl, expectedInstance = '', token = '', username = '', password = '', fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const errors = [];
  const warnings = [];
  const checks = [];
  const config = { baseUrl, expectedInstance, token, username, password, timeoutMs };

  if (!normalizeBaseUrl(baseUrl)) {
    return { ok: false, errors: ['缺少接口冒烟 baseUrl'], warnings, checks };
  }

  try {
    const diag = await requestJson({ baseUrl, pathname: '/api/diag', fetchImpl, timeoutMs });
    checks.push({ pathname: '/api/diag', status: diag.status });
    if (!diag.ok) errors.push(`/api/diag HTTP ${diag.status}`);
    const actualInstance = diag.json?.TS_INSTANCE || diag.json?.tsInstance || diag.json?.instance || '';
    if (expectedInstance && actualInstance && actualInstance !== expectedInstance) {
      errors.push(`/api/diag 实例不匹配：expected=${expectedInstance}, actual=${actualInstance}`);
    }
  } catch (error) {
    errors.push(`/api/diag 检查失败：${error.message}`);
  }

  let authToken = '';
  try {
    authToken = await resolveAuthToken(config, fetchImpl);
  } catch (error) {
    errors.push(`登录检查失败：${error.message}`);
  }

  if (!authToken) {
    warnings.push('未配置管理员 token 或账号密码，已跳过受保护 page-data 接口冒烟');
  } else {
    for (const pathname of buildProtectedChecks()) {
      try {
        const result = await requestJson({ baseUrl, pathname, token: authToken, fetchImpl, timeoutMs });
        checks.push({ pathname, status: result.status });
        if ([401, 403, 404, 500].includes(result.status) || !result.ok) {
          errors.push(`${pathname} HTTP ${result.status}`);
        }
      } catch (error) {
        errors.push(`${pathname} 检查失败：${error.message}`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, checks };
}

async function main() {
  const config = resolveSmokeConfig(process.env, process.argv.slice(2));
  if (!config.ok) {
    console.error(config.errors.join('\n'));
    process.exit(1);
  }
  if (!config.enabled) {
    console.log('api smoke not configured');
    console.log(JSON.stringify({ ok: true, enabled: false, warnings: config.errors }, null, 2));
    return;
  }
  const result = await runApiSmoke(config);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    console.error(result.errors.join('\n'));
    process.exit(1);
  }
  console.log('release api smoke passed');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`release api smoke failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  normalizeBaseUrl,
  parseArgs,
  resolveSmokeConfig,
  requestJson,
  extractToken,
  buildProtectedChecks,
  runApiSmoke
};
