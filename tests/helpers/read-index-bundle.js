const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', '..', 'public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const coreScriptDir = path.join(publicDir, 'assets', 'scripts', 'core');
const pageScriptDir = path.join(publicDir, 'assets', 'scripts', 'pages');
const coreScriptFiles = ['constants.js', 'utils.js', 'api.js', 'shell.js', 'state.js', 'bootstrap.js'];
const pageScriptFiles = [
  'admin-users.js',
  'coaches.js',
  'campusmgr.js',
  'students.js',
  'schedule.js',
  'classes.js',
  'plans.js',
  'products.js',
  'packages.js',
  'purchases.js',
  'entitlements.js',
  'coachops.js',
  'courts.js',
  'coach-portal.js'
];
const appSource = [
  html,
  ...coreScriptFiles.map(file => fs.readFileSync(path.join(coreScriptDir, file), 'utf8')),
  ...pageScriptFiles.map(file => fs.readFileSync(path.join(pageScriptDir, file), 'utf8'))
].join('\n');

module.exports = { html, appSource };
