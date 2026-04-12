# 学员管理页重构实施计划

> **执行说明：** 本计划用于按阶段改造学员管理页。步骤使用 checkbox 语法跟踪。执行时必须优先处理已确认的风险项，再推进页面结构重构。

**目标：** 把学员页从“资料表”重构为“教学 CRM 管理台”，并先修复权限、关联、统计、筛选、导出、排课学员选择等关键风险。

**架构：** 先做 Phase 1 风险收口，保证数据与口径稳定；再重构学员列表层；再拆出详情层；最后瘦身编辑层。学员、班次、排课、订场、会员之间的正式关联统一收敛到 ID 体系，前端展示层按“列表判断 / 详情理解 / 编辑修改”三层组织。

**技术栈：** 单文件前端 `public/index.html`、后端接口 `api/index.js`、Node 原生测试、现有 `tests/*.test.js`

---

## 文件范围

**核心文件：**

- 修改：`/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- 修改：`/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js`
- 修改：`/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/schedule-rules.test.js`
- 修改：`/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/course-management-nav.test.js`
- 修改：`/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js`
- 修改：`/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-rules.test.js`

**建议新增测试文件：**

- 创建：`/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/student-page-rules.test.js`
- 创建：`/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/student-page-view.test.js`

**已产出方案文档：**

- 参考：`/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/_local/requirements/2026-04-12-student-management-page-restructure-spec.md`

---

## Task 1：补齐基础测试缺口与现有测试红线

**Files:**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-rules.test.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js`

- [ ] **Step 1：确认当前测试失败点**

Run:

```bash
npm test
```

Expected：

- 学员相关测试通过
- `membership-rules.test.js` 挂在 `membership account event helper should be exposed`

- [ ] **Step 2：检查 `_test` 暴露项是否与测试一致**

重点检查：

- `buildMembershipAccountEventRecord`
- 其他会员测试要求暴露的方法是否都在 `module.exports._test` 中

- [ ] **Step 3：补齐最小修复**

目标：

- 不改会员业务逻辑
- 只补测试需要的 helper 暴露或命名对齐

修改位置：

- `api/index.js` 末尾 `_test` 导出区

- [ ] **Step 4：运行会员测试单测**

Run:

```bash
node tests/membership-rules.test.js
```

Expected：

- `membership rules tests passed`

- [ ] **Step 5：再次跑全量测试，确认后续改造前基线尽量干净**

Run:

```bash
npm test
```

Expected：

- 已知会员暴露问题消失
- 若还有别的失败，记录但不盲改

---

## Task 2：收紧学员接口权限

**Files:**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/student-page-rules.test.js`

- [ ] **Step 1：为学员接口权限写测试**

覆盖：

- admin 可 `POST /students`
- admin 可 `PUT /students/:id`
- admin 可 `DELETE /students/:id`
- 非 admin 访问上述写接口返回 `403`

- [ ] **Step 2：运行新测试确认先失败**

Run:

```bash
node tests/student-page-rules.test.js
```

Expected：

- 至少有一条关于非 admin 仍可写学员的断言失败

- [ ] **Step 3：后端补权限判断**

修改：

- `api/index.js` 中 `/students` 与 `/students/:id` 的 `POST / PUT / DELETE`

规则：

- `GET /students` 保持现状
- 写操作要求 `user.role === 'admin'`

- [ ] **Step 4：回跑学员权限测试**

Run:

```bash
node tests/student-page-rules.test.js
```

Expected：

- 学员权限测试通过

---

## Task 3：排课学员改为学员库搜索选择

**Files:**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/schedule-rules.test.js`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/student-page-view.test.js`

- [ ] **Step 1：为排课学员选择方式补视图与规则测试**

覆盖：

- 排课弹窗不再把“学员”作为自由文本正式关联输入
- 学员必须从学员库中选择
- 保存排课时必须带出稳定 `studentIds`
- 选班次后仍可自动填充班次内学员

- [ ] **Step 2：运行新增测试确认先失败**

Run:

```bash
node tests/student-page-view.test.js
node tests/schedule-rules.test.js
```

Expected：

- 至少一条关于自由文本学员输入的断言失败

- [ ] **Step 3：前端改排课弹窗交互**

要求：

- 学员字段改成搜索型选择器
- 支持按姓名 / 手机号搜索
- 仍保留“选班次自动带出学员”
- 正式保存依赖所选学员 ID，不依赖手输文本

- [ ] **Step 4：收口保存逻辑**

要求：

- `saveSchedule()` 必须优先读取选择器里的学员 ID
- `studentName` 只作为展示字段
- 正式关联一律走 `studentIds`

- [ ] **Step 5：移除或弱化基于姓名的正式反查路径**

要求：

- `deriveStudentIdsFromNames()` 不再作为正式主路径
- 仅在必要兼容场景下做只读兜底，不能作为新数据主写入逻辑

- [ ] **Step 6：回跑相关测试**

Run:

```bash
node tests/student-page-view.test.js
node tests/schedule-rules.test.js
```

Expected：

- 排课与学员选择相关测试通过

---

## Task 4：收敛学员正式关联到 ID，减少姓名串联

**Files:**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/student-rules.test.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/student-page-rules.test.js`

