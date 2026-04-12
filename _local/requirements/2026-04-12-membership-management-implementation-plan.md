# 订场会员管理实施计划

> **给后续执行线程：** 本文档是本地交接方案，路径在 `_local/requirements/`，不要提交到 GitHub。执行代码前必须先读本文档、`2026-04-11-coach-feedback-course-package-requirements.md` 和 `2026-04-12-course-package-entitlement-implementation-plan.md`。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 FlowTennis 现有“订场用户 + 储值流水 + 学员关联”基础上，新增一套独立的订场会员系统，支持会员方案、购买记录、余额有效期、赠送权益、会员状态展示，以及和订场用户/学员信息的联动。

**Architecture:** 会员系统和课包权益系统完全分开。课包权益继续服务“上课消课”，会员系统服务“订场储值 + 订场折扣 + 赠送服务权益”。会员金额余额继续以现有 `courts.history` 为资金主账本；会员方案、购买记录、会员账户、赠送权益流水单独建表，避免和课包权益混账。

**Tech Stack:** 现有单页 HTML（`public/index.html`）、Vercel Serverless Function（`api/index.js`）、阿里云 TableStore、现有 `tests/*.test.js`。

---

## 1. 本次修正后的核心业务结论

以下规则以你补充截图为准，覆盖之前讨论中的错误理解：

### 1.1 充值余额规则

1. 会员充值金额自充值之日起有效 1 年（12 个自然月）。
2. 到 1 年时，如果账户仍有未消费余额，则自动延续 12 个月。
3. 余额从首次充值日起最长有效 2 年。
4. 2 年到期后，账户剩余余额自动清零，不退款。
5. 如果账户已经清零，重新充值任一会员档位后，原账户重新激活。
6. 如果在有效期内续充，且续充金额不低于原充值档位，则当前账户内“已有余额”的有效期从续充日重新计算。

### 1.2 赠送权益规则

1. 赠送权益按每次办卡/续充形成一份独立权益清单。
2. 每份赠送权益有效期自开卡之日起 1 年。
3. 到期未使用的赠送权益自动失效，不补发、不延期、不折现。
4. 赠送权益仅限本人使用，不得转让或借给他人。
5. 退卡时，已使用的赠送权益不影响退款金额计算；未使用的赠送权益随退卡一并作废。

### 1.3 设计结论

因为有上面的规则，本次会员系统不能做成“每次买卡就是一个完全独立的金额批次”。

必须拆成两层：

1. **会员账户余额层**
   - 对应一个订场用户只有一个会员账户余额主视图。
   - 余额有效期会被“有效期内合规续充”重置。
   - 余额自动延续和自动清零都发生在这个账户层。

2. **赠送权益批次层**
   - 每次办卡/续充都会生成一个独立权益批次。
   - 每个批次的赠送权益各自 1 年有效。
   - 权益消耗必须知道扣的是哪个批次。

---

## 2. 需求边界

### 2.1 本期必须做

1. 新增会员方案管理。
2. 新增会员购买/续充记录管理。
3. 新增会员账户管理。
4. 新增赠送权益批次和权益消耗流水。
5. 订场用户列表能看到普通/储值/会员状态。
6. 订场用户详情可查看会员信息、余额有效期、赠送权益、购买历史。
7. 学员详情可查看关联订场账户的会员信息摘要。
8. 会员购买时，自动写入订场账户充值流水。
9. 订场消费时，系统支持按会员折扣计算储值扣款金额。
10. 到期延续、到期清零、有效期内续充重置有效期，都有明确系统规则和留痕。
11. 允许同档位会员在成交时做权益定制，例如两个 5000 但赠送权益不同。

### 2.2 本期不做

1. 不做用户端会员展示。
2. 不做复杂审批流。
3. 不做自动短信/微信通知。
4. 不做家庭共享会员。
5. 不把会员权益直接并入课包权益。
6. 不让教练端看到会员金额、充值记录、退款金额。
7. 不做复杂财务退款审批；但必须把“会员作废 / 赠送权益失效”逻辑设计清楚，并预留记录。

