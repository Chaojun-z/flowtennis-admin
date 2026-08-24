# FlowTennis `init()` 触发条件与生产自动写入确认

> 版本：2026-05-10  
> 目标：把当前 `api/index.js` 中 `init()`、bootstrap、repair 相关逻辑说清楚，帮助技术负责人判断生产环境为什么会出现“看起来没碰数据，但线上数据变了”。  
> 说明：本文件基于当前代码静态审阅得出，不替代真实线上运行日志核查。

---

## 1. 为什么必须单独写这份确认

当前一个最危险的误区是：

> 以为只有“后台点保存”才会改线上数据。

实际上，从当前代码看：

- 服务启动初始化
- 冷启动后的首次请求
- 热实例内的修复逻辑

都可能改线上数据。

这就是为什么必须把 `init()` 的触发条件和副作用单独写清楚。

---

## 2. 当前代码里 `init()` 的真实行为

相关代码位置：

- [api/index.js](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js:1862)

### 当前可确认的事实

1. `init()` 不是纯内存初始化。
2. `init()` 内部会根据环境变量开关执行真实写操作。
3. `init()` 会调用以下高风险逻辑：
   - `mkTable(...)`
   - `bootstrapDefaultUsers()`
   - `ensureDefaultCampuses()`
   - `ensureCoachBindings()`
   - `bootstrapMabaoFinanceSeed()`
   - `repairImportedLedgerDuplicates()`
   - `syncDefaultPricePlans()`

### 当前代码中的幂等 / 单实例保护

代码里有：

- `let inited = false`
- `let initPromise = null`

这意味着：

- 在**同一个运行中的 Node 进程 / 实例**里，`init()` 不会无限重复执行
- 第一次进入后，会缓存状态

### 但这不等于生产安全

因为在 Serverless / 冷启动场景下：

- 新实例起来时，内存状态会重新开始
- `inited` 和 `initPromise` 都会重新回到初始值

所以：

**单实例内的幂等，不等于跨冷启动幂等。**

---

## 3. `bootstrapMabaoFinanceSeed()` 当前代码事实

相关代码位置：

- [api/index.js](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js:1840)

### 当前可确认的事实

1. 该逻辑受 `ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP` 控制。
2. 开关开启时，会先检查 `isMabaoFinanceSeedCurrent()`
3. 如果判定“当前不是最新种子状态”，就会执行真实写入

### 当前可确认的保护

它不是“每次都无脑重写”，而是：

- 先比对当前 seed 状态
- 再决定是否写入

### 当前仍然危险的原因

即使存在这个判断，风险仍然很高，因为：

1. 判定逻辑本身是否完全可靠，需要进一步验证
2. 只要判定稍有偏差，就会触发真实删除 / 覆盖
3. 该逻辑会影响：
   - `ft_students`
   - `ft_products`
   - `ft_packages`
   - `ft_purchases`
   - `ft_entitlements`
   - `ft_entitlement_ledger`

这些都是财务口径会间接依赖的表。

---

## 4. `repairImportedLedgerDuplicates()` 当前代码事实

相关代码位置：

- [api/index.js](/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main/api/index.js:1794)

### 当前可确认的事实

1. 该逻辑会扫描 `ft_entitlement_ledger`
2. 会删除被判定为重复的导入权益流水
3. `init()` 中会主动调用它

### 当前保护情况

没有看到一个“生产环境禁用”保护。

也就是说：

- 即使不改课包
- 只要触发 `init()`
- 就可能在启动阶段顺手清理历史权益流水

这是高风险设计。

---

## 5. 现在能得出的正式判断

### 判断 1

`init()` 在代码层面**确实具备生产写入能力**。

### 判断 2

当前代码有“单实例内只执行一次”的保护，但**没有天然保证冷启动跨实例绝对安全**。

### 判断 3

`bootstrapMabaoFinanceSeed()` 不是完全无保护，但其保护逻辑一旦误判，就会直接改动高危业务表。

### 判断 4

`repairImportedLedgerDuplicates()` 是最容易被低估的高危项，因为它看起来像“修复逻辑”，但实际上会直接删真实权益流水。

---

## 6. 对生产治理的明确建议

### 立即建议

1. 生产环境默认关闭：
   - `ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP`
   - 任何 bootstrap / repair 自动写入开关

2. `repairImportedLedgerDuplicates()` 不应继续默认挂在生产 `init()` 链路中。

3. 所有 bootstrap / repair 行为应改成：
   - 人工触发
   - 独立脚本
   - 先 dry-run
   - 再显式写入

### 后续建议

把“启动初始化”和“生产修复”彻底拆开：

- `init()` 只负责安全启动
- 修复逻辑只放到 `ops` 路径

---

## 7. 仍需进一步确认的事项

以下问题，仅靠静态代码无法 100% 定论，必须结合生产运行日志确认：

1. Vercel 生产冷启动频率如何
2. `init()` 在实际流量下平均多久触发一次
3. 生产环境当前到底开了哪些 bootstrap 开关
4. 过去几次财务数字异常，是否与冷启动后 `init()` 触发有关

建议单独补一份：

- `生产 init 运行日志核查结果`

---

## 8. 一句话结论

当前 `init()` 不是“普通启动逻辑”，而是一条**带生产写入副作用的高危链路**。  
如果不把这条链从生产默认启动流程里剥出来，后续即使规范再多，也仍然会反复出现：

- 看起来没碰财务
- 但财务口径还是变了

