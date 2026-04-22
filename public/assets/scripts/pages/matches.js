// ===== 约球管理 =====
async function loadMatches(force=false){
  try{
    await ensureDatasetsByName(['matchesPage'],{force});
    renderMatches();
  }catch(e){
    toast('加载约球失败：'+e.message,'error');
  }
}
function matchRowText(row){
  const regs=Array.isArray(row.registrations)?row.registrations:[];
  return [row.title,row.venueName,row.venueAddress,...regs.map(r=>r.nickName||r.phone||r.userId)].join(' ').toLowerCase();
}
function renderMatches(){
  const host=document.getElementById('matchTbody');if(!host)return;
  const q=String(document.getElementById('matchSearch')?.value||'').trim().toLowerCase();
  const status=document.getElementById('matchStatusFilter')?.value||'';
  const rows=(matches||[]).filter(row=>(!status||row.status===status)&&(!q||matchRowText(row).includes(q)));
  host.innerHTML=rows.map(row=>{
    const regs=Array.isArray(row.registrations)?row.registrations:[];
    const actions=[
      `<span class="tms-action-link" onclick="openMatchBookingModal('${row.id}')">订场</span>`,
      `<span class="tms-action-link" onclick="openMatchAttendanceModal('${row.id}')">到场</span>`,
      `<span class="tms-action-link" onclick="confirmMatchFees('${row.id}')">生成AA</span>`,
      `<span class="tms-action-link" onclick="openMatchFeeModal('${row.id}')">收款</span>`
    ].join('');
    return `<tr><td style="padding-left:20px"><div class="tms-cell-main">${esc(row.title||'-')}</div><div class="tms-cell-sub">${esc(row.matchType||'')}</div></td><td>${renderCourtCellText(matchTimeText(row),false)}</td><td>${renderCourtCellText(row.booking?.venueNameFinal||row.venueName||'待定')}</td><td><div class="tms-cell-text">${row.currentHeadcount||0}/${row.targetHeadcount||0}</div></td><td><span class="tms-tag">${esc(row.statusText||row.status||'-')}</span></td><td><div class="tms-cell-text">¥${fmt(row.estimatedCourtFee||0)}</div></td><td><div class="tms-cell-text">¥${fmt(row.booking?.finalcourtfee||row.booking?.finalCourtFee||row.finalCourtFee||0)}</div></td><td><div class="tms-cell-text" style="white-space:normal;line-height:1.55;min-width:220px">${esc(regs.map(r=>r.nickName||r.phone||r.userId).join('；')||'-')}</div></td><td class="tms-sticky-r tms-action-cell" style="width:220px;padding-right:20px;text-align:right">${actions}</td></tr>`;
  }).join('')||'<tr><td colspan="9"><div class="empty"><p>暂无约球数据</p></div></td></tr>';
}
function matchTimeText(row){
  const start=String(row.startTime||'').replace('T',' ').slice(0,16);
  const end=String(row.endTime||'').replace('T',' ').slice(11,16);
  return end?`${start}-${end}`:start;
}
function openMatchBookingModal(id){
  const row=(matches||[]).find(x=>x.id===id);if(!row)return;
  const body=`<div class="tms-section-header" style="margin-top:0;">订场信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">最终场馆</label><input class="finput tms-form-control" id="matchVenueFinal" value="${esc(row.venueName||'')}"></div><div class="tms-form-item"><label class="tms-form-label">场地号</label><input class="finput tms-form-control" id="matchCourtNo" value=""></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">最终场地费 *</label><input class="finput tms-form-control" id="matchFinalCourtFee" type="number" min="0" value="${row.finalCourtFee||row.estimatedCourtFee||''}"></div><div class="tms-form-item"><label class="tms-form-label">订场状态</label><select class="finput tms-form-control" id="matchBookingStatus"><option value="booked">订场成功</option><option value="cancelled">订场取消</option></select></div></div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" onclick="saveMatchBooking('${id}')">保存</button>`;
  setCourtModalFrame('约球订场',body,actions,'modal-wide');
}
async function saveMatchBooking(id){
  try{
    await apiCall('POST',`/admin/matches/${id}/booking`,{venueNameFinal:document.getElementById('matchVenueFinal').value.trim(),courtNo:document.getElementById('matchCourtNo').value.trim(),finalCourtFee:parseFloat(document.getElementById('matchFinalCourtFee').value)||0,bookingStatus:document.getElementById('matchBookingStatus').value});
    closeModal();toast('订场已保存','success');await loadMatches(true);
  }catch(e){toast('保存失败：'+e.message,'error');}
}
function openMatchAttendanceModal(id){
  const row=(matches||[]).find(x=>x.id===id);if(!row)return;
  const regs=Array.isArray(row.registrations)?row.registrations:[];
  const body=`<div class="tms-section-header" style="margin-top:0;">到场确认</div>${regs.map(r=>`<label class="choice-tag" style="width:100%;justify-content:space-between;margin-bottom:8px"><span>${esc(r.nickName||r.phone||r.userId)}</span><select class="finput tms-form-control match-attendance-status" data-user-id="${esc(r.userId||r.userid)}" style="width:130px"><option value="attended">到场</option><option value="absent">缺席</option></select></label>`).join('')||'<div class="empty"><p>暂无报名人</p></div>'}`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" onclick="saveMatchAttendance('${id}')">保存</button>`;
  setCourtModalFrame('确认到场',body,actions,'modal-wide');
}
async function saveMatchAttendance(id){
  const items=[...document.querySelectorAll('.match-attendance-status')].map(el=>({userId:el.dataset.userId,finalStatus:el.value}));
  try{
    await apiCall('POST',`/admin/matches/${id}/attendance`,{items});
    closeModal();toast('到场已确认','success');await loadMatches(true);
  }catch(e){toast('保存失败：'+e.message,'error');}
}
async function confirmMatchFees(id){
  if(!await appConfirm('确认按最终到场名单生成 AA 应收？',{title:'生成 AA 应收',confirmText:'确认生成'}))return;
  try{
    await apiCall('POST',`/admin/matches/${id}/fees/confirm`,{});
    toast('AA 应收已生成','success');await loadMatches(true);
  }catch(e){toast('生成失败：'+e.message,'error');}
}
function openMatchFeeModal(id){
  const row=(matches||[]).find(x=>x.id===id);if(!row)return;
  const splits=Array.isArray(row.feeSplits)?row.feeSplits:[];
  const body=`<div class="tms-section-header" style="margin-top:0;">AA 应收</div><div class="tms-table-card" style="margin-bottom:0"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="padding-left:20px;width:160px">球友</th><th style="width:100px">应收</th><th style="width:100px">状态</th><th class="tms-sticky-r" style="width:220px;padding-right:20px;text-align:right">操作</th></tr></thead><tbody>${splits.map(s=>`<tr><td style="padding-left:20px">${renderCourtCellText(s.nickName||s.phone||s.userId||s.userid)}</td><td><div class="tms-cell-text">¥${fmt(s.amount||0)}</div></td><td>${renderCourtCellText(matchPayStatusText(s.payStatus||s.paystatus),false)}</td><td class="tms-sticky-r tms-action-cell" style="width:220px;padding-right:20px;text-align:right"><span class="tms-action-link" onclick="updateMatchFeeSplit('${id}','${s.userId||s.userid}','paid')">已收</span><span class="tms-action-link" onclick="updateMatchFeeSplit('${id}','${s.userId||s.userid}','waived')">减免</span><span class="tms-action-link" onclick="updateMatchFeeSplit('${id}','${s.userId||s.userid}','abnormal')">异常</span></td></tr>`).join('')||'<tr><td colspan="4"><div class="empty"><p>暂无 AA 应收，请先生成 AA</p></div></td></tr>'}</tbody></table></div></div>`;
  setCourtModalFrame('约球收款',body,`<button class="tms-btn tms-btn-primary" onclick="closeModal()">关闭</button>`,'modal-wide');
}
function matchPayStatusText(status){
  return ({pending:'待收',paid:'已收',waived:'减免',refunded:'已退款',bad_debt:'坏账',abnormal:'异常'}[status]||status||'-');
}
async function updateMatchFeeSplit(matchId,userId,payStatus){
  try{
    await apiCall('POST',`/admin/matches/${matchId}/fees/splits/${userId}`,{payStatus});
    toast('收款状态已更新','success');
    await loadMatches(true);
    openMatchFeeModal(matchId);
  }catch(e){toast('更新失败：'+e.message,'error');}
}
