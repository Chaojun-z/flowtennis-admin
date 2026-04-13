# 课程产品、售卖课包、购买记录 90 分改造实施计划

> **给后续执行线程：** 必须按任务逐项执行。建议使用 `subagent-driven-development` 或 `executing-plans` 分任务推进。本文档是本地交接方案，路径在 `_local/requirements/`，不要提交到 GitHub，除非用户明确要求。

**目标：** 把【课程产品】【售卖课包】【购买记录】从“能用”提升到“网球俱乐部管理员/运营人员日常能放心使用”，重点修复当前已发现的逻辑问题和信息层级问题。

**架构：** 保持现有单页前端 `public/index.html` 和后端 `api/index.js` 的结构，不做大重构。课程产品只管课程模板，售卖课包只管售卖和使用规则，购买记录只管成交事实并生成权益账户，三者边界不能混。

**技术栈：** 原生 HTML/CSS/JS、Express API、TableStore、现有 Node.js 断言测试。

---

## 0. 2026-04-13 最新基线说明

- 截至本次执行前，`public/index.html`、`api/index.js`、`tests/course-management-nav.test.js`、`tests/entitlement-rules.test.js` 没有来自其他线程的新业务改动。
- 当前这三个页面仍处于“方案已写、代码未改”的基线。
- 执行时必须以这份文档为主，不要假设另一个线程已经先落了其中任何一项。
- 当前全量测试本来就不是全绿：`npm test` 已知会失败在 `tests/coach-ops-view.test.js`，属于排课取消原因断言，不属于本次三页面范围。

---

## 一、当前最重要的问题

### P0：必须优先修

1. **购买记录页面没有“详情/编辑”入口。**
   - 后端已有 `GET /purchases/:id` 和 `PUT /purchases/:id`。
   - 前端只有新增、导入、导出、作废。
   - 结果：运营录错金额、支付方式、备注后，页面上无法修正。

2. **购买记录作废走通用删除弹窗，文案是“确认删除”。**
   - 实际逻辑不是物理删除，而是作废购买记录和对应权益账户。
   - 结果：管理员容易误解，以为数据会被删除；也看不到作废会影响哪个权益账户。

3. **作废没有填写原因入口。**
   - 后端支持 `body.reason`，但前端 `DELETE` 没传。
   - 结果：审计记录只有默认“购买记录作废”，后续查账说不清楚。

4. **课程产品类型和售卖课包类型可能不一致。**
   - 课程产品有 `type`。
   - 售卖课包有 `courseType`，当前可手动选择。
   - 结果：可能出现“课程产品是私教，课包类型是训练营”，影响排课消课校验。

5. **已被引用的核心字段没有在前端置灰。**
   - 后端会拦截：课程产品被班次/课包引用后，不能改类型、人数、课时、价格；课包有购买记录后，不能改核心规则。
   - 但前端仍可编辑，保存后才报错。
   - 结果：运营体验差，不知道哪些字段不能改。

6. **CSV 导入购买记录存在重名误匹配风险。**
   - 当前按学员姓名/手机号、课包名称匹配。
   - 如果有重名学员或同名课包，会匹配到第一个。
   - 结果：可能把课包买到错误学员名下，属于高风险业务问题。

### P1：同一轮一起修

1. **课程产品后端校验偏弱。**
   - 当前前端只校验名称必填。
   - 后端 `POST /products` 基本直接写入。
   - 应补：名称必填、类型必填、人数 > 0、课时 >= 0、价格 >= 0。

2. **购买记录详情缺少完整成交快照。**
   - 列表只展示主要字段。
   - 运营查账时还需要看：操作人、备注、课包购买时的使用规则、可用教练、可用校区、每日时段、作废信息。

3. **售卖课包使用期规则不够清楚。**
   - 现有逻辑：如果有 `usageEndDate`，权益到期按固定使用结束日；否则按 `validDays` 从购买日计算。
   - 页面没有明确提醒。

