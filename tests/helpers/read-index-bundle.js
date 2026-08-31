const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', '..', 'public');
const apiSource = fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'index.js'), 'utf8');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const coreScriptDir = path.join(publicDir, 'assets', 'scripts', 'core');
const standardScriptDir = path.join(publicDir, 'assets', 'scripts', 'standard');
const pageScriptDir = path.join(publicDir, 'assets', 'scripts', 'pages');
const coreScriptFiles = ['business-taxonomy.js', 'platform-data-standards.js', 'campus.js', 'constants.js', 'utils.js', 'date-controls.js', 'permissions.js', 'api.js', 'shell.js', 'components.js', 'state.js', 'bootstrap.js'];
const standardScriptFiles = ['components.js'];
const pageScriptFiles = [
  'admin-users.js',
  'coaches.js',
  'campusmgr.js',
  'leads.js',
  'students.js',
  'schedule-helpers.js',
  'schedule-settlement.js',
  'schedule.js',
  'products.js',
  'packages.js',
  'purchases.js',
  'entitlements.js',
  'coachops.js',
  'operations.js',
  'prices.js',
  'courts-helpers.js',
  'courts.js',
  'matches.js',
  'third-party-sync-center.js',
  'coach-portal.js'
];
const appSource = [
  html,
  apiSource,
  ...coreScriptFiles.map(file => fs.readFileSync(path.join(coreScriptDir, file), 'utf8')),
  ...standardScriptFiles.map(file => fs.readFileSync(path.join(standardScriptDir, file), 'utf8')),
  ...pageScriptFiles.map(file => fs.readFileSync(path.join(pageScriptDir, file), 'utf8'))
].join('\n');

module.exports = { html, appSource, apiSource };
