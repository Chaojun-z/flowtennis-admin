const assert = require('assert');
const { appSource: html } = require('./helpers/read-index-bundle');

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
assert.match(fnBody('showApp'), /loadPageDataAndRender\(currentPage,\{quiet:true\}\)/, 'showApp should boot the current page without a blocking full-screen loader');
assert.match(fnBody('doLogin'), /showApp\(\);\s*bindWechatAfterLogin\(\)\.catch/, 'web login should show the app first and bind WeChat in the background');
assert.doesNotMatch(fnBody('doLogin'), /await bindWechatAfterLogin\(\);\s*showApp\(\);/, 'web login should not block first paint on WeChat bind');
assert.doesNotMatch(fnBody('goPage'), /if\(!skipRender\)renderPageData\(pg\)/, 'goPage should not render immediately before page data is ready');
assert.match(fnBody('goPage'), /if\(!skipRender\)loadPageDataAndRender\(pg,\{quiet:true\}\)/, 'goPage should reuse the page-scoped loading entry without blocking the whole screen');
assert.doesNotMatch(fnBody('loadPageBackgroundDatasets'), /for\(const name of names\)/, 'background page datasets should not load one by one');
assert.match(fnBody('loadPageBackgroundDatasets'), /Promise\.allSettled\(names\.map/, 'background page datasets should load in parallel');
assert.match(fnBody('loadPageDataAndRender'), /setTimeout\(\(\)=>\{loadPageBackgroundDatasets\(pg,requestVersion,\{force:true\}\);?\},\s*120\)/, 'background page data should yield one frame before the heavy follow-up fetches start');
assert.match(html, /if\(path==='\/page-data\/plans'&&method==='GET'\)/, 'api should expose an aggregated plans page endpoint');
assert.match(html, /if\(path==='\/page-data\/purchases'&&method==='GET'\)/, 'api should expose an aggregated purchases page endpoint');
assert.match(html, /if\(path==='\/page-data\/finance'&&method==='GET'\)/, 'api should expose an aggregated finance page endpoint');
assert.match(html, /if\(path==='\/page-data\/courts'&&method==='GET'\)/, 'api should expose an aggregated courts page endpoint');
assert.match(html, /if\(path==='\/page-data\/memberships'&&method==='GET'\)/, 'api should expose an aggregated memberships page endpoint');
assert.match(html, /if\(path==='\/page-data\/workbench'&&method==='GET'\)/, 'api should expose an aggregated workbench page endpoint');

console.log('page load strategy tests passed');
