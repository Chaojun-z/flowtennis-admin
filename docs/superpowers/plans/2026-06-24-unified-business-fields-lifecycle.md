# 统一业务字段与客户生命周期实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全平台同一业务含义只保留一个标准字段定义、一个计算规则、一个展示口径和一个权威数据来源。

**Architecture:** 先建立统一客户生命周期读模型，把线索、学员、订场用户、会员账户串成同一条客户链路。财务事实表不被页面直接改写，经营分析和页面后续逐步改读统一读模型。

**Tech Stack:** Node.js、Express、TableStore、原生前端 JS、现有 `business-taxonomy`、现有财务门禁。

---

## 边界

本计划覆盖所有页面和入口，不只覆盖客户中心：

- 客户中心：线索池、普通学员、正式学员、订场用户、会员管理。
- 教学链路：课包、购买、排课、消课、权益。
- 订场会员链路：订场、会员账户、会员订单、会员权益流水。
- 财务：财务总览、收款流水、入账流水、财务回归。
- 经营分析：经营总览、场地运转、转化与留存、教练人效。

## 统一规则

- `sourceLeadId` 是线索来源链路的标准字段；历史 `leadId`、`fromLeadId` 只能作为兼容别名。
- 普通学员和正式学员不是两张客户表，而是 `studentStage` 的两个视图。
- 订场用户是订场链主档；会员管理是订场用户开通会员后的会员视图。
- 会员账户、会员订单、会员权益流水必须能追溯到订场用户，再追溯到线索。
- 财务收入、余额、已入账、待履约不由页面临时计算，必须走统一财务口径和财务门禁。

## Task 1: 第一阶段底座

**Files:**

- Create: `server/read-models/customer-lifecycle.js`
- Create: `tests/customer-lifecycle-read-model.test.js`
- Modify: `server/metrics/operations-metrics.js`
- Modify: `server/leads-routes.js`
- Modify: `server/membership.js`
- Modify: `api/index.js`
- Modify: `tests/leads-convert-dedupe.test.js`
- Modify: `tests/membership-rules.test.js`
- Modify: `package.json`

- [x] **Step 1: 写失败测试**

Run:

```bash
node tests/customer-lifecycle-read-model.test.js
node tests/leads-convert-dedupe.test.js
node tests/membership-rules.test.js
```

Expected before implementation:

```text
customer-lifecycle module not found
复用同名学员时也要补齐线索来源链路 assertion failed
membership account should inherit court source lead assertion failed
```

- [x] **Step 2: 新增统一客户生命周期读模型**

Implementation file:

```text
server/read-models/customer-lifecycle.js
```

Required behavior:

```text
lead + student + court + membershipAccount collapse into one lifecycle row
source uses FlowTennisBusinessTaxonomy.normalizeLeadSource
formal purchase sets studentStage=formal
membership account sets courtStage=member
buildLeadConversionSetsFromLifecycle returns course/booking/membership lead sets
```

- [x] **Step 3: 转化链路补标准来源字段**

Implementation:

```text
server/leads-routes.js
api/index.js
```

Required behavior:

```text
buildLeadStudentRecord writes sourceLeadId
buildLeadCourtRecord writes sourceLeadId
convert/link existing student patches sourceLeadId when missing
convert/link existing court patches sourceLeadId when missing
existing sourceLeadId is not overwritten
```

- [x] **Step 4: 会员链路继承来源字段**

Implementation:

```text
server/membership.js
```

Required behavior:

```text
membership account inherits sourceLeadId from court
membership order inherits sourceLeadId from court
court recharge history inherits sourceLeadId from court
membership grant ledger inherits sourceLeadId from membership order
```

- [x] **Step 5: 经营分析先接入统一生命周期集合**

Implementation:

```text
server/metrics/operations-metrics.js
```

Required behavior:

```text
course/booking/membership conversion sets come from customer-lifecycle read model
membership conversion can be derived by courtId even when membership account itself lacks sourceLeadId
```

## Task 2: 第二阶段页面读模型收口

**Files:**

- Modify: `server/page-data/core-pages.js`
- Modify: `server/page-data/operations-page.js`
- Modify: `public/assets/scripts/pages/students.js`
- Modify: `public/assets/scripts/pages/courts.js`
- Add/Modify tests under `tests/*page*` and `tests/*view*`

