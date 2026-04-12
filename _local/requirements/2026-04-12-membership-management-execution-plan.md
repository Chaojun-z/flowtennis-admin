# 订场会员管理重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不推翻现有会员后端账务逻辑的前提下，完成会员模块的页面结构重构、入口隔离、交互简化和规则口径统一。

**Architecture:** 保留现有会员数据模型与 `courts.history` 主账逻辑，优先重构 `public/index.html` 中的页面组织、弹窗结构、状态映射和文案提示；后端仅补充必要的返回字段、校验和状态辅助，不新增独立权益批次表。补发权益一期继续沿用“挂到已有购买批次的权益流水”实现。

**Tech Stack:** 单页 HTML（`public/index.html`）、Vercel Serverless Function（`api/index.js`）、Node 原生测试（`tests/membership-*.test.js`、`tests/court-finance.test.js`）。

---

## 1. 文件范围

### 1.1 核心改动文件

**前端**
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`

**后端**
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js`

**测试**
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-rules.test.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/court-finance.test.js`

**需求文档**
- Reference: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/_local/requirements/2026-04-12-membership-management-formal-requirements.md`

### 1.2 改动原则

1. 一期不引入新的会员表。
2. 一期不改 `courts.history` 的主账定位。
3. 一期不把补发权益改造成独立批次表。
4. 所有会员操作都从“会员账户详情”发起，不再从“编辑订场用户”发起。
5. 所有规则展示以现有后端真实逻辑为准，尤其是：
   - `validUntil = 购买日 + 12个月`
   - `hardExpireAt = 购买日 + 24个月`
   - 低档续充允许，但不重置有效期

---

## 2. 实施拆分

### Task 1: 统一规则口径与前端展示词汇

**Files:**
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js`

- [ ] **Step 1: 补充前端统一文案函数**

在 `public/index.html` 中整理并统一以下前端文案能力：

1. 会员展示状态文案
2. “即将到期”展示态
3. “是否重置有效期”的提示文案
4. “余额来源于 courts.history”的只读提示文案

新增或整理的辅助函数建议：

```js
function membershipDisplayStatus(account){
  if(!account)return '未开卡';
  if(account.status==='voided')return '已作废';
  if(account.status==='cleared')return '已清零';
  if(account.status==='extended')return '延续期';
  if(account.status==='active' && account.validUntil && daysBetween(today(), account.validUntil) <= 30){
    return '30天内到期';
  }
  return membershipStatusText(account.status);
}

function membershipValidityHint(account){
  if(!account)return '暂无会员账户';
  return `余额有效期至 ${account.validUntil || '—'}，最晚清零 ${account.hardExpireAt || '—'}`;
}
```

- [ ] **Step 2: 删除前端中与真实代码不一致的错误提示**

重点清理：

1. `续充后全部余额按最新充值日期重新计算 2 年`
2. 把所有“购买即 2 年有效”的说法改为：
   - `余额有效期按购买日起算 12 个月`
   - `若到期时仍有余额，可自动进入延续期，最长至 24 个月`
3. 把“重新开卡适用于 expired”统一改为基于一期状态口径：`voided / cleared`

- [ ] **Step 3: 更新视图测试断言**

更新 `/tests/membership-view.test.js` 中依赖旧文案的断言，确保测试反映新口径，而不是旧口径。

重点调整断言方向：

1. 保留“会员购买流程必须展示有效期规则”
2. 但改成校验新的 12/24 个月口径
3. 增加“余额来自 courts.history”的可见提示断言

- [ ] **Step 4: 运行前端视图测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js
```

Expected:

```text
membership view tests passed
```

---

### Task 2: 订场用户编辑与会员操作彻底隔离

**Files:**
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js`

- [ ] **Step 1: 重构订场用户列表操作入口**

在 `renderCourts()` 中把当前单一齿轮入口拆成两个入口：

1. `查看账户`
2. `编辑资料`

目标结构：

```html
<td style="text-align:right">
  <button class="abtn" onclick="openCourtMembershipPanel('${u.id}')">查看账户</button>
  <button class="abtn" onclick="openCourtModal('${u.id}')">⚙️</button>
