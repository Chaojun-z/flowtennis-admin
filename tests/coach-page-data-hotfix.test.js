const assert = require('assert');
const fs = require('fs');
const path = require('path');

const corePageDataSource = fs.readFileSync(path.join(__dirname, '../api/page-data/core-pages.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/state.js'), 'utf8');

assert.match(
  stateSource,
  /if\(pg==='coaches'\)renderTableBodyLoading\('coachTbody',7,'教练数据加载中\.\.\.'\);/,
  'coach page should show an inline loading row instead of an empty table while coaches are loading'
);

assert.match(
  stateSource,
  /coaches:\(\)=>apiCall\('GET','\/coaches'\)\.catch\(\(\)=>apiCall\('GET','\/page-data\/coaches'\)\.then\(data=>data\.coaches\|\|\[\]\)\)/,
  'coach dataset loader should fall back to the dedicated page-data endpoint'
);

assert.match(
  corePageDataSource,
  /if\(path==='\/page-data\/coaches'&&method==='GET'\)\{[\s\S]*if\(user\.role!=='admin'\)return sendJson\(res,\{error:'无权限'\},403\);[\s\S]*const coaches=await cappedScan\(T_COACHES\);[\s\S]*return sendJson\(res,\{coaches:filterLoadAllForUser\(\{coaches\},user\)\.coaches\}\);[\s\S]*\}/,
  'api should expose a dedicated coach page-data endpoint backed by cappedScan'
);

console.log('coach page data hotfix tests passed');
