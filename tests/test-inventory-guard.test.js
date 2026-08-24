const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'check-test-inventory.js');
const configPath = path.join(repoRoot, 'config', 'test-inventory.json');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

assert.ok(fs.existsSync(scriptPath), '必须提供测试清单同步门禁脚本');
assert.ok(fs.existsSync(configPath), '必须提供测试清单基线配置');
assert.ok(packageJson.scripts['guard:test-inventory'], 'package.json 必须提供 guard:test-inventory');
assert.ok(
  packageJson.scripts['guard:release'].includes('npm run guard:test-inventory'),
  'guard:release 必须包含测试清单同步门禁'
);

const guard = require(scriptPath);
assert.ok(guard.evaluateTestInventory, '测试清单脚本必须导出 evaluateTestInventory');

const result = guard.evaluateTestInventory({
  testFiles: ['tests/a.test.js', 'tests/b.test.js', 'tests/c.test.js'],
  npmScripts: {
    test: 'node tests/a.test.js',
    'test:special': 'node tests/b.test.js'
  },
  config: {
    knownUnreferencedTests: [
      {
        file: 'tests/c.test.js',
        category: 'manual',
        reason: '需要外部环境'
      }
    ]
  }
});
assert.strictEqual(result.ok, true, '已进入脚本或已登记原因的测试应通过清单门禁');

const failed = guard.evaluateTestInventory({
  testFiles: ['tests/a.test.js', 'tests/new-risk.test.js'],
  npmScripts: {
    test: 'node tests/a.test.js'
  },
  config: {
    knownUnreferencedTests: []
  }
});
assert.strictEqual(failed.ok, false, '新增测试未进入任何脚本且未登记原因时必须失败');
assert.match(failed.errors.join('\n'), /new-risk\.test\.js/);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-inventory-'));
const run = spawnSync('node', [scriptPath, '--root', repoRoot, '--config', configPath], {
  cwd: repoRoot,
  encoding: 'utf8'
});
assert.strictEqual(run.status, 0, run.stderr || run.stdout);
assert.match(run.stdout, /test inventory guard passed/i);
fs.rmSync(tmpDir, { recursive: true, force: true });

const trackedTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-inventory-tracked-'));
fs.mkdirSync(path.join(trackedTmpDir, 'tests'), { recursive: true });
fs.mkdirSync(path.join(trackedTmpDir, 'config'), { recursive: true });
fs.writeFileSync(path.join(trackedTmpDir, 'package.json'), JSON.stringify({
  scripts: {
    test: 'node tests/a.test.js'
  }
}, null, 2));
fs.writeFileSync(path.join(trackedTmpDir, 'config', 'test-inventory.json'), JSON.stringify({
  knownUnreferencedTests: []
}, null, 2));
fs.writeFileSync(path.join(trackedTmpDir, 'tests', 'a.test.js'), 'console.log("a");\n');
fs.writeFileSync(path.join(trackedTmpDir, 'tests', 'local-only.test.js'), 'console.log("local only");\n');
spawnSync('git', ['init'], { cwd: trackedTmpDir, encoding: 'utf8' });
spawnSync('git', ['add', 'package.json', 'config/test-inventory.json', 'tests/a.test.js'], {
  cwd: trackedTmpDir,
  encoding: 'utf8'
});
const trackedRun = spawnSync('node', [
  scriptPath,
  '--root',
  trackedTmpDir,
  '--config',
  path.join(trackedTmpDir, 'config', 'test-inventory.json')
], {
  cwd: trackedTmpDir,
  encoding: 'utf8'
});
assert.strictEqual(trackedRun.status, 0, trackedRun.stderr || trackedRun.stdout);
assert.doesNotMatch(trackedRun.stdout, /local-only\.test\.js/);
fs.rmSync(trackedTmpDir, { recursive: true, force: true });

console.log('test inventory guard tests passed');