</td>
```

要求：

1. `查看账户` 明确是会员入口
2. `⚙️` 只代表资料编辑
3. 两个入口视觉上不能混淆

- [ ] **Step 2: 从 `openCourtModal()` 中移除会员操作区**

删除当前 `courtMembershipDetailHtml(r)` 在资料弹窗中的嵌入式操作区。

允许保留的内容：

1. 可选的只读会员摘要
2. 一条跳转链接：`查看会员账户`

禁止保留：

1. 开通会员
2. 续充会员
3. 消耗权益
4. 补发权益
5. 作废会员
6. 最近购买记录列表
7. 权益操作按钮组

- [ ] **Step 3: 新增独立会员账户详情容器**

在 `public/index.html` 中为会员账户详情增加独立容器，优先使用当前统一弹窗体系，不单独引入复杂组件。

一期建议：

1. 继续复用现有 overlay/modal
2. 但用新的 `openCourtMembershipPanel(courtId)` 渲染独立内容
3. 不与 `openCourtModal()` 混用

- [ ] **Step 4: 更新测试，禁止资料弹窗出现会员操作按钮**

新增或修改测试断言，校验：

1. 会员操作入口只在账户详情出现
2. `编辑订场用户` 弹窗不再包含 `开通会员`、`续充会员`、`消耗权益`、`补发权益`

- [ ] **Step 5: 运行视图测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js
```

Expected:

```text
membership view tests passed
```

---

### Task 3: 会员管理首页改成“会员账户总览”

**Files:**
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js`

- [ ] **Step 1: 把会员页默认 tab 改为 accounts**

当前默认值：

```js
let membershipTab='plans';
```

改为：

```js
let membershipTab='accounts';
```

- [ ] **Step 2: 重构 `renderMemberships()` 的首页结构**

当 `membershipTab==='accounts'` 时，渲染新的主视角布局：

1. 顶部指标卡
2. 搜索与状态筛选
3. 会员账户总览表
4. 辅助入口按钮：方案配置 / 全局购买记录 / 权益流水

账户总览表固定字段：

1. 订场用户
2. 当前方案
3. 会员状态
4. 当前余额
5. 当前折扣
6. 权益摘要
7. 余额有效期
8. 操作

- [ ] **Step 3: 缩弱其他 tab 的主导航权重**

一期保留：

1. 会员方案
2. 会员购买
3. 会员账户
4. 赠送权益

但首页的第一视觉要是账户总览，不再是方案表。

可采用方式：

1. 默认打开 `accounts`
2. 保留 tab，但右上角加辅助入口按钮
3. `新增会员方案` 按钮仅在 `plans` tab 显示

- [ ] **Step 4: 增加风险展示态**

在首页列表中加入派生态：

1. `30天内到期`
2. `延续期`
3. `已清零`
4. `已作废`

注意：

1. `30天内到期` 是展示态，不要求改数据库状态
2. 依赖 `validUntil` 计算即可

- [ ] **Step 5: 更新视图测试**

重点新增断言：

1. 默认主视角是 `会员账户`
2. 首页展示指标卡
3. `新增会员方案` 不再在所有 tab 常驻出现

- [ ] **Step 6: 运行视图测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js
```

Expected:

```text
membership view tests passed
```

---

### Task 4: 会员账户详情重构为单用户操作中心

**Files:**
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js`

- [ ] **Step 1: 新增账户详情渲染函数**

新增类似以下函数：

```js
function renderMembershipAccountPanel(court){
  const account = courtMembershipAccount(court.id);
  const finance = courtFinanceLocal(court || { history: [] });
  const orders = account ? membershipOrdersForAccount(account.id) : [];
  return `...`;
}
```

固定分为 4 个区块：

1. 当前状态
2. 权益批次
3. 最近购买记录
4. 操作按钮区

- [ ] **Step 2: 权益批次按购买批次展示**

不要只展示“合计 20 次”。

需要在现有 `membershipBenefitSummaryForOrder()`、`membershipBenefitRowsForAccount()` 基础上，新增按 order 分组的展示函数。

建议新增：

```js
function membershipBenefitBatchCardsHtml(account){
  const orders = membershipOrdersForAccount(account.id);
  return orders.map(order => {
    const items = membershipBenefitSummaryForOrder(order);
    return `...`;
  }).join('');
}
```

每张卡片展示：

1. 购买日期
2. 方案名
3. 批次到期日
4. 每项权益的 `剩余 / 原始赠送`
5. 若该项有正向补发，显示“含补发 +N”

- [ ] **Step 3: 最近购买记录只显示 3 条**

在账户详情内不再塞满全部历史，只显示最近 3 条：

1. 购买日期
2. 方案名
3. 实收金额
4. 赠送金额
5. 是否重置有效期
6. 备注

更多历史交给全局购买记录页。

- [ ] **Step 4: 操作按钮按状态动态显示**

新增按钮显示规则函数，例如：

```js
function membershipActionVisibility(account){
  if(!account) return { firstOpen: true };
  if(account.status === 'voided' || account.status === 'cleared') return { reopen: true, ledger: true };
  return { renew: true, consume: true, supplement: true, ledger: true, void: true };
}
```

要求：

1. 未开卡只显示 `首次开卡`
2. 正常/延续期显示 `续充 / 消耗 / 补发 / 查看流水 / 作废`
3. 已作废/已清零只显示 `重新开卡 / 查看流水`

- [ ] **Step 5: 更新视图测试**

新增断言：

1. 账户详情固定有 4 个区块
2. 权益批次按购买批次展示
3. 操作按钮按状态变化

- [ ] **Step 6: 运行视图测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js
```

