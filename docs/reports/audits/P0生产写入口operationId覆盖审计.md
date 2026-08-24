# P0 生产写入口 operationId 覆盖审计

审计日期：2026-06-14

审计范围：只读检查 `api/index.js`、`scripts/*import*.js`、`scripts/repair-*.js`。本次未改业务逻辑，未连接线上，未写库。

## 结论

1. 主经营写入口已经有一批 `operationId / batchId` 基础能力：课包购买、排课消课、会员储值、会员权益流水、订场用户新增/编辑流水。
2. 但当前 `withOperationTrace()` 会保留旧记录已有的 `operationId / batchId`，所以“编辑/作废已有记录”不一定能按本次操作重新追踪。
3. 当前 `financeNormalizedRows` 没有透传来源记录的 `operationId / batchId`，所以 `validate:finance-operation --operation-id` 可以找到带 trace 的业务表记录，但真实财务变化摘要多数仍不能按 operationId 精准汇总。
4. B1 的 `rollback-finance-operation-dry-run` 可以识别带 trace 的表记录和 `ft_courts.history`，但对没有 trace、被删除、或旧 trace 未被覆盖的记录无法可靠识别。
5. 导入脚本和大多数历史 repair 脚本缺少统一批次追踪，B4 应优先补。

## 工具可识别前提

| 工具 | 可识别前提 | 当前限制 |
|---|---|---|
| `validate:finance-operation --operation-id/--batch-id` | after 快照中的表记录或 `financePage.normalizedRows` 自带 `operationId / batchId` | 真实 `financeNormalizedRows` 当前未透传 trace，财务变化摘要可能为 0 |
| `rollback-finance-operation-dry-run` | 快照表记录、`ft_courts.history` 或 `financePage.normalizedRows` 自带 `operationId / batchId` | 被真实删除的记录、未打 trace 的导入/修数、旧 trace 未被覆盖的更新无法靠它定位 |

## 覆盖清单

