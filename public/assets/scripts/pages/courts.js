// ===== 订场用户 =====
function renderCourtHeaderFilters(base){
  const ownerHost=document.getElementById('courtOwnerFilter');
  const accountHost=document.getElementById('courtAccountTypeFilter');
  const moreHost=document.getElementById('courtMoreActions');
  const pageSizeHost=document.getElementById('courtPageSize');
  const ownerOpts=[{value:'',label:'全部对接人'},...[...new Set(base.map(c=>String(c.owner||'').trim()).filter(Boolean))].map(v=>({value:v,label:v}))];
  if(ownerHost)ownerHost.innerHTML=renderCourtDropdownHtml('courtOwnerValue','全部对接人',ownerOpts,courtOwnerFilterValue,false,'onCourtToolbarFilterChange');
  if(accountHost)accountHost.innerHTML=renderCourtDropdownHtml('courtAccountTypeValue','全部账户',[{value:'',label:'全部账户'},{value:'普通',label:'普通'},{value:'会员',label:'会员'},{value:'储值',label:'储值'}],courtAccountTypeFilterValue,false,'onCourtToolbarFilterChange');
  if(moreHost)moreHost.innerHTML=renderCourtDropdownHtml('courtMoreActionValue','更多操作',[
    {value:courtBatchMode?'batch-exit':'batch-select',label:courtBatchMode?'退出批量':'批量选择'},
    {value:'import',label:'导入CSV'},
    {value:'migration',label:'财务迁移预览'},
    {value:'backup',label:'备份'}
  ],'',false,'handleCourtMoreAction');
  if(pageSizeHost)pageSizeHost.innerHTML=renderCourtDropdownHtml('courtPageSizeValue',`${courtPageSize}条/页`,[{value:'20',label:'20条/页'},{value:'50',label:'50条/页'},{value:'100',label:'100条/页'}],String(courtPageSize),false,'setCourtPageSize');
  updateCourtBatchButton();
}
function onCourtToolbarFilterChange(){
  courtOwnerFilterValue=document.getElementById('courtOwnerValue')?.value||'';
  courtAccountTypeFilterValue=document.getElementById('courtAccountTypeValue')?.value||'';
  courtPage=1;
  renderCourts();
}
function setCourtPageSize(value){
  const next=parseInt(value,10)||20;
  courtPageSize=next;
  courtPage=1;
  renderCourts();
}
function onCourtFilterChange(){
  courtPage=1;
  renderCourts();
}
function handleCourtMoreAction(value){
  const action=value||document.getElementById('courtMoreActionValue')?.value||'';
  if(action==='batch-select')setCourtBatchMode(true);
  if(action==='batch-exit')setCourtBatchMode(false);
  if(action==='import')openCourtImport();
  if(action==='migration')openCourtFinanceMigrationPreview();
  if(action==='backup')backupToObsidian();
  const holder=document.getElementById('courtMoreActionValue');
  if(holder)holder.value='';
  const dropdown=document.getElementById('courtMoreActionValue_dropdown');
  if(dropdown){
    const display=dropdown.querySelector('.tms-dropdown-display');
    if(display)display.textContent='更多操作';
    dropdown.querySelectorAll('.tms-dropdown-item').forEach(el=>el.classList.remove('active'));
  }
}
function setCourtSort(key){
  if(courtSortKey!==key){courtSortKey=key;courtSortDir='desc';}
  else if(courtSortDir==='desc')courtSortDir='asc';
  else{courtSortKey='';courtSortDir='desc';}
  courtPage=1;
  renderCourts();
}