4. **教练引用字段命名混乱。**
   - `coachIds` 实际存的是教练姓名，`coachNames` 也存教练姓名。
   - 本轮不建议大迁移历史数据，但新增/编辑时应尽量保持兼容，避免引入更大风险。

---

## 二、信息层级和页面边界

### 课程产品页面

定位：定义“上什么课”的模板。

只展示和维护：
- 课程名称
- 课程类型
- 人数上限
- 标准课时
- 标准定价
- 备注

不能放：
- 购买记录
- 学员余额
- 权益消耗流水
- 课包使用时段

关联边界：
- 班次基于课程产品创建。
- 售卖课包基于课程产品创建。
- 课程产品被引用后，核心字段要锁定。

### 售卖课包页面

定位：定义“怎么卖、什么时候买、什么时候用、适用哪些范围”的售卖方案。

只展示和维护：
- 课包名称
- 绑定课程产品
- 课程类型，自动继承课程产品
- 价格
- 课时
- 有效天数
- 活动购买日期
- 使用日期
- 每日可用时段
- 可用教练
- 可用校区
- 人数限制
- 启用/停用
- 备注

不能放：
- 某个学员的购买详情
- 某个学员的剩余课时明细
- 财务流水明细

关联边界：
- 有购买记录后，核心规则不能改，只能改名称、状态、备注。
- “查看购买”只跳到购买记录筛选结果，不在课包页展开明细。

### 购买记录页面

定位：记录“哪个学员买了哪个课包、付了多少钱、什么时候买、谁操作”，并生成权益账户。

必须展示和维护：
- 购买日期
- 学员
- 售卖课包
- 课程产品快照
- 实收金额
- 支付方式
- 权益进度
- 有效期
- 状态
- 操作人
- 备注
- 作废原因
- 作废时间和作废人
- 购买时课包规则快照

不能放：
- 修改售卖课包核心规则
- 手动改权益账户消耗结果
- 会员储值/订场会员权益

关联边界：
- 新增购买记录必须同步生成权益账户。
- 未消耗时，允许编辑学员、课包、购买日期、实收、支付方式、备注，并同步更新权益账户。
- 已消耗后，只允许编辑备注。
- 作废只允许在没有消耗流水时执行。

---

## 三、涉及文件

### 必改文件

- `public/index.html`
  - 增加购买记录详情/编辑弹窗。
  - 增加购买记录专用作废弹窗。
  - 课包类型自动跟随课程产品。
  - 已引用字段置灰和提示。
  - 导入预览增加重名拦截。
  - 页面文案增加规则提示。

- `api/index.js`
  - 增加课程产品统一校验函数。
  - `POST /products` 和 `PUT /products/:id` 使用同一套校验。
  - 购买记录 `PUT` 补充购买日期活动期校验。
  - 购买记录 `PUT` 补充停用课包规则：如果换课包，目标课包必须启用；如果只编辑备注，不要求课包启用。

### 必改测试

- `tests/entitlement-rules.test.js`
  - 增加购买记录编辑的活动期、停用课包、已消耗仅备注规则测试。

- `tests/course-management-nav.test.js`
  - 增加页面入口断言：购买记录详情、编辑、作废原因、课包类型自动跟随提示。

### 可选新增测试

- `tests/course-product-rules.test.js`
  - 如果执行线程觉得当前 `entitlement-rules.test.js` 过长，可以新增该文件专门测课程产品校验。
  - 如果新增，需要同步修改 `package.json` 的 `test` 命令。

---

## 四、执行计划

### Task 1：补课程产品后端校验

**文件：**
- 修改：`api/index.js`
- 测试：`tests/entitlement-rules.test.js` 或新增 `tests/course-product-rules.test.js`

- [ ] Step 1：增加产品校验测试

测试点：
- 名称必填。
- 类型必填。
- 人数必须大于 0。
- 价格不能小于 0。
- 课时不能小于 0。
- 已被引用的产品仍然不能改核心字段。

建议测试代码放在现有 `tests/entitlement-rules.test.js` 末尾：

