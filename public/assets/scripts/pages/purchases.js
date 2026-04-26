function refreshPurchaseFilters(){
  const packageValue=document.getElementById('purPackageFilter')?.value||'';
  const packageOptions=[{value:'',label:'全部课包'},...packages.map(p=>({value:p.id,label:p.name}))];
  [['purPackageFilterHost','purPackageFilter','全部课包',packageOptions,packageValue]].forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=renderCourtDropdownHtml(id,label,options,value,false,'renderPurchases');
  });
}
function getFilteredPurchases(){
  const q=(document.getElementById('purSearch')?.value||'').toLowerCase();
  const packageId=document.getElementById('purPackageFilter')?.value||'';
  const dateFrom=document.getElementById('purDateFrom')?.value||'';
  const dateTo=document.getElementById('purDateTo')?.value||'';
  return purchases.filter(p=>{
    if(!searchHit(q,p.studentName,p.packageName,p.amountPaid,p.payMethod,p.purchaseDate,p.productName,p.courseType,p.packageTimeBand))return false;
    if(packageId&&p.packageId!==packageId)return false;
    if(dateFrom&&String(p.purchaseDate||'')<dateFrom)return false;
    if(dateTo&&String(p.purchaseDate||'')>dateTo)return false;
    return true;
  }).sort((a,b)=>String(b.purchaseDate||b.createdAt||'').localeCompare(String(a.purchaseDate||a.createdAt||'')));
}
function renderPurchases(){
  refreshPurchaseFilters();
  const list=getFilteredPurchases();
  document.getElementById('purchaseTbody').innerHTML=list.length?list.map(p=>{
    const ent=entitlements.find(e=>e.purchaseId===p.id);
    const remain=ent?`${lessonQty(ent.remainingLessons)}/${lessonQty(ent.totalLessons)} 节`:'-';
    const validRange=ent?`${renderCourtEmptyText(ent.validFrom)} - ${renderCourtEmptyText(ent.validUntil)}`:'-';
    const balanceStatus=ent?entitlementStatusText(ent):(p.status==='voided'?'已作废':'未生成');
    const balanceTagClass=!ent&&p.status!=='voided'?'tms-tag-tier-slate':ent?.status==='voided'||p.status==='voided'?'tms-tag-tier-slate':ent?.status==='depleted'?'tms-tag-tier-gold':'tms-tag-green';
    return `<tr><td style="padding-left:20px">${renderCourtCellText(p.purchaseDate,false)}</td><td><div class="tms-text-primary">${esc(renderCourtEmptyText(p.studentName))}</div><div class="tms-text-secondary">${esc(renderCourtEmptyText(p.payMethod))}</div></td><td><div class="tms-text-primary">${esc(renderCourtEmptyText(p.packageName))}</div><div class="tms-text-secondary">${esc(renderCourtEmptyText(p.courseType))} · ${p.packageLessons||0} 节</div></td><td><div class="tms-cell-text">¥${fmt(p.amountPaid)}</div></td><td>${renderCourtCellText(remain,false)}</td><td><div class="tms-cell-text">${esc(validRange)}</div></td><td><span class="tms-tag ${balanceTagClass}">${balanceStatus}</span></td><td>${renderCourtCellText(p.ownerCoach)}</td><td class="tms-sticky-r tms-action-cell" style="width:120px;padding-right:20px"><span class="tms-action-link" onclick="openPurchaseDetailModal('${p.id}')">查看</span>${p.status==='voided'?'':`<span class="tms-action-link" onclick="openPurchaseEditModal('${p.id}')">编辑</span><span class="tms-action-link" onclick="openPurchaseVoidModal('${p.id}')">作废</span>`}</td></tr>`;
  }).join(''):'<tr><td colspan="9"><div class="empty"><p>暂无购买记录</p></div></td></tr>';
}

