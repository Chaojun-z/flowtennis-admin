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
  renderMatchFinanceStats(rows);
  host.innerHTML=rows.map(row=>{
    const regs=Array.isArray(row.registrations)?row.registrations:[];
    const actions=[
      `<span class="tms-action-link" onclick="openMatchBookingModal('${row.id}')">订场</span>`,
      `<span class="tms-action-link" onclick="openMatchWithdrawalModal('${row.id}')">退赛</span>`,
      `<span class="tms-action-link" onclick="openMatchAttendanceModal('${row.id}')">到场</span>`,
      `<span class="tms-action-link" onclick="confirmMatchFees('${row.id}')">生成AA</span>`,
      `<span class="tms-action-link" onclick="openMatchFeeModal('${row.id}')">收款</span>`,
      `<span class="tms-action-link" onclick="openMatchLogModal('${row.id}')">日志</span>`
    ].join('');
    return `<tr><td style="padding-left:20px"><div class="tms-cell-main">${esc(row.title||'-')}</div><div class="tms-cell-sub">${esc(row.matchType||'')}</div></td><td>${renderCourtCellText(matchTimeText(row),false)}</td><td>${renderCourtCellText(row.booking?.venueNameFinal||row.venueName||'待定')}</td><td><div class="tms-cell-text">${row.currentHeadcount||0}/${row.targetHeadcount||0}</div></td><td><span class="tms-tag">${esc(row.statusText||row.status||'-')}</span></td><td><div class="tms-cell-text">¥${fmt(row.estimatedCourtFee||0)}</div></td><td><div class="tms-cell-text">¥${fmt(row.booking?.finalcourtfee||row.booking?.finalCourtFee||row.finalCourtFee||0)}</div></td><td><div class="tms-cell-text" style="white-space:normal;line-height:1.55;min-width:220px">${esc(regs.map(r=>r.nickName||r.phone||r.userId).join('；')||'-')}</div></td><td class="tms-sticky-r tms-action-cell" style="width:220px;padding-right:20px;text-align:right">${actions}</td></tr>`;
  }).join('')||'<tr><td colspan="9"><div class="empty"><p>暂无约球数据</p></div></td></tr>';
}
function matchFinanceSummary(rows){
  const summary={receivable:0,paid:0,pending:0,waived:0,abnormal:0,refunded:0};
  (rows||[]).forEach(row=>{
    (Array.isArray(row.feeSplits)?row.feeSplits:[]).forEach(split=>{
      const amount=Number(split.amount)||0;
      const status=split.payStatus||split.paystatus||'pending';
      summary.receivable+=amount;
      if(status==='paid')summary.paid+=amount;
      else if(status==='waived')summary.waived+=amount;
      else if(status==='abnormal'||status==='bad_debt')summary.abnormal+=amount;
      else if(status==='refunded')summary.refunded+=amount;
      else summary.pending+=amount;
    });
  });
  Object.keys(summary).forEach(key=>summary[key]=Math.round(summary[key]*100)/100);
  return summary;
}
function renderMatchFinanceStats(rows){
  const host=document.getElementById('matchFinanceStats');if(!host)return;
  const s=matchFinanceSummary(rows);
  host.innerHTML=[
    ['应收',`¥${fmt(s.receivable)}`],
    ['已收',`¥${fmt(s.paid)}`],
    ['待收',`¥${fmt(s.pending)}`],
    ['减免',`¥${fmt(s.waived)}`],
    ['异常',`¥${fmt(s.abnormal)}`],
    ['退款',`¥${fmt(s.refunded)}`]
  ].map(([label,value])=>`<div class="tms-stat-card"><div class="tms-stat-label">${label}</div><div class="tms-stat-value">${value}</div></div>`).join('')+
    `<div class="tms-stat-card" style="cursor:pointer" onclick="openMatchCourtFinanceLedger()"><div class="tms-stat-label">约球订场总账</div><div class="tms-stat-value">查看</div></div>`+
    `<div class="tms-stat-card" style="cursor:pointer" onclick="openMatchDailyFinanceReport()"><div class="tms-stat-label">约球日结</div><div class="tms-stat-value">对账</div></div>`;
}
async function openMatchCourtFinanceLedger(){
  try{
    await ensureDatasetsByName(['courtsPage']);
    openCourtFinanceModal('match-court-finance');
  }catch(e){
    toast('总账打开失败：'+e.message,'error');
  }
}
async function openMatchDailyFinanceReport(){
  try{
    const date=new Date().toISOString().slice(0,10);
    const report=await apiCall('GET',`/admin/matches/finance-daily?date=${date}`);
    const s=report.summary||{};
    const body=`<div class="tms-section-header" style="margin-top:0;">${esc(report.date||date)} 约球日结</div><div class="tms-stats-row">${[
      ['应收',s.receivable],['已收',s.paid],['待收',s.pending],['减免',s.waived],['异常',s.abnormal],['退款',s.refunded],['总账净额',s.ledgerNet],['差额',s.diff]
    ].map(([label,value])=>`<div class="tms-stat-card"><div class="tms-stat-label">${label}</div><div class="tms-stat-value">¥${fmt(value||0)}</div></div>`).join('')}</div><div style="font-size:12px;color:var(--ts);line-height:1.6">差额 = 系统应计净额 - 场地财务总账净额；必须为 0 才能日结。</div>`;
    setCourtModalFrame('约球财务日结',body,`<button class="tms-btn tms-btn-primary" onclick="closeModal()">关闭</button>`,'modal-wide');
  }catch(e){
    toast('日结加载失败：'+e.message,'error');
  }
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
function openMatchWithdrawalModal(id){
  const row=(matches||[]).find(x=>x.id===id);if(!row)return;
  const regs=Array.isArray(row.registrations)?row.registrations:[];
  const body=`<div class="tms-section-header" style="margin-top:0;">已订场退赛处理</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">退赛球友</label><select class="finput tms-form-control" id="matchWithdrawalUser">${regs.map(r=>`<option value="${esc(r.userId||r.userid)}">${esc(r.nickName||r.phone||r.userId||r.userid)}</option>`).join('')}</select></div><div class="tms-form-item"><label class="tms-form-label">财务责任</label><select class="finput tms-form-control" id="matchWithdrawalResponsibility"><option value="charge">仍需AA</option><option value="waive">减免</option><option value="abnormal">异常待处理</option></select></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">原因</label><input class="finput tms-form-control" id="matchWithdrawalReason" placeholder="例：临时有事，运营已确认"></div></div><div style="font-size:12px;color:var(--ts);line-height:1.6">booked 后用户不能自行退出，必须由运营在这里处理责任。</div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" onclick="saveMatchWithdrawal('${id}')">保存</button>`;
  setCourtModalFrame('处理退赛',body,actions,'modal-wide');
}
async function saveMatchWithdrawal(matchId){
  const userId=document.getElementById('matchWithdrawalUser')?.value||'';
  if(!userId){toast('暂无可处理报名人','warn');return;}
  try{
    await apiCall('POST',`/admin/matches/${matchId}/registrations/${userId}/withdrawal`,{financialResponsibility:document.getElementById('matchWithdrawalResponsibility')?.value||'abnormal',reason:document.getElementById('matchWithdrawalReason')?.value.trim()||''});
    closeModal();toast('退赛责任已记录','success');await loadMatches(true);
  }catch(e){toast('处理失败：'+e.message,'error');}
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
  const body=`<div class="tms-section-header" style="margin-top:0;">AA 应收</div><div style="font-size:12px;color:var(--ts);line-height:1.6;margin-bottom:10px">标记已收后会同步进入场地财务总账，分类为约球订场收入。</div><div class="tms-table-card" style="margin-bottom:0"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="padding-left:20px;width:160px">球友</th><th style="width:100px">应收</th><th style="width:100px">状态</th><th class="tms-sticky-r" style="width:260px;padding-right:20px;text-align:right">操作</th></tr></thead><tbody>${splits.map(s=>`<tr><td style="padding-left:20px">${renderCourtCellText(s.nickName||s.phone||s.userId||s.userid)}</td><td><div class="tms-cell-text">¥${fmt(s.amount||0)}</div></td><td>${renderCourtCellText(matchPayStatusText(s.payStatus||s.paystatus),false)}</td><td class="tms-sticky-r tms-action-cell" style="width:260px;padding-right:20px;text-align:right"><span class="tms-action-link" onclick="updateMatchFeeSplit('${id}','${s.userId||s.userid}','paid')">已收</span><span class="tms-action-link" onclick="updateMatchFeeSplit('${id}','${s.userId||s.userid}','waived')">减免</span><span class="tms-action-link" onclick="updateMatchFeeSplit('${id}','${s.userId||s.userid}','abnormal')">异常</span><span class="tms-action-link" onclick="updateMatchFeeSplit('${id}','${s.userId||s.userid}','refunded')">退款</span></td></tr>`).join('')||'<tr><td colspan="4"><div class="empty"><p>暂无 AA 应收，请先生成 AA</p></div></td></tr>'}</tbody></table></div></div>`;
  setCourtModalFrame('约球收款',body,`<button class="tms-btn tms-btn-primary" onclick="closeModal()">关闭</button>`,'modal-wide');
}
function matchPayStatusText(status){
  return ({pending:'待收',paid:'已收',waived:'减免',refunded:'已退款',bad_debt:'坏账',abnormal:'异常'}[status]||status||'-');
}
async function updateMatchFeeSplit(matchId,userId,payStatus){
  let matchFeeNote='';
  if(['waived','abnormal','refunded','bad_debt'].includes(payStatus)){
    matchFeeNote=String(window.prompt('请填写原因')||'').trim();
    if(!matchFeeNote){toast('请填写原因','warn');return;}
  }
  try{
    await apiCall('POST',`/admin/matches/${matchId}/fees/splits/${userId}`,{payStatus,note:matchFeeNote});
    toast('收款状态已更新','success');
    await loadMatches(true);
    openMatchFeeModal(matchId);
  }catch(e){toast('更新失败：'+e.message,'error');}
}
function matchLogActionText(action){
  return ({booking:'订场',attendance_confirm:'确认到场',fee_generate:'生成AA',fee_split_update:'收款更新',booked_withdrawal:'已订场退赛',match_cancel:'取消球局',match_update:'修改球局',notify_failed:'通知失败'}[action]||action||'-');
}
function openMatchLogModal(id){
  const row=(matches||[]).find(x=>x.id===id);if(!row)return;
  const operationLogs=Array.isArray(row.operationLogs)?row.operationLogs:[];
  const body=`<div class="tms-section-header" style="margin-top:0;">操作日志</div><div class="tms-table-card" style="margin-bottom:0"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="padding-left:20px;width:150px">时间</th><th style="width:120px">动作</th><th style="width:120px">操作人</th><th>内容</th></tr></thead><tbody>${operationLogs.map(log=>`<tr><td style="padding-left:20px">${renderCourtCellText(String(log.createdAt||log.createdat||'').replace('T',' ').slice(0,16),false)}</td><td>${renderCourtCellText(matchLogActionText(log.action),false)}</td><td>${renderCourtCellText(log.operatorId||log.operatorid,false)}</td><td><div class="tms-text-remark" style="white-space:normal;line-height:1.55">${esc(matchLogSummary(log))}</div></td></tr>`).join('')||'<tr><td colspan="4"><div class="empty"><p>暂无操作日志</p></div></td></tr>'}</tbody></table></div></div>`;
  setCourtModalFrame('约球操作日志',body,`<button class="tms-btn tms-btn-primary" onclick="closeModal()">关闭</button>`,'modal-wide');
}
function matchLogSummary(log){
  const after=log.after||log.afterjson||'';
  if(!after)return '-';
  if(typeof after==='string')return after.length>120?after.slice(0,120)+'...':after;
  return JSON.stringify(after);
}
