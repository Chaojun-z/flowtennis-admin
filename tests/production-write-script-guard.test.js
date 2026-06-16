const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const scriptsDir = path.join(root, 'scripts');
const guardPath = path.join(root, 'scripts', 'lib', 'production-write-guard.js');
const mabaoCorePath = path.join(root, 'scripts', 'lib', 'mabao-import-core.js');

assert.ok(fs.existsSync(guardPath), '生产写脚本必须有统一安全入口 scripts/lib/production-write-guard.js');

const productionWriteGuard = require(guardPath);

assert.deepStrictEqual(
  productionWriteGuard.parseWriteFlags([]),
  { write: false, dryRun: true },
  '默认必须是 dry-run'
);
assert.deepStrictEqual(
  productionWriteGuard.parseWriteFlags(['--write']),
  { write: true, dryRun: false },
  '--write 才允许进入写模式'
);

async function testDiagTokenAndTargetCheck() {
  const requests = [];
  const target = await productionWriteGuard.assertProductionWriteTarget({
    env: {
      DIAG_TOKEN: 'diag-token-test',
      TS_ENDPOINT: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
      TS_INSTANCE: 'flowtennis-ue'
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          env: {
            TS_ENDPOINT: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
            TS_INSTANCE: 'flowtennis-ue'
          }
        })
      };
    }
  });

  assert.strictEqual(target.onlineInstance, 'flowtennis-ue');
  assert.strictEqual(requests[0].options.headers.Authorization, 'Bearer diag-token-test');

  await assert.rejects(
    () => productionWriteGuard.assertProductionWriteTarget({
      env: {
        TS_ENDPOINT: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
        TS_INSTANCE: 'flowtennis-ue'
      },
      fetchImpl: async () => ({ ok: true, json: async () => ({ env: {} }) })
    }),
    /DIAG_TOKEN/,
    '写生产前必须显式提供 DIAG_TOKEN'
  );

  await assert.rejects(
    () => productionWriteGuard.assertProductionWriteTarget({
      env: {
        DIAG_TOKEN: 'diag-token-test',
        TS_ENDPOINT: 'https://old.example.com',
        TS_INSTANCE: 'flowtennis'
      },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          env: {
            TS_ENDPOINT: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
            TS_INSTANCE: 'flowtennis-ue'
          }
        })
      })
    }),
    /与线上 .* 不一致/,
    '本地目标和线上实例不一致必须停止'
  );
}

function listJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'lib') continue;
      files.push(...listJsFiles(fullPath));
    } else if (entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

const mabaoCoreSource = fs.readFileSync(mabaoCorePath, 'utf8');
assert.match(
  mabaoCoreSource,
  /production-write-guard/,
  '马坡导入公共核心也必须走统一生产写安全入口'
);

function looksWriteCapable(source) {
  return source.includes('--write') ||
    /\b(putRow|deleteRow|createTableIfMissing|pool\.query|client\.query|gc\(\)\.putRow|gc\(\)\.createTable)\b/.test(source);
}

const writeScripts = listJsFiles(scriptsDir).filter((filePath) => {
  const source = fs.readFileSync(filePath, 'utf8');
  return looksWriteCapable(source);
});

assert.ok(writeScripts.length > 0, '应能扫描到支持 --write 的脚本');

for (const filePath of writeScripts) {
  const source = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(root, filePath);
  const directGuard = /production-write-guard/.test(source);
  const viaMabaoCore = /require\(['"]\.\/lib\/mabao-import-core['"]\)/.test(source);
  assert.ok(directGuard || viaMabaoCore, `${rel} 会写数据，必须接入统一生产写安全入口`);
}

testDiagTokenAndTargetCheck().then(() => {
  console.log('production write script guard tests passed');
}).catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
