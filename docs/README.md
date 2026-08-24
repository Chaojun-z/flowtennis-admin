# FlowTennis 文档总入口

> 文档类型：文档入口
> 状态：生效
> 版本：2026-08-24
> 生效日期：2026-08-24
> 最后审查日期：2026-08-24
> 维护人：FlowTennis 项目负责人
> 唯一依据：本文只负责导航，不覆盖 `AGENTS.md`、PRD 正本和数据口径正本。
> 替代文档：无

这是 FlowTennis 项目的正式文档入口。GitHub 里的正式文档必须从这里进入，不再默认读取 `docs` 根目录里的散落文件。

## 1. 必读顺序

1. `/Users/shaobaolu/Desktop/FlowTennis/AGENTS.md`
2. `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/AGENTS.md`
3. [治理总览](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/governance/治理总览.md)
4. [文档状态清单](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/governance/文档状态清单.md)
5. [PRD 正本入口](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/prd/README.md)
6. [全平台数据口径总表](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/business-rules/FlowTennis全平台数据口径总表.md)
7. [平台核心数据字典](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/business-rules/平台核心数据字典.md)

## 2. 当前目录规范

| 目录 | 用途 | 是否当前规则 |
| --- | --- | --- |
| `docs/governance/` | 治理流程、风险分级、发布门禁、变更记录 | 是 |
| `docs/business-rules/` | 数据口径、业务字典、指标矩阵、页面字段矩阵 | 是 |
| `docs/prd/` | 产品需求、页面需求、验收标准 | 是 |
| `docs/architecture/` | 技术架构、前端标准、账号权限方案 | 是 |
| `docs/operations/` | 财务、发布、修数、回滚、飞书日报等操作流程 | 是 |
| `docs/performance-governance/` | 核心列表性能专项治理 | 是，后续可继续细分 |
| `docs/reports/` | 审计报告、导入报告、复盘记录 | 否，只作记录 |
| `docs/archive/` | 已废弃或被替代的历史方案 | 否，只作历史 |
| `docs/superpowers/` | 早期计划和标准页规格 | 否，只作参考 |
| `docs/ui-reference/` | UI 参考图、页面规格、视觉参考 | 否，只作参考 |

## 3. 新文档放哪里

1. 规则、流程、门禁、变更记录：放 `docs/governance/`。
2. 字段、指标、状态、表关系、业务口径：放 `docs/business-rules/`。
3. 页面需求、验收标准、Roadmap：放 `docs/prd/`。
4. 技术架构、账号权限、前端标准：放 `docs/architecture/`。
5. 生产操作、财务快照、回滚、修数、日报：放 `docs/operations/`。
6. 审计、复盘、一次性报告：放 `docs/reports/`。
7. 已过期旧方案：放 `docs/archive/`。
8. 仍有参考价值、但不能直接当当前规则的旧文档：放对应分类下的 `reference/`。
9. 草案需求：放 `docs/prd/drafts/`。

`docs` 根目录只允许保留 `README.md`。如果新增正式文档放在 `docs/*.md`，`npm run guard:governance-automation` 和发布门禁会失败。

## 4. 当前关键入口

1. [需求变更流程](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/governance/需求变更流程.md)
2. [文档维护规范](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/governance/文档维护规范.md)
3. [风险分级与门禁矩阵](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/governance/风险分级与门禁矩阵.md)
4. [测试与发布流程](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/governance/测试与发布流程.md)
5. [生产数据变更与回滚流程](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/governance/生产数据变更与回滚流程.md)
6. [自动化治理门禁说明](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/governance/自动化治理门禁说明.md)
7. [数据口径变更检查清单](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/governance/数据口径变更检查清单.md)

## 5. 旧文档处理原则

1. 历史方案不删除，先进入 `docs/archive/`。
2. 审计和复盘不当成当前规则，进入 `docs/reports/`。
3. 当前规则必须有状态头、维护人、版本和替代关系。
4. 规则入口以本文和 `docs/governance/文档状态清单.md` 为准。