- [x] **Step 1: 客户中心页面改读统一生命周期字段**

Run:

```bash
node tests/customer-lifecycle-read-model.test.js
node tests/student-split-pages.test.js
node tests/membership-view.test.js
```

Expected:

```text
ordinary/formal student split comes from studentStage
court/member split comes from courtStage and membershipStatus
```

- [x] **Step 2: 经营分析所有转化字段改读统一生命周期字段**

Run:

```bash
node tests/operations-metrics.test.js
node tests/operations-page-data.test.js
```

Expected:

```text
conversion stage, source, campus, coach and membership conversion use the same lifecycle source
```

## Task 3: 第三阶段全平台字段口径收口

**Files:**

- Modify: `server/page-data/finance-page.js`
- Modify: `server/page-data/core-pages.js`
- Modify: `api/index.js`
- Modify: `public/assets/scripts/core/state.js`
- Modify: `public/assets/scripts/pages/students.js`
- Modify: `public/assets/scripts/pages/courts.js`
- Modify: `public/assets/scripts/pages/purchases.js`
- Modify: `public/assets/scripts/pages/schedule.js`
- Modify: `public/assets/scripts/pages/coachops.js`
- Create: `tests/customer-lifecycle-global-fields.test.js`

- [x] **Step 1: 全平台入口下发统一生命周期字段**

Required behavior:

```text
/page-data/finance returns customerLifecycleRows
/page-data/workbench returns customerLifecycleRows
/load-all returns customerLifecycleRows
finance/workbench/load-all lifecycle rows are built from already scoped page data
```

- [x] **Step 2: 前端只通过统一访问器读取生命周期字段**

Required behavior:

```text
customerLifecycleRowsForRecord is the generic lookup
customerLifecycleByStudentId is the standard student lookup
customerLifecycleByCourtId is the standard court lookup
customerLifecycleByMembershipAccountId is the standard membership lookup
customerLifecycleSource/customerLifecycleCampus/customerLifecycleOwner are the only page-facing field accessors
customerLifecycleStudentStage/customerLifecycleCourtStage/customerLifecycleMembershipStatus are the only page-facing lifecycle status accessors
```

- [x] **Step 3: 客户、教学、购买、排课、会员、财务展示链改读统一访问器**

Required behavior:

```text
student split and source filter use standard studentStage/source
membership view uses standard courtStage/membershipStatus
purchase campus filtering uses standard customer campus fallback
schedule student campus/owner hints use standard lifecycle fields
finance legacy fallback uses standard customer campus without changing finance math
products/pricing/basic settings pages do not define customer lifecycle meanings locally
```

- [x] **Step 4: 不直接改财务事实表含义**

Run before any finance-impacting change:

```bash
npm run guard:finance
```

Expected:

```text
finance baseline unchanged unless a separate finance task explicitly changes口径 and completes reconciliation
```

- [x] **Step 5: 财务字段统一纳入字段字典**

Required fields:

```text
totalIncome
recognizedRevenue
pendingRevenue
storedValueIncome
bookingIncome
packageIncome
cashDelta
recognizedRevenueDelta
```

Expected:

```text
finance page and operations overview reuse the same finance read model
```

## Task 4: 线索字段标准收口

**Files:**

- Modify: `public/assets/scripts/core/business-taxonomy.js`
- Modify: `api/index.js`
- Modify: `public/assets/scripts/pages/leads.js`
- Modify: `public/assets/scripts/standard/components.js`
- Modify: `docs/business-rules/平台核心数据字典.md`
- Create: `tests/lead-field-standards.test.js`

- [x] **Step 1: 字段字典统一**

Required behavior:

```text
leadStage = 新线索 / 跟进中 / 已约体验 / 已体验待成交 / 已成交 / 已流失
dealType = 课程 / 订场 / 会员 / 课程+订场 / 课程+会员 / 订场+会员 / 课程+订场+会员
customerType = 成人 / 青少年
demandProduct = 私教 / 小班 / 订场 / 会员 / 陪打 / 约球 / 穿线 / 合作 / 其他
```

- [x] **Step 2: 页面展示和历史兼容分离**

Required behavior:

```text
页面展示客户类型、需求产品、成交教练、成交时间、流失原因
consultType only aliases demandProduct
conversionType only aliases dealType
convertedFlag is not a manual page-facing field
```