- [ ] **Step 1：补规则测试，锁定“ID 优先，姓名只做兼容兜底”**

覆盖：

- 最后上课优先按 `studentIds`
- 订场关联优先按 `studentIds / studentId`
- 重名时不能因为 `includes` 误判

- [ ] **Step 2：运行测试确认现状缺口**

Run:

```bash
node tests/student-rules.test.js
node tests/student-page-rules.test.js
```

- [ ] **Step 3：清理高风险姓名模糊匹配**

重点修改：

- 学员页 `最后上课`
- 学员详情 `最近记录`
- 反馈与排课查找中使用 `includes(name)` 的位置

原则：

- 新逻辑优先精确 ID
- 兼容逻辑最多使用精确姓名相等，不再用模糊包含

- [ ] **Step 4：补齐编辑后联动数据范围**

检查并补充：

- 学员姓名 / 手机修改后，订场关联稳定性是否需要同步刷新或重新归集
- 至少保证不会因为改名改号导致前端关联直接断开

- [ ] **Step 5：回跑相关测试**

Run:

```bash
node tests/student-rules.test.js
node tests/student-page-rules.test.js
```

Expected：

- 不再出现重名串联风险相关失败

---

## Task 5：新增学员重复提醒

**Files:**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/student-page-view.test.js`

- [ ] **Step 1：为重复提醒写前端测试**

覆盖：

- 新增或编辑学员时
- 若姓名相同、手机号相同或姓名手机号高度相似
- 提示管理员存在可能重复记录

- [ ] **Step 2：运行测试确认先失败**

Run:

```bash
node tests/student-page-view.test.js
```

- [ ] **Step 3：实现前端提醒**

规则：

- 第一版不强拦截
- 保存前弹出明确提醒
- 管理员可继续保存

提示文案建议：

- `发现可能重复的学员：张三（138****0000），请确认是否继续保存`

- [ ] **Step 4：回跑测试**

Run:

```bash
node tests/student-page-view.test.js
```

---

## Task 6：统一学员页校区统计口径

**Files:**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/student-page-view.test.js`

- [ ] **Step 1：为校区统计口径补测试**

覆盖：

- 切换到某校区时
- 顶部所有统计卡都应按当前校区口径计算
- 不允许学员按校区、班次却按全局

- [ ] **Step 2：运行测试确认先失败**

Run:

```bash
node tests/student-page-view.test.js
```

- [ ] **Step 3：调整 `renderStudents()` 统计口径**

要求：

- 顶部统计卡一律基于当前校区下的相关数据计算
- 不能混用全局数组长度

- [ ] **Step 4：回跑测试**

Run:

```bash
node tests/student-page-view.test.js
```

---

## Task 7：修复筛选后分页与导出口径

**Files:**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/student-page-view.test.js`

- [ ] **Step 1：为分页与导出写测试**

覆盖：

- 搜索或筛选条件变化时，页码重置到第一页
- CSV 导出结果应等于当前筛选结果，而不是仅按校区

- [ ] **Step 2：运行测试确认先失败**

Run:

```bash
node tests/student-page-view.test.js
```

- [ ] **Step 3：实现页码重置**

要求：

- 搜索输入变化
- 类型变化
- 来源变化
- 后续新增的状态/关联筛选变化

上述任一变化都应把 `stuPage` 重置为 `1`

- [ ] **Step 4：改造导出逻辑**

要求：

- 导出必须基于当前过滤后的结果集
- 文件名可保持现状

- [ ] **Step 5：回跑测试**

Run:

```bash
node tests/student-page-view.test.js
```

---

## Task 8：学员列表重构为“判断型列表”

**Files:**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/student-page-view.test.js`

