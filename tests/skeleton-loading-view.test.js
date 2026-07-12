const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const stateSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/core/state.js'), 'utf8');
const standardComponentsSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/standard/components.js'), 'utf8');
const tableCss = fs.readFileSync(path.join(repoRoot, 'public/assets/styles/components/tables.css'), 'utf8');
const pagesCss = fs.readFileSync(path.join(repoRoot, 'public/assets/styles/pages.css'), 'utf8');

function fnBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

const tableSkeletonBody = fnBody(stateSource, 'renderTableSkeletonLoading');
assert.match(tableSkeletonBody, /const cellCount=Math\.max\(4,Number\(colspan\)\|\|6\)/, 'table skeleton should render the full column count instead of clamping wide tables to the visible columns');
assert.doesNotMatch(tableSkeletonBody, /Math\.min\(8,Number\(colspan\)\|\|6\)/, 'wide table skeletons must not stop at eight columns');
assert.match(tableSkeletonBody, /--tms-table-skeleton-columns:\$\{cellCount\}/, 'table skeleton should expose its full column count to CSS');
assert.doesNotMatch(tableSkeletonBody, /tms-table-skeleton-head/, 'table skeleton should not render a fake header when the real table header is visible');
assert.match(tableCss, /\.tms-table-skeleton-state\{[^}]*position:relative[^}]*width:100%/, 'table skeleton state should live inside the scrolling table width instead of being absolutely pinned to the viewport');
assert.doesNotMatch(tableCss, /\.tms-table-skeleton-head\{/, 'table skeleton CSS should not keep a second header layer');
assert.match(tableCss, /\.tms-table-skeleton-row\{[^}]*grid-template-columns:repeat\(var\(--tms-table-skeleton-columns\),minmax\(72px,1fr\)\)/, 'table skeleton rows should generate all columns across the full scroll width');
assert.match(standardComponentsSource, /function renderStandardSkeletonKpiCards\(/, 'standard components should expose one shared KPI skeleton card helper for all data-card loading states');
assert.match(stateSource, /function renderCourtStatsLoading\([\s\S]*renderStandardSkeletonKpiCards\(5\)/, 'court loading should render top stats through the shared KPI skeleton helper');
assert.match(stateSource, /function renderCourtPageLoading\([\s\S]*renderCourtStatsLoading\(\)[\s\S]*renderCourtTableLoading\(\)/, 'court loading should cover both stats cards and the table in one page-level loading entry');
assert.match(stateSource, /if\(pg==='courts'\)renderCourtPageLoading\(\);/, 'court page loading should not only skeletonize the table body');
assert.match(fnBody(stateSource, 'renderCourtTableLoading'), /renderTableSkeletonLoading\('courtTbody',16,'订场用户加载中\.\.\.'\)/, 'court table loading should keep using the shared table row skeleton');

const kpiSkeletonBody = fnBody(standardComponentsSource, 'renderStandardSkeletonKpiCard');
const chartSkeletonBody = fnBody(standardComponentsSource, 'renderStandardSkeletonChartPanel');
assert.doesNotMatch(kpiSkeletonBody, /tms-skeleton-spark/, 'KPI skeletons should not draw fake trend charts when the real card structure is not yet loaded');
assert.match(kpiSkeletonBody, /is-label[\s\S]*is-value[\s\S]*is-meta/, 'KPI skeletons should keep the real metric card hierarchy: title, number, support line');
assert.doesNotMatch(chartSkeletonBody, /<i><\/i><i><\/i><i><\/i><i><\/i><i><\/i>/, 'chart-card skeletons should not draw fake bar charts');
assert.match(chartSkeletonBody, /tms-skeleton-chart-surface[\s\S]*tms-skeleton-chart-line/, 'chart-card skeletons should render a restrained chart surface with light structure lines');
assert.match(pagesCss, /\.tms-skeleton-card,.tms-skeleton-panel\{[^}]*background:#FFFDFC[^}]*border:1px solid rgba\(91,63,42,\.12\)/, 'non-table skeleton cards should use the same quiet surface as real dashboard cards');
assert.doesNotMatch(pagesCss, /\.tms-skeleton-chart-body i\{/, 'non-table chart skeleton CSS should not style fake chart bars');
assert.match(pagesCss, /\.tms-skeleton-chart-surface\{[^}]*background:linear-gradient\(180deg,rgba\(160,143,128,\.08\) 1px,transparent 1px\)/, 'chart skeleton surfaces should be light, structural placeholders instead of heavy fake charts');

const packageBoardSkeletonBody = fnBody(standardComponentsSource, 'renderStandardSkeletonPackageBoard');
const packageCardSkeletonBody = fnBody(standardComponentsSource, 'renderStandardSkeletonPackageCard');
assert.match(standardComponentsSource, /function renderStandardSkeletonPackageBoard\(/, 'standard components should expose one shared package board skeleton helper');
assert.match(standardComponentsSource, /if\(type==='package-board'\)return renderStandardSkeletonPackageBoard\(section\);/, 'page skeleton sections should route package-board through the shared helper');
assert.match(standardComponentsSource, /page:'packages'[\s\S]*type:'package-board'[\s\S]*columns:5[\s\S]*cardsPerColumn:4/, 'package loading should use a dedicated package-board skeleton with the real board column count');
assert.doesNotMatch(standardComponentsSource, /page:'packages'[\s\S]*tms-skeleton-board-grid[\s\S]*variant:'table'/, 'package loading should not reuse the fake table-board skeleton');
assert.match(packageBoardSkeletonBody, /package-board-column[\s\S]*package-board-header[\s\S]*tms-skeleton-package-count[\s\S]*package-board-stack/, 'package board skeleton should mirror real board columns');
assert.match(standardComponentsSource, /package-card-shell tms-skeleton-package-card/, 'package board skeleton should render package-card-shell based card placeholders');
assert.match(packageCardSkeletonBody, /tms-skeleton-package-price[\s\S]*tms-skeleton-package-rules[\s\S]*tms-skeleton-package-actions/, 'package card skeleton should mirror price, rule lines and footer actions');
assert.match(pagesCss, /\.course-package-showcase-grid\.tms-skeleton-package-board\{[^}]*display:flex[^}]*overflow-x:auto[^}]*cursor:default/, 'package board skeleton should keep the real horizontal board container');
assert.match(pagesCss, /\.tms-skeleton-package-card\{[^}]*background:#FFFFFF[^}]*border-radius:12px[^}]*padding:12px/, 'package board skeleton cards should use the real package card shell structure');
assert.match(pagesCss, /\.tms-skeleton-package-line,.tms-skeleton-package-count\{[^}]*animation:operationsSkeleton 1\.2s ease-in-out infinite/, 'package board skeleton should use the existing skeleton shimmer');
