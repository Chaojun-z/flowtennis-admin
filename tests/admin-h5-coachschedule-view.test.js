const assert = require('assert');
const fs = require('fs');
const path = require('path');

const coachOpsSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'coachops.js'), 'utf8');
const pagesCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');

assert.match(
  coachOpsSource,
  /function isCoachOpsMobileSchedule\(\)[\s\S]*currentPage==='coachschedule'[\s\S]*classList\.contains\('admin-mobile'\)/,
  'coach schedule should detect the admin H5 shell before changing the desktop grid'
);
assert.match(
  coachOpsSource,
  /function renderCoachOpsMobileTimeline\([\s\S]*coach-ops-mobile-card[\s\S]*openScheduleDetail/,
  'coach schedule H5 should render schedules as tappable course cards'
);
assert.match(
  coachOpsSource,
  /else if\(isCoachOpsMobileSchedule\(\)\)\{\s*host\.innerHTML=renderCoachOpsMobileTimeline\(renderRows,mode,range\);/,
  'coach schedule H5 should use the mobile card timeline branch'
);
assert.match(
  pagesCss,
  /body\.admin-mobile #page-coachschedule \.coach-ops-grid-hint,body\.admin-mobile #page-coachschedule \.coach-ops-grid-clock,body\.admin-mobile #page-coachschedule \.coach-ops-head\{display:none\}/,
  'coach schedule H5 should hide desktop grid chrome'
);
assert.match(
  pagesCss,
  /body\.admin-mobile #page-coachschedule \.coach-ops-mobile-row\{[^}]*display:grid[^}]*grid-template-columns:1fr[^}]*min-width:0/,
  'coach schedule H5 rows should be single-column mobile groups'
);
assert.match(
  pagesCss,
  /body\.admin-mobile #page-coachschedule \.coach-ops-mobile-card,body\.admin-mobile #page-coachschedule \.coach-ops-mobile-empty-card\{[^}]*width:100%[^}]*border-left:4px solid/,
  'coach schedule H5 course cards should fill the viewport width'
);

console.log('admin h5 coach schedule view tests passed');
