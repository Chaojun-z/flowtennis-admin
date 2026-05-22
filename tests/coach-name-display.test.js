const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { appSource } = require('./helpers/read-index-bundle');

const constantsSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'core', 'constants.js'), 'utf8');
const context = { Date };
vm.createContext(context);
vm.runInContext(constantsSource, context, { filename: 'constants.js' });

assert.strictEqual(context.coachName('沙琪儿'), 'Siren');
assert.strictEqual(context.coachName('siren'), 'Siren');
assert.strictEqual(context.coachName('甄朝珺'), '朝珺');
assert.strictEqual(context.coachName('chaojun'), '朝珺');
assert.strictEqual(context.coachName('天昊'), 'Rive 天昊');
assert.strictEqual(context.coachName('rive'), 'Rive 天昊');
assert.strictEqual(context.coachName('晓哲教练'), '晓哲');

assert.match(appSource, /function canonicalCoachName\(/, 'frontend should expose one coach display normalizer');
assert.match(appSource, /function studentPrimaryCoachText\([\s\S]*coachName\(stu\?\.primaryCoach\)/, 'student primary coach display should normalize legacy names');
assert.match(appSource, /function studentCoachSummary\([\s\S]*coachName\(stu\?\.primaryCoach\)[\s\S]*coachName\(c\.coach\)/, 'student detail coach summary should normalize profile and class coach names');
assert.match(appSource, /renderCourtCellText\(coachName\(s\.coach\),false\)/, 'schedule list should normalize legacy coach names');
assert.match(appSource, /renderCourtCellText\(coachName\(p\.ownerCoach\)\)/, 'purchase list should normalize owner coach names');
assert.match(appSource, /function packageCoachSummary\([\s\S]*coachName\(p\.ownerCoach\)/, 'package coach summary should normalize owner coach names');
assert.match(appSource, /function myStudentOwnerCoachText\([\s\S]*coachName\(e\.ownerCoach\)/, 'coach portal owner coach display should normalize entitlement owner names');

console.log('coach name display tests passed');
