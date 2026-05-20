# FlowTennis 仓库级硬约束

> 适用对象：Codex、Claude Code、Gemini、任何接手本仓库的 AI 或开发
> 目标：让新线程进入仓库后，不依赖口头提醒，也能先吃到最重要的硬规则。
> 优先级：高于普通文档说明，低于用户当前最新明确指令。

---

## 1. 总原则

1. 你的首要目标不是“尽快把功能做出来”，而是**在不误伤线上数据、财务口径和其他端的前提下完成需求**。
2. 任何“看起来只是小改动”的需求，只要触达：
   - `purchases`
   - `entitlements`
   - `entitlement_ledger`
   - `courts`
   - `financial_ledger`
   - `membership_orders`
   - `membership_benefit_ledger`
   都必须默认按高风险需求处理。
3. 不允许依赖“我小心一点”来避免事故，必须优先依赖：
   - 已冻结文档
   - 明确边界
   - 回归验证
   - 基准比对

---

## 1.1 当前可信基线与工作目录

1. **`origin/main` 是当前唯一可信开发基线。**
2. 日常开发目录固定为：
   - `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main`
3. 当前本地开发分支可以是 `rd-dev`，但必须跟踪并对齐 `origin/main`。
4. 判断是否在可信基线上，不看本地分支名，必须看：
   - `git status --short --branch`
   - `git rev-parse --short HEAD`
   - `git rev-parse --short origin/main`
5. **以后禁止使用 git worktree 进行开发。**
6. 历史 worktree 只允许只读取证、差异比对、确认遗留任务状态，不允许继续写代码。
7. 如果发现本地 `main` 分支仍被旧 worktree 占用，不得切过去开发；继续以当前根目录跟踪 `origin/main` 的分支为准。

---

## 1.2 实际技术栈

1. 管理后台 Web：
   - 原生 HTML / CSS / JavaScript 单页应用
   - 入口：`public/index.html`
   - 前端模块：`public/assets/scripts/`
2. 后端 API：
   - Node.js
   - Express
   - Vercel Serverless Function
   - 入口：`api/index.js`
3. 部署：
   - Vercel
   - `/api/*` rewrite 到 `api/index`
   - 其他路径 rewrite 到 `index.html`
   - Vercel Cron 用于服务号提醒和每日摘要
4. 主业务数据库：
   - 阿里云 TableStore
   - 生产实例：`flowtennis`
   - staging 实例：`flow-staging`
5. 约球子系统数据库：
   - PostgreSQL
   - Node 依赖：`pg`
   - 只允许通过 `MATCH_DATABASE_URL` / `DATABASE_URL` 环境变量连接
6. 微信端：
   - 教练端微信小程序目录：`wechat-miniprogram/`
   - 约球小程序不在本仓库主目录内，不能混淆载体。
7. 脚本与测试：
   - 运维脚本：`scripts/`
   - 测试：`tests/*.test.js`
   - 全量测试：`npm test`
   - 财务门禁：`npm run guard:finance`

---

## 2. 生产与财务红线

1. **本地预览 / 开发环境默认不得直连生产真实数据。**
2. **课包、购买、权益类需求，默认不得顺手改财务口径。**
3. **任何影响财务页的改动，必须先对比财务基准数字。**
4. **生产环境不得默认开启 bootstrap / repair 类自动写入。**
5. **修线上数据与发功能必须分流，不允许混在同一交付里。**
6. **涉及财务相关表、财务页聚合、`api/index.js` 启动/repair 逻辑的改动，提交前必须运行 `npm run guard:finance`。**
   - 当前默认财务基线：`config/finance-baseline.v2.json`
   - `finance-baseline-v1` 只作历史审计，不作为默认门禁基线。
7. **本地预览若需要切到生产变量，必须明确说明原因；默认只允许 `dev/staging` 固定样本或脱敏快照。**
8. **`ALLOW_PRODUCTION_BOOTSTRAP_WRITES=true` 只允许用于已批准的运维修复，不允许作为日常开发或预览默认配置。**

---

## 2.1 修数脚本与功能开发分流

以下脚本前缀只允许用于独立运维修复任务：

1. `scripts/repair-*`
2. `scripts/cleanup-*`
3. `scripts/finalize-*`
4. `scripts/archive-*`

硬规则：

1. 功能开发需求不得顺手修改这些脚本来“顺便修数据”。
2. 如需执行修数，默认先做 dry-run 或审计输出，再显式进入写模式。
3. 功能 PR / 需求交付中，如果同时包含功能代码和修数脚本，默认视为越界，需要拆分。

---

## 3. 新线程开工前必须先看

### 读取规则

1. 规范 / 约束 / 治理类文档不是摆设，必须在对应场景开始前读取。
2. 如果任务触发多个场景，必须读取所有相关场景文档。
3. 如果文档口径和当前用户最新指令冲突，以用户最新明确指令为准，但必须在回复中指出文档已过期或存在冲突。
4. 修改规范类文档后，必须检查是否还存在旧口径互相矛盾。

### 如果任务涉及整体架构、财务、环境、主干、发布

必须先看：