Expected:

```text
membership view tests passed
```

---

### Task 5: 开卡/续充/重新开卡弹窗改为“先预览后输入”

**Files:**
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js`

- [ ] **Step 1: 拆分统一购买弹窗的语境**

当前 `openMembershipOrderModal(courtId)` 需要改成至少支持：

1. `first_open`
2. `renew`
3. `reopen`

建议签名：

```js
function openMembershipOrderModal(courtId, mode='renew'){
  ...
}
```

标题与首屏说明按 mode 变化。

- [ ] **Step 2: 为购买弹窗新增预览数据组装函数**

新增前端预览函数，例如：

```js
function membershipOrderPreview({ court, account, plan, rechargeAmount, bonusAmount, purchaseDate }){
  return {
    nextDiscountText: '8折',
    resetsValidity: true,
    nextValidUntil: '2027-04-11',
    nextHardExpireAt: '2028-04-11',
    keepsExistingBenefits: true,
    warning: ''
  };
}
```

注意：

1. 预览必须遵循现有后端逻辑
2. 低档续充时必须计算出 `resetsValidity = false`
3. 当前无账户时是首次开卡

- [ ] **Step 3: 调整弹窗首屏内容**

首屏必须先展示：

1. 当前状态摘要
2. 本次会发生什么
3. 是否重置有效期
4. 折扣是否变化
5. 原有权益是否保留
6. 新增权益是什么

然后再放：

1. 购买日期
2. 实收金额
3. 折叠的一次性调整区
4. 备注

- [ ] **Step 4: 保留一次性调整，但默认折叠**

当前一次性调整字段不要删，只改交互：

1. 默认收起
2. 增加说明：`仅影响本次购买，不回写会员方案`
3. 保留当前结构化权益调整字段

- [ ] **Step 5: 明确低档续充的危险提示**

低档续充时，预览区必须红色警示展示：

1. 折扣将改变
2. 原有权益保留
3. 本次不重置有效期
4. 若要保持现有有效期重置资格，请选择不低于原档位的方案

确认按钮文案改为：

```text
我了解折扣和有效期变化，确认续充
```

- [ ] **Step 6: 更新视图测试**

新增断言：

1. 购买弹窗必须展示“会发生什么”
2. 低档续充必须展示“不重置有效期”
3. 一次性调整仍存在，但不再是第一视觉区块

- [ ] **Step 7: 运行视图测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js
```

Expected:

```text
membership view tests passed
```

---

### Task 6: 消耗权益与补发权益交互重构

**Files:**
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-rules.test.js`

- [ ] **Step 1: 强化消耗权益弹窗的批次预览**

当前 `openMembershipBenefitActionModal()` 仅展示权益名称与次数，需要补充：

1. 当前总剩余
2. 将优先扣减的批次
3. 如果当前批次不足，将继续扣下一批

建议新增辅助函数：

```js
function membershipBenefitConsumePreview(account, benefitCode, count){
  return {
    totalRemaining: 6,
    allocations: [
      { membershipOrderId: 'mord-1', benefitValidUntil: '2027-04-11', delta: 1 }
    ]
  };
}
```

可直接复用前端已有的 order + ledger 汇总逻辑做预估。

- [ ] **Step 2: 保持补发权益一期归属已有购买批次**

`supplement` 弹窗继续保留：

1. 归属购买批次选择器
2. 原因
3. 次数

但文案必须明确：

```text
本次补发会记入所选购买批次的权益调整，不会生成新的购买记录
```

- [ ] **Step 3: 调整权益卡片上的操作文案**

建议将当前：

1. `消耗 1 次`
2. `补发`
3. `查看流水`

优化为：

1. `消耗`
2. `补发`
3. `查看明细`

避免按钮文案过长，数量输入放进弹窗。

- [ ] **Step 4: 测试覆盖“最早到期优先扣减”**

保留并增强 `/tests/membership-rules.test.js` 中对 `allocateMembershipBenefitUsage()` 的断言，确保前端交互升级不影响后端规则。

可复用已有断言：

```js
assert.deepStrictEqual(
  allocatedUsage.map(x => ({ membershipOrderId: x.membershipOrderId, delta: x.delta })),
  [
    { membershipOrderId: 'mord-1', delta: -2 },
    { membershipOrderId: 'mord-2', delta: -1 }
  ]
);
```

- [ ] **Step 5: 运行规则与视图测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-rules.test.js
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js
```