---

## 3. 模块定位和联动原则

### 3.1 会员主体挂在哪

**主挂载对象：订场用户 `courts`。**

原因：

- 会员本质是订场会员。
- 会员金额余额直接和订场储值账户相关。
- 订场折扣发生在订场消费场景。
- 现有订场用户已经有余额、充值、消费流水，可以直接复用。

### 3.2 会员和学员如何联动

学员不直接持有会员主账户。

联动方式：

- 学员详情页显示“关联订场账户”。
- 如果关联订场账户是会员，则显示会员摘要。
- 如果学员本人也需要会员，本质上仍然给该自然人建立/绑定一个订场账户，然后会员开在这个订场账户上。

结论：

- **会员主体是订场用户**
- **学员侧是关联展示，不是主表**

### 3.3 会员和课包如何联动

完全分开：

- 课包权益：服务上课、排课、消课。
- 会员权益：服务订场、会员折扣、穿线/发球机/公开课/陪打等赠送服务。

同一个人可以同时拥有：

- 订场会员
- 课包权益

但两套账、两套有效期、两套流水分开管理。

---

## 4. 推荐数据模型

## 4.1 沿用的现有主账本

继续沿用 `ft_courts` 的 `history` 作为资金主账本。

原因：

- 现有系统已经能算余额、累计充值、累计消费、退款。
- 会员购买本质也是充值储值。
- 不应该再造一套独立“会员余额表”导致两边账不一致。

本次只是在 `history` 里增加会员相关字段：

- `membershipOrderId`
- `membershipAccountId`
- `membershipPlanId`
- `membershipPlanName`
- `discountRate`
- `originalAmount`
- `discountedAmount`
- `bonusAmount`
- `category='会员充值'|'会员订场'|'会员到期清零'`

并扩展财务计算规则，支持“到期清零”这类不会增加累计消费的特殊流水。

## 4.2 会员方案 `membership_plans`

新表：

`ft_membership_plans`

标准模板，字段建议：

```json
{
  "id": "mplan-gold",
  "name": "黄金卡",
  "tierCode": "gold",
  "rechargeAmount": 5000,
  "discountRate": 0.8,
  "bonusAmount": 498,
  "benefitTemplate": {
    "publicLesson": { "label": "大师公开课", "unit": "次", "count": 6 },
    "stringingLabor": { "label": "穿线免手工费", "unit": "次", "count": 5 },
    "ballMachine": { "label": "发球机免费使用", "unit": "次", "count": 6 },
    "partnerHit": { "label": "国家二级运动员陪打", "unit": "次", "count": 2 }
  },
  "validMonths": 12,
  "maxMonths": 24,
  "status": "active",
  "notes": "",
  "createdAt": "2026-04-12T00:00:00.000Z",
  "updatedAt": "2026-04-12T00:00:00.000Z"
}
```

说明：

- 这是标准方案，不等于实际成交记录。
- 如果两个 5000 的权益不同，差异必须落在“购买记录快照”里，不改历史方案。

## 4.3 会员账户 `membership_accounts`

新表：

`ft_membership_accounts`

一个订场用户一个会员账户。

```json
{
  "id": "macc-uuid",
  "courtId": "court-uuid",
  "courtName": "王大人",
  "phone": "15001010368",
  "studentIds": ["stu-1"],
  "status": "active",
  "memberTag": "gold",
  "memberLabel": "黄金卡",
  "discountRate": 0.8,
  "cycleStartDate": "2026-04-05",
  "validUntil": "2027-04-04",
  "hardExpireAt": "2028-04-04",
  "autoExtended": false,
  "lastQualifiedRechargeAmount": 5000,
  "lastOrderId": "mord-uuid",
  "notes": "",
  "createdAt": "2026-04-12T00:00:00.000Z",
  "updatedAt": "2026-04-12T00:00:00.000Z"
}
```

说明：

- `status` 建议：`inactive`、`active`、`extended`、`expired`、`cleared`、`voided`
- 账户余额不在此表做主账，余额仍从 `courts.history` 计算。
- 此表是“会员身份、有效期、折扣规则”的主视图。

