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
assert.match(tableCss, /\.tms-table-skeleton-state\{[^}]*position:relative[^}]*width:100%/, 'table skeleton state should live inside the scrolling table width instead of being absolutely pinned to the viewport');
assert.match(tableCss, /\.tms-table-skeleton-head\{[^}]*grid-template-columns:repeat\(var\(--tms-table-skeleton-columns\),minmax\(72px,1fr\)\)/, 'table skeleton header should generate all columns across the full scroll width');
assert.match(tableCss, /\.tms-table-skeleton-row\{[^}]*grid-template-columns:repeat\(var\(--tms-table-skeleton-columns\),minmax\(72px,1fr\)\)/, 'table skeleton rows should generate all columns across the full scroll width');

const kpiSkeletonBody = fnBody(standardComponentsSource, 'renderStandardSkeletonKpiCard');
const chartSkeletonBody = fnBody(standardComponentsSource, 'renderStandardSkeletonChartPanel');
assert.doesNotMatch(kpiSkeletonBody, /tms-skeleton-spark/, 'KPI skeletons should not draw fake trend charts when the real card structure is not yet loaded');
assert.match(kpiSkeletonBody, /is-label[\s\S]*is-value[\s\S]*is-meta/, 'KPI skeletons should keep the real metric card hierarchy: title, number, support line');
assert.doesNotMatch(chartSkeletonBody, /<i><\/i><i><\/i><i><\/i><i><\/i><i><\/i>/, 'chart-card skeletons should not draw fake bar charts');
assert.match(chartSkeletonBody, /tms-skeleton-chart-surface[\s\S]*tms-skeleton-chart-line/, 'chart-card skeletons should render a restrained chart surface with light structure lines');
assert.match(pagesCss, /\.tms-skeleton-card,.tms-skeleton-panel\{[^}]*background:#FFFDFC[^}]*border:1px solid rgba\(91,63,42,\.12\)/, 'non-table skeleton cards should use the same quiet surface as real dashboard cards');
assert.doesNotMatch(pagesCss, /\.tms-skeleton-chart-body i\{/, 'non-table chart skeleton CSS should not style fake chart bars');
assert.match(pagesCss, /\.tms-skeleton-chart-surface\{[^}]*background:linear-gradient\(180deg,rgba\(160,143,128,\.08\) 1px,transparent 1px\)/, 'chart skeleton surfaces should be light, structural placeholders instead of heavy fake charts');