function purchaseEntitlement(purchaseId){
  return entitlements.find(e=>e.purchaseId===purchaseId)||null;
}
function purchaseSaleCampusId(rec){
  return String(rec?.saleCampusId||parseArr(rec?.campusIds)[0]||'').trim();
}
function purchaseSaleCampusText(rec){
  const id=purchaseSaleCampusId(rec);
  return id?cn(id):'未设置';
}
function purchaseSaleCampusOptions(){
  return campuses.map(c=>({value:c.code||c.id,label:c.name}));
}
function purchaseHasLedger(purchaseId){
  const entIds=new Set(entitlements.filter(e=>e.purchaseId===purchaseId).map(e=>e.id));
  return entitlementLedger.some(l=>entIds.has(l.entitlementId));
}
function purchasePackageSnapshotHtml(p){
  const coachText=parseArr(p.coachNames).join('、')||'不限';
  const campusText=parseArr(p.campusIds).map(id=>cn(id)).join('、')||'不限';
  const windows=parseArr(p.dailyTimeWindows).map(w=>[w.startTime,w.endTime].filter(Boolean).join(' - ')).filter(Boolean).join('、')||'全天';
  return `<div class="sec-ttl">购买时规则快照</div><div class="fgrid"><div class="fg"><div class="flabel">课程产品</div><div class="finput">${esc(p.productName)||'—'}</div></div><div class="fg"><div class="flabel">课程类型</div><div class="finput">${esc(p.courseType)||'—'}</div></div><div class="fg"><div class="flabel">课包课时</div><div class="finput">${parseInt(p.packageLessons)||0} 节</div></div><div class="fg"><div class="flabel">课包标价</div><div class="finput">¥${fmt(p.packagePrice)}</div></div><div class="fg"><div class="flabel">归属教练</div><div class="finput">购买时选择</div></div><div class="fg"><div class="flabel">销售归属校区</div><div class="finput">${esc(purchaseSaleCampusText(p))}</div></div><div class="fg"><div class="flabel">可上课教练</div><div class="finput">${esc(coachText)}</div></div><div class="fg"><div class="flabel">时段类型</div><div class="finput">${esc(p.packageTimeBand)||'全天'}</div></div><div class="fg"><div class="flabel">每日时段</div><div class="finput">${esc(windows)}</div></div><div class="fg"><div class="flabel">可用校区</div><div class="finput">${esc(campusText)}</div></div><div class="fg"><div class="flabel">使用开始</div><div class="finput">${esc(p.usageStartDate)||'—'}</div></div><div class="fg"><div class="flabel">使用结束</div><div class="finput">${esc(p.usageEndDate)||'—'}</div></div></div>`;
}
function purchaseLedgerHtml(purchaseId){
  const entIds=new Set(entitlements.filter(e=>e.purchaseId===purchaseId).map(e=>e.id));
  const rows=aggregateHistoricalMonthlyLedgerRows(dedupeEntitlementLedgerForDisplay(entitlementLedger.filter(l=>entIds.has(l.entitlementId)))).sort((a,b)=>String(entitlementLedgerSortDate(b)||'').localeCompare(String(entitlementLedgerSortDate(a)||''))).slice(0,10);
  if(!rows.length)return '<div class="finput" style="min-height:42px">暂无扣课记录</div>';
  return `<div class="finput" style="min-height:42px;white-space:normal;line-height:1.7">${rows.map(l=>`${(Number(l.lessonDelta)||0)>0?'退回':'扣减'} ${lessonQty(Math.abs(Number(l.lessonDelta)||0))} 节 · ${esc(l.reason)||'—'} · ${entitlementLedgerDisplayDate(l)}`).join('<br>')}</div>`;
}
function purchaseSystemAmountForPackage(packageId){
  const pkg=packages.find(x=>x.id===packageId);
  return Number(pkg?.price)||0;
}
function syncPurchasePriceFields(prefix='pur',force=false){
  const packageId=document.getElementById(`${prefix}_packageId`)?.value||'';
  const systemAmount=purchaseSystemAmountForPackage(packageId);
  const systemInput=document.getElementById(`${prefix}_systemAmount`);
  const amountInput=document.getElementById(`${prefix}_amountPaid`);
  if(systemInput)systemInput.value=systemAmount||0;
  if(amountInput&&(force||!amountInput.value||amountInput.dataset.autofill==='1')){
    amountInput.value=systemAmount||0;
    amountInput.dataset.autofill='1';
  }
}
function syncPurchaseSaleCampusField(prefix='pur',force=false){
  const packageId=document.getElementById(`${prefix}_packageId`)?.value||'';
  const input=document.getElementById(`${prefix}_saleCampusId`);
  if(!input)return;
  const pkg=packages.find(x=>x.id===packageId);
  const nextValue=purchaseSaleCampusId(pkg);
  if(force||!input.value||input.dataset.autofill==='1'){
    setCourtDropdownValue(`${prefix}_saleCampusId`,nextValue,nextValue);
    input.dataset.autofill='1';
  }
}
function purchasePriceOverrideChanged(prefix='pur'){
  const systemAmount=Number(document.getElementById(`${prefix}_systemAmount`)?.value)||0;
  const finalAmount=Number(document.getElementById(`${prefix}_amountPaid`)?.value)||0;
  const reasonWrap=document.getElementById(`${prefix}_overrideReasonWrap`);
  const reasonInput=document.getElementById(`${prefix}_overrideReason`);
  const amountInput=document.getElementById(`${prefix}_amountPaid`);
  const changed=systemAmount!==finalAmount;
  if(reasonWrap)reasonWrap.style.display=changed?'block':'none';
  if(!changed&&reasonInput)reasonInput.value='';
  if(amountInput)amountInput.dataset.autofill='0';
}
function purchasePriceSummaryHtml(p){
  const systemAmount=Number(p.systemAmount??p.packagePrice??0)||0;
  const finalAmount=Number(p.finalAmount??p.amountPaid??systemAmount)||0;
  const overrideReason=String(p.overrideReason||'').trim();
  return `<div class="fg"><div class="flabel">系统价格</div><div class="finput">¥${fmt(systemAmount)}</div></div><div class="fg"><div class="flabel">成交金额</div><div class="finput">¥${fmt(finalAmount)}</div></div><div class="fg"><div class="flabel">是否改价</div><div class="finput">${systemAmount!==finalAmount?'是':'否'}</div></div><div class="fg full"><div class="flabel">改价原因</div><div class="finput" style="min-height:42px">${esc(overrideReason)||'—'}</div></div>`;
}

