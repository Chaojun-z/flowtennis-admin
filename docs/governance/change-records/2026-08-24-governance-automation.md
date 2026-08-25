# 2026-08-24 治理自动化门禁

> 文档类型：需求变更记录
> 状态：生效
> 版本：2026-08-24
> 生效日期：2026-08-24
> 最后审查日期：2026-08-25
> 维护人：FlowTennis 项目负责人
> 唯一依据：记录本次治理自动化变更影响面，不替代 `AGENTS.md`、PRD 正本和数据口径正本。
> 替代文档：无

## 风险等级

L3

## 变更文件

- AGENTS.md
- config/governance-automation.json
- package.json
- docs/README.md
- docs/governance/治理总览.md
- docs/governance/文档状态清单.md
- docs/governance/文档维护规范.md
- docs/governance/自动化治理门禁说明.md
- docs/governance/最终治理收口说明.md
- docs/governance/仓库根目录治理.md
- scripts/governance-automation-guard.js
- tests/governance-automation-guard.test.js
- tests/ci-guard-workflow.test.js
- docs/governance/测试与发布流程.md
- docs/prd/source/14-变更记录与决策记录.md

## 影响页面

- 无，不改管理后台页面。

## 影响接口

- 无，不改业务接口。

## 影响表

- 无，不写数据库。

## 影响指标

- 无，不改业务指标和财务口径。

## 测试映射

- node tests/governance-automation-guard.test.js
- node tests/ci-guard-workflow.test.js
- npm run guard:governance-automation
- npm run guard:test-inventory
- npm run guard:release

## 决策同步

- 同步目标：`docs/prd/source/14-变更记录与决策记录.md`
- 同步标记：`AUTO-SYNC-PRD-DECISIONS`
- 同步方式：`npm run governance:record` 自动更新 PRD 决策记录

## 异常豁免

- 无

## 事故反馈闭环

- 本次不是线上事故修复。
- 本次新增治理自动化门禁，防止后续只写文档、不接入自动流程。
- 本次把决策同步、例外审批自动化和事故闭环自动化接入现有治理门禁。
- 本次把仓库根目录治理接入自动检查，防止一级目录继续无序增长。

## 发布后核验

- 本次只改治理脚本、配置和文档，不涉及线上页面或数据库。
- 真实发布后核验命令已提供：`npm run guard:post-release`。
- `guard:post-release` 严格模式需要真实接口地址和管理员凭据；本次本地和 CI 发布门禁不配置真实线上地址，不把 `guard:api-smoke` 的未配置结果当成线上接口已验收。
