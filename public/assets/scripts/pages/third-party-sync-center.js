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
function thirdPartySyncImportedSourceCount(batchId=''){
  const ids=new Set();
  (thirdPartySyncData().importResults||[])
    .filter(row=>String(row.batchId||'')===String(batchId||'')&&['completed','partial_completed','partial_failed'].includes(String(row.status||'')))
    .forEach(row=>(row.writtenIds||[]).forEach(item=>{
      const id=String(item.sourceRecordId||'').trim();
      if(id)ids.add(id);
    }));
  return ids.size;
}
function thirdPartySyncLatestImportResult(batchId=''){
  return [...(thirdPartySyncData().importResults||[])]
    .filter(row=>String(row.batchId||'')===String(batchId||''))
    .sort((a,b)=>String(b.importedAt||'').localeCompare(String(a.importedAt||'')))[0]||null;
}
function thirdPartySyncBatchMetrics(row={}){
  const batchId=row.batchId||row.id||'';
  const data=thirdPartySyncData();
  const raws=thirdPartySyncRowsForBatch(data.rawRecords||[],batchId);
  const prechecks=thirdPartySyncRowsForBatch(data.prechecks||[],batchId).filter(item=>thirdPartySyncIsBookingSourceType(item.sourceType));
  const needRows=thirdPartySyncNeedsProcessingRows(batchId);
  const alertCount=thirdPartySyncRowsForBatch(data.alerts||[],batchId).filter(item=>String(item.status||'open')==='open').length;
  const changeCount=thirdPartySyncRowsForBatch(data.changes||[],batchId).filter(item=>String(item.status||'pending_review')==='pending_review').length;
  return {
    bookingCount:raws.filter(item=>thirdPartySyncIsBookingSourceType(item.sourceType)).length,
    memberCount:raws.filter(item=>String(item.sourceType||'').toLowerCase()==='member').length,
    gapCount:raws.filter(item=>thirdPartySyncIsGapSourceType(item.sourceType)).length,
    autoImportableCount:prechecks.filter(item=>item.recommendedType==='auto_import').length,
    importedCount:thirdPartySyncImportedSourceCount(batchId),
    needProcessCount:needRows.length,
    exceptionCount:alertCount+changeCount
  };
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
  host.innerHTML=rows.map(row=>{
    const batchId=row.batchId||row.id||'';
    const metrics=thirdPartySyncBatchMetrics(row);
    const latestImport=thirdPartySyncLatestImportResult(batchId);
    const status=latestImport?.status||row.status;
    return `<tr>
    <td style="padding-left:20px">${renderStandardCellText(thirdPartySyncBatchDateText(row))}</td>
    <td>${renderStandardCellText(thirdPartySyncBatchRangeText(row))}</td>
    <td>${renderStandardCellText(metrics.bookingCount)}</td>
    <td>${renderStandardCellText(metrics.memberCount)}</td>
    <td>${renderStandardCellText(metrics.gapCount)}</td>
    <td>${renderStandardCellText(metrics.importedCount)}</td>
    <td>${renderStandardCellText(metrics.needProcessCount)}</td>
    <td>${renderStandardCellText(metrics.exceptionCount)}</td>
    <td>${thirdPartySyncStatusTag(status)}</td>
    <td>${renderStandardCellText(row.pulledAt?String(row.pulledAt).replace('T',' ').slice(0,16):'-')}</td>
    <td class="tms-sticky-r tms-action-cell" style="width:210px;padding-right:20px;text-align:right"><span class="tms-action-link" onclick="filterThirdPartySyncBatch('${esc(batchId)}')">查看需处理</span><span class="tms-action-link" onclick="runThirdPartySyncImport('${esc(batchId)}')">自动导</span></td>
  </tr>`;
  }).join('')||'<tr><td colspan="11"><div class="empty"><p>暂无同步记录</p></div></td></tr>';
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
function thirdPartySyncVisiblePrechecks(batchId=thirdPartySyncEffectiveBatchId()){
  const rows=thirdPartySyncData().prechecks||[];
  const scoped=batchId?rows.filter(row=>String(row.batchId||'')===String(batchId)):rows;
  return thirdPartySyncBookingPrechecks(scoped).filter(row=>row.needsConfirmation||row.recommendedType==='needs_confirmation'||row.recommendedType==='high_risk_exception');
}
function thirdPartySyncPrecheckForSource(batchId='',sourceRecordId=''){
  return (thirdPartySyncData().prechecks||[]).find(row=>String(row.batchId||'')===String(batchId||'')&&String(row.sourceRecordId||'')===String(sourceRecordId||''))||{};
}
function thirdPartySyncRawForSource(batchId='',sourceRecordId=''){
  return (thirdPartySyncData().rawRecords||[]).find(row=>String(row.batchId||'')===String(batchId||'')&&String(row.thirdPartyId||row.sourceRecordId||row.orderNo||'')===String(sourceRecordId||''))||{};
}
function thirdPartySyncOrderInfoItems(record={}){
  const info=record.orderInfo;
  if(Array.isArray(info))return info.filter(Boolean);
  return info&&typeof info==='object'?[info]:[];
}
function thirdPartySyncOrderInfoRegions(record={}){
  return thirdPartySyncOrderInfoItems(record).map(item=>String(item.region||item.timeRegion||item.period||'').trim()).map(text=>{
    const m=text.match(/(\d{1,2}:\d{2})\s*[-~至]\s*(\d{1,2}:\d{2})/);
    return m?{start:m[1].padStart(5,'0'),end:m[2].padStart(5,'0')}:null;
  }).filter(Boolean);
}
function thirdPartySyncNormalizePhone(value=''){
  const digits=String(value||'').replace(/[^\d]/g,'');
  if(/^86(1[3-9]\d{9})$/.test(digits))return digits.slice(2);
  return digits||String(value||'').trim();
}
function thirdPartySyncVenueText(value=''){
  const raw=String(value||'').trim();
  if(!raw)return '';
  if(/^\d+$/.test(raw))return `${raw}号场`;
  if(/^\d+号$/.test(raw))return `${raw}场`;
  if(/室内\s*(\d+)/.test(raw))return raw.replace(/.*室内\s*(\d+).*/,'$1号场');
  return raw;
}
function thirdPartySyncSourceSnapshot(item={}){
  const row=item.row||item;
  const batchId=row.batchId||item.batchId||thirdPartySyncEffectiveBatchId();
  const sourceRecordId=row.sourceRecordId||item.sourceRecordId||'';
  const precheck=thirdPartySyncPrecheckForSource(batchId,sourceRecordId);
  const rawRow=thirdPartySyncRawForSource(batchId,sourceRecordId);
  const raw=row.currentRaw||rawRow.rawJson||{};
  const orderDate=thirdPartySyncOrderInfoItems(raw).map(info=>info.time||info.date).filter(Boolean).sort()[0]||'';
  const regions=thirdPartySyncOrderInfoRegions(raw);
  const orderPlace=thirdPartySyncOrderInfoItems(raw).map(info=>info?.priceBasicsInfo?.placeName||info?.placeName||info?.courtName).find(Boolean)||'';
  const spacePlace=raw.space&&typeof raw.space==='object'?(raw.space.placeName||raw.space.courtName):'';
  return {
    batchId,
    sourceRecordId,
    sourceType:precheck.sourceType||row.sourceType||raw.sourceType||'',
    date:precheck.date||row.date||String(orderDate||raw.bookingDate||raw.useDate||raw.date||raw.startDate||'').slice(0,10),
    time:[precheck.startTime||row.startTime||(regions.length?regions.map(r=>r.start).sort()[0]:String(raw.startTime||raw.startClock||raw.beginTime||'').match(/(\d{1,2}:\d{2})/)?.[1]?.padStart(5,'0')),precheck.endTime||row.endTime||(regions.length?regions.map(r=>r.end).sort().slice(-1)[0]:String(raw.endTime||raw.endClock||raw.finishTime||'').match(/(\d{1,2}:\d{2})/)?.[1]?.padStart(5,'0'))].filter(Boolean).join('-'),
    venue:precheck.venue||row.venue||thirdPartySyncVenueText(raw.venue||raw.court||raw.courtName||orderPlace||spacePlace||raw.spaceName||raw.placeName),
    customerName:precheck.customerName||row.customerName||raw.customerName||raw.userName||raw.memberName||raw.realName||raw.name||raw.contactName||raw.nickName,
    phone:thirdPartySyncNormalizePhone(precheck.phone||row.phone||raw.phone||raw.mobile||raw.userPhone||raw.memberPhone||raw.contactPhone),
    bookingMode:precheck.bookingMode||row.bookingMode||thirdPartySyncBookingModeText({sourceType:precheck.sourceType||row.sourceType||raw.sourceType}),
    operatorAccount:precheck.operatorAccount||row.operatorAccount||raw.operatorName||raw.operator||raw.adminName||raw.creatorName||raw.createdByName||raw.createName||raw.accountName||raw.userAccount||raw.createUserName||raw.staffName,
    remark:precheck.remark||row.remark||raw.remark||raw.userRemark||raw.note||raw.description||raw.memo||raw.reason||raw.occupyReason||raw.lockReason
  };
}
function thirdPartySyncProcessingAction(item={}){
  const sourceRecordId=item.sourceRecordId||item.row?.sourceRecordId||'';
  const batchId=item.batchId||item.row?.batchId||thirdPartySyncEffectiveBatchId();
  if(!sourceRecordId)return '<span class="tms-cell-sub">查看同步记录</span>';
  return `<span class="tms-action-link" onclick="openThirdPartySyncConfirmModal('${esc(batchId)}','${esc(sourceRecordId)}')">处理</span>`;
}
function thirdPartySyncNeedsProcessingRows(batchId=thirdPartySyncEffectiveBatchId()){
  const data=thirdPartySyncData();
  const prechecks=thirdPartySyncVisiblePrechecks(batchId).map(row=>{
    const snapshot=thirdPartySyncSourceSnapshot({row});
    return {kind:'订场确认',row,...snapshot,reason:row.riskReason||thirdPartySyncTypeText(row.recommendedType),suggestion:row.recommendedType==='high_risk_exception'?'补齐信息后确认':'确认业务类型后导入',action:thirdPartySyncProcessingAction(snapshot)};
  });
  const changes=thirdPartySyncRowsForBatch(data.changes||[],batchId)
    .filter(row=>String(row.status||'pending_review')==='pending_review')
    .map(row=>{
      const snapshot=thirdPartySyncSourceSnapshot({row,batchId,sourceRecordId:row.sourceRecordId});
      const changeText=thirdPartySyncChangeTypeText(row.changeType);
      return {
        kind:'第三方变更',
        row,
        ...snapshot,
        reason:changeText,
        suggestion:/取消|退款|金额|订场/.test(changeText)?'核对是否需要回滚或人工调整':'确认备注变化即可',
        action:thirdPartySyncProcessingAction(snapshot)
      };
    });
  const alerts=thirdPartySyncRowsForBatch(data.alerts||[],batchId)
    .filter(row=>String(row.status||'open')==='open')
    .map(row=>{
      const snapshot=thirdPartySyncSourceSnapshot({row,batchId:row.batchId||batchId,sourceRecordId:row.sourceRecordId});
      return {kind:'异常报警',row,...snapshot,reason:row.reason||'-',suggestion:/失败|缺口|格式|等待/.test(String(row.reason||''))?'处理后再导入':'确认后关闭',action:thirdPartySyncProcessingAction(snapshot)};
    }).filter(item=>item.sourceRecordId||item.date||item.time||item.venue||item.customerName||item.phone||item.remark);
  return [...prechecks,...changes,...alerts];
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
  const rows=thirdPartySyncNeedsProcessingRows();
  host.innerHTML=rows.map(item=>{
    return `<tr>
      <td style="padding-left:20px"><span class="tms-tag ${item.kind==='异常报警'?'tms-tag-red':'tms-tag-tier-gold'}">${esc(item.kind)}</span></td>
      <td>${renderStandardCellText(item.date||'-')}</td>
      <td>${renderStandardCellText(item.time||'-')}</td>
      <td>${renderStandardCellText(item.venue||'-')}</td>
      <td>${renderStandardCellText(item.customerName||'-')}</td>
      <td>${renderStandardCellText(item.phone||'-')}</td>
      <td>${renderStandardCellText(item.bookingMode||'-')}</td>
      <td>${renderStandardCellText(item.operatorAccount||'-')}</td>
      <td>${renderStandardTooltipText(item.remark||'-')}</td>
      <td>${renderStandardCellText(item.reason||'-')}</td>
      <td>${renderStandardCellText(item.suggestion||'-')}</td>
      <td class="tms-sticky-r tms-action-cell" style="width:100px;padding-right:20px;text-align:right">${item.action}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="12"><div class="empty"><p>暂无需要处理的数据</p></div></td></tr>';
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
  const snapshot=thirdPartySyncSourceSnapshot({batchId,sourceRecordId});
  const sourceLine=[snapshot.date,snapshot.time,snapshot.venue,snapshot.customerName,snapshot.phone].filter(Boolean).join(' / ')||sourceRecordId;
  const body=`<div class="tms-section-header" style="margin-top:0;">运营确认</div>
    <div class="tms-audit-note">${renderStandardCellText(sourceLine)}</div>
    <div class="tms-form-row">
      <div class="tms-form-item"><label class="tms-form-label">最终业务类型 *</label><select class="finput tms-form-control" id="thirdPartyConfirmType">${typeOptions.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></div>
      <div class="tms-form-item"><label class="tms-form-label">支付方式</label><select class="finput tms-form-control" id="thirdPartyConfirmPay">${payOptions.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></div>
    </div>
    <div class="tms-form-row">
      <div class="tms-form-item"><label class="tms-form-label">确认金额</label><input class="finput tms-form-control" id="thirdPartyConfirmAmount" type="number" min="0" placeholder="涉及收入时填写"></div>
      <div class="tms-form-item"><label class="tms-form-label">绑定对象ID</label><input class="finput tms-form-control" id="thirdPartyConfirmBindId" placeholder="会员、排课或订场用户 ID"></div>
    </div>
    <div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">确认备注</label><input class="finput tms-form-control" id="thirdPartyConfirmNote" placeholder="填写运营判断依据"></div></div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-default" onclick="confirmThirdPartySyncItem('${esc(batchId)}','${esc(sourceRecordId)}')">保存确认</button><button class="tms-btn tms-btn-primary" onclick="confirmThirdPartySyncItem('${esc(batchId)}','${esc(sourceRecordId)}',{importAfter:true})">保存并导入</button>`;
  openStandardModal({title:'确认第三方异常项',bodyHtml:body,actionsHtml:actions,extraClass:'modal-wide'});
}
async function confirmThirdPartySyncItem(batchId,sourceRecordId,options={}){
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
    if(options.importAfter){
      await apiCall('POST','/third-party-sync/import',{batchId});
      toast('确认已保存，并已执行导入','success');
    }else{
      toast('确认已保存','success');
    }
    closeModal();
    staleCachedDatasets.add('thirdPartySyncCenterPage');
    await loadThirdPartySyncCenter(true);
  }catch(e){
    toast((options.importAfter?'保存或导入失败：':'保存失败：')+e.message,'error');
  }
}
function setThirdPartySyncTableTab(tab){
  thirdPartySyncActiveTableTab=['batches','prechecks'].includes(tab)?tab:'batches';
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
      ${thirdPartySyncTableTabButton('prechecks','需处理数据')}
    </div>
    ${thirdPartySyncTablePanel('batches','<div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="width:120px;padding-left:20px">同步日期</th><th style="width:260px">时间范围</th><th style="width:80px">订场订单</th><th style="width:80px">会员资料</th><th style="width:80px">接口缺口</th><th style="width:80px">已导入</th><th style="width:80px">需处理</th><th style="width:80px">异常</th><th style="width:100px">状态</th><th style="width:140px">最近同步</th><th class="tms-sticky-r" style="width:210px;padding-right:20px;text-align:right">操作</th></tr></thead><tbody id="thirdPartySyncBatchTbody"></tbody></table></div></div>')}
    ${thirdPartySyncTablePanel('prechecks','<div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="width:100px;padding-left:20px">类型</th><th style="width:110px">日期</th><th style="width:110px">时间段</th><th style="width:80px">场地</th><th style="width:110px">姓名</th><th style="width:140px">手机号</th><th style="width:120px">订场方式</th><th style="width:120px">操作账号</th><th style="width:200px">备注</th><th style="width:180px">问题原因</th><th style="width:180px">建议处理</th><th class="tms-sticky-r" style="width:100px;padding-right:20px;text-align:right">操作</th></tr></thead><tbody id="thirdPartySyncPrecheckTbody"></tbody></table></div></div>')}
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