function openPurchaseEntryModal(){
  openPurchaseModal();
}
async function ensurePurchaseModalDatasets(){
  const required=['students','packages','purchases','entitlements','coaches'];
  const missing=required.filter(name=>!loadedDatasets.has(name));
  if(!missing.length)return;
  await ensureDatasetsByName(['purchasesPage','coaches']);
}
async function openPurchaseModal(studentId=''){
  try{
    await ensurePurchaseModalDatasets();
  }catch(e){
    toast('打开购买弹窗失败：'+(e?.message||'课包数据加载失败'),'error');
    return;
  }
  const stu=studentId?students.find(x=>x.id===studentId):null;
  if(studentId&&!stu){toast('学员不存在','error');return;}
  editId=null;
  const payOptions=[{value:'微信',label:'微信'},{value:'支付宝',label:'支付宝'},{value:'现金',label:'现金'},{value:'转账',label:'转账'},{value:'其他',label:'其他'}];
  const studentOptions=students.map(s=>({value:s.id,label:`${s.name}${s.phone?` · ${s.phone}`:''}`}));
  const ownerOptions=[{value:'',label:'— 未分配 —'},...activeCoachNames().map(name=>({value:name,label:name}))];
  const body=`<div class="tms-section-header" style="margin-top:0;">学员信息</div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">学员 *</label>${renderCourtDropdownHtml('pur_studentId','选择学员',studentOptions,stu?.id||'',true)}</div></div><div class="tms-section-header">购买信息</div><div class="tms-form-row purchase-compact-row"><div class="tms-form-item" style="flex:2"><label class="tms-form-label">选择课包 *</label>${renderCourtDropdownHtml('pur_packageId','选择课包',packages.filter(p=>p.status!=='inactive').map(p=>({value:p.id,label:`${p.name} · ¥${fmt(p.price)} · ${p.lessons||0}节`})), '', true, 'onPurchasePackageChange')}</div><div class="tms-form-item"><label class="tms-form-label">主归属教练</label>${renderCourtDropdownHtml('pur_ownerCoach','主归属教练',ownerOptions,stu?.primaryCoach||'',true)}</div></div><div class="tms-form-row purchase-compact-row"><div class="tms-form-item"><label class="tms-form-label">支付日期</label>${courtDateButtonHtml('pur_purchaseDate',today(),'支付日期')}</div><div class="tms-form-item"><label class="tms-form-label">系统价格</label><input class="finput tms-form-control" id="pur_systemAmount" type="number" value="0" readonly></div><div class="tms-form-item"><label class="tms-form-label">实收金额</label><input class="finput tms-form-control" id="pur_amountPaid" type="number" value="0" oninput="purchasePriceOverrideChanged('pur')"></div><div class="tms-form-item"><label class="tms-form-label">支付方式</label>${renderCourtDropdownHtml('pur_payMethod','支付方式',payOptions,'微信',true)}</div></div><div class="tms-form-row purchase-compact-row"><div class="tms-form-item"><label class="tms-form-label">销售归属校区 *</label>${renderCourtDropdownHtml('pur_saleCampusId','销售归属校区',purchaseSaleCampusOptions(),'',true,'purchaseSaleCampusChanged(\"pur\")')}</div></div><div class="tms-form-row" id="pur_overrideReasonWrap" style="display:none"><div class="tms-form-item full-width"><label class="tms-form-label">改价原因</label><input class="finput tms-form-control" id="pur_overrideReason" placeholder="实际成交价与系统价格不一致时必填"></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">可上课教练</label><div class="choice-wrap purchase-coach-wrap">${purchaseAllowedCoachChecks([], 'pur-allowed-coach-cb')}</div><div class="inline-help">默认带出课包归属校区，必要时改成实际售卖校区。</div></div></div><div class="tms-form-row purchase-notes-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="pur_notes"></textarea></div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" onclick="savePurchase()">保存</button>`;
  setCourtModalFrame('课包购买',body,footer,'modal-wide');
  fillPurchasePackageMeta();
}
function fillPurchasePackageMeta(){
  syncPurchasePriceFields('pur');
  syncPurchaseSaleCampusField('pur',true);
  purchasePriceOverrideChanged('pur');
}
function onPurchasePackageChange(value){
  syncPurchasePriceFields('pur',true);
  syncPurchaseSaleCampusField('pur',true);
  purchasePriceOverrideChanged('pur');
}
function onPurchaseEditPackageChange(){
  syncPurchasePriceFields('pur_edit',true);
  syncPurchaseSaleCampusField('pur_edit',true);
  purchasePriceOverrideChanged('pur_edit');
}
function purchaseSaleCampusChanged(prefix='pur'){
  const input=document.getElementById(`${prefix}_saleCampusId`);
  if(input)input.dataset.autofill='0';
}
function openPurchaseDetailModal(id){
  const p=purchases.find(x=>x.id===id);if(!p){toast('购买记录不存在','error');return;}
  const ent=purchaseEntitlement(id);
  const modal=document.querySelector('#overlay .modal');
  if(modal)modal.className='modal modal-wide';
  document.getElementById('mTitle').textContent='购买记录详情';
  document.getElementById('mBody').innerHTML=`<div class="sec-ttl">成交快照</div><div class="fgrid"><div class="fg"><div class="flabel">支付日期</div><div class="finput">${esc(p.purchaseDate)||'—'}</div></div><div class="fg"><div class="flabel">系统录入时间</div><div class="finput">${fmtDt(p.createdAt)}</div></div><div class="fg"><div class="flabel">学员</div><div class="finput">${esc(p.studentName)||'—'}</div></div><div class="fg"><div class="flabel">售卖课包</div><div class="finput">${esc(p.packageName)||'—'}</div></div>${purchasePriceSummaryHtml(p)}<div class="fg"><div class="flabel">主归属教练</div><div class="finput">${esc(p.ownerCoach)||'—'}</div></div><div class="fg"><div class="flabel">销售归属校区</div><div class="finput">${esc(purchaseSaleCampusText(p))}</div></div><div class="fg"><div class="flabel">可上课教练</div><div class="finput">${esc(parseArr(p.allowedCoaches).join('、'))||'—'}</div></div><div class="fg"><div class="flabel">支付方式</div><div class="finput">${esc(p.payMethod)||'—'}</div></div><div class="fg"><div class="flabel">购买状态</div><div class="finput">${purchaseStatusText(p)}</div></div><div class="fg"><div class="flabel">操作人</div><div class="finput">${esc(p.operator)||'—'}</div></div><div class="fg full"><div class="flabel">备注</div><div class="finput" style="min-height:42px">${esc(p.notes)||'—'}</div></div></div><div class="sec-ttl">课包余额</div><div class="fgrid"><div class="fg"><div class="flabel">当前余额</div><div class="finput">${ent?`${lessonQty(ent.remainingLessons)}/${lessonQty(ent.totalLessons)} 节`:'—'}</div></div><div class="fg"><div class="flabel">有效期</div><div class="finput">${ent?`${ent.validFrom||'—'} - ${ent.validUntil||'—'}`:'—'}</div></div><div class="fg"><div class="flabel">余额状态</div><div class="finput">${ent?entitlementStatusText(ent):'—'}</div></div></div><div class="sec-ttl">扣课记录</div>${purchaseLedgerHtml(p.id)}${purchasePackageSnapshotHtml(p)}${p.status==='voided'?`<div class="sec-ttl">作废信息</div><div class="fgrid"><div class="fg"><div class="flabel">作废时间</div><div class="finput">${esc(p.voidedAt)||'—'}</div></div><div class="fg"><div class="flabel">作废人</div><div class="finput">${esc(p.voidedBy)||'—'}</div></div><div class="fg full"><div class="flabel">作废原因</div><div class="finput" style="min-height:42px">${esc(p.voidReason)||'—'}</div></div></div>`:''}<div class="mactions"><button class="btn-cancel" onclick="closeModal()">关闭</button>${p.status==='voided'?'':`<button class="btn-save" onclick="openPurchaseEditModal('${p.id}')">编辑</button>`}</div>`;
  document.getElementById('overlay').classList.add('open');
}
function openPurchaseEditModal(id){
  const p=purchases.find(x=>x.id===id);if(!p){toast('购买记录不存在','error');return;}
  const locked=purchaseHasLedger(id);
  const studentOptions=students.map(s=>({value:s.id,label:`${s.name}${s.phone?` · ${s.phone}`:''}`}));
  const payOptions=[{value:'微信',label:'微信'},{value:'支付宝',label:'支付宝'},{value:'现金',label:'现金'},{value:'转账',label:'转账'},{value:'其他',label:'其他'}];
  const ownerOptions=[{value:'',label:'— 未分配 —'},...activeCoachNames().map(name=>({value:name,label:name}))];
  const body=`${locked?'<div class="tms-audit-note" style="margin-bottom:18px">该购买记录已有课时消耗，只能修改备注。</div>':''}<div class="tms-section-header" style="margin-top:0;">购买信息</div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">学员 *</label>${renderCourtDropdownHtml('pur_edit_studentId','选择学员',studentOptions,p.studentId,true)}</div></div><div class="tms-form-row purchase-compact-row"><div class="tms-form-item" style="flex:2"><label class="tms-form-label">选择课包 *</label>${renderCourtDropdownHtml('pur_edit_packageId','选择课包',packages.filter(pkg=>pkg.status!=='inactive'||pkg.id===p.packageId).map(pkg=>({value:pkg.id,label:`${pkg.name} · ¥${fmt(pkg.price)} · ${pkg.lessons||0}节${pkg.status==='inactive'?' · 已停用':''}`})),p.packageId,true,'onPurchaseEditPackageChange')}</div><div class="tms-form-item"><label class="tms-form-label">主归属教练</label>${renderCourtDropdownHtml('pur_edit_ownerCoach','主归属教练',ownerOptions,p.ownerCoach||'',true)}</div></div><div class="tms-form-row purchase-compact-row"><div class="tms-form-item"><label class="tms-form-label">支付日期</label>${courtDateButtonHtml('pur_edit_purchaseDate',p.purchaseDate||today(),'支付日期')}</div><div class="tms-form-item"><label class="tms-form-label">系统价格</label><input class="finput tms-form-control" id="pur_edit_systemAmount" type="number" value="${Number(p.systemAmount??p.packagePrice??0)||0}" readonly></div><div class="tms-form-item"><label class="tms-form-label">实收金额</label><input class="finput tms-form-control" id="pur_edit_amountPaid" type="number" value="${parseFloat(p.finalAmount??p.amountPaid)||0}"${locked?' readonly':''} oninput="purchasePriceOverrideChanged('pur_edit')"></div><div class="tms-form-item"><label class="tms-form-label">支付方式</label>${renderCourtDropdownHtml('pur_edit_payMethod','支付方式',payOptions,p.payMethod||'微信',true)}</div></div><div class="tms-form-row purchase-compact-row"><div class="tms-form-item"><label class="tms-form-label">销售归属校区 *</label>${renderCourtDropdownHtml('pur_edit_saleCampusId','销售归属校区',purchaseSaleCampusOptions(),purchaseSaleCampusId(p),true,'purchaseSaleCampusChanged(\"pur_edit\")')}</div></div><div class="tms-form-row" id="pur_edit_overrideReasonWrap" style="display:${Number(p.systemAmount??p.packagePrice??0)!==Number(p.finalAmount??p.amountPaid??0)?'block':'none'}"><div class="tms-form-item full-width"><label class="tms-form-label">改价原因</label><input class="finput tms-form-control" id="pur_edit_overrideReason" value="${esc(p.overrideReason||'')}" ${locked?'readonly':''} placeholder="实际成交价与系统价格不一致时必填"></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">可上课教练</label><div class="choice-wrap purchase-coach-wrap">${purchaseAllowedCoachChecks(p.allowedCoaches, 'pur-edit-allowed-coach-cb')}</div></div></div><div class="tms-form-row purchase-notes-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="pur_edit_notes">${esc(p.notes||'')}</textarea></div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" onclick="savePurchaseEdit('${p.id}')">保存</button>`;
  setCourtModalFrame('编辑购买记录',body,footer,'modal-wide');
  if(locked){
    ['pur_edit_studentId_dropdown','pur_edit_packageId_dropdown','pur_edit_payMethod_dropdown','pur_edit_ownerCoach_dropdown'].forEach(id=>{
      const el=document.getElementById(id);
      if(el){el.style.pointerEvents='none';el.style.opacity='0.6';}
    });
    const saleCampusEl=document.getElementById('pur_edit_saleCampusId_dropdown');
    if(saleCampusEl){saleCampusEl.style.pointerEvents='none';saleCampusEl.style.opacity='0.6';}
    const dateBtn=document.getElementById('pur_edit_purchaseDate_btn');
    if(dateBtn){dateBtn.disabled=true;dateBtn.style.pointerEvents='none';dateBtn.style.opacity='0.6';}
    document.querySelectorAll('.pur-edit-allowed-coach-cb').forEach(cb=>{cb.disabled=true;});
  }
  fillPurchaseEditPackageMeta();
}
function fillPurchaseEditPackageMeta(){
  syncPurchasePriceFields('pur_edit');
  syncPurchaseSaleCampusField('pur_edit',true);
  purchasePriceOverrideChanged('pur_edit');
}
async function savePurchaseEdit(id){
  const btn=document.querySelector('.btn-save');btn.disabled=true;btn.textContent='保存中…';
  const data={studentId:document.getElementById('pur_edit_studentId')?.value||'',packageId:document.getElementById('pur_edit_packageId')?.value||'',ownerCoach:document.getElementById('pur_edit_ownerCoach')?.value||'',saleCampusId:document.getElementById('pur_edit_saleCampusId')?.value||'',allowedCoaches:[...document.querySelectorAll('.pur-edit-allowed-coach-cb:checked')].map(cb=>cb.value),purchaseDate:document.getElementById('pur_edit_purchaseDate')?.value||'',amountPaid:parseFloat(document.getElementById('pur_edit_amountPaid')?.value)||0,overrideReason:document.getElementById('pur_edit_overrideReason')?.value.trim()||'',payMethod:document.getElementById('pur_edit_payMethod')?.value||'',notes:document.getElementById('pur_edit_notes')?.value.trim()||''};
  if(campuses.length&&!data.saleCampusId){toast('请选择销售归属校区','warn');btn.disabled=false;btn.textContent='保存';return;}
  const systemAmount=Number(document.getElementById('pur_edit_systemAmount')?.value)||0;
  if(!purchaseHasLedger(id)&&systemAmount!==Number(data.amountPaid||0)&&!data.overrideReason){toast('请填写改价原因','warn');btn.disabled=false;btn.textContent='保存';return;}
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
      });
    }
    closeModal();toast('购买记录已更新','success');renderStudents();renderPurchases();renderEntitlements();
  }catch(e){toast('保存失败：'+e.message,'error');btn.disabled=false;btn.textContent='保存';}
}
function openPurchaseVoidModal(id){
  const p=purchases.find(x=>x.id===id);if(!p){toast('购买记录不存在','error');return;}
  const ent=purchaseEntitlement(id);
  const blocked=purchaseHasLedger(id);
  const modal=document.querySelector('#overlay .modal');
  if(modal)modal.className='modal modal-tight';
  document.getElementById('mTitle').textContent='作废购买记录';
  document.getElementById('mBody').innerHTML=`<div class="fgrid"><div class="fg"><div class="flabel">学员</div><div class="finput">${esc(p.studentName)||'—'}</div></div><div class="fg"><div class="flabel">售卖课包</div><div class="finput">${esc(p.packageName)||'—'}</div></div><div class="fg"><div class="flabel">购买日期</div><div class="finput">${esc(p.purchaseDate)||'—'}</div></div><div class="fg"><div class="flabel">实收金额</div><div class="finput">¥${fmt(p.amountPaid)}</div></div><div class="fg full"><div class="flabel">影响范围</div><div class="finput" style="min-height:42px">${ent?`将同步作废课包余额「${esc(ent.packageName)}」，当前剩余 ${lessonQty(ent.remainingLessons)}/${lessonQty(ent.totalLessons)} 节。`:'未找到对应课包余额。'}</div></div>${blocked?`<div class="fg full"><div class="flabel">当前状态</div><div class="finput" style="min-height:42px">该购买记录已有课时消耗，不能直接作废。</div></div>`:`<div class="fg full"><div class="flabel">作废原因</div><textarea class="finput ftextarea" id="pur_void_reason" placeholder="例如：录错学员、重复购买、实际未付款"></textarea></div>`}</div><div class="mactions"><button class="btn-cancel" onclick="closeModal()">关闭</button>${blocked?'':`<button class="btn-save" onclick="voidPurchase('${p.id}')">确认作废</button>`}</div>`;
  document.getElementById('overlay').classList.add('open');
}
async function voidPurchase(id){
  const reason=document.getElementById('pur_void_reason')?.value.trim()||'';
  if(!reason){toast('请填写作废原因','warn');return;}
  const btn=document.querySelector('.btn-save');btn.disabled=true;btn.textContent='作废中…';
  try{
    await apiCall('DELETE','/purchases/'+id,{reason});
    await loadAll();
    closeModal();
    toast('购买记录已作废','success');
  }catch(e){toast('作废失败：'+e.message,'error');btn.disabled=false;btn.textContent='确认作废';}
}
async function savePurchase(){
  const studentId=document.getElementById('pur_studentId').value;
  if(!studentId){toast('请选择学员','warn');return;}
  const packageId=document.getElementById('pur_packageId').value;
  if(!packageId){toast('请选择课包','warn');return;}
  const btn=document.querySelector('.btn-save');btn.disabled=true;btn.textContent='保存中…';
  const data={studentId,packageId,ownerCoach:document.getElementById('pur_ownerCoach')?.value||'',saleCampusId:document.getElementById('pur_saleCampusId')?.value||'',allowedCoaches:[...document.querySelectorAll('.pur-allowed-coach-cb:checked')].map(cb=>cb.value),purchaseDate:document.getElementById('pur_purchaseDate').value,amountPaid:parseFloat(document.getElementById('pur_amountPaid').value)||0,overrideReason:document.getElementById('pur_overrideReason')?.value.trim()||'',payMethod:document.getElementById('pur_payMethod').value,notes:document.getElementById('pur_notes').value.trim()};
  if(campuses.length&&!data.saleCampusId){toast('请选择销售归属校区','warn');btn.disabled=false;btn.textContent='保存';return;}
  const systemAmount=Number(document.getElementById('pur_systemAmount')?.value)||0;
  if(systemAmount!==Number(data.amountPaid||0)&&!data.overrideReason){toast('请填写改价原因','warn');btn.disabled=false;btn.textContent='保存';return;}
  try{
    const res=await apiCall('POST','/purchases',data);
    if(res.purchase)purchases.unshift(res.purchase);
    if(res.entitlement)entitlements.unshift(res.entitlement);
    closeModal();toast('购买成功','success');renderStudents();renderPurchases();renderEntitlements();
  }catch(e){toast('保存失败：'+e.message,'error');btn.disabled=false;btn.textContent='保存';}
}
function focusPurchaseByPackage(packageId){
  goPage('purchases');
  const pkgEl=document.getElementById('purPackageFilter');
  if(pkgEl)pkgEl.value=packageId;
  renderPurchases();
}
function exportPurchaseCSV(){
  const list=getFilteredPurchases();
  let csv='购买日期,学员,售卖课包,课程产品,实收,剩余课时,总课时,有效开始,有效结束,支付方式,状态,备注\n';
  csv+=list.map(p=>{
    const ent=entitlements.find(e=>e.purchaseId===p.id)||{};
    return [p.purchaseDate||'',p.studentName||'',p.packageName||'',p.productName||'',parseFloat(p.amountPaid)||0,Number(ent.remainingLessons)||0,Number(ent.totalLessons)||0,ent.validFrom||'',ent.validUntil||'',p.payMethod||'',purchaseStatusText(p),'"'+String(p.notes||'').replace(/"/g,'""')+'"'].join(',');
  }).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FlowTennis_购买记录_'+today()+'.csv';a.click();toast('导出成功','success');
}