```js
assert.throws(
  () => rules.validateProductInput({ name: '', type: '私教', maxStudents: 1, price: 0, lessons: 0 }),
  /请填写课程名称/,
  'product name is required'
);

assert.throws(
  () => rules.validateProductInput({ name: '成人私教', type: '', maxStudents: 1, price: 0, lessons: 0 }),
  /请选择课程类型/,
  'product type is required'
);

assert.throws(
  () => rules.validateProductInput({ name: '成人私教', type: '私教', maxStudents: 0, price: 0, lessons: 0 }),
  /人数必须大于 0/,
  'product max students must be positive'
);

assert.throws(
  () => rules.validateProductInput({ name: '成人私教', type: '私教', maxStudents: 1, price: -1, lessons: 0 }),
  /价格不能小于 0/,
  'product price cannot be negative'
);

assert.throws(
  () => rules.validateProductInput({ name: '成人私教', type: '私教', maxStudents: 1, price: 0, lessons: -1 }),
  /课时不能小于 0/,
  'product lessons cannot be negative'
);
```

- [ ] Step 2：运行失败测试

运行：

```bash
node tests/entitlement-rules.test.js
```

预期：
- 因 `validateProductInput` 未导出或未实现而失败。

- [ ] Step 3：实现产品校验

在 `api/index.js` 增加：

```js
function validateProductInput(product){
  if(!String(product?.name||'').trim())throw new Error('请填写课程名称');
  if(!String(product?.type||'').trim())throw new Error('请选择课程类型');
  if((parseInt(product.maxStudents)||0)<=0)throw new Error('人数必须大于 0');
  if(normalizeMoney(product.price)<0)throw new Error('价格不能小于 0');
  if((parseInt(product.lessons)||0)<0)throw new Error('课时不能小于 0');
}
function normalizeProductRecord(input,old=null,now=new Date().toISOString()){
  const base={...(old||{}),...(input||{})};
  const r={
    ...base,
    name:String(base.name||'').trim(),
    type:String(base.type||'').trim(),
    maxStudents:parseInt(base.maxStudents)||0,
    price:normalizeMoney(base.price),
    lessons:parseInt(base.lessons)||0,
    notes:String(base.notes||'').trim(),
    updatedAt:now
  };
  validateProductInput(r);
  return r;
}
```

同步导出到 `_test`：

```js
validateProductInput,
normalizeProductRecord,
```

在 `/products` POST/PUT 中调用 `normalizeProductRecord`，不要直接写 `body`。

- [ ] Step 4：运行测试

运行：

```bash
node tests/entitlement-rules.test.js
```

预期：
- 新增产品校验测试通过。

---

### Task 2：课包类型自动跟随课程产品

**文件：**
- 修改：`public/index.html`
- 测试：`tests/course-management-nav.test.js`

- [ ] Step 1：增加页面断言

在 `tests/course-management-nav.test.js` 增加：

```js
assert.match(html, /function syncPackageProductMeta/, 'package modal should sync product metadata');
assert.match(html, /课程类型跟随课程产品/, 'package modal should explain course type follows product');
assert.match(html, /id="pkg_type"[\s\S]*disabled/, 'package type select should be disabled');
```

- [ ] Step 2：运行失败测试

运行：

```bash
node tests/course-management-nav.test.js
```

预期：
- 因 `syncPackageProductMeta` 和提示文案不存在而失败。

- [ ] Step 3：修改课包弹窗

在 `openPackageModal` 中：
- `pkg_productId` 增加 `onchange="syncPackageProductMeta()"`。
- `pkg_type` 改成禁用显示，不允许手选。
- 增加提示：`课程类型跟随课程产品，避免售卖规则和消课规则不一致。`

新增函数：

```js
function syncPackageProductMeta(){
  const productId=document.getElementById('pkg_productId')?.value||'';
  const product=products.find(x=>x.id===productId);
  const typeEl=document.getElementById('pkg_type');
  if(typeEl&&product?.type)typeEl.value=product.type;
}
```

