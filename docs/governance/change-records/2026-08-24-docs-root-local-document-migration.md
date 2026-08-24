# 2026-08-24 docs-root-local-document-migration

> 文档类型：需求变更记录
> 状态：生效
> 版本：2026-08-24
> 生效日期：2026-08-24
> 最后审查日期：2026-08-24
> 维护人：FlowTennis 项目负责人
> 唯一依据：记录本次变更影响面，不替代 PRD 和口径正本。
> 替代文档：无

## 风险等级

L4

## 变更文件

- AGENTS.md
- config/finance-baseline.v2.json
- config/governance-automation.json
- docs/README.md
- docs/architecture/environments/dev-staging-prod环境建设方案.md
- docs/architecture/reference/2026-05-13-5端与载体边界固化.md
- docs/architecture/reference/2026-05-14-真实载体与正式上传发布基线固化.md
- docs/architecture/reference/api-index高危链路解耦实施方案.md
- docs/architecture/reference/代码结构与修改入口说明.md
- docs/archive/2026-legacy/2026-05-11-staging接线与首轮快照准备清单.md
- docs/archive/2026-legacy/2026-05-12-主干正式收官执行清单与风险清单.md
- docs/archive/2026-legacy/2026-05-12-第二阶段总计划与专项适用性判断.md
- docs/archive/2026-legacy/2026-05-12-第二阶段总领导线程交接稿.md
- docs/archive/2026-legacy/2026-05-12-约球staging专项最小验收规则.md
- docs/archive/2026-legacy/2026-05-13-完整业务链路验收规则.md
- docs/archive/2026-legacy/2026-05-13-执行线程通用补充模板-完整链路验收.md
- docs/archive/2026-legacy/2026-05-13-统一验收回执模板.md
- docs/archive/2026-legacy/2026-05-15-第二阶段总收官正式结论.md
- docs/archive/2026-legacy/2026-05-17-第二阶段新总领导交接.md
- docs/archive/2026-legacy/主干清场与分支恢复方案.md
- docs/archive/2026-legacy/已知限制与风险清单.md
- docs/archive/2026-legacy/日常开发与发布治理方案.md
- docs/business-rules/baselines/2026-06-02-会员经营可信基线.md
- docs/business-rules/baselines/2026-06-04-订场用户经营可信基线.md
- docs/business-rules/reference/平台业务逻辑与字段关系说明.md
- docs/business-rules/reference/平台页面功能总览.md
- docs/business-rules/reference/教学售卖链路治理说明.md
- docs/business-rules/reference/核心表关系图.md
- docs/business-rules/reference/统一教学履约模型.md
- docs/business-rules/reference/课包余额去前台化改造方案.md
- docs/governance/change-records/2026-08-24-docs-root-local-document-migration.md
- docs/operations/finance/reference/历史收入剩余确认说明.md
- docs/operations/finance/reference/历史收入明细导入执行计划.md
- docs/operations/finance/reference/财务与权益统一执行计划.md
- docs/operations/finance/reference/财务与权益统一规划-v2.md
- docs/operations/finance/reference/财务中心重组方案-统一总览总账明细.md
- docs/operations/finance/reference/财务模块整体架构方案.md
- docs/operations/finance/财务基准数字确认表.md
- docs/operations/reference/init触发条件与生产自动写入确认.md
- docs/operations/reference/生产数据变更入口清单.md
- docs/operations/reference/运营使用手册.md
- docs/operations/staging/staging数据维护SOP.md
- docs/prd/drafts/2026-06-18-经营分析模块需求草案.md
- docs/prd/source/00-需求池/FlowTennis 需求池维护文档-v2.xlsx
- docs/prd/source/00-需求池/FlowTennis 需求池维护文档.xlsx
- docs/reports/audits/2026-05-10-全面技术架构与代码诊断报告.md
- docs/reports/audits/2026-05-12-第一阶段正式收官报告.md
- docs/reports/audits/2026-07-14-线索当前状态只读体检表.md

## 影响页面

- 待补：说明影响哪些页面；不影响则写“无”

## 影响接口

- 待补：说明影响哪些接口；不影响则写“无”

## 影响表

- 待补：说明影响哪些表；不影响则写“无”

## 影响指标

- 待补：说明影响哪些指标；不影响则写“无”

## 测试映射

- npm run guard:governance-automation
- npm run guard:test-inventory
- npm test
- npm run guard:finance
- npm run guard:release

## 异常豁免

- 无

## 事故反馈闭环

- 本次非线上事故修复

## 发布后核验

- 不涉及真实发布后核验
