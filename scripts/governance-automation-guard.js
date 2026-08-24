#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_ROOT = path.join(__dirname, '..');
const DEFAULT_CONFIG = path.join(DEFAULT_ROOT, 'config', 'governance-automation.json');
const LEVEL_ORDER = ['L1', 'L2', 'L3', 'L4', 'L5'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeFile(file = '') {
  return String(file || '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function runGit(root, args) {
  const result = spawnSync('git', ['-c', 'core.quotePath=false', ...args], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).map(normalizeFile).filter(Boolean);
}

function globToRegExp(glob) {
  const escaped = String(glob)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}

function matchesAny(file, patterns = []) {
  return patterns.some((pattern) => new RegExp(pattern).test(file));
}

function parseDocMetadata(content = '') {
  const metadata = {};
  for (const line of String(content || '').split(/\r?\n/)) {
    const match = line.match(/^>\s*([^：:]+)[：:]\s*(.*)$/);
    if (!match) continue;
    metadata[match[1].trim()] = match[2].trim();
  }
  return metadata;
}

function evaluateDocumentGovernance({ docs = [], config = {} } = {}) {
  const errors = [];
  const required = config.requiredDocMetadata || [];
  const governedGlobs = (config.governedDocGlobs || []).map(globToRegExp);
  const stalePhrases = config.stalePhrases || [];

  for (const doc of docs) {
    const file = normalizeFile(doc.file);
    const isGoverned = governedGlobs.length === 0 || governedGlobs.some((regex) => regex.test(file));
    if (!isGoverned) continue;

    const metadata = parseDocMetadata(doc.content || '');
    const missing = required.filter((key) => !metadata[key]);
    if (missing.length) {
      errors.push(`${file} 缺少文档状态头字段：${missing.join(', ')}`);
    }

    for (const phrase of stalePhrases) {
      if (String(doc.content || '').includes(phrase)) {
        errors.push(`${file} 含过期口径：${phrase}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function levelRank(level) {
  return Math.max(0, LEVEL_ORDER.indexOf(level));
}

function classifyChangedFiles({ changedFiles = [], config = {} } = {}) {
  const levels = config.riskLevels || {};
  const orderedLevels = LEVEL_ORDER.filter((level) => levels[level]);
  let maxLevel = orderedLevels[0] || 'L1';
  const matched = [];
  const requiredChecks = new Set();

  for (const check of levels.L1?.requiredChecks || []) requiredChecks.add(check);

  for (const rawFile of changedFiles) {
    const file = normalizeFile(rawFile);
    for (const level of orderedLevels) {
      const rule = levels[level] || {};
      if (matchesAny(file, rule.patterns || [])) {
        matched.push({ file, level });
        if (levelRank(level) > levelRank(maxLevel)) maxLevel = level;
      }
    }
  }

  for (const level of orderedLevels) {
    if (levelRank(level) <= levelRank(maxLevel)) {
      for (const check of levels[level]?.requiredChecks || []) requiredChecks.add(check);
    }
  }

  return { maxLevel, matched, requiredChecks: [...requiredChecks] };
}

function hasSection(content, title) {
  return new RegExp(`^##\\s+${title}\\s*$`, 'm').test(String(content || ''));
}

function recordMentionsFile(content, file) {
  return String(content || '').includes(normalizeFile(file));
}

function isIgnoredChangedFile(file, config = {}) {
  return matchesAny(normalizeFile(file), config.ignoredChangedFilePatterns || []);
}

function evaluateChangeRecordCoverage({ changedFiles = [], records = [], config = {} } = {}) {
  const files = changedFiles.map(normalizeFile).filter((file) => file && !isIgnoredChangedFile(file, config));
  const risk = classifyChangedFiles({ changedFiles: files, config });
  const errors = [];
  const requiredFrom = config.changeRecordRequiredFromLevel || 'L2';
  const needsRecord = files.length > 0 && levelRank(risk.maxLevel) >= levelRank(requiredFrom);

  if (!needsRecord) return { ok: true, errors, risk };

  if (!records.length) {
    return { ok: false, errors: [`本次 ${risk.maxLevel} 改动缺少需求变更记录：docs/governance/change-records/*.md`], risk };
  }

  const validRecords = [];
  for (const record of records) {
    const content = String(record.content || '');
    const metadata = parseDocMetadata(content);
    const missingMeta = (config.requiredDocMetadata || []).filter((key) => !metadata[key]);
    const missingSections = (config.requiredChangeRecordSections || []).filter((section) => !hasSection(content, section));
    const mentionedFiles = files.filter((file) => recordMentionsFile(content, file));
    const riskMatch = content.match(/##\s+风险等级\s+([\s\S]*?)(?:\n##\s+|$)/);
    const recordLevel = riskMatch?.[1]?.match(/L[1-5]/)?.[0] || '';

    if (!missingMeta.length && !missingSections.length && mentionedFiles.length === files.length && levelRank(recordLevel) >= levelRank(risk.maxLevel)) {
      validRecords.push(record);
    }

    if (missingMeta.length) errors.push(`${record.file} 缺少文档状态头字段：${missingMeta.join(', ')}`);
    if (missingSections.length) errors.push(`${record.file} 缺少变更记录章节：${missingSections.join(', ')}`);
    if (mentionedFiles.length !== files.length) errors.push(`${record.file} 未覆盖全部变更文件：${files.filter((file) => !mentionedFiles.includes(file)).join(', ')}`);
    if (!recordLevel || levelRank(recordLevel) < levelRank(risk.maxLevel)) errors.push(`${record.file} 风险等级低于自动判定：record=${recordLevel || '未写'}, auto=${risk.maxLevel}`);

    if (risk.maxLevel === 'L5') {
      const missingProduction = (config.requiredProductionSections || []).filter((section) => !hasSection(content, section) && !content.includes(section));
      if (missingProduction.length) errors.push(`${record.file} 缺少生产数据变更字段：${missingProduction.join(', ')}`);
    }
  }

  if (!validRecords.length && !errors.length) errors.push(`本次 ${risk.maxLevel} 改动没有合格的需求变更记录`);
  return { ok: validRecords.length > 0 && errors.length === 0, errors, risk };
}

function evaluatePostReleaseCoverage({ config = {}, apiSmokeChecks = [] } = {}) {
  const required = config.postReleaseRequiredChecks || [];
  const missing = required.filter((pathname) => !apiSmokeChecks.includes(pathname));
  const errors = missing.map((pathname) => `发布后核验缺少接口：${pathname}`);
  return { ok: errors.length === 0, errors };
}

function inferChangedFiles(root = DEFAULT_ROOT, argv = [], env = process.env) {
  const explicit = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--changed-file') explicit.push(argv[i + 1]);
  }
  if (explicit.length) return explicit.map(normalizeFile);

  if (env.GITHUB_ACTIONS) {
    const diffTree = runGit(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']);
    if (diffTree.length) return diffTree;
  }

  const staged = runGit(root, ['diff', '--cached', '--name-only']);
  if (staged.length) return staged;

  const previous = spawnSync('git', ['rev-parse', '--verify', 'HEAD~1'], { cwd: root, encoding: 'utf8' });
  if (previous.status === 0) {
    return runGit(root, ['diff', '--name-only', 'HEAD~1', 'HEAD']);
  }

  return [];
}

function listGovernedDocs(root, config) {
  const files = runGit(root, ['ls-files', 'docs/README.md', 'docs/governance/*.md', 'docs/governance/change-records/*.md']);
  const regexes = (config.governedDocGlobs || []).map(globToRegExp);
  return files
    .filter((file) => regexes.some((regex) => regex.test(file)))
    .map((file) => ({ file, content: fs.readFileSync(path.join(root, file), 'utf8') }));
}

function listChangeRecords(root) {
  return runGit(root, ['ls-files', 'docs/governance/change-records/*.md'])
    .map((file) => ({ file, content: fs.readFileSync(path.join(root, file), 'utf8') }));
}

function slugifyTitle(title = '') {
  return String(title || 'governance-change')
    .trim()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'governance-change';
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function generateChangeRecord({ title = '未命名变更', changedFiles = [], config = {}, date = todayIso() } = {}) {
  const risk = classifyChangedFiles({ changedFiles, config });
  const files = changedFiles.map(normalizeFile).filter(Boolean);
  return `# ${date} ${title}

> 文档类型：需求变更记录
> 状态：生效
> 版本：${date}
> 生效日期：${date}
> 最后审查日期：${date}
> 维护人：FlowTennis 项目负责人
> 唯一依据：记录本次变更影响面，不替代 PRD 和口径正本。
> 替代文档：无

## 风险等级

${risk.maxLevel}

## 变更文件

${files.map((file) => `- ${file}`).join('\n') || '- 待补'}

## 影响页面

- 待补：说明影响哪些页面；不影响则写“无”

## 影响接口

- 待补：说明影响哪些接口；不影响则写“无”

## 影响表

- 待补：说明影响哪些表；不影响则写“无”

## 影响指标

- 待补：说明影响哪些指标；不影响则写“无”

## 测试映射

${risk.requiredChecks.map((check) => `- ${check}`).join('\n') || '- 待补'}

## 异常豁免

- 无

## 事故反馈闭环

- 本次非线上事故修复

## 发布后核验

- ${risk.requiredChecks.includes('npm run guard:post-release') ? 'npm run guard:post-release' : '不涉及真实发布后核验'}
`;
}

function parseArgs(argv = []) {
  const args = { root: DEFAULT_ROOT, config: DEFAULT_CONFIG, createRecord: false, title: '未命名变更' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') args.root = path.resolve(argv[i + 1]);
    if (argv[i] === '--config') args.config = path.resolve(argv[i + 1]);
    if (argv[i] === '--create-record') args.createRecord = true;
    if (argv[i] === '--title') args.title = argv[i + 1];
  }
  return args;
}

function runGuard({ root = DEFAULT_ROOT, configPath = DEFAULT_CONFIG, argv = process.argv.slice(2), env = process.env } = {}) {
  const config = readJson(configPath);
  const packageJson = readJson(path.join(root, 'package.json'));
  const changedFiles = inferChangedFiles(root, argv, env);
  const docs = listGovernedDocs(root, config);
  const records = listChangeRecords(root);
  const smoke = require(path.join(root, 'scripts', 'release-api-smoke.js'));

  const errors = [];
  const docResult = evaluateDocumentGovernance({ docs, config });
  const recordResult = evaluateChangeRecordCoverage({ changedFiles, records, config });
  const postReleaseResult = evaluatePostReleaseCoverage({ config, apiSmokeChecks: smoke.buildProtectedChecks ? ['/api/diag', ...smoke.buildProtectedChecks()] : [] });

  if (!packageJson.scripts?.['guard:governance-automation']) errors.push('package.json 缺少 guard:governance-automation');
  if (!packageJson.scripts?.['guard:release']?.includes('npm run guard:governance-automation')) errors.push('guard:release 未接入 guard:governance-automation');
  if (!packageJson.scripts?.['governance:record']) errors.push('package.json 缺少 governance:record');
  if (!packageJson.scripts?.['guard:post-release']) errors.push('package.json 缺少 guard:post-release');

  errors.push(...docResult.errors, ...recordResult.errors, ...postReleaseResult.errors);

  return {
    ok: errors.length === 0,
    errors,
    changedFiles,
    risk: recordResult.risk || classifyChangedFiles({ changedFiles, config }),
    documentGovernance: docResult,
    changeRecordCoverage: recordResult,
    postReleaseCoverage: postReleaseResult
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = readJson(args.config);
  const changedFiles = inferChangedFiles(args.root, process.argv.slice(2), process.env);

  if (args.createRecord) {
    const date = todayIso();
    const dir = path.join(args.root, 'docs', 'governance', 'change-records');
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${date}-${slugifyTitle(args.title)}.md`;
    const target = path.join(dir, filename);
    fs.writeFileSync(target, generateChangeRecord({ title: args.title, changedFiles, config, date }));
    console.log(`created ${path.relative(args.root, target)}`);
    return;
  }

  const result = runGuard({ root: args.root, configPath: args.config, argv: process.argv.slice(2), env: process.env });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    console.error(result.errors.join('\n'));
    process.exit(1);
  }
  console.log('governance automation guard passed');
}

if (require.main === module) main();

module.exports = {
  parseDocMetadata,
  evaluateDocumentGovernance,
  classifyChangedFiles,
  evaluateChangeRecordCoverage,
  evaluatePostReleaseCoverage,
  generateChangeRecord,
  inferChangedFiles,
  runGuard
};