在 `savePackage()` 中，`courseType` 不再读用户手动选择结果，改为：

```js
const courseType=product?.type||document.getElementById('pkg_type').value;
```

保存数据里使用：

```js
courseType,
```

- [ ] Step 4：运行测试

运行：

```bash
node tests/course-management-nav.test.js
```

预期：
- 新增断言通过。

---

### Task 3：已引用字段前端置灰

**文件：**
- 修改：`public/index.html`
- 测试：`tests/course-management-nav.test.js`

- [ ] Step 1：增加页面断言

在 `tests/course-management-nav.test.js` 增加：

```js
assert.match(html, /function productHasReferences/, 'product modal should know whether product is referenced');
assert.match(html, /function packageHasPurchases/, 'package modal should know whether package is sold');
assert.match(html, /核心字段已锁定/, 'locked core fields should show operator-facing hint');
```

- [ ] Step 2：运行失败测试

运行：

```bash
node tests/course-management-nav.test.js
```

预期：
- 因函数或提示文案不存在而失败。

- [ ] Step 3：实现引用判断

在 `public/index.html` 增加：

```js
function productHasReferences(productId){
  return classes.some(c=>c.productId===productId)||packages.some(p=>p.productId===productId);
}
function packageHasPurchases(packageId){
  return purchases.some(p=>p.packageId===packageId);
}
```

- [ ] Step 4：课程产品弹窗置灰

在 `openProductModal(id)` 中：
- `const locked=id&&productHasReferences(id);`
- 类型、人数、定价、课时字段在 `locked` 时加 `disabled` 或 `readonly`。
- 名称和备注仍可编辑。
- 增加提示：

```html
<div class="inline-help">核心字段已锁定：该课程产品已被班次或售卖课包使用，只能修改名称和备注。</div>
```

- [ ] Step 5：售卖课包弹窗置灰

在 `openPackageModal(id)` 中：
- `const locked=id&&packageHasPurchases(id);`
- 课程产品、课程类型、人数、价格、课时、有效天数、活动期、使用期、时段、可用教练、可用校区在 `locked` 时禁用。
- 名称、状态、备注仍可编辑。
- 增加提示：

```html
<div class="inline-help">核心字段已锁定：该课包已有购买记录，只能修改名称、状态和备注。</div>
```

- [ ] Step 6：运行测试

运行：

```bash
node tests/course-management-nav.test.js
```

预期：
- 新增断言通过。

---

### Task 4：购买记录详情/编辑弹窗

**文件：**
- 修改：`public/index.html`
- 测试：`tests/course-management-nav.test.js`

- [ ] Step 1：增加页面断言

在 `tests/course-management-nav.test.js` 增加：

```js
assert.match(html, /function openPurchaseDetailModal/, 'purchase page should have detail modal');
assert.match(html, /function openPurchaseEditModal/, 'purchase page should have edit modal');
assert.match(html, /function savePurchaseEdit/, 'purchase page should save purchase edits');
assert.match(html, /购买时规则快照/, 'purchase detail should show package snapshot');
```

- [ ] Step 2：运行失败测试

运行：

```bash
node tests/course-management-nav.test.js
```

预期：
- 因购买记录详情/编辑函数不存在而失败。

- [ ] Step 3：列表增加操作按钮

在 `renderPurchases()` 的操作列中：
- 正常记录显示：`详情`、`编辑`、`作废`。
- 已作废记录显示：`详情`。

按钮逻辑：

```html
<button class="btn-sec" onclick="openPurchaseDetailModal('${p.id}')">详情</button>
<button class="btn-sec" onclick="openPurchaseEditModal('${p.id}')">编辑</button>
```

- [ ] Step 4：新增消耗判断

在 `public/index.html` 增加：

