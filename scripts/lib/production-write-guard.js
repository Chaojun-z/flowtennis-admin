const DEFAULT_PRODUCTION_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const REQUIRED_PRODUCTION_INSTANCE = 'flowtennis-ue';

function parseWriteFlags(argv = []) {
  const write = argv.includes('--write');
  return {
    write,
    dryRun: argv.includes('--dry-run') || !write
  };
}

function argValue(argv = [], name, fallback = '') {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  return String(argv[index + 1] || '').trim();
}

function assertExplicitWrite({ write, scriptName = '脚本' } = {}) {
  if (!write) throw new Error(`${scriptName} 默认禁止写入；如确认执行，必须显式传入 --write`);
}

function readDiagEnv(diag) {
  return diag?.env || diag || {};
}

function normalizeTarget(env = {}) {
  return {
    localEndpoint: String(env.TS_ENDPOINT || '').trim(),
    localInstance: String(env.TS_INSTANCE || env.TARGET_TS_INSTANCE || '').trim()
  };
}

async function fetchOnlineDiag({
  env = process.env,
  fetchImpl = fetch,
  diagUrl = DEFAULT_PRODUCTION_DIAG_URL
} = {}) {
  const token = String(env.DIAG_TOKEN || '').trim();
  if (!token) throw new Error('停止：写生产脚本必须提供 DIAG_TOKEN');

  const response = await fetchImpl(diagUrl, {
    headers: {
      'Cache-Control': 'no-cache',
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) throw new Error(`线上 diag 失败：${response.status}`);
  return response.json();
}

async function assertProductionWriteTarget({
  env = process.env,
  fetchImpl = fetch,
  diagUrl = DEFAULT_PRODUCTION_DIAG_URL
} = {}) {
  const diag = await fetchOnlineDiag({ env, fetchImpl, diagUrl });
  const diagEnv = readDiagEnv(diag);
  const onlineEndpoint = String(diagEnv.TS_ENDPOINT || '').trim();
  const onlineInstance = String(diagEnv.TS_INSTANCE || '').trim();
  const { localEndpoint, localInstance } = normalizeTarget(env);

  if (!onlineEndpoint || !onlineInstance) {
    throw new Error('停止：线上 /api/diag 未返回 TS_ENDPOINT 或 TS_INSTANCE');
  }
  if (localEndpoint !== onlineEndpoint || localInstance !== onlineInstance) {
    throw new Error(`停止：本地目标 ${localEndpoint} / ${localInstance} 与线上 ${onlineEndpoint} / ${onlineInstance} 不一致`);
  }
  if (onlineInstance !== REQUIRED_PRODUCTION_INSTANCE) {
    throw new Error(`停止：线上实例不是 ${REQUIRED_PRODUCTION_INSTANCE}，当前是 ${onlineInstance}`);
  }

  return {
    onlineEndpoint,
    onlineInstance,
    localEndpoint,
    localInstance,
    diagToken: 'present'
  };
}

function assertProductionWriteTrace({ operationId, batchId, reportPath } = {}) {
  const cleanOperationId = String(operationId || '').trim();
  const cleanBatchId = String(batchId || '').trim();
  const cleanReportPath = String(reportPath || '').trim();
  if (!cleanOperationId) throw new Error('写生产脚本必须生成 operationId');
  if (!cleanBatchId) throw new Error('写生产脚本必须生成 batchId');
  if (cleanBatchId !== `batch-${cleanOperationId}`) {
    throw new Error('写生产脚本 batchId 必须等于 batch-<operationId>');
  }
  if (!cleanReportPath) throw new Error('写生产脚本必须生成报告文件');
  return { operationId: cleanOperationId, batchId: cleanBatchId, reportPath: cleanReportPath };
}

module.exports = {
  DEFAULT_PRODUCTION_DIAG_URL,
  REQUIRED_PRODUCTION_INSTANCE,
  parseWriteFlags,
  argValue,
  assertExplicitWrite,
  readDiagEnv,
  normalizeTarget,
  fetchOnlineDiag,
  assertProductionWriteTarget,
  assertProductionWriteTrace
};
