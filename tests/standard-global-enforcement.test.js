const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const scriptsRoot = path.join(root, 'public/assets/scripts');
const pagesRoot = path.join(scriptsRoot, 'pages');
const coreRoot = path.join(scriptsRoot, 'core');
const docsPath = path.join(root, 'docs', '全局前端组件标准.md');

function walk(dir){
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if(entry.isDirectory())return walk(full);
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });
}

function read(file){
  return fs.readFileSync(file, 'utf8');
}

const bannedOutsideCourts = [
  'setCourtModalFrame',
  'openDetailSideDrawer',
  'renderCourtTopDropdown',
  'courtTopLocationIcon',
  'courtTopTimeIcon',
  'courtTopCoachIcon',
  'closeCourtTopDropdowns',
  'toggleCourtTopDropdown'
];

walk(pagesRoot).forEach(file => {
  if(file.endsWith(path.join('pages', 'courts.js')))return;
  const rel = path.relative(root, file);
  const source = read(file);
  bannedOutsideCourts.forEach(name => {
    assert.doesNotMatch(source, new RegExp(`\\b${name}\\b`), `${rel} must use standard global components instead of ${name}`);
  });
});

walk(coreRoot).forEach(file => {
  const rel = path.relative(root, file);
  const source = read(file);
  [
    'renderCourtTopDropdown',
    'courtTopLocationIcon',
    'courtTopTimeIcon',
    'courtTopCoachIcon',
    'closeCourtTopDropdowns',
    'toggleCourtTopDropdown'
  ].forEach(name => {
    assert.doesNotMatch(source, new RegExp(`\\b${name}\\b`), `${rel} must not depend on court-named global UI helpers`);
  });
});

const standardSource = read(path.join(scriptsRoot, 'standard', 'components.js'));
[
  'renderStandardTopDropdown',
  'standardTopLocationIcon',
  'standardTopTimeIcon',
  'standardTopCoachIcon',
  'closeStandardTopDropdowns',
  'toggleStandardTopDropdown'
].forEach(name => {
  assert.match(standardSource, new RegExp(`function ${name}\\(`), `${name} should live in standard/components.js`);
});

assert.ok(fs.existsSync(docsPath), 'global component standard doc should exist');
const docs = read(docsPath);
assert.match(docs, /新增页面必须使用 standard\//, 'doc should state new pages must use standard/');
assert.match(docs, /禁止.*setCourtModalFrame|setCourtModalFrame.*禁止/, 'doc should forbid legacy modal entry outside court business');
assert.match(docs, /禁止.*openDetailSideDrawer|openDetailSideDrawer.*禁止/, 'doc should forbid legacy drawer entry outside court business');

console.log('standard global enforcement tests passed');