- [ ] **Step 1：先为新列表结构写视图测试**

覆盖：

- 列表字段更新为：学员、当前状态、当前班次、最近上课、负责教练、课包/课时、订场/会员、来源、备注摘要、操作
- `关联账户` 文案被移除
- `查看` 操作出现，`编辑` 保留

- [ ] **Step 2：运行测试确认先失败**

Run:

```bash
node tests/student-page-view.test.js
```

- [ ] **Step 3：新增状态计算函数**

状态第一版：

- 上课中
- 待转化
- 沉默30天
- 仅订场
- 无班次

要求：

- 规则简单可解释
- 以当前 spec 为准

- [ ] **Step 4：调整顶部统计卡**

改成：

- 学员总数
- 上课中
- 待转化
- 沉默30天
- 已关联订场 / 会员

- [ ] **Step 5：调整表头与行渲染**

目标：

- 列表用于快速判断
- 不在列表里展开太多明细

- [ ] **Step 6：补状态与筛选联动**

新增筛选：

- 学习状态
- 关联情况

- [ ] **Step 7：回跑测试**

Run:

```bash
node tests/student-page-view.test.js
```

---

## Task 9：拆出学员详情层，瘦身编辑层

**Files:**

- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Create: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/student-page-view.test.js`

- [ ] **Step 1：为详情层与编辑层分责写测试**

覆盖：

- 学员详情中分为：
  - 教学信息
  - 运营信息
  - 消费与关联信息
- 编辑弹窗只保留基础资料
- 大段关联信息不再堆在编辑弹窗里

- [ ] **Step 2：运行测试确认先失败**

Run:

```bash
node tests/student-page-view.test.js
```

- [ ] **Step 3：新增“查看学员详情”交互**

要求：

- 从列表进入详情
- 详情与编辑分开

- [ ] **Step 4：重排详情信息模块**

顺序固定为：

1. 教学信息
2. 运营信息
3. 消费与关联信息

- [ ] **Step 5：编辑弹窗瘦身**

编辑只保留：

- 姓名
- 手机号
- 学员类型
- 来源
- 活动范围
- 校区
- 备注

- [ ] **Step 6：回跑测试**

Run:

```bash
node tests/student-page-view.test.js
```

---

## Task 10：全量验证

**Files:**

- Verify only

- [ ] **Step 1：跑学员相关测试**

Run:

```bash
node tests/student-rules.test.js
node tests/student-page-rules.test.js
node tests/student-page-view.test.js
node tests/schedule-rules.test.js
```

- [ ] **Step 2：跑全量测试**

Run:

```bash
npm test
```

Expected：

- 不新增回归
- 学员页相关改造项通过

- [ ] **Step 3：人工核对关键路径**

必须检查：

1. 新增学员
2. 编辑学员
3. 排课选择学员
4. 切校区看统计
5. 筛选后分页
6. 导出当前结果
7. 查看学员详情
8. 编辑资料不再承担详情角色

---

## 推荐执行顺序

建议按以下顺序落地，不要跳步：

1. Task 1 基线测试修复
2. Task 2 权限
3. Task 3 排课学员选择
4. Task 4 ID 关联收口
5. Task 5 重复提醒
6. Task 6 校区统计
7. Task 7 筛选与导出
8. Task 8 列表重构
9. Task 9 详情与编辑分层
10. Task 10 全量验证

---

## 执行原则

执行过程中必须遵守：

1. 每次修改只改当前任务相关范围，控制爆炸半径。
2. 不为了学员页改造而顺手大重构整份 `public/index.html`。
3. 所有正式关联优先走 ID，不再新增依赖姓名模糊匹配的主路径。
4. 列表页负责判断，详情页负责理解，编辑页负责修改，不允许职责回混。
5. 测试先补再改，避免盲改。
