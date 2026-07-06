const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pagesCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');

assert.match(
  pagesCss,
  /body\.admin-mobile #page-operations\{[^}]*margin:0[^}]*padding:0[^}]*background:#F5F2F0/,
  'operations H5 page should use the standard mobile content surface'
);
assert.match(
  pagesCss,
  /body\.admin-mobile #page-operations \.operations-overview-grid,body\.admin-mobile #page-operations \.operations-overview-visual-grid[\s\S]*display:flex!important[\s\S]*flex-direction:column/,
  'operations H5 chart grids should become a one-column information flow'
);
assert.match(
  pagesCss,
  /body\.admin-mobile #page-operations \.operations-section,body\.admin-mobile #page-operations \.operations-chart-card[\s\S]*min-height:0[\s\S]*padding:14px/,
  'operations H5 sections should use compact mobile cards instead of desktop chart panels'
);
assert.match(
  pagesCss,
  /body\.admin-mobile #page-operations \.operations-chart-host,body\.admin-mobile #page-operations \.operations-overview-chart[\s\S]*height:180px!important[\s\S]*min-height:180px!important/,
  'operations H5 standard charts should use a mobile-height viewport'
);
assert.match(
  pagesCss,
  /body\.admin-mobile #page-operations \.operations-overview-matrix-chart,body\.admin-mobile #page-operations \.operations-coach-matrix-chart\{[^}]*height:220px!important/,
  'operations H5 matrix charts should be shorter than desktop panels'
);
assert.match(
  pagesCss,
  /body\.admin-mobile #page-operations \.operations-filter-row,body\.admin-mobile #page-operations \.operations-funnel-filter-row\{[^}]*overflow-x:auto[^}]*flex-wrap:nowrap/,
  'operations H5 filters should scroll horizontally instead of wrapping into a desktop toolbar'
);
assert.match(
  pagesCss,
  /body\.admin-mobile #page-operations \.operations-court-heat-grid\{[^}]*min-width:720px/,
  'operations H5 heatmap should use a smaller mobile scroll width'
);

console.log('admin h5 operations view tests passed');