## 4.4 会员购买记录 `membership_orders`

新表：

`ft_membership_orders`

每次办卡/续充一条。

```json
{
  "id": "mord-uuid",
  "membershipAccountId": "macc-uuid",
  "courtId": "court-uuid",
  "courtName": "王大人",
  "studentIds": ["stu-1"],
  "membershipPlanId": "mplan-gold",
  "membershipPlanName": "黄金卡",
  "rechargeAmount": 5000,
  "bonusAmount": 498,
  "discountRate": 0.8,
  "purchaseDate": "2026-04-05",
  "effectiveDate": "2026-04-05",
  "cycleStartDate": "2026-04-05",
  "validUntil": "2027-04-04",
  "hardExpireAt": "2028-04-04",
  "qualifiesRenewalReset": true,
  "benefitSnapshot": {
    "publicLesson": { "label": "大师公开课", "unit": "次", "count": 6 },
    "stringingLabor": { "label": "穿线免手工费", "unit": "次", "count": 5 },
    "ballMachine": { "label": "发球机免费使用", "unit": "次", "count": 6 },
    "partnerHit": { "label": "国家二级运动员陪打", "unit": "次", "count": 2 },
    "customBenefits": [
      { "label": "朝珺陪打", "unit": "次", "count": 1 }
    ]
  },
  "benefitValidUntil": "2027-04-04",
  "courtHistoryRechargeId": "court-his-uuid",
  "operator": "管理员",
  "status": "active",
  "notes": "特批增加朝珺陪打一次",
  "createdAt": "2026-04-12T00:00:00.000Z",
  "updatedAt": "2026-04-12T00:00:00.000Z"
}
```

说明：

- 真正成交内容看这里，不看会员方案表。
- 这样就能表达“两个 5000，但权益不同”。

## 4.5 会员权益流水 `membership_benefit_ledger`

新表：

`ft_membership_benefit_ledger`

```json
{
  "id": "mbled-uuid",
  "membershipOrderId": "mord-uuid",
  "membershipAccountId": "macc-uuid",
  "courtId": "court-uuid",
  "benefitCode": "ballMachine",
  "benefitLabel": "发球机免费使用",
  "unit": "次",
  "delta": -1,
  "action": "consume",
  "reason": "会员权益使用",
  "relatedDate": "2026-05-08",
  "operator": "管理员",
  "notes": "",
  "createdAt": "2026-04-12T00:00:00.000Z"
}
```

说明：

- 每次扣减/补发/作废都记流水。
- 必须精确到某个购买记录 `membershipOrderId`，因为赠送权益按批次失效。

## 4.6 会员账户事件 `membership_account_events`

新表：

`ft_membership_account_events`

用于记录自动延续、自动清零、有效期重置、退卡作废等账户级事件。

```json
{
  "id": "maevt-uuid",
  "membershipAccountId": "macc-uuid",
  "courtId": "court-uuid",
  "eventType": "auto_extend",
  "beforeStatus": "active",
  "afterStatus": "extended",
  "beforeValidUntil": "2027-04-04",
  "afterValidUntil": "2028-04-04",
  "operator": "system",
  "reason": "一年期到期仍有余额，自动延续 12 个月",
  "createdAt": "2027-04-05T00:00:00.000Z"
}
```

---

## 5. 核心业务规则落地

### 5.1 开卡 / 首次购买

流程：

1. 选择订场用户。
2. 选择会员方案。
3. 可修改成交快照：
   - 赠送金额
   - 各项赠送权益次数
   - 自定义赠送权益
   - 备注
4. 保存后：
   - 如果没有会员账户，则创建会员账户。
   - 创建购买记录。
   - 向 `courts.history` 写一条“会员充值”流水。
   - 更新会员账户状态、折扣、有效期。

### 5.2 有效期内续充

如果满足：

- 当前账户处于有效期内
- 续充金额 `>= lastQualifiedRechargeAmount`

则：

