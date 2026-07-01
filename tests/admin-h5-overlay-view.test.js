const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pagesCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');

assert.match(
  pagesCss,
  /body\.admin-mobile \.overlay\{[^}]*align-items:stretch[^}]*justify-content:center[^}]*padding:0/,
  'admin H5 overlays should use one full-screen mobile surface rule'
);
assert.match(
  pagesCss,
  /body\.admin-mobile \.overlay\.open \.modal\.modal-court\{[^}]*width:100% !important[^}]*max-width:100% !important[^}]*height:100dvh[^}]*max-height:100dvh[^}]*border-radius:0 !important/,
  'admin H5 modals and drawers should become full-screen surfaces'
);
assert.match(
  pagesCss,
  /body\.admin-mobile \.modal\.modal-court \.mhead\{[^}]*position:sticky[^}]*top:0[^}]*z-index:6/,
  'admin H5 modal header should stay visible at the top'
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
  /body\.admin-mobile \.modal\.modal-court \.tms-form-row\{[^}]*display:grid[^}]*grid-template-columns:1fr/,
  'admin H5 modal form rows should collapse to one column'
);
assert.match(
  pagesCss,
  /body\.admin-mobile \.modal\.modal-court \.tms-detail-grid\{[^}]*grid-template-columns:1fr/,
  'admin H5 readonly detail grids should collapse to one column'
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
