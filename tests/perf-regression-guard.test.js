const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const authRoutesSource = fs.readFileSync(path.join(__dirname, '../server/auth-routes.js'), 'utf8');
const scheduleRoutesSource = fs.readFileSync(path.join(__dirname, '../server/schedule-routes.js'), 'utf8');
const feedbackRoutesSource = fs.readFileSync(path.join(__dirname, '../server/feedbacks-routes.js'), 'utf8');
const corePageDataSource = fs.readFileSync(path.join(__dirname, '../server/page-data/core-pages.js'), 'utf8');
const residualPageDataSource = fs.readFileSync(path.join(__dirname, '../server/page-data/residual-pages.js'), 'utf8');
const courtAccountReadModelSource = fs.readFileSync(path.join(__dirname, '../server/page-data/court-account-read-model.js'), 'utf8');
const platformMetricsSource = fs.readFileSync(path.join(__dirname, '../server/read-models/platform-metrics.js'), 'utf8');
const apiSourceForResidualRoutes = apiSource.slice(apiSource.indexOf('const handleResidualPageDataRoutes=createResidualPageDataRoutes'), apiSource.indexOf('function parseSimpleCsv'));
const studentDetailRouteSource = corePageDataSource.slice(corePageDataSource.indexOf("path==='/page-data/student-detail'&&method==='GET'"), corePageDataSource.indexOf("path==='/page-data/purchases'&&method==='GET'"));

assert.match(apiSource, /async function timedEndpointMetric\(name,fn,meta=\{\}\)/, '后端必须提供统一接口耗时统计 helper');
assert.match(authRoutesSource, /timedEndpointMetric\('auth\.login'/, '登录必须进入性能统计');
assert.match(corePageDataSource, /timedEndpointMetric\('pageData\.workbench'/, '教练工作台必须进入性能统计');
assert.match(scheduleRoutesSource, /timedEndpointMetric\('schedule\.save'/, '排课保存必须进入性能统计');
assert.match(feedbackRoutesSource, /timedEndpointMetric\('feedback\.save'/, '反馈保存必须进入性能统计');
assert.match(studentDetailRouteSource, /const studentTeachingSummary=T_STUDENT_TEACHING_SUMMARY&&!fresh[\s\S]*getCachedRow\(T_STUDENT_TEACHING_SUMMARY,studentId\)/, '学员详情应优先按学员 ID 读取教学摘要');
assert.match(studentDetailRouteSource, /if\(studentTeachingSummary\)\{[\s\S]*return sendJson\(res,\{[\s\S]*purchases:\[\],[\s\S]*entitlementLedger:\[\],[\s\S]*schedule:\[\]/, '学员详情摘要命中时不得扫描购买、流水和排课整表');
assert.match(studentDetailRouteSource, /buildTeachingStudentViews\(customerLifecycleRows,\{[\s\S]*\},\{includeDetails:true\}\)/, '学员详情慢路径也必须明确只在详情场景返回详情字段');
assert.match(platformMetricsSource, /function teachingStudentViewRow\(row = \{\}, listFields = \{\}, options = \{\}\)[\s\S]*options\.includeDetails/, '学员列表读模型应默认剥离详情大字段');
assert.match(platformMetricsSource, /detailLessonRecordRows: Array\.isArray\(row\.detailLessonRecordRows\)/, '学员教学摘要应保存详情上课记录，供抽屉按需读取');
assert.match(courtAccountReadModelSource, /const detailById = options\.includeDetails === true && sampleIds\.length > 0 && typeof getCachedRow === 'function'/, '订场/会员详情应启用按 ID 读取基础行的快路径');
assert.match(courtAccountReadModelSource, /readRowsByIds\(\{ table: tables\.courts, ids: sampleIds, getCachedRow \}\)/, '订场/会员详情不得先扫描完整订场用户表再找单个用户');
assert.match(residualPageDataSource, /getCachedRow,[\s\S]*COURTS_PAGE_STUDENT_PROJECTION_FIELDS,[\s\S]*COURTS_PAGE_COURT_PROJECTION_FIELDS,[\s\S]*LEAD_LIST_PROJECTION_FIELDS/, '订场/会员读模型应接收按 ID 读取和轻量字段投影能力');
assert.match(apiSourceForResidualRoutes, /T_MEMBERSHIP_BENEFIT_LEDGER,T_MEMBERSHIP_ACCOUNT_EVENTS/, '会员读模型必须传入权益流水和账户事件表，避免详情缺数或兜底异常');

console.log('perf regression guard tests passed');
