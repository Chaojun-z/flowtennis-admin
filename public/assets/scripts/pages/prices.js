function priceStatusLabel(status){
  return status==='inactive'?'停用':'启用';
}
function priceStatusTag(status){
  return status==='inactive'?'tms-tag-tier-slate':'tms-tag-green';
}
function priceTypeLabel(type){
  return type==='venue_rate'?'场地价格':'渠道商品';
}
function priceChannelText(row){
  return row.type==='channel_product'?(row.channel||'—'):'—';
}
function priceNameText(row){
  if(row.type==='venue_rate')return cn(row.campus)||row.campus||'—';
  return row.productName||'—';
}
function priceVenueSpaceTypeText(row){
  return row.type==='venue_rate'?(row.venueSpaceType||'—'):'—';
}
function priceDateTypeText(row){
  return row.type==='venue_rate'?(row.dateType||'—'):'—';
}
function priceProductTypeText(row){
  return row.type==='channel_product'?courseTypeDisplayLabel(row):'—';
}
function priceBusinessText(row){
  if(row.type!=='channel_product')return '—';
  return {court:'订场',lesson:'课程',package:'课包'}[row.businessType]||row.businessType||'—';
}
function priceTypeOptions(includeAll=false){
  const options=FlowTennisBusinessTaxonomy.optionList('priceTypes');
  return includeAll?[{value:'',label:'全部价格'},...options]:options;
}
function priceProductTypeOptions(includeAll=false){
  const options=FlowTennisBusinessTaxonomy.optionList('priceProductTypes');
  return includeAll?[{value:'',label:'全部商品类型'},...options]:options;
}
function priceChannelOptions(){
  return FlowTennisBusinessTaxonomy.optionList('priceChannels');
}
function priceBusinessTypeOptions(){
  return FlowTennisBusinessTaxonomy.optionList('priceBusinessTypes');
}
function priceStatusOptions(){
  return FlowTennisBusinessTaxonomy.optionList('priceStatuses');
}
function priceTimeBandText(row){
  if(row.type==='venue_rate')return row.startTime&&row.endTime?`${row.startTime}-${row.endTime}`:'—';
  return row.timeBand||'—';
}
function priceDurationText(row){
  if(row.type==='venue_rate')return '—';
  if(row.durationLabel)return row.durationLabel;
  return row.durationMinutes?`${row.durationMinutes}分钟`:'—';
}
function priceAmountText(row){
  if(row.type==='venue_rate')return `¥${fmt(Number(row.unitPrice)||0)}`;
  return `¥${fmt(Number(row.salePrice)||0)}`;
}
function syncPriceFilterOptions(){
  const typeHost=document.getElementById('priceTypeFilterHost');
  const productHost=document.getElementById('priceProductTypeFilterHost');
  if(typeHost){
    const value=document.getElementById('priceTypeFilter')?.value||'';
    typeHost.innerHTML=renderStandardDropdownHtml('priceTypeFilter','全部价格',priceTypeOptions(true),value,false,'onPriceFilterChange');
  }
  if(productHost){
    const value=document.getElementById('priceProductTypeFilter')?.value||'';
    productHost.innerHTML=renderStandardDropdownHtml('priceProductTypeFilter','全部商品类型',priceProductTypeOptions(true),value,false,'onPriceFilterChange');
  }
}
function onPriceFilterChange(){
  pricePage=standardListFirstPage();
  renderPrices();
}
function filteredPricePlans(){
  const q=String(document.getElementById('priceSearch')?.value||'').trim().toLowerCase();
  const priceTypeFilter=document.getElementById('priceTypeFilter')?.value||'';
  const productTypeFilter=document.getElementById('priceProductTypeFilter')?.value||'';
  return pricePlans.filter(row=>{
    if(priceTypeFilter&&row.type!==priceTypeFilter)return false;
    if(productTypeFilter&&row.productType!==productTypeFilter)return false;
    if(!q)return true;
    return searchHit(q,row.campus,cn(row.campus),row.dateType,row.channel,row.productName,courseTypeDisplayLabel(row),row.productType,row.experienceType,row.businessType,row.notes);
  });
}
function renderPricePagerControls(total,pages){
  const pageSizeHost=document.getElementById('pricePageSize');
  if(pageSizeHost)pageSizeHost.innerHTML=renderPageSizeSelectorHtml('pricePageSizeValue',pricePageSize,'setPricePageSize');
  const btns=document.getElementById('pricePagerBtns');
  if(!btns)return;
  btns.innerHTML=(!total||pages<=1)?'':renderStandardPaginationButtonsHtml(pricePage,pages,'setPricePage');
}
function setPricePage(value){
  const total=filteredPricePlans().length;
  pricePage=standardListPagination(total,value,pricePageSize).page;
  renderPrices();
}
function setPricePageSize(value){
  pricePageSize=standardListPageSize(value,pricePageSize);
  pricePage=standardListFirstPage();
  renderPrices();
}
function syncPriceExperienceType(){
  const type=normalizeCourseType(document.getElementById('priceProductType')?.value||'');
  const item=document.getElementById('priceExperienceTypeItem');
  if(item)item.style.display=type==='体验课'?'':'none';
}
function renderPriceMobileCards(list){
  const host=document.getElementById('priceMobileCards');
  if(!host)return;
  if(!list.length){
    const type=document.getElementById('priceTypeFilter')?.value||'';
    host.innerHTML=`<div class="tms-empty-state"><div class="tms-empty-title">${type?('暂无'+priceTypeLabel(type)):'暂无价格'}</div><div class="tms-empty-desc">调整搜索或筛选后再看</div></div>`;
    return;
  }
  host.innerHTML=list.map(row=>`<article class="admin-h5-list-card admin-h5-price-card">
    <div class="admin-h5-card-head">
      <div><strong>${esc(priceNameText(row))}</strong><span>${esc(priceChannelText(row))}</span></div>
      <span class="tms-tag ${priceStatusTag(row.status)}">${esc(priceStatusLabel(row.status))}</span>
    </div>
    <div class="admin-h5-card-tags"><span class="tms-tag ${row.type==='venue_rate'?'tms-tag-tier-blue':'tms-tag-green'}">${esc(priceTypeLabel(row.type))}</span><span class="tms-tag">${esc(priceAmountText(row))}</span></div>
    <div class="admin-h5-card-grid">
      <span><b>场地类型</b>${esc(priceVenueSpaceTypeText(row))}</span>
      <span><b>日期类型</b>${esc(priceDateTypeText(row))}</span>
      <span><b>商品类型</b>${esc(priceProductTypeText(row))}</span>
      <span><b>关联业务</b>${esc(priceBusinessText(row))}</span>
      <span><b>时间段</b>${esc(priceTimeBandText(row))}</span>
      <span><b>时长</b>${esc(priceDurationText(row))}</span>
    </div>
    <p>${esc(row.notes||'暂无备注')}</p>
    <div class="admin-h5-card-actions"><button type="button" onclick="openPriceModal('${row.type}','${row.id}')">编辑</button><button type="button" onclick="togglePricePlanStatus('${row.id}')">${row.status==='inactive'?'启用':'停用'}</button></div>
  </article>`).join('');
}
function renderPrices(){
  syncPriceFilterOptions();
  const rows=filteredPricePlans();
  const isMobileList=document.body.classList.contains('admin-mobile');
  const pageState=isMobileList?{total:rows.length,pages:1,page:1,slice:rows}:standardListSlice(rows,pricePage,pricePageSize);
  pricePage=pageState.page;
  const {total,pages,slice}=pageState;
  const pager=document.querySelector('#page-prices .tms-pagination');
  if(pager)pager.style.display=isMobileList?'none':(total?'flex':'none');
  const info=document.getElementById('pricePagerInfo');
  if(info)info.innerHTML=renderPagerInfoHtml(total);
  renderPricePagerControls(total,pages);
  const body=document.getElementById('priceTbody');
  if(!body)return;
  body.innerHTML=slice.map(row=>`<tr><td style="padding-left:12px"><span class="tms-tag ${row.type==='venue_rate'?'tms-tag-tier-blue':'tms-tag-green'}">${priceTypeLabel(row.type)}</span></td><td>${renderStandardCellText(priceChannelText(row),false)}</td><td>${renderStandardCellText(priceNameText(row),false)}</td><td>${renderStandardCellText(priceVenueSpaceTypeText(row),false)}</td><td>${renderStandardCellText(priceDateTypeText(row),false)}</td><td>${renderStandardCellText(priceProductTypeText(row),false)}</td><td>${renderStandardCellText(priceBusinessText(row),false)}</td><td>${renderStandardCellText(priceTimeBandText(row),false)}</td><td>${renderStandardCellText(priceDurationText(row),false)}</td><td>${esc(priceAmountText(row))}</td><td><span class="tms-tag ${priceStatusTag(row.status)}">${priceStatusLabel(row.status)}</span></td><td class="tms-sticky-r tms-action-cell" style="width:88px;padding-right:12px"><span class="tms-action-link" onclick="openPriceModal('${row.type}','${row.id}')">编辑</span><span class="tms-action-link" onclick="togglePricePlanStatus('${row.id}')">${row.status==='inactive'?'启用':'停用'}</span></td></tr>`).join('')||`<tr><td colspan="12"><div class="empty"><p>${document.getElementById('priceTypeFilter')?.value?('暂无'+priceTypeLabel(document.getElementById('priceTypeFilter')?.value)):'暂无价格'}</p></div></td></tr>`;
  renderPriceMobileCards(slice);
}
function openPriceModal(type='',id=''){
  const row=pricePlans.find(x=>x.id===id)||{type:type||'venue_rate',status:'active'};
  type=row.type||type||'venue_rate';
  editId=id||null;
  const campusOptions=campuses.map(c=>({value:c.code||c.id,label:c.name||c.code||c.id}));
  const statusOptions=priceStatusOptions();
  const priceExperienceType=normalizeExperienceType(row.experienceType||row.productName||row.productType,'私教体验课');
  const typeSwitch=id?'':`<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">价格类型</label>${renderStandardDropdownHtml('priceType','价格类型',priceTypeOptions(),type,true,'switchPriceModalType')}</div></div>`;
  const fields=type==='venue_rate'
    ? `<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">校区</label>${renderStandardDropdownHtml('priceCampus','校区',campusOptions,row.campus||campusOptions[0]?.value||'',true)}</div><div class="tms-form-item"><label class="tms-form-label">场地类型</label>${renderStandardDropdownHtml('priceVenueSpaceType','场地类型',FlowTennisBusinessTaxonomy.optionList('priceVenueSpaceTypes'),row.venueSpaceType||'室内',true)}</div><div class="tms-form-item"><label class="tms-form-label">日期类型</label>${renderStandardDropdownHtml('priceDateType','日期类型',FlowTennisBusinessTaxonomy.optionList('priceDateTypes'),row.dateType||'工作日',true)}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">开始时间</label>${renderStandardDropdownHtml('priceStartTime','开始时间',getCourtTimeOptions(row.startTime||'08:00'),row.startTime||'08:00',true)}</div><div class="tms-form-item"><label class="tms-form-label">结束时间</label>${renderStandardDropdownHtml('priceEndTime','结束时间',getCourtTimeOptions(row.endTime||'10:00'),row.endTime||'10:00',true)}</div><div class="tms-form-item"><label class="tms-form-label">原价/小时</label><input class="finput tms-form-control" id="priceUnitPrice" type="number" min="0" step="1" value="${row.unitPrice||''}"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">状态</label>${renderStandardDropdownHtml('priceStatus','状态',statusOptions,row.status||'active',true)}</div><div class="tms-form-item"><label class="tms-form-label">备注</label><input class="finput tms-form-control" id="priceNotes" value="${esc(row.notes||'')}"></div></div>`
    : `<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">渠道</label>${renderStandardDropdownHtml('priceChannel','渠道',priceChannelOptions(),row.channel||'大众点评',true)}</div><div class="tms-form-item"><label class="tms-form-label">商品名称</label><input class="finput tms-form-control" id="priceProductName" value="${esc(row.productName||'')}"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">商品类型</label>${renderStandardDropdownHtml('priceProductType','商品类型',priceProductTypeOptions(),row.productType||'订场券',true,'syncPriceExperienceType')}</div><div class="tms-form-item" id="priceExperienceTypeItem" style="display:none"><label class="tms-form-label">体验课类型</label>${renderStandardDropdownHtml('priceExperienceType','体验课类型',experienceTypeOptions(),priceExperienceType,true)}</div><div class="tms-form-item"><label class="tms-form-label">关联业务</label>${renderStandardDropdownHtml('priceBusinessType','关联业务',priceBusinessTypeOptions(),row.businessType||'court',true)}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">时长文案</label><input class="finput tms-form-control" id="priceDurationLabel" value="${esc(row.durationLabel||'')}" placeholder="如：1小时 / 1-2小时"></div><div class="tms-form-item"><label class="tms-form-label">时长分钟</label><input class="finput tms-form-control" id="priceDurationMinutes" type="number" min="0" step="30" value="${row.durationMinutes||''}"></div><div class="tms-form-item"><label class="tms-form-label">售价</label><input class="finput tms-form-control" id="priceSalePrice" type="number" min="0" step="1" value="${row.salePrice||''}"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">状态</label>${renderStandardDropdownHtml('priceStatus','状态',statusOptions,row.status||'active',true)}</div><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><input class="finput tms-form-control" id="priceNotes" value="${esc(row.notes||'')}"></div></div>`;
  const body=typeSwitch+fields;
  openStandardModal({title:id?'编辑价格':'新增价格',bodyHtml:body,actionsHtml:`<button class="btn-cancel" onclick="closeModal()">取消</button><button class="btn-save" id="priceSaveBtn" onclick="savePricePlan('${type}')">保存</button>`,extraClass:'modal-wide'});
  syncPriceExperienceType();
}
function switchPriceModalType(type){openPriceModal(type);}
async function savePricePlan(type){
  const payload={type,status:document.getElementById('priceStatus')?.value||'active',notes:document.getElementById('priceNotes')?.value.trim()||''};
  if(type==='venue_rate'){
    Object.assign(payload,{campus:document.getElementById('priceCampus')?.value||'',venueSpaceType:document.getElementById('priceVenueSpaceType')?.value||'室内',dateType:document.getElementById('priceDateType')?.value||'',startTime:document.getElementById('priceStartTime')?.value||'',endTime:document.getElementById('priceEndTime')?.value||'',unitPrice:parseFloat(document.getElementById('priceUnitPrice')?.value)||0});
  }else{
    const productType=document.getElementById('priceProductType')?.value||'';
    Object.assign(payload,{channel:document.getElementById('priceChannel')?.value||'',productName:document.getElementById('priceProductName')?.value.trim()||'',productType,businessType:document.getElementById('priceBusinessType')?.value||'',experienceType:normalizeCourseType(productType)==='体验课'?normalizeExperienceType(document.getElementById('priceExperienceType')?.value):'',durationLabel:document.getElementById('priceDurationLabel')?.value.trim()||'',durationMinutes:parseInt(document.getElementById('priceDurationMinutes')?.value)||0,salePrice:parseFloat(document.getElementById('priceSalePrice')?.value)||0});
  }
  await runStandardMutation('priceSaveBtn',async()=>{
    const saved=await apiCall(editId?'PUT':'POST',editId?`/price-plans/${editId}`:'/price-plans',payload);
    const i=pricePlans.findIndex(x=>x.id===saved.id);
    if(i>=0)pricePlans[i]=saved;else pricePlans.unshift(saved);
  },{
    successText:'价格已保存',
    closeOnSuccess:true,
    refresh:renderPrices
  });
}
async function togglePricePlanStatus(id){
  const row=pricePlans.find(x=>x.id===id);
  if(!row)return;
  await runStandardMutation(null,async()=>{
    const saved=await apiCall('PUT',`/price-plans/${id}`,{...row,status:row.status==='inactive'?'active':'inactive'});
    const i=pricePlans.findIndex(x=>x.id===id);
    if(i>=0)pricePlans[i]=saved;
  },{errorPrefix:'更新失败',refresh:renderPrices});
}
function defaultVenuePricePlans(){
  const defaultCampus=campuses[0]?.code||campuses[0]?.id||'';
  const venue=[
    ['工作日','06:00','08:00',100],
    ['工作日','08:00','16:00',140],
    ['工作日','16:00','20:00',220],
    ['工作日','20:00','22:00',180],
    ['周末节假日','06:00','08:00',100],
    ['周末节假日','08:00','22:00',220]
  ].map(([dateType,startTime,endTime,unitPrice])=>({type:'venue_rate',campus:defaultCampus,venueSpaceType:'室内',dateType,startTime,endTime,unitPrice,status:'active',notes:'默认场地价'}));
  const products=[
    ['青少年1v1私教体验课','体验课','lesson','1小时',60,199],
    ['成人1v1私教体验课','体验课','lesson','1小时',60,239],
    ['青少年1v4小班课体验课','体验课','lesson','1-2小时',0,99],
    ['成人1v4小班课体验课','体验课','lesson','1-2小时',0,129],
    ['王牌专项：2.5~3.0多球实战特训','体验课','lesson','1-2小时',0,200],
    ['发接发与实战练习','体验课','lesson','1-2小时',0,260],
    ['削球实战训练','体验课','lesson','1-2小时',0,260],
    ['截击入门训练','体验课','lesson','1-2小时',0,260],
    ['疯狂多球训练','体验课','lesson','1-2小时',0,260],
    ['新客福利 约球双打局 2H','订场券','court','',0,70],
    ['晚场福利 场地预定 1H','订场券','court','1小时',60,180],
    ['黄金时段 场地预定 1H','订场券','court','1小时',60,220],
    ['实力之选 网球陪打 1H','订场券','court','1小时',60,100],
    ['闲时特惠 场地预定 1H','订场券','court','1小时',60,140],
    ['刷球时刻 网球发球机畅打 1H','订场券','court','1小时',60,60],
    ['晨练 场地预定 30min','订场券','court','30min',30,50]
  ].map(([productName,productType,businessType,durationLabel,durationMinutes,salePrice])=>({type:'channel_product',channel:'大众点评',productName,productType,experienceType:productType==='体验课'?normalizeExperienceType(productName):'',businessType,durationLabel,durationMinutes,salePrice,status:'active',notes:'默认大众点评商品价'}));
  return [...venue,...products];
}
function normalizeDefaultPriceName(name){
  return String(name||'').replace(/[：:\s]/g,'').replace(/体验课$/,'体验').trim();
}
function hasSameActivePricePlan(row){
  return pricePlans.some(p=>{
    if(p.type!==row.type)return false;
    if(row.type==='venue_rate')return sameCampusValue(p.campus,row.campus)&&p.dateType===row.dateType&&p.startTime===row.startTime&&p.endTime===row.endTime;
    return p.channel===row.channel&&normalizeDefaultPriceName(p.productName)===normalizeDefaultPriceName(row.productName);
  });
}
async function importDefaultVenuePrices(){
  if(!await appConfirm('同步默认场地价和渠道商品价？已存在的价格会按最新模板更新。',{title:'同步默认价格',confirmText:'确认同步'}))return;
  let ok=0,updated=0,created=0;
  try{
    for(const row of defaultVenuePricePlans()){
      const same=pricePlans.find(p=>{
        if(p.type!==row.type)return false;
        if(row.type==='venue_rate')return sameCampusValue(p.campus,row.campus)&&p.dateType===row.dateType&&p.startTime===row.startTime&&p.endTime===row.endTime;
        return p.channel===row.channel&&normalizeDefaultPriceName(p.productName)===normalizeDefaultPriceName(row.productName);
      });
      const saved=same
        ? await apiCall('PUT',`/price-plans/${same.id}`,{...same,...row,status:'active'})
        : await apiCall('POST','/price-plans',row);
      const idx=pricePlans.findIndex(p=>p.id===saved.id);
      if(idx>=0){pricePlans[idx]=saved;updated++;}else{pricePlans.unshift(saved);created++;}
      ok++;
    }
    renderPrices();
    toast(`已同步 ${ok} 条价格（新增 ${created}，更新 ${updated}）`,'success');
  }catch(e){toast(`已同步 ${ok} 条前失败：${e.message}`,'error');}
}