```js
function purchaseEntitlement(purchaseId){
  return entitlements.find(e=>e.purchaseId===purchaseId)||null;
}
function purchaseHasLedger(purchaseId){
  const entIds=new Set(entitlements.filter(e=>e.purchaseId===purchaseId).map(e=>e.id));
  return entitlementLedger.some(l=>entIds.has(l.entitlementId));
}
function purchasePackageSnapshotHtml(p){
  const coachText=parseArr(p.coachNames).join('、')||'不限';
  const campusText=parseArr(p.campusIds).map(id=>cn(id)).join('、')||'不限';
  const windows=parseArr(p.dailyTimeWindows).map(w=>[w.startTime,w.endTime].filter(Boolean).join(' - ')).filter(Boolean).join('、')||'全天';
  return `<div class="sec-ttl">购买时规则快照</div><div class="fgrid"><div class="fg"><div class="flabel">课程产品</div><div class="finput">${esc(p.productName)||'—'}</div></div><div class="fg"><div class="flabel">课程类型</div><div class="finput">${esc(p.courseType)||'—'}</div></div><div class="fg"><div class="flabel">课包课时</div><div class="finput">${parseInt(p.packageLessons)||0} 节</div></div><div class="fg"><div class="flabel">课包标价</div><div class="finput">¥${fmt(p.packagePrice)}</div></div><div class="fg"><div class="flabel">时段类型</div><div class="finput">${esc(p.packageTimeBand)||'全天'}</div></div><div class="fg"><div class="flabel">每日时段</div><div class="finput">${esc(windows)}</div></div><div class="fg"><div class="flabel">可用教练</div><div class="finput">${esc(coachText)}</div></div><div class="fg"><div class="flabel">可用校区</div><div class="finput">${esc(campusText)}</div></div><div class="fg"><div class="flabel">使用开始</div><div class="finput">${esc(p.usageStartDate)||'—'}</div></div><div class="fg"><div class="flabel">使用结束</div><div class="finput">${esc(p.usageEndDate)||'—'}</div></div></div>`;
}
```

- [ ] Step 5：新增详情弹窗

实现 `openPurchaseDetailModal(id)`：
- 展示购买日期、学员、课包、实收金额、支付方式、状态、操作人、备注。
- 展示权益账户进度：剩余/总课时、有效期、权益状态。
- 展示购买时规则快照。
- 如果已作废，展示作废时间、作废人、作废原因。

- [ ] Step 6：新增编辑弹窗

实现 `openPurchaseEditModal(id)`：
- 未消耗：学员、课包、购买日期、实收金额、支付方式、备注可编辑。
- 已消耗：只允许备注可编辑，其余字段禁用，并显示提示：

```html
<div class="inline-help">该购买记录已有课时消耗，只能修改备注。</div>
```

- [ ] Step 7：新增保存编辑

实现 `savePurchaseEdit(id)`：

```js
async function savePurchaseEdit(id){
  const btn=document.querySelector('.btn-save');
  btn.disabled=true;btn.textContent='保存中…';
  const data={
    studentId:document.getElementById('pur_edit_studentId')?.value||'',
    packageId:document.getElementById('pur_edit_packageId')?.value||'',
    purchaseDate:document.getElementById('pur_edit_purchaseDate')?.value||'',
    amountPaid:parseFloat(document.getElementById('pur_edit_amountPaid')?.value)||0,
    payMethod:document.getElementById('pur_edit_payMethod')?.value||'',
    notes:document.getElementById('pur_edit_notes')?.value.trim()||''
  };
  try{
    const res=await apiCall('PUT','/purchases/'+id,data);
    if(res.purchase){
      const i=purchases.findIndex(x=>x.id===id);
      if(i>=0)purchases[i]=res.purchase;
    }
    if(Array.isArray(res.entitlements)){
      res.entitlements.forEach(next=>{
        const i=entitlements.findIndex(x=>x.id===next.id);
        if(i>=0)entitlements[i]=next;
        else entitlements.unshift(next);
      });
    }
    closeModal();
    toast('购买记录已更新','success');
    renderStudents();renderPurchases();renderEntitlements();
  }catch(e){
    toast('保存失败：'+e.message,'error');
    btn.disabled=false;btn.textContent='保存';
  }
}
```

