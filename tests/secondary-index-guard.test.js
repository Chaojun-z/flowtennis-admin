const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');

assert.match(apiSource, /T_COACH_SCHEDULE_INDEX='ft_coach_schedule_index'/, '必须声明教练排课索引表');
assert.match(apiSource, /T_STUDENT_ACTIVE_ENTITLEMENT_INDEX='ft_student_active_entitlement_index'/, '必须声明学员活跃课包索引表');
assert.match(apiSource, /async function getCoachIndexedScheduleForUser\(user\)\{/, '必须提供教练排课索引读取 helper');
assert.match(apiSource, /async function getIndexedActiveEntitlementsForStudents\(studentIds=\[\]\)\{/, '必须提供学员活跃课包索引读取 helper');
assert.match(apiSource, /if\(method==='GET'\)\{if\(user\.role==='admin'\)return sendJson\(res,await getCachedScan\(T_SCHEDULE\)\);const indexedRows=await getCoachIndexedScheduleForUser\(user\);if\(indexedRows\)return sendJson\(res,indexedRows\);/, '教练端排课列表必须优先走教练排课索引');
assert.match(apiSource, /await syncCoachScheduleIndexes\(null,r\);/, '新建排课后必须同步教练排课索引');
assert.match(apiSource, /await syncCoachScheduleIndexes\(ex,r\);/, '编辑排课后必须同步教练排课索引');
assert.match(apiSource, /await syncCoachScheduleIndexes\(ex,null\);/, '删除排课后必须同步教练排课索引');
assert.match(apiSource, /if\(path==='\/entitlements\/recommend'&&method==='POST'\)\{await init\(\);const rows=await getIndexedActiveEntitlementsForStudents\(parseArr\(body\.studentIds\)\);/, '课包推荐必须优先走学员活跃课包索引');
assert.match(apiSource, /await syncStudentActiveEntitlementIndexes\(ent,next\);/, '课包扣减后必须同步学员活跃课包索引');
assert.match(apiSource, /await syncStudentActiveEntitlementIndexes\(old,null\);/, '课包删除后必须同步学员活跃课包索引');
assert.match(apiSource, /if\(user\.role==='admin'&&sid\)return sendJson\(res,await getIndexedActiveEntitlementsForStudents\(\[sid\]\)\);/, '按学员查看课包时必须优先走学员活跃课包索引');

console.log('secondary index guard tests passed');