- 更新会员账户 `cycleStartDate = 本次续充日`
- `validUntil = 续充日 + 12个月`
- `hardExpireAt = 续充日 + 24个月`
- 当前余额不清空，直接保留
- 当前折扣更新为本次档位折扣
- 新生成一条购买记录和新赠送权益批次

如果在有效期内续充，但金额小于原充值档位：

- 不算“会员续充重置”
- 建议作为普通储值处理，不重置会员有效期
- 系统需要明确提示管理员

### 5.3 一年到期自动延续

当：

- `today > validUntil`
- `today <= hardExpireAt`
- 当前余额 `> 0`
- 尚未执行过自动延续

则：

- 会员账户状态从 `active` 切为 `extended`
- `autoExtended=true`
- 折扣规则不变
- 不新增购买记录
- 写一条 `membership_account_events` 事件

### 5.4 两年到期自动清零

当：

- `today > hardExpireAt`
- 当前余额 `> 0`

则：

- 向 `courts.history` 写一条“会员到期清零”流水
- 该流水减少余额，但不增加累计消费
- 会员账户状态变为 `cleared`
- 写一条 `membership_account_events` 事件

### 5.5 重新激活

当账户已 `cleared` 后重新购买任意会员档位：

- 复用原会员账户 ID
- 写新的购买记录
- 写新的充值流水
- 重新设置折扣和有效期
- 状态切回 `active`

### 5.6 赠送权益到期

每条购买记录的 `benefitValidUntil` 到期后：

- 未使用权益自动失效
- 不补发、不延期、不折现
- 当前权益汇总时不再计入可用次数

### 5.7 退卡 / 作废

第一版建议做“后台手动作废”：

- 购买记录状态改为 `voided` 或 `refunded`
- 未使用赠送权益统一失效
- 写 `membership_account_events`
- 实际退款金额仍由管理员人工确认
- 系统只负责会员权益状态正确，不直接替代完整退款审批流

---

## 6. 订场用户、会员管理、学员信息如何联动

## 6.1 订场用户列表

必须新增列：

- 账户类型：普通 / 储值 / 会员
- 当前会员：白银卡 / 黄金卡 / 钻石卡 / —
- 会员状态：正常 / 延续期 / 已到期 / 已清零
- 当前折扣
- 会员到期

列表判断口径：

- 无会员账户：普通 / 储值
- 有会员账户且 `status in (active, extended)`：会员
- 有会员账户但 `status in (expired, cleared)`：历史会员

## 6.2 订场用户详情

新增“会员信息”区块：

- 当前会员账户摘要
- 当前余额、有效期、最晚清零日
- 赠送权益剩余汇总
- 购买记录列表
- 权益流水列表
- 按钮：
  - 开通会员
  - 续充会员
  - 使用权益
  - 手工补权益
  - 作废会员

这是会员系统的主要操作入口。

## 6.3 学员详情

学员详情只做“关联展示”，不要做会员主操作。

新增内容：

- 关联订场账户
- 关联订场账户是否为会员
- 当前会员档位
- 当前折扣
- 最近到期时间
- 剩余赠送权益摘要

这样管理者从学员侧也能看到这个人背后的会员情况。

## 6.4 会员管理页

建议新增独立页面 `会员管理`，不要塞进现有 `订场用户` 页面里。

页面结构建议 4 个 Tab：

1. 会员方案
2. 会员购买记录
3. 会员账户
4. 权益流水

原因：

- 订场用户页负责“客户入口”
- 会员管理页负责“运营和规则管理”

---

## 7. 全局模块影响

### 7.1 `courts` 订场用户

必须联动，是会员系统的主入口。

需要改：

- 列表显示会员状态
- 详情展示会员区块
- 充值/消费记录支持会员元数据

### 7.2 `students` 学员

只做关联展示，不做主账。

### 7.3 `schedule` 排课

第一版不直接消耗会员权益。

原因：

- 会员核心是订场和赠送服务，不是上课课包。
- 课包权益系统已经服务排课。

但要考虑未来：

