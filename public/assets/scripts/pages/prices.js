function priceStatusLabel(status){
  return status==='inactive'?'停用':'启用';
}
function priceStatusTag(status){
  return status==='inactive'?'tms-tag-tier-slate':'tms-tag-green';
}
function priceTypeLabel(type){
  return type==='venue_rate'?'场地价格':'渠道商品';
}
function priceScopeText(row){
  if(row.type==='venue_rate')return cn(row.campus)||row.campus||'—';
  return `${row.channel||'—'} · ${row.productName||'—'}`;
}
function priceDateTypeText(row){
  return row.type==='venue_rate'?(row.dateType||'—'):'—';
}
function priceProductTypeText(row){
  return row.type==='channel_product'?(row.productType||'—'):'—';
}
function priceBusinessText(row){
  if(row.type!=='channel_product')return '—';
  return {court:'订场',lesson:'课程',package:'课包'}[row.businessType]||row.businessType||'—';
}
function priceDurationText(row){
  if(row.type==='venue_rate')return `${row.startTime||'—'}-${row.endTime||'—'}`;
  return row.durationMinutes?`${row.durationMinutes}分钟`:'—';
}
function priceAmountText(row){
  if(row.type==='venue_rate')return `¥${fmt(Number(row.unitPrice)||0)}/小时`;
  return `¥${fmt(Number(row.salePrice)||0)}`;
}
function syncPriceFilterOptions(){
  const typeHost=document.getElementById('priceTypeFilterHost');
  const productHost=document.getElementById('priceProductTypeFilterHost');
  if(typeHost){
    const value=document.getElementById('priceTypeFilter')?.value||'';
    typeHost.innerHTML=renderCourtDropdownHtml('priceTypeFilter','全部价格',[{value:'',label:'全部价格'},{value:'venue_rate',label:'场地价格'},{value:'channel_product',label:'渠道商品'}],value,false,'renderPrices');
  }
  if(productHost){
    const value=document.getElementById('priceProductTypeFilter')?.value||'';
    productHost.innerHTML=renderCourtDropdownHtml('priceProductTypeFilter','全部商品类型',[{value:'',label:'全部商品类型'},{value:'订场券',label:'订场券'},{value:'体验课',label:'体验课'},{value:'小班课',label:'小班课'},{value:'课包',label:'课包'}],value,false,'renderPrices');
  }
}
function filteredPricePlans(){
  const q=String(document.getElementById('priceSearch')?.value||'').trim().toLowerCase();
  const priceTypeFilter=document.getElementById('priceTypeFilter')?.value||'';
  const productTypeFilter=document.getElementById('priceProductTypeFilter')?.value||'';
  return pricePlans.filter(row=>{
    if(priceTypeFilter&&row.type!==priceTypeFilter)return false;
    if(productTypeFilter&&row.productType!==productTypeFilter)return false;
    if(!q)return true;
    return searchHit(q,row.campus,cn(row.campus),row.dateType,row.channel,row.productName,row.productType,row.businessType,row.notes);
  });
}
function renderPrices(){
  syncPriceFilterOptions();
  const rows=filteredPricePlans();
  const body=document.getElementById('priceTbody');
  if(!body)return;
  body.innerHTML=rows.map(row=>`<tr><td style="padding-left:20px"><span class="tms-tag ${row.type==='venue_rate'?'tms-tag-tier-blue':'tms-tag-green'}">${priceTypeLabel(row.type)}</span></td><td>${renderCourtCellText(priceScopeText(row),false)}</td><td>${renderCourtCellText(priceDateTypeText(row),false)}</td><td>${renderCourtCellText(priceProductTypeText(row),false)}</td><td>${renderCourtCellText(priceBusinessText(row),false)}</td><td>${renderCourtCellText(priceDurationText(row),false)}</td><td>${esc(priceAmountText(row))}</td><td><span class="tms-tag ${priceStatusTag(row.status)}">${priceStatusLabel(row.status)}</span></td><td class="tms-sticky-r tms-action-cell" style="width:120px;padding-right:20px"><span class="tms-action-link" onclick="openPriceModal('${row.type}','${row.id}')">编辑</span><span class="tms-action-link" onclick="togglePricePlanStatus('${row.id}')">${row.status==='inactive'?'启用':'停用'}</span></td></tr>`).join('')||`<tr><td colspan="9"><div class="empty"><p>${priceTypeFilter?'暂无'+priceTypeLabel(priceTypeFilter):'暂无价格'}，可先导入默认马坡价格。</p></div></td></tr>`;
}
function openPriceModal(type='',id=''){
  const row=pricePlans.find(x=>x.id===id)||{type:type||'venue_rate',status:'active'};
  type=row.type||type||'venue_rate';
  editId=id||null;
  const campusOptions=campuses.map(c=>({value:c.code||c.id,label:c.name||c.code||c.id}));
  const statusOptions=[{value:'active',label:'启用'},{value:'inactive',label:'停用'}];
  const typeSwitch=id?'':`<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">价格类型</label>${renderCourtDropdownHtml('priceType','价格类型',[{value:'venue_rate',label:'场地价格'},{value:'channel_product',label:'渠道商品'}],type,true,'switchPriceModalType')}</div></div>`;
  const fields=type==='venue_rate'
    ? `<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">校区</label>${renderCourtDropdownHtml('priceCampus','校区',campusOptions,row.campus||campusOptions[0]?.value||'',true)}</div><div class="tms-form-item"><label class="tms-form-label">日期类型</label>${renderCourtDropdownHtml('priceDateType','日期类型',[{value:'工作日',label:'工作日'},{value:'周末节假日',label:'周末节假日'}],row.dateType||'工作日',true)}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">开始时间</label>${renderCourtDropdownHtml('priceStartTime','开始时间',getCourtTimeOptions(row.startTime||'08:00'),row.startTime||'08:00',true)}</div><div class="tms-form-item"><label class="tms-form-label">结束时间</label>${renderCourtDropdownHtml('priceEndTime','结束时间',getCourtTimeOptions(row.endTime||'10:00'),row.endTime||'10:00',true)}</div><div class="tms-form-item"><label class="tms-form-label">原价/小时</label><input class="finput tms-form-control" id="priceUnitPrice" type="number" min="0" step="1" value="${row.unitPrice||''}"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">状态</label>${renderCourtDropdownHtml('priceStatus','状态',statusOptions,row.status||'active',true)}</div><div class="tms-form-item"><label class="tms-form-label">备注</label><input class="finput tms-form-control" id="priceNotes" value="${esc(row.notes||'')}"></div></div>`
    : `<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">渠道</label>${renderCourtDropdownHtml('priceChannel','渠道',[{value:'大众点评',label:'大众点评'},{value:'抖音',label:'抖音'},{value:'小程序',label:'小程序'},{value:'门店',label:'门店'}],row.channel||'大众点评',true)}</div><div class="tms-form-item"><label class="tms-form-label">商品名称</label><input class="finput tms-form-control" id="priceProductName" value="${esc(row.productName||'')}"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">商品类型</label>${renderCourtDropdownHtml('priceProductType','商品类型',[{value:'订场券',label:'订场券'},{value:'体验课',label:'体验课'},{value:'小班课',label:'小班课'},{value:'课包',label:'课包'}],row.productType||'订场券',true)}</div><div class="tms-form-item"><label class="tms-form-label">关联业务</label>${renderCourtDropdownHtml('priceBusinessType','关联业务',[{value:'court',label:'订场'},{value:'lesson',label:'课程'},{value:'package',label:'课包'}],row.businessType||'court',true)}</div><div class="tms-form-item"><label class="tms-form-label">时长分钟</label><input class="finput tms-form-control" id="priceDurationMinutes" type="number" min="0" step="30" value="${row.durationMinutes||''}"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">售价</label><input class="finput tms-form-control" id="priceSalePrice" type="number" min="0" step="1" value="${row.salePrice||''}"></div><div class="tms-form-item"><label class="tms-form-label">状态</label>${renderCourtDropdownHtml('priceStatus','状态',statusOptions,row.status||'active',true)}</div><div class="tms-form-item"><label class="tms-form-label">备注</label><input class="finput tms-form-control" id="priceNotes" value="${esc(row.notes||'')}"></div></div>`;
  const body=typeSwitch+fields;
  setCourtModalFrame(id?'编辑价格':'新增价格',body,`<button class="btn-cancel" onclick="closeModal()">取消</button><button class="btn-save" onclick="savePricePlan('${type}')">保存</button>`,'modal-wide');
}
function switchPriceModalType(type){openPriceModal(type);}
async function savePricePlan(type){
  const payload={type,status:document.getElementById('priceStatus')?.value||'active',notes:document.getElementById('priceNotes')?.value.trim()||''};
  if(type==='venue_rate'){
    Object.assign(payload,{campus:document.getElementById('priceCampus')?.value||'',dateType:document.getElementById('priceDateType')?.value||'',startTime:document.getElementById('priceStartTime')?.value||'',endTime:document.getElementById('priceEndTime')?.value||'',unitPrice:parseFloat(document.getElementById('priceUnitPrice')?.value)||0});
  }else{
    Object.assign(payload,{channel:document.getElementById('priceChannel')?.value||'',productName:document.getElementById('priceProductName')?.value.trim()||'',productType:document.getElementById('priceProductType')?.value||'',businessType:document.getElementById('priceBusinessType')?.value||'',durationMinutes:parseInt(document.getElementById('priceDurationMinutes')?.value)||0,salePrice:parseFloat(document.getElementById('priceSalePrice')?.value)||0});
  }
  try{
    const saved=await apiCall(editId?'PUT':'POST',editId?`/price-plans/${editId}`:'/price-plans',payload);
    const i=pricePlans.findIndex(x=>x.id===saved.id);
    if(i>=0)pricePlans[i]=saved;else pricePlans.unshift(saved);
    closeModal();
    renderPrices();
    toast('价格已保存','success');
  }catch(e){toast('保存失败：'+e.message,'error');}
}
async function togglePricePlanStatus(id){
  const row=pricePlans.find(x=>x.id===id);
  if(!row)return;
  try{
    const saved=await apiCall('PUT',`/price-plans/${id}`,{...row,status:row.status==='inactive'?'active':'inactive'});
    const i=pricePlans.findIndex(x=>x.id===id);
    if(i>=0)pricePlans[i]=saved;
    renderPrices();
  }catch(e){toast('更新失败：'+e.message,'error');}
}
function defaultMabaoPricePlans(){
  const venue=[
    ['工作日','06:00','08:00',100],
    ['工作日','08:00','16:00',140],
    ['工作日','16:00','20:00',220],
    ['工作日','20:00','22:00',180],
    ['周末节假日','06:00','08:00',100],
    ['周末节假日','08:00','22:00',220]
  ].map(([dateType,startTime,endTime,unitPrice])=>({type:'venue_rate',campus:'mabao',dateType,startTime,endTime,unitPrice,status:'active',notes:'默认马坡场地价'}));
  const products=[
    ['青少年1v1私教体验','体验课','lesson',0,199],
    ['成人1v1私教体验课','体验课','lesson',0,239],
    ['青少年1v4小班课体验课','小班课','lesson',0,99],
    ['成人1v4小班课体验课','小班课','lesson',0,129],
    ['王牌专项 2.5-3.0多球实战特训','体验课','lesson',0,200],
    ['发接发与实战练习','体验课','lesson',0,260],
    ['削球实战训练','体验课','lesson',0,260],
    ['截击入门训练','体验课','lesson',0,260],
    ['疯狂多球训练','体验课','lesson',0,260],
    ['新客福利 约球双打局 2H','订场券','court',120,70],
    ['晚场福利 场地预定 1H','订场券','court',60,180],
    ['黄金时段 场地预定 1H','订场券','court',60,220],
    ['实力之选 网球陪打 1H','订场券','court',60,100],
    ['闲时特惠 场地预定 1H','订场券','court',60,140],
    ['刷球时刻 网球发球机畅打 1H','订场券','court',60,60],
    ['晨练 场地预定 30min','订场券','court',30,50]
  ].map(([productName,productType,businessType,durationMinutes,salePrice])=>({type:'channel_product',channel:'大众点评',productName,productType,businessType,durationMinutes,salePrice,status:'active',notes:'默认大众点评商品价'}));
  return [...venue,...products];
}
function hasSameActivePricePlan(row){
  return pricePlans.some(p=>{
    if(p.status==='inactive'||p.type!==row.type)return false;
    if(row.type==='venue_rate')return p.campus===row.campus&&p.dateType===row.dateType&&p.startTime===row.startTime&&p.endTime===row.endTime;
    return p.channel===row.channel&&p.productName===row.productName;
  });
}
async function importDefaultMabaoPrices(){
  if(!await appConfirm('导入默认马坡场地价和大众点评商品价？已存在的启用价格会跳过。',{title:'导入默认价格',confirmText:'确认导入'}))return;
  const rows=defaultMabaoPricePlans().filter(row=>!hasSameActivePricePlan(row));
  if(!rows.length){toast('没有需要导入的价格','warn');return;}
  let ok=0;
  try{
    for(const row of rows){
      const saved=await apiCall('POST','/price-plans',row);
      pricePlans.unshift(saved);
      ok++;
    }
    renderPrices();
    toast(`已导入 ${ok} 条价格`,'success');
  }catch(e){toast(`已导入 ${ok} 条，失败：${e.message}`,'error');}
}
