# 标准页改造交接入口说明

## 1. 文档目的

本文件用于给后续新线程提供统一交接入口，避免：

1. 不知道先看哪份文档
2. 不知道哪些结论已经冻结
3. 不知道本阶段能做什么、不能做什么

## 2. 本阶段目标

当前标准页改造的第一阶段目标只有三个：

1. 冻结标准页体系规则
2. 把【学员管理】打磨成第一标准样板页
3. 在学员页验证稳定并冻结后，抽出第一版标准能力，再接入【排课表】

## 3. 本阶段边界

### 3.1 纳入范围

1. 管理端后台页面
2. 学员管理
3. 排课表
4. 支撑这两个页面的标准能力

### 3.2 不纳入范围

1. 教练网页端页面标准化
2. 小程序 icon 库统一
3. 一次性全站替换旧页面
4. 一次性全站替换旧图标

## 4. 阅读顺序

后续新线程必须按以下顺序阅读：

1. [标准页组件库设计方案](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/superpowers/specs/2026-05-09-standard-page-library-design.md)
2. [标准页已冻结决策清单](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/superpowers/specs/2026-05-09-standard-page-frozen-decisions.md)
3. [标准页交互规则清单](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/superpowers/specs/2026-05-09-standard-page-interaction-rules.md)
4. [标准页组件库技术架构文档](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/superpowers/specs/2026-05-09-standard-page-technical-architecture.md)
5. [学员管理标准样板页规格](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/superpowers/specs/2026-05-09-student-page-standard-spec.md)
6. [学员管理标准样板页实施清单](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/superpowers/specs/2026-05-09-student-page-implementation-checklist.md)
7. [标准页第一阶段实施计划](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/superpowers/specs/2026-05-09-standard-page-phase1-plan.md)
8. [标准页改造验收清单](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/superpowers/specs/2026-05-09-standard-page-acceptance-checklist.md)
9. [图标标准方案](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/superpowers/specs/2026-05-09-icon-standard-plan.md)

## 5. 执行原则

1. 第一阶段先局部验证，不做全局替换
2. 第一阶段先改单页，再抽能力
3. 标准能力稳定后再逐页迁移
4. 不允许绕过验收清单直接宣称完成

## 6. 后续线程禁止事项

1. 禁止直接全局修改 `.tms-table-wrapper`
2. 禁止直接全局改 `PAGE_SIZE` 试图解决学员页分页问题
3. 禁止把教练网页端拉入本阶段标准页改造
4. 禁止新增散写内嵌 SVG 图标
5. 禁止绕过标准规则继续手写新页面骨架

## 7. 最终要求

后续新线程如果参与标准页改造，必须先基于上述文档理解一致，再开始改代码。