| 写入口名称 | 文件路径 | 触达高危表 | 是否已有 operationId / batchId | 是否可被 `validate --operation-id` 校验 | 是否可被 dry-run 识别 | 缺口 | 优先级 |
|---|---|---|---|---|---|---|---|
| 课包购买创建 `POST /purchases` | `api/index.js:10060` | `ft_purchases`, `ft_entitlements` | 是。创建 `package-purchase` trace，购买记录经 `buildPurchaseRecord()` 带 trace；权益由 purchase 派生，当前会继承 trace | 表级可找到；财务摘要受 `financeNormalizedRows` 未透传 trace 限制 | 可识别 `ft_purchases`, `ft_entitlements` | 财务行未透传 trace，无法按 operationId 汇总课包收款现金/递延变化 | P0 |
| 课包购买编辑 `PUT /purchases/:id` | `api/index.js:10061` | `ft_purchases`, `ft_entitlements` | 部分。创建 `package-purchase-edit` trace，但 `withOperationTrace()` 保留旧 trace，已有记录可能不写入本次 operationId | 对已有旧 trace 记录不可靠；仅无旧 trace 时可找到 | 同左 | 编辑已有记录时需要记录本次操作 trace，不能只保留创建时 trace | P1 |
| 课包购买作废 `DELETE /purchases/:id` | `api/index.js:10061` | `ft_purchases`, `ft_entitlements`, `ft_entitlement_ledger` | 部分。新增作废 ledger 有 trace；已存在的 purchase/entitlement 可能保留旧 trace | 可找到作废 ledger；不一定能找到被作废的原 purchase/entitlement | 可识别新增 ledger；原记录不可靠 | 作废动作应有独立可追踪事件，并能关联原 purchase/entitlement | P0 |
| 排课创建消课 `POST /schedule` | `api/index.js:10369-10436` | `ft_schedule`, `ft_entitlements`, `ft_entitlement_ledger`, `ft_courts`, `ft_financial_ledger` | 是。schedule、权益扣减、权益流水、储值扣款 history 使用同一 trace；补场地费 `ft_financial_ledger` 未见 trace | 表级可找到；财务摘要受 normalized rows 未透传限制 | 可识别 schedule、entitlement、ledger、courts.history；不识别 `ft_financial_ledger` | `ft_financial_ledger` 不在快照/工具扫描范围；财务行未透传 trace | P0 |
| 排课编辑/取消消课 `PUT /schedule/:id` | `api/index.js:10452-10589` | `ft_schedule`, `ft_entitlements`, `ft_entitlement_ledger`, `ft_courts`, `ft_financial_ledger` | 部分。新增 ledger/history 有 trace；旧 schedule 若已有创建 trace，可能不覆盖成本次 trace | 可找到新增 ledger/history；旧 schedule 更新不可靠 | 可识别新增 ledger/history；旧 schedule 不可靠 | 需要本次操作事件模型，避免更新旧记录时丢失本次 operationId | P1 |
| 排课删除 `DELETE /schedule/:id` | `api/index.js:10591-10625` | `ft_schedule`, `ft_entitlement_ledger`, `ft_courts` | 部分。仅储值退回 history 使用 trace；删除 schedule/ledger 本身无 after 记录可追 | 不能可靠校验删除本身；只能看储值冲正 history | 只能识别储值冲正 history | 删除动作需要审计事件或软删除 trace，否则快照 after 无法定位被删记录 | P1 |
| 会员储值开卡/续充 `POST /membership-orders` | `api/index.js:10119-10168` | `ft_membership_accounts`, `ft_membership_orders`, `ft_courts`, `ft_membership_benefit_ledger` | 是。`membership-recharge` trace 写入 account/order/historyRow，赠送权益流水从 order 继承 trace | 表级可找到；财务摘要受 normalized rows 未透传限制 | 可识别 account/order/courts.history/benefit ledger | 财务行未透传 trace；已有 account 续充时 account 记录会被本次 trace 覆盖需确认是否保留历史事件 | P0 |
| 会员购买记录编辑/作废 `PUT/DELETE /membership-orders/:id` | `api/index.js:10170-10175` | `ft_membership_orders` | 否。直接写订单更新/作废，无 operation trace | 不可按 operationId 校验 | 不可识别 | 会员订单作废影响财务展示口径，必须补 trace 或事件 | P0 |
| 会员账户作废 `PUT /membership-accounts/:id` | `api/index.js:10085-10117` | `ft_membership_accounts`, `ft_membership_account_events` | 部分。event 带 trace；account 本身没有用 trace 写入 | 可找到 event，但 `ft_membership_account_events` 不在每日快照表里；account 不可靠 | dry-run 当前不扫描 `ft_membership_account_events` | 账户状态变更本身和事件表需要统一进入快照/工具识别范围 | P1 |
| 会员订场储值扣款：排课储值扣款 | `api/index.js:1753-1877`, `api/index.js:10396-10431`, `api/index.js:10467-10497`, `api/index.js:10538-10577` | `ft_courts`, `ft_schedule` | 是。新增 `ft_courts.history` 消费/冲正带同一 schedule operationTrace | 表级可找到 `ft_courts.history`；财务摘要受 normalized rows 未透传限制 | 可识别 `ft_courts.history` | 财务行未透传 trace；schedule 旧记录更新仍可能保留旧 trace | P0 |
| 散客订场流水：订场用户新增/编辑 | `api/index.js:9896-9908`, `api/index.js:10016` | `ft_courts` | 部分。history 中新增/变化的充值/消费/退款/冲正会打 `court-booking` trace | 可找到 `ft_courts.history`；财务摘要受 normalized rows 未透传限制 | 可识别 `ft_courts.history` | 老历史行、非财务行、无 history 变更的资料编辑不进入 trace；财务行未透传 trace | P0 |
| 散客订场导入 `POST /courts/import` | `api/index.js:9910-9914`, `api/index.js:9172-9187` | `ft_courts` | 否。导入行直接 normalize 后写入 | 不可按 operationId 校验 | 不可识别 | 导入必须统一生成 import operationId/batchId，并给 history 每行打 trace | P0 |
| 订场用户删除/批量删除 | `api/index.js:9915-9918`, `api/index.js:9136-9165`, `api/index.js:10016` | `ft_courts` | 否。直接删除或 inactive 归档，无 trace | 不可按 operationId 校验 | 删除不可识别；归档也无 trace | 删除/归档高风险，需软删除 trace 或审计事件 | P1 |
| 订场用户合并 | `api/index.js:9920-9952`, `api/index.js:8536-8572` | `ft_courts`, `ft_membership_accounts`, `ft_membership_orders`, `ft_membership_benefit_ledger` | 否。合并重写多表 courtId，但无 operation trace | 不可按 operationId 校验 | 不可识别 | 合并会改历史归属和会员关联，必须有 batchId | P1 |
| 订场历史财务迁移 `POST /courts/migrate-finance-legacy` | `api/index.js:9984-10014` | `ft_courts` | 否。生成 legacy history 但无 trace | 不可按 operationId 校验 | 不可识别 | 历史期初导入必须带 migration batchId | P1 |
| 会员账户对账/自动清零 `POST /membership-accounts/reconcile` | `api/index.js:10075-10078`, `api/index.js:9189-9205` | `ft_membership_accounts`, `ft_courts`, `ft_membership_account_events` | 否。自动清零事件和冲正 history 无 trace | 不可按 operationId 校验 | 不可识别 | 自动修正财务余额必须可追踪 | P1 |
| 会员权益流水手工调整/消耗 | `api/index.js:10177-10245` | `ft_membership_benefit_ledger` | 是。学生权益、会员权益消耗、普通权益流水都创建 trace | 可找到 `ft_membership_benefit_ledger`；不一定影响财务现金摘要 | dry-run 可识别该表 | 该类更多是权益，不一定进入财务变化摘要；工具风险提示可后续细化 | P2 |
| 手动课包消课/退回 `POST /entitlements/:id/manual-adjust` | `api/index.js:10259-10290` | `ft_entitlements`, `ft_entitlement_ledger` | 部分。ledger 带 trace；entitlement 旧记录可能保留旧 trace | 可找到 ledger；entitlement 更新不可靠 | 可识别 ledger | 更新旧 entitlement 时本次操作 trace 不可靠 | P1 |
| 约球收款同步 | `api/index.js:8035-8116` | `ft_courts` | 否。match fee history row 无 operationId/batchId | 不可按 operationId 校验 | 不可识别 | 约球收款进入订场财务，应补 trace | P0 |
| 约球退款同步 | `api/index.js:8070-8134` | `ft_courts` | 否。refund history row 无 operationId/batchId | 不可按 operationId 校验 | 不可识别 | 退款/冲正必须优先补 trace | P0 |
| 马包最终导入写入 | `scripts/apply-shunyi_mapo-final-import-20260524.js` | `ft_students`, `ft_purchases`, `ft_entitlements`, `ft_schedule`, `ft_entitlement_ledger`, `ft_courts`, `ft_student_active_entitlement_index` | 否。脚本有 dry-run/--write 和生产实例校验，但未见 operationId/batchId | 不可按 operationId 校验 | 不可识别 | 大批量生产导入必须统一 batchId，并写入所有业务/流水行 | P0 |
| 马包订场历史导入/重复订场修复 | `scripts/repair-shunyi_mapo-court-history-import-20260524.js`, `scripts/repair-shunyi_mapo-duplicate-courts-20260524.js` | `ft_courts` | 否 | 不可按 operationId 校验 | 不可识别 | 订场 history 修复必须给新增/修改 history 打 trace | P0 |
| 老课包专项 repair 脚本 | `scripts/repair-xiaoman-package-20260522.js`, `scripts/repair-yaya-xiaoman-20260522.js`, `scripts/repair-songtiti-package-20260523.js`, `scripts/repair-liqin-package-20260525.js`, `scripts/repair-xiaoxiao-package-20260525.js`, `scripts/repair-course-package-five-students-20260528.js`, `scripts/repair-j-package-20260526.js`, `scripts/repair-small-trial-count-orders-20260606.js` | `ft_purchases`, `ft_entitlements`, `ft_schedule`, `ft_entitlement_ledger`, `ft_student_active_entitlement_index` | 否。多数有 `--write` 和生产实例校验，但未见 operationId/batchId | 不可按 operationId 校验 | 不可识别；删除类更无法识别 | 统一 repair operationId/batchId；删除改为可审计的作废/冲正或额外审计记录 | P1 |
| 新课包流水 repair 脚本 | `scripts/repair-six-package-ledgers-20260601.js` | `ft_purchases`, `ft_entitlements`, `ft_schedule`, `ft_entitlement_ledger`, `ft_student_active_entitlement_index` | 是。`touch()` 写入 `operationId` 和 `batchId` | 表级可找到；财务摘要受 normalized rows 未透传限制 | 可识别写入行；删除行仍不可识别 | 删除行仍需审计；财务行未透传 trace | P1 |
| 权益余额 repair 脚本 | `scripts/repair-package-entitlement-balances-20260601.js` | `ft_entitlements`, `ft_student_active_entitlement_index` | 是。更新 entitlement 写入 `operationId` 和 `batchId` | 表级可找到 | 可识别 `ft_entitlements` | active index 不在 B1/B2 工具范围；不直接形成财务流水摘要 | P2 |
| 只重建 active entitlement index | `scripts/repair-student-active-entitlement-index-20260522.js` | `ft_student_active_entitlement_index` | 否 | 不适用财务 operation 校验 | 不适用当前 dry-run | 不直接影响财务口径，但若作为生产写入仍应有批次报告 | P3 |

