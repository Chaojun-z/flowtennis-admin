const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appSource: html } = require('./helpers/read-index-bundle');
const corePageDataSource = fs.readFileSync(path.join(__dirname, '../server/page-data/core-pages.js'), 'utf8');
const residualPageDataSource = fs.readFileSync(path.join(__dirname, '../server/page-data/residual-pages.js'), 'utf8');
const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');

function fnBody(name){
  const start = html.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const next = html.indexOf('\nfunction ', start + 1);
  return html.slice(start, next === -1 ? html.length : next);
}

assert.match(html, /const PAGE_DATA_REQUIREMENTS=\{/, 'state should define per-page data requirements');
assert.match(html, /function loadPageDataAndRender\(/, 'state should expose a page-scoped loading entry');
assert.doesNotMatch(fnBody('showApp'), /loadAll\(\)/, 'showApp should no longer trigger full load-all on first paint');
assert.match(fnBody('showApp'), /hydrateDatasetsFromCache\(\)/, 'showApp should restore last successful data before network refresh');
assert.match(fnBody('showApp'), /buildCampusTabs\(\);[\s\S]*renderAll\(\);/, 'showApp should render cached data immediately before waiting on network');
assert.match(fnBody('showApp'), /deferPageDataLoad\(currentPage,\{quiet:true\}\)/, 'showApp should boot the current page on the next frame without blocking first paint');
assert.doesNotMatch(fnBody('goPage'), /if\(!skipRender\)renderPageData\(pg\)/, 'goPage should not render immediately before page data is ready');
assert.match(fnBody('goPage'), /if\(!skipRender\)\{[\s\S]*renderPageLoading\(pg\);[\s\S]*deferPageDataLoad\(pg,\{quiet:true\}\);[\s\S]*\}/, 'goPage should show inline loading immediately and defer page data loading out of the click task');
assert.doesNotMatch(fnBody('goPage'), /if\(!skipRender\)loadPageDataAndRender\(pg,\{quiet:true\}\)/, 'goPage should not call page data loading synchronously in the click task');
assert.match(html, /function deferPageDataLoad\(/, 'state should expose a next-frame page data loader');
assert.match(fnBody('deferPageDataLoad'), /requestAnimationFrame|setTimeout/, 'deferred page data loading should yield to paint before loading');
assert.doesNotMatch(fnBody('loadPageDataAndRender'), /if\(quiet&&loadedDatasets\.size\)\{[\s\S]*renderAll\(\);[\s\S]*\}[\s\S]*await ensurePageDatasets/, 'loadPageDataAndRender should not synchronously renderAll before awaiting page data');
assert.doesNotMatch(fnBody('loadPageBackgroundDatasets'), /for\(const name of immediateNames\)/, 'background page datasets should not load one by one');
assert.match(fnBody('loadPageBackgroundDatasets'), /Promise\.allSettled\(immediateNames\.map/, 'background page datasets should load the current batch in parallel');
assert.match(fnBody('loadPageBackgroundDatasets'), /if\(isStudentListPage\(pg\)&&STUDENT_PAGE_DEFERRED_REQUIREMENTS\.length\)/, 'student list pages should allow a second deferred background batch');
assert.doesNotMatch(corePageDataSource, /\/page-data\/plans/, 'api should not expose deprecated plans page endpoint');
assert.match(corePageDataSource, /if\(path==='\/page-data\/package-center-list'&&method==='GET'\)/, 'api should expose a lightweight package center list endpoint');
assert.match(corePageDataSource, /if\(path==='\/page-data\/customer-center-list'&&method==='GET'\)/, 'api should expose a lightweight customer center list endpoint');
assert.match(corePageDataSource, /if\(path==='\/page-data\/purchases'&&method==='GET'\)/, 'api should expose an aggregated purchases page endpoint');
assert.match(html, /schedule-list-view\?all=1/, 'schedule page should load the lightweight schedule list read model instead of the full schedule table');
assert.match(html, /function ensureScheduleDetailData\(scheduleId/, 'schedule detail should have a per-schedule detail loader');
assert.match(corePageDataSource, /if\(path==='\/page-data\/lifecycle-metrics'&&method==='GET'\)/, 'api should expose a lightweight lifecycle metrics endpoint');
assert.match(corePageDataSource, /\/page-data\/lifecycle-metrics[\s\S]*customerLifecycleRows[\s\S]*teachingStudentViews[\s\S]*standardLifecycleMetrics/, 'lifecycle metrics endpoint should return lifecycle rows, teaching views, and standard metrics');
assert.match(residualPageDataSource, /if\(path==='\/page-data\/finance'&&method==='GET'\)/, 'api should expose an aggregated finance page endpoint');
assert.match(corePageDataSource, /if\(path==='\/page-data\/courts'&&method==='GET'\)/, 'api should expose an aggregated courts page endpoint');
assert.match(corePageDataSource, /if\(path==='\/page-data\/memberships'&&method==='GET'\)/, 'api should expose an aggregated memberships page endpoint');
assert.match(corePageDataSource, /if\(path==='\/page-data\/workbench'&&method==='GET'\)/, 'api should expose an aggregated workbench page endpoint');
assert.match(corePageDataSource, /if\(path==='\/page-data\/coach-schedule'&&method==='GET'\)/, 'api should expose a lightweight coach schedule page endpoint');

console.log('page load strategy tests passed');
