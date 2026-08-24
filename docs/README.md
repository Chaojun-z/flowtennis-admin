# FlowTennis 文档总入口

> 文档类型：文档入口
> 状态：生效
> 版本：2026-08-24
> 生效日期：2026-08-24
> 最后审查日期：2026-08-24
> 维护人：FlowTennis 项目负责人
> 唯一依据：本文只负责导航，不覆盖 `AGENTS.md`、PRD 正本和数据口径正本。
> 替代文档：无

这是 FlowTennis 项目的交接文档入口。

如果你是第一次接手这个项目，不要乱跳着看，按下面顺序看。

---

## 零、先看治理入口

如果你是新 agent / 新开发 / 外部技术负责人，先看这 4 份：

1. [治理总览.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/governance/治理总览.md)
2. [文档状态清单.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/governance/文档状态清单.md)
3. [需求变更流程.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/governance/需求变更流程.md)
4. [文档维护规范.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/governance/文档维护规范.md)

这 4 份文档只做治理分层和流程说明，不替代具体业务规则。

当前优先级：

1. 用户最新明确指令。
2. 根目录 `AGENTS.md`。
3. 仓库 `AGENTS.md`。
4. PRD 正本 `docs/prd/source/`。
5. 数据口径正本 `docs/FlowTennis全平台数据口径总表.md`。
6. 本文档入口和治理目录。

---

## 一、先看什么

### 如果你是新同事 / 运营

按这个顺序看：

1. [平台页面功能总览.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/平台页面功能总览.md)
2. [运营使用手册.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/运营使用手册.md)
3. [平台业务逻辑与字段关系说明.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/平台业务逻辑与字段关系说明.md)
4. [已知限制与风险清单.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/已知限制与风险清单.md)

### 如果你是新 agent / 新开发

按这个顺序看：

1. [FlowTennis全平台数据口径总表.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/FlowTennis全平台数据口径总表.md)
2. [平台页面功能总览.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/平台页面功能总览.md)
3. [平台业务逻辑与字段关系说明.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/平台业务逻辑与字段关系说明.md)
4. [平台核心数据字典.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/平台核心数据字典.md)
5. [代码结构与修改入口说明.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/代码结构与修改入口说明.md)
6. [已知限制与风险清单.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/已知限制与风险清单.md)
7. [运营使用手册.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/运营使用手册.md)

如果任务涉及端、入口、PWA、小程序、发布载体，先加看：

7. [2026-05-13-5端与载体边界固化.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/2026-05-13-5端与载体边界固化.md)

---

## 二、每份文档是干什么的

### 1. [平台页面功能总览.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/平台页面功能总览.md)

解决问题：

- 系统有哪些页面
- 每个页面有什么功能
- 关键弹窗/子页是什么
- 页面之间怎么关联

适合：

- 第一次建立全局认知

---

### 2. [平台业务逻辑与字段关系说明.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/平台业务逻辑与字段关系说明.md)

解决问题：

- 教学线和会员线的主业务逻辑
- 谁生成谁
- 谁引用谁
- 状态怎么流转
- 自动联动规则是什么

适合：

- 真正理解系统逻辑

---

### 3. [平台核心数据字典.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/平台核心数据字典.md)

解决问题：

- 每张核心表有哪些关键字段
- 字段是手填、自动生成、快照复制还是系统计算
- 字段会影响哪里

适合：

- 开发
- 调试
- 逻辑核对

---

### 3.1 [FlowTennis全平台数据口径总表.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/FlowTennis全平台数据口径总表.md)

解决问题：

- 全平台指标只能按哪套口径计算
- 转化、留存、复购、订场会员、财务金额等指标如何定义
- 哪些旧草案口径已经被统一口径覆盖

适合：

- 新增指标
- 修改经营分析
- 修改客户中心、线索池、留存与转化、财务中心口径

---

### 4. [运营使用手册.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/运营使用手册.md)

解决问题：

- 日常工作去哪个页面
- 某个操作怎么做
- 常见问题去哪里查

适合：

- 运营
- 培训
- 交接使用

---

### 5. [代码结构与修改入口说明.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/代码结构与修改入口说明.md)

解决问题：

- 代码主要在哪些文件
- 改页面先看哪里
- 改业务规则先看哪里
- 测试应该看哪些文件

适合：

- 新 agent
- 新开发

---

### 6. [已知限制与风险清单.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/已知限制与风险清单.md)

解决问题：

- 当前系统有哪些限制
- 哪些地方最容易踩坑
- 哪些对象不能乱改、不能乱删

适合：

- 任何接手的人

---

## 三、最短交接路线

如果时间只有 10 分钟：

### 给运营

看这 3 份：

1. [平台页面功能总览.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/平台页面功能总览.md)
2. [运营使用手册.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/运营使用手册.md)
3. [已知限制与风险清单.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/已知限制与风险清单.md)

### 给开发 / agent

看这 4 份：

1. [FlowTennis全平台数据口径总表.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/FlowTennis全平台数据口径总表.md)
2. [平台页面功能总览.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/平台页面功能总览.md)
3. [平台业务逻辑与字段关系说明.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/平台业务逻辑与字段关系说明.md)
4. [平台核心数据字典.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/平台核心数据字典.md)
5. [代码结构与修改入口说明.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/代码结构与修改入口说明.md)

---

## 四、这套文档解决到什么程度

现在这套文档已经能解决：

- 新人不知道系统有哪些页面
- 新人不知道两条主业务线怎么走
- 新人不知道字段归谁管
- 新人不知道从哪里改代码
- 新人不知道哪些地方不能乱动

但还是要注意：

- 这套文档能帮助快速接手
- 不代表可以跳过实际代码阅读和测试验证

---

## 五、当前总治理主文档

如果你是外部技术负责人 / 其他 AI，要快速理解当前困境和治理方向，优先看：

1. [治理总览](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/governance/治理总览.md)
2. [文档状态清单](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/governance/文档状态清单.md)
3. [需求变更流程](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/governance/需求变更流程.md)
4. [全面技术架构与代码诊断报告](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/2026-05-10-全面技术架构与代码诊断报告.md)
5. [生产数据变更入口清单](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/生产数据变更入口清单.md)
6. [核心表关系图](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/核心表关系图.md)
7. [日常开发与发布治理方案](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/日常开发与发布治理方案.md)
8. [财务基准数字确认表](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/财务基准数字确认表.md)
9. [财务回归与CI门禁方案](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/财务回归与CI门禁方案.md)
10. [自动化门禁落地方案](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/自动化门禁落地方案.md)
11. [api/index.js高危链路解耦实施方案](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/api-index高危链路解耦实施方案.md)


## 六、补充参考

历史思考文档：

- [统一教学履约模型.md](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/统一教学履约模型.md)

适合什么时候看：

- 当你已经理解当前系统后
- 想看更偏“为什么这么设计、有哪些历史问题”的时候
