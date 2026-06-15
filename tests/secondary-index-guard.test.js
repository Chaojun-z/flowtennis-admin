const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const corePageDataSource = fs.readFileSync(path.join(__dirname, '../api/page-data/core-pages.js'), 'utf8');
const purchaseEntitlementRoutesSource = fs.readFileSync(path.join(__dirname, '../api/purchase-entitlement-routes.js'), 'utf8');

assert.match(apiSource, /T_COACH_SCHEDULE_INDEX='ft_coach_schedule_index'/, '必须声明教练排课索引表');
assert.match(apiSource, /T_STUDENT_ACTIVE_ENTITLEMENT_INDEX='ft_student_active_entitlement_index'/, '必须声明学员活跃课包索引表');
assert.match(apiSource, /async function getCoachIndexedScheduleForUser\(user\)\{/, '必须提供教练排课索引读取 helper');
assert.match(apiSource, /async function getCoachScheduleRowsForUser\(user,coachRefs=\[\]\)\{/, '必须提供教练排课索引加主表兜底读取 helper');
assert.match(apiSource, /async function getIndexedActiveEntitlementsForStudents\(studentIds=\[\]\)\{/, '必须提供学员活跃课包索引读取 helper');
assert.match(apiSource, /const indexedRows=await getCoachIndexedScheduleForUser\(user\);[\s\S]*const fallbackRows=filterLoadAllForUser\(\{schedule:await getScheduleListRows\(\)\},user,coachRefs\)\.schedule;[\s\S]*return \[\.\.\.merged\.values\(\)\];/, '教练排课读取必须合并索引和主排课表兜底，避免索引漏数据');
assert.match(corePageDataSource, /const scheduleRowsPromise=user\.role==='admin'\?getScheduleListRows\(\):getCoachScheduleRowsForUser\(user,coachRefs\);/, '教练端工作台必须走索引加主表兜底');
assert.match(apiSource, /syncCoachScheduleIndexes\(null,r\)\.catch\(/, '新建排课索引同步失败不能回滚已保存排课');
assert.match(apiSource, /syncCoachScheduleIndexes\(ex,r\)\.catch\(/, '编辑排课索引同步失败不能回滚已保存排课');
assert.match(apiSource, /syncCoachScheduleIndexes\(ex,null\)\.catch\(/, '删除排课索引同步失败不能回滚已删除排课');
assert.match(purchaseEntitlementRoutesSource, /if\(path==='\/entitlements\/recommend'&&method==='POST'\)\{[\s\S]*getIndexedActiveEntitlementsForStudents\(parseArr\(body\.studentIds\)\)[\s\S]*getCachedScan\(T_COACHES\)\.catch\(\(\)=>\[\]\)[\s\S]*getCachedScan\(T_USERS\)\.catch\(\(\)=>\[\]\)/, '课包推荐必须优先走学员活跃课包索引');
assert.match(apiSource, /const \[entitlementRows,coaches,users\]=await Promise\.all\(\[[\s\S]*getCachedScan\(T_ENTITLEMENTS\)[\s\S]*getCachedScan\(T_COACHES\)[\s\S]*getCachedScan\(T_USERS\)[\s\S]*\]\);[\s\S]*const coachRefs=buildCoachRefs\(\{coaches,users\}\);[\s\S]*resolveScheduleEntitlementDeltas\(\{\.\.\.r,coachRefs\},entitlementRows\)/, '排课保存扣课校验必须使用完整教练映射，避免教练改名后课包不匹配');
assert.match(apiSource, /const needsFallback=missingStudentIds\.length>0\|\|!indexedRows\.length;[\s\S]*const fallbackRows=\(await getCachedScan\(T_ENTITLEMENTS\)\.catch\(\(\)=>\[\]\)\)\.filter\(row=>normalized\.includes\(String\(row\.studentId\|\|''\)\.trim\(\)\)&&isActiveEntitlementForIndex\(row\)\);/, '课包推荐在索引缺失或空洞时必须回退全量课包扫描');
assert.match(purchaseEntitlementRoutesSource, /await syncStudentActiveEntitlementIndexes\(ent,next\);/, '课包扣减后必须同步学员活跃课包索引');
assert.match(purchaseEntitlementRoutesSource, /await syncStudentActiveEntitlementIndexes\(old,null\);/, '课包删除后必须同步学员活跃课包索引');
assert.match(purchaseEntitlementRoutesSource, /const rows=\(user\.role==='admin'&&sid&&!isCampusScopedAdmin\(user\)\)[\s\S]*\? await getIndexedActiveEntitlementsForStudents\(\[sid\]\)[\s\S]*: await getCachedScan\(T_ENTITLEMENTS\)\.catch\(\(\)=>\[\]\);[\s\S]*if\(user\.role==='admin'&&!isCampusScopedAdmin\(user\)\)return sendJson\(res,sid\?rows\.filter\(e=>e\.studentId===sid\):rows\);/, '按学员查看课包时必须优先走学员活跃课包索引');

console.log('secondary index guard tests passed');
