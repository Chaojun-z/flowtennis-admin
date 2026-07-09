const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function walk(dir, matcher, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(repoRoot, full);
    if (
      rel.startsWith('_exports') ||
      rel.startsWith('.git') ||
      rel.startsWith('.npm-cache') ||
      rel.includes('node_modules')
    ) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, matcher, out);
    else if (matcher(rel)) out.push(rel);
  }
  return out;
}

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function assertNoMatch(rel, pattern, message) {
  assert.doesNotMatch(read(rel), pattern, `${rel}: ${message}`);
}

const pageFiles = [
  ...walk(path.join(repoRoot, 'public/assets/scripts/pages'), rel => rel.endsWith('.js')),
  ...walk(path.join(repoRoot, 'wechat-miniprogram/miniprogram/pages'), rel => /\.(js|wxml)$/.test(rel))
];

const legacyTerms = [
  ['意向', '类型'],
  ['咨询', '需求'],
  ['学员', '姓名'],
  ['会员', '姓名'],
  ['客户', '姓名'],
  ['用', '户名'],
  ['系统', '录入时间'],
  ['ma', 'bao'],
  ['Ma', 'bao'],
  ['membership', 'OrderId'],
  ['data', '-rate'],
  ['data', '-heat'],
  ['data', '-minutes']
].map(parts => parts.join(''));

const legacyTermContentAllowlist = new Map([
  [['ma', 'bao'].join(''), new Set([
    'public/assets/scripts/core/constants.js',
    'tests/campus-display-hard-guard.test.js'
  ])]
]);
const legacyRuntimeAllowlist = new Set([
  'public/assets/scripts/core/constants.js'
]);

const rawDateTimePattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const allTrackedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter(rel => !rel.startsWith('_exports/') && !rel.includes('node_modules'));

allTrackedFiles.forEach(rel => {
  legacyTerms.forEach(term => {
    assert.ok(!rel.includes(term), `${rel}: 文件路径不得残留 ${term}`);
    const allowedFiles = legacyTermContentAllowlist.get(term);
    assert.ok(allowedFiles?.has(rel) || !read(rel).includes(term), `${rel}: 文件内容不得残留 ${term}`);
  });
  assert.doesNotMatch(rel, rawDateTimePattern, `${rel}: 文件路径不得残留原始时间`);
  assertNoMatch(rel, rawDateTimePattern, '文件内容不得残留原始时间');
});

pageFiles.forEach(rel => {
  assert.ok(!legacyTerms.some(term => read(rel).includes(term)), `${rel}: 运行页面不得展示旧字段名或系统录入字段`);
  assertNoMatch(rel, /data-utilization|data-load|data-used-minutes/, '运行页面不得输出热力图内部属性');
  assertNoMatch(rel, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/, '运行页面不得硬编码或直接展示原始 ISO 时间样例');
  assertNoMatch(rel, /['"]shunyi_mapo['"]/, '运行页面不得硬编码单一校区代码');
});

const legacyRuntimeFiles = [
  ...walk(path.join(repoRoot, 'public/assets/scripts'), rel => rel.endsWith('.js')),
  'api/index.js',
  ...walk(path.join(repoRoot, 'server'), rel => rel.endsWith('.js'))
].filter(rel => !legacyRuntimeAllowlist.has(rel) && legacyTerms.some(term => read(rel).includes(term)));

assert.deepStrictEqual(
  legacyRuntimeFiles,
  [],
  '旧字段名只能出现在统一兼容别名表里'
);

const courtsSource = read('public/assets/scripts/pages/courts.js');
assert.doesNotMatch(
  courtsSource,
  /renderStandardCellText\(\s*(?:l|row)\.membershipOrderRef/,
  '会员权益页面不得直接展示原始 membershipOrderRef'
);
assert.doesNotMatch(
  courtsSource,
  /\$\{\s*(?:l|row|data)\.membershipOrderRef\s*\}/,
  '会员权益页面不得把原始 membershipOrderRef 拼进页面'
);

console.log('platform zero residual guard tests passed');