function membershipPlansTableHtml(q=''){
  const rows=membershipPlans.filter(p=>searchHit(q,p.name,p.tierCode,p.notes));
  return `<div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th class="tms-sticky-l" style="width:170px;padding-left:20px">会员方案</th><th style="width:140px">档位</th><th style="width:120px">充值金额</th><th style="width:120px">赠送金额</th><th style="width:90px">折扣</th><th style="width:180px">售卖时间</th><th style="width:120px">方案状态</th><th style="width:560px">赠送权益</th><th style="width:180px">备注</th><th class="tms-sticky-r" style="width:168px;padding-right:20px;text-align:right">操作</th></tr></thead><tbody>${rows.map(p=>{const statusMeta=membershipPlanStatusMeta(p);const tierTagClass=membershipPlanTierTagClass(p.tierCode||p.name);const benefits=[{label:'大师公开课',count:parseInt(p.publicLessonCount)||0},{label:'穿线免手工费',count:parseInt(p.stringingLaborCount)||0},{label:'发球机免费',count:parseInt(p.ballMachineCount)||0},{label:'国家二级运动员陪打',count:parseInt(p.level2PartnerCount)||0},{label:'指定教练陪打',count:parseInt(p.designatedCoachPartnerCount)||0}].filter(x=>x.count>0).map(x=>`${x.label} ${x.count}次`).join('；')||'-';const actions=p.status==='active'?[`<span class="tms-action-link" onclick="toggleMembershipPlanStatus('${p.id}','inactive')">停售</span>`,`<span class="tms-action-link" onclick="openMembershipPlanModal('${p.id}')">编辑</span>`]:[`<span class="tms-action-link" onclick="confirmDel('${p.id}','${esc(p.name)}','membership-plan')">删除</span>`,`<span class="tms-action-link" onclick="toggleMembershipPlanStatus('${p.id}','active')">上架</span>`,`<span class="tms-action-link" onclick="openMembershipPlanModal('${p.id}')">编辑</span>`].filter(Boolean);return `<tr><td class="tms-sticky-l" style="padding-left:20px">${renderCourtCellText(p.name,false)}</td><td><span class="tms-tag ${tierTagClass}">${esc(renderCourtEmptyText(p.tierCode||p.name))}</span></td><td><div class="tms-cell-text">¥${fmt(p.rechargeAmount)}</div></td><td><div class="tms-cell-text">¥${fmt(p.bonusAmount)}</div></td><td>${renderCourtCellText(p.discountRate?Math.round((parseFloat(p.discountRate)||1)*100)/10+' 折':'')}</td><td>${renderCourtCellText(membershipPlanSaleWindowText(p),false)}</td><td><span class="tms-tag ${statusMeta.tagClass}">${statusMeta.text}</span></td><td><div class="tms-cell-text" style="white-space:normal;line-height:1.55;min-width:500px;max-width:none;color:#A3968F">${esc(benefits)}</div></td><td><div class="tms-text-remark" style="max-width:180px" title="${esc(p.notes||'')}">${esc(renderCourtEmptyText(p.notes))}</div></td><td class="tms-sticky-r tms-action-cell" style="width:168px;padding-right:20px;justify-content:flex-end">${actions.join('')}</td></tr>`;}).join('')||'<tr><td colspan="10"><div class="empty"><p>暂无会员方案</p></div></td></tr>'}</tbody></table></div></div>`;
}
function renderMembershipPlans(){
  const host=document.getElementById('membershipPlanBody');if(!host)return;
  const q=(document.getElementById('membershipPlanSearch')?.value||'').toLowerCase();
  host.innerHTML=membershipPlansTableHtml(q);
}
async function toggleMembershipPlanStatus(id,nextStatus){
  const plan=membershipPlans.find(x=>x.id===id);
  if(!plan)return;
  if(nextStatus==='active'){
    if(plan.saleEndDate&&plan.saleEndDate<today()){toast('活动时间已结束，请先调整售卖结束日期再上架','warn');return;}
  }
  const actionText=nextStatus==='active'?'上架':'停售';
  if(!await appConfirm(`确认${actionText}「${plan.name}」？`,{title:`确认${actionText}`,confirmText:`确认${actionText}`}))return;
  try{
    const updated=await apiCall('PUT','/membership-plans/'+id,{status:nextStatus});
    const index=membershipPlans.findIndex(x=>x.id===id);
    if(index>=0)membershipPlans[index]=updated;
    renderMembershipPlans();
    toast(`会员方案已${actionText}`,'success');
  }catch(e){
    toast(`${actionText}失败：${e.message}`,'error');
  }
}
function membershipVisibleCourt(account){
  const court=courts.find(c=>c.id===account?.courtId);
  if(!court||!isActiveCourtRecord(court))return null;
  return court;
}
function renderMembershipStats(rows=[]){
  const host=document.getElementById('membershipStatsRow');if(!host)return;
  const visibleCourtIds=new Set(rows.map(row=>row.court?.id||row.courtId));
  const validOrders=membershipOrders.filter(o=>visibleCourtIds.has(o.courtId)&&o.status!=='voided'&&o.status!=='refunded');
  const totalIncome=validOrders.reduce((sum,o)=>sum+(parseFloat(o.rechargeAmount)||0),0);
  const totalBalance=rows.reduce((sum,row)=>sum+courtFinanceLocal(row.court||membershipVisibleCourt(row)||{history:[]}).balance,0);
  const totalBookingCount=rows.reduce((sum,row)=>sum+membershipBookingCount(row.court||membershipVisibleCourt(row)||{history:[]}),0);
  host.innerHTML=`<div class="tms-stat-card"><div class="tms-stat-label">会员数</div><div class="tms-stat-value">${rows.length}<span>人</span></div></div><div class="tms-stat-card"><div class="tms-stat-label">订场次数</div><div class="tms-stat-value">${totalBookingCount}<span>次</span></div></div><div class="tms-stat-card"><div class="tms-stat-label">总收入金额</div><div class="tms-stat-value">¥${fmt(totalIncome)}</div></div><div class="tms-stat-card"><div class="tms-stat-label">总余额</div><div class="tms-stat-value">¥${fmt(totalBalance)}</div></div>`;
}
function renderMemberships(){
  const host=document.getElementById('membershipTabBody');if(!host)return;
  const q=(document.getElementById('membershipSearch')?.value||'').toLowerCase();
  const rows=courts.filter(court=>isActiveCourtRecord(court)).map(court=>({court,account:courtMembershipAccount(court.id)})).filter(row=>row.account&&membershipVisibleCourt(row.account)&&searchHit(q,row.court.name,row.court.phone,row.account.courtName,row.account.memberLabel,row.account.phone));
  renderMembershipStats(rows);
  host.innerHTML=`<div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="width:150px;padding-left:20px">会员姓名</th><th style="width:140px">手机号</th><th style="width:160px">当前会员</th><th style="width:120px">会员状态</th><th style="width:120px">当前余额</th><th style="width:100px">当前折扣</th><th style="width:120px">订场次数</th><th style="width:360px">可用权益</th><th style="width:150px">余额有效期</th><th style="width:150px">清零时间</th><th class="tms-sticky-r" style="width:160px;padding-right:20px;text-align:right">操作</th></tr></thead><tbody>${rows.map(({court,account:a})=>{const finance=courtFinanceLocal(court||{history:[]});const benefitRows=membershipBenefitRowsForAccount(a);const benefits=benefitRows.length?benefitRows.map(b=>`${b.label} ${b.remaining}/${b.total}`).join('；'):'—';const statusMeta=membershipStatusTagMeta(a);const tierLabel=courtMembershipTierLabel(a);const bookingCount=membershipBookingCount(court);return `<tr><td style="padding-left:20px">${renderCourtCellText(courtDisplayName(court)||a.courtName,false)}</td><td>${renderCourtCellText(court.phone)}</td><td>${['voided','cleared'].includes(a.status)||tierLabel==='-'?'-':`<span class="tms-tag ${courtMembershipTierTagClass(tierLabel)}">${esc(tierLabel)}</span>`}</td><td><span class="tms-tag ${statusMeta.tagClass}">${statusMeta.text}</span></td><td><div class="tms-cell-text">¥${fmt(finance.balance)}</div></td><td>${renderCourtCellText(['voided','cleared'].includes(a.status)?'-':(a.discountRate?Math.round((parseFloat(a.discountRate)||1)*100)/10+' 折':''))}</td><td><div class="tms-cell-text">${bookingCount}次</div></td><td><div class="tms-cell-text" style="white-space:normal;line-height:1.55;min-width:320px;color:#A3968F">${esc(benefits)}</div></td><td>${renderCourtCellText(['voided','cleared'].includes(a.status)?'-':a.validUntil,false)}</td><td>${renderCourtCellText(['voided','cleared'].includes(a.status)?'-':a.hardExpireAt,false)}</td><td class="tms-sticky-r tms-action-cell" style="width:160px;padding-right:20px;text-align:right"><span class="tms-action-link" onclick="openCourtMembershipPanel('${court.id}')">查看账户</span></td></tr>`;}).join('')||'<tr><td colspan="11"><div class="empty"><p>暂无会员账户</p></div></td></tr>'}</tbody></table></div></div>`;
}
function openMembershipOrdersAuditModal(){
  goPage('membership-orders');
}
function openMembershipLedgerAuditModal(){
  goPage('membership-ledger');
}
function renderMembershipOrdersAuditPage(){
  const host=document.getElementById('membershipOrdersAuditBody');if(!host)return;
  const q=(document.getElementById('membershipSearch')?.value||'').toLowerCase();
  const rows=membershipOrders.filter(o=>searchHit(q,o.courtName,o.membershipPlanName,o.notes));
  host.innerHTML=`<div class="tms-audit-note">此页面仅用于审计与追溯，不用于日常操作。</div><div class="tms-table-card" style="margin-bottom:0"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="padding-left:20px;width:120px">支付日期</th><th style="width:170px">录入时间</th><th style="width:120px">订场用户</th><th style="width:150px">会员方案</th><th style="width:100px">系统价</th><th style="width:100px">成交价</th><th style="width:110px">赠送金额</th><th style="width:90px">折扣</th><th style="width:120px">是否重置有效期</th><th style="width:140px">改价原因</th><th style="width:320px">当次权益摘要</th><th style="width:100px">状态</th></tr></thead><tbody>${rows.map(o=>`<tr><td style="padding-left:20px">${renderCourtCellText(o.purchaseDate)}</td><td>${renderCourtCellText(formatMembershipLedgerTime(o.createdAt),false)}</td><td>${renderCourtCellText(o.courtName)}</td><td>${renderCourtCellText(o.membershipPlanName)}</td><td><div class="tms-cell-text">¥${fmt(o.systemAmount??o.rechargeAmount)}</div></td><td><div class="tms-cell-text">¥${fmt(o.finalAmount??o.rechargeAmount)}</div></td><td><div class="tms-cell-text">¥${fmt(o.bonusAmount)}</div></td><td>${renderCourtCellText(membershipDiscountText(o.discountRate),false)}</td><td>${renderCourtCellText(o.qualifiesRenewalReset===false?'否':'是',false)}</td><td>${renderCourtCellText(o.overrideReason,false)}</td><td><div class="tms-cell-text" style="white-space:normal;line-height:1.55;min-width:320px">${membershipOrderBenefitSummaryHtml(o)}</div></td><td>${renderCourtCellText(membershipStatusText(o.status),false)}</td></tr>`).join('')||'<tr><td colspan="12"><div class="empty"><p>暂无会员购买记录</p></div></td></tr>'}</tbody></table></div></div>`;
}
function formatMembershipLedgerTime(value){
  const d=new Date(value||'');
  if(Number.isNaN(d.getTime()))return renderCourtEmptyText(value);
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function membershipLedgerActionText(action){
  return ({consume:'消耗',supplement:'补发',adjust:'调整',void:'作废'}[action]||renderCourtEmptyText(action));
}
function membershipLedgerOperatorText(operator){
  return renderCourtEmptyText(operator);
}
function renderMembershipLedgerAuditPage(){
  const host=document.getElementById('membershipLedgerAuditBody');if(!host)return;
  const q=(document.getElementById('membershipSearch')?.value||'').toLowerCase();
  const rows=membershipBenefitLedger.filter(l=>l.action!=='grant'&&searchHit(q,courts.find(c=>c.id===l.courtId)?.name,l.benefitLabel,l.reason,l.operator)).sort((a,b)=>String(b.createdAt||b.relatedDate||'').localeCompare(String(a.createdAt||a.relatedDate||'')));
  host.innerHTML=`<div class="tms-audit-note">此页面仅用于审计与追溯，不用于日常操作。</div><div class="tms-table-card" style="margin-bottom:0"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="padding-left:20px;width:170px">时间</th><th style="width:120px">订场用户</th><th style="width:150px">购买批次</th><th style="width:160px">权益</th><th style="width:90px">变动</th><th style="width:100px">动作</th><th style="width:120px">操作账号</th><th style="width:320px">原因</th></tr></thead><tbody>${rows.map(l=>{const delta=parseInt(l.delta)||0;return `<tr><td style="padding-left:20px">${renderCourtCellText(formatMembershipLedgerTime(l.createdAt||l.relatedDate),false)}</td><td>${renderCourtCellText(courts.find(c=>c.id===l.courtId)?.name||l.courtId)}</td><td>${renderCourtCellText(l.membershipOrderId)}</td><td>${renderCourtCellText(l.benefitLabel||l.benefitCode,false)}</td><td>${renderCourtCellText(`${delta>0?'+':''}${delta}`,false)}</td><td>${renderCourtCellText(membershipLedgerActionText(l.action),false)}</td><td>${renderCourtCellText(membershipLedgerOperatorText(l.operator))}</td><td><div class="tms-cell-text" style="white-space:normal;line-height:1.55;min-width:260px">${esc(renderCourtEmptyText(l.reason))}</div></td></tr>`;}).join('')||'<tr><td colspan="8"><div class="empty"><p>暂无权益流水</p></div></td></tr>'}</tbody></table></div></div>`;
}
function openMembershipPlanModal(id){
  editId=id;const p=id?membershipPlans.find(x=>x.id===id):null;
  const discountValue=String(parseFloat(rv(p,'discountRate'))||'');
  const statusOptions=[{value:'draft',label:'草稿'},{value:'active',label:'上架'},{value:'inactive',label:'停售'}];
  const discountOptions=[{value:'',label:'- 选择 -'},{value:'0.7',label:'7 折'},{value:'0.8',label:'8 折'},{value:'0.9',label:'9 折'},{value:'1',label:'原价'}];
  const body=`<div class="tms-section-header" style="margin-top:0;">基础信息</div><div class="tms-readonly-panel" style="margin-bottom:16px"><span class="tms-panel-tip">权益有效期固定 12 个月，余额最长按当前系统规则至 24 个月。创建后默认是草稿，需要手动上架；停售或已结束都不会影响已开通会员。</span><div id="membershipPlanPreview"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">方案名称 *</label><input class="finput tms-form-control" id="mp_name" value="${rv(p,'name')}" oninput="refreshMembershipPlanPreview()"></div><div class="tms-form-item"><label class="tms-form-label">会员档位 *</label><input class="finput tms-form-control" id="mp_tier" value="${rv(p,'tierCode')}" placeholder="例如：订场会员" oninput="refreshMembershipPlanPreview()"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">充值金额 *</label>${membershipStepperHtml('mp_recharge',rv(p,'rechargeAmount'),'1','例如 5000')}</div><div class="tms-form-item"><label class="tms-form-label">赠送金额</label>${membershipStepperHtml('mp_bonus',rv(p,'bonusAmount'),'1','例如 498')}</div><div class="tms-form-item"><label class="tms-form-label">折扣</label>${renderCourtDropdownHtml('mp_discount','折扣',discountOptions,discountValue,true,'refreshMembershipPlanPreview')}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">售卖开始日期</label>${courtDateButtonHtml('mp_saleStartDate',rv(p,'saleStartDate'),'售卖开始日期')}</div><div class="tms-form-item"><label class="tms-form-label">售卖结束日期</label>${courtDateButtonHtml('mp_saleEndDate',rv(p,'saleEndDate'),'售卖结束日期')}</div><div class="tms-form-item"><label class="tms-form-label">方案状态</label>${renderCourtDropdownHtml('mp_status','方案状态',statusOptions,rv(p,'status','draft'),true,'refreshMembershipPlanPreview')}</div></div><div class="tms-section-header">赠送权益</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">大师公开课</label>${membershipStepperHtml('mp_publicLesson',rv(p,'publicLessonCount'),'1')}</div><div class="tms-form-item"><label class="tms-form-label">穿线免手工费</label>${membershipStepperHtml('mp_stringingLabor',rv(p,'stringingLaborCount'),'1')}</div><div class="tms-form-item"><label class="tms-form-label">发球机免费</label>${membershipStepperHtml('mp_ballMachine',rv(p,'ballMachineCount'),'1')}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">国家二级运动员陪打</label>${membershipStepperHtml('mp_level2Partner',rv(p,'level2PartnerCount'),'1')}</div><div class="tms-form-item"><label class="tms-form-label">指定教练陪打</label><input class="finput tms-form-control" id="mp_designatedCoachPartner" type="number" step="1" value="${esc(membershipNumericValue(rv(p,'designatedCoachPartnerCount')))}" oninput="toggleMembershipCoachSelector('mp_designatedCoachPartner','mp_designatedCoachSection');refreshMembershipPlanPreview()"></div><div class="tms-form-item"></div></div><div class="tms-form-row"><div class="tms-form-item full-width" id="mp_designatedCoachSection" style="display:none"><label class="tms-form-label">选择指定教练</label>${membershipCoachSelectorHtml('mp_designatedCoachIdsWrap',parseArr(p?.designatedCoachIds))}</div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="mp_notes">${esc(rv(p,'notes'))}</textarea></div></div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="membershipPlanSaveBtn" onclick="saveMembershipPlan()">保存</button>`;
  setCourtModalFrame(id?'编辑会员方案':'新增会员方案',body,actions,'modal-wide');
  toggleMembershipCoachSelector('mp_designatedCoachPartner','mp_designatedCoachSection');
  ['mp_recharge','mp_bonus','mp_publicLesson','mp_stringingLabor','mp_ballMachine','mp_level2Partner'].forEach(id=>{const el=document.getElementById(id);if(el)el.setAttribute('oninput','refreshMembershipPlanPreview()');});
  refreshMembershipPlanPreview();
}
async function saveMembershipPlan(){
  const name=document.getElementById('mp_name').value.trim();
  const tierInput=document.getElementById('mp_tier');
  if(tierInput&&!tierInput.value.trim())tierInput.value=membershipTierCodeValue(name);
  const saleStartDate=document.getElementById('mp_saleStartDate').value;
  const saleEndDate=document.getElementById('mp_saleEndDate').value;
  const status=document.getElementById('mp_status').value||'draft';
  if(saleStartDate&&saleEndDate&&saleEndDate<saleStartDate){toast('售卖结束日期不能早于售卖开始日期','warn');return;}
  if(status==='active'){
    if(saleEndDate&&saleEndDate<today()){toast('活动时间已结束，请先调整售卖结束日期再上架','warn');return;}
    if(saleStartDate&&saleStartDate<today())toast('售卖开始日期早于今天，系统会按历史方案正常保存','warn');
  }
  const data={name,tierCode:tierInput.value.trim(),rechargeAmount:parseFloat(document.getElementById('mp_recharge').value)||0,discountRate:parseFloat(document.getElementById('mp_discount').value)||0,bonusAmount:parseFloat(document.getElementById('mp_bonus').value)||0,saleStartDate,saleEndDate,publicLessonCount:parseInt(document.getElementById('mp_publicLesson').value)||0,stringingLaborCount:parseInt(document.getElementById('mp_stringingLabor').value)||0,ballMachineCount:parseInt(document.getElementById('mp_ballMachine').value)||0,level2PartnerCount:parseInt(document.getElementById('mp_level2Partner').value)||0,designatedCoachPartnerCount:parseInt(document.getElementById('mp_designatedCoachPartner').value)||0,designatedCoachIds:membershipCoachSelectorValues('mp_designatedCoachIdsWrap'),notes:document.getElementById('mp_notes').value.trim(),status};
  const btn=document.getElementById('membershipPlanSaveBtn');if(btn){btn.disabled=true;btn.textContent='保存中…';}
  try{if(editId){const r=await apiCall('PUT','/membership-plans/'+editId,data);const i=membershipPlans.findIndex(x=>x.id===editId);membershipPlans[i]=r;}else{const r=await apiCall('POST','/membership-plans',data);membershipPlans.unshift(r);}closeModal();renderMembershipPlans();renderMemberships();toast('会员方案已保存','success');}catch(e){if(btn){btn.disabled=false;btn.textContent='保存';}toast('保存失败：'+e.message,'error');}
}
function refreshMembershipOrderPreview(mode='renew'){
  const courtId=document.getElementById('mo_courtId')?.value||'';
  const court=courts.find(c=>c.id===courtId);
  const account=courtMembershipAccount(courtId);
  const planId=document.getElementById('mo_plan')?.value||'';
  const plan=membershipPlans.find(p=>p.id===planId)||membershipPlans[0];
  const purchaseDate=document.getElementById('mo_date')?.value||today();
  const rechargeAmount=document.getElementById('mo_recharge')?.value;
  const bonusAmount=document.getElementById('mo_bonus')?.value;
  const preview=membershipOrderPreview({court,account,plan,rechargeAmount,bonusAmount,purchaseDate});
  const previewEl=document.getElementById('membershipOrderPreview');
  if(previewEl)previewEl.innerHTML=`<div class="flabel">当前状态摘要</div><div style="font-size:12px;color:var(--tb);margin-bottom:8px">${esc(preview.currentStatus)}</div><div class="flabel">本次会发生什么</div><div style="font-size:12px;color:var(--tb);line-height:1.7">是否重置有效期：${preview.resetsValidity?'是':'否'}<br>折扣变化：${esc(preview.nextDiscountText)}<br>原有权益保留：${preview.keepsExistingBenefits?'保留':'无原有权益'}<br>本次新增权益：${esc(preview.addedBenefits)}<br>新的余额有效期：${esc(preview.nextValidUntil)}<br>新的最晚清零日：${esc(preview.nextHardExpireAt)}</div>${preview.warning?`<div style="margin-top:8px;background:rgba(220,38,38,0.08);border:0.5px solid rgba(220,38,38,0.2);border-radius:8px;padding:8px 10px;color:#b91c1c;font-size:12px">${esc(preview.warning)}</div>`:''}`;
  const saveBtn=document.getElementById('membershipOrderSaveBtn');
  if(saveBtn)saveBtn.textContent=preview.warning?'我了解折扣和有效期变化，确认续充':'保存';
}
function toggleMembershipPriceOverride(){
  const systemAmount=Number(document.getElementById('mo_systemAmount')?.value)||0;
  const finalAmount=Number(document.getElementById('mo_recharge')?.value)||0;
  const wrap=document.getElementById('mo_overrideReasonWrap');
  const reason=document.getElementById('mo_overrideReason');
  const changed=systemAmount!==finalAmount;
  if(wrap)wrap.style.display=changed?'block':'none';
  if(!changed&&reason)reason.value='';
}
function openMembershipOrderModal(courtId,mode='renew'){
  const court=courts.find(c=>c.id===courtId);if(!court){toast('当前订场用户数据未加载，请刷新后重试','warn');return;}
  const account=courtMembershipAccount(courtId);
  const activePlans=membershipPlans.filter(p=>p.status!=='inactive');
  if(!activePlans.length){toast('请先创建会员方案','warn');return;}
  const firstPlanId=activePlans[0]?.id||'';
  const title=mode==='first_open'?'首次开卡':mode==='reopen'?'重新开卡':'续充会员';
  resetModalActions();
  document.getElementById('mTitle').textContent=`${court.name} · ${title}`;
  document.getElementById('mBody').innerHTML=`<input type="hidden" id="mo_courtId" value="${esc(courtId)}"><div style="background:rgba(217,119,6,0.08);border:0.5px solid rgba(217,119,6,0.18);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--tb);margin-bottom:12px">余额有效期按支付日期起算 12 个月<br>若到期时仍有余额，可自动进入延续期，最长至 24 个月<br>低于原合规档位续充时，余额有效期不会重置<br>每批赠送权益有效期 12 个月<br>余额由充值和消费自动计算，不能在这里手动改<br>系统创建日期只用于留痕，不影响会员有效期<br>当前订场折扣按最近一次充值档位生效</div><div id="membershipOrderPreview" style="background:rgba(255,255,255,0.48);border:0.5px solid rgba(180,83,9,0.12);border-radius:8px;padding:10px 12px;margin-bottom:12px"></div><div class="fgrid"><div class="fg full"><div class="flabel">会员方案 *</div><select class="fselect" id="mo_plan" onchange="applyMembershipOrderDraft(this.value);refreshMembershipOrderPreview('${mode}');toggleMembershipPriceOverride()">${activePlans.map(p=>`<option value="${p.id}">${esc(p.name)} · ¥${fmt(p.rechargeAmount)}</option>`).join('')}</select></div><div class="fg"><div class="flabel">支付日期</div>${courtDateButtonHtml("mo_date",today(),"支付日期")}</div><div class="fg"><div class="flabel">系统价格</div><input class="finput" id="mo_systemAmount" type="number" value="0" readonly></div><div class="fg"><div class="flabel">实收/充值金额</div>${membershipStepperHtml('mo_recharge','','1','默认取方案金额')}</div><div class="fg"><div class="flabel">赠送金额</div>${membershipStepperHtml('mo_bonus','','1','默认取方案赠送')}</div><div class="fg full" id="mo_overrideReasonWrap" style="display:none"><div class="flabel">改价原因</div><input class="finput" id="mo_overrideReason" placeholder="实际成交价与系统价格不一致时必填"></div><div class="fg full"><details><summary class="flabel" style="cursor:pointer">本次额外赠送</summary><div style="font-size:12px;color:var(--ts);margin:8px 0 10px">仅影响本次购买，不回写会员方案</div><div class="fgrid"><div class="fg"><div class="flabel">大师公开课本次调整</div>${membershipStepperHtml('mo_publicLesson','','1')}</div><div class="fg"><div class="flabel">穿线免手工费本次调整</div>${membershipStepperHtml('mo_stringingLabor','','1')}</div><div class="fg"><div class="flabel">发球机免费本次调整</div>${membershipStepperHtml('mo_ballMachine','','1')}</div><div class="fg"><div class="flabel">国家二级运动员陪打本次调整</div>${membershipStepperHtml('mo_level2Partner','','1')}</div><div class="fg"><div class="flabel">指定教练陪打本次调整</div><input class="finput" id="mo_designatedCoachPartner" type="number" step="1" oninput="toggleMembershipCoachSelector('mo_designatedCoachPartner','mo_designatedCoachSection')"></div><div class="fg full" id="mo_designatedCoachSection" style="display:none"><div class="flabel">选择指定教练</div><div id="mo_designatedCoachWrap">${membershipCoachSelectorHtml('mo_designatedCoachIdsWrap',[])}</div><div style="font-size:12px;color:var(--ts);margin-top:6px">指定教练范围本次调整</div></div></div></details></div><div class="fg full"><div class="flabel">备注</div><textarea class="finput ftextarea" id="mo_notes"></textarea></div></div><div class="mactions"><button class="btn-cancel" onclick="closeModal()">取消</button><button class="btn-save" id="membershipOrderSaveBtn" onclick="saveMembershipOrder('${courtId}')">保存</button></div>`;
  document.getElementById('overlay').classList.add('open');
  if(firstPlanId)applyMembershipOrderDraft(firstPlanId);
  ['mo_recharge','mo_bonus'].forEach(id=>{const el=document.getElementById(id);if(el)el.setAttribute('oninput',`refreshMembershipOrderPreview('${mode}');toggleMembershipPriceOverride()`)});
  const moDateEl=document.getElementById('mo_date');if(moDateEl)moDateEl.addEventListener('change',()=>refreshMembershipOrderPreview(mode));
  toggleMembershipPriceOverride();
  refreshMembershipOrderPreview(mode);
}
async function saveMembershipOrder(courtId){
  const data={courtId,membershipAccountId:courtMembershipAccount(courtId)?.id||'',membershipPlanId:document.getElementById('mo_plan').value,purchaseDate:document.getElementById('mo_date').value,rechargeAmount:document.getElementById('mo_recharge').value,bonusAmount:document.getElementById('mo_bonus').value,overrideReason:document.getElementById('mo_overrideReason')?.value.trim()||'',publicLessonCount:parseInt(document.getElementById('mo_publicLesson').value)||0,stringingLaborCount:parseInt(document.getElementById('mo_stringingLabor').value)||0,ballMachineCount:parseInt(document.getElementById('mo_ballMachine').value)||0,level2PartnerCount:parseInt(document.getElementById('mo_level2Partner').value)||0,designatedCoachPartnerCount:parseInt(document.getElementById('mo_designatedCoachPartner').value)||0,designatedCoachIds:membershipCoachSelectorValues('mo_designatedCoachIdsWrap'),notes:document.getElementById('mo_notes').value.trim(),requestKey:`${courtId}-${Date.now()}`};
  if(!data.membershipPlanId){toast('请先创建会员方案','warn');return;}
  const systemAmount=Number(document.getElementById('mo_systemAmount')?.value)||0;
  if(systemAmount!==Number(data.rechargeAmount||0)&&!data.overrideReason){toast('请填写改价原因','warn');return;}
  const btn=document.getElementById('membershipOrderSaveBtn');if(btn){btn.disabled=true;btn.textContent='提交中…';}
  try{
    const built=await apiCall('POST','/membership-orders',data);
    if(built?.account){
      const ai=membershipAccounts.findIndex(x=>x.id===built.account.id);
      if(ai>=0)membershipAccounts[ai]=built.account;else membershipAccounts.unshift(built.account);
    }
    if(built?.order)membershipOrders.unshift(built.order);
    if(Array.isArray(built?.benefitLedgerRows))built.benefitLedgerRows.filter(Boolean).forEach(x=>membershipBenefitLedger.unshift(x));
    if(built?.historyRow){
      const ci=courts.findIndex(x=>x.id===courtId);
      if(ci>=0){
        const court={...courts[ci]};
        court.history=[...parseArr(court.history),built.historyRow];
        courts[ci]=court;
      }
    }
    closeModal();toast('会员已保存','success');renderMemberships();renderCourts();
  }catch(e){if(btn){btn.disabled=false;btn.textContent='保存';}toast('保存失败：'+e.message,'error');}
}
function openMembershipBenefitModal(courtId,mode){
  const account=courtMembershipAccount(courtId);if(!account){toast('该订场用户还没有会员账户','warn');return;}
  openMembershipBenefitPickerModal(courtId,mode);
}
function openMembershipBenefitPickerModal(courtId,mode){
  const account=courtMembershipAccount(courtId);if(!account){toast('该订场用户还没有会员账户','warn');return;}
  const rows=membershipBenefitRowsForAccount(account);
  if(!rows.length){toast('该订场用户当前没有可操作的赠送权益','warn');return;}
  const actionText=mode==='consume'?'消耗':'补发';
  const body=`<div class="tms-section-header" style="margin-top:0;">选择权益类型</div><div class="tms-table-card" style="margin-bottom:0"><div class="tms-table-wrapper" style="max-height:360px"><table class="tms-table" style="min-width:620px"><thead><tr><th style="padding-left:20px">权益</th><th style="width:140px">当前剩余</th><th style="width:120px;text-align:right;padding-right:20px">操作</th></tr></thead><tbody>${rows.map(row=>`<tr><td style="padding-left:20px">${renderCourtCellText(row.label+membershipBenefitNote(row),false)}</td><td>${renderCourtCellText(`${row.remaining}/${row.total}${row.unit}`,false)}</td><td style="text-align:right;padding-right:20px"><span class="tms-action-link" onclick="openMembershipBenefitActionModal('${courtId}','${row.code}','${mode}')">${actionText}</span></td></tr>`).join('')}</tbody></table></div></div>`;
  setCourtModalFrame(`${actionText}权益`,body,`<button class="tms-btn tms-btn-default" onclick="openCourtMembershipPanel('${courtId}')">返回会员账户</button>`,'modal-wide');
}
function refreshMembershipBenefitConsumePreview(courtId,benefitCode){
  const account=courtMembershipAccount(courtId);if(!account)return;
  const count=document.getElementById('mb_count')?.value||1;
  const preview=membershipBenefitConsumePreview(account,benefitCode,count);
  const el=document.getElementById('membershipBenefitConsumePreview');
  if(!el)return;
  el.innerHTML=`当前总剩余：${preview.totalRemaining} 次<br>优先扣减批次：${preview.allocations.map(row=>`${row.membershipOrderId}（到期 ${row.benefitValidUntil||'—'}）-${row.delta}`).join('；')||'—'}${preview.allocations.length>1?'<br>如果当前批次不足，将继续扣减下一批':''}`;
}
function openMembershipBenefitActionModal(courtId,benefitCode,mode){
  const account=courtMembershipAccount(courtId);if(!account){toast('该订场用户还没有会员账户','warn');return;}
  const label=membershipBenefitLabelForCode(benefitCode,account);
  const orders=membershipOrdersForAccount(account.id);
  const latestOrder=orders[0];
  resetModalActions();
  document.getElementById('mTitle').textContent=mode==='consume'?`消耗 1 次 · ${label}`:`补发权益 · ${label}`;
  document.getElementById('mBody').innerHTML=`<div class="fgrid"><div class="fg"><div class="flabel">权益名称</div><div class="finput">${esc(label)}</div></div><div class="fg"><div class="flabel">次数</div><input class="finput" id="mb_count" type="number" value="1" oninput="${mode==='consume'?'refreshMembershipBenefitConsumePreview(\''+courtId+'\',\''+benefitCode+'\')':''}"></div>${mode==='consume'?`<div class="fg full"><div class="flabel">扣减预览</div><div id="membershipBenefitConsumePreview" style="font-size:12px;color:var(--tb);background:rgba(255,255,255,0.45);border:0.5px solid rgba(180,83,9,0.12);border-radius:8px;padding:10px 12px"></div></div>`:''}${mode==='supplement'?`<div class="fg full"><div class="flabel">归属购买批次 *</div><select class="fselect" id="mb_order">${orders.map(o=>`<option value="${o.id}" ${latestOrder?.id===o.id?'selected':''}>${esc(o.purchaseDate)} · ${esc(o.membershipPlanName)}</option>`).join('')}</select><div style="font-size:12px;color:var(--ts);margin-top:6px">本次补发会记入所选购买批次的权益调整，不会生成新的购买记录</div></div>`:''}<div class="fg full"><div class="flabel">原因</div><input class="finput" id="mb_reason" value="${mode==='consume'?'会员权益使用':'会员权益补发'}"></div></div><div class="mactions"><button class="btn-cancel" onclick="openMembershipBenefitPickerModal('${courtId}','${mode}')">返回选择权益</button><button class="btn-save" id="membershipBenefitSaveBtn" onclick="saveMembershipBenefit('${courtId}','${mode}','${benefitCode}')">${mode==='consume'?'确认消耗':'确认补发'}</button></div>`;
  document.getElementById('overlay').classList.add('open');
  if(mode==='consume')refreshMembershipBenefitConsumePreview(courtId,benefitCode);
}
function openMembershipBenefitHistoryModal(courtId,benefitCode){
  const account=courtMembershipAccount(courtId);if(!account){toast('该订场用户还没有会员账户','warn');return;}
  const label=membershipBenefitLabelForCode(benefitCode,account);
  const rows=membershipBenefitLedger.filter(l=>l.membershipAccountId===account.id&&l.benefitCode===benefitCode&&l.action!=='grant').sort((a,b)=>String(b.createdAt||b.relatedDate||'').localeCompare(String(a.createdAt||a.relatedDate||'')));
  resetModalActions();
  document.getElementById('mTitle').textContent=`权益流水 · ${label}`;
  document.getElementById('mBody').innerHTML=`<div class="rec-list" style="max-height:320px">${rows.length?rows.map(r=>`<div class="rec-item"><span class="rec-date">${esc(r.createdAt||r.relatedDate)||'—'}</span><span class="badge ${parseInt(r.delta)<0?'b-red':'b-green'}" style="font-size:10px">${parseInt(r.delta)<0?'扣减':'补发'}</span><span class="rec-note">${esc(r.reason)||'—'} · 批次 ${esc(r.membershipOrderId)||'—'} · ${r.delta}</span></div>`).join(''):'<div class="empty"><p>暂无权益流水</p></div>'}</div>`;
  document.getElementById('overlay').classList.add('open');
}
function openCourtMembershipLedgerModal(courtId){
  const account=courtMembershipAccount(courtId);if(!account){toast('该订场用户还没有会员账户','warn');return;}
  const rows=membershipBenefitLedger.filter(l=>l.membershipAccountId===account.id&&l.action!=='grant').sort((a,b)=>String(b.createdAt||b.relatedDate||'').localeCompare(String(a.createdAt||a.relatedDate||'')));
  const body=`<div class="tms-section-header" style="margin-top:0;">历史记录</div><div class="rec-list" style="max-height:520px;overflow:auto">${rows.length?rows.map(r=>{const delta=parseInt(r.delta)||0;const type=delta<0?'消耗':'补发';return `<div class="rec-item"><span class="rec-date">${esc(String(r.createdAt||r.relatedDate||'').replace('T',' ').slice(0,16))||'—'}</span><span class="badge ${delta<0?'b-red':'b-green'}" style="font-size:10px">${type}</span><span class="rec-amt ${delta<0?'minus':'plus'}">${delta>0?'+':''}${delta}${esc(r.unit||'次')}</span><span class="rec-note">${esc(r.benefitLabel||r.benefitCode||'-')} · 批次 ${esc(r.membershipOrderId||'-')} · ${esc(renderCourtEmptyText(r.reason))}</span></div>`;}).join(''):'<div class="empty"><p>暂无权益流水</p></div>'}</div>`;
  setCourtModalFrame('查看全部权益流水',body,`<button class="tms-btn tms-btn-default" onclick="openCourtMembershipPanel('${courtId}')">返回会员账户</button>`,'modal-wide');
}
function openCourtMembershipBenefitsModal(courtId){
  const court=courts.find(c=>c.id===courtId);if(!court){toast('订场用户不存在','warn');return;}
  document.getElementById('mTitle').textContent=`${court.name} · 赠送权益`;
  document.getElementById('mBody').innerHTML=`<div style="margin-bottom:12px">${courtMembershipBenefitRowsHtml(court)}</div><div class="mactions"><button class="btn-cancel" onclick="closeModal()">关闭</button><button class="btn-save" onclick="openCourtMembershipLedgerModal('${courtId}')">查看全部权益流水</button></div>`;
  document.getElementById('overlay').classList.add('open');
}
async function saveMembershipBenefit(courtId,mode,benefitCode=''){
  const account=courtMembershipAccount(courtId);if(!account)return;
  const count=Math.abs(parseInt(document.getElementById('mb_count').value)||1);
  const label=membershipBenefitLabelForCode(benefitCode,account);
  const data={membershipAccountId:account.id,courtId,benefitCode,benefitLabel:label,delta:mode==='consume'?-count:count,action:mode,reason:document.getElementById('mb_reason').value.trim(),relatedDate:today()};
  if(mode==='supplement')data.membershipOrderId=document.getElementById('mb_order').value;
  const btn=document.getElementById('membershipBenefitSaveBtn');if(btn){btn.disabled=true;btn.textContent='保存中…';}
  try{
    const r=await apiCall('POST','/membership-benefit-ledger',data);
    const rows=Array.isArray(r?.records)?r.records:[r];
    rows.filter(Boolean).forEach(x=>membershipBenefitLedger.unshift(x));
    closeModal();
    renderMemberships();
    renderCourts();
    toast('权益流水已保存','success');
  }catch(e){if(btn){btn.disabled=false;btn.textContent=mode==='consume'?'确认消耗':'确认补发';}toast('保存失败：'+e.message,'error');}
}
async function voidMembership(courtId){
  const account=courtMembershipAccount(courtId);if(!account){toast('该订场用户还没有会员账户','warn');return;}
  const reason=window.prompt('请输入作废原因','手动作废会员');
  if(reason===null)return;
  if(!confirm('确定作废会员账户？作废后折扣失效，权益不可再使用。'))return;
  try{
    const res=await apiCall('PUT','/membership-accounts/'+account.id,{status:'voided',voidReason:reason});
    const nextAccount=res?.account||res;
    const nextEvent=res?.event||null;
    const i=membershipAccounts.findIndex(x=>x.id===account.id);
    if(i>=0)membershipAccounts[i]=nextAccount;
    if(nextEvent)membershipAccountEvents.unshift(nextEvent);
    renderCourts();renderMemberships();
    if(document.getElementById('overlay').classList.contains('open'))openCourtMembershipPanel(courtId);
    toast('会员已作废','success');
  }catch(e){toast('作废失败：'+e.message,'error');}
}
function updateCourtBatchButton(){
  const toolbar=document.getElementById('courtBatchToolbar');
  const count=document.getElementById('courtBatchCount');
  const btn=document.getElementById('courtBatchDelBtn');
  const cancelBtn=document.getElementById('courtBatchCancelBtn');
  if(toolbar)toolbar.style.display=courtBatchMode?'flex':'none';
  if(count)count.textContent=`已选 ${selectedCourtIds.size} 条`;
  if(cancelBtn)cancelBtn.style.display=courtBatchMode?'inline-flex':'none';
  if(!btn)return;
  btn.style.display=courtBatchMode?'inline-flex':'none';
  btn.disabled=selectedCourtIds.size===0;
  btn.textContent=selectedCourtIds.size?`批量删除（${selectedCourtIds.size}）`:'批量删除';
}
function setCourtBatchMode(enabled){
  courtBatchMode=!!enabled;
  if(!courtBatchMode){
    selectedCourtIds.clear();
    const selectAll=document.getElementById('courtSelectAll');
    if(selectAll)selectAll.checked=false;
  }
  renderCourts();
}
function toggleCourtSelection(id,checked){
  if(!courtBatchMode)return;
  if(checked)selectedCourtIds.add(id);else selectedCourtIds.delete(id);
  updateCourtBatchButton();
}
function toggleCourtPageSelection(checked){
  if(!courtBatchMode)return;
  document.querySelectorAll('.court-row-cb').forEach(cb=>{cb.checked=checked;if(checked)selectedCourtIds.add(cb.value);else selectedCourtIds.delete(cb.value);});
  updateCourtBatchButton();
}
function renderCourtDropdownHtml(id,label,options,value,isForm=false,onchange=''){
  const list=(options||[]).map(opt=>typeof opt==='string'?{value:opt,label:opt}:opt);
  const active=list.find(opt=>String(opt.value)===String(value))||list.find(opt=>opt.active)||null;
  const displayLabel=active?(active.label||active.value):label;
  return `<div class="tms-dropdown ${isForm?'tms-dropdown-form':''}" id="${id}_dropdown" data-target="${id}" data-onchange="${onchange}" onclick="toggleCourtDropdown('${id}',event)"><input type="hidden" id="${id}" value="${esc(active?.value||value||'')}"><div class="tms-dropdown-display">${esc(displayLabel)}</div><div class="tms-dropdown-menu" style="touch-action:pan-y;-webkit-overflow-scrolling:touch" onwheel="event.stopPropagation();event.preventDefault();this.scrollTop += event.deltaY" ontouchmove="event.stopPropagation()">${list.map(opt=>`<div class="tms-dropdown-item ${active&&String(opt.value)===String(active.value)?'active':''}" onclick="selectCourtDropdownItem('${id}',${jsArg(opt.value)},${jsArg(opt.label||opt.value)},event)">${esc(opt.label||opt.value)}</div>`).join('')}</div></div>`;
}
function closeCourtDropdowns(){
  document.querySelectorAll('.tms-dropdown.open').forEach(el=>{
    el.classList.remove('open');
    el.classList.remove('open-upward');
    const formItem=el.closest('.tms-form-item');
    if(formItem)formItem.style.zIndex='1';
  });
}
function toggleCourtDropdown(id,event){
  if(event)event.stopPropagation();
  const dropdown=document.getElementById(id+'_dropdown');
  if(!dropdown)return;
  document.querySelectorAll('.tms-dropdown.open').forEach(el=>{
    if(el!==dropdown){
      el.classList.remove('open');
      const formItem=el.closest('.tms-form-item');
      if(formItem)formItem.style.zIndex='1';
    }
  });
  dropdown.classList.toggle('open');
  dropdown.classList.remove('open-upward');
  if(dropdown.classList.contains('open')){
    const menu=dropdown.querySelector('.tms-dropdown-menu');
    if(menu){
      const rect=dropdown.getBoundingClientRect();
      const container=dropdown.closest('.mbody');
      const containerRect=container?container.getBoundingClientRect():{top:0,bottom:window.innerHeight};
      const spaceBelow=Math.min(window.innerHeight,containerRect.bottom)-rect.bottom;
      const spaceAbove=rect.top-Math.max(0,containerRect.top);
      const menuHeight=Math.min(menu.scrollHeight||0,250);
      if(spaceBelow<menuHeight+12&&spaceAbove>spaceBelow)dropdown.classList.add('open-upward');
    }
  }
  const formItem=dropdown.closest('.tms-form-item');
  if(formItem)formItem.style.zIndex=dropdown.classList.contains('open')?'10':'1';
}
function selectCourtDropdownItem(id,value,label,event){
  if(event)event.stopPropagation();
  const dropdown=document.getElementById(id+'_dropdown');
  const input=document.getElementById(id);
  if(input)input.value=value;
  if(dropdown){
    const display=dropdown.querySelector('.tms-dropdown-display');
    if(display)display.textContent=label;
    dropdown.querySelectorAll('.tms-dropdown-item').forEach(el=>el.classList.remove('active'));
    const current=[...dropdown.querySelectorAll('.tms-dropdown-item')].find(el=>el.textContent===label);
    if(current)current.classList.add('active');
    dropdown.classList.remove('open');
    const formItem=dropdown.closest('.tms-form-item');
    if(formItem)formItem.style.zIndex='1';
    const cb=dropdown.dataset.onchange;
    if(cb&&typeof window[cb]==='function')window[cb](value,label);
  }
}
function setCourtDropdownValue(id,value,label=''){
  const input=document.getElementById(id);
  const dropdown=document.getElementById(id+'_dropdown');
  if(input)input.value=value;
  if(!dropdown)return;
  const items=[...dropdown.querySelectorAll('.tms-dropdown-item')];
  items.forEach(el=>el.classList.remove('active'));
  const hit=items.find(el=>el.textContent===String(label||'')||el.textContent===String(value||''));
  if(hit)hit.classList.add('active');
  const display=dropdown.querySelector('.tms-dropdown-display');
  if(display)display.textContent=label||hit?.textContent||dropdown.dataset.label||'';
}
document.addEventListener('click',closeCourtDropdowns);
function renderCourtMiniBar(amount,total=0,low=false){
  const safeAmount=Math.max(0,parseFloat(amount)||0);
  const safeTotal=Math.max(safeAmount,parseFloat(total)||0);
  const pct=safeTotal>0?Math.min(100,Math.round(safeAmount/safeTotal*100)):0;
  return `<div class="tms-mini-bar"><div class="tms-mini-bar-bg" style="width:100%"></div><div class="tms-mini-bar-fill" style="width:${pct}%"></div><div class="tms-mini-bar-text">¥${fmt(safeAmount)}${low?' · 低余额':''}</div></div>`;
}
function renderCourtCellText(value,mutedWhenEmpty=true){
  const raw=String(value??'').trim();
  const text=renderCourtEmptyText(raw);
  const muted=!raw||raw==='-'||raw==='—'||raw==='未开卡'||(mutedWhenEmpty&&raw==='未分配');
  return `<div class="tms-cell-text${muted?' is-muted':''}">${esc(text)}</div>`;
}
function renderCourtEmptyText(value){
  const raw=String(value??'').trim();
  return raw&&raw!=='—'?raw:'-';
}
function courtDateButtonHtml(id,value,label='年 / 月 / 日',onchange=''){
  const show=value||label;
  const handler=onchange?`;${onchange}`:'';
  return `<div class="filter-date-wrap"><button class="coach-date-btn" id="${id}_btn" onclick="toggleGlobalDatePicker(event,'${id}','${id}_btn','${label}')" type="button">${esc(show)}</button><input class="filter-hidden-date" id="${id}" type="date" value="${esc(value||'')}" onchange="syncDateButton('${id}','${id}_btn','${label}')${handler}"></div>`;
}
function scheduleDateTimeControls(prefix,value='',label='日期'){
  const raw=String(value||'').trim().replace(' ','T');
  const datePart=raw?raw.slice(0,10):'';
  const timePart=raw&&raw.length>=16?raw.slice(11,16):'';
  return `<div class="court-date-row"><div style="flex:1">${courtDateButtonHtml(prefix+'_date',datePart,label)}</div><div style="width:132px">${renderCourtDropdownHtml(prefix+'_time','时间',getCourtTimeOptions(timePart||'08:00'),timePart||'08:00',true,'refreshSchEntitlementOptions')}</div></div>`;
}
function scheduleTimeRangeControls(dateValue='',startValue='09:00',endValue='10:00'){
  return `<div class="court-date-row schedule-time-range"><div style="flex:0 0 184px;width:184px">${courtDateButtonHtml('sch_date',dateValue,'上课日期')}</div><div style="flex:0 0 116px;width:116px">${renderCourtDropdownHtml('sch_startTime','开始时间',getCourtTimeOptions(startValue||'09:00'),startValue||'09:00',true,'refreshSchEntitlementOptions')}</div><div style="flex:0 0 auto;align-self:center;color:#8C7B6E;font-size:12px;white-space:nowrap">至</div><div style="flex:0 0 116px;width:116px">${renderCourtDropdownHtml('sch_endTime','结束时间',getCourtTimeOptions(endValue||'10:00'),endValue||'10:00',true,'refreshSchEntitlementOptions')}</div></div>`;
}
function scheduleComposeDateTime(dateId,timeId){
  const date=document.getElementById(dateId)?.value||'';
  const time=document.getElementById(timeId)?.value||'';
  if(!date)return '';
  return `${date} ${time||'00:00'}`;
}
function setCourtModalFrame(title,bodyHtml,actionsHtml='',extraClass='modal-tight'){
  const ov=document.getElementById('overlay');
  if(modalCleanupTimer){clearTimeout(modalCleanupTimer);modalCleanupTimer=null;}
  const modal=ov.querySelector('.modal');
  const actions=document.getElementById('mActions');
  if(modal)modal.className=`modal modal-court ${extraClass}`.trim();
  document.getElementById('mTitle').textContent=title;
  document.getElementById('mBody').innerHTML=bodyHtml;
  if(actions){
    actions.innerHTML=actionsHtml||'';
    actions.style.display=actionsHtml?'flex':'none';
    actions.className='mactions';
  }
  ov.classList.add('open');
}
function resetModalActions(){
  const actions=document.getElementById('mActions');
  if(!actions)return;
  actions.innerHTML='';
  actions.style.display='none';
  actions.className='mactions';
}
function renderCourtHistoryItems(hist){
  return hist.length?hist.map(h=>{
    const type=h.type||'消费';
    const amount=Math.abs(parseFloat(h.amount)||0);
    const cls=type==='充值'?'tms-tag-green':'tms-tag-red';
    const amountCls=type==='充值'?'pos':'neg';
    const sign=type==='充值'?'+':'-';
    const dateText=h.occurredDate||h.date||'—';
    const recordedText=h.recordedAt||h.createdAt?`录入 ${formatMembershipLedgerTime(h.recordedAt||h.createdAt)}`:'';
    const meta=[h.revenueBucket,h.payMethod,h.category,h.internalReason,h.note,recordedText].filter(Boolean).join(' · ')||'—';
    return `<div class="tms-history-item"><div style="width:110px;">${esc(dateText)}</div><span class="tms-tag ${cls}">${esc(type)}</span><div class="amount ${amountCls}">${sign}¥${fmt(amount)}</div><div class="desc">${esc(meta)}</div></div>`;
  }).join(''):'<div class="empty"><p>暂无记录</p></div>';
}
function getCourtTimeOptions(selected='08:00'){
  const opts=[];
  for(let h=6;h<=22;h++){
    const hh=String(h).padStart(2,'0');
    opts.push({value:`${hh}:00`,label:`${hh}:00`});
    if(h!==22)opts.push({value:`${hh}:30`,label:`${hh}:30`});
  }
  return opts.map(opt=>({...opt,active:opt.value===selected}));
}
function renderCourts(){
  const q=(document.getElementById('courtSearch')?.value||'').toLowerCase();
  document.getElementById('page-courts')?.classList.toggle('court-batch-mode',courtBatchMode);
  const visibleCourts=courts.filter(c=>isActiveCourtRecord(c));
  const base=visibleCourts.filter(c=>campus==='all'||c.campus===campus);
  renderCourtHeaderFilters(base);
  let list=visibleCourts.filter(c=>{
    if(campus!=='all'&&c.campus!==campus)return false;
    if(courtOwnerFilterValue&&String(c.owner||'').trim()!==courtOwnerFilterValue)return false;
    const linked=findStudentForCourt(c);
    const membershipSummary=courtMembershipSummary(c);
    if(courtAccountTypeFilterValue&&membershipSummary.accountType!==courtAccountTypeFilterValue)return false;
    return searchHit(q,c.name,courtDisplayName(c),c.phone,cn(c.campus),c.owner,c.depositAttitude,c.familiarity,c.recentFollowUpDate,c.nextFollowUpDate,c.notes,c.balance,c.totalDeposit,c.spentAmount,c.receivedAmount,courtStudentNames(c),linked?.name,linked?.phone);
  });
  const sortedList=[...list];
  if(courtSortKey){
    sortedList.sort((a,b)=>{
      const av=courtSortMetric(a,courtSortKey);
      const bv=courtSortMetric(b,courtSortKey);
      if(av.empty!==bv.empty)return av.empty?1:-1;
      return courtSortDir==='desc'?bv.value-av.value:av.value-bv.value;
    });
  }else{
    sortedList.sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));
  }
  const finBase=base.map(courtFinanceLocal);
  const totBal=finBase.reduce((s,u)=>s+u.balance,0),totDep=finBase.reduce((s,u)=>s+u.totalDeposit,0),totSpent=finBase.reduce((s,u)=>s+u.spentAmount,0),totReceived=finBase.reduce((s,u)=>s+u.receivedAmount,0);
  document.getElementById('courtStatsRow').innerHTML=`<div class="tms-stat-card"><div class="tms-stat-label">订场用户</div><div class="tms-stat-value">${base.length}<span>人</span></div></div><div class="tms-stat-card"><div class="tms-stat-label">余额合计</div><div class="tms-stat-value">¥${fmt(totBal)}</div></div><div class="tms-stat-card"><div class="tms-stat-label">累计充值</div><div class="tms-stat-value">¥${fmt(totDep)}</div></div><div class="tms-stat-card"><div class="tms-stat-label">累计消费</div><div class="tms-stat-value">¥${fmt(totSpent)}</div></div><div class="tms-stat-card"><div class="tms-stat-label">累计实收</div><div class="tms-stat-value">¥${fmt(totReceived)}</div></div>`;
  const total=sortedList.length,pages=Math.max(1,Math.ceil(total/courtPageSize));
  if(courtPage>pages)courtPage=pages;
  const slice=sortedList.slice((courtPage-1)*courtPageSize,courtPage*courtPageSize);
  const pager=document.querySelector('#page-courts .tms-pagination');
  if(pager)pager.style.display=pages>1?'flex':'none';
  document.getElementById('courtPagerInfo').textContent=`共 ${total} 条`;
  document.getElementById('courtPagerBtns').innerHTML=pages<=1?'':Array.from({length:pages},(_,i)=>`<div class="tms-page-btn${i+1===courtPage?' active':''}" onclick="courtPage=${i+1};renderCourts()">${i+1}</div>`).join('');
  const selectAll=document.getElementById('courtSelectAll');
  if(selectAll){
    selectAll.checked=!!slice.length&&slice.every(u=>selectedCourtIds.has(u.id));
    selectAll.disabled=!courtBatchMode;
  }
  document.getElementById('courtTbody').innerHTML=slice.length?slice.map(u=>{
    const f=courtFinanceLocal(u);
    const m=courtMembershipSummary(u);
    const w=f.balance>0&&f.balance<=500;
    const accountTagClass=m.accountType==='会员'?'tms-tag-green':m.accountType==='普通'?'':'tms-tag-red';
    const memberTagClass=courtMembershipTierTagClass(m.tierLabel);
    const statusTagMeta=membershipStatusTagMeta(m.status);
    const memberCell=m.tierLabel&&m.tierLabel!=='-'?`<span class="tms-tag ${memberTagClass}">${esc(renderCourtEmptyText(m.tierLabel))}</span>`:renderCourtCellText('-');
    return `<tr class="${w?'warn-row':''}"><td class="tms-sticky-l" data-court-name-cell="1" style="padding-left:20px"><div class="tms-court-row-main"><input type="checkbox" class="tms-checkbox court-row-cb" value="${u.id}" ${selectedCourtIds.has(u.id)?'checked':''} onchange="toggleCourtSelection('${u.id}',this.checked)"><span class="tms-text-primary tms-court-name-cell">${esc(courtDisplayName(u))}</span></div></td><td>${renderCourtCellText(u.phone)}</td><td>${renderCourtCellText(cn(u.campus))}</td><td><span class="tms-tag ${accountTagClass}">${esc(m.accountType)}</span></td><td>${memberCell}</td><td><span class="tms-tag ${statusTagMeta.tagClass}">${statusTagMeta.text}</span></td><td>${renderCourtCellText(m.discount)}</td><td>${renderCourtCellText(m.validUntil)}</td><td>${renderCourtCellText(u.owner)}</td><td>${renderCourtCellText(u.familiarity)}</td><td>${renderCourtCellText(u.depositAttitude)}</td><td>${renderCourtCellText(u.recentFollowUpDate)}</td><td>${renderCourtCellText(u.nextFollowUpDate)}</td><td>${renderCourtMiniBar(f.balance,f.totalDeposit,w)}</td><td><div class="tms-cell-text">¥${fmt(f.spentAmount)}</div></td><td><div class="tms-text-remark" title="${esc(u.notes||'')}">${esc(renderCourtEmptyText(u.notes))}</div></td><td class="tms-sticky-r tms-action-cell" style="width:210px;padding-right:20px;justify-content:flex-end"><span class="tms-action-link" onclick="openCourtMembershipPanel('${u.id}')">会员账户</span><span class="tms-action-link" onclick="openCourtModal('${u.id}')">编辑</span><span class="tms-action-link" onclick="openCourtFinanceModal('${u.id}')">订场</span></td></tr>`;
  }).join(''):'<tr><td colspan="17"><div class="empty"><div class="empty-ico">🏟️</div><p>暂无订场用户</p></div></td></tr>';
  updateCourtBatchButton();
  document.querySelectorAll('#page-courts .tms-sortable').forEach(el=>el.classList.remove('asc','desc'));
  if(courtSortKey){
    const active=document.querySelector(`#page-courts .tms-sortable[onclick="setCourtSort('${courtSortKey}')"]`);
    if(active)active.classList.add(courtSortDir);
  }
}
function courtRecRow(h){
  const type=h.type||'消费',amount=Math.abs(parseFloat(h.amount)||0);
  const cls=type==='充值'?'b-green':type==='退款'||type==='冲正'?'b-gray':'b-red';
  const sign=type==='充值'?'+':type==='消费'?'-':type==='冲正'?'冲':'';
  const st=h.studentId?students.find(s=>s.id===h.studentId):null;
  const source=h.source==='import'?'导入':'';
  const booking=h.category==='订场'&&h.startTime&&h.endTime?`${h.startTime}-${h.endTime}${h.venue?' '+h.venue:''}`:'';
  const meta=[source,h.category,h.payMethod,booking,st?.name].filter(Boolean).map(esc).join(' · ');
  return `<div class="rec-item"><span class="rec-date">${h.date}</span><span class="badge ${cls}" style="font-size:10px">${esc(type)}</span><span class="rec-amt ${type==='充值'?'plus':'minus'}">${sign}¥${fmt(amount)}</span><span class="rec-note">${meta}${h.note?' · '+esc(h.note):''}</span></div>`;
}
function courtMembershipPanelHtml(court){
  const summary=courtMembershipSummary(court);
  const account=summary.account;
  const orders=account?membershipOrdersForAccount(account.id):[];
  const finance=courtFinanceLocal(court||{history:[]});
  const visible=membershipActionVisibility(account);
  const recentOrders=orders.slice(0,3);
  const latestOrder=orders[0]||null;
  const benefitRows=membershipBenefitRowsForAccount(account);
  const currentBenefitHtml=benefitRows.length?benefitRows.map(row=>{
    const adjusted=row.batches.some(batch=>{
      const order=membershipOrders.find(o=>o.id===batch.membershipOrderId);
      return order&&membershipOrderAdjustmentText(order)==='个性化调整';
    });
    const expireText=row.batches.some(x=>x.benefitValidUntil)?`最早到期 ${esc(row.batches.filter(x=>x.remaining>0&&x.benefitValidUntil).sort((a,b)=>String(a.benefitValidUntil).localeCompare(String(b.benefitValidUntil)))[0]?.benefitValidUntil||'-')}`:'-';
    return `<div class="membership-rights-row"><div style="font-size:13px;color:#332A24;font-weight:600;white-space:nowrap">${esc(row.label)}${esc(membershipBenefitNote(row))} ${adjusted?'<span class="tms-tag tms-tag-red" style="margin-left:6px">个性化调整</span>':'<span class="tms-tag tms-tag-green" style="margin-left:6px">标准权益</span>'}</div><div style="font-size:13px;color:#5C4D43;text-align:right">共 ${row.total}${esc(row.unit)}</div><div style="font-size:13px;color:#5C4D43;text-align:right">已消耗 ${membershipBenefitUsedCount(row)}${esc(row.unit)}</div><div style="font-size:13px;color:#5C4D43;text-align:right">剩余 ${row.remaining}${esc(row.unit)}</div><div style="font-size:12px;color:#8C7B6E;text-align:right;white-space:nowrap">${expireText}</div></div>`;
  }).join(''):'暂无可用权益';
  const recentOrderHtml=latestOrder?`<div style="background:#FDF7F2;border-radius:10px;padding:12px 14px"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px"><div style="font-size:13px;color:#332A24;font-weight:600">${esc(latestOrder.purchaseDate)} · ${esc(latestOrder.membershipPlanName)} · 实收 ¥${fmt(latestOrder.rechargeAmount)} · 赠送 ¥${fmt(latestOrder.bonusAmount)}</div><span class="tms-tag ${membershipOrderAdjustmentText(latestOrder)==='个性化调整'?'tms-tag-red':'tms-tag-green'}">${membershipOrderAdjustmentText(latestOrder)}</span></div><div style="font-size:12px;color:#8C7B6E;line-height:1.6">${esc(membershipOrderBenefitSummaryHtml(latestOrder))}</div><div style="font-size:12px;color:#5C4D43;line-height:1.6;margin-top:8px">备注：${esc(latestOrder.notes||'-')}</div></div>`:'-';
  const discountText=account?.status==='voided'?'折扣失效':summary.discount;
  const voidEvent=account?.status==='voided'?membershipAccountEvents.filter(e=>e.membershipAccountId===account.id&&e.eventType==='voided').sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0]:null;
  const voidInfoHtml=account?.status==='voided'?`<div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">作废信息</label><div style="background:#FDF7F2;border-radius:10px;padding:12px 14px;font-size:12px;color:#8C7B6E;line-height:1.7">作废时间：${esc(formatMembershipLedgerTime(account.voidedAt||voidEvent?.createdAt))} · 作废人：${esc(account.voidedBy||voidEvent?.operator||'-')} · 作废原因：${esc(account.voidReason||voidEvent?.reason||'-')}</div></div></div>`:'';
  return `<div class="tms-section-header" style="margin-top:0;">会员账户</div><div class="tms-readonly-panel"><span class="tms-panel-tip">余额由充值和消费自动计算，不能在这里手动改。</span><div class="membership-panel-grid"><div class="membership-panel-card"><div class="membership-panel-label">当前状态</div><div class="membership-panel-value">${esc(summary.memberLabel)||'-'} · ${esc(summary.status)||'-'}</div></div><div class="membership-panel-card"><div class="membership-panel-label">当前余额</div><div class="membership-panel-value">¥${fmt(finance.balance)}</div></div><div class="membership-panel-card"><div class="membership-panel-label">当前折扣</div><div class="membership-panel-value">${esc(discountText)||'-'}</div></div><div class="membership-panel-card"><div class="membership-panel-label">余额有效期</div><div class="membership-panel-value">${esc(summary.validUntil)||'-'}</div></div><div class="membership-panel-card"><div class="membership-panel-label">清零时间</div><div class="membership-panel-value">${esc(account?.hardExpireAt)||'-'}</div></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">当前权益</label><div style="font-size:13px;color:#8C7B6E;margin-bottom:14px">${currentBenefitHtml}</div></div></div>${voidInfoHtml}<div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">最近开卡</label><div style="font-size:13px;color:#8C7B6E;margin-bottom:14px">${recentOrderHtml}</div></div></div><div class="tms-form-row" style="margin-bottom:0;"><div class="tms-form-item full-width"><label class="tms-form-label">操作</label><div class="membership-actions-row">${visible.firstOpen?`<button class="tms-btn tms-btn-ghost" style="border:1px solid #EAE0D6;background:#fff" onclick="openMembershipOrderModal('${court.id}','first_open')">首次开卡</button>`:''}${visible.reopen?`<button class="tms-btn tms-btn-ghost" style="border:1px solid #EAE0D6;background:#fff" onclick="openMembershipOrderModal('${court.id}','reopen')">重新开卡</button>`:''}${visible.renew?`<button class="tms-btn tms-btn-ghost" style="border:1px solid #EAE0D6;background:#fff" onclick="openMembershipOrderModal('${court.id}','renew')">续充会员</button>`:''}${visible.consume?`<button class="tms-btn tms-btn-ghost" style="border:1px solid #EAE0D6;background:#fff" onclick="openMembershipBenefitModal('${court.id}','consume')">消耗权益</button>`:''}${visible.supplement?`<button class="tms-btn tms-btn-ghost" style="border:1px solid #EAE0D6;background:#fff" onclick="openMembershipBenefitModal('${court.id}','supplement')">补发权益</button>`:''}${visible.ledger?`<button class="tms-btn tms-btn-ghost" style="border:1px solid #EAE0D6;background:#fff" onclick="openCourtMembershipLedgerModal('${court.id}')">查看流水</button>`:''}${visible.void?`<button class="tms-btn tms-btn-danger" onclick="voidMembership('${court.id}')">作废会员</button>`:''}</div></div></div></div>`;
}
function openCourtMembershipPanel(courtId){
  const court=courts.find(c=>c.id===courtId);if(!court){toast('当前订场用户数据未加载，请刷新后重试','warn');return;}
  editId=null;
  setCourtModalFrame(`${court.name} · 会员账户`,courtMembershipPanelHtml(court),'','modal-member');
}
let courtMergeState={sourceCourtId:'',options:[],filtered:[]};
function mergeCourtTargetLabel(court){
  if(!court)return '';
  return [court.name||'',court.phone||'',cn(court.campus)||''].filter(Boolean).join(' · ');
}
function renderCourtMergeTargetOptions(){
  const q=(document.getElementById('mergeCourtSearch')?.value||'').trim().toLowerCase();
  const filtered=(courtMergeState.options||[]).filter(item=>{
    if(!q)return true;
    return searchHit(q,item.name,item.phone,cn(item.campus));
  });
  courtMergeState.filtered=filtered;
  const host=document.getElementById('mergeTargetHost');
  const currentValue=document.getElementById('merge_targetCourtId')?.value||filtered[0]?.id||'';
  if(host)host.innerHTML=renderCourtDropdownHtml('merge_targetCourtId','选择目标用户',filtered.map(c=>({value:c.id,label:mergeCourtTargetLabel(c)})),filtered.some(c=>c.id===currentValue)?currentValue:(filtered[0]?.id||''),true);
  const empty=document.getElementById('mergeTargetEmpty');
  if(empty)empty.style.display=filtered.length?'none':'block';
}
function openCourtMergeModal(courtId){
  const sourceCourt=courts.find(c=>c.id===courtId&&String(c.status||'active')!=='inactive');
  if(!sourceCourt){toast('原订场用户不存在或已隐藏','warn');return;}
  const targetOptions=courts
    .filter(c=>c.id!==courtId&&String(c.status||'active')!=='inactive')
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')))
    .map(c=>({id:c.id,name:c.name||'',phone:c.phone||'',campus:c.campus||''}));
  if(!targetOptions.length){toast('没有可合并的目标订场用户','warn');return;}
  courtMergeState={sourceCourtId:courtId,options:targetOptions,filtered:targetOptions};
  const body=`<div class="tms-section-header" style="margin-top:0;">合并设置</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">当前用户</label><div class="tms-form-readonly">${esc(mergeCourtTargetLabel(sourceCourt))}</div></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">搜索目标用户</label><input type="text" class="finput tms-form-control" id="mergeCourtSearch" placeholder="搜索姓名" oninput="renderCourtMergeTargetOptions()"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">合并到用户 *</label><div id="mergeTargetHost"></div><div id="mergeTargetEmpty" style="display:none;font-size:12px;color:#8C7B6E;margin-top:8px;">没有匹配的订场用户</div></div></div><div class="tms-form-row" style="margin-bottom:0;"><div class="tms-form-item full-width"><label class="choice-tag" style="width:max-content"><input type="checkbox" id="merge_deleteSource"><span>合并后直接删除原用户</span></label><div style="font-size:12px;color:#8C7B6E;margin-top:10px;line-height:1.6">会把当前用户的财务流水、关联学员和会员关联迁到目标用户。勾选后，原用户会直接删除；不勾选则隐藏。</div></div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="openCourtModal('${sourceCourt.id}')">返回编辑</button><div style="display:flex;gap:12px;"><button class="tms-btn tms-btn-primary" id="courtMergeBtn" onclick="mergeCourtUsers('${sourceCourt.id}')">确认合并</button></div>`;
  setCourtModalFrame(`合并订场用户 · ${sourceCourt.name}`,body,footer,'modal-tight');
  renderCourtMergeTargetOptions();
}
async function mergeCourtUsers(sourceCourtId){
  const targetCourtId=document.getElementById('merge_targetCourtId')?.value||'';
  const deleteSource=document.getElementById('merge_deleteSource')?.checked===true;
  if(!targetCourtId){toast('请选择目标订场用户','warn');return;}
  const sourceCourt=courts.find(c=>c.id===sourceCourtId);
  const targetCourt=courts.find(c=>c.id===targetCourtId);
  if(!sourceCourt||!targetCourt){toast('订场用户数据已变化，请刷新后重试','warn');return;}
  if(!await appConfirm(`确认把「${sourceCourt.name}」合并到「${targetCourt.name}」吗？`,{title:'确认合并用户',confirmText:'确认合并'}))return;
  const btn=document.getElementById('courtMergeBtn');
  if(btn){btn.disabled=true;btn.textContent='合并中…';}
  try{
    await apiCall('POST','/courts/merge',{sourceCourtId,targetCourtId,deleteSource});
    closeModal();
    await loadAll();
    toast(deleteSource?'合并成功，原用户已删除':'合并成功，原用户已隐藏','success');
  }catch(e){
    toast('合并失败：'+e.message,'error');
    if(btn){btn.disabled=false;btn.textContent='确认合并';}
  }
}
function openCourtModal(id){
  editId=id;_pending=[];const r=id?courts.find(x=>x.id===id):null;
  const fin=courtFinanceLocal(r||{history:[]});
  const linked=findStudentForCourt(r);
  const selectedIds=parseArr(r?.studentIds);if(!selectedIds.length&&linked)selectedIds.push(linked.id);
  const campusList=campuses.map(c=>({value:c.code||c.id,label:esc(c.name)}));
  const body=`<div class="tms-section-header" style="margin-top:0;">基本信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">姓名 *</label><input type="text" class="finput tms-form-control" id="f_name" placeholder="请输入" value="${rv(r,'name')}"></div><div class="tms-form-item"><label class="tms-form-label">手机号</label><input type="text" class="finput tms-form-control" id="f_phone" placeholder="13800138000" value="${rv(r,'phone')}"></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">关联学员（可多选）</label><div class="tms-checkbox-matrix">${studentChecks(selectedIds)}</div></div></div><div class="tms-form-row court-date-row"><div class="tms-form-item"><label class="tms-form-label">校区</label>${renderCourtDropdownHtml('f_campus','校区',[{value:'',label:'-'},...campusList],rv(r,'campus'),true)}</div><div class="tms-form-item"><label class="tms-form-label">加入日期</label>${courtDateButtonHtml('f_joinDate',rv(r,'joinDate'))}</div><div class="tms-form-item"><label class="tms-form-label">末次跟进日期</label>${courtDateButtonHtml('f_recentFollowUpDate',rv(r,'recentFollowUpDate'))}</div><div class="tms-form-item"><label class="tms-form-label">下次跟进日期</label>${courtDateButtonHtml('f_nextFollowUpDate',rv(r,'nextFollowUpDate'))}</div></div><div class="tms-readonly-panel" style="margin-bottom:16px"><span class="tms-panel-tip">下面 4 个财务字段是系统自动汇总，只读展示，不能在这里手动修改。</span><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">累计充值</label><div class="tms-form-readonly">¥${fmt(fin.totalDeposit)}</div></div><div class="tms-form-item"><label class="tms-form-label">当前余额</label><div class="tms-form-readonly">¥${fmt(fin.balance)}</div></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item"><label class="tms-form-label">累计消费</label><div class="tms-form-readonly">¥${fmt(fin.spentAmount)}</div></div><div class="tms-form-item"><label class="tms-form-label">累计实收</label><div class="tms-form-readonly">¥${fmt(fin.receivedAmount)}</div></div></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">对接人</label><input type="text" class="finput tms-form-control" id="f_owner" value="${rv(r,'owner')}"></div><div class="tms-form-item"><label class="tms-form-label">对储值态度</label><input type="text" class="finput tms-form-control" id="f_attitude" value="${rv(r,'depositAttitude')}"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">熟悉程度</label><input type="text" class="finput tms-form-control" id="f_familiarity" value="${rv(r,'familiarity')}"></div><div class="tms-form-item"></div></div><div class="tms-form-row" style="margin-bottom:0;"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="f_notes">${esc(rv(r,'notes'))}</textarea></div></div>`;
  const footer=id?`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><div style="display:flex;gap:12px;"><button class="tms-btn tms-btn-default" onclick="openCourtMergeModal('${r.id}')">合并</button><button class="tms-btn tms-btn-danger" onclick="confirmDel('${r.id}','${esc(r.name)}','court')">删除</button><button class="tms-btn tms-btn-primary" id="courtSaveBtn" onclick="saveCourt()">保存</button></div>`:`<div style="display:flex;gap:12px;margin-left:auto;"><button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="courtSaveBtn" onclick="saveCourt()">保存</button></div>`;
  setCourtModalFrame(id?'编辑订场用户':'添加订场用户',body,footer,'modal-wide');
}
async function saveCourt(){
  const name=document.getElementById('f_name').value.trim();if(!name){toast('请输入姓名','warn');return;}
  const phone=document.getElementById('f_phone').value.trim();if(!validateCnPhone(phone)){toast('手机号格式不正确','warn');return;}
  const btn=document.getElementById('courtSaveBtn');if(btn){btn.disabled=true;btn.textContent='保存中…';}
  const rawH=editId?courtBaseHistoryForSave(courts.find(u=>u.id===editId)):[];
  const studentIds=[...document.querySelectorAll('.court-stu-cb:checked')].map(cb=>cb.value);
  const campusValue=document.getElementById('f_campus').value;
  const rec={name,phone,studentId:studentIds[0]||'',studentIds,campus:campusValue,joinDate:document.getElementById('f_joinDate').value,recentFollowUpDate:document.getElementById('f_recentFollowUpDate').value,nextFollowUpDate:document.getElementById('f_nextFollowUpDate').value,owner:document.getElementById('f_owner').value.trim(),depositAttitude:document.getElementById('f_attitude').value.trim(),familiarity:document.getElementById('f_familiarity').value.trim(),notes:document.getElementById('f_notes').value.trim(),status:'active',history:[...rawH,..._pending]};
  const duplicates=getCourtDuplicateCandidates({name,phone,campus:campusValue},editId);
  if(duplicates.length){
    const summary=duplicates.map(c=>`${c.name}${c.phone?`（${c.phone}）`:''}${c.campus?` · ${cn(c.campus)}`:''}`).join('、');
    if(!await appConfirm(`发现可能重复的订场用户：${summary}。手机号优先，若无手机号则按姓名+校区去重。是否继续保存？`,{title:'发现重复用户',confirmText:'继续保存'})){
      if(btn){btn.disabled=false;btn.textContent='保存';}
      return;
    }
  }
  try{
    if(editId){const saved=await apiCall('PUT','/courts/'+editId,rec);const i=courts.findIndex(u=>u.id===editId);courts[i]=saved;}
    else{const r=await apiCall('POST','/courts',rec);courts.unshift(r);}
    closeModal();toast(editId?'修改成功 ✓':'添加成功 ✓','success');renderCourts();renderStudentsIfVisible();
  }catch(e){toast('保存失败：'+e.message,'error');if(btn){btn.disabled=false;btn.textContent='保存';}}
}
function updateCourtFinancePreview(){
  const type=document.getElementById('nrType')?.value;
  const pay=document.getElementById('nrPayMethod');
  const cat=document.getElementById('nrCategory');
  const hint=document.getElementById('financeHint');
  if(!pay||!hint)return;
  if(type==='充值'&&pay.value==='储值扣款')setCourtDropdownValue('nrPayMethod','微信','微信');
  if(type==='消费'&&pay.value==='储值退款')setCourtDropdownValue('nrPayMethod','储值扣款','储值扣款');
  if(type==='退款'&&pay.value==='储值扣款')setCourtDropdownValue('nrPayMethod','储值退款','储值退款');
  if(type==='冲正'&&pay.value==='储值退款')setCourtDropdownValue('nrPayMethod','储值扣款','储值扣款');
  if(type==='充值'&&cat)setCourtDropdownValue('nrCategory','储值','储值');
  if(type==='消费'&&cat&&['储值','退款','冲正','其他'].includes(cat.value))setCourtDropdownValue('nrCategory','订场','订场');
  if(type==='退款'&&cat)setCourtDropdownValue('nrCategory','退款','退款');
  if(type==='冲正'&&cat)setCourtDropdownValue('nrCategory','冲正','冲正');
  const nextCat=document.getElementById('nrCategory')?.value;
  if(type==='消费'&&nextCat==='内部占用'){
    setCourtDropdownValue('nrPayMethod','其他','其他');
    const amountEl=document.getElementById('nrAmt');
    if(amountEl&&(!amountEl.value||amountEl.value==='0'))amountEl.value='0';
  }
  hint.textContent=type==='充值'?'充值是预存储值，不需要填写场地和时间；以后订场可用储值扣款。':type==='退款'?(pay.value==='储值退款'?'从储值余额退款，会减少当前余额。':'记录单次付款退款，不影响储值余额。'):type==='冲正'?(pay.value==='储值扣款'?'冲正用于撤回录错的储值扣款，余额会加回。':'冲正用于撤回录错的单次支付消费。'):nextCat==='内部占用'?'内部占用只记录场地被占用，不计入累计消费和累计实收。':nextCat==='订场'?(pay.value==='储值扣款'?'本次订场会从当前余额扣款。':'本次订场按单次支付记录，不扣储值余额。'):'报课消费只记录课程项目、节数和金额，不需要选择场地时间。';
}
function renderCourtFinanceFields(){
  const type=document.getElementById('nrType')?.value||'消费';
  const category=document.getElementById('nrCategory')?.value||'订场';
  const isBooking=type==='消费'&&category==='订场';
  const isInternal=type==='消费'&&category==='内部占用';
  const isCourse=type==='消费'&&['私教课','班课','训练营'].includes(category);
  document.querySelectorAll('[data-finance-field="booking"]').forEach(el=>el.style.display=(isBooking||isInternal)?'':'none');
  document.querySelectorAll('[data-finance-field="course"]').forEach(el=>el.style.display=isCourse?'':'none');
  document.querySelectorAll('[data-finance-field="student"]').forEach(el=>el.style.display=(isBooking||isCourse)?'':'none');
  document.querySelectorAll('[data-finance-field="internal"]').forEach(el=>el.style.display=isInternal?'':'none');
  document.querySelectorAll('[data-price-field="channel"]').forEach(el=>el.style.display=document.getElementById('nrPriceMode')?.value==='channel_product'?'':'none');
}
function renderCourtFinanceVenueField(campusValue=''){
  const host=document.getElementById('nrVenueHost');
  if(!host)return;
  const currentValue=document.getElementById('nrVenue')?.value||'';
  host.innerHTML=venueFieldHtml('nrVenue','场地',campusValue,currentValue,true,'refreshCourtFinanceQuote()');
}
function onCourtFinanceCampusChange(){
  const campusValue=document.getElementById('nrCampus')?.value||'';
  renderCourtFinanceVenueField(campusValue);
  refreshCourtFinanceQuote();
}
function onCourtFinanceSceneChange(){
  updateCourtFinancePreview();
  renderCourtFinanceFields();
  renderCourtFinanceVenueField(document.getElementById('nrCampus')?.value||'');
  refreshCourtFinanceQuote();
}
let courtFinanceModalId='';
function activeChannelProductOptions(){
  return pricePlans.filter(p=>p.type==='channel_product'&&p.status!=='inactive').map(p=>({value:p.id,label:`${p.channel} · ${p.productName} · ¥${fmt(p.salePrice)}`}));
}
function selectedChannelProduct(){
  const id=document.getElementById('nrChannelProductId')?.value||'';
  return pricePlans.find(p=>p.id===id)||null;
}
function currentCourtMemberDiscount(court){
  const account=courtMembershipSummary(court)?.account;
  const rate=parseFloat(account?.discountRate);
  return Number.isFinite(rate)&&rate>0?rate:1;
}
async function refreshCourtFinanceQuote(){
  const court=courts.find(c=>c.id===courtFinanceModalId);
  if(!court)return;
  const type=document.getElementById('nrType')?.value||'';
  const category=document.getElementById('nrCategory')?.value||'';
  if(type!=='消费'||category!=='订场')return;
  const mode=document.getElementById('nrPriceMode')?.value||'venue_rate';
  const systemEl=document.getElementById('nrSystemAmount');
  const finalEl=document.getElementById('nrFinalAmount');
  const amountEl=document.getElementById('nrAmt');
  const pricePlanEl=document.getElementById('nrPricePlanId');
  const quoteMeta=document.getElementById('nrQuoteMeta');
  try{
    if(mode==='channel_product'){
      const product=selectedChannelProduct();
      if(!product)return;
      if(systemEl)systemEl.value=product.salePrice||0;
      if(finalEl&&!finalEl.dataset.touched)finalEl.value=product.salePrice||0;
      if(amountEl)amountEl.value=finalEl?.value||product.salePrice||0;
      if(pricePlanEl)pricePlanEl.value=product.id||'';
      if(quoteMeta)quoteMeta.textContent=`渠道商品：${product.channel} · ${product.productName}`;
      return;
    }
    const payMethod=document.getElementById('nrPayMethod')?.value||'';
    const memberDiscount=payMethod==='储值扣款'?currentCourtMemberDiscount(court):1;
    const quote=await apiCall('POST','/price-plans/quote',{campus:document.getElementById('nrCampus')?.value||court.campus||'',date:document.getElementById('nrDate')?.value||today(),startTime:document.getElementById('nrStartTime')?.value||'',endTime:document.getElementById('nrEndTime')?.value||'',memberDiscount});
    if(systemEl)systemEl.value=quote.systemAmount||0;
    if(finalEl&&!finalEl.dataset.touched)finalEl.value=quote.systemAmount||0;
    if(amountEl)amountEl.value=finalEl?.value||quote.systemAmount||0;
    if(pricePlanEl)pricePlanEl.value=(quote.pricePlanIds||[]).join(',');
    if(quoteMeta)quoteMeta.textContent=`系统报价：原价 ¥${fmt(quote.originalAmount||0)}${memberDiscount!==1?` · 会员 ${Math.round(memberDiscount*100)/10} 折`:''}`;
  }catch(e){
    if(quoteMeta)quoteMeta.textContent=e.message||'未找到匹配价格';
  }
}
function syncCourtFinalAmount(){
  const finalEl=document.getElementById('nrFinalAmount');
  const amountEl=document.getElementById('nrAmt');
  if(finalEl)finalEl.dataset.touched='1';
  if(amountEl&&finalEl)amountEl.value=finalEl.value||'';
}
async function createCourtCompanionSchedule(court,record,companionCoach){
  if(!companionCoach||record.type!=='消费'||record.category!=='订场')return null;
  const student=students.find(s=>s.id===record.studentId);
  const studentIds=record.studentId?[record.studentId]:[];
  return apiCall('POST','/schedule',{
    startTime:`${record.date} ${record.startTime}`,
    endTime:`${record.date} ${record.endTime}`,
    classId:'',
    studentIds,
    expectedStudentIds:studentIds,
    absentStudentIds:[],
    studentName:student?.name||courtDisplayName(court),
    courseType:record.courseType||'陪打',
    coach:companionCoach,
    coachId:companionCoach,
    venue:record.venue,
    campus:record.campus,
    lessonCount:0,
    status:'已排课',
    entitlementId:'',
    packageName:'',
    purchaseId:'',
    timeBand:'',
    cancelReason:'',
    notifyStatus:'未通知',
    confirmStatus:'待确认',
    scheduleSource:record.scheduleSource||'订场陪打',
    notes:record.note?`订场陪打：${record.note}`:'订场陪打'
  });
}
function openCourtFinanceModal(courtId){
  const court=courts.find(c=>c.id===courtId);
  if(!court){toast('当前订场用户数据未加载，请刷新后重试','warn');return;}
  courtFinanceModalId=courtId;
  editId=null;
  _pending=[];
  const finance=courtFinanceLocal(court||{history:[]});
  const revenue=courtFinanceRevenueSummaryLocal(court||{history:[]});
  const studentOptions=[{value:'',label:'不关联'},...students.map(s=>({value:s.id,label:s.name}))];
  const coachOptions=[{value:'',label:'不安排陪打'},...activeCoachNames().map(name=>({value:name,label:name}))];
  const campusOptions=campuses.map(c=>({value:c.code||c.id,label:esc(c.name)}));
  const channelProductOptions=[{value:'',label:'选择渠道商品'},...activeChannelProductOptions()];
  const hist=[...parseArr(court.history)].reverse();
  const selectedCampus=court.campus||campuses[0]?.code||campuses[0]?.id||'';
  const body=`<div class="tms-section-header" style="margin-top:0;">财务摘要</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">当前余额</label><input type="number" class="finput tms-form-control" value="${finance.balance}" readonly></div><div class="tms-form-item"><label class="tms-form-label">累计充值</label><input type="number" class="finput tms-form-control" value="${finance.totalDeposit}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">累计消费</label><input type="number" class="finput tms-form-control" value="${finance.spentAmount}" readonly></div><div class="tms-form-item"><label class="tms-form-label">累计实收</label><input type="number" class="finput tms-form-control" value="${finance.receivedAmount}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">确认订场收入</label><input type="text" class="finput tms-form-control" value="¥${fmt(revenue.confirmedRevenue)}" readonly></div><div class="tms-form-item"><label class="tms-form-label">本次实收/现金流入</label><input type="text" class="finput tms-form-control" value="¥${fmt(revenue.cashReceived)}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">待确认/代用户订场</label><input type="text" class="finput tms-form-control" value="¥${fmt(revenue.pendingRevenue)}" readonly></div><div class="tms-form-item"><label class="tms-form-label">内部占用次数</label><input type="text" class="finput tms-form-control" value="${revenue.internalOccupancyCount} 次" readonly></div></div><div class="tms-section-header">流水录入</div><div class="tms-record-add-box"><div class="tms-form-row"><div class="tms-form-item" style="flex:0 0 96px;min-width:96px;">${renderCourtDropdownHtml('nrType','类型',[{value:'充值',label:'充值'},{value:'消费',label:'消费'},{value:'退款',label:'退款'},{value:'冲正',label:'冲正'}],'消费',true,'onCourtFinanceSceneChange')}</div><div class="tms-form-item" style="flex:0 0 96px;min-width:96px;">${renderCourtDropdownHtml('nrCategory','项目',[{value:'储值',label:'储值'},{value:'订场',label:'订场'},{value:'内部占用',label:'内部占用'},{value:'私教课',label:'私教课'},{value:'班课',label:'班课'},{value:'训练营',label:'训练营'},{value:'退款',label:'退款'},{value:'冲正',label:'冲正'}],'订场',true,'onCourtFinanceSceneChange')}</div><div class="tms-form-item" style="flex:0 0 118px;min-width:118px;">${renderCourtDropdownHtml('nrPayMethod','支付',[{value:'微信',label:'微信'},{value:'支付宝',label:'支付宝'},{value:'现金',label:'现金'},{value:'转账',label:'转账'},{value:'储值扣款',label:'储值扣款'},{value:'代用户订场',label:'代用户订场'},{value:'现场收款',label:'现场收款'},{value:'储值退款',label:'储值退款'},{value:'其他',label:'其他'}],'储值扣款',true,'onCourtFinanceSceneChange')}</div><div class="tms-form-item" data-finance-field="student" style="flex:0 0 128px;min-width:128px;">${renderCourtDropdownHtml('nrStudentId','关联学员',studentOptions,'',true)}</div><div class="tms-form-item" data-finance-field="booking" style="flex:0 0 118px;min-width:118px;">${renderCourtDropdownHtml('nrCampus','校区',campusOptions,selectedCampus,true,'onCourtFinanceCampusChange')}</div><div class="tms-form-item" data-finance-field="booking" style="flex:0 0 118px;min-width:118px;" id="nrVenueHost">${venueFieldHtml('nrVenue','场地',selectedCampus,'',true,'refreshCourtFinanceQuote()')}</div></div><div class="tms-form-row"><div class="tms-form-item" data-finance-field="booking" style="flex:0 0 168px;min-width:168px;">${courtDateButtonHtml('nrDate',today(),'发生日期')}</div><div class="tms-form-item" data-finance-field="booking" style="flex:0 0 100px;min-width:100px;">${renderCourtDropdownHtml('nrStartTime','08:00',getCourtTimeOptions('08:00'),'08:00',true,'refreshCourtFinanceQuote')}</div><div data-finance-field="booking" style="color:#8C7B6E;align-self:center;white-space:nowrap;padding:0 2px;">至</div><div class="tms-form-item" data-finance-field="booking" style="flex:0 0 100px;min-width:100px;">${renderCourtDropdownHtml('nrEndTime','10:00',getCourtTimeOptions('10:00'),'10:00',true,'refreshCourtFinanceQuote')}</div><div class="tms-form-item" data-finance-field="booking" style="flex:0 0 136px;min-width:136px;">${renderCourtDropdownHtml('nrCompanionCoach','陪打教练',coachOptions,'',true)}</div><div class="tms-form-item" data-finance-field="internal" style="flex:0 0 140px;min-width:140px;">${renderCourtDropdownHtml('nrInternalReason','占用原因',[{value:'领导打球',label:'领导打球'},{value:'活动',label:'活动'},{value:'测试教学',label:'测试教学'},{value:'其他',label:'其他'}],'领导打球',true)}</div><div class="tms-form-item" data-finance-field="course" style="flex:1;"><input type="number" class="finput tms-form-control" id="nrLessonCount" min="1" step="1" placeholder="节数"></div></div><div class="tms-form-row" data-finance-field="booking"><div class="tms-form-item" style="flex:0 0 132px;min-width:132px;">${renderCourtDropdownHtml('nrPriceMode','价格来源',[{value:'venue_rate',label:'场地价格'},{value:'channel_product',label:'渠道商品'},{value:'manual',label:'手动价格'}],'venue_rate',true,'onCourtFinanceSceneChange')}</div><div class="tms-form-item" data-price-field="channel" style="flex:1;">${renderCourtDropdownHtml('nrChannelProductId','渠道商品',channelProductOptions,channelProductOptions[0]?.value||'',true,'refreshCourtFinanceQuote')}</div><div class="tms-form-item" style="flex:0 0 118px;min-width:118px;"><input type="number" class="finput tms-form-control" id="nrSystemAmount" placeholder="系统应收" readonly></div><div class="tms-form-item" style="flex:0 0 118px;min-width:118px;"><input type="number" class="finput tms-form-control" id="nrFinalAmount" placeholder="最终成交" oninput="syncCourtFinalAmount()"></div><input type="hidden" id="nrPricePlanId"><div class="tms-form-item" style="flex:1;"><input type="text" class="finput tms-form-control" id="nrOverrideReason" placeholder="改价原因"></div></div><div class="tms-form-row" data-price-field="channel"><div class="tms-form-item"><input type="text" class="finput tms-form-control" id="nrChannelOrderNo" placeholder="平台订单号"></div><div class="tms-form-item"><input type="text" class="finput tms-form-control" id="nrRedeemCode" placeholder="核销码"></div></div><div class="tms-form-row" style="margin-bottom:0;"><div class="tms-form-item" style="flex:1;"><input type="text" class="finput tms-form-control" id="nrNote" placeholder="备注（非必填）"></div><div class="tms-form-item" style="flex:0 0 128px;"><input type="number" class="finput tms-form-control" id="nrAmt" placeholder="¥ 金额"></div><div class="tms-form-item" style="flex:none;width:160px;"><button class="tms-btn tms-btn-primary" id="courtFinanceAddBtn" style="width:100%;height:100%;padding:0;" onclick="saveCourtFinanceRecord()">添加</button></div></div></div><div style="font-size:12px;color:var(--ts);margin:0 0 6px" id="financeHint">本次订场会从当前余额扣款。</div><div style="font-size:12px;color:var(--ts);margin:0 0 16px" id="nrQuoteMeta"></div><div class="tms-section-header">历史记录</div><div class="tms-history-list">${renderCourtHistoryItems(hist)}</div>`;
  setCourtModalFrame(`${court.name} · 记一笔流水`,body,`<button class="tms-btn tms-btn-default" style="width:100%;text-align:center" onclick="closeModal()">关闭</button>`,'modal-wide');
  onCourtFinanceSceneChange();
}
async function saveCourtFinanceRecord(){
  const court=courts.find(c=>c.id===courtFinanceModalId);
  if(!court){toast('当前订场用户数据未加载，请刷新后重试','warn');return;}
  const type=document.getElementById('nrType').value,date=document.getElementById('nrDate').value,amt=parseFloat(document.getElementById('nrAmt').value),note=document.getElementById('nrNote').value.trim();
  const category=document.getElementById('nrCategory').value,payMethod=document.getElementById('nrPayMethod').value,studentId=document.getElementById('nrStudentId')?.value||'';
  const companionCoach=document.getElementById('nrCompanionCoach')?.value||'';
  const internalReason=document.getElementById('nrInternalReason')?.value||'';
  const startTime=document.getElementById('nrStartTime')?.value||'',endTime=document.getElementById('nrEndTime')?.value||'',venue=document.getElementById('nrVenue')?.value||'',recCampus=document.getElementById('nrCampus')?.value||court.campus||'',lessonCount=parseInt(document.getElementById('nrLessonCount')?.value)||0;
  const priceMode=document.getElementById('nrPriceMode')?.value||'manual',pricePlanId=document.getElementById('nrPricePlanId')?.value||'',channelProduct=selectedChannelProduct();
  const systemAmount=parseFloat(document.getElementById('nrSystemAmount')?.value)||0,finalAmount=parseFloat(document.getElementById('nrFinalAmount')?.value)||amt||0,overrideReason=document.getElementById('nrOverrideReason')?.value.trim()||'';
  if(!date){toast('请选择日期','warn');return;}
  if(category!=='内部占用'&&(!amt||isNaN(amt))){toast('请输入金额','warn');return;}
  if(type==='消费'&&(category==='订场'||category==='内部占用')){
    if(!startTime||!endTime||!venue){toast('订场记录请填写时间和场地','warn');return;}
    if(endTime<=startTime){toast('订场结束时间不能早于开始时间','warn');return;}
  }
  if(category==='内部占用'&&!internalReason){toast('请选择占用原因','warn');return;}
  if(type==='消费'&&category==='订场'&&systemAmount&&finalAmount&&systemAmount!==finalAmount&&!overrideReason){toast('请填写改价原因','warn');return;}
  const now=new Date().toISOString();
  const revenueBucket=category==='内部占用'?'内部占用':category==='订场'?(payMethod==='储值扣款'?'储值扣款':payMethod==='代用户订场'?'代用户订场':'现场收款'):'';
  const h={id:uid(),date,occurredDate:date,createdAt:now,recordedAt:now,type,category,payMethod:category==='内部占用'?'其他':payMethod,studentId,amount:category==='内部占用'?0:Math.abs(finalAmount||amt),note,startTime,endTime,venue,campus:recCampus,lessonCount,internalReason,revenueBucket,priceMode,pricePlanId,channel:channelProduct?.channel||'',channelOrderNo:document.getElementById('nrChannelOrderNo')?.value?.trim?.()||'',redeemCode:document.getElementById('nrRedeemCode')?.value?.trim?.()||'',systemAmount,finalAmount,priceOverridden:!!(systemAmount&&finalAmount&&systemAmount!==finalAmount),overrideReason,memberDiscount:priceMode==='venue_rate'&&payMethod==='储值扣款'?currentCourtMemberDiscount(court):1};
  const hist=[...courtBaseHistoryForSave(court),h];
  const preview=courtFinanceLocal({...court,history:hist});
  if(preview.balance<0){toast('余额不足，不能使用储值扣款','warn');return;}
  if(preview.receivedAmount<0){toast('退款金额超过累计实收','warn');return;}
  if(preview.spentAmount<0||preview.storedValueSpent<0||preview.directPaidSpent<0){toast('冲正金额超过已有消费','warn');return;}
  if(!await appConfirm(courtFinanceConfirmText(h,studentId),{title:'确认添加流水',confirmText:'确认添加'}))return;
  const btn=document.getElementById('courtFinanceAddBtn');
  if(btn){btn.disabled=true;btn.textContent='保存中…';}
  const rec={...court,history:hist};
  try{
    const saved=await apiCall('PUT','/courts/'+court.id,rec);
    const i=courts.findIndex(u=>u.id===court.id);
    if(i>=0)courts[i]=saved;
    let companionFailed='';
    if(companionCoach){
      try{
        const companionPayload={...h,scheduleSource:'订场陪打',courseType:'陪打'};
        await createCourtCompanionSchedule(saved,companionPayload,companionCoach);
      }catch(err){
        companionFailed=err.message||'陪打日程创建失败';
      }
    }
    closeModal();
    toast(companionFailed?'流水已保存，陪打日程创建失败':'添加成功 ✓',companionFailed?'warn':'success');
    renderCourts();
    renderStudentsIfVisible();
    renderSchedule();
    renderMySchedule();
  }catch(e){
    toast('保存失败：'+e.message,'error');
    if(btn){btn.disabled=false;btn.textContent='添加';}
  }
}
function openCourtHist(id){
  const u=courts.find(x=>x.id===id);if(!u)return;editId=null;
  const hist=[...parseArr(u.history)].reverse();
  setCourtModalFrame(`${esc(u.name)} · 充值/消费记录`,`<div class="tms-history-list">${renderCourtHistoryItems(hist)}</div>`,`<button class="tms-btn tms-btn-primary" style="width:100%;text-align:center" onclick="closeModal()">关闭</button>`,'modal-tight');
}
function exportCourtCSV(){
  const d=campus==='all'?courts:courts.filter(u=>u.campus===campus);
  let csv='姓名,手机号,关联学员,校区,余额,储值,消费金额,实收金额,对接人,对储值态度,熟悉程度,加入日期,末次跟进日期,下次跟进日期,备注\n';
  csv+=d.map(u=>{const f=courtFinanceLocal(u);return [csvEscapeCell(u.name),csvEscapeCell(u.phone||''),csvEscapeCell(courtStudentNames(u)),csvEscapeCell(cn(u.campus)),csvEscapeCell(f.balance||0),csvEscapeCell(f.totalDeposit||0),csvEscapeCell(f.spentAmount||0),csvEscapeCell(f.receivedAmount||0),csvEscapeCell(u.owner||''),csvEscapeCell(u.depositAttitude||''),csvEscapeCell(u.familiarity||''),csvEscapeCell(u.joinDate||''),csvEscapeCell(u.recentFollowUpDate||''),csvEscapeCell(u.nextFollowUpDate||''),csvEscapeCell(u.notes||'')].join(',')}).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FlowTennis_订场用户_'+today()+'.csv';a.click();toast('导出成功','success');
}
async function openCourtFinanceMigrationPreview(){
  document.getElementById('mTitle').textContent='财务历史迁移预览';
  document.getElementById('mBody').innerHTML='<div class="empty"><p>正在生成预览…</p></div>';
  document.getElementById('overlay').classList.add('open');
  try{
    const res=await apiCall('POST','/courts/migrate-finance-legacy',{dryRun:true});
    renderCourtFinanceMigrationPreview(res);
  }catch(e){
    document.getElementById('mBody').innerHTML=`<div class="empty"><p>预览失败：${esc(e.message)}</p></div><div class="mactions"><button class="btn-save" onclick="closeModal()">关闭</button></div>`;
  }
}
function renderCourtFinanceMigrationPreview(res){
  const rows=(res.preview||[]).map(x=>`<tr><td>${esc(x.name)||'—'}</td><td>余额 ¥${fmt(x.before?.balance)} / 储值 ¥${fmt(x.before?.totalDeposit)} / 消费 ¥${fmt(x.before?.spentAmount)}</td><td>${(x.generated||[]).map(h=>`${esc(h.type)} ¥${fmt(h.amount)} ${esc(h.payMethod)}`).join('<br>')||'—'}</td><td>${(x.warnings||[]).map(esc).join('<br>')||'可迁移'}</td></tr>`).join('');
  document.getElementById('mBody').innerHTML=`<div style="background:rgba(217,119,6,0.08);border:0.5px solid rgba(217,119,6,0.2);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--ts);margin-bottom:12px">只处理没有充值/消费记录、但有旧余额/储值/消费金额的订场用户。带警告的数据不会自动写入。</div><div style="font-size:13px;color:var(--tb);margin-bottom:10px">共 ${res.total} 人，候选 ${res.candidates} 人，可迁移 ${Math.max(0,(res.candidates||0)-(res.skipped||0))} 人，需人工核对 ${res.skipped||0} 人。</div><div class="tcard" style="max-height:360px;overflow:auto"><table><thead><tr><th>客户</th><th>旧金额</th><th>将生成流水</th><th>结果</th></tr></thead><tbody>${rows||'<tr><td colspan="4"><div class="empty"><p>没有需要迁移的数据</p></div></td></tr>'}</tbody></table></div><div class="mactions"><button class="btn-cancel" onclick="closeModal()">关闭</button><button class="btn-save" onclick="runCourtFinanceMigration()">执行无警告迁移</button></div>`;
}
async function runCourtFinanceMigration(){
  if(!confirm('只会迁移无警告数据，带警告的数据会跳过。确定执行吗？'))return;
  const btn=document.querySelector('.btn-save');btn.disabled=true;btn.textContent='迁移中…';
  try{
    const res=await apiCall('POST','/courts/migrate-finance-legacy',{dryRun:false});
    closeModal();toast(`迁移完成：${res.migrated||0} 人，跳过 ${res.skipped||0} 人`,'success');
    await loadAll();
  }catch(e){toast('迁移失败：'+e.message,'error');btn.disabled=false;btn.textContent='执行无警告迁移';}
}
let courtImportState={fileName:'',rows:[],summary:null};
function openCourtImport(){
  courtImportState={fileName:'',rows:[],summary:null};
  document.getElementById('importTitle').textContent='导入订场用户';
  document.getElementById('importBody').innerHTML=`<div class="import-grid"><div class="import-box"><label class="import-drop" for="courtImportFile"><strong>点击选择 CSV 文件</strong><div class="import-drop-sub">支持 UTF-8（fatal）/ GB18030 / GBK 编码，额外列会自动忽略</div></label><input class="import-file" id="courtImportFile" type="file" accept=".csv,text/csv" onchange="handleCourtImportFile(this)"><div class="import-meta" id="courtImportMeta"><span class="import-pill">未选择文件</span></div><div class="import-note" style="margin-top:10px">导入规则：<br>1. 必填字段：姓名。<br>2. 校区可留空。<br>3. 余额/储值默认 0。<br>4. 序号不会入库。<br>5. 已存在的用户会按手机号优先、否则按“姓名+校区”去重。<br>6. 末次跟进日期、下次跟进日期会一并导入。</div></div><div class="import-box"><div class="import-note"><strong>建议列名</strong><br>姓名、手机号、关联学员、校区、余额、储值、消费金额、对接人、对储值态度、熟悉程度、加入日期、末次跟进日期、下次跟进日期、备注<br><br><strong>特殊字段</strong><br>基本情况、沟通情况等，会自动保留到备注中。</div></div></div><div style="margin-top:14px" id="courtImportPreview"><div class="import-empty">请选择 CSV 文件后预览数据</div></div><div class="import-actions"><button class="btn-cancel" onclick="closeCourtImport()">取消</button><button class="btn-save" id="courtImportBtn" onclick="runCourtImport()" disabled>导入</button></div>`;
  document.getElementById('importOv').classList.add('open');
}
function closeCourtImport(){
  document.getElementById('importOv').classList.remove('open');
  courtImportState={fileName:'',rows:[],summary:null};
}
function parseCsvText(text){
  if(!text)return[];
  text=String(text).replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  const rows=[];let row=[];let cell='';let inQuotes=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(inQuotes){
      if(ch==='"'){
        if(next==='"'){cell+='"';i++;}
        else inQuotes=false;
      }else cell+=ch;
      continue;
    }
    if(ch==='"'){inQuotes=true;continue;}
    if(ch===','){row.push(cell);cell='';continue;}
    if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';continue;}
    cell+=ch;
  }
  if(cell.length||row.length){row.push(cell);rows.push(row);}
  const headerRow=rows.shift()||[];
  const headers=headerRow.map(h=>String(h||'').trim());
  return rows
    .map(r=>headers.reduce((acc,h,idx)=>{if(h)acc[h]=r[idx]??'';return acc;},{}))
    .filter(r=>Object.values(r).some(v=>String(v||'').trim()!==''));
}
function normalizeImportPhone(v){
  return String(v||'').replace(/[^\d]/g,'').trim();
}
function validateCnPhone(v){
  const phone=String(v||'').replace(/\s+/g,'').trim();
  return !phone||/^1[3-9]\d{9}$/.test(phone);
}
function readRowValue(row, aliases){
  const lowerMap=new Map(Object.keys(row).map(k=>[String(k).trim().toLowerCase(),k]));
  for(const alias of aliases){
    const realKey=lowerMap.get(String(alias).trim().toLowerCase());
    if(realKey!=null){
      const val=row[realKey];
      if(val!=null&&String(val).trim()!=='')return String(val).trim();
    }
  }
  return '';
}
function collectUnknownNotes(row,knownKeys){
  const notes=[];
  for(const [k,v] of Object.entries(row)){
    const key=String(k||'').trim();
    const val=String(v||'').trim();
    if(!val)continue;
    if(knownKeys.some(x=>String(x).trim().toLowerCase()===key.toLowerCase()))continue;
    notes.push(`${key}：${val}`);
  }
  return notes;
}
function getCourtDedupKeys(item){
  const keys=[];
  const phone=normalizeImportPhone(item.phone);
  if(phone)keys.push(`phone:${phone}`);
  const name=String(item.name||'').trim();
  const campus=String(item.campus||'').trim();
  if(name)keys.push(`namecampus:${name}|${campus}`);
  return keys;
}
function normalizeCampusCode(value){
  const raw=String(value||'').trim();
  if(!raw)return 'mabao';
  if(CAMPUS[raw])return raw;
  const match=Object.entries(CAMPUS).find(([,name])=>String(name).trim()===raw);
  return match?match[0]:raw;
}
function normalizeCourtImportRows(rawRows){
  const existingKeys=new Set();
  courts.forEach(item=>getCourtDedupKeys(item).forEach(k=>existingKeys.add(k)));
  const seenKeys=new Set();
  const rows=rawRows.map((row,index)=>{
    const name=readRowValue(row,['姓名','用户名','用户','订场用户','名称','客户']);
    const phone=readRowValue(row,['手机号','电话','手机','联系方式']);
    const studentId=resolveStudentIdByText(readRowValue(row,['关联学员','学员','学员姓名','关联学员姓名'])||phone||name);
    const campusRaw=readRowValue(row,['校区','门店','区域']);
    const campus=normalizeCampusCode(campusRaw||'mabao');
    const balanceRaw=readRowValue(row,['余额']);
    const depositRaw=readRowValue(row,['储值','历史储值','总储值','累计储值']);
    const joinDate=readRowValue(row,['加入日期','加入时间','日期']);
    const recentFollowUpDate=readRowValue(row,['末次跟进日期','末次跟进','最近跟进日期','最近跟进','跟进日期']);
    const nextFollowUpDate=readRowValue(row,['下次跟进日期','下次跟进','跟进提醒日期']);
    const spentAmount=readRowValue(row,['消费金额','消费','消费金额（仅自己订场部分）']);
    const owner=readRowValue(row,['对接人','负责人']);
    const depositAttitude=readRowValue(row,['对储值态度','对储值的态度']);
    const familiarity=readRowValue(row,['熟悉程度']);
    const baseNotes=[readRowValue(row,['备注','说明']),readRowValue(row,['基本情况']),readRowValue(row,['沟通情况'])].filter(Boolean).join('；');
    const extras=collectUnknownNotes(row,['序号','姓名','用户名','用户','订场用户','名称','客户','手机号','电话','手机','联系方式','关联学员','学员','学员姓名','关联学员姓名','校区','门店','区域','余额','储值','历史储值','总储值','累计储值','加入日期','加入时间','日期','末次跟进日期','末次跟进','最近跟进日期','最近跟进','跟进日期','下次跟进日期','下次跟进','跟进提醒日期','备注','说明','基本情况','沟通情况','消费金额','消费','消费金额（仅自己订场部分）','对接人','负责人','对储值态度','对储值的态度','熟悉程度']);
    const notes=[baseNotes,...extras].filter(Boolean).join('；');
    const parsedSpent=importMoney(spentAmount);
    const parsedDeposit=importMoney(depositRaw)||extractDepositAmountFromText(depositAttitude);
    const inferredBalance=!hasImportValue(balanceRaw)&&parsedDeposit>0&&parsedSpent>0?Math.max(0,parsedDeposit-parsedSpent):importMoney(balanceRaw);
    const item={name,phone,studentId,campus,balance:inferredBalance,totalDeposit:parsedDeposit||0,spentAmount:parsedSpent,owner,depositAttitude,familiarity,joinDate,recentFollowUpDate,nextFollowUpDate,notes,status:'active',history:[]};
    const keys=getCourtDedupKeys(item);
    let status='待导入';
    let reason='';
    if(!item.name){status='无效';reason='缺少姓名';}
    else if(keys.some(k=>existingKeys.has(k))){status='重复';reason='系统中已存在';}
    else if(keys.some(k=>seenKeys.has(k))){status='重复';reason='文件内重复';}
    keys.forEach(k=>seenKeys.add(k));
    return {...item,_rowIndex:index+2,_status:status,_reason:reason,_raw:row,_keys:keys};
  });
  const summary={
    total:rows.length,
    valid:rows.filter(r=>r._status==='待导入').length,
    duplicate:rows.filter(r=>r._status==='重复').length,
    invalid:rows.filter(r=>r._status==='无效').length
  };
  return {rows,summary};
}
function renderCourtImportPreview(){
  const host=document.getElementById('courtImportPreview');
  const meta=document.getElementById('courtImportMeta');
  const btn=document.getElementById('courtImportBtn');
  const {rows,summary}=courtImportState;
  if(meta){
    meta.innerHTML=courtImportState.fileName?[
      `<span class="import-pill ok">文件：${esc(courtImportState.fileName)}</span>`,
      `<span class="import-pill">总计 ${summary.total} 行</span>`,
      `<span class="import-pill ok">可导入 ${summary.valid} 行</span>`,
      summary.duplicate?`<span class="import-pill warn">重复 ${summary.duplicate} 行</span>`:'',
      summary.invalid?`<span class="import-pill warn">无效 ${summary.invalid} 行</span>`:''
    ].join(''):'<span class="import-pill">未选择文件</span>';
  }
  if(btn)btn.disabled=!summary||summary.valid===0;
  if(!rows.length){host.innerHTML='<div class="import-empty">请选择 CSV 文件后预览数据</div>';return;}
  const previewRows=rows.slice(0,50).map((r,i)=>{
    const cls=r._status==='待导入'?'ok':r._status==='重复'?'warn':'err';
    const statusText=r._status==='待导入'?'可导入':r._status==='重复'?`已跳过：${r._reason}`:`无效：${r._reason}`;
    const st=r.studentId?students.find(s=>s.id===r.studentId):null;
    return `<tr class="import-row ${cls}"><td>${esc(r.name||'')}</td><td>${esc(r.phone||'')}</td><td>${esc(st?.name||'')}</td><td>${cn(r.campus)||esc(r.campus||'')}</td><td>${fmt(r.balance)||0}</td><td>${fmt(r.totalDeposit)||0}</td><td>${fmt(r.spentAmount)||0}</td><td>${esc(r.owner||'')}</td><td>${esc(r.depositAttitude||'')}</td><td>${esc(r.familiarity||'')}</td><td>${esc(r.joinDate||'')}</td><td>${esc(r.recentFollowUpDate||'')}</td><td>${esc(r.nextFollowUpDate||'')}</td><td style="max-width:240px;white-space:normal;word-break:break-word">${esc(r.notes||'')}</td><td><span class="import-status ${cls}">${statusText}</span></td></tr>`;
  }).join('');
  host.innerHTML=`<div class="import-table-wrap"><table class="import-table"><thead><tr><th>姓名</th><th>手机号</th><th>关联学员</th><th>校区</th><th>余额</th><th>储值</th><th>消费金额</th><th>对接人</th><th>对储值态度</th><th>熟悉程度</th><th>加入日期</th><th>末次跟进日期</th><th>下次跟进日期</th><th>备注</th><th>结果</th></tr></thead><tbody>${previewRows}</tbody></table></div>${rows.length>50?`<div class="import-note" style="margin-top:8px">仅预览前 50 行，实际会按全部可导入数据执行。</div>`:''}`;
}
async function handleCourtImportFile(input){
  const file=input.files&&input.files[0];
  if(!file)return;
  try{
    const buf=await file.arrayBuffer();
    const text=decodeCourtCsvText(buf);
    const raw=parseCsvText(text);
    const normalized=normalizeCourtImportRows(raw);
    courtImportState={fileName:file.name,rows:normalized.rows,summary:normalized.summary};
    renderCourtImportPreview();
  }catch(e){
    toast('读取失败：'+e.message,'error');
  }
}
async function runCourtImport(){
  const btn=document.getElementById('courtImportBtn');
  const rows=(courtImportState.rows||[]).filter(r=>r._status==='待导入');
  if(!rows.length){toast('没有可导入的数据','warn');return;}
  btn.disabled=true;btn.textContent=`导入中 0/${rows.length}`;
  let success=0,failed=0;
  try{
    const makePayload=row=>({name:row.name,phone:row.phone,studentId:row.studentId,campus:row.campus,balance:row.balance,totalDeposit:row.totalDeposit,spentAmount:row.spentAmount,owner:row.owner,depositAttitude:row.depositAttitude,familiarity:row.familiarity,joinDate:row.joinDate,recentFollowUpDate:row.recentFollowUpDate,nextFollowUpDate:row.nextFollowUpDate,notes:row.notes,status:'active',history:[]});
    for(let i=0;i<rows.length;i+=20){
      const batchRows=rows.slice(i,i+20);
      const payload=batchRows.map(makePayload);
      const result=await apiCall('POST','/courts/import',{rows:payload});
      success+=result.success||0;failed+=result.failed||0;
      batchRows.forEach((row,index)=>{
        const err=result.errors?.find(e=>e.name===payload[index].name);
        row._status=err?'无效':'已导入';
        row._reason=err?err.error:'';
      });
      btn.textContent=`导入中 ${Math.min(i+batchRows.length,rows.length)}/${rows.length}`;
      renderCourtImportPreview();
    }
    await loadAll();
    renderCourtImportPreview();
    renderCourts();
    toast(`导入完成：成功 ${success} 行，失败 ${failed} 行`,'success');
    closeCourtImport();
  }catch(e){
    toast('导入失败：'+e.message,'error');
  }finally{
    btn.disabled=false;
    btn.textContent='导入';
  }
}
function closePurchaseImport(){
  document.getElementById('importOv').classList.remove('open');
  purchaseImportState={fileName:'',rows:[],summary:null};
}
function normalizePackageIdByText(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const byId=packages.find(p=>p.id===raw);
  if(byId)return byId.id;
  const byName=packages.find(p=>String(p.name||'').trim()===raw);
  return byName?.id||'';
}
function normalizePurchaseImportRows(rawRows){
  const rows=rawRows.map((row,index)=>{
    const studentText=readRowValue(row,['学员','学员姓名','姓名','手机号','电话']);
    const phone=readRowValue(row,['手机号','电话','手机']);
    const studentMatch=resolveUniqueStudentIdByText(studentText||phone);
    const packageMatch=resolveUniquePackageIdByText(readRowValue(row,['售卖课包','课包','课包名称']));
    const studentId=studentMatch.id;
    const packageId=packageMatch.id;
    const student=students.find(s=>s.id===studentId);
    const pkg=packages.find(p=>p.id===packageId);
    const item={studentId,studentName:student?.name||'',packageId,packageName:pkg?.name||'',purchaseDate:readRowValue(row,['购买日期','日期'])||today(),amountPaid:importMoney(readRowValue(row,['实收','实收金额','金额']))||(pkg?.price||0),payMethod:readRowValue(row,['支付方式','支付'])||'微信',notes:readRowValue(row,['备注','说明'])||''};
    let status='待导入',reason='';
    if(!studentId){status='无效';reason=studentMatch.reason;}
    else if(!packageId){status='无效';reason=packageMatch.reason;}
    else if(pkg?.status==='inactive'){status='无效';reason='课包已停用';}
    return {...item,_rowIndex:index+2,_status:status,_reason:reason};
  });
  return {rows,summary:{total:rows.length,valid:rows.filter(r=>r._status==='待导入').length,invalid:rows.filter(r=>r._status!=='待导入').length}};
}
function renderPurchaseImportPreview(){
  const host=document.getElementById('purchaseImportPreview');
  const meta=document.getElementById('purchaseImportMeta');
  const btn=document.getElementById('purchaseImportBtn');
  const {rows,summary}=purchaseImportState;
  if(meta){
    meta.innerHTML=purchaseImportState.fileName?[
      `<span class="import-pill ok">文件：${esc(purchaseImportState.fileName)}</span>`,
      `<span class="import-pill">总计 ${summary.total} 行</span>`,
      `<span class="import-pill ok">可导入 ${summary.valid} 行</span>`,
      summary.invalid?`<span class="import-pill warn">无效 ${summary.invalid} 行</span>`:''
    ].join(''):'<span class="import-pill">未选择文件</span>';
  }
  if(btn)btn.disabled=!summary||summary.valid===0;
  if(!rows.length){if(host)host.innerHTML='<div class="import-empty">请选择 CSV 文件后预览数据</div>';return;}
  const previewRows=rows.slice(0,50).map(r=>{
    const cls=r._status==='待导入'?'ok':'err';
    const statusText=r._status==='待导入'?'可导入':`无效：${r._reason}`;
    const pkg=packages.find(p=>p.id===r.packageId);
    return `<tr class="import-row ${cls}"><td>${esc(r.studentName||'')}</td><td>${esc(pkg?.productName||'')}</td><td>${esc(r.packageName||'')}</td><td>${esc(r.purchaseDate||'')}</td><td>${fmt(r.amountPaid)||0}</td><td>${esc(r.payMethod||'')}</td><td style="max-width:220px;white-space:normal;word-break:break-word">${esc(r.notes||'')}</td><td><span class="import-status ${cls}">${statusText}</span></td></tr>`;
  }).join('');
  if(host)host.innerHTML=`<div class="import-table-wrap"><table class="import-table"><thead><tr><th>学员</th><th>课程产品</th><th>售卖课包</th><th>购买日期</th><th>实收</th><th>支付方式</th><th>备注</th><th>结果</th></tr></thead><tbody>${previewRows}</tbody></table></div>${rows.length>50?`<div class="import-note" style="margin-top:8px">仅预览前 50 行，实际会按全部可导入数据执行。</div>`:''}`;
}
async function handlePurchaseImportFile(input){
  const file=input.files&&input.files[0];
  if(!file)return;
  try{
    const buf=await file.arrayBuffer();
    let text='';
    for(const enc of ['utf-8','gb18030','gbk']){
      try{text=new TextDecoder(enc).decode(buf);if(text)break;}catch{text='';}
    }
    const raw=parseCsvText(text);
    const normalized=normalizePurchaseImportRows(raw);
    purchaseImportState={fileName:file.name,rows:normalized.rows,summary:normalized.summary};
    renderPurchaseImportPreview();
  }catch(e){
    toast('读取失败：'+e.message,'error');
  }
}
function openPurchaseImport(){
  purchaseImportState={fileName:'',rows:[],summary:null};
  document.getElementById('importTitle').textContent='导入购买记录';
  document.getElementById('importBody').innerHTML=`<div class="import-grid"><div class="import-box"><label class="import-drop" for="purchaseImportFile"><strong>点击选择 CSV 文件</strong><div class="import-drop-sub">支持 UTF-8 / GBK / GB18030 编码</div></label><input class="import-file" id="purchaseImportFile" type="file" accept=".csv,text/csv" onchange="handlePurchaseImportFile(this)"><div class="import-meta" id="purchaseImportMeta"><span class="import-pill">未选择文件</span></div><div class="import-note" style="margin-top:10px">建议列名：学员、售卖课包、购买日期、实收、支付方式、备注。<br>学员可以写姓名或手机号；售卖课包必须能匹配到现有课包。</div></div><div class="import-box"><div class="import-note"><strong>导入规则</strong><br>1. 导入时仍按现有购买逻辑逐条创建。<br>2. 每条购买都会自动生成课包余额。<br>3. 不存在的学员或课包会直接拦下，不会半条写入。</div></div></div><div style="margin-top:14px" id="purchaseImportPreview"><div class="import-empty">请选择 CSV 文件后预览数据</div></div><div class="import-actions"><button class="btn-cancel" onclick="closePurchaseImport()">取消</button><button class="btn-save" id="purchaseImportBtn" onclick="runPurchaseImport()" disabled>导入</button></div>`;
  document.getElementById('importOv').classList.add('open');
}
async function runPurchaseImport(){
  const btn=document.getElementById('purchaseImportBtn');
  const rows=(purchaseImportState.rows||[]).filter(r=>r._status==='待导入');
  if(!rows.length){toast('没有可导入的数据','warn');return;}
  btn.disabled=true;btn.textContent=`导入中 0/${rows.length}`;
  let success=0,failed=0;
  try{
    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      try{
        const pkg=packages.find(p=>p.id===row.packageId);
        const overrideReason=(Number(row.amountPaid)||0)!==(Number(pkg?.price)||0)?'导入历史成交价':'';
        const res=await apiCall('POST','/purchases',{studentId:row.studentId,packageId:row.packageId,purchaseDate:row.purchaseDate,amountPaid:row.amountPaid,overrideReason,payMethod:row.payMethod,notes:row.notes});
        if(res.purchase)purchases.unshift(res.purchase);
        if(res.entitlement)entitlements.unshift(res.entitlement);
        row._status='已导入';
        success++;
      }catch(e){
        row._status='无效';
        row._reason=e.message;
        failed++;
      }
      btn.textContent=`导入中 ${i+1}/${rows.length}`;
      renderPurchaseImportPreview();
    }
    renderStudents();renderPurchases();renderEntitlements();
    toast(`导入完成：成功 ${success} 行，失败 ${failed} 行`,failed?'warn':'success');
    closePurchaseImport();
  }catch(e){
    toast('导入失败：'+e.message,'error');
  }finally{
    btn.disabled=false;
    btn.textContent='导入';
  }
}
