const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const agentsPath = path.join(repoRoot, 'AGENTS.md');
const prTemplatePath = path.join(repoRoot, '.github/PULL_REQUEST_TEMPLATE.md');
const checklistPath = path.join(repoRoot, 'docs/数据口径变更检查清单.md');
const metricDocPath = path.join(repoRoot, 'docs/FlowTennis全平台数据口径总表.md');
const packagePath = path.join(repoRoot, 'package.json');

const agentsSource = fs.readFileSync(agentsPath, 'utf8');
const metricDocSource = fs.readFileSync(metricDocPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

assert.ok(fs.existsSync(prTemplatePath), 'PR template should force contributors to confirm data-standard alignment');
assert.ok(fs.existsSync(checklistPath), 'data-standard checklist should exist for new requirements and bug fixes');

const prTemplate = fs.readFileSync(prTemplatePath, 'utf8');
const checklist = fs.readFileSync(checklistPath, 'utf8');

assert.match(agentsSource, /口径变更开发流程硬规则/, 'AGENTS should expose a mandatory data-standard development workflow');
assert.match(agentsSource, /docs\/FlowTennis全平台数据口径总表\.md/, 'AGENTS should point every data-related change to the single metric standard');
assert.match(agentsSource, /docs\/数据口径变更检查清单\.md/, 'AGENTS should require the new requirement checklist before implementation');
assert.match(agentsSource, /tests\/cross-page-metric-consistency\.test\.js/, 'AGENTS should require cross-page consistency tests for shared metrics');
assert.match(packageJson.scripts.test, /node tests\/cross-page-metric-consistency\.test\.js/, 'npm test should run cross-page metric consistency guard');
assert.match(packageJson.scripts.test, /node tests\/data-standards-governance\.test\.js/, 'npm test should run data-standard governance guard');

[
  '数据口径总表已更新或确认无需更新',
  '统一读模型已更新或确认无需更新',
  '页面没有新增临时计算口径',
  '跨页面一致性测试已补充或确认不涉及'
].forEach(item => {
  assert.match(prTemplate, new RegExp(item), `PR template should include: ${item}`);
  assert.match(checklist, new RegExp(item), `checklist should include: ${item}`);
});

[
  '财务金额口径',
  '课包核销与权益口径',
  '数据质量与异常排除口径',
  'FIN_TOTAL_INCOME = FIN_COURSE_INCOME \\+ FIN_COURT_INCOME \\+ FIN_COURT_MEMBER_RECHARGE',
  'PACKAGE_REMAINING_LESSONS',
  '展示别名，直接复用 `PACKAGE_ACTIVE_ENTITLEMENT`',
  'DATA_DUPLICATE_CUSTOMER',
  'DATA_ORPHAN_RECORD'
].forEach(pattern => {
  assert.match(metricDocSource, new RegExp(pattern), `metric standard should keep required section or rule: ${pattern}`);
});

console.log('data standards governance tests passed');
