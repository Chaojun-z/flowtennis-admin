const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'governance-automation-guard.js');
const configPath = path.join(repoRoot, 'config', 'governance-automation.json');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

assert.ok(fs.existsSync(scriptPath), '必须提供统一治理自动化门禁脚本');
assert.ok(fs.existsSync(configPath), '必须提供治理自动化配置');
assert.ok(packageJson.scripts['guard:governance-automation'], 'package.json 必须提供 guard:governance-automation');
assert.ok(
  packageJson.scripts['guard:release'].includes('npm run guard:governance-automation'),
  'guard:release 必须包含治理自动化门禁'
);
assert.ok(packageJson.scripts['governance:record'], 'package.json 必须提供变更记录生成命令');
assert.ok(packageJson.scripts['guard:post-release'], 'package.json 必须提供发布后核验命令');

const guard = require(scriptPath);
for (const exportName of [
  'parseDocMetadata',
  'evaluateDocumentGovernance',
  'classifyChangedFiles',
  'evaluateChangeRecordCoverage',
  'evaluatePostReleaseCoverage',
  'generateChangeRecord'
]) {
  assert.ok(guard[exportName], `治理门禁必须导出 ${exportName}`);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const currentDoc = fs.readFileSync(path.join(repoRoot, 'docs', 'governance', '治理总览.md'), 'utf8');
const docResult = guard.evaluateDocumentGovernance({
  docs: [{ file: 'docs/governance/治理总览.md', content: currentDoc }],
  config
});
assert.strictEqual(docResult.ok, true, docResult.errors.join('\n'));

const brokenDocResult = guard.evaluateDocumentGovernance({
  docs: [{ file: 'docs/governance/坏文档.md', content: '# 坏文档\n\n没有状态头。\n' }],
  config: {
    ...config,
    governedDocGlobs: ['docs/governance/*.md']
  }
});
assert.strictEqual(brokenDocResult.ok, false, '正式治理文档缺少状态头时必须失败');
assert.match(brokenDocResult.errors.join('\n'), /文档类型|状态|版本|维护人/);

const riskResult = guard.classifyChangedFiles({
  changedFiles: [
    'server/read-models/customer-lifecycle.js',
    'scripts/repair-sample.js',
    'docs/governance/测试与发布流程.md'
  ],
  config
});
assert.strictEqual(riskResult.maxLevel, 'L5', '修数脚本必须自动升级为 L5');
assert.ok(riskResult.requiredChecks.includes('npm run guard:finance'), '高风险改动必须要求财务门禁');
assert.ok(riskResult.requiredChecks.includes('npm run guard:post-release'), '高风险改动必须要求发布后核验');

const missingRecordResult = guard.evaluateChangeRecordCoverage({
  changedFiles: ['server/read-models/customer-lifecycle.js'],
  records: [],
  config
});
assert.strictEqual(missingRecordResult.ok, false, '触达核心读模型时必须有变更记录');
assert.match(missingRecordResult.errors.join('\n'), /需求变更记录/);

const validRecord = `# 2026-08-24 治理自动化门禁

> 文档类型：需求变更记录
> 状态：生效
> 版本：2026-08-24
> 生效日期：2026-08-24
> 最后审查日期：2026-08-24
> 维护人：FlowTennis 项目负责人
> 唯一依据：记录本次变更影响面，不替代 PRD 和口径正本。
> 替代文档：无

## 风险等级

L3

## 变更文件

- server/read-models/customer-lifecycle.js

## 影响页面

- 管理后台：客户中心

## 影响接口

- /server/page-data/workbench

## 影响表

- 无直接写表

## 影响指标

- 客户生命周期指标

## 测试映射

- npm test

## 异常豁免

- 无

## 事故反馈闭环

- 本次非线上事故修复

## 发布后核验

- npm run guard:post-release
`;
const coveredRecordResult = guard.evaluateChangeRecordCoverage({
  changedFiles: ['server/read-models/customer-lifecycle.js'],
  records: [{ file: 'docs/governance/change-records/2026-08-24-sample.md', content: validRecord }],
  config
});
assert.strictEqual(coveredRecordResult.ok, true, coveredRecordResult.errors.join('\n'));

const postReleaseResult = guard.evaluatePostReleaseCoverage({
  config,
  apiSmokeChecks: [
    '/api/diag',
    '/server/page-data/finance',
    '/server/page-data/workbench',
    '/server/page-data/courts',
    '/server/page-data/memberships',
    '/server/page-data/purchases',
    '/server/page-data/plans',
    '/server/page-data/coaches'
  ]
});
assert.strictEqual(postReleaseResult.ok, true, postReleaseResult.errors.join('\n'));

const generated = guard.generateChangeRecord({
  title: '测试变更',
  changedFiles: ['public/assets/scripts/app.js'],
  config
});
assert.match(generated, /## 影响页面/);
assert.match(generated, /## 测试映射/);
assert.match(generated, /## 发布后核验/);

console.log('governance automation guard tests passed');