- [ ] Step 8：运行测试

运行：

```bash
node tests/course-management-nav.test.js
node tests/entitlement-rules.test.js
```

预期：
- 新增断言通过。
- 购买权益规则测试仍通过。

---

### Task 5：购买记录专用作废弹窗

**文件：**
- 修改：`public/index.html`
- 测试：`tests/course-management-nav.test.js`

- [ ] Step 1：增加页面断言

在 `tests/course-management-nav.test.js` 增加：

```js
assert.match(html, /function openPurchaseVoidModal/, 'purchase page should use dedicated void modal');
assert.match(html, /function voidPurchase/, 'purchase page should send void reason');
assert.match(html, /作废原因/, 'void modal should require reason');
assert.doesNotMatch(html, /confirmDel\('\\$\\{p\.id\\}'[\s\S]*'purchase'\)/, 'purchase rows should not use generic delete modal');
```

如果最后一个正则不稳定，可改成只断言 `openPurchaseVoidModal` 出现在购买记录操作列。

- [ ] Step 2：运行失败测试

运行：

```bash
node tests/course-management-nav.test.js
```

预期：
- 因作废弹窗不存在而失败。

- [ ] Step 3：替换购买记录作废按钮

把购买记录列表里的 `confirmDel(...,'purchase')` 改为：

```html
<button class="btn-sec" onclick="openPurchaseVoidModal('${p.id}')">作废</button>
```

- [ ] Step 4：实现作废弹窗

实现 `openPurchaseVoidModal(id)`：
- 展示学员、课包、购买日期、实收金额、权益进度。
- 如果已有消耗，直接提示“该购买已有课时消耗，不能直接作废”，只给关闭按钮。
- 如果未消耗，要求输入作废原因。

原因字段：

```html
<textarea class="finput ftextarea" id="pur_void_reason" placeholder="例如：录错学员、重复购买、实际未付款"></textarea>
```

- [ ] Step 5：实现作废提交

实现 `voidPurchase(id)`：

```js
async function voidPurchase(id){
  const reason=document.getElementById('pur_void_reason')?.value.trim()||'';
  if(!reason){toast('请填写作废原因','warn');return;}
  const btn=document.querySelector('.btn-save');
  btn.disabled=true;btn.textContent='作废中…';
  try{
    await apiCall('DELETE','/purchases/'+id,{reason});
    await loadAll();
    closeModal();
    toast('购买记录已作废','success');
  }catch(e){
    toast('作废失败：'+e.message,'error');
    btn.disabled=false;btn.textContent='确认作废';
  }
}
```

- [ ] Step 6：保留通用删除逻辑但移除购买记录分支入口

`doDelete()` 中可以暂时保留 `delType==='purchase'` 兼容旧入口，但新页面不再调用。

- [ ] Step 7：运行测试

运行：

```bash
node tests/course-management-nav.test.js
```

预期：
- 作废入口断言通过。

---

### Task 6：购买记录编辑后端规则补齐

**文件：**
- 修改：`api/index.js`
- 测试：`tests/entitlement-rules.test.js`

- [ ] Step 1：增加规则测试

增加测试目标：
- 未消耗时，如果换到停用课包，应拒绝。
- 未消耗时，如果购买日期不在新课包活动期内，应拒绝。
- 已消耗时，仍只允许改备注。

建议增加纯函数：

```js
function validatePurchaseInputForPackage(pkg,purchase,{isEdit=false,oldPackageId=''}={}){
  if(!pkg)throw new Error('售卖课包不存在');
  if(pkg.status&&pkg.status!=='active'&&(!isEdit||String(pkg.id||'')!==String(oldPackageId||'')))throw new Error('该课包已停用');
  const purchaseDate=purchase.purchaseDate||new Date().toISOString().slice(0,10);
  if(pkg.saleStartDate&&purchaseDate<pkg.saleStartDate)throw new Error('不在课包活动购买时间内');
  if(pkg.saleEndDate&&purchaseDate>pkg.saleEndDate)throw new Error('不在课包活动购买时间内');
}
```

