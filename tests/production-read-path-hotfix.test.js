const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');

assert.match(apiSource, /function scanFirstRows\(/, '生产应急恢复应提供限量读取 helper');
assert.match(apiSource, /const PRODUCTION_PAGE_READ_LIMITS=\{/, '生产应急恢复应定义首屏限量读取上限');
assert.match(apiSource, /\[T_COURTS\]:1000,/, '生产订场数据读取上限应覆盖当前美东 ft_courts 665 条，避免会员和订场用户少数');
assert.match(apiSource, /function cappedScan\(t, limit=PRODUCTION_PAGE_READ_LIMITS\.default\)/, '生产 cappedScan 默认上限应走集中配置');
assert.match(apiSource, /const normalizedLimit=limit===undefined\?PRODUCTION_PAGE_READ_LIMITS\.default:\(PRODUCTION_PAGE_READ_LIMITS\[t\]\|\|limit\);/, '生产 cappedScan 应支持按表覆盖读取上限');
assert.match(apiSource, /const LEAD_LIST_PROJECTION_FIELDS=\[/, '线索池应定义首屏轻投影字段，避免继续全量扫描 leads 大对象');
assert.match(apiSource, /const LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS=\[/, '线索跟进列表应定义轻投影字段，避免继续全量扫描 followups');
assert.match(apiSource, /const ADMIN_USER_LIST_PROJECTION_FIELDS=\[/, '账号管理应定义首屏轻投影字段，避免继续全量扫描 users 大对象');
assert.match(apiSource, /const SCHEDULE_LIST_PROJECTION_FIELDS=\[/, '排课表应定义首屏轻投影字段，避免继续全量扫描 schedule 大对象');
assert.match(
  apiSource,
  /const SCHEDULE_LIST_PROJECTION_FIELDS=\[[\s\S]*'settlementType'[\s\S]*'paidAmount'[\s\S]*'payMethod'[\s\S]*\];/,
  '排课轻投影必须包含直接收款字段，否则财务页课程收入会被算成 0'
);

assert.match(
  apiSource,
  /if\(method==='GET'\)\{if\(user\.role==='admin'\)return sendJson\(res,isProductionRuntime\(\)\?await scanFirstRows\(T_SCHEDULE,\{limit:PRODUCTION_PAGE_READ_LIMITS\.schedule,columns:SCHEDULE_LIST_PROJECTION_FIELDS\}\)\.catch\(\(\)=>\[\]\):await getCachedScan\(T_SCHEDULE,\{columns:SCHEDULE_LIST_PROJECTION_FIELDS\}\)\);/,
  '管理员排课表首屏应在 production 改成限量轻投影读取'
);

assert.match(
  apiSource,
  /const all=isProductionRuntime\(\)\?await scanFirstRows\(T_USERS,\{limit:PRODUCTION_PAGE_READ_LIMITS\.adminUsers,columns:ADMIN_USER_LIST_PROJECTION_FIELDS\}\)\.catch\(\(\)=>\[\]\):await getCachedScan\(T_USERS,\{columns:ADMIN_USER_LIST_PROJECTION_FIELDS\}\);return sendJson\(res,all\.filter\(isVisibleAdminUser\)\.map\(buildAdminUserView\)\);/,
  '账号管理首屏应在 production 改成限量轻投影读取'
);

assert.match(
  apiSource,
  /const rows=isProductionRuntime\(\)\?await scanFirstRows\(T_LEAD_FOLLOWUPS,\{limit:PRODUCTION_PAGE_READ_LIMITS\.leadFollowups,columns:LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS\}\)\.catch\(\(\)=>\[\]\):await getCachedScan\(T_LEAD_FOLLOWUPS,\{columns:LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS\}\)\.catch\(\(\)=>\[\]\);/,
  '线索跟进列表应在 production 改成限量轻投影读取'
);

assert.match(
  apiSource,
  /const rows=isProductionRuntime\(\)\?await scanFirstRows\(T_LEADS,\{limit:PRODUCTION_PAGE_READ_LIMITS\.leads,columns:LEAD_LIST_PROJECTION_FIELDS\}\)\.catch\(\(\)=>\[\]\):await getCachedScan\(T_LEADS,\{columns:LEAD_LIST_PROJECTION_FIELDS\}\)\.catch\(\(\)=>\[\]\);/,
  '线索池列表应在 production 改成限量轻投影读取'
);

assert.match(apiSource, /const FINANCE_PAGE_COURT_PROJECTION_FIELDS=\[/, '财务总览应定义订场账户轻投影字段');
assert.match(
  apiSource,
  /getCachedScan\(T_COURTS,\{columns:FINANCE_PAGE_COURT_PROJECTION_FIELDS\}\)\.catch\(\(\)=>\[\]\)/,
  '财务快照应对 courts 使用轻投影，避免 history 导致超时'
);
assert.match(
  apiSource,
  /const financeSnapshot=buildFinancePageSnapshot\(\{campuses,students,purchases,entitlements,entitlementLedger,courts,membershipOrders,membershipAccounts,schedule\}\);[\s\S]*financeOverviewData:financeSnapshot\.financeOverviewData,[\s\S]*financeNormalizedRows:financeSnapshot\.financeNormalizedRows/,
  '财务总览应读取生产业务表完整事实账，避免旧基线加白名单增量造成多口径'
);
assert.doesNotMatch(apiSource, /const verifiedFinance=loadVerifiedFinanceArtifacts\(campuses\);[\s\S]*buildVerifiedFinanceWithImportIncrements/, '财务页不应继续使用旧基线加白名单增量作为主口径');
assert.doesNotMatch(apiSource, /financeSettlementRows:\[\]/, '教练结算不应固定返回空数组');
assert.match(
  apiSource,
  /const financeSnapshot=buildFinancePageSnapshot\(\{campuses,students,purchases,entitlements,entitlementLedger,courts,membershipOrders,membershipAccounts,schedule\}\);[\s\S]*financeSettlementRows:financeSnapshot\.financeSettlementRows/,
  '财务接口应返回基于排课轻投影聚合的教练结算数据'
);

assert.match(apiSource, /const COURTS_PAGE_COURT_PROJECTION_FIELDS=\[/, '订场用户页应定义首屏轻投影字段');
assert.match(
  apiSource,
  /const COURTS_PAGE_COURT_PROJECTION_FIELDS=\[[\s\S]*'history'[\s\S]*\];/,
  '订场用户页必须读取 history，否则累计订场和消费金额会显示为 0'
);
assert.match(apiSource, /const COURTS_PAGE_STUDENT_PROJECTION_FIELDS=\[/, '订场用户页应定义首屏学员轻投影字段');
assert.match(apiSource, /const FT_STUDENTS_FAST_TIMEOUT_MS=1200;/, 'ft_students 快路读取应定义明确超时时间');
assert.match(
  apiSource,
  /async function getFastStudentsRead\(options=\{\}\)\{[\s\S]*withTimeout\(readPromise,FT_STUDENTS_FAST_TIMEOUT_MS,fallback\)[\s\S]*fallback to empty array[\s\S]*\}/,
  'ft_students 快路读取应在超时或异常时快速降级为空数组'
);
assert.match(
  apiSource,
  /if\(path==='\/students'\)\{await init\(\);if\(method==='GET'\)\{const rows=await getFastStudentsRead\(\);/,
  '/students 应使用 ft_students 快路读取'
);
assert.match(
  apiSource,
  /if\(path==='\/page-data\/courts'&&method==='GET'\)\{[\s\S]*getFastStudentsRead\(\{columns:COURTS_PAGE_STUDENT_PROJECTION_FIELDS\}\)[\s\S]*getCachedScan\(T_COURTS,\{columns:COURTS_PAGE_COURT_PROJECTION_FIELDS\}\)\.catch\(\(\)=>\[\]\)[\s\S]*membershipAccounts:\[\][\s\S]*coaches:\[\][\s\S]*pricePlans:\[\]/,
  '订场用户首屏应改成 courts/students 轻投影，并允许临时清空扩展数据'
);

console.log('production read path hotfix tests passed');