Expected:

```text
membership rules tests passed
membership view tests passed
```

---

### Task 7: 作废会员与重新开卡的状态口径收紧

**Files:**
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-rules.test.js`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js`

- [ ] **Step 1: 明确前端“重新开卡”的可见条件**

前端按一期口径处理：

1. `voided`
2. `cleared`

不把 `expired` 作为主状态分支。

- [ ] **Step 2: 收紧作废后的前端展示**

作废后账户详情必须显示：

1. 状态 = 已作废
2. 折扣失效
3. 权益不可再使用
4. 只剩 `重新开卡 / 查看流水`

- [ ] **Step 3: 后端补齐作废操作的账户事件记录**

当前 `voidMembership(courtId)` 只是简单 `PUT /membership-accounts/:id` 改状态。

一期建议在后端增加：

1. 作废原因字段写回
2. `membership_account_events` 写一条 `voided` 事件

不要求新增复杂审批，只做留痕。

- [ ] **Step 4: 测试覆盖作废后的按钮与展示逻辑**

补充测试：

1. 作废后视图按钮变化
2. 作废后重新开卡入口出现

- [ ] **Step 5: 运行规则与视图测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-rules.test.js
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js
```

Expected:

```text
membership rules tests passed
membership view tests passed
```

---

### Task 8: 会员方案表单做运营化整理

**Files:**
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js`

- [ ] **Step 1: 隐藏技术字段，保留运营字段**

现有 `openMembershipPlanModal()` 中：

1. 隐藏 `档位代码` 的主展示优先级
2. 把 `折扣` 改为选项式输入，而不是直接要求填 `0.8`
3. 保留结构化权益字段和指定教练范围

一期不删除 `tierCode` 字段，但默认自动生成或弱化展示。

- [ ] **Step 2: 增加实时预览卡**

预览卡展示：

1. 方案名称
2. 充值金额
3. 赠送金额
4. 折扣
5. 赠送权益摘要

要求：

1. 仅用于辅助理解
2. 不引入新的状态存储

- [ ] **Step 3: 方案页文案统一**

明确：

1. 有效期不是方案配置项
2. 权益有效期固定为 12 个月
3. 余额最长按当前系统规则至 24 个月

- [ ] **Step 4: 更新视图测试**

保留并增强断言：

1. 结构化权益字段依然存在
2. 折扣不再要求直接输入小数
3. 方案表单提供实时预览

- [ ] **Step 5: 运行视图测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js
```

Expected:

```text
membership view tests passed
```

---

### Task 9: 购买记录与权益流水降级为辅助审计页

**Files:**
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/public/index.html`
- Modify: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js`

- [ ] **Step 1: 精简全局购买记录页字段**

全局购买记录页保留：

1. 用户
2. 方案
3. 实收金额
4. 赠送金额
5. 折扣
6. 购买日期
7. 是否重置有效期
8. 当次权益摘要
9. 状态

不再强调它是主操作入口。

- [ ] **Step 2: 精简全局权益流水页定位**

保留：

1. 时间
2. 用户
3. 购买批次
4. 权益类型
5. 变动数量
6. 动作
7. 原因

并增加说明：

```text
此页面仅用于审计与追溯，不用于日常操作
```

- [ ] **Step 3: 更新视图测试**

新增断言：

1. 审计页存在
2. 但会员首页主视角不是审计页

- [ ] **Step 4: 运行视图测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js
```

Expected:

```text
membership view tests passed
```

---

### Task 10: 回归验证与收尾

**Files:**
- Test: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js`
- Test: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-rules.test.js`
- Test: `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/court-finance.test.js`

- [ ] **Step 1: 跑会员视图测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-view.test.js
```

Expected:

```text
membership view tests passed
```

- [ ] **Step 2: 跑会员规则测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/membership-rules.test.js
```

Expected:

```text
membership rules tests passed
```

