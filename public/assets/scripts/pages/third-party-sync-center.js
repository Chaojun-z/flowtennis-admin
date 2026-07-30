// ===== 第三方同步中心 =====
let thirdPartySyncActiveTableTab='batches';
let thirdPartySyncPullLoading=false;
function thirdPartySyncData(){
  return thirdPartySyncCenterData||{summary:{},batches:[],rawRecords:[],prechecks:[],confirmations:[],importResults:[],changes:[],alerts:[],rollbacks:[]};
}
function thirdPartySyncLatestBatch(){
  const batches=[...(thirdPartySyncData().batches||[])];
  return batches.sort((a,b)=>String(b.pulledAt||'').localeCompare(String(a.pulledAt||'')))[0]||null;
}
function thirdPartySyncStatusText(status){
  return ({
    open:'待处理',
    pending_review:'待处理',
    resolved:'已处理',
    pulled:'已拉取',
    prechecked:'已预检',
    pending_confirmation:'待确认',
    writable:'可写入',
    completed:'已完成',
    partial_completed:'部分完成',
    partial_failed:'部分失败',
    failed:'失败',
    paused:'已暂停',
    rolled_back:'已回滚'
  })[status]||status||'-';
}
function thirdPartySyncStatusClass(status){
  const text=String(status||'').toLowerCase();
  if(['failed','partial_failed','open'].includes(text))return 'tms-tag-red';
  if(['paused','pending_confirmation','pending_review','partial_completed'].includes(text))return 'tms-tag-tier-gold';
  if(['completed','prechecked','pulled','resolved'].includes(text))return 'tms-tag-green';
  if(text==='rolled_back')return 'tms-tag-tier-slate';
  return 'tms-tag-tier-slate';
}
function thirdPartySyncStatusTag(status){
  return `<span class="tms-tag ${thirdPartySyncStatusClass(status)}">${esc(thirdPartySyncStatusText(status))}</span>`;
}
function thirdPartySyncTypeText(type){
  return ({
    auto_import:'可自动导入',
    needs_confirmation:'需要运营确认',
    do_not_import:'暂不导入',
    duplicate_skip:'重复跳过',
    high_risk_exception:'高危异常'
  })[type]||type||'-';
}
function thirdPartySyncIsBookingSourceType(type){
  return ['order','lock'].includes(String(type||'').toLowerCase());
}
function thirdPartySyncIsGapSourceType(type){
  return /-gap$/.test(String(type||'').toLowerCase());
}
function thirdPartySyncRowsForBatch(rows=[],batchId=''){
  return (rows||[]).filter(row=>String(row.batchId||'')===String(batchId||''));
}
function thirdPartySyncBatchCountText(row={}){
  const batchId=row.batchId||row.id||'';
  const data=thirdPartySyncData();
  const raws=thirdPartySyncRowsForBatch(data.rawRecords||[],batchId);
  const prechecks=thirdPartySyncRowsForBatch(data.prechecks||[],batchId).filter(item=>thirdPartySyncIsBookingSourceType(item.sourceType));
  const bookingCount=raws.filter(item=>thirdPartySyncIsBookingSourceType(item.sourceType)).length;
  const memberCount=raws.filter(item=>String(item.sourceType||'').toLowerCase()==='member').length;
  const gapCount=raws.filter(item=>thirdPartySyncIsGapSourceType(item.sourceType)).length;
  const parts=[
    `订场订单 ${bookingCount}`,
    `会员资料 ${memberCount}`,
    `接口缺口 ${gapCount}`,
    `可自动导入 ${prechecks.filter(item=>item.recommendedType==='auto_import').length}`,
    `需确认 ${prechecks.filter(item=>item.needsConfirmation||item.recommendedType==='needs_confirmation').length}`,
    `高危 ${prechecks.filter(item=>item.recommendedType==='high_risk_exception').length}`
  ];
  return parts.join(' / ');
}
function thirdPartySyncBatchById(batchId=''){
  return (thirdPartySyncData().batches||[]).find(row=>String(row.batchId||row.id||'')===String(batchId||''))||null;
}
function thirdPartySyncBatchDateText(row={}){
  const start=String(row.rangeStart||'').slice(0,10);
  const end=String(row.rangeEnd||'').slice(0,10);
  return start&&end&&start!==end?`${start} 至 ${end}`:start||end||'-';
}
function thirdPartySyncBatchRangeText(row={}){
  return `${row.rangeStart||'-'} 至 ${row.rangeEnd||'-'}`;
}
function thirdPartySyncMoneyImpactText(impact={}){
  const cash=Number(impact.cashDelta||0)||0;
  const recognized=Number(impact.recognizedRevenueDelta||0)||0;
  const deferred=Number(impact.deferredRevenueDelta||0)||0;
  return `现金 ${fmt(cash)} / 入账 ${fmt(recognized)} / 待履约 ${fmt(deferred)}`;
}
function thirdPartySyncStatsCompactCards(){
  const data=thirdPartySyncData();
  const summary=data.summary||{};
  const latest=thirdPartySyncLatestBatch();
  return [
    {label:'最近同步',value:latest?.pulledAt?String(latest.pulledAt).replace('T',' ').slice(5,16):'-',sub:latest?thirdPartySyncStatusText(latest.status):'暂无同步'},
    {label:'订场订单',value:Number(summary.bookingOrderCount||0),sub:'进入预检'},
    {label:'会员资料',value:Number(summary.memberProfileCount||0),sub:'资料层'},
    {label:'接口缺口',value:Number(summary.syncGapCount||0),sub:'待补接口'},
    {label:'可自动导入',value:Number(summary.autoImportCount||0),sub:'订场订单'},
    {label:'需运营确认',value:Number(summary.pendingCount||0),sub:'订场订单'},
    {label:'高危异常',value:Number(summary.exceptionCount||0),sub:'订场订单'},
    {label:'重复跳过',value:Number(summary.duplicateCount||0),sub:'同场地时段去重'},
  ];
}
function renderThirdPartySyncStats(){
  const host=document.getElementById('thirdPartySyncStats');
  if(!host)return;
  host.innerHTML=renderStandardDataCards(thirdPartySyncStatsCompactCards());
}
function renderThirdPartySyncBatches(){
  const host=document.getElementById('thirdPartySyncBatchTbody');
  if(!host)return;
  const rows=[...(thirdPartySyncData().batches||[])].sort((a,b)=>String(b.pulledAt||'').localeCompare(String(a.pulledAt||'')));
  host.innerHTML=rows.map(row=>`<tr>
    <td style="padding-left:20px">${renderStandardCellText(thirdPartySyncBatchDateText(row))}</td>
    <td>${renderStandardCellText(thirdPartySyncBatchRangeText(row))}</td>
    <td>${thirdPartySyncStatusTag(row.status)}</td>
    <td>${renderStandardCellText(row.pulledAt?String(row.pulledAt).replace('T',' ').slice(0,16):'-')}</td>
    <td>${renderStandardCellText(thirdPartySyncBatchCountText(row))}</td>
    <td class="tms-sticky-r tms-action-cell" style="width:220px;padding-right:20px;text-align:right"><span class="tms-action-link" onclick="filterThirdPartySyncBatch('${esc(row.batchId||row.id||'')}')">查看需处理</span><span class="tms-action-link" onclick="runThirdPartySyncImportPlan('${esc(row.batchId||row.id||'')}')">导入计划</span><span class="tms-action-link" onclick="runThirdPartySyncImport('${esc(row.batchId||row.id||'')}')">一键导入</span></td>
  </tr>`).join('')||'<tr><td colspan="6"><div class="empty"><p>暂无同步记录</p></div></td></tr>';
}
let thirdPartySyncBatchFilter='';
function filterThirdPartySyncBatch(batchId){
  thirdPartySyncBatchFilter=batchId||'';
  thirdPartySyncActiveTableTab='prechecks';
  renderThirdPartySyncCenter();
  renderThirdPartySyncPrechecks();
}
function thirdPartySyncEffectiveBatchId(){
  return thirdPartySyncBatchFilter || thirdPartySyncLatestBatch()?.batchId || thirdPartySyncLatestBatch()?.id || '';
}
function thirdPartySyncVisiblePrechecks(){
  const rows=thirdPartySyncData().prechecks||[];
  const batchId=thirdPartySyncEffectiveBatchId();
  const scoped=batchId?rows.filter(row=>String(row.batchId||'')===String(batchId)):rows;
  return thirdPartySyncBookingPrechecks(scoped).filter(row=>row.needsConfirmation||row.recommendedType==='needs_confirmation'||row.recommendedType==='high_risk_exception');
}
function thirdPartySyncBookingPrechecks(rows=[]){
  return (rows||[]).filter(row=>thirdPartySyncIsBookingSourceType(row.sourceType));
}
function thirdPartySyncMemberProfileNote(){
  const data=thirdPartySyncData();
  const batchId=thirdPartySyncEffectiveBatchId();
  const rawRows=thirdPartySyncRowsForBatch(data.rawRecords||[],batchId);
  const memberCount=rawRows.filter(row=>String(row.sourceType||'').toLowerCase()==='member').length;
  const gapCount=rawRows.filter(row=>thirdPartySyncIsGapSourceType(row.sourceType)).length;
  return `<div class="tms-audit-note third-party-sync-member-note">会员资料 ${memberCount} 条、接口缺口 ${gapCount} 条。会员资料只同步到资料层，不需要人工处理；本表只显示需要运营确认的订场记录。</div>`;
}
function thirdPartySyncBookingModeText(row={}){
  if(row.bookingMode)return row.bookingMode;
  const type=String(row.sourceType||'').toLowerCase();
  if(type==='lock')return '运营锁场';
  if(type==='order')return '用户自助订场';
  return '-';
}
function renderThirdPartySyncPrechecks(){
  const host=document.getElementById('thirdPartySyncPrecheckTbody');
  if(!host)return;
  const rows=thirdPartySyncVisiblePrechecks();
  host.innerHTML=rows.map(row=>{
    const canConfirm=row.needsConfirmation||row.recommendedType==='needs_confirmation'||row.recommendedType==='high_risk_exception';
    const action=canConfirm?`<span class="tms-action-link" onclick="openThirdPartySyncConfirmModal('${esc(row.batchId||'')}','${esc(row.sourceRecordId||'')}')">确认</span>`:'<span class="tms-cell-sub">-</span>';
    return `<tr>
      <td style="padding-left:20px">${renderStandardCellText(row.date||'-')}</td>
      <td>${renderStandardCellText([row.startTime,row.endTime].filter(Boolean).join('-')||'-')}</td>
      <td>${renderStandardCellText(row.venue||'-')}</td>
      <td>${renderStandardCellText(row.customerName||'-')}</td>
      <td>${renderStandardCellText(row.phone||'-')}</td>
      <td>${renderStandardCellText(thirdPartySyncBookingModeText(row))}</td>
      <td>${renderStandardCellText(row.operatorAccount||'-')}</td>
      <td>${renderStandardTooltipText(row.remark||'-')}</td>
      <td>${renderStandardCellText(row.amount?`¥${fmt(row.amount)}`:'-')}</td>
      <td><span class="tms-tag ${row.recommendedType==='high_risk_exception'?'tms-tag-red':'tms-tag-tier-gold'}">${esc(thirdPartySyncTypeText(row.recommendedType))}</span></td>
      <td>${renderStandardCellText(row.riskReason||'-')}</td>
      <td class="tms-sticky-r tms-action-cell" style="width:100px;padding-right:20px;text-align:right">${action}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="12"><div class="empty"><p>暂无需要运营确认的订场记录</p></div></td></tr>';
}
function renderThirdPartySyncConfirmations(){
  const host=document.getElementById('thirdPartySyncConfirmTbody');
  if(!host)return;
  const rows=[...(thirdPartySyncData().confirmations||[])].sort((a,b)=>String(b.confirmedAt||'').localeCompare(String(a.confirmedAt||'')));
  host.innerHTML=rows.map(row=>`<tr>
    <td style="padding-left:20px">${renderStandardCellText(row.sourceRecordId||'-')}</td>
    <td>${renderStandardCellText(row.finalType||'-')}</td>
    <td>${renderStandardCellText(row.paymentMethod||'-')}</td>
    <td>${renderStandardCellText(row.amount?`¥${fmt(row.amount)}`:'-')}</td>
    <td>${renderStandardCellText(row.confirmedBy||'-')}</td>
    <td>${renderStandardCellText(row.confirmedAt?String(row.confirmedAt).replace('T',' ').slice(0,16):'-')}</td>
    <td>${renderStandardCellText(row.confirmNote||'-')}</td>
  </tr>`).join('')||'<tr><td colspan="7"><div class="empty"><p>暂无确认记录</p></div></td></tr>';
}
function renderThirdPartySyncImportResults(){
  const host=document.getElementById('thirdPartySyncImportResultTbody');
  if(!host)return;
  const rows=[...(thirdPartySyncData().importResults||[])].sort((a,b)=>String(b.importedAt||'').localeCompare(String(a.importedAt||'')));
  host.innerHTML=rows.map(row=>{
    const failed=(row.failed||[]).map(item=>`${item.sourceRecordId||'-'}：${item.reason||'-'}`).join(' / ');
    const skipped=(row.skippedIds||[]).length;
    const batch=thirdPartySyncBatchById(row.batchId);
    return `<tr>
      <td style="padding-left:20px">${renderStandardCellText(thirdPartySyncBatchDateText(batch||{}))}</td>
      <td>${thirdPartySyncStatusTag(row.status)}</td>
      <td>${renderStandardCellText(row.importedAt?String(row.importedAt).replace('T',' ').slice(0,16):'-')}</td>
      <td>${renderStandardCellText((row.writtenTables||[]).join(' / ')||'-')}</td>
      <td>${renderStandardCellText(`${(row.writtenIds||[]).length} 条写入 / ${skipped} 条跳过`)}</td>
      <td>${renderStandardCellText(failed||'-')}</td>
      <td class="tms-sticky-r tms-action-cell" style="width:100px;padding-right:20px;text-align:right">${row.status==='rolled_back'?'<span class="tms-cell-sub">已回滚</span>':`<span class="tms-action-link" onclick="runThirdPartySyncRollback('${esc(row.operationId||'')}')">回滚</span>`}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="7"><div class="empty"><p>暂无写入结果</p></div></td></tr>';
}
function thirdPartySyncChangeTypeText(type){
  return ({cancelled:'取消',refunded:'退款',amount_changed:'金额变化',booking_changed:'订场变化',remark_changed:'备注修改',updated:'内容变化'})[type]||type||'-';
}
function renderThirdPartySyncChanges(){
  const host=document.getElementById('thirdPartySyncChangeTbody');
  if(!host)return;
  const rows=[...(thirdPartySyncData().changes||[])].sort((a,b)=>String(b.detectedAt||'').localeCompare(String(a.detectedAt||'')));
  host.innerHTML=rows.map(row=>`<tr>
    <td style="padding-left:20px">${renderStandardCellText(row.sourceRecordId||'-')}</td>
    <td><span class="tms-tag ${/取消|退款/.test(thirdPartySyncChangeTypeText(row.changeType))?'tms-tag-red':'tms-tag-tier-gold'}">${esc(thirdPartySyncChangeTypeText(row.changeType))}</span></td>
    <td>${renderStandardCellText((row.changedFields||[]).map(item=>item.field).join(' / ')||'-')}</td>
    <td>${renderStandardCellText(row.detectedAt?String(row.detectedAt).replace('T',' ').slice(0,16):'-')}</td>
    <td>${renderStandardCellText(/取消|退款|金额|订场/.test(thirdPartySyncChangeTypeText(row.changeType))?'核对是否需要回滚或人工调整':'确认备注变化即可')}</td>
    <td>${thirdPartySyncStatusTag(row.status)}</td>
  </tr>`).join('')||'<tr><td colspan="6"><div class="empty"><p>暂无第三方变更</p></div></td></tr>';
}
function renderThirdPartySyncAlerts(){
  const host=document.getElementById('thirdPartySyncAlertTbody');
  if(!host)return;
  const rows=[...(thirdPartySyncData().alerts||[])].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  host.innerHTML=rows.map(row=>{
    const batch=thirdPartySyncBatchById(row.batchId);
    return `<tr>
    <td style="padding-left:20px">${renderStandardCellText(thirdPartySyncBatchDateText(batch||{}))}</td>
    <td>${renderStandardCellText(row.reason||'-')}</td>
    <td>${renderStandardCellText(/失败|缺口|格式|等待/.test(String(row.reason||''))?'处理后再导入':'确认后关闭')}</td>
    <td>${thirdPartySyncStatusTag(row.status)}</td>
    <td>${renderStandardCellText(row.createdAt?String(row.createdAt).replace('T',' ').slice(0,16):'-')}</td>
  </tr>`;
  }).join('')||'<tr><td colspan="5"><div class="empty"><p>暂无异常报警</p></div></td></tr>';
}
function renderThirdPartySyncRollbacks(){
  const host=document.getElementById('thirdPartySyncRollbackTbody');
  if(!host)return;
  const rows=[...(thirdPartySyncData().rollbacks||[])].sort((a,b)=>String(b.rolledBackAt||'').localeCompare(String(a.rolledBackAt||'')));
  host.innerHTML=rows.map(row=>{
    const impact=(row.restored||[]).map(item=>`${item.table||'-'} / ${item.id||'-'} / ${item.action||'-'}`).join('；');
    const batch=thirdPartySyncBatchById(row.batchId);
    return `<tr>
      <td style="padding-left:20px">${renderStandardCellText(thirdPartySyncBatchDateText(batch||{}))}</td>
      <td>${renderStandardCellText(row.rolledBackAt?String(row.rolledBackAt).replace('T',' ').slice(0,16):'-')}</td>
      <td>${renderStandardCellText(row.rolledBackBy||'-')}</td>
      <td>${renderStandardCellText(impact||'-')}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="4"><div class="empty"><p>暂无回滚影响</p></div></td></tr>';
}
async function loadThirdPartySyncCenter(force=false){
  try{
    await ensureDatasetsByName(['thirdPartySyncCenterPage'],{force});
    renderThirdPartySyncCenter();
  }catch(e){
    const host=document.getElementById('page-third-party-sync');
    if(host)host.innerHTML=`<div class="tms-table-error-state"><div class="tms-empty-title">加载失败</div><div class="tms-empty-desc">${esc(e.message||'请稍后重试')}</div></div>`;
  }
}
async function runThirdPartySyncPull(){
  if(!await appConfirm('从第三方平台拉取前一天数据并生成预检；需要先配置 CXE_USER / CXE_PASS。此操作不写业务表。',{title:'手动拉取第三方数据',confirmText:'开始拉取'}))return;
  thirdPartySyncPullLoading=true;
  renderThirdPartySyncCenter();
  toast('正在拉取第三方数据，请稍等','info');
  try{
    await apiCall('POST','/third-party-sync/pull',{});
    thirdPartySyncBatchFilter='';
    staleCachedDatasets.add('thirdPartySyncCenterPage');
    await loadThirdPartySyncCenter(true);
    toast('第三方数据已拉取并完成预检','success');
  }catch(e){
    const message=String(e?.message||'请稍后重试');
    const readable=/CXE_USER|CXE_PASS/.test(message)?'缺少第三方账号配置（CXE_USER / CXE_PASS），请先配置后再拉取。':message;
    toast('手动拉取失败：'+readable,'error');
  }finally{
    thirdPartySyncPullLoading=false;
    renderThirdPartySyncCenter();
  }
}
async function runThirdPartySyncImportPlan(batchId){
  try{
    const res=await apiCall('POST','/third-party-sync/import-plan',{batchId});
    const plan=res.plan||{};
    const body=`<div class="tms-stats-row">${renderStandardDataCards([
      {label:'可导入',value:Number(plan.counts?.importable||0),sub:'高确定性/已确认'},
      {label:'阻断',value:Number(plan.counts?.blocked||0),sub:'需继续处理'},
      {label:'跳过',value:Number(plan.counts?.skipped||0),sub:'重复或不导入'},
      {label:'同步信息',value:Number(plan.counts?.informational||0),sub:'会员资料/接口缺口'}
    ])}</div>
    <div class="tms-section-header">阻断原因</div>
    <div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="padding-left:20px">第三方记录</th><th>原因</th></tr></thead><tbody>${(plan.blocked||[]).slice(0,20).map(row=>`<tr><td style="padding-left:20px">${renderStandardCellText(row.sourceRecordId||'-')}</td><td>${renderStandardCellText(row.reason||row.riskReason||'-')}</td></tr>`).join('')||'<tr><td colspan="2"><div class="empty"><p>暂无阻断项</p></div></td></tr>'}</tbody></table></div></div>`;
    openStandardModal({title:'导入计划',bodyHtml:body,actionsHtml:'<button class="tms-btn tms-btn-primary" onclick="closeModal()">知道了</button>',extraClass:'modal-wide'});
  }catch(e){
    toast('导入计划生成失败：'+e.message,'error');
  }
}
async function runThirdPartySyncImport(batchId){
  if(!await appConfirm('将写入高确定性数据和已确认异常项。系统会先备份，写入后记录财务、订场、会员、排课核验结果。',{title:'一键半自动导入',confirmText:'开始导入'}))return;
  try{
    const res=await apiCall('POST','/third-party-sync/import',{batchId});
    staleCachedDatasets.add('thirdPartySyncCenterPage');
    await loadThirdPartySyncCenter(true);
    const status=res.result?.status||'';
    toast(status==='completed'?'导入完成':status==='partial_completed'?'已导入可写入项，仍有阻断项待处理':'导入结束，请查看失败原因',['completed','partial_completed'].includes(status)?'success':'warning');
  }catch(e){
    toast('导入失败：'+e.message,'error');
  }
}
async function runThirdPartySyncRollback(operationId){
  if(!operationId)return toast('缺少回滚记录','error');
  if(!await appConfirm('将按本次导入前备份回滚写入结果。',{title:'同步回滚',confirmText:'确认回滚'}))return;
  try{
    await apiCall('POST','/third-party-sync/rollback',{operationId});
    staleCachedDatasets.add('thirdPartySyncCenterPage');
    await loadThirdPartySyncCenter(true);
    toast('本次同步已回滚','success');
  }catch(e){
    toast('回滚失败：'+e.message,'error');
  }
}
function openThirdPartySyncConfirmModal(batchId,sourceRecordId){
  const typeOptions=['排课占场','内部占用','会员余额订场','散客微信转账订场','散客现金订场','大众点评券码订场','教练代订场','畅打活动','订场陪打','忽略不导入','待老板确认'];
  const payOptions=['不涉及支付','会员余额','微信转账','现金','大众点评券码','其他平台券码','已在活动中收款'];
  const body=`<div class="tms-section-header" style="margin-top:0;">运营确认</div>
    <div class="tms-form-row">
      <div class="tms-form-item"><label class="tms-form-label">最终业务类型 *</label><select class="finput tms-form-control" id="thirdPartyConfirmType">${typeOptions.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></div>
      <div class="tms-form-item"><label class="tms-form-label">支付方式</label><select class="finput tms-form-control" id="thirdPartyConfirmPay">${payOptions.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></div>
    </div>
    <div class="tms-form-row">
      <div class="tms-form-item"><label class="tms-form-label">确认金额</label><input class="finput tms-form-control" id="thirdPartyConfirmAmount" type="number" min="0" placeholder="涉及收入时填写"></div>
      <div class="tms-form-item"><label class="tms-form-label">绑定对象ID</label><input class="finput tms-form-control" id="thirdPartyConfirmBindId" placeholder="会员、排课或订场用户 ID"></div>
    </div>
    <div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">确认备注</label><input class="finput tms-form-control" id="thirdPartyConfirmNote" placeholder="填写运营判断依据"></div></div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" onclick="confirmThirdPartySyncItem('${esc(batchId)}','${esc(sourceRecordId)}')">保存确认</button>`;
  openStandardModal({title:'确认第三方异常项',bodyHtml:body,actionsHtml:actions,extraClass:'modal-wide'});
}
async function confirmThirdPartySyncItem(batchId,sourceRecordId){
  try{
    await apiCall('POST','/third-party-sync/confirmations',{
      batchId,
      sourceRecordId,
      finalType:document.getElementById('thirdPartyConfirmType')?.value||'',
      paymentMethod:document.getElementById('thirdPartyConfirmPay')?.value||'',
      amount:Number(document.getElementById('thirdPartyConfirmAmount')?.value||0)||0,
      bindTargetId:document.getElementById('thirdPartyConfirmBindId')?.value.trim()||'',
      confirmNote:document.getElementById('thirdPartyConfirmNote')?.value.trim()||''
    });
    closeModal();
    staleCachedDatasets.add('thirdPartySyncCenterPage');
    await loadThirdPartySyncCenter(true);
    toast('确认已保存','success');
  }catch(e){
    toast('保存失败：'+e.message,'error');
  }
}
function setThirdPartySyncTableTab(tab){
  thirdPartySyncActiveTableTab=['batches','prechecks','writes','changes'].includes(tab)?tab:'batches';
  renderThirdPartySyncCenter();
}
function thirdPartySyncTableTabButton(tab,label){
  return `<button type="button" class="ctab${thirdPartySyncActiveTableTab===tab?' active':''}" onclick="setThirdPartySyncTableTab('${esc(tab)}')">${esc(label)}</button>`;
}
function thirdPartySyncTablePanel(tab,bodyHtml){
  return `<div class="third-party-sync-table-panel${thirdPartySyncActiveTableTab===tab?' active':''}">${bodyHtml}</div>`;
}
function renderThirdPartySyncCenter(){
  const host=document.getElementById('page-third-party-sync');
  if(!host)return;
  const pullButtonHtml=thirdPartySyncPullLoading
    ? '<button class="tms-btn tms-btn-primary" disabled><span class="tms-btn-spinner"></span>正在拉取</button>'
    : '<button class="tms-btn tms-btn-primary" onclick="runThirdPartySyncPull()">手动拉取</button>';
  host.innerHTML=`<div class="section-stack">
    <style>
      #page-third-party-sync .third-party-sync-stats-row{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:8px}
      #page-third-party-sync .third-party-sync-stats-row .tms-stat-card{min-width:0;padding:10px 12px}
      #page-third-party-sync .third-party-sync-stats-row .tms-stat-label{font-size:11px;white-space:nowrap}
      #page-third-party-sync .third-party-sync-stats-row .tms-stat-value{font-size:20px;line-height:1.15;white-space:nowrap}
      #page-third-party-sync .third-party-sync-stats-row .tms-stat-sub{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #page-third-party-sync .third-party-sync-table-tabs{display:flex;gap:8px;align-items:center;overflow-x:auto;margin:4px 0 12px}
      #page-third-party-sync .third-party-sync-table-panel{display:none}
      #page-third-party-sync .third-party-sync-table-panel.active{display:block}
      #page-third-party-sync .tms-table th,#page-third-party-sync .tms-table td,#page-third-party-sync .tms-cell-text,#page-third-party-sync .tms-text-primary,#page-third-party-sync .tms-text-remark,#page-third-party-sync .tms-action-link,#page-third-party-sync .tms-tag{font-size:12px}
      #page-third-party-sync .tms-table{min-width:1280px}
      #page-third-party-sync .tms-btn-spinner{width:14px;height:14px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;display:inline-block;margin-right:8px;vertical-align:-2px;animation:thirdPartySyncSpin .8s linear infinite}
      @keyframes thirdPartySyncSpin{to{transform:rotate(360deg)}}
    </style>
    <div class="tms-stats-row third-party-sync-stats-row" id="thirdPartySyncStats" aria-label="稳定自动同步"></div>
    <div class="tms-toolbar">
      <div class="tms-filters"></div>
      <div class="tms-toolbar-right">${pullButtonHtml}<button class="tms-btn tms-btn-ghost" onclick="loadThirdPartySyncCenter(true)">刷新</button></div>
    </div>
    <div class="third-party-sync-table-tabs" role="tablist" aria-label="第三方同步数据表">
      ${thirdPartySyncTableTabButton('batches','同步记录')}
      ${thirdPartySyncTableTabButton('prechecks','预检确认')}
      ${thirdPartySyncTableTabButton('writes','写入回滚')}
      ${thirdPartySyncTableTabButton('changes','异常处理')}
    </div>
    ${thirdPartySyncTablePanel('batches','<div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="width:180px;padding-left:20px">同步日期</th><th style="width:280px">时间范围</th><th style="width:100px">状态</th><th style="width:150px">最近同步</th><th style="width:360px">数据量</th><th class="tms-sticky-r" style="width:220px;padding-right:20px;text-align:right">操作</th></tr></thead><tbody id="thirdPartySyncBatchTbody"></tbody></table></div></div>')}
    ${thirdPartySyncTablePanel('prechecks',`${thirdPartySyncMemberProfileNote()}<div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="width:110px;padding-left:20px">日期</th><th style="width:110px">时间段</th><th style="width:80px">场地</th><th style="width:110px">用户名</th><th style="width:140px">手机号</th><th style="width:120px">订场方式</th><th style="width:120px">操作账号</th><th style="width:180px">备注</th><th style="width:90px">金额</th><th style="width:130px">处理建议</th><th style="width:180px">风险原因</th><th class="tms-sticky-r" style="width:100px;padding-right:20px;text-align:right">操作</th></tr></thead><tbody id="thirdPartySyncPrecheckTbody"></tbody></table></div></div><div class="tms-section-header">确认记录</div><div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="width:180px;padding-left:20px">第三方记录</th><th style="width:140px">最终类型</th><th style="width:120px">支付方式</th><th style="width:100px">金额</th><th style="width:120px">确认人</th><th style="width:160px">确认时间</th><th style="width:240px">备注</th></tr></thead><tbody id="thirdPartySyncConfirmTbody"></tbody></table></div></div>`)}
    ${thirdPartySyncTablePanel('writes','<div class="tms-section-header" style="margin-top:0">写入结果</div><div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="width:180px;padding-left:20px">同步日期</th><th style="width:100px">状态</th><th style="width:150px">导入时间</th><th style="width:220px">写入表</th><th style="width:160px">写入数量</th><th style="width:260px">失败原因</th><th class="tms-sticky-r" style="width:100px;padding-right:20px;text-align:right">回滚</th></tr></thead><tbody id="thirdPartySyncImportResultTbody"></tbody></table></div></div><div class="tms-section-header">回滚影响</div><div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="width:180px;padding-left:20px">同步日期</th><th style="width:160px">回滚时间</th><th style="width:120px">操作人</th><th style="width:520px">影响明细</th></tr></thead><tbody id="thirdPartySyncRollbackTbody"></tbody></table></div></div>')}
    ${thirdPartySyncTablePanel('changes','<div class="tms-section-header" style="margin-top:0">第三方变更待处理</div><div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="width:180px;padding-left:20px">第三方记录</th><th style="width:120px">发生什么</th><th style="width:220px">影响内容</th><th style="width:160px">发现时间</th><th style="width:260px">运营要做什么</th><th style="width:120px">状态</th></tr></thead><tbody id="thirdPartySyncChangeTbody"></tbody></table></div></div><div class="tms-section-header">异常待处理</div><div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="width:180px;padding-left:20px">同步日期</th><th style="width:360px">问题</th><th style="width:220px">运营要做什么</th><th style="width:120px">状态</th><th style="width:160px">时间</th></tr></thead><tbody id="thirdPartySyncAlertTbody"></tbody></table></div></div>')}
  </div>`;
  renderThirdPartySyncStats();
  renderThirdPartySyncBatches();
  renderThirdPartySyncPrechecks();
  renderThirdPartySyncConfirmations();
  renderThirdPartySyncImportResults();
  renderThirdPartySyncChanges();
  renderThirdPartySyncAlerts();
  renderThirdPartySyncRollbacks();
}
