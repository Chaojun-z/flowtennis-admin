const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'release-api-smoke.js');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

assert.ok(fs.existsSync(scriptPath), '必须提供发布前真实接口冒烟脚本');
assert.ok(packageJson.scripts['guard:api-smoke'], 'package.json 必须提供 guard:api-smoke');
assert.ok(packageJson.scripts['guard:post-release'], 'package.json 必须提供 guard:post-release');
assert.ok(packageJson.scripts['guard:lead-pool-health'], 'package.json 必须提供 guard:lead-pool-health');
assert.ok(
  packageJson.scripts['guard:release'].includes('npm run guard:api-smoke'),
  'guard:release 必须包含接口冒烟门禁'
);
assert.ok(
  packageJson.scripts['guard:post-release'].includes('node scripts/release-api-smoke.js')
    && packageJson.scripts['guard:post-release'].includes('npm run guard:lead-pool-health'),
  'guard:post-release 必须同时执行接口冒烟和线索池健康检查'
);

const smoke = require(scriptPath);
assert.ok(smoke.runApiSmoke, '接口冒烟脚本必须导出 runApiSmoke');
assert.ok(smoke.resolveSmokeConfig, '接口冒烟脚本必须导出配置解析函数');

const skipped = smoke.resolveSmokeConfig({}, ['--allow-missing-config']);
assert.strictEqual(skipped.ok, true, '允许缺配置模式下不能误报失败');
assert.strictEqual(skipped.enabled, false, '缺少 baseUrl 时必须明确标记未启用真实冒烟');

const required = smoke.resolveSmokeConfig({}, []);
assert.strictEqual(required.ok, false, '严格模式缺少 baseUrl 必须失败');
assert.match(required.errors.join('\n'), /API_SMOKE_BASE_URL|FLOWTENNIS_API_SMOKE_BASE_URL/);

async function runFakeSmoke() {
  const calls = [];
  const result = await smoke.runApiSmoke({
    baseUrl: 'https://staging.example.com',
    expectedInstance: 'flow-staging',
    token: 'token-1',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith('/api/diag')) {
        return {
          status: 200,
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ TS_INSTANCE: 'flow-staging', ok: true })
        };
      }
      return {
        status: 200,
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ ok: true, data: [] })
      };
    }
  });
  assert.strictEqual(result.ok, true, result.errors.join('\n'));
  assert.ok(calls.some((call) => call.url.endsWith('/api/diag')), '必须检查 /api/diag');
  assert.ok(
    calls.some((call) => String(call.options.headers?.Authorization || '').includes('token-1')),
    '带 token 时必须请求受保护接口'
  );
}

runFakeSmoke().then(() => {
  const run = spawnSync('node', [scriptPath, '--allow-missing-config'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  assert.strictEqual(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /api smoke not configured/i);
  console.log('release api smoke script tests passed');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
