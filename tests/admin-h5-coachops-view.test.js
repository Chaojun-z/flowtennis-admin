const assert = require('assert');
const fs = require('fs');
const path = require('path');

const componentsSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'standard', 'components.js'), 'utf8');
const coachOpsSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'coachops.js'), 'utf8');
const pagesCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');

assert.match(
  componentsSource,
  /id="coachOpsMobileCards" class="coach-ops-mobile-cards"/,
  'coach workload page should mount a dedicated H5 card list container'
);
assert.match(
  coachOpsSource,
  /function renderCoachOpsWorkloadMobileCards\(rows\)[\s\S]*coach-ops-workload-card[\s\S]*课程类型[\s\S]*校区分布[\s\S]*时间段/,
  'coach workload H5 should render each coach as a metric card'
);
assert.match(
  coachOpsSource,
  /renderCoachOpsWorkloadMobileCards\(rows\);/,
  'coach workload render should update the H5 card list with the table'
);
assert.match(
  pagesCss,
  /\.coach-ops-mobile-cards\{display:none\}/,
  'coach workload H5 cards should stay hidden on desktop'
);
assert.match(
  pagesCss,
  /body\.admin-mobile #page-coachops \.tms-table-card\{display:none\}/,
  'coach workload H5 should hide the desktop table'
);
assert.match(
  pagesCss,
  /body\.admin-mobile #page-coachops \.coach-ops-mobile-cards\{[^}]*display:flex[^}]*flex-direction:column/,
  'coach workload H5 should show the card list as a vertical feed'
);

console.log('admin h5 coach workload view tests passed');
