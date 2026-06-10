const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appSource: source } = require('./helpers/read-index-bundle');

const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');

function fnBody(name){
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

function cssRule(selector){
  const start = styles.indexOf(selector);
  assert.notStrictEqual(start, -1, `${selector} should exist`);
  const end = styles.indexOf('}', start);
  assert.notStrictEqual(end, -1, `${selector} rule should close`);
  return styles.slice(start, end + 1);
}

const packageBoardCardHtml = fnBody('packageBoardCardHtml');

assert.match(fnBody('packageCampusSummaryText'), /names\.length===2\?names\.join\('、'\)/, 'two available campuses should show both names');
assert.match(fnBody('packageCampusSummaryText'), /`\$\{names\.length\} 个校区可用`/, 'more than two campuses should show count only');
assert.match(cssRule('#page-packages .course-package-showcase-grid'), /scrollbar-width:none/, 'package board horizontal scrollbar should be hidden');
assert.match(styles, /#page-packages \.course-package-showcase-grid::-webkit-scrollbar\{display:none\}/, 'package board webkit scrollbar should be hidden');
assert.match(cssRule('#page-packages.active'), /height:auto/, 'package page should grow with package columns instead of clipping to the current screen');
assert.match(cssRule('#page-packages.active'), /overflow:visible/, 'package page should not hide long package columns');
assert.match(cssRule('#page-packages .course-package-showcase'), /height:auto/, 'package board shell should not force a viewport-height scroll box');
assert.match(cssRule('.course-package-showcase-toolbar'), /flex:0 0 auto/, 'package filters and actions should stay outside the scrolling area');
assert.match(fnBody('renderPackages'), /package-board-column[\s\S]*draggable="true"[\s\S]*package-board-header[\s\S]*package-board-stack/, 'package board should keep header and cards inside one draggable column');
assert.doesNotMatch(fnBody('renderPackages'), /package-board-header-row|package-board-body-row/, 'package board should not split headers away from draggable columns');
assert.match(cssRule('#page-packages .course-package-showcase-grid'), /overflow-x:auto/, 'package board should be the horizontal drag container');
assert.match(cssRule('#page-packages .course-package-showcase-grid'), /overflow-y:visible/, 'package cards should extend downward instead of being clipped inside the current screen');
assert.match(cssRule('#page-packages .course-package-showcase-grid'), /cursor:grab/, 'package board should invite page-level horizontal drag');
assert.match(source, /function initPackageBoardHorizontalDrag\(/, 'package board should support page-level horizontal drag');
assert.match(fnBody('renderPackages'), /initPackageBoardHorizontalDrag\(\)/, 'package board horizontal drag should be wired after render');
assert.doesNotMatch(fnBody('initPackageBoardHorizontalDrag'), /\[draggable="true"\]/, 'package board horizontal drag should work when started on package cards');
assert.match(cssRule('.package-board-stack'), /flex:0 0 auto/, 'package columns should only be as tall as their cards');
assert.match(cssRule('.package-board-stack'), /overflow-y:visible/, 'package columns should not create idle internal scroll areas');
assert.match(cssRule('.package-board-header'), /position:sticky/, 'package column header should stay fixed while package cards scroll');
assert.match(cssRule('.package-board-header'), /height:28px/, 'package column header should keep a fixed reserved height');
assert.match(cssRule('.package-board-header'), /flex:0 0 28px/, 'package column header height should not collapse while cards scroll');
assert.match(cssRule('.package-board-column'), /height:max-content/, 'package columns should grow to show all cards instead of being height-limited');
assert.doesNotMatch(cssRule('.package-sales-title'), /text-overflow:ellipsis|white-space:nowrap|overflow:hidden/, 'package title should show full text');
assert.match(cssRule('.package-status-badge'), /height:17px/, 'sale status badge should be 17px tall');
assert.match(cssRule('.package-status-badge'), /width:56px/, 'sale status badge should be 56px wide');
assert.match(cssRule('.package-status-badge'), /font-size:10px/, 'sale status text should be 10px');
assert.match(cssRule('.package-time-band-badge.is-all'), /width:30px/, 'all-day badge should be 30px wide');
assert.match(cssRule('.package-time-band-badge.is-offpeak'), /width:40px/, 'off-peak badge should be 40px wide');
assert.match(cssRule('.package-time-band-badge.is-prime'), /width:42px/, 'prime badge should be 42px wide');
assert.match(cssRule('.package-time-band-badge'), /height:17px/, 'time band badges should be 17px tall');
assert.match(cssRule('.package-rule-line'), /font-size:11px/, 'campus and coach text should be 11px');
assert.match(cssRule('.package-rule-icon'), /width:12px[\s\S]*height:12px/, 'campus and coach icons should be 12px square');
assert.match(cssRule('.package-sales-title-row'), /align-items:center/, 'title, time badge and sale status row should be vertically centered');
assert.match(cssRule('.package-sales-header'), /align-items:center/, 'card header should vertically center title and sale status');
assert.match(cssRule('.package-board-column'), /flex:0 0 282px/, 'package card column should be 10px wider');
assert.doesNotMatch(styles, /#page-packages \.course-package-showcase \.tms-btn\{/, 'package page should not override global button sizing');
assert.doesNotMatch(styles, /#page-packages \.course-package-showcase \.tms-btn-ghost\{/, 'package page should not override global ghost button style');
assert.doesNotMatch(packageBoardCardHtml, /归属：\$\{ownerCoach\}|归属：\$\{esc\(packageCoachSummary/, 'package card should not show owner prefix in the visible coach line');
assert.match(cssRule('.package-card-meta'), /font-size:10px/, 'package created date should use 10px text');
assert.match(cssRule('.package-card-meta button'), /font-size:10px/, 'package order count should use 10px text');
assert.match(cssRule('.package-meta-token'), /overflow:visible/, 'package created date should show fully');
assert.match(cssRule('.package-sales-footer .showcase-action-btn'), /padding:4px 10px/, 'package view button padding should shrink by 2px horizontally');

console.log('package board view tests passed');
