const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const agentsPath = path.join(repoRoot, 'AGENTS.md');
const prTemplatePath = path.join(repoRoot, '.github/PULL_REQUEST_TEMPLATE.md');
const checklistPath = path.join(repoRoot, 'docs/governance/数据口径变更检查清单.md');
const metricDocPath = path.join(repoRoot, 'docs/business-rules/FlowTennis全平台数据口径总表.md');
const packagePath = path.join(repoRoot, 'package.json');
const dictionaryPath = path.join(repoRoot, 'docs/business-rules/平台核心数据字典.md');

const agentsSource = fs.readFileSync(agentsPath, 'utf8');
const metricDocSource = fs.readFileSync(metricDocPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

assert.ok(fs.existsSync(prTemplatePath), 'PR template should force contributors to confirm data-standard alignment');
assert.ok(fs.existsSync(checklistPath), 'data-standard checklist should exist for new requirements and bug fixes');

const prTemplate = fs.readFileSync(prTemplatePath, 'utf8');
const checklist = fs.readFileSync(checklistPath, 'utf8');
const dictionary = fs.readFileSync(dictionaryPath, 'utf8');
const standardComponentsSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/standard/components.js'), 'utf8');
const legacyCustomerLabelPattern = new RegExp([
  ['微信', '名'],
  ['学', '员'],
  ['会员', '姓名'],
  ['客户', '姓名']
].map(parts => `label:'${parts.join('')}'`).join('|'));

assert.match(agentsSource, /口径变更开发流程硬规则/, 'AGENTS should expose a mandatory data-standard development workflow');
assert.match(agentsSource, /docs\/business-rules\/FlowTennis全平台数据口径总表\.md/, 'AGENTS should point every data-related change to the single metric standard');
assert.match(agentsSource, /docs\/governance\/数据口径变更检查清单\.md/, 'AGENTS should require the new requirement checklist before implementation');
assert.match(agentsSource, /tests\/cross-page-metric-consistency\.test\.js/, 'AGENTS should require cross-page consistency tests for shared metrics');
assert.match(agentsSource, /读模型缓存与部署生效硬规则/, 'AGENTS should include cache and deployment effectiveness rules');
assert.match(agentsSource, /不得只靠版本号判断缓存可信/, 'AGENTS should forbid trusting read-model cache by version only');
assert.match(agentsSource, /git push[\s\S]*不代表线上已生效/, 'AGENTS should warn that git push is not production effectiveness');
assert.match(packageJson.scripts.test, /node tests\/cross-page-metric-consistency\.test\.js/, 'npm test should run cross-page metric consistency guard');
assert.match(packageJson.scripts.test, /node tests\/data-standards-governance\.test\.js/, 'npm test should run data-standard governance guard');
assert.match(packageJson.scripts.test, /node tests\/data-standard-source-guard\.test\.js/, 'npm test should run source-level data-standard guard');
assert.match(packageJson.scripts.test, /node tests\/unified-page-source-hard-guard\.test\.js/, 'npm test should run unified page source hard guard');
assert.match(
  metricDocSource,
  /线索池顶部转化 \| 线索数、历史学员、在期学员、上过体验课、体验后买正式课/,
  'metric standard should match the current lead-pool top card requirement'
);
assert.match(
  metricDocSource,
  /\| 体验后买正式课 \| TRIAL_ATTENDED_TO_FORMAL_PURCHASE \| 体验后买正式课 \/ 上过体验课 \|/,
  'lead-pool top metric table should document trial-attended formal purchase instead of the retired trial-path card'
);
assert.match(metricDocSource, /读模型缓存与线上生效硬规则/, 'metric standard should document read-model cache and deployment effectiveness rules');
assert.match(metricDocSource, /缓存读取前必须做内容自检/, 'metric standard should require cache contradiction checks');
assert.match(metricDocSource, /有最近上课日期或累计上课大于 0，但活跃状态仍为 `从未正式上课`/, 'metric standard should cover the student lesson contradiction that caused the production bug');
assert.match(metricDocSource, /线上静态脚本或线上接口已经包含本次提交新增的代码标记/, 'metric standard should require production asset or API marker verification');
assert.match(dictionary, /teachingStudentViews/, 'core dictionary should name the unified teaching student read model output');
assert.match(dictionary, /摘要表只能作为轻量缓存/, 'core dictionary should document that teaching summaries are cache only');
assert.match(dictionary, /不得出现最近上课或累计上课有值但活跃状态仍为 `从未正式上课`/, 'core dictionary should forbid contradictory student lesson labels');

[
  { key: 'leads', label: '姓名' },
  { key: 'students', label: '姓名' },
  { key: 'purchases', label: '姓名' },
  { key: 'entitlements', label: '姓名' },
  { key: 'mystudents', label: '姓名' },
  { key: 'memberships', label: '姓名' },
  { key: 'courts', label: '姓名' }
].forEach(({ key, label }) => {
  const marker = `key:'${key}'`;
  const start = standardComponentsSource.indexOf(marker);
  assert.notStrictEqual(start, -1, `${key} standard list shell should exist`);
  const block = standardComponentsSource.slice(start, standardComponentsSource.indexOf('\n    {key:', start + 1) === -1 ? standardComponentsSource.length : standardComponentsSource.indexOf('\n    {key:', start + 1));
  assert.match(block, new RegExp(`label:'${label}'|>${label}<|<span>${label}</span>`), `${key} first customer identity column should use 姓名`);
  assert.doesNotMatch(block, legacyCustomerLabelPattern, `${key} should not create another customer-name label`);
});

[
  '数据口径总表已更新或确认无需更新',
  '统一读模型已更新或确认无需更新',
  '页面没有新增临时计算口径',
  '跨页面一致性测试已补充或确认不涉及',
  '如使用摘要缓存，已加入内容矛盾自检',
  '已补充线上出过问题的反例测试',
  '已验证线上静态脚本或接口包含本次提交的新代码标记'
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