- 如果“大师公开课”“陪打”未来要排课化，可以在后续把会员权益流水和排课记录关联。
- 第一版先预留 `relatedScheduleId` 字段，但不强绑。

### 7.4 `feedback` 反馈

第一版不联动。

### 7.5 `coachops` 教练运营 / 教练端

第一版不让教练看到会员金额、充值、权益次数。

如果未来公开课/陪打需要教练执行，再单独加非财务只读视图。

### 7.6 财务和报表

会员购买本质是充值，必须写进 `courts.history`。

订场消费如果命中会员折扣：

- 历史记录里保存原价和折后价
- 余额扣减按折后价
- 后续统计可区分“会员折扣让利”

---

## 8. 关键接口设计

建议新增：

- `GET /membership-plans`
- `POST /membership-plans`
- `PUT /membership-plans/:id`
- `DELETE /membership-plans/:id`

- `GET /membership-accounts`
- `GET /membership-accounts?courtId=xxx`
- `GET /membership-accounts/:id`

- `GET /membership-orders`
- `POST /membership-orders`
- `PUT /membership-orders/:id`
- `DELETE /membership-orders/:id`

- `GET /membership-benefit-ledger`
- `POST /membership-benefit-ledger`

- `POST /membership-accounts/reconcile`
  - 用于按当前日期检查自动延续、自动清零

`/load-all` 需要新增：

- `membershipPlans`
- `membershipAccounts`
- `membershipOrders`
- `membershipBenefitLedger`
- `membershipAccountEvents`

---

## 9. 权限规则

管理员：

- 可看全部会员金额、购买记录、赠送权益、作废记录。

教练：

- 第一版不看会员管理数据。
- `load-all` 给教练时，会员相关数组默认不返回，避免暴露财务信息。

未来用户端：

- 只能看自己的会员摘要和可用权益，不看后台备注和经办人。

---

## 10. 文件改动地图

预计修改：

- `api/index.js`
  - 新增会员表常量
  - 新增会员 CRUD
  - 扩展 `load-all`
  - 扩展 `courts.history` 财务规则
  - 新增会员账户 reconcile 规则

- `public/index.html`
  - 订场用户列表新增会员列
  - 订场用户详情新增会员区块
  - 新增会员管理页面
  - 新增开卡/续充/权益消耗弹窗
  - 学员详情新增会员摘要

- `tests/court-finance.test.js`
  - 扩展会员充值、会员折扣消费、会员到期清零计算规则

- 新增 `tests/membership-rules.test.js`
  - 测会员购买、续充重置、自动延续、自动清零、赠送权益扣减

- 可选新增 `tests/membership-view.test.js`
  - 测管理端视图数据聚合

---

## 11. 执行任务

### Task 1: 会员数据模型和后端表定义

**Files:**
- Modify: `api/index.js`
- Test: `tests/membership-rules.test.js`

- [ ] 新增表常量：
  - `ft_membership_plans`
  - `ft_membership_accounts`
  - `ft_membership_orders`
  - `ft_membership_benefit_ledger`
  - `ft_membership_account_events`
- [ ] 在 `load-all` 中返回会员相关数据。
- [ ] 教练角色过滤掉会员财务数据。

### Task 2: 财务主账本扩展

**Files:**
- Modify: `api/index.js`
- Modify: `tests/court-finance.test.js`

- [ ] 扩展 `courts.history`，支持会员充值和会员到期清零。
- [ ] 到期清零必须减少余额，但不能增加累计消费。
- [ ] 会员订场消费支持保存原价、折扣、折后价。

### Task 3: 会员方案管理

**Files:**
- Modify: `api/index.js`
- Modify: `public/index.html`

- [ ] 新增会员方案 CRUD。
- [ ] 支持维护标准档位：白银 / 黄金 / 钻石。
- [ ] 支持维护默认赠送权益模板。

### Task 4: 开卡 / 续充 / 购买记录

**Files:**
- Modify: `api/index.js`
- Modify: `public/index.html`
- Test: `tests/membership-rules.test.js`

