const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const residualSource = fs.readFileSync(path.join(repoRoot, 'server/page-data/residual-pages.js'), 'utf8');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/core/state.js'), 'utf8');
const scheduleSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/pages/schedule.js'), 'utf8');
const scheduleRoutesSource = fs.readFileSync(path.join(repoRoot, 'server/schedule-routes.js'), 'utf8');

function routeBlock(source, route) {
  const marker = `if(path==='${route}'&&method==='GET')`;
  const start = source.indexOf(marker);
  assert.notStrictEqual(start, -1, `${route} 路由必须存在`);
  const next = source.indexOf("\n    if(path===", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function fnBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} 必须存在`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter((item) => item !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

const scheduleListRoute = routeBlock(residualSource, '/page-data/schedule-list-view');

assert.match(scheduleListRoute, /loadScheduleListSnapshot/, '排课首屏路由只能调用 ScheduleListSnapshot 读取器');
assert.doesNotMatch(scheduleListRoute, /loadScheduleListView\(/, '排课首屏路由不能兜底回旧慢读模型');
assert.doesNotMatch(scheduleListRoute, /getScheduleListRows\(/, '排课首屏路由不能直接读取排课事实表');
assert.doesNotMatch(scheduleListRoute, /getCachedScan\(/, '排课首屏路由不能扫描学员、教练、反馈等表');
assert.doesNotMatch(scheduleListRoute, /scanCoachProposals\(/, '排课首屏路由不能扫描课前教案表');
assert.doesNotMatch(scheduleListRoute, /T_SCHEDULE|T_STUDENTS|T_COACHES|T_FEEDBACKS|T_ENTITLEMENT_LEDGER|T_PURCHASES/, '排课首屏路由不能持有慢表依赖');
assert.match(scheduleListRoute, /SCHEDULE_LIST_SNAPSHOT_NOT_READY_CODE[\s\S]*bootstrapScheduleListSnapshot[\s\S]*pageData\.scheduleListView\.bootstrapRetry/, '快照未发布时必须后端首轮发布并重试快照，不能把初始化错误丢给页面');

assert.match(residualSource, /createScheduleListSnapshotLoader/, '残余 page-data 模块必须注入排课快照读取器');
assert.match(apiSource, /T_SCHEDULE_LIST_SNAPSHOT='ft_schedule_list_snapshot'/, 'API 必须声明排课快照表');
assert.match(apiSource, /scheduleListSnapshotSync=createScheduleListSnapshotSync/, 'API 必须创建排课快照同步器');
assert.match(apiSource, /async function bootstrapScheduleListSnapshot\(\)[\s\S]*rebuildFromSourceData\(await loadScheduleListSnapshotSourceData\(\),\{dryRun:false/, 'API 必须提供排课快照首轮自动发布函数');
assert.match(apiSource, /async function loadScheduleListSnapshotSourceData\(\)\{[\s\S]*scan\(T_SCHEDULE,\{columns:SCHEDULE_LIST_PROJECTION_FIELDS\}\)[\s\S]*getCachedScan\(T_STUDENTS\)\.catch\(\(\)=>\[\]\)/, '排课快照源数据读取必须直接扫排课事实表，不能吞错返回空数组');
assert.match(apiSource, /path==='\/admin\/schedule-list-snapshot\/rebuild'&&method==='POST'[\s\S]*const dryRun=body\?\.dryRun!==false/, '排课快照重建入口默认必须 dry-run');
assert.match(apiSource, /path==='\/admin\/schedule-list-snapshot\/status'&&method==='GET'/, 'API 必须提供排课快照健康状态接口');

const scheduleReqBlock = stateSource.match(/schedule:\[[^\]]+\]/)?.[0] || '';
assert.ok(scheduleReqBlock, '前端必须声明排课页首屏依赖');
assert.doesNotMatch(scheduleReqBlock, /students|courts|coaches|coachProposals|feedbacks|entitlements|entitlementLedger/, '排课页首屏依赖不能阻塞加载慢表');
assert.match(stateSource, /schedule:\(\{fresh=false\}=\{\}\)=>apiCall\('GET',scheduleListPageDataUrl\(\{fresh\}\)\)/, '排课页必须加载服务端分页快照接口');

assert.doesNotMatch(scheduleSource, /loadPageDataAndRender\('schedule',\{force:true\}\)/, '排课变更后禁止整页强制重拉');
assert.doesNotMatch(scheduleSource, /ensureDatasetsByName\(\['schedule'\],\{force:true\}\)/, '排课翻页/筛选禁止强制整包刷新');
assert.match(fnBody(scheduleSource, 'reloadSchedulesForCurrentPage'), /ensureDatasetsByName\(\['schedule'\],\{force:false\}\)/, '排课翻页/筛选只允许按当前请求轻量刷新');

assert.match(scheduleRoutesSource, /scheduleListSnapshotSync=null/, '排课保存路由必须接收快照同步器');
assert.match(scheduleRoutesSource, /syncScheduleListSnapshotDelta\(r,\{reason:'schedule-create'\}\)/, '新建排课后必须同步快照 delta');
assert.match(scheduleRoutesSource, /syncScheduleListSnapshotDelta\(r,\{reason:'schedule-update'\}\)/, '编辑排课后必须同步快照 delta');
assert.match(scheduleRoutesSource, /syncScheduleListSnapshotDelta\(r,\{reason:'schedule-cancel'\}\)/, '取消排课后必须同步快照 delta');
assert.match(scheduleRoutesSource, /syncScheduleListSnapshotDelta\(null,\{scheduleId:id,deleted:true,reason:'schedule-delete'\}\)/, '删除排课后必须同步快照 delta');

console.log('schedule list performance lock tests passed');