对应测试：

```js
assert.throws(
  () => rules.validatePurchaseInputForPackage({ ...pkg, status: 'inactive' }, purchase),
  /该课包已停用/,
  'inactive package cannot be newly purchased'
);

assert.throws(
  () => rules.validatePurchaseInputForPackage({ ...pkg, saleStartDate: '2026-06-01', saleEndDate: '2026-06-30' }, purchase),
  /不在课包活动购买时间内/,
  'purchase date must be inside sale window'
);
```

- [ ] Step 2：运行失败测试

运行：

```bash
node tests/entitlement-rules.test.js
```

预期：
- 因 `validatePurchaseInputForPackage` 未实现或未导出而失败。

- [ ] Step 3：实现后端函数并复用

在 `api/index.js` 中新增 `validatePurchaseInputForPackage`，并在：
- `POST /purchases`
- `PUT /purchases/:id` 未消耗分支

都调用它。

PUT 分支注意：
- 如果只是编辑同一个旧课包的备注，不应因为旧课包后续停用而无法保存备注。
- 如果换成另一个课包，目标课包必须启用，且购买日期必须在目标课包活动期内。

- [ ] Step 4：运行测试

运行：

```bash
node tests/entitlement-rules.test.js
```

预期：
- 新增购买规则测试通过。

---

### Task 7：购买导入增加重名风险拦截

**文件：**
- 修改：`public/index.html`
- 测试：`tests/course-management-nav.test.js`

- [ ] Step 1：增加页面断言

在 `tests/course-management-nav.test.js` 增加：

```js
assert.match(html, /function resolveUniqueStudentIdByText/, 'purchase import should resolve students uniquely');
assert.match(html, /function resolveUniquePackageIdByText/, 'purchase import should resolve packages uniquely');
assert.match(html, /匹配到多个/, 'purchase import should warn duplicate matches');
```

- [ ] Step 2：运行失败测试

运行：

```bash
node tests/course-management-nav.test.js
```

预期：
- 因唯一匹配函数不存在而失败。

- [ ] Step 3：实现唯一匹配函数

新增：

```js
function resolveUniqueStudentIdByText(value){
  const raw=String(value||'').trim();
  if(!raw)return {id:'',reason:'学员未匹配'};
  const hits=students.filter(s=>String(s.name||'').trim()===raw||String(s.phone||'').trim()===raw);
  if(hits.length===1)return {id:hits[0].id,reason:''};
  if(hits.length>1)return {id:'',reason:'学员匹配到多个，请用手机号'};
  return {id:'',reason:'学员未匹配'};
}
function resolveUniquePackageIdByText(value){
  const raw=String(value||'').trim();
  if(!raw)return {id:'',reason:'课包未匹配'};
  const byId=packages.filter(p=>p.id===raw);
  if(byId.length===1)return {id:byId[0].id,reason:''};
  const byName=packages.filter(p=>String(p.name||'').trim()===raw);
  if(byName.length===1)return {id:byName[0].id,reason:''};
  if(byName.length>1)return {id:'',reason:'课包匹配到多个，请用课包ID'};
  return {id:'',reason:'课包未匹配'};
}
```

- [ ] Step 4：改造 `normalizePurchaseImportRows`

将当前：

```js
const studentId=resolveStudentIdByText(studentText||phone);
const packageId=normalizePackageIdByText(readRowValue(row,['售卖课包','课包','课包名称']));
```

改成：

```js
const studentMatch=resolveUniqueStudentIdByText(studentText||phone);
const packageMatch=resolveUniquePackageIdByText(readRowValue(row,['售卖课包','课包','课包名称']));
const studentId=studentMatch.id;
const packageId=packageMatch.id;
```

状态原因优先使用：

