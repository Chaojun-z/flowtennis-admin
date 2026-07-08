const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.join(__dirname, '..');
const constantsPath = path.join(repoRoot, 'public/assets/scripts/core/constants.js');
const leadsPath = path.join(repoRoot, 'public/assets/scripts/pages/leads.js');

const constantsSource = fs.readFileSync(constantsPath, 'utf8');
const leadsSource = fs.readFileSync(leadsPath, 'utf8');

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
vm.runInContext(`${constantsSource}\nthis.__campusDisplayName=campusDisplayName;this.__cn=cn;`, context);

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

assert.doesNotMatch(
  leadsSource,
  /function leadCampusText\(lead\)\{\s*return campusDisplayName\(lead\?\.campus\|\|''\)\|\|'-';\s*\}/,
  'lead drawer must not display the raw lead.campus value through the narrow campusDisplayName fallback'
);

console.log('campus display hard guard tests passed');
