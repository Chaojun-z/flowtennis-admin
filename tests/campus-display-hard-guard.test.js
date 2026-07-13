const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.join(__dirname, '..');
const constantsPath = path.join(repoRoot, 'public/assets/scripts/core/constants.js');
const leadsPath = path.join(repoRoot, 'public/assets/scripts/pages/leads.js');
const packagesPath = path.join(repoRoot, 'public/assets/scripts/pages/packages.js');
const pricesPath = path.join(repoRoot, 'public/assets/scripts/pages/prices.js');
const coachPortalPath = path.join(repoRoot, 'public/assets/scripts/pages/coach-portal.js');
const utilsPath = path.join(repoRoot, 'public/assets/scripts/core/utils.js');
const serverSchedulePath = path.join(repoRoot, 'server/schedule.js');

const constantsSource = fs.readFileSync(constantsPath, 'utf8');
const leadsSource = fs.readFileSync(leadsPath, 'utf8');
const packagesSource = fs.readFileSync(packagesPath, 'utf8');
const pricesSource = fs.readFileSync(pricesPath, 'utf8');
const coachPortalSource = fs.readFileSync(coachPortalPath, 'utf8');
const utilsSource = fs.readFileSync(utilsPath, 'utf8');
const serverScheduleSource = fs.readFileSync(serverSchedulePath, 'utf8');

const context = {
  campuses: [
    { id: 'shunyi_mapo', code: 'shunyi_mapo', name: '顺义马坡' },
    { id: 'shilipu', code: 'shilipu', name: '朝阳十里堡' },
    { id: 'guowang', code: 'guowang', name: '国家网球中心' },
    { id: 'langang', code: 'langang', name: '蓝色港湾' },
    { id: 'chaojun', code: 'chaojun', name: '朝珺私教' }
  ],
  console
};
vm.createContext(context);
vm.runInContext(`${constantsSource}\nthis.__campusDisplayName=campusDisplayName;this.__campusKey=campusKey;this.__cn=cn;`, context);

assert.deepStrictEqual(
  ['shunyi_mapo', 'shilipu', 'guowang', 'langang', 'chaojun'].map(value => context.__campusDisplayName(value)),
  ['顺义马坡', '朝阳十里堡', '国家网球中心', '蓝色港湾', '朝珺私教'],
  'all stored campus codes must resolve to front-end Chinese display names'
);

assert.deepStrictEqual(
  ['shunyi_mapo', 'shilipu', 'guowang', 'langang', 'chaojun'].map(value => context.__cn(value)),
  ['顺义马坡', '朝阳十里堡', '国家网球中心', '蓝色港湾', '朝珺私教'],
  'the shared campus display accessor must not leak stored campus codes'
);

assert.deepStrictEqual(
  ['mabao', '马宝'].map(value => context.__campusDisplayName(value)),
  ['顺义马坡', '顺义马坡'],
  'legacy mabao campus aliases must resolve to the front-end Chinese display name'
);

assert.deepStrictEqual(
  ['mabao', '马宝'].map(value => context.__cn(value)),
  ['顺义马坡', '顺义马坡'],
  'legacy mabao campus values from historical/active student read models must resolve to the front-end Chinese display name'
);

assert.deepStrictEqual(
  ['mabao', '马宝'].map(value => context.__campusKey(value)),
  ['shunyi_mapo', 'shunyi_mapo'],
  'legacy mabao campus aliases must normalize to the canonical shunyi_mapo campus key'
);

assert.doesNotMatch(
  leadsSource,
  /function leadCampusText\(lead\)\{\s*return campusDisplayName\(lead\?\.campus\|\|''\)\|\|'-';\s*\}/,
  'lead drawer must not display the raw lead.campus value through the narrow campusDisplayName fallback'
);

assert.doesNotMatch(packagesSource, /campusIds\.includes\(campus\)/, 'package filters must not compare raw campus ids');
assert.doesNotMatch(pricesSource, /p\.campus===row\.campus/, 'price duplicate checks must not compare raw campus ids');
assert.doesNotMatch(coachPortalSource, /prev\.campus===current\.campus/, 'coach portal travel checks must not compare raw campus ids');
assert.doesNotMatch(utilsSource, /prev\.campus===cur\.campus/, 'coach risk counts must not compare raw campus ids');
assert.doesNotMatch(serverScheduleSource, /rec\.campus===candidate\.campus|booking\.campus!==candidate\.campus|\(candidate\.campus\|\|''\)===\(rec\.campus\|\|''\)/, 'server schedule rules must not compare raw campus ids');

console.log('campus display hard guard tests passed');
