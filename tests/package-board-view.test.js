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
assert.match(cssRule('#page-packages.active'), /height:100%/, 'package page should keep the top title area fixed outside package scrolling');
assert.match(cssRule('#page-packages.active'), /overflow:hidden/, 'package page itself should not scroll the top title away');
assert.match(cssRule('body.is-packages-page .content'), /overflow:hidden/, 'package page should stop the outer content scroller');
assert.match(fnBody('goPage'), /document\.body\.classList\.toggle\('is-packages-page',pg==='packages'\)/, 'package page should toggle the package-only scroll state');
assert.match(cssRule('#page-packages .course-package-showcase'), /height:100%/, 'package board shell should fill the fixed content area');
assert.match(cssRule('.course-package-showcase-toolbar'), /flex:0 0 56px/, 'package filters and actions should keep a fixed reserved height');
assert.match(fnBody('renderPackages'), /package-board-column[\s\S]*draggable="true"[\s\S]*package-board-header[\s\S]*package-board-stack/, 'package board should keep header and cards inside one draggable column');
assert.doesNotMatch(fnBody('renderPackages'), /package-board-header-row|package-board-body-row/, 'package board should not split headers away from draggable columns');
assert.match(cssRule('#page-packages .course-package-showcase-grid'), /overflow-x:auto/, 'package board should be the horizontal drag container');
assert.match(cssRule('#page-packages .course-package-showcase-grid'), /overflow-y:hidden/, 'the whole package board should not scroll vertically');
assert.match(cssRule('.package-board-column'), /height:100%/, 'package columns should stay fixed while their cards scroll');
assert.match(cssRule('.package-board-stack'), /flex:1 1 auto/, 'red-line-below content should take the remaining column height');
assert.match(cssRule('.package-board-stack'), /overflow-y:auto/, 'only package cards below each column title should scroll vertically');
assert.match(cssRule('.package-board-stack'), /padding-bottom:24px/, 'each column should leave room below the last package card');
assert.match(cssRule('#page-packages .course-package-showcase-grid'), /cursor:grab/, 'package board should invite page-level horizontal drag');
assert.match(source, /function initPackageBoardHorizontalDrag\(/, 'package board should support page-level horizontal drag');
assert.match(fnBody('renderPackages'), /initPackageBoardHorizontalDrag\(\)/, 'package board horizontal drag should be wired after render');
assert.doesNotMatch(fnBody('initPackageBoardHorizontalDrag'), /\[draggable="true"\]/, 'package board horizontal drag should work when started on package cards');
assert.match(cssRule('.package-board-header'), /flex:0 0 28px/, 'package column header should stay outside the scrolling card area');
assert.match(cssRule('.package-board-header'), /height:28px/, 'package column header should keep a fixed reserved height');
assert.match(cssRule('.package-board-header'), /flex:0 0 28px/, 'package column header height should not collapse while cards scroll');
assert.match(styles, /\.package-sales-title\{[^}]*white-space:nowrap/, 'package title should stay on one line');
assert.match(styles, /\.package-sales-title\{[^}]*text-overflow:ellipsis/, 'package title should avoid wrapping into the price area');
assert.match(cssRule('.package-status-badge'), /height:17px/, 'sale status badge should be 17px tall');
assert.match(cssRule('.package-status-badge'), /width:56px/, 'sale status badge should be 56px wide');
assert.match(cssRule('.package-status-badge'), /font-size:10px/, 'sale status text should be 10px');
assert.doesNotMatch(styles, /package-audience-badge/, 'package card should not keep an adult/youth badge style');
assert.doesNotMatch(packageBoardCardHtml, /packageAudienceBadgeHtml\(p\)/, 'package card should not render adult/youth in the title row');
assert.doesNotMatch(packageBoardCardHtml, /packageTimeBandBadgeHtml\(p\)/, 'package card should not render gold/off-peak as a separate badge');
assert.doesNotMatch(packageBoardCardHtml, /package-sales-subtitle/, 'package card should remove the second subtitle line');
assert.match(cssRule('.package-sales-core'), /margin-top:18px/, 'package card should keep a smaller title-to-price gap after removing the second line');
assert.match(cssRule('.package-rule-line'), /font-size:11px/, 'course and campus text should be 11px');
assert.match(cssRule('.package-rule-icon'), /width:12px[\s\S]*height:12px/, 'course and campus icons should be 12px square');
assert.match(cssRule('.package-sales-title-row'), /align-items:center/, 'title and sale status row should be vertically centered');
assert.match(cssRule('.package-sales-header'), /align-items:center/, 'card header should vertically center title and sale status');
assert.match(cssRule('.package-board-column'), /flex:0 0 282px/, 'package card column should be 10px wider');
assert.doesNotMatch(styles, /#page-packages \.course-package-showcase \.tms-btn\{/, 'package page should not override global button sizing');
assert.doesNotMatch(styles, /#page-packages \.course-package-showcase \.tms-btn-ghost\{/, 'package page should not override global ghost button style');
assert.match(packageBoardCardHtml, /packageCourseTypeTitle\(p\)[\s\S]*packageRuleIcon\('course'\)[\s\S]*packageCampusSummaryText\(p\.campusIds\)[\s\S]*packageRuleIcon\('campus'\)/, 'package card right side should show course type above campus');
assert.match(fnBody('packageCourseTypeTitle'), /split\('\/'\)[\s\S]*pop\(\)/, 'package card course type should show the second level when available');
assert.doesNotMatch(packageBoardCardHtml, /packageCoachSummary\(p\)|packageCoachDetail\(p\)/, 'package card should not show available coach in the right-side rules');
assert.match(cssRule('.package-card-meta'), /font-size:10px/, 'package created date should use 10px text');
assert.match(cssRule('.package-card-meta button'), /font-size:10px/, 'package order count should use 10px text');
assert.match(packageBoardCardHtml, /packageAvailableDate\(p\)/, 'package card footer should show available date instead of created date');
assert.match(fnBody('packageAvailableDate'), /packageSingleDateText\(p\.usageStartDate,p\.usageEndDate\)/, 'package card footer should show one available date instead of a range');
assert.doesNotMatch(packageBoardCardHtml, /packageCreatedDate\(p\)/, 'package card footer should not show created date');
assert.match(cssRule('.package-meta-token'), /overflow:hidden/, 'package available date should not overlap the order count');
assert.match(cssRule('.package-sales-footer .showcase-action-btn'), /padding:4px 10px/, 'package view button padding should shrink by 2px horizontally');

console.log('package board view tests passed');