- [ ] 新增会员购买记录创建接口。
- [ ] 创建购买记录时同步：
  - 创建或更新会员账户
  - 写订场充值流水
  - 固化赠送权益快照
- [ ] 支持自定义赠送金额和权益次数。
- [ ] 有效期内合规续充时，重置余额有效期。

### Task 5: 赠送权益批次和权益流水

**Files:**
- Modify: `api/index.js`
- Modify: `public/index.html`
- Test: `tests/membership-rules.test.js`

- [ ] 基于购买记录快照汇总可用赠送权益。
- [ ] 权益使用必须指定从哪个购买批次扣。
- [ ] 支持手工补发和手工扣减。
- [ ] 到期后未使用权益自动失效。

### Task 6: 自动延续和自动清零

**Files:**
- Modify: `api/index.js`
- Test: `tests/membership-rules.test.js`

- [ ] 新增会员账户 reconcile 逻辑。
- [ ] 一年期后若有余额，自动切到延续期。
- [ ] 两年期后自动写清零流水并更新状态。
- [ ] 写账户事件日志。

### Task 7: 订场用户页面联动

**Files:**
- Modify: `public/index.html`

- [ ] 订场用户列表新增会员状态列。
- [ ] 订场用户详情新增会员区块。
- [ ] 支持从订场用户详情直接开卡、续充、查看权益。

### Task 8: 学员详情联动

**Files:**
- Modify: `public/index.html`

- [ ] 学员详情展示关联订场账户会员信息。
- [ ] 不在学员页直接做会员主操作。

### Task 9: 会员管理页

**Files:**
- Modify: `public/index.html`

- [ ] 新增会员管理入口。
- [ ] 会员方案、购买记录、会员账户、权益流水四个 Tab。
- [ ] 支持检索某个订场用户的会员全链路数据。

### Task 10: 测试与回归

**Files:**
- Test: `tests/court-finance.test.js`
- Test: `tests/membership-rules.test.js`
- Test: full suite via `npm test`

- [ ] 覆盖首次开卡。
- [ ] 覆盖有效期内高档/同档续充。
- [ ] 覆盖低于原档位续充不重置。
- [ ] 覆盖自动延续。
- [ ] 覆盖自动清零。
- [ ] 覆盖赠送权益到期失效。
- [ ] 覆盖订场用户和学员联动展示。

---

## 12. 风险与处理

### 风险 1：会员余额和订场余额做成两套账

处理：

- 严禁新造一套会员余额主账。
- 余额一律以 `courts.history` 为准。

### 风险 2：赠送权益和余额有效期混在一起

处理：

- 余额按会员账户有效期。
- 赠送权益按购买批次有效期。
- 两套规则分开。

### 风险 3：同档位但成交权益不同

处理：

- 会员方案是模板。
- 成交以购买记录快照为准。

### 风险 4：自动清零需要系统定时任务

处理：

- 第一版采用“懒执行 reconcile”。
- 在 `load-all` 和会员相关写操作前后做检查。
- 先保证规则正确，再决定是否引入定时任务。

### 风险 5：会员和学员主体混乱

处理：

- 会员主挂订场用户。
- 学员只展示关联信息。

---

## 13. 第一版验收标准

- 订场用户列表能看出普通 / 储值 / 会员。
- 会员方案可维护标准权益。
- 开卡和续充后，订场账户余额正确增加。
- 同档/高档有效期内续充时，余额有效期能重置。
- 一年到期后，余额未用完时能进入延续期。
- 两年到期后，余额能被自动清零。
- 每次办卡/续充形成独立赠送权益批次。
- 同样 5000 元可以做不同权益快照。
- 赠送权益使用有流水、到期会失效。
- 学员详情能看到关联订场账户的会员摘要。
- 会员和课包权益互不混账。

---

## 14. 推荐实施顺序

1. 先做后端模型和财务主账扩展。
2. 再做会员方案和购买记录。
3. 再做会员账户 reconcile。
4. 再做赠送权益流水。
5. 最后做订场用户页、会员管理页、学员详情联动。

这样能先把账和规则立住，再上界面，避免后面反复返工。
