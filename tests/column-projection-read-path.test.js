const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const corePageDataSource = fs.readFileSync(path.join(__dirname, '../api/page-data/core-pages.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(__dirname, '../api/storage.js'), 'utf8');

assert.match(
  storageSource,
  /function normalizeProjectionColumns\(columns\)\{/,
  'column projection should normalize requested columns before storage reads'
);

assert.match(
  storageSource,
  /async function getCachedScan\(t,options=\{\}\)\{[\s\S]*const columns=normalizeProjectionColumns\(options\?\.columns\);[\s\S]*return scan\(t,\{columns\}\);[\s\S]*const cacheKey=hotScanCacheKey\(t,columns\);[\s\S]*const rows=await scan\(t,\{columns\}\);/s,
  'getCachedScan should pass projection columns to scan and isolate hot cache entries by projection'
);

assert.match(
  storageSource,
  /function scan\(t,options=\{\}\)\{[\s\S]*const columns=normalizeProjectionColumns\(options\?\.columns\);[\s\S]*const columnsToGet=columns\.length\?columns:undefined;[\s\S]*if\(columnsToGet\)request\.columnsToGet=columnsToGet;[\s\S]*gc\(\)\.getRange\(request,/s,
  'scan should forward projected columns to the TableStore getRange request'
);

assert.match(
  corePageDataSource,
  /if\(path==='\/page-data\/courts'&&method==='GET'\)\{[\s\S]*getFastStudentsRead\(\{columns:COURTS_PAGE_STUDENT_PROJECTION_FIELDS\}\)[\s\S]*getCachedScan\(T_COURTS,\{columns:COURTS_PAGE_COURT_PROJECTION_FIELDS\}\)\.catch\(\(\)=>\[\]\)/s,
  'courts page data should request projected student and court columns on the server side'
);

console.log('column projection read path tests passed');