## B4 建议先补的 1-3 个缺口

1. **P0：让真实 `financeNormalizedRows` 透传 trace。**
   - 覆盖来源：`purchases`、`membershipOrders`、`entitlementLedger`、`schedule`、`ft_courts.history`。
   - 目的：让 `validate:finance-operation --operation-id` 不只列出表记录，还能输出真实现金、已入账、未入账变化。

2. **P0：补约球收款/退款、订场导入、马包导入的 operationId/batchId。**
   - 约球收款/退款直接进入 `ft_courts.history` 财务流水，目前完全无 trace。
   - `POST /courts/import` 和 `scripts/apply-shunyi_mapo-final-import-20260524.js` 是批量生产写入口，目前无法按批次回溯。

3. **P0/P1：补作废/删除/修数入口的独立操作 trace。**
   - 优先：`DELETE /purchases/:id`、`DELETE /membership-orders/:id`、`DELETE /schedule/:id`、订场用户删除/合并。
   - 关键点：不要只依赖 `withOperationTrace()`，因为它会保留旧 trace；作废/删除最好新增审计事件或写入本次操作字段。

## 注意事项

- 本文只描述覆盖状态，不代表这些入口都应该在同一轮修改。
- 后续补 trace 时，不应改变财务口径，只补可追踪字段和必要测试。
- 删除类动作不能只依赖 after 快照，因为记录可能已不存在；应考虑软删除、审计事件或恢复前快照中的删除计划记录。
