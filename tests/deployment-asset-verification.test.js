const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const scriptPath = path.join(root, 'scripts', 'verify-production-deployment-assets.js');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const checklist = fs.readFileSync(path.join(root, 'docs', '数据口径变更检查清单.md'), 'utf8');
const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');

assert.ok(fs.existsSync(scriptPath), 'production deployment asset verifier should exist');
assert.match(packageJson.scripts['verify:deployment-assets'], /verify-production-deployment-assets\.js/, 'package script should expose production deployment asset verification');
assert.match(packageJson.scripts.test, /deployment-asset-verification\.test\.js/, 'npm test should run deployment asset verification guard');
assert.match(checklist, /已验证线上静态脚本或接口包含本次提交的新代码标记/, 'data checklist should require online asset or API marker verification');
assert.match(agents, /git push[\s\S]*不代表线上已生效/, 'AGENTS should keep the deployment effectiveness warning');

const verifier = require(scriptPath);

assert.deepStrictEqual(
  verifier.parseAssetCheck('/assets/scripts/pages/packages.js::coursePackageBusinessDedupeKey'),
  { assetPath: '/assets/scripts/pages/packages.js', marker: 'coursePackageBusinessDedupeKey' },
  'asset parser should split path and marker'
);

assert.throws(
  () => verifier.parseAssetCheck('/assets/scripts/pages/packages.js'),
  /asset check must use/,
  'asset parser should reject checks without markers'
);

assert.match(
  verifier.assetUrl('https://www.flowtennis.cn/', '/assets/scripts/pages/packages.js'),
  /^https:\/\/www\.flowtennis\.cn\/assets\/scripts\/pages\/packages\.js\?_deploy_verify=/,
  'asset URL should add a cache-busting deploy verification query'
);

async function run() {
  const requestedUrls = [];
  const report = await verifier.verifyAssetMarkers({
    baseUrl: 'https://www.flowtennis.cn',
    checks: [
      { assetPath: '/assets/scripts/standard/components.js', marker: 'closeStandardDropdownsOnOutsidePointer' },
      { assetPath: '/assets/scripts/pages/packages.js', marker: 'coursePackageBusinessDedupeKey' }
    ],
    fetchImpl: async url => {
      requestedUrls.push(url);
      return {
        ok: true,
        text: async () => `${url.includes('standard') ? 'closeStandardDropdownsOnOutsidePointer' : 'coursePackageBusinessDedupeKey'}`
      };
    }
  });

  assert.strictEqual(report.ok, true, 'all markers found should pass');
  assert.strictEqual(requestedUrls.length, 2, 'verifier should request every configured asset');

  const failed = await verifier.verifyAssetMarkers({
    checks: [{ assetPath: '/assets/scripts/pages/purchases.js', marker: 'new-marker' }],
    fetchImpl: async () => ({ ok: true, text: async () => 'old bundle' })
  });
  assert.strictEqual(failed.ok, false, 'missing marker should fail');
  assert.deepStrictEqual(failed.missing.map(item => item.marker), ['new-marker'], 'failure report should list missing markers');
}

run().then(() => {
  console.log('deployment asset verification tests passed');
}).catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