1. [全面技术架构与代码诊断报告](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/2026-05-10-全面技术架构与代码诊断报告.md)
2. [生产数据变更入口清单](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/生产数据变更入口清单.md)
3. [核心表关系图](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/核心表关系图.md)
4. [日常开发与发布治理方案](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/日常开发与发布治理方案.md)
5. [主干清场与分支恢复方案](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/主干清场与分支恢复方案.md)
6. [dev-staging-prod环境建设方案](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/dev-staging-prod环境建设方案.md)
7. [财务基准数字确认表](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/财务基准数字确认表.md)
8. [财务回归与CI门禁方案](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/docs/财务回归与CI门禁方案.md)

### 如果任务涉及高敏感数据页性能治理

必须先看：

- `docs/performance-governance/` 目录下整套文档

### 如果任务涉及后台前端标准页改造

必须先看：

- `docs/superpowers/specs/` 下标准页主线文档

---

## 3.1 开始新任务前的 Git 检查硬约束

每个新任务开始前，必须先检查当前项目状态：

1. 执行并阅读：
   - `git fetch origin --prune`
   - `git status --short --branch`
   - `git branch --format='%(refname:short)|%(upstream:short)|%(objectname:short)|%(worktreepath)'`
   - `git worktree list --porcelain`
2. 必须确认当前工作区是否干净。
3. 必须确认当前 `HEAD` 是否等于或明确基于 `origin/main`。
4. 必须识别是否存在未完整合并的本地分支、历史 worktree、prunable worktree、detached worktree。
5. 如果发现未完成分支可能和本任务修改同一批文件，必须先提示用户存在读写冲突风险。
6. 如果存在明显未收口任务，必须提示用户先 close 掉未完成任务，或明确选择继续当前任务。
7. 未经用户明确要求，不得自动删除分支、删除 worktree、强制 reset、强制覆盖历史改动。

---

## 3.2 任务收敛后的提交与合并硬约束

1. 当任务已经实现、验证、问题收敛后，必须主动询问用户：
   - 是否提交代码
   - 是否推送
   - 是否合并到目标分支
2. 未经用户明确确认，不得自动提交、推送或合并。
3. 如果用户要求提交，提交前必须再次执行：
   - `git status --short --branch`
   - 必要测试命令
4. 如果用户要求合并，必须先确认目标分支，默认目标为 `origin/main`。
5. 如果当前分支已经直接跟踪 `origin/main`，需要向用户说明“本次是提交并推送到 main”，不是再做一次无意义合并。

---

## 4. 任务边界硬规则

1. 如果是课包 / 购买 / 权益需求：
   - 可以改 `packages / purchases / entitlements / 对应UI`
   - 不得默认改财务聚合口径
   - 若必须改财务，必须明确说明“这是独立财务任务”

2. 如果是性能治理任务：
   - 不允许回到“前端拿大包现场重算”的路线
   - 不允许把新接口做成另一种原始大包接口

3. 如果是标准页改造：
   - 不允许绕过冻结决策
   - 不允许顺手全局改公共壳样式

4. 如果是线上修复：
   - 默认先 dry-run
   - 再确认影响范围
   - 最后才允许 `--write`

---

## 5. 合并与交付前最低要求

1. 说明本次改动影响哪几个端：
   - 管理后台 Web
   - 教练端 Web
   - 教练端 PWA
   - 教练端微信小程序
   - 约球子系统

2. 说明是否触达高危表。

3. 若触达财务相关口径，必须对比财务基准数字：
   - 总收入
   - 课包收入
   - 订场收入
   - 会员储值
   - 成交笔数
   - 命令：`npm run guard:finance`

4. 如果本次不是财务需求，也必须说明“非目标模块是否出现异常差异”。

5. 不得在未通过可验收门槛前交付给用户验收。

---

## 6. 可验收门槛

交付给用户前，至少满足：

1. 能登录
2. 目标页面能正常出数据
3. 非目标高频页面不空白
4. 没有关键 `401 / 404 / 500`
5. 目标功能链路能完整点通

---

## 7. 禁止事项

1. 禁止把本地预览默认当成生产环境验证工具。
2. 禁止在功能任务里顺手带修数脚本。
3. 禁止在没有对账的情况下改财务页来源链。
4. 禁止绕过已冻结治理文档，自行发明另一套路线。
5. 禁止在未明确说明的情况下，修改：
   - `api/index.js` 中 bootstrap / repair 逻辑
   - 财务聚合口径
   - 约球同步财务链
6. 禁止让 `.github/workflows/ci-guard.yml` 退回成占位步骤、TODO 步骤或假通过步骤。

## 8. 正式工作区执行规则

1. 正式开发目录固定为：
   - `/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main`
2. 正式可信基线固定为：
   - `origin/main`
3. 禁止再用 `.worktrees/*` 作为日常开发、验收、上传目录。
4. 历史 worktree 只允许只读取证和差异比对。
5. 如果历史文档仍写 `thread26-staging-latest`、`thread114-staging-merge`、旧主目录禁用等旧口径，必须按本文件的新口径执行，并在必要时更新旧文档。
6. 新任务默认从当前根目录跟踪 `origin/main` 的分支继续；如果需要新分支，必须从 `origin/main` 创建普通分支，不得创建 worktree。
