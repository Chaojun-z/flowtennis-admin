const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pagesCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');

assert.match(
  pagesCss,
  /body\.admin-mobile \.overlay\{[^}]*align-items:flex-end[^}]*justify-content:center[^}]*padding:0/,
  'admin H5 overlays should leave top space and dock the surface to the bottom'
);
assert.match(
  pagesCss,
  /body\.admin-mobile \.overlay\.open \.modal\.modal-court\{[^}]*width:100% !important[^}]*max-width:100% !important[^}]*height:calc\(100dvh - 72px\)[^}]*max-height:calc\(100dvh - 72px\)[^}]*border-radius:18px 18px 0 0 !important/,
  'admin H5 modals and drawers should keep a visible top gap'
);
assert.match(
  pagesCss,
  /body\.admin-mobile \.overlay\.student-drawer-overlay\.open \.modal\.modal-court\.modal-student-drawer[\s\S]*transform:none/,
  'admin H5 detail drawers should not keep desktop side-slide transforms'
);
assert.match(
  pagesCss,
  /body\.admin-mobile \.modal\.modal-court \.mhead\{[^}]*position:sticky[^}]*top:0[^}]*z-index:6/,
  'admin H5 modal header should stay visible at the top'
);
assert.match(
  pagesCss,
  /body\.admin-mobile \.modal\.modal-court \.mbody\{[^}]*overflow:auto[^}]*overflow-x:hidden[^}]*scrollbar-width:none/,
  'admin H5 drawer bodies should scroll vertically without horizontal blank space or visible scrollbars'
);
assert.match(
  pagesCss,
  /body\.admin-mobile \.modal\.modal-court \.mactions\{[^}]*position:sticky[^}]*bottom:0[^}]*padding-bottom:calc\(14px \+ env\(safe-area-inset-bottom\)\)/,
  'admin H5 save and cancel actions should stay fixed at the bottom'
);
assert.match(
  pagesCss,
  /body\.admin-mobile \.modal\.modal-court \.mactions \.tms-btn[^}]*flex:1/,
  'admin H5 modal action buttons should fill the bottom action bar'
);
assert.match(
  pagesCss,
  /body\.admin-mobile \.modal\.modal-court \.mactions \.tms-btn,body\.admin-mobile \.modal\.modal-court \.mactions \.btn-save,body\.admin-mobile \.modal\.modal-court \.mactions \.btn-cancel[\s\S]*height:42px/,
  'admin H5 legacy save and cancel buttons should use the same bottom action sizing'
);
assert.match(
  pagesCss,
  /body\.admin-mobile \.modal\.modal-court \.tms-form-row\{[^}]*display:grid[^}]*grid-template-columns:1fr/,
  'admin H5 modal form rows should collapse to one column'
);
assert.match(
  pagesCss,
  /body\.admin-mobile \.modal\.modal-court \.court-date-row,body\.admin-mobile \.modal\.modal-court \.schedule-location-fields[\s\S]*display:grid!important[\s\S]*grid-template-columns:1fr!important/,
  'admin H5 modal date and location rows should not keep desktop flex rows'
);
assert.match(
  pagesCss,
  /body\.admin-mobile \.modal\.modal-court \.tms-form-item,body\.admin-mobile \.modal\.modal-court \.tms-form-item\.full-width,body\.admin-mobile \.modal\.modal-court \.tms-form-row>\*[\s\S]*width:100%!important[\s\S]*flex:1 1 auto!important/,
  'admin H5 modal form items should override old inline fixed widths'
);
assert.match(
  pagesCss,
  /body\.admin-mobile \.modal\.modal-court \.tms-detail-grid\{[^}]*grid-template-columns:1fr/,
  'admin H5 readonly detail grids should collapse to one column'
);
assert.match(
  pagesCss,
  /body\.admin-mobile \.modal\.modal-court \.tms-table-card,body\.admin-mobile \.modal\.modal-court \.detail-drawer-table-card\{[^}]*margin-left:0[^}]*margin-right:0/,
  'admin H5 modal tables should not inherit page-level negative table margins'
);
assert.match(
  pagesCss,
  /body\.admin-mobile \.modal\.modal-court \.choice-tag\{[^}]*width:100%!important[^}]*white-space:normal/,
  'admin H5 modal choice tags should not keep desktop max-content widths'
);
assert.match(
  pagesCss,
  /body\.admin-mobile \.conf-ov\{[^}]*align-items:flex-end/,
  'admin H5 confirmation dialogs should use a bottom sheet layout'
);
assert.match(
  pagesCss,
  /body\.admin-mobile \.conf-box\{[^}]*width:100%[^}]*border-radius:18px 18px 0 0/,
  'admin H5 confirmation box should dock to the bottom'
);

console.log('admin h5 overlay view tests passed');
