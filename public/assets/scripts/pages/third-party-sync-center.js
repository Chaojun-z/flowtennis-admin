// ===== 第三方同步中心 =====
function thirdPartySyncData(){
  return thirdPartySyncCenterData||{summary:{},batches:[],rawRecords:[],prechecks:[],confirmations:[],importResults:[]};
}
function thirdPartySyncLatestBatch(){
  const batches=[...(thirdPartySyncData().batches||[])];
  return batches.sort((a,b)=>String(b.pulledAt||'').localeCompare(String(a.pulledAt||'')))[0]||null;
}
function thirdPartySyncStatusText(status){
  return ({
    pulled:'已拉取',
    prechecked:'已预检',
    pending_confirmation:'待确认',
    writable:'可写入',
    completed:'已完成',
    paused:'已暂停',
    rolled_back:'已回滚'
  })[status]||status||'-';
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
function thirdPartySyncMoneyImpactText(impact={}){
  const cash=Number(impact.cashDelta||0)||0;
  const recognized=Number(impact.recognizedRevenueDelta||0)||0;
  const deferred=Number(impact.deferredRevenueDelta||0)||0;
  return `现金 ${fmt(cash)} / 入账 ${fmt(recognized)} / 待履约 ${fmt(deferred)}`;
}
function renderThirdPartySyncStats(){
  const host=document.getElementById('thirdPartySyncStats');
  if(!host)return;
  const data=thirdPartySyncData();
  const summary=data.summary||{};
  const latest=thirdPartySyncLatestBatch();
  host.innerHTML=renderStandardDataCards([
    {label:'最近同步时间',value:latest?.pulledAt?String(latest.pulledAt).replace('T',' ').slice(0,16):'-',sub:latest?thirdPartySyncStatusText(latest.status):'暂无批次'},
    {label:'拉取数量',value:Number(summary.rawCount||0),sub:'原始记录池'},
    {label:'自动通过数量',value:Number(summary.autoImportCount||0),sub:'只生成导入计划'},
    {label:'待确认数量',value:Number(summary.pendingCount||0),sub:'需要运营判断'},
    {label:'高危异常',value:Number(summary.exceptionCount||0),sub:'暂不导入'},
    {label:'重复跳过',value:Number(summary.duplicateCount||0),sub:'同场地时段去重'}
  ]);
}
function renderThirdPartySyncBatches(){
  const host=document.getElementById('thirdPartySyncBatchTbody');
  if(!host)return;
  const rows=[...(thirdPartySyncData().batches||[])].sort((a,b)=>String(b.pulledAt||'').localeCompare(String(a.pulledAt||'')));
  host.innerHTML=rows.map(row=>`<tr>
    <td style="padding-left:20px"><div class="tms-cell-main">${esc(row.batchId||row.id||'-')}</div><div class="tms-cell-sub">${esc(row.sourceSystem||'changxiaoer')}</div></td>
    <td>${renderStandardCellText(`${row.rangeStart||'-'} 至 ${row.rangeEnd||'-'}`)}</td>
    <td><span class="tms-tag">${esc(thirdPartySyncStatusText(row.status))}</span></td>
    <td>${renderStandardCellText(row.pulledAt?String(row.pulledAt).replace('T',' ').slice(0,16):'-')}</td>
    <td>${renderStandardCellText(Object.entries(row.counts||{}).map(([k,v])=>`${thirdPartySyncTypeText(k)} ${v}`).join(' / ')||'-')}</td>
    <td>${renderStandardCellText(thirdPartySyncMoneyImpactText(row.financeImpact||{}))}</td>
    <td class="tms-sticky-r tms-action-cell" style="width:120px;padding-right:20px;text-align:right"><span class="tms-action-link" onclick="filterThirdPartySyncBatch('${esc(row.batchId||row.id||'')}')">查看</span></td>
  </tr>`).join('')||'<tr><td colspan="7"><div class="empty"><p>暂无同步批次</p></div></td></tr>';
}
let thirdPartySyncBatchFilter='';
function filterThirdPartySyncBatch(batchId){
  thirdPartySyncBatchFilter=batchId||'';
  renderThirdPartySyncPrechecks();
}
function thirdPartySyncVisiblePrechecks(){
  const rows=thirdPartySyncData().prechecks||[];
  return thirdPartySyncBatchFilter?rows.filter(row=>String(row.batchId||'')===thirdPartySyncBatchFilter):rows;
}
function renderThirdPartySyncPrechecks(){
  const host=document.getElementById('thirdPartySyncPrecheckTbody');
  if(!host)return;
  const rows=thirdPartySyncVisiblePrechecks();
  host.innerHTML=rows.map(row=>{
    const canConfirm=row.needsConfirmation||row.recommendedType==='needs_confirmation'||row.recommendedType==='high_risk_exception';
    const action=canConfirm?`<span class="tms-action-link" onclick="openThirdPartySyncConfirmModal('${esc(row.batchId||'')}','${esc(row.sourceRecordId||'')}')">确认</span>`:'<span class="tms-cell-sub">-</span>';
    return `<tr>
      <td style="padding-left:20px"><div class="tms-cell-main">${esc(row.date||'-')}</div><div class="tms-cell-sub">${esc([row.startTime,row.endTime].filter(Boolean).join('-')||'-')}</div></td>
      <td>${renderStandardCellText(row.venue||'-')}</td>
      <td>${renderStandardCellText([row.customerName,row.phone].filter(Boolean).join(' / ')||'-')}</td>
      <td>${renderStandardCellText(row.remark||'-')}</td>
      <td>${renderStandardCellText(row.amount?`¥${fmt(row.amount)}`:'-')}</td>
      <td>${renderStandardCellText(row.sourceType||'-')}</td>
      <td><span class="tms-tag">${esc(thirdPartySyncTypeText(row.recommendedType))}</span></td>
      <td>${renderStandardCellText(row.plannedAction||'-')}</td>
      <td>${renderStandardCellText(row.riskReason||'-')}</td>
      <td>${renderStandardCellText(thirdPartySyncMoneyImpactText(row.financeImpact||{}))}</td>
      <td class="tms-sticky-r tms-action-cell" style="width:100px;padding-right:20px;text-align:right">${action}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="11"><div class="empty"><p>暂无预检结果</p></div></td></tr>';
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
  if(!await appConfirm('本次只拉取第三方数据并生成预检，不写业务表。',{title:'拉取并预检',confirmText:'开始'}))return;
  try{
    await apiCall('POST','/third-party-sync/pull',{lookbackDays:3});
    staleCachedDatasets.add('thirdPartySyncCenterPage');
    await loadThirdPartySyncCenter(true);
    toast('第三方数据已拉取并完成预检','success');
  }catch(e){
    toast('拉取失败：'+e.message,'error');
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
function renderThirdPartySyncCenter(){
  const host=document.getElementById('page-third-party-sync');
  if(!host)return;
  host.innerHTML=`<div class="section-stack">
    <div class="tms-stats-row" id="thirdPartySyncStats"></div>
    <div class="tms-toolbar">
      <div class="tms-filters"></div>
      <div class="tms-toolbar-right"><button class="tms-btn tms-btn-primary" onclick="runThirdPartySyncPull()">拉取并预检</button><button class="tms-btn tms-btn-ghost" onclick="loadThirdPartySyncCenter(true)">刷新</button></div>
    </div>
    <div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="width:220px;padding-left:20px">批次</th><th style="width:280px">时间范围</th><th style="width:100px">状态</th><th style="width:150px">最近同步</th><th style="width:260px">数据量</th><th style="width:240px">财务影响预估</th><th class="tms-sticky-r" style="width:120px;padding-right:20px;text-align:right">操作</th></tr></thead><tbody id="thirdPartySyncBatchTbody"></tbody></table></div></div>
    <div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="width:150px;padding-left:20px">日期/时间段</th><th style="width:100px">场地</th><th style="width:170px">第三方用户</th><th style="width:180px">第三方备注</th><th style="width:100px">金额</th><th style="width:110px">来源</th><th style="width:130px">系统判断</th><th style="width:150px">计划动作</th><th style="width:180px">高危原因</th><th style="width:220px">财务影响</th><th class="tms-sticky-r" style="width:100px;padding-right:20px;text-align:right">确认</th></tr></thead><tbody id="thirdPartySyncPrecheckTbody"></tbody></table></div></div>
    <div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="width:180px;padding-left:20px">第三方记录</th><th style="width:140px">最终类型</th><th style="width:120px">支付方式</th><th style="width:100px">金额</th><th style="width:120px">确认人</th><th style="width:160px">确认时间</th><th style="width:240px">备注</th></tr></thead><tbody id="thirdPartySyncConfirmTbody"></tbody></table></div></div>
  </div>`;
  renderThirdPartySyncStats();
  renderThirdPartySyncBatches();
  renderThirdPartySyncPrechecks();
  renderThirdPartySyncConfirmations();
}
