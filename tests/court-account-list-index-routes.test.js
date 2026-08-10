const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const residualSource = fs.readFileSync(path.join(__dirname, '../server/page-data/residual-pages.js'), 'utf8');
const courtRoutesSource = fs.readFileSync(path.join(__dirname, '../server/courts-routes.js'), 'utf8');
const membershipRoutesSource = fs.readFileSync(path.join(__dirname, '../server/membership-routes.js'), 'utf8');

assert.match(apiSource, /T_COURT_ACCOUNT_LIST_INDEX='ft_court_account_list_index'/, 'API 应定义订场会员列表索引表');
assert.match(apiSource, /T_COURT_ACCOUNT_LIST_INDEX_TASKS='ft_court_account_list_index_tasks'/, 'API 应定义订场会员列表索引补偿任务表');
assert.match(apiSource, /T_COURT_ACCOUNT_LIST_SNAPSHOT='ft_court_account_list_snapshot'/, 'API 应定义订场会员列表快照表');
assert.match(apiSource, /T_COURT_ACCOUNT_LIST_SNAPSHOT_TASKS='ft_court_account_list_snapshot_tasks'/, 'API 应定义订场会员列表快照任务表');
assert.match(apiSource, /\[T_COURT_ACCOUNT_LIST_SNAPSHOT,\{ttlMs:600000\}\]/, '快照 getRow 热缓存应至少 10 分钟，避免筛选交互反复远程读 meta/delta');
assert.match(apiSource, /courtAccountListIndexSync=createCourtAccountListIndexSync/, 'API 应创建订场会员列表索引同步器');
assert.match(apiSource, /courtAccountListSnapshotSync=createCourtAccountListSnapshotSync/, 'API 应创建订场会员列表快照同步器');
assert.match(apiSource, /courtAccountListIndexSync=createCourtAccountListIndexSync\(\{[\s\S]*courtAccountListSnapshotSync/, '单条索引重建后应同步写入快照 delta');
assert.match(apiSource, /createCourtAccountListIndexSync\(\{listCampusesWithDefaults,getCachedScan,getCachedRow,put,del,mkTable/, '索引重建器应注入 mkTable，确保确认重建时能先建索引表');
assert.match(apiSource, /path==='\/admin\/court-account-list-index\/rebuild'&&method==='POST'[\s\S]*const dryRun=body\?\.dryRun!==false/, '索引重建入口默认必须 dry-run');
assert.match(apiSource, /path==='\/admin\/court-account-list-snapshot\/rebuild'&&method==='POST'[\s\S]*const dryRun=body\?\.dryRun!==false/, '快照重建入口默认必须 dry-run');
assert.match(apiSource, /path==='\/admin\/court-account-list-snapshot\/status'&&method==='GET'/, 'API 应提供快照健康状态接口');
assert.match(apiSource, /health\.mergeAllowed[\s\S]*autoMergeIfNeeded\('status-check'\)/, '健康状态接口应在允许时触发后台自动合并');
assert.match(apiSource, /loadIndexRows:\(\)=>getCachedScan\(T_COURT_ACCOUNT_LIST_INDEX,\{fresh:true\}\)/, '自动合并应从当前行级索引重建快照');

assert.match(residualSource, /createCourtAccountListSnapshotLoader/, 'page-data 应接入订场会员列表快照读取器');
assert.match(residualSource, /tables:\{courtAccountListSnapshot:T_COURT_ACCOUNT_LIST_SNAPSHOT\}/, '列表读取器应读取快照包，不能扫索引全表');
assert.match(residualSource, /COURT_ACCOUNT_LIST_INDEX_NOT_READY_CODE/, 'page-data 应识别索引未初始化错误');
assert.match(residualSource, /if\(!ids\.length&&T_COURT_ACCOUNT_LIST_SNAPSHOT\)[\s\S]*view=await loadCourtAccountListSnapshot\(params\)[\s\S]*return sendJson\(res,\{error:err\.message\|\|'订场会员列表快照未初始化',code:err\.code\},err\.statusCode\|\|503\)/, '列表快照未初始化时应快速失败，不能慢扫事实大表');
assert.doesNotMatch(residualSource, /view=await loadCourtAccountListIndex\(params\)/, '列表首屏不应再远程扫描行级索引表');
assert.match(residualSource, /if\(!view\)view=await loadCourtAccountListView\(params\)/, '详情或异常兜底仍可回源事实表');
assert.match(residualSource, /includeDetails:ids\.length>0/, '详情抽屉仍应通过 ids 回源完整事实数据');

assert.match(courtRoutesSource, /syncCourtAccountIndex\(id,'court-create'\)/, '订场用户新增后应同步列表索引');
assert.match(courtRoutesSource, /syncCourtAccountIndex\(id,'court-update'\)/, '订场用户编辑后应同步列表索引');
assert.match(courtRoutesSource, /syncCourtAccountIndex\(id,'court-delete'\)/, '订场用户删除后应同步列表索引');

assert.match(membershipRoutesSource, /syncCourtAccountIndex\(court\.id,'membership-order-create'\)/, '会员开卡续费后应同步列表索引');
assert.match(membershipRoutesSource, /syncCourtAccountIndex\(r\.courtId,'membership-account-update'\)/, '会员账户状态变化后应同步列表索引');
assert.match(membershipRoutesSource, /syncCourtAccountIndex\(r\.courtId,'membership-order-update'\)/, '会员订单变化后应同步列表索引');
assert.match(membershipRoutesSource, /syncCourtAccountIndex\(r\.courtId,'membership-benefit-ledger-create'\)/, '会员权益流水变化后应同步列表索引');

const guardedSources = [residualSource, courtRoutesSource, membershipRoutesSource].join('\n');
assert.doesNotMatch(guardedSources, /\/load-all[\s\S]*court-account-list-index/, '订场会员列表索引链路不应调用 /load-all');

console.log('court account list index routes tests passed');
