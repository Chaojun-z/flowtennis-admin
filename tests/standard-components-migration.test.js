const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const scriptsRoot = path.join(root, 'public/assets/scripts');
const scanDirs = ['core', 'pages'].map(dir => path.join(scriptsRoot, dir));
const bannedGenericUiEntries = [
  'renderCourtDropdownHtml',
  'renderCourtCellText',
  'renderCourtEmptyText',
  'setCourtDropdownValue',
  'toggleCourtDropdown',
  'selectCourtDropdownItem',
  'closeCourtDropdowns'
];
const bannedPageLevelCalls = [
  'renderPagerChevron'
];

function walk(dir){
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if(entry.isDirectory())return walk(full);
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });
}

function stripAllowedCourtCompatibility(source, file){
  if(!file.endsWith(path.join('pages', 'courts.js')))return source;
  let next = source;
  bannedGenericUiEntries.forEach(name => {
    next = next.replace(new RegExp(`function ${name}\\([^)]*\\)\\{\\s*return [^}]+;\\s*\\}`, 'g'), '');
  });
  return next;
}

walk(path.join(scriptsRoot, 'standard')).forEach(file => {
  const source = fs.readFileSync(file, 'utf8');
  ['renderStandardDropdownHtml','renderStandardCellText','renderStandardEmptyText','setStandardDropdownValue'].forEach(name => {
    assert.match(source, new RegExp(`function ${name}\\(`), `${name} should live in standard components`);
  });
});

scanDirs.flatMap(walk).forEach(file => {
  const rel = path.relative(root, file);
  let source = stripAllowedCourtCompatibility(fs.readFileSync(file, 'utf8'), file);
  if(file.endsWith(path.join('core', 'components.js'))){
    source = source.replace(/function renderPagerChevron\([^)]*\)\{[\s\S]*?\n\}/, '');
  }
  bannedGenericUiEntries.forEach(name => {
    assert.doesNotMatch(source, new RegExp(`\\b${name}\\b`), `${rel} should use standard components instead of ${name}`);
  });
  bannedPageLevelCalls.forEach(name => {
    assert.doesNotMatch(source, new RegExp(`\\b${name}\\(`), `${rel} should render pagination through standard components instead of ${name}`);
  });
});

console.log('standard components migration tests passed');