```js
if(!studentId){status='无效';reason=studentMatch.reason;}
else if(!packageId){status='无效';reason=packageMatch.reason;}
else if(pkg?.status==='inactive'){status='无效';reason='课包已停用';}
```

- [ ] Step 5：运行测试

运行：

```bash
node tests/course-management-nav.test.js
```

预期：
- 导入唯一匹配断言通过。

---

### Task 8：补充页面提示和运营视角字段

**文件：**
- 修改：`public/index.html`
- 测试：`tests/course-management-nav.test.js`

- [ ] Step 1：增加页面断言

在 `tests/course-management-nav.test.js` 增加：

```js
assert.match(html, /固定使用结束日优先/, 'package modal should explain usage end date priority');
assert.match(html, /购买记录用于查账和追溯/, 'purchase page should explain purpose');
assert.match(html, /成交快照/, 'purchase detail should use snapshot wording');
```

- [ ] Step 2：运行失败测试

运行：

```bash
node tests/course-management-nav.test.js
```

预期：
- 因提示文案不存在而失败。

- [ ] Step 3：增加页面说明

购买记录页面顶部增加简短说明：

```html
购买记录用于查账和追溯；真正消课的是权益账户。购买记录作废不会物理删除历史，只会作废对应权益。
```

售卖课包编辑弹窗的使用时间位置增加：

```html
固定使用结束日优先；不填固定结束日时，按购买日起算有效天数。
```

购买记录详情中统一使用“成交快照”文案，不写“当前课包规则”，避免运营误解。

- [ ] Step 4：运行测试

运行：

```bash
node tests/course-management-nav.test.js
```

预期：
- 页面提示断言通过。

---

### Task 9：全量验证

**文件：**
- 不新增文件。

- [ ] Step 1：运行与本模块直接相关的测试

运行：

```bash
node tests/entitlement-rules.test.js
node tests/course-management-nav.test.js
```

预期：
- 两个测试都通过。

- [ ] Step 2：运行全量测试

运行：

```bash
npm test
```

当前已知情况：
- 2026-04-13 检查时，`npm test` 失败在 `tests/coach-ops-view.test.js`：`schedule modal should capture cancellation reason`。
- 该失败属于排课/教练运营页面，不属于本计划三页面范围。
- 执行线程如果没有修这个无关失败，不要声称全量测试通过；只能说明“本模块相关测试通过，全量测试仍有既有失败”。

- [ ] Step 3：人工走查

按以下路径检查：

1. 新增课程产品。
2. 用课程产品创建售卖课包，确认类型自动跟随。
3. 用课包新增购买记录，确认生成权益账户。
4. 打开购买记录详情，确认能看到成交快照、操作人、备注、权益进度。
5. 未消耗时编辑购买记录，确认权益账户同步更新。
6. 排课消耗该权益账户后，再编辑购买记录，确认只能改备注。
7. 未消耗购买记录作废，确认必须填写作废原因。
8. 课包已有购买后再编辑课包，确认核心字段置灰。
9. 课程产品已有班次或课包后再编辑，确认核心字段置灰。
10. CSV 导入时制造同名学员或同名课包，确认被拦截并提示“匹配到多个”。

---

## 五、不做的事

本轮不要做：

- 不重构 `public/index.html` 的整体架构。
- 不把权益账户并入购买记录页面。
- 不把会员购买记录和上课课包购买记录混在一起。
- 不改订场会员系统。
- 不批量迁移历史 `coachIds` 数据。
- 不新增复杂审批流。
- 不新增复杂财务退款模块。
- 不做移动端大改版。

---

## 六、交付标准

完成后应满足：

- 运营能从购买记录页面查看完整成交事实。
- 运营能修改未消耗购买记录，已消耗记录只能改备注。
- 运营作废购买记录时知道影响范围，并必须填写原因。
- 课程产品和课包的核心字段在被引用后不会让用户误操作。
- 课包类型不会和课程产品类型打架。
- CSV 导入不会在重名情况下静默导错。
- 课程产品、售卖课包、购买记录、权益账户、排课消课的边界保持清楚。
