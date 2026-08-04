// ===== 第三方同步中心 =====
let thirdPartySyncActiveTableTab='prechecks';
let thirdPartySyncPullLoading=false;
function thirdPartySyncData(){
  return thirdPartySyncCenterData||{summary:{},batches:[],rawRecords:[],prechecks:[],confirmations:[],importResults:[],changes:[],alerts:[],rollbacks:[]};
}
function thirdPartySyncLatestBatch(){
  const batches=thirdPartySyncActiveBatches();
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
function thirdPartySyncStatusTag(status,text){
  return `<span class="tms-tag ${thirdPartySyncStatusClass(status)}">${esc(text||thirdPartySyncStatusText(status))}</span>`;
}
function thirdPartySyncTypeText(type){
  return ({
    auto_import:'可自动导入',
    needs_confirmation:'需要运营确认',
    do_not_import:'暂不导入',
    duplicate_skip:'重复跳过',
    high_risk_exception:'需要补充信息'
  })[type]||type||'-';
}
function thirdPartySyncIsBookingSourceType(type){
  return ['order','lock'].includes(String(type||'').toLowerCase());
}
function thirdPartySyncIsGapSourceType(type){
  return /-gap$/.test(String(type||'').toLowerCase());
}
function thirdPartySyncIsActionableSourceType(type){
  return thirdPartySyncIsBookingSourceType(type);
}
function thirdPartySyncRowsForBatch(rows=[],batchId=''){
  return (rows||[]).filter(row=>String(row.batchId||'')===String(batchId||''));
}
function thirdPartySyncBatchDateText(row={}){
  const start=String(row.rangeStart||'').slice(0,10);
  const end=String(row.rangeEnd||'').slice(0,10);
  return start||end||String(row.pulledAt||'').slice(0,10)||'-';
}
function thirdPartySyncActiveBatches(){
  const byDate=new Map();
  (thirdPartySyncData().batches||[]).forEach(row=>{
    const date=thirdPartySyncBatchDateText(row);
    const current=byDate.get(date);
    if(!current||String(row.pulledAt||'').localeCompare(String(current.pulledAt||''))>0)byDate.set(date,row);
  });
  return [...byDate.values()];
}
function thirdPartySyncActiveBatchIds(){
  return new Set(thirdPartySyncActiveBatches().map(row=>String(row.batchId||row.id||'')).filter(Boolean));
}
function thirdPartySyncScopedBatchIds(batchId=''){
  if(batchId)return new Set([String(batchId)]);
  return thirdPartySyncActiveBatchIds();
}
function thirdPartySyncSourceKey(batchId='',sourceRecordId=''){
  return `${String(batchId||'')}|${String(sourceRecordId||'')}`;
}
function thirdPartySyncConfirmedSourceKeys(){
  const map=new Map();
  (thirdPartySyncData().confirmations||[]).forEach(row=>{
    const key=thirdPartySyncSourceKey(row.batchId,row.sourceRecordId);
    const current=map.get(key);
    if(!current||String(row.confirmedAt||'').localeCompare(String(current.confirmedAt||''))>0)map.set(key,row);
  });
  return map;
}
function thirdPartySyncImportedSourceKeys(){
  const ids=new Set();
  (thirdPartySyncData().importResults||[])
    .filter(row=>['completed','partial_completed','partial_failed'].includes(String(row.status||'')))
    .forEach(row=>(row.writtenIds||[]).forEach(item=>{
      const key=thirdPartySyncSourceKey(row.batchId,item.sourceRecordId);
      if(item.sourceRecordId)ids.add(key);
    }));
  return ids;
}
function thirdPartySyncIsUnresolvedSource(row={}){
  const key=thirdPartySyncSourceKey(row.batchId,row.sourceRecordId);
  return !thirdPartySyncConfirmedSourceKeys().has(key)&&!thirdPartySyncImportedSourceKeys().has(key);
}
function thirdPartySyncBatchCountText(row={}){
  const batchId=row.batchId||row.id||'';
  const data=thirdPartySyncData();
  const raws=thirdPartySyncRowsForBatch(data.rawRecords||[],batchId);
  const prechecks=thirdPartySyncRowsForBatch(data.prechecks||[],batchId).filter(item=>thirdPartySyncIsBookingSourceType(item.sourceType));
  const bookingCount=raws.filter(item=>thirdPartySyncIsBookingSourceType(item.sourceType)).length;
  const parts=[
    `订场总数 ${bookingCount}`,
    `可自动导入 ${prechecks.filter(item=>item.recommendedType==='auto_import').length}`,
    `需确认 ${prechecks.filter(item=>item.needsConfirmation||item.recommendedType==='needs_confirmation').length}`,
    `需补充 ${prechecks.filter(item=>item.recommendedType==='high_risk_exception').length}`
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
function thirdPartySyncConfirmedSourceCount(batchId=''){
  return [...thirdPartySyncConfirmedSourceKeys().values()].filter(row=>String(row.batchId||'')===String(batchId||'')).length;
}
function thirdPartySyncLatestImportResult(batchId=''){
  return [...(thirdPartySyncData().importResults||[])]
    .filter(row=>String(row.batchId||'')===String(batchId||''))
    .sort((a,b)=>String(b.importedAt||'').localeCompare(String(a.importedAt||'')))[0]||null;
}
function thirdPartySyncIsActionableAlert(row={}){
  const reason=String(row.reason||'');
  if(/会员流水批量接口缺口|会员资料/.test(reason))return false;
  if(!thirdPartySyncIsActionableSourceType(row.sourceType))return false;
  return true;
}
function thirdPartySyncBatchMetrics(row={}){
  const batchId=row.batchId||row.id||'';
  const data=thirdPartySyncData();
  const raws=thirdPartySyncRowsForBatch(data.rawRecords||[],batchId);
  const prechecks=thirdPartySyncRowsForBatch(data.prechecks||[],batchId).filter(item=>thirdPartySyncIsBookingSourceType(item.sourceType));
  const needRows=thirdPartySyncNeedsProcessingRows(batchId);
  const alertCount=thirdPartySyncRowsForBatch(data.alerts||[],batchId).filter(item=>String(item.status||'open')==='open'&&thirdPartySyncIsActionableAlert(item)).length;
  const changeCount=thirdPartySyncRowsForBatch(data.changes||[],batchId).filter(item=>String(item.status||'pending_review')==='pending_review'&&thirdPartySyncIsActionableSourceType(item.sourceType)).length;
  return {
    bookingCount:raws.filter(item=>thirdPartySyncIsBookingSourceType(item.sourceType)).length,
    memberCount:raws.filter(item=>String(item.sourceType||'').toLowerCase()==='member').length,
    gapCount:raws.filter(item=>thirdPartySyncIsGapSourceType(item.sourceType)).length,
    autoImportableCount:prechecks.filter(item=>item.recommendedType==='auto_import').length,
    importedCount:thirdPartySyncImportedSourceCount(batchId),
    confirmedCount:thirdPartySyncConfirmedSourceCount(batchId),
    needProcessCount:needRows.length,
    exceptionCount:alertCount+changeCount
  };
}
function thirdPartySyncBatchById(batchId=''){
  return (thirdPartySyncData().batches||[]).find(row=>String(row.batchId||row.id||'')===String(batchId||''))||null;
}
function thirdPartySyncBatchDisplayStatus(row={},latestImport=null,metrics={}){
  const status=latestImport?.status||row.status;
  if(status==='partial_completed'&&Number(metrics.needProcessCount||0)>0)return {status,text:'部分完成，待处理'};
  if(status==='paused'&&Number(metrics.needProcessCount||0)>0)return {status,text:'已重试，仍待处理'};
  return {status,text:thirdPartySyncStatusText(status)};
}
function thirdPartySyncMoneyImpactText(impact={}){
  const cash=Number(impact.cashDelta||0)||0;
  const recognized=Number(impact.recognizedRevenueDelta||0)||0;
  const deferred=Number(impact.deferredRevenueDelta||0)||0;
  return `现金 ${fmt(cash)} / 入账 ${fmt(recognized)} / 待履约 ${fmt(deferred)}`;
}
function thirdPartySyncStatsCompactCards(){
  const latest=thirdPartySyncLatestBatch();
  const metrics=latest?thirdPartySyncBatchMetrics(latest):{};
  const allNeed=thirdPartySyncNeedsProcessingRows('').length;
  return {
    latestTime:latest?.pulledAt?String(latest.pulledAt).replace('T',' ').slice(0,19):'暂无同步',
    total:Number(metrics.bookingCount||0),
    auto:Number(metrics.autoImportableCount||0),
    need:Number(metrics.needProcessCount||0),
    allNeed
  };
}
function renderThirdPartySyncStats(){
  const host=document.getElementById('thirdPartySyncStats');
  if(!host)return;
  const stats=thirdPartySyncStatsCompactCards();
  host.innerHTML=`<div class="third-party-sync-notice">最近自动同步时间：${esc(stats.latestTime)}，共 ${esc(stats.total)} 条数据，${esc(stats.auto)} 条可自动导入，${esc(stats.need)} 条需要运营处理，累计需要运营处理 ${esc(stats.allNeed)} 条</div>`;
}
function renderThirdPartySyncBatches(){
  const host=document.getElementById('thirdPartySyncBatchTbody');
  if(!host)return;
  const rows=thirdPartySyncActiveBatches().sort((a,b)=>String(b.pulledAt||'').localeCompare(String(a.pulledAt||'')));
  host.innerHTML=rows.map(row=>{
    const batchId=row.batchId||row.id||'';
    const metrics=thirdPartySyncBatchMetrics(row);
    const latestImport=thirdPartySyncLatestImportResult(batchId);
    const displayStatus=thirdPartySyncBatchDisplayStatus(row,latestImport,metrics);
    return `<tr>
    <td style="padding-left:20px">${renderStandardCellText(thirdPartySyncBatchDateText(row))}</td>
    <td>${renderStandardCellText(metrics.bookingCount)}</td>
    <td>${renderStandardCellText(metrics.importedCount)}</td>
    <td>${renderStandardCellText(metrics.confirmedCount)}</td>
    <td>${renderStandardCellText(metrics.needProcessCount)}</td>
    <td>${renderStandardCellText(metrics.exceptionCount)}</td>
    <td>${thirdPartySyncStatusTag(displayStatus.status,displayStatus.text)}</td>
    <td>${renderStandardCellText(row.pulledAt?String(row.pulledAt).replace('T',' ').slice(0,16):'-')}</td>
    <td class="tms-sticky-r tms-action-cell" style="width:210px;padding-right:20px;text-align:right"><span class="tms-action-link" onclick="filterThirdPartySyncBatch('${esc(batchId)}')">查看需处理</span><span class="tms-action-link" onclick="runThirdPartySyncImport('${esc(batchId)}')">自动导</span></td>
  </tr>`;
  }).join('')||'<tr><td colspan="9"><div class="empty"><p>暂无同步记录</p></div></td></tr>';
}
let thirdPartySyncBatchFilter='';
function filterThirdPartySyncBatch(batchId){
  thirdPartySyncBatchFilter=batchId||'';
  thirdPartySyncActiveTableTab='prechecks';
  renderThirdPartySyncCenter();
  renderThirdPartySyncPrechecks();
}
function clearThirdPartySyncBatchFilter(){
  thirdPartySyncBatchFilter='';
  thirdPartySyncActiveTableTab='prechecks';
  renderThirdPartySyncCenter();
}
function thirdPartySyncEffectiveBatchId(){
  return thirdPartySyncBatchFilter || '';
}
function thirdPartySyncVisiblePrechecks(batchId=thirdPartySyncEffectiveBatchId()){
  const rows=thirdPartySyncData().prechecks||[];
  const scopedIds=thirdPartySyncScopedBatchIds(batchId);
  const scoped=rows.filter(row=>scopedIds.has(String(row.batchId||'')));
  return thirdPartySyncBookingPrechecks(scoped)
    .filter(row=>row.needsConfirmation||row.recommendedType==='needs_confirmation'||row.recommendedType==='high_risk_exception')
    .filter(row=>thirdPartySyncIsUnresolvedSource(row));
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
function thirdPartySyncMergeNeedsProcessingRows(rows=[]){
  const map=new Map();
  (rows||[]).forEach(item=>{
    const key=[
      item.batchId||'',
      item.sourceRecordId||'',
      item.date||'',
      item.time||'',
      item.venue||'',
      item.customerName||item.phone||''
    ].join('|');
    const existing=map.get(key);
    if(!existing){map.set(key,{...item});return;}
    const reasons=[existing.reason,item.reason].map(text=>String(text||'').trim()).filter(Boolean);
    existing.reason=[...new Set(reasons)].join(' / ');
    if(/补充|变更/.test(String(item.kind||'')))existing.kind=item.kind;
    existing.suggestion=existing.suggestion||item.suggestion;
    existing.action=existing.action||item.action;
  });
  return [...map.values()];
}
function thirdPartySyncNeedsProcessingRows(batchId=thirdPartySyncEffectiveBatchId()){
  const data=thirdPartySyncData();
  const prechecks=thirdPartySyncVisiblePrechecks(batchId).map(row=>{
    const snapshot=thirdPartySyncSourceSnapshot({row});
    const kind=row.recommendedType==='high_risk_exception'?'补充金额/备注':(snapshot.bookingMode==='运营锁场'?'确认锁场用途':'确认订场类型');
    return {kind,row,...snapshot,reason:row.riskReason||thirdPartySyncTypeText(row.recommendedType),suggestion:row.recommendedType==='high_risk_exception'?'补齐信息后导入':'确认后导入',action:thirdPartySyncProcessingAction(snapshot)};
  });
  const changes=thirdPartySyncRowsForBatch(data.changes||[],batchId)
    .filter(row=>String(row.status||'pending_review')==='pending_review'&&thirdPartySyncIsActionableSourceType(row.sourceType))
    .map(row=>{
      const snapshot=thirdPartySyncSourceSnapshot({row,batchId,sourceRecordId:row.sourceRecordId});
      const changeText=thirdPartySyncChangeTypeText(row.changeType);
      return {
        kind:/取消|退款|金额|订场/.test(changeText)?'确认订场变更':'确认备注修改',
        row,
        ...snapshot,
        reason:changeText,
        suggestion:/取消|退款|金额|订场/.test(changeText)?'核对后处理':'确认后关闭',
        action:thirdPartySyncProcessingAction(snapshot)
      };
    });
  const alerts=thirdPartySyncRowsForBatch(data.alerts||[],batchId)
    .filter(row=>String(row.status||'open')==='open'&&thirdPartySyncIsActionableSourceType(row.sourceType))
    .map(row=>{
      const snapshot=thirdPartySyncSourceSnapshot({row,batchId:row.batchId||batchId,sourceRecordId:row.sourceRecordId});
      return {kind:/金额/.test(String(row.reason||''))?'补充金额':'补充备注',row,...snapshot,reason:row.reason||'-',suggestion:/失败|缺口|格式|等待/.test(String(row.reason||''))?'处理后再导入':'确认后关闭',action:thirdPartySyncProcessingAction(snapshot)};
    }).filter(item=>item.sourceRecordId||item.date||item.time||item.venue||item.customerName||item.phone||item.remark);
  return thirdPartySyncMergeNeedsProcessingRows([...prechecks,...changes,...alerts]);
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
  return `<div class="tms-audit-note third-party-sync-member-note">资料同步 ${memberCount} 条、接口待补 ${gapCount} 条。本表只显示需要运营确认的订场记录。</div>`;
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
      <td style="padding-left:20px"><span class="tms-tag ${/补充|变更/.test(item.kind)?'tms-tag-red':'tms-tag-tier-gold'}">${esc(item.kind)}</span></td>
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
    <td>${renderStandardCellText(row.bindTargetLabel||'-')}</td>
    <td>${renderStandardCellText(row.confirmedBy||'-')}</td>
    <td>${renderStandardCellText(row.confirmedAt?String(row.confirmedAt).replace('T',' ').slice(0,16):'-')}</td>
    <td>${renderStandardCellText(row.confirmNote||'-')}</td>
  </tr>`).join('')||'<tr><td colspan="8"><div class="empty"><p>暂无确认记录</p></div></td></tr>';
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
  </tr>`).join('')||'<tr><td colspan="6"><div class="empty"><p>暂无变更提醒</p></div></td></tr>';
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
  }).join('')||'<tr><td colspan="5"><div class="empty"><p>暂无处理提醒</p></div></td></tr>';
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
      {label:'同步信息',value:Number(plan.counts?.informational||0),sub:'资料同步/接口待补'}
    ])}</div>
    <div class="tms-section-header">阻断原因</div>
    <div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="padding-left:20px">数据项</th><th>原因</th></tr></thead><tbody>${(plan.blocked||[]).slice(0,20).map(row=>`<tr><td style="padding-left:20px">${renderStandardCellText(row.sourceRecordId||'-')}</td><td>${renderStandardCellText(row.reason||row.riskReason||'-')}</td></tr>`).join('')||'<tr><td colspan="2"><div class="empty"><p>暂无阻断项</p></div></td></tr>'}</tbody></table></div></div>`;
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
function thirdPartySyncConfirmDecisionOptions(){
  return [{value:'import',label:'导入'},{value:'ignore',label:'不导入'},{value:'boss_confirm',label:'待老板确认'}];
}
function thirdPartySyncImportDestinationOptions(){
  return [{value:'booking',label:'订场记录'},{value:'schedule',label:'排课占场'},{value:'internal',label:'内部占用'},{value:'activity',label:'活动/畅打占场'}];
}
function thirdPartySyncRevenueTreatmentOptions(){
  return [{value:'none',label:'不涉及收入'},{value:'guest_payment',label:'散客收款'},{value:'member_balance',label:'会员余额扣款'},{value:'platform_voucher',label:'平台券码核销'}];
}
function thirdPartySyncGuestPaymentOptions(){
  return [{value:'微信转账',label:'微信转账'},{value:'现金',label:'现金'},{value:'运营代收',label:'运营代收'}];
}
function thirdPartySyncPlatformOptions(){
  return [{value:'大众点评券码',label:'大众点评券码'},{value:'其他平台券码',label:'其他平台券码'}];
}
function thirdPartySyncExtraServiceOptions(){
  return [{value:'none',label:'无'},{value:'companion',label:'陪打'},{value:'ball_machine',label:'发球机'}];
}
function thirdPartySyncDropdownValue(id='',fallback=''){
  return document.getElementById(id)?.value||fallback;
}
function thirdPartySyncScheduleLabel(row={}){
  const date=String(row.date||row.startTime||'').slice(0,10);
  const start=String(row.startTime||row.startClock||'').match(/(\d{1,2}:\d{2})/)?.[1]||'';
  const end=String(row.endTime||row.endClock||'').match(/(\d{1,2}:\d{2})/)?.[1]||'';
  return `排课：${row.studentName||row.student||'-'} / ${row.coach||row.coachName||'-'} / ${date} ${start}${end?`-${end}`:''} / ${row.venue||row.court||'-'}`;
}
function thirdPartySyncCourtLabel(row={}){
  return `订场用户：${row.displayName||row.name||'-'} / ${row.phone||row.mobile||'-'}`;
}
function thirdPartySyncMemberLabel(row={}){
  return `会员：${row.memberName||row.name||row.displayName||'-'} / ${row.phone||row.mobile||row.memberPhone||'-'} / 余额 ¥${fmt(row.balance||row.remainingBalance||0)}`;
}
function thirdPartySyncBindCandidates(){
  const destination=thirdPartySyncDropdownValue('thirdPartyConfirmDestination','booking');
  const revenue=thirdPartySyncDropdownValue('thirdPartyConfirmRevenue','none');
  if(revenue==='member_balance'){
    const accountRows=(membershipAccounts||[]).filter(row=>String(row.status||'active')!=='inactive').map(row=>({
      type:'membership_account',
      id:row.id,
      label:thirdPartySyncMemberLabel(row),
      search:[row.memberName,row.name,row.displayName,row.phone,row.mobile,row.memberPhone,row.id].join(' ')
    }));
    const courtRows=(courts||[]).filter(row=>String(row.status||'active')!=='inactive'&&(row.membershipTier||row.membershipTierLabel||Number(row.balance||0)>0)).map(row=>({
      type:'court',
      id:row.id,
      label:thirdPartySyncCourtLabel(row),
      search:[row.displayName,row.name,row.phone,row.mobile,row.id].join(' ')
    }));
    return [...accountRows,...courtRows];
  }
  if(destination==='schedule')return (schedules||[]).filter(row=>String(row.status||'')!=='已取消').map(row=>({
    type:'schedule',
    id:row.id,
    label:thirdPartySyncScheduleLabel(row),
    search:[row.studentName,row.student,row.coach,row.coachName,row.venue,row.startTime,row.endTime,row.id].join(' ')
  }));
  if(destination==='booking')return (courts||[]).filter(row=>String(row.status||'active')!=='inactive').map(row=>({
    type:'court',
    id:row.id,
    label:thirdPartySyncCourtLabel(row),
    search:[row.displayName,row.name,row.phone,row.mobile,row.id].join(' ')
  }));
  return [];
}
function renderThirdPartySyncBindSuggestions(keyword=''){
  const q=String(keyword||'').trim().toLowerCase();
  if(!q)return '';
  const rows=thirdPartySyncBindCandidates().filter(row=>String(row.search||row.label||'').toLowerCase().includes(q)).slice(0,8);
  if(!rows.length)return '<div class="schedule-student-suggest-empty">没有匹配到对象</div>';
  return `<div class="schedule-student-suggest-list">${rows.map(row=>`<button type="button" onclick="selectThirdPartySyncBindTarget(${jsArg(row.type)},${jsArg(row.id)},${jsArg(row.label)})"><strong>${esc(row.label)}</strong></button>`).join('')}</div>`;
}
function updateThirdPartySyncBindSearch(){
  const input=document.getElementById('thirdPartyConfirmBindSearch');
  const suggest=document.getElementById('thirdPartyConfirmBindSuggest');
  if(suggest)suggest.innerHTML=renderThirdPartySyncBindSuggestions(input?.value||'');
}
function selectThirdPartySyncBindTarget(type='',id='',label=''){
  const typeInput=document.getElementById('thirdPartyConfirmBindType');
  const idInput=document.getElementById('thirdPartyConfirmBindId');
  const labelInput=document.getElementById('thirdPartyConfirmBindLabel');
  const search=document.getElementById('thirdPartyConfirmBindSearch');
  const suggest=document.getElementById('thirdPartyConfirmBindSuggest');
  if(typeInput)typeInput.value=type;
  if(idInput)idInput.value=id;
  if(labelInput)labelInput.value=label;
  if(search)search.value=label;
  if(suggest)suggest.innerHTML='';
}
function thirdPartySyncConfirmFinalType(){
  const decision=thirdPartySyncDropdownValue('thirdPartyConfirmDecision','import');
  if(decision==='ignore')return '忽略不导入';
  if(decision==='boss_confirm')return '待老板确认';
  const destination=thirdPartySyncDropdownValue('thirdPartyConfirmDestination','booking');
  const revenue=thirdPartySyncDropdownValue('thirdPartyConfirmRevenue','none');
  const extra=thirdPartySyncDropdownValue('thirdPartyConfirmExtra','none');
  if(destination==='schedule')return '排课占场';
  if(destination==='internal')return '内部占用';
  if(destination==='activity')return '畅打活动';
  if(extra==='companion')return '订场陪打';
  if(extra==='ball_machine')return '订场+发球机';
  if(revenue==='member_balance')return '会员余额订场';
  if(revenue==='platform_voucher')return '大众点评券码订场';
  return thirdPartySyncDropdownValue('thirdPartyConfirmGuestPay','微信转账')==='现金'?'散客现金订场':'散客微信转账订场';
}
function thirdPartySyncConfirmPaymentMethod(){
  const revenue=thirdPartySyncDropdownValue('thirdPartyConfirmRevenue','none');
  if(revenue==='none')return '不涉及支付';
  if(revenue==='member_balance')return '会员余额';
  if(revenue==='platform_voucher')return thirdPartySyncDropdownValue('thirdPartyConfirmPlatform','大众点评券码');
  return thirdPartySyncDropdownValue('thirdPartyConfirmGuestPay','微信转账');
}
function refreshThirdPartySyncConfirmFields(){
  const decision=thirdPartySyncDropdownValue('thirdPartyConfirmDecision','import');
  const destination=thirdPartySyncDropdownValue('thirdPartyConfirmDestination','booking');
  let revenue=thirdPartySyncDropdownValue('thirdPartyConfirmRevenue','none');
  const extra=thirdPartySyncDropdownValue('thirdPartyConfirmExtra','none');
  if(['schedule','internal','activity'].includes(destination)&&revenue!=='none'){
    revenue='none';
    setStandardDropdownValue('thirdPartyConfirmRevenue','none','不涉及收入');
  }
  const isImport=decision==='import';
  const splitVisible=isImport&&['companion','ball_machine'].includes(extra);
  const amountVisible=isImport&&['guest_payment','member_balance','platform_voucher'].includes(revenue);
  const bindVisible=isImport&&(['booking','schedule'].includes(destination)||revenue==='member_balance');
  const setVisible=(id,visible)=>{const el=document.getElementById(id);if(el)el.style.display=visible?'':'none';};
  setVisible('thirdPartyConfirmDestinationItem',isImport);
  setVisible('thirdPartyConfirmRevenueItem',isImport);
  setVisible('thirdPartyConfirmGuestPayItem',isImport&&revenue==='guest_payment');
  setVisible('thirdPartyConfirmPlatformItem',isImport&&revenue==='platform_voucher');
  setVisible('thirdPartyConfirmExtraItem',isImport&&destination==='booking');
  setVisible('thirdPartyConfirmAmountItem',amountVisible&&!splitVisible);
  setVisible('thirdPartyConfirmBookingAmountItem',splitVisible);
  setVisible('thirdPartyConfirmServiceAmountItem',splitVisible);
  setVisible('thirdPartyConfirmBindItem',bindVisible);
  const serviceLabel=document.getElementById('thirdPartyConfirmServiceAmountLabel');
  if(serviceLabel)serviceLabel.textContent=extra==='ball_machine'?'发球机费':'陪打费';
  const bindLabel=document.getElementById('thirdPartyConfirmBindLabelText');
  if(bindLabel)bindLabel.textContent=destination==='schedule'?'搜索绑定排课':revenue==='member_balance'?'搜索绑定会员':'搜索绑定订场用户';
  ['thirdPartyConfirmBindType','thirdPartyConfirmBindId','thirdPartyConfirmBindLabel'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const bindSearch=document.getElementById('thirdPartyConfirmBindSearch');
  const bindSuggest=document.getElementById('thirdPartyConfirmBindSuggest');
  if(bindSearch)bindSearch.value='';
  if(bindSuggest)bindSuggest.innerHTML='';
}
function openThirdPartySyncConfirmModal(batchId,sourceRecordId){
  const snapshot=thirdPartySyncSourceSnapshot({batchId,sourceRecordId});
  const sourceLine=[snapshot.date,snapshot.time,snapshot.venue,snapshot.customerName,snapshot.phone].filter(Boolean).join(' / ')||sourceRecordId;
  const body=`<div class="tms-section-header" style="margin-top:0;">运营确认</div>
    <div class="tms-audit-note">${renderStandardCellText(sourceLine)}</div>
    <div class="tms-form-row">
      <div class="tms-form-item"><label class="tms-form-label">处理结论 *</label>${renderStandardDropdownHtml('thirdPartyConfirmDecision','处理结论',thirdPartySyncConfirmDecisionOptions(),'import',true,'refreshThirdPartySyncConfirmFields')}</div>
      <div class="tms-form-item" id="thirdPartyConfirmDestinationItem"><label class="tms-form-label">导入类型 *</label>${renderStandardDropdownHtml('thirdPartyConfirmDestination','导入类型',thirdPartySyncImportDestinationOptions(),snapshot.bookingMode==='运营锁场'?'internal':'booking',true,'refreshThirdPartySyncConfirmFields')}</div>
    </div>
    <div class="tms-form-row">
      <div class="tms-form-item" id="thirdPartyConfirmRevenueItem"><label class="tms-form-label">收入处理 *</label>${renderStandardDropdownHtml('thirdPartyConfirmRevenue','收入处理',thirdPartySyncRevenueTreatmentOptions(),'none',true,'refreshThirdPartySyncConfirmFields')}</div>
      <div class="tms-form-item" id="thirdPartyConfirmExtraItem"><label class="tms-form-label">附加项目</label>${renderStandardDropdownHtml('thirdPartyConfirmExtra','附加项目',thirdPartySyncExtraServiceOptions(),'none',true,'refreshThirdPartySyncConfirmFields')}</div>
      <div class="tms-form-item" id="thirdPartyConfirmGuestPayItem"><label class="tms-form-label">收款方式</label>${renderStandardDropdownHtml('thirdPartyConfirmGuestPay','收款方式',thirdPartySyncGuestPaymentOptions(),'微信转账',true)}</div>
      <div class="tms-form-item" id="thirdPartyConfirmPlatformItem"><label class="tms-form-label">券码平台</label>${renderStandardDropdownHtml('thirdPartyConfirmPlatform','券码平台',thirdPartySyncPlatformOptions(),'大众点评券码',true)}</div>
    </div>
    <div class="tms-form-row">
      <div class="tms-form-item" id="thirdPartyConfirmAmountItem"><label class="tms-form-label">确认金额</label><input class="finput tms-form-control" id="thirdPartyConfirmAmount" type="number" min="0" placeholder="本次应入账金额"></div>
      <div class="tms-form-item" id="thirdPartyConfirmBookingAmountItem"><label class="tms-form-label">场地费</label><input class="finput tms-form-control" id="thirdPartyConfirmBookingAmount" type="number" min="0" placeholder="场地收入"></div>
      <div class="tms-form-item" id="thirdPartyConfirmServiceAmountItem"><label class="tms-form-label" id="thirdPartyConfirmServiceAmountLabel">陪打费</label><input class="finput tms-form-control" id="thirdPartyConfirmServiceAmount" type="number" min="0" placeholder="附加项目收入"></div>
    </div>
    <div class="tms-form-row">
      <div class="tms-form-item full-width" id="thirdPartyConfirmBindItem"><label class="tms-form-label" id="thirdPartyConfirmBindLabelText">搜索绑定对象</label><input type="hidden" id="thirdPartyConfirmBindType"><input type="hidden" id="thirdPartyConfirmBindId"><input type="hidden" id="thirdPartyConfirmBindLabel"><input class="finput tms-form-control" id="thirdPartyConfirmBindSearch" placeholder="搜索姓名 / 手机号 / 排课信息" oninput="updateThirdPartySyncBindSearch()" autocomplete="off"><div id="thirdPartyConfirmBindSuggest" class="schedule-student-suggest"></div></div>
    </div>
    <div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">确认备注</label><input class="finput tms-form-control" id="thirdPartyConfirmNote" placeholder="填写运营判断依据"></div></div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-default" onclick="confirmThirdPartySyncItem('${esc(batchId)}','${esc(sourceRecordId)}')">保存确认</button><button class="tms-btn tms-btn-primary" onclick="confirmThirdPartySyncItem('${esc(batchId)}','${esc(sourceRecordId)}',{importAfter:true})">保存并导入</button>`;
  openStandardModal({title:'确认第三方异常项',bodyHtml:body,actionsHtml:actions,extraClass:'modal-wide'});
  refreshThirdPartySyncConfirmFields();
}
async function confirmThirdPartySyncItem(batchId,sourceRecordId,options={}){
  try{
    const finalType=thirdPartySyncConfirmFinalType();
    const bookingAmount=Number(document.getElementById('thirdPartyConfirmBookingAmount')?.value||0)||0;
    const serviceAmount=Number(document.getElementById('thirdPartyConfirmServiceAmount')?.value||0)||0;
    const amount=bookingAmount||serviceAmount?bookingAmount+serviceAmount:(Number(document.getElementById('thirdPartyConfirmAmount')?.value||0)||0);
    await apiCall('POST','/third-party-sync/confirmations',{
      batchId,
      sourceRecordId,
      finalType,
      processingDecision:thirdPartySyncDropdownValue('thirdPartyConfirmDecision','import'),
      importDestination:thirdPartySyncDropdownValue('thirdPartyConfirmDestination','booking'),
      revenueTreatment:thirdPartySyncDropdownValue('thirdPartyConfirmRevenue','none'),
      extraServiceType:thirdPartySyncDropdownValue('thirdPartyConfirmExtra','none'),
      paymentMethod:thirdPartySyncConfirmPaymentMethod(),
      amount,
      amountBreakdown:bookingAmount||serviceAmount?{bookingAmount,serviceAmount,serviceType:finalType==='订场+发球机'?'发球机':finalType==='订场陪打'?'陪打':''}:null,
      bindTargetType:document.getElementById('thirdPartyConfirmBindType')?.value.trim()||'',
      bindTargetId:document.getElementById('thirdPartyConfirmBindId')?.value.trim()||'',
      bindTargetLabel:document.getElementById('thirdPartyConfirmBindLabel')?.value.trim()||'',
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
  thirdPartySyncActiveTableTab=['prechecks','batches','confirmations'].includes(tab)?tab:'prechecks';
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
  const filteredBatch=thirdPartySyncBatchFilter?thirdPartySyncBatchById(thirdPartySyncBatchFilter):null;
  const filterHtml=filteredBatch?`<span class="tms-tag tms-tag-tier-gold">当前查看：${esc(thirdPartySyncBatchDateText(filteredBatch))}</span><span class="tms-action-link" onclick="clearThirdPartySyncBatchFilter()">查看全部待处理</span>`:'';
  host.innerHTML=`<div class="section-stack">
    <style>
      #page-third-party-sync .third-party-sync-notice{border:0.5px solid rgba(217,119,6,.18);background:rgba(255,247,237,.72);border-radius:8px;padding:12px 14px;color:#5C4030;font-size:13px;font-weight:700;line-height:1.5}
      #page-third-party-sync .third-party-sync-table-tabs{display:flex;gap:8px;align-items:center;overflow-x:auto;margin:4px 0 12px}
      #page-third-party-sync .third-party-sync-table-panel{display:none}
      #page-third-party-sync .third-party-sync-table-panel.active{display:block}
      #page-third-party-sync .tms-table th,#page-third-party-sync .tms-table td,#page-third-party-sync .tms-cell-text,#page-third-party-sync .tms-text-primary,#page-third-party-sync .tms-text-remark,#page-third-party-sync .tms-action-link,#page-third-party-sync .tms-tag{font-size:12px}
      #page-third-party-sync .tms-table{min-width:1280px}
      #page-third-party-sync .tms-btn-spinner{width:14px;height:14px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;display:inline-block;margin-right:8px;vertical-align:-2px;animation:thirdPartySyncSpin .8s linear infinite}
      @keyframes thirdPartySyncSpin{to{transform:rotate(360deg)}}
    </style>
    <div id="thirdPartySyncStats" aria-label="第三方同步待办摘要"></div>
    <div class="tms-toolbar">
      <div class="tms-filters">${filterHtml}</div>
      <div class="tms-toolbar-right">${pullButtonHtml}<button class="tms-btn tms-btn-ghost" onclick="loadThirdPartySyncCenter(true)">刷新</button></div>
    </div>
    <div class="third-party-sync-table-tabs" role="tablist" aria-label="第三方同步数据表">
      ${thirdPartySyncTableTabButton('prechecks','需处理数据')}
      ${thirdPartySyncTableTabButton('batches','同步记录')}
      ${thirdPartySyncTableTabButton('confirmations','已处理记录')}
    </div>
    ${thirdPartySyncTablePanel('prechecks','<div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="width:110px;padding-left:20px">处理事项</th><th style="width:110px">日期</th><th style="width:110px">时间段</th><th style="width:80px">场地</th><th style="width:110px">姓名</th><th style="width:140px">手机号</th><th style="width:120px">订场方式</th><th style="width:120px">操作账号</th><th style="width:200px">备注</th><th style="width:180px">问题原因</th><th style="width:180px">建议处理</th><th class="tms-sticky-r" style="width:100px;padding-right:20px;text-align:right">操作</th></tr></thead><tbody id="thirdPartySyncPrecheckTbody"></tbody></table></div></div>')}
    ${thirdPartySyncTablePanel('batches','<div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="width:120px;padding-left:20px">数据日期</th><th style="width:90px">订场总数</th><th style="width:100px">已自动处理</th><th style="width:100px">运营已处理</th><th style="width:100px">剩余未处理</th><th style="width:80px">异常</th><th style="width:140px">状态</th><th style="width:140px">最近同步</th><th class="tms-sticky-r" style="width:210px;padding-right:20px;text-align:right">操作</th></tr></thead><tbody id="thirdPartySyncBatchTbody"></tbody></table></div></div>')}
    ${thirdPartySyncTablePanel('confirmations','<div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="width:180px;padding-left:20px">第三方记录</th><th style="width:130px">处理类型</th><th style="width:120px">支付方式</th><th style="width:100px">金额</th><th style="width:220px">绑定对象</th><th style="width:120px">处理人</th><th style="width:140px">处理时间</th><th style="width:220px">备注</th></tr></thead><tbody id="thirdPartySyncConfirmTbody"></tbody></table></div></div>')}
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