- [ ] **Step 3: 跑订场财务测试**

Run:

```bash
node /Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/tests/court-finance.test.js
```

Expected:

```text
court finance tests passed
```

- [ ] **Step 4: 手工检查 8 个关键场景**

手工核对以下场景：

1. 仅修改资料，不出现会员操作
2. 首次开卡
3. 正常续充
4. 低档续充
5. 重新开卡
6. 消耗权益
7. 补发权益
8. 作废会员

检查要点：

1. 入口是否清晰
2. 预览区是否解释清楚
3. 是否出现与真实后端规则矛盾的文案
4. 操作完成后，首页、账户详情、订场用户列表是否同步更新

---

## 3. 页面改造清单

### 3.1 订场用户列表

1. 新增 `查看账户` 按钮
2. 保留 `⚙️` 仅作资料编辑
3. 列表中的会员状态继续保留，但不在此页发起会员动作

### 3.2 编辑订场用户弹窗

1. 删除会员操作按钮
2. 删除嵌入式权益列表
3. 删除嵌入式最近购买记录
4. 如需保留会员信息，仅允许只读摘要 + 跳转入口

### 3.3 会员管理首页

1. 默认进入 `会员账户`
2. 顶部新增指标卡
3. 增加状态筛选
4. 将方案/购买/流水降为辅助入口

### 3.4 会员账户详情

1. 独立容器
2. 固定 4 区块
3. 权益按批次展示
4. 操作按钮按状态切换

### 3.5 会员购买弹窗

1. 增加 mode
2. 增加预览区
3. 一次性调整默认折叠
4. 低档续充警告增强

### 3.6 权益操作弹窗

1. 消耗前展示批次扣减预估
2. 补发明确归属旧批次
3. 查看流水改成明细/审计视角

### 3.7 会员方案页

1. 技术字段弱化
2. 运营字段清晰化
3. 增加实时预览

---

## 4. 接口改造清单

### 4.1 一期必须补的后端能力

1. `PUT /membership-accounts/:id`
   - 支持更完整的作废信息写入
   - 支持写入作废原因
2. `GET /load-all`
   - 无需改数据结构，但前端会重新组织展示
3. `POST /membership-orders`
   - 保持现有创建逻辑
   - 前端需消费 `warning`
4. `POST /membership-benefit-ledger`
   - 保持现有模型
   - 补发继续要求带 `membershipOrderId`

### 4.2 一期不做的接口

1. 不新增 `membership-preview` 接口
2. 不新增独立 `benefit-batches` 接口
3. 不新增补发独立批次接口

### 4.3 前端预览处理策略

一期采用前端派生预览：

1. 续充预览由前端依据当前账户 + 方案 + 现有后端规则推导
2. 最终提交仍由后端校验
3. 如果后端返回 `warning`，前端应在成功提示中保留提示信息

---

## 5. 风险清单

1. **规则文案风险**
   - 风险：前端展示口径与后端真实逻辑不一致
   - 规避：所有有效期和续充规则以 `buildMembershipPurchase()` 和 `reconcileMembershipAccounts()` 为准

2. **补发模型风险**
   - 风险：产品文档把补发误描述为新批次
   - 规避：一期明确继续归属已有购买批次

3. **单文件改动风险**
   - 风险：`public/index.html` 过大，改动易相互污染
   - 规避：每个任务只修改单一职责函数，避免顺手重构全文件

4. **历史数据兼容风险**
   - 风险：历史订单可能缺失 `benefitSnapshot`
   - 规避：沿用当前 `normalizeMembershipOrderViewRecord()` fallback 逻辑，测试已覆盖

---

## 6. 执行顺序建议

推荐执行顺序：

1. Task 1 统一口径
2. Task 2 隔离订场用户编辑与会员操作
3. Task 3 重构会员首页
4. Task 4 重构账户详情
5. Task 5 重构开卡/续充/重新开卡弹窗
6. Task 6 重构权益操作
7. Task 7 收紧状态口径与作废
8. Task 8 优化方案配置
9. Task 9 收敛审计页
10. Task 10 全量回归

---

## 7. 完成标准

实施完成后，必须满足：

1. 管理员不再从资料编辑弹窗误触会员操作
2. 会员首页默认就是账户视角
3. 每个会员动作在保存前都能看懂“会发生什么”
4. 低档续充的折扣和有效期变化被明确告知
5. 权益扣减按最早到期批次规则展示清楚
6. 补发交互诚实反映现有模型
7. 一期不引入新的底层账务冲突
