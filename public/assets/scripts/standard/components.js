function standardTopChevronIcon(){
  return '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M150.3 305.16c14.72-14.72 38.3-15.61 54.08-2.03l2.19 2.03L544.11 642.7l337.54-337.54c14.72-14.74 38.32-15.62 54.1-2.03l2.17 2.03c14.72 14.72 15.61 38.3 2.03 54.08l-2.03 2.19L586.3 713.04c-22.34 22.33-58.22 23.38-81.83 2.39l-2.55-2.39-351.64-351.63c-15.53-15.53-15.53-40.72 0-56.25h0.02z"></path></svg>';
}
function standardTopLocationIcon(){
  return '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M512 249.976471c-99.388235 0-180.705882 81.317647-180.705882 180.705882s81.317647 180.705882 180.705882 180.705882 180.705882-81.317647 180.705882-180.705882-81.317647-180.705882-180.705882-180.705882z m0 301.17647c-66.258824 0-120.470588-54.211765-120.470588-120.470588s54.211765-120.470588 120.470588-120.470588 120.470588 54.211765 120.470588 120.470588-54.211765 120.470588-120.470588 120.470588z"></path><path d="M512 39.152941c-216.847059 0-391.529412 174.682353-391.529412 391.529412 0 349.364706 391.529412 572.235294 391.529412 572.235294s391.529412-222.870588 391.529412-572.235294c0-216.847059-174.682353-391.529412-391.529412-391.529412z m0 891.482353C424.658824 873.411765 180.705882 686.682353 180.705882 430.682353c0-183.717647 147.576471-331.294118 331.294118-331.294118s331.294118 147.576471 331.294118 331.294118c0 256-243.952941 442.729412-331.294118 499.952941z"></path></svg>';
}
function standardTopTimeIcon(){
  return '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M512 64c249.6 0 448 198.4 448 448s-198.4 448-448 448-448-198.4-448-448 198.4-448 448-448z m0 64C300.8 128 128 300.8 128 512s172.8 384 384 384 384-172.8 384-384-172.8-384-384-384z m32 128v224h192v64h-256V256h64z"></path></svg>';
}
function standardTopCoachIcon(){
  return '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M512 128c105.984 0 192 86.016 192 192s-86.016 192-192 192-192-86.016-192-192 86.016-192 192-192z m0 64c-70.592 0-128 57.408-128 128s57.408 128 128 128 128-57.408 128-128-57.408-128-128-128zM512 576c176.736 0 320 107.456 320 240v48H192v-48c0-132.544 143.264-240 320-240z m0 64c-130.624 0-239.232 70.336-255.104 160h510.208C751.232 710.336 642.624 640 512 640z"></path></svg>';
}
function renderStandardTopDropdown(id,displayText,iconSvg,menuHtml,menuClass=''){
  return `<div class="tms-dropdown court-top-select" id="${id}_dropdown" data-target="${id}" onclick="toggleStandardTopDropdown('${id}',event)"><input type="hidden" id="${id}" value="${esc(displayText)}"><div class="tms-dropdown-display court-top-display"><span class="court-top-display-main"><span class="court-top-display-icon">${iconSvg}</span><span class="court-top-display-text">${esc(displayText)}</span></span><span class="court-top-display-chevron">${standardTopChevronIcon()}</span></div><div class="tms-dropdown-menu ${menuClass}" style="touch-action:pan-y;-webkit-overflow-scrolling:touch" onwheel="event.stopPropagation();event.preventDefault();this.scrollTop += event.deltaY" ontouchmove="event.stopPropagation()">${menuHtml}</div></div>`;
}
function closeStandardTopDropdowns(){
  const globalDateDropdown=document.getElementById('globalTopDate_dropdown');
  const shouldCancelGlobalDraft=!!(globalDateDropdown&&globalDateDropdown.classList.contains('open')&&typeof cancelGlobalCustomDateDraft==='function');
  document.querySelectorAll('#campusTabs .tms-dropdown.open').forEach(el=>el.classList.remove('open'));
  if(shouldCancelGlobalDraft)cancelGlobalCustomDateDraft();
}
function toggleStandardTopDropdown(id,event){
  if(event)event.stopPropagation();
  const dropdown=document.getElementById(id+'_dropdown');
  if(!dropdown)return;
  document.querySelectorAll('#campusTabs .tms-dropdown.open').forEach(el=>{
    if(el!==dropdown){
      const shouldCancel=el.id==='globalTopDate_dropdown'&&typeof cancelGlobalCustomDateDraft==='function';
      el.classList.remove('open');
      if(shouldCancel)cancelGlobalCustomDateDraft();
    }
  });
  const wasOpen=dropdown.classList.contains('open');
  dropdown.classList.toggle('open');
  if(wasOpen&&id==='globalTopDate'&&typeof cancelGlobalCustomDateDraft==='function')cancelGlobalCustomDateDraft();
}
function renderStandardEmptyText(value){
  const raw=String(value??'').trim();
  return raw&&raw!=='—'?raw:'-';
}
function standardBusinessTagClass(kind,value=''){
  const text=String(value||'').trim();
  if(kind==='source'){
    if(text==='大众点评')return 'tms-tag-business-source-dianping';
    if(text==='小红书')return 'tms-tag-business-source-xiaohongshu';
    if(text==='抖音'||text==='视频号')return 'tms-tag-business-source-video';
    if(text==='线下到店')return 'tms-tag-business-source-store';
    if(text==='转介绍'||text==='群友')return 'tms-tag-business-source-referral';
    return 'tms-tag-business-neutral';
  }
  if(kind==='customerType'||kind==='type')return text==='青少年'?'tms-tag-business-type-youth':text==='成人'?'tms-tag-business-type-adult':'tms-tag-business-neutral';
  if(kind==='demandProduct'||kind==='consult'||kind==='demand'){
    if(/私教/.test(text))return 'tms-tag-business-demand-private';
    if(/小班/.test(text))return 'tms-tag-business-demand-group';
    if(/订场|场地/.test(text))return 'tms-tag-business-demand-court';
    if(/会员/.test(text))return 'tms-tag-business-demand-member';
    if(/陪打|约球|穿线|合作/.test(text))return 'tms-tag-business-demand-other';
    return 'tms-tag-business-neutral';
  }
  if(kind==='stage'){
    if(text==='新线索')return 'tms-tag-business-stage-new';
    if(text==='跟进中')return 'tms-tag-business-stage-following';
    if(text==='已约体验')return 'tms-tag-business-stage-booked';
    if(text==='已体验待成交'||text==='已体验待转化')return 'tms-tag-business-stage-trial-done';
    if(text.startsWith('已成交'))return 'tms-tag-business-stage-won';
    if(text==='已流失')return 'tms-tag-business-stage-lost';
    return 'tms-tag-business-neutral';
  }
  if(kind==='priority'){
    if(text==='P0')return 'tms-tag-priority-p0';
    if(text==='P1')return 'tms-tag-priority-p1';
    if(text==='P2')return 'tms-tag-priority-p2';
    if(text==='P3')return 'tms-tag-priority-p3';
    return 'tms-tag-priority-p4';
  }
  return 'tms-tag-business-neutral';
}
function renderStandardBusinessTag(value,kind){
  const text=String(value||'').trim()||'-';
  return `<span class="tms-tag ${standardBusinessTagClass(kind,text)}">${esc(text)}</span>`;
}
function renderStandardTooltipText(value,className='tms-text-remark tms-text-remark-1'){
  const text=renderStandardEmptyText(value);
  return `<div class="${esc(className)} tms-tooltip-text" data-tooltip="${esc(text)}">${esc(text)}</div>`;
}
function renderStandardCellText(value,mutedWhenEmpty=true){
  const raw=String(value??'').trim();
  const text=renderStandardEmptyText(raw);
  const muted=!raw||raw==='-'||raw==='—'||raw==='未开卡'||(mutedWhenEmpty&&raw==='未分配');
  return `<div class="tms-cell-text${muted?' is-muted':''}">${esc(text)}</div>`;
}
function renderStandardDropdownHtml(id,label,options,value,isForm=false,onchange=''){
  const list=(options||[]).map(opt=>typeof opt==='string'?{value:opt,label:opt}:opt);
  const active=list.find(opt=>String(opt.value)===String(value))||list.find(opt=>opt.active)||null;
  const displayLabel=active?(String(active.value)===''&&active.emptyDisplay?active.emptyDisplay:renderStandardOptionLabel(active)):label;
  const hasValue=String(active?.value||value||'')!=='';
  const isPageSize=String(id).includes('PageSize');
  const checkIcon='<span class="tms-dropdown-check" aria-hidden="true"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.2L5.7 10.2L11.5 3.8"/></svg></span>';
  return `<div class="tms-dropdown ${isForm?'tms-dropdown-form ':''}${isPageSize?'tms-page-size-dropdown ':''}${hasValue?'has-value':''}" id="${id}_dropdown" data-target="${id}" data-label="${esc(label)}" data-onchange="${onchange}" onclick="toggleStandardDropdown('${id}',event)"><input type="hidden" id="${id}" value="${esc(active?.value||value||'')}"><div class="tms-dropdown-display">${esc(displayLabel)}</div><div class="tms-dropdown-menu" style="touch-action:pan-y;-webkit-overflow-scrolling:touch" onwheel="event.stopPropagation();event.preventDefault();this.scrollTop += event.deltaY" ontouchmove="event.stopPropagation()">${list.map(opt=>{const optionLabel=renderStandardOptionLabel(opt);const isActive=active&&String(opt.value)===String(active.value);return `<div class="tms-dropdown-item ${isActive?'active':''}" data-value="${esc(opt.value??'')}" onclick="selectStandardDropdownItem('${id}',${jsArg(opt.value)},${jsArg(optionLabel)},event)">${isPageSize?checkIcon:''}<span>${esc(optionLabel)}</span></div>`;}).join('')}</div></div>`;
}
function closeStandardDropdowns(){
  document.querySelectorAll('.tms-dropdown.open').forEach(el=>{
    el.classList.remove('open');
    el.classList.remove('open-upward');
    const formItem=el.closest('.tms-form-item');
    if(formItem)formItem.style.zIndex='1';
  });
}
function toggleStandardDropdown(id,event){
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
      const active=menu.querySelector('.tms-dropdown-item.active');
      if(active)active.scrollIntoView({block:'nearest'});
    }
  }
  const formItem=dropdown.closest('.tms-form-item');
  if(formItem)formItem.style.zIndex=dropdown.classList.contains('open')?'10':'1';
}
function selectStandardDropdownItem(id,value,label,event){
  if(event)event.stopPropagation();
  const dropdown=document.getElementById(id+'_dropdown');
  const input=document.getElementById(id);
  if(input)input.value=value;
  if(dropdown){
    const display=dropdown.querySelector('.tms-dropdown-display');
    if(display)display.textContent=label;
    dropdown.classList.toggle('has-value',String(value||'')!=='');
    dropdown.querySelectorAll('.tms-dropdown-item').forEach(el=>el.classList.remove('active'));
    const current=[...dropdown.querySelectorAll('.tms-dropdown-item')].find(el=>String(el.dataset.value||'')===String(value||'')||el.textContent===label);
    if(current)current.classList.add('active');
    dropdown.classList.remove('open');
    const formItem=dropdown.closest('.tms-form-item');
    if(formItem)formItem.style.zIndex='1';
    const cb=dropdown.dataset.onchange;
    if(cb&&typeof window[cb]==='function')window[cb](value,label);
  }
}
function setStandardDropdownValue(id,value,label=''){
  const input=document.getElementById(id);
  const dropdown=document.getElementById(id+'_dropdown');
  if(input)input.value=value;
  if(!dropdown)return;
  const items=[...dropdown.querySelectorAll('.tms-dropdown-item')];
  items.forEach(el=>el.classList.remove('active'));
  const hit=items.find(el=>String(el.dataset.value||'')===String(value||'')||el.textContent===String(label||'')||el.textContent===String(value||''));
  if(hit)hit.classList.add('active');
  const display=dropdown.querySelector('.tms-dropdown-display');
  if(display)display.textContent=label||hit?.textContent||dropdown.dataset.label||'';
  dropdown.classList.toggle('has-value',String(value||'')!=='');
}
function renderStandardPaginationButtonsHtml(page,pages,onPageChange){
  const current=Math.max(1,parseInt(page,10)||1);
  const totalPages=Math.max(1,parseInt(pages,10)||1);
  if(totalPages<=1)return '';
  const items=[1];
  const start=Math.max(2,current-2);
  const end=Math.min(totalPages-1,current+2);
  if(start>2)items.push('...');
  for(let i=start;i<=end;i++)items.push(i);
  if(end<totalPages-1)items.push('...');
  items.push(totalPages);
  const handler=String(onPageChange||'');
  const pageBtns=items.map(item=>item==='...'
    ?'<span class="tms-page-ellipsis">...</span>'
    :`<div class="tms-page-btn${item===current?' active':''}" onclick="${handler}(${item})">${item}</div>`
  ).join('');
  return `<div class="tms-page-btn" onclick="${handler}(Math.max(1,${current}-1))">${renderPagerChevron('prev')}</div>${pageBtns}<div class="tms-page-btn" onclick="${handler}(Math.min(${totalPages},${current}+1))">${renderPagerChevron('next')}</div>`;
}
function standardListFirstPage(){
  return 1;
}
function standardListPageSize(value,current=20){
  const next=parseInt(value,10);
  if([20,50,100].includes(next))return next;
  const fallback=parseInt(current,10);
  return [20,50,100].includes(fallback)?fallback:20;
}
function standardListPagination(total,page,pageSize){
  const safeTotal=Math.max(0,parseInt(total,10)||0);
  const safePageSize=standardListPageSize(pageSize,20);
  const pages=Math.max(1,Math.ceil(safeTotal/safePageSize));
  const current=Math.min(pages,Math.max(1,parseInt(page,10)||1));
  const start=(current-1)*safePageSize;
  return {total:safeTotal,page:current,pageSize:safePageSize,pages,start,end:start+safePageSize};
}
function standardListSlice(list,page,pageSize){
  const rows=Array.isArray(list)?list:[];
  const state=standardListPagination(rows.length,page,pageSize);
  return {...state,slice:rows.slice(state.start,state.end)};
}
function renderStandardSkeletonKpiCard(){
  return '<div class="tms-skeleton-card"><span class="tms-skeleton-line is-label"></span><strong class="tms-skeleton-line is-value"></strong><i class="tms-skeleton-line is-meta"></i><b class="tms-skeleton-spark"><span></span><span></span><span></span><span></span></b></div>';
}
function renderStandardSkeletonChartPanel(panel={}){
  const cls=String(panel.className||'').trim();
  const variant=String(panel.variant||'chart').trim();
  return `<div class="tms-skeleton-panel ${esc(cls)}" data-skeleton-variant="${esc(variant)}"><span class="tms-skeleton-line is-title"></span><div class="tms-skeleton-chart-body"><i></i><i></i><i></i><i></i><i></i></div><div class="tms-skeleton-legend"><span></span><span></span><span></span></div></div>`;
}
function renderStandardSkeletonTablePanel(panel={}){
  const cls=String(panel.className||'').trim();
  const columns=Math.max(4,Math.min(8,Number(panel.columns)||6));
  const cells=Array.from({length:columns},(_,index)=>`<span class="tms-skeleton-line ${index===0?'is-strong':''}"></span>`).join('');
  const rows=Array.from({length:Math.max(3,Math.min(8,Number(panel.rows)||5))},()=>`<div class="tms-skeleton-table-row">${cells}</div>`).join('');
  return `<div class="tms-skeleton-panel tms-skeleton-table-panel ${esc(cls)}"><span class="tms-skeleton-line is-title"></span><div class="tms-skeleton-table">${rows}</div></div>`;
}
function renderStandardSkeletonSection(section={}){
  const type=String(section.type||'grid');
  const cls=String(section.className||'').trim();
  if(type==='kpis'){
    const count=Math.max(1,Math.min(8,Number(section.count)||4));
    return `<div class="${esc(cls||'tms-skeleton-kpi-row')}">${Array.from({length:count},renderStandardSkeletonKpiCard).join('')}</div>`;
  }
  if(type==='table')return renderStandardSkeletonTablePanel(section);
  const panels=Array.isArray(section.panels)&&section.panels.length?section.panels:[{}];
  return `<div class="${esc(cls||'tms-skeleton-grid')}">${panels.map(renderStandardSkeletonChartPanel).join('')}</div>`;
}
function renderStandardPageSkeleton(config={}){
  const cls=String(config.className||'').trim();
  const sections=Array.isArray(config.sections)?config.sections:[];
  return `<div class="tms-page-skeleton ${esc(cls)}">${sections.map(renderStandardSkeletonSection).join('')}</div>`;
}
function standardPageSkeletonConfigs(){
  return [
    {page:'products',hostId:'productGrid',variant:'cards',className:'course-showcase-skeleton',sections:[
      {type:'grid',className:'course-showcase-grid tms-skeleton-card-grid',panels:[{variant:'card'},{variant:'card'},{variant:'card'},{variant:'card'}]}
    ]},
    {page:'packages',hostId:'packageGrid',variant:'board',className:'course-package-skeleton',sections:[
      {type:'grid',className:'course-package-showcase-grid tms-skeleton-board-grid',panels:[{variant:'table'},{variant:'table'},{variant:'table'},{variant:'table'}]}
    ]},
    {page:'finance',variant:'finance',onRender:()=>{
      const stats=document.getElementById('financeOverviewPrimaryStats');
      if(stats)stats.innerHTML=renderStandardPageSkeleton({className:'finance-skeleton-stats',sections:[{type:'kpis',className:'tms-stats-row finance-ledger-stats',count:5}]});
      if(typeof renderTableSkeletonLoading==='function'){
        renderTableSkeletonLoading('financeLedgerTbody',11,'总账加载中...');
        renderTableSkeletonLoading('financeRevenueTbody',14,'收入表加载中...');
        renderTableSkeletonLoading('financeConsumeTbody',9,'消耗表加载中...');
        renderTableSkeletonLoading('financePrepaidTbody',6,'预收余额加载中...');
        renderTableSkeletonLoading('financeAnomalyTbody',4,'异常检查加载中...');
      }
      return true;
    }},
    {page:'workbench',hostId:'workbenchBody',variant:'dashboard',className:'coach-wb-container',sections:[
      {type:'kpis',className:'coach-wb-stats-row',count:3},
      {type:'grid',className:'tms-skeleton-calendar-grid',panels:[{variant:'table'}]}
    ]},
    {page:'postfeedback',hostId:'postFeedbackBody',variant:'cards',className:'coach-wb-container',sections:[
      {type:'grid',className:'coach-wb-board tms-skeleton-card-grid',panels:[{variant:'card'},{variant:'card'},{variant:'card'}]}
    ]}
  ];
}
function standardPageSkeletonConfigForPage(pageKey){
  return standardPageSkeletonConfigs().find(item=>item.page===pageKey)||null;
}
function renderStandardPageLoading(pageKey){
  const config=standardPageSkeletonConfigForPage(pageKey);
  if(!config)return false;
  if(typeof config.onRender==='function')return config.onRender();
  const host=document.getElementById(config.hostId||`page-${pageKey}`);
  if(!host)return false;
  host.innerHTML=renderStandardPageSkeleton(config);
  return true;
}
function renderStandardSearchHtml({id='',placeholder='搜索姓名、手机号',oninput=''}={}){
  return `<div class="tms-search-wrapper"><span class="tms-search-icon" aria-hidden="true"></span><input type="text" class="tms-search-input" id="${esc(id)}" placeholder="${esc(placeholder)}"${oninput?` oninput="${esc(oninput)}"`:''}></div>`;
}
function renderStandardToolbarHtml({search=null,filterHostIds=[],filterHtmls=[],actionsHtml='',leftHtml='',toolbarClass='tms-toolbar',filterClass='tms-filters',actionsClass='tms-toolbar-right'}={}){
  const filters=[search?renderStandardSearchHtml(search):'',...(filterHostIds||[]).map(id=>`<div id="${esc(id)}"></div>`),...(filterHtmls||[])].join('');
  const filterHtml=`<div class="${esc(filterClass)}">${filters}</div>`;
  const main=leftHtml?`<div class="tms-toolbar-left">${leftHtml}${filterHtml}</div>`:filterHtml;
  return `<div class="${esc(toolbarClass)}">${main}${actionsHtml?`<div class="${esc(actionsClass)}">${actionsHtml}</div>`:''}</div>`;
}
function renderStandardStatsShellHtml(id,className='tms-stats-row'){
  return id?`<div class="${esc(className)}" id="${esc(id)}"></div>`:'';
}
function renderStandardStatsShellsHtml(config={}){
  const primary=config.statsId?renderStandardStatsShellHtml(config.statsId,config.statsClass):'';
  const extra=(config.extraStatsIds||[]).map(renderStandardStatsShellHtml).join('');
  return primary+extra;
}
function renderStandardTableHeadCellHtml(col={}){
  if(typeof col==='string')return col;
  const cls=col.className?` class="${esc(col.className)}"`:'';
  const style=col.style?` style="${esc(col.style)}"`:'';
  return `<th${cls}${style}>${col.html||esc(col.label||'')}</th>`;
}
function renderStandardListPagerShellHtml({infoId='',pageSizeId='',buttonsId='',pageSizeTag='div'}={}){
  const tag=pageSizeTag==='span'?'span':'div';
  const sizeHost=pageSizeId?`<${tag} id="${esc(pageSizeId)}"></${tag}>`:'';
  return `<div class="tms-pagination"><div class="tms-pagination-left"><span class="pager-info" id="${esc(infoId)}">共 0 条</span>${sizeHost}</div><div class="tms-page-numbers" id="${esc(buttonsId)}"></div></div>`;
}
function renderStandardTableShellHtml({columns=[],bodyId='',tableClass='',pager=null}={}){
  const cls=`tms-table ${String(tableClass||'').trim()}`.trim();
  return `<div class="tms-table-card"><div class="tms-table-wrapper"><table class="${esc(cls)}"><thead><tr>${(columns||[]).map(renderStandardTableHeadCellHtml).join('')}</tr></thead><tbody id="${esc(bodyId)}"></tbody></table></div>${pager?renderStandardListPagerShellHtml(pager):''}</div>`;
}
function renderStandardListStateHtml({title='',desc='',actionHtml='',className='tms-empty-state'}={}){
  return `<div class="${esc(className)}"><div class="tms-empty-title">${esc(title)}</div>${desc?`<div class="tms-empty-desc">${esc(desc)}</div>`:''}${actionHtml||''}</div>`;
}
function renderStandardListPageShellHtml(config={}){
  const stats=renderStandardStatsShellsHtml(config);
  const toolbar=config.toolbar===false?'':renderStandardToolbarHtml(config.toolbar||{});
  const note=config.noteHtml?`<div class="tms-audit-note">${config.noteHtml}</div>`:'';
  const body=config.bodyHtml||renderStandardTableShellHtml(config.table||{});
  const pager=config.bodyHtml&&config.pager?renderStandardListPagerShellHtml(config.pager):'';
  const content=[stats,toolbar,note,body,pager,config.afterHtml||''].filter(Boolean).join('');
  return config.containerClass?`<div class="${esc(config.containerClass)}">${content}</div>`:content;
}
function standardListPageShellConfigs(){
  return [
    {key:'leads',statsId:'leadStatsRow',toolbar:{search:{id:'leadSearch',oninput:'applyLeadSearch()'},filterHostIds:['leadSourceFilterHost','leadCustomerTypeFilterHost','leadConsultFilterHost','leadStageFilterHost','leadOwnerFilterHost'],actionsHtml:'<span class="tms-import-action" onclick="openLeadImportPreviewModal()">导入</span><button class="tms-btn tms-btn-primary" onclick="openLeadModal(null)">新增线索</button>'},table:{bodyId:'leadTbody',pager:{infoId:'leadPagerInfo',pageSizeId:'leadPageSize',buttonsId:'leadPagerBtns'},columns:[{label:'微信名',className:'tms-sticky-l',style:'width:130px;padding-left:20px'},{style:'width:120px',html:'<button class="tms-sort-header" data-lead-sort="leadDate" onclick="cycleLeadSort(\'leadDate\')">线索时间<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{label:'来源',style:'width:110px'},{label:'类型',style:'width:90px'},{label:'需求产品',style:'width:110px'},{label:'水平',style:'width:80px'},{label:'基本信息',style:'width:280px'},{label:'线索阶段',style:'width:140px'},{label:'跟进优先级',style:'width:100px'},{label:'跟进人',style:'width:100px'},{style:'width:220px',html:'<button class="tms-sort-header" data-lead-sort="trialLessonAt" onclick="cycleLeadSort(\'trialLessonAt\')">体验课时间<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{label:'成交教练',style:'width:110px'},{label:'流失原因',style:'width:170px'},{label:'操作',className:'tms-sticky-r',style:'width:150px;padding-right:20px;text-align:right'}]}},
    {key:'students',statsId:'studentStatsRow',toolbar:{search:{id:'stuSearch',oninput:'onStudentFilterChange()'},filterHostIds:['stuTypeFilterHost','stuSourceFilterHost','stuCoachFilterHost'],actionsHtml:'<span class="tms-export-action" onclick="exportStudentCSV()">导出</span><button class="tms-btn tms-btn-primary" onclick="openStudentModal(null)">添加学员</button>'},table:{bodyId:'stuTbody',pager:{infoId:'stuPagerInfo',pageSizeId:'stuPageSize',buttonsId:'stuPagerBtns'},columns:[{label:'学员',className:'tms-sticky-l',style:'width:150px;padding-left:20px'},{label:'电话',style:'width:94px'},{label:'类型',style:'width:58px'},{label:'校区',style:'width:105px'},{style:'width:110px',html:'<button class="tms-sort-header" data-student-sort="packagePurchaseDate" onclick="cycleStudentSort(\'packagePurchaseDate\')">课包购买时间<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{style:'width:100px',html:'<button class="tms-sort-header" data-student-sort="completedLessons" onclick="cycleStudentSort(\'completedLessons\')">累计上课<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{label:'负责教练',style:'width:110px'},{style:'width:90px',html:'<button class="tms-sort-header" data-student-sort="packageLessons" onclick="cycleStudentSort(\'packageLessons\')">课时/课包<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{label:'来源',style:'width:90px'},{label:'备注',style:'width:180px'},{label:'操作',className:'tms-sticky-r',style:'width:150px;padding-right:20px;text-align:right'}]}},
    {key:'schedule',toolbar:{search:{id:'schSearch',oninput:'onScheduleFilterChange()'},filterHostIds:['schCourseTypeFilterHost','schCoachFilterHost','schProposalFilterHost','schFeedbackFilterHost','schStatusFilterHost'],actionsHtml:'<button class="tms-btn tms-btn-primary" onclick="openScheduleModal(null)">添加排课</button>'},table:{bodyId:'schTbody',pager:{infoId:'schPagerInfo',pageSizeId:'schPageSize',buttonsId:'schPagerBtns',pageSizeTag:'span'},columns:[{label:'日期',className:'tms-sticky-l',style:'width:84px;padding-left:14px'},{label:'上课时间',style:'width:92px'},{label:'时长',style:'width:52px'},{label:'校区/场地',style:'width:125px'},{label:'教练',style:'width:68px'},{label:'学员',style:'width:120px'},{label:'课程类型',style:'width:156px'},{label:'课前教案',style:'width:72px'},{label:'课后反馈',style:'width:72px'},{label:'重复?',style:'width:64px'},{label:'状态',style:'width:68px'},{label:'操作',className:'tms-sticky-r',style:'width:118px;padding-right:10px;text-align:right'}]}},
    {key:'admin-users',toolbar:{search:{id:'adminUserSearch',oninput:'onAdminUserFilterChange()'},actionsHtml:'<button class="tms-btn tms-btn-primary" onclick="openAdminUserModal(null)">新增账号</button>'},table:{bodyId:'adminUserTbody',pager:{infoId:'adminUserPagerInfo',pageSizeId:'adminUserPageSize',buttonsId:'adminUserPagerBtns'},columns:[{label:'账号名',className:'tms-sticky-l',style:'width:130px;padding-left:20px'},{label:'姓名',style:'width:100px'},{label:'手机号',style:'width:112px'},{label:'角色',style:'width:90px'},{label:'绑定教练',style:'width:100px'},{label:'微信绑定',style:'width:130px'},{label:'服务号绑定',style:'width:130px'},{label:'状态',style:'width:82px'},{label:'权限说明',style:'width:260px'},{label:'操作',className:'tms-sticky-r',style:'width:170px;padding-right:20px;text-align:right'}]}},
    {key:'packages',containerClass:'course-package-showcase',toolbar:{toolbarClass:'course-package-showcase-toolbar',filterClass:'course-package-showcase-filters',actionsClass:'course-package-showcase-actions',search:{id:'pkgSearch',oninput:'onPackageFilterChange()'},filterHostIds:['pkgTypeFilterHost','pkgAudienceFilterHost','pkgCoachFilterHost','pkgStatusFilterHost','pkgTimeBandFilterHost'],actionsHtml:'<button class="tms-btn tms-btn-ghost" onclick="openPackageMergeModal()">合并课包</button><button class="tms-btn tms-btn-primary" onclick="openPackageModal(null)">创建课包</button>'},bodyHtml:'<div class="course-package-showcase-grid" id="packageGrid"></div>'},
    {key:'purchases',toolbar:{search:{id:'purSearch',oninput:'onPurchaseFilterChange()'},filterHostIds:['purPackageFilterHost'],actionsHtml:'<button class="tms-btn tms-btn-primary" onclick="openPurchaseEntryModal()">课包购买</button>'},table:{bodyId:'purchaseTbody',pager:{infoId:'purPagerInfo',pageSizeId:'purPageSize',buttonsId:'purPagerBtns'},columns:[{label:'支付日期',style:'width:100px;padding-left:20px'},{label:'学员',style:'width:80px'},{label:'课包',style:'width:260px'},{label:'实收',style:'width:70px'},{label:'余额',style:'width:80px'},{label:'状态',style:'width:64px'},{label:'归属教练',style:'width:78px'},{label:'支付方式',style:'width:78px'},{label:'操作',className:'tms-sticky-r',style:'width:120px;padding-right:20px;text-align:right'}]}},
    {key:'prices',noteHtml:'价格在这里统一维护。订场和渠道核销会自动引用价格，并在流水里保存当时的价格快照。',toolbar:{search:{id:'priceSearch',oninput:'onPriceFilterChange()'},filterHostIds:['priceTypeFilterHost','priceProductTypeFilterHost'],actionsHtml:'<button class="tms-btn tms-btn-primary" onclick="openPriceModal()">新增价格</button>'},table:{bodyId:'priceTbody',tableClass:'price-table',pager:{infoId:'pricePagerInfo',pageSizeId:'pricePageSize',buttonsId:'pricePagerBtns'},columns:[{label:'类型',style:'width:66px;padding-left:12px'},{label:'渠道',style:'width:64px'},{label:'名称',style:'width:372px'},{label:'场地类型',style:'width:50px'},{label:'日期类型',style:'width:60px'},{label:'商品类型',style:'width:62px'},{label:'关联业务',style:'width:58px'},{label:'时间段',style:'width:88px'},{label:'时长',style:'width:58px'},{label:'价格',style:'width:54px'},{label:'状态',style:'width:52px'},{label:'操作',className:'tms-sticky-r',style:'width:88px;padding-right:12px;text-align:right'}]}},
    {key:'coachops',toolbar:false,bodyHtml:'<div class="coach-ops-shell"><div class="coach-ops-toolbar"><div class="coach-ops-toolbar-main"><div id="coachOpsWorkloadRangeHost"></div><button class="coach-ops-nav coach-ops-arrow" onclick="shiftCoachOpsDate(-1)" title="上一段">‹</button><div class="coach-date-wrap"><input id="coachOpsWorkloadDate" type="hidden" value=""><button class="coach-date-btn" id="coachOpsWorkloadDateBtn" onclick="toggleCoachOpsPicker(event)" type="button"></button><div class="coach-date-pop" id="coachOpsWorkloadPicker"></div></div><button class="coach-ops-nav coach-ops-arrow" onclick="shiftCoachOpsDate(1)" title="下一段">›</button><button class="coach-ops-nav" onclick="setCoachOpsToday()">今天</button></div></div></div>'+renderStandardTableShellHtml({bodyId:'coachOpsTbody',columns:[{label:'教练',className:'tms-sticky-l',style:'width:120px;padding-left:20px'},{label:'当前筛选课数',style:'width:150px'},{label:'体验课转化率',style:'width:130px'},{label:'课程类型分布',style:'width:220px'},{label:'已反馈',style:'width:90px'},{label:'未反馈',style:'width:90px'},{label:'校区分布',style:'width:180px'},{label:'时间段',style:'width:140px'}]})},
    {key:'matches',toolbar:{search:{id:'matchSearch',oninput:'renderMatches()'},filterHostIds:['matchCampusFilterHost','matchStatusFilterHost'],actionsHtml:'<button class="tms-btn tms-btn-ghost" onclick="loadMatches(true)">刷新</button>'},table:{bodyId:'matchTbody',columns:[{label:'球局',style:'width:220px;padding-left:20px'},{label:'时间',style:'width:150px'},{label:'场地',style:'width:160px'},{label:'人数',style:'width:90px'},{label:'状态',style:'width:100px'},{label:'预计费用',style:'width:120px'},{label:'最终费用',style:'width:120px'},{label:'报名名单',style:'width:240px'},{label:'操作',className:'tms-sticky-r',style:'width:220px;padding-right:20px;text-align:right'}]}},
    {key:'coaches',toolbar:{search:{id:'coachSearch',oninput:'renderCoaches()'},actionsHtml:'<button class="tms-btn tms-btn-primary" onclick="openCoachModal(null)">新增教练</button>'},table:{bodyId:'coachTbody',columns:[{label:'姓名',style:'width:16%;padding-left:20px'},{label:'电话',style:'width:16%'},{label:'校区',style:'width:14%'},{label:'入职时间',style:'width:12%'},{label:'状态',style:'width:10%'},{label:'备注',style:'width:18%'},{label:'操作',className:'tms-sticky-r',style:'width:180px;padding-right:20px;text-align:right'}]}},
    {key:'courts',statsId:'courtStatsRow',toolbar:{search:{id:'courtSearch',oninput:'onCourtFilterChange()'},filterHostIds:['courtAccountTypeFilter','courtOwnerFilter','courtMoreActions'],filterHtmls:['<div class="court-batch-toolbar" id="courtBatchToolbar" style="display:none"><span class="court-batch-count" id="courtBatchCount">已选 0 条</span><button class="tms-btn tms-btn-danger" id="courtBatchDelBtn" onclick="batchDeleteCourts()" disabled>批量删除</button><button class="tms-btn tms-btn-ghost" id="courtBatchCancelBtn" onclick="setCourtBatchMode(false)">取消</button></div>'],actionsHtml:'<span class="tms-export-action" onclick="exportCourtCSV()">导出</span><button class="tms-btn tms-btn-primary" onclick="openCourtModal(null)">添加订场用户</button>'},table:{bodyId:'courtTbody',pager:{infoId:'courtPagerInfo',pageSizeId:'courtPageSize',buttonsId:'courtPagerBtns'},columns:[{className:'tms-sticky-l',style:'width:156px;padding-left:20px',html:'<label class="tms-th-checkbox"><input type="checkbox" class="tms-checkbox" id="courtSelectAll" onchange="toggleCourtPageSelection(this.checked)"><span>姓名</span></label>'},{label:'手机号',style:'width:124px'},{label:'校区',style:'width:100px'},{label:'账户状态',style:'width:96px'},{label:'会员类型',style:'width:100px'},{style:'width:112px',html:'<button class="tms-sort-header" data-court-sort="balance" onclick="setCourtSort(\'balance\')">会员余额<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{style:'width:170px',html:'<button class="tms-sort-header" data-court-sort="lastBookingDate" onclick="setCourtSort(\'lastBookingDate\')">最近订场<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{style:'width:92px',html:'<button class="tms-sort-header" data-court-sort="memberBookingCount" onclick="setCourtSort(\'memberBookingCount\')">会员订场<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{style:'width:92px',html:'<button class="tms-sort-header" data-court-sort="bookingCount" onclick="setCourtSort(\'bookingCount\')">累计订场<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{style:'width:112px',html:'<button class="tms-sort-header" data-court-sort="bookingAmount" onclick="setCourtSort(\'bookingAmount\')">累计消费<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{label:'对接人',style:'width:90px'},{label:'熟悉程序',style:'width:90px'},{label:'储值态度',style:'width:118px'},{label:'备注',style:'width:190px'},{label:'操作',className:'tms-sticky-r',style:'width:188px;padding-right:20px;text-align:right'}]}},
    {key:'memberships',statsId:'membershipStatsRow',toolbar:{search:{id:'membershipSearch',oninput:'onMembershipSearchChange()'},filterHostIds:['membershipTierFilter'],actionsClass:'tms-toolbar-right tms-toolbar-secondary-actions',actionsHtml:'<span class="tms-membership-audit-action tms-membership-audit-action-orders" onclick="goPage(\'membership-orders\')"><span>历史订单</span></span><span class="tms-membership-audit-action tms-membership-audit-action-ledger" onclick="goPage(\'membership-ledger\')"><span>权益消耗记录</span></span>'},table:{bodyId:'membershipTbody',pager:{infoId:'membershipPagerInfo',pageSizeId:'membershipPageSize',buttonsId:'membershipPagerBtns'},columns:[{label:'会员姓名',className:'tms-sticky-l',style:'width:150px;padding-left:20px'},{label:'手机号',style:'width:140px'},{label:'会员类型',style:'width:160px'},{label:'会员状态',style:'width:120px'},{style:'width:150px',html:'<button class="tms-sort-header" data-membership-sort="firstOpenDate" onclick="setMembershipSort(\'firstOpenDate\')">首次开卡时间<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{style:'width:120px',html:'<button class="tms-sort-header" data-membership-sort="balance" onclick="setMembershipSort(\'balance\')">会员余额<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{label:'当前折扣',style:'width:100px'},{style:'width:110px',html:'<button class="tms-sort-header" data-membership-sort="memberBookingCount" onclick="setMembershipSort(\'memberBookingCount\')">会员订场<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{style:'width:110px',html:'<button class="tms-sort-header" data-membership-sort="bookingCount" onclick="setMembershipSort(\'bookingCount\')">累计订场<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{label:'可用权益',style:'width:360px'},{style:'width:150px',html:'<button class="tms-sort-header" data-membership-sort="validUntil" onclick="setMembershipSort(\'validUntil\')">余额有效期<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{label:'清零时间',style:'width:150px'},{label:'操作',className:'tms-sticky-r',style:'width:168px;padding-right:20px;text-align:right'}]}},
    {key:'membership-orders',noteHtml:'此页面仅用于审计与追溯，不用于日常操作。',toolbar:{search:{id:'membershipOrderAuditSearch',oninput:'onMembershipOrderAuditSearchChange()'}},table:{bodyId:'membershipOrdersAuditTbody',pager:{infoId:'membershipOrdersAuditPagerInfo',pageSizeId:'membershipOrdersAuditPageSize',buttonsId:'membershipOrdersAuditPagerBtns'},columns:[{label:'支付日期',style:'padding-left:20px;width:120px'},{label:'录入时间',style:'width:170px'},{label:'订场用户',style:'width:120px'},{label:'会员方案',style:'width:150px'},{label:'系统价',style:'width:100px'},{label:'成交价',style:'width:100px'},{label:'赠送金额',style:'width:110px'},{label:'折扣',style:'width:90px'},{label:'是否重置有效期',style:'width:120px'},{label:'改价原因',style:'width:140px'},{label:'当次权益摘要',style:'width:320px'},{label:'状态',style:'width:100px'}]}},
    {key:'membership-ledger',noteHtml:'此页面仅用于审计与追溯，不用于日常操作。',toolbar:{search:{id:'membershipLedgerAuditSearch',oninput:'onMembershipLedgerAuditSearchChange()'}},table:{bodyId:'membershipLedgerAuditTbody',pager:{infoId:'membershipLedgerAuditPagerInfo',pageSizeId:'membershipLedgerAuditPageSize',buttonsId:'membershipLedgerAuditPagerBtns'},columns:[{label:'时间',style:'padding-left:20px;width:170px'},{label:'订场用户',style:'width:120px'},{label:'购买批次',style:'width:150px'},{label:'权益',style:'width:160px'},{label:'变动',style:'width:90px'},{label:'动作',style:'width:100px'},{label:'操作账号',style:'width:120px'},{label:'原因',style:'width:320px'}]}},
    {key:'membership-plans',toolbar:{search:{id:'membershipPlanSearch',oninput:'renderMembershipPlans()'},actionsHtml:'<button class="tms-btn tms-btn-primary" onclick="openMembershipPlanModal(null)">新增会员方案</button>'},table:{bodyId:'membershipPlanTbody',columns:[{label:'会员方案',className:'tms-sticky-l',style:'width:170px;padding-left:20px'},{label:'档位',style:'width:140px'},{label:'充值金额',style:'width:120px'},{label:'赠送金额',style:'width:120px'},{label:'折扣',style:'width:90px'},{label:'售卖时间',style:'width:180px'},{label:'方案状态',style:'width:120px'},{label:'赠送权益',style:'width:560px'},{label:'备注',style:'width:180px'},{label:'操作',className:'tms-sticky-r',style:'width:168px;padding-right:20px;text-align:right'}]}},
    {key:'products',containerClass:'course-showcase',noteHtml:'课程产品只定义课程模板。后续创建班次、售卖课包，都是基于这里的课程产品。',toolbar:{toolbarClass:'course-showcase-toolbar',filterClass:'course-showcase-filters',search:{id:'prodSearch',oninput:'renderProducts()'},filterHostIds:['prodTypeFilterHost'],actionsHtml:'<button class="tms-btn tms-btn-primary" onclick="openProductModal(null)">新增课程产品</button>'},bodyHtml:'<div class="course-showcase-grid" id="productGrid"></div>'},
    {key:'entitlements',noteHtml:'课包余额是学员当前可用课时余额。排课时实际消耗的是这里，不是直接消耗课程产品。',toolbar:{search:{id:'entSearch',oninput:'renderEntitlements()'},filterHostIds:['entStatusFilterHost']},table:{bodyId:'entitlementTbody',columns:[{label:'学员',style:'width:150px;padding-left:20px'},{label:'课包',style:'width:180px'},{label:'课程类型',style:'width:120px'},{label:'课时余额',style:'width:120px'},{label:'有效期',style:'width:190px'},{label:'时段',style:'width:120px'},{label:'状态',className:'tms-sticky-r',style:'width:110px;padding-right:20px;text-align:right'}]}},
    {key:'mystudents',statsId:'myStudentStats',toolbar:false,noteHtml:'这里查看你当前可见的学员，能区分自己负责的学员、代上过的学员，以及最近上课和课时进度。',table:{bodyId:'myStuTbody',tableClass:'desktop-only',columns:[{label:'学员',style:'width:96px;padding-left:20px'},{label:'校区',style:'width:96px'},{label:'手机号',style:'width:148px'},{label:'类型',style:'width:62px'},{label:'所上班次',style:'width:108px'},{label:'负责教练',style:'width:96px'},{label:'归属教练',style:'width:96px'},{label:'累计上课',style:'width:72px'},{label:'最后上课',style:'width:140px'},{label:'课包进度',style:'width:84px'},{label:'剩余课时',style:'width:84px'},{label:'备注'},{label:'操作',style:'width:72px;padding-right:20px;text-align:right'}]},afterHtml:'<div id="myStudentMobileList" class="coach-mobile-only coach-mobile-list"></div>'},
    {key:'myclasses',statsId:'myClassStats',toolbar:false,noteHtml:'这里查看你当前负责的班次，可快速了解学员名单、课时进度和班次时间。',table:{bodyId:'myClsTbody',tableClass:'desktop-only',columns:[{label:'班次名称',style:'width:108px;padding-left:20px'},{label:'课程',style:'width:100px'},{label:'学员',style:'width:108px'},{label:'课时进度',style:'width:100px'},{label:'日期',style:'width:116px'},{label:'状态',style:'width:68px'},{label:'操作',style:'width:72px;padding-right:20px;text-align:right'}]},afterHtml:'<div id="myClassMobileList" class="coach-mobile-only coach-mobile-list"></div>'},
    {key:'campusmgr',toolbar:{search:{id:'campusSearch',oninput:'renderCampuses()'},actionsHtml:'<button class="tms-btn tms-btn-primary" onclick="openCampusModal(null)">新增校区</button>'},table:{bodyId:'campusTbody',columns:[{label:'校区名称',style:'width:30%;padding-left:20px'},{label:'校区代码',style:'width:20%'},{label:'启用场地',style:'width:18%'},{label:'创建时间',style:'width:18%'},{label:'操作',className:'tms-sticky-r',style:'width:132px;padding-right:20px;text-align:right'}]}},
    {key:'finance-ledger',hostId:'financeLedgerReady',statsId:'financeOverviewPrimaryStats',statsClass:'tms-stats-row finance-ledger-stats',extraStatsIds:['financeOverviewSecondaryStats'],toolbar:{search:{id:'financeLedgerSearch',placeholder:'搜索姓名、手机号',oninput:'resetFinanceLedgerPage();renderFinanceLedger()'},filterHostIds:['financeLedgerTransactionTypeFilterHost','financeLedgerBusinessTypeFilterHost','financeLedgerPayMethodFilterHost']},table:{bodyId:'financeLedgerTbody',pager:{infoId:'financeLedgerPagerInfo',pageSizeId:'financeLedgerPageSize',buttonsId:'financeLedgerPagerBtns'},columns:[{label:'交易时间',style:'width:180px;padding-left:20px'},{label:'姓名',style:'width:120px'},{label:'交易类型',style:'width:100px'},{label:'交易金额',style:'width:120px'},{label:'业务类型',style:'width:180px'},{label:'支付方式',style:'width:120px'},{label:'校区',style:'width:100px'},{label:'操作人',style:'width:140px'},{label:'备注',style:'width:260px'}]}},
    {key:'finance-revenue',hostId:'financeRevenuePanel',statsId:'coachOpsRevenueStats',statsClass:'tms-stats-row finance-ledger-stats',toolbar:{toolbarClass:'tms-toolbar finance-table-toolbar finance-revenue-toolbar',search:{id:'coachOpsRevenueSearch',placeholder:'搜索姓名、手机号',oninput:'resetFinanceRevenuePage();renderFinanceRevenueReport()'},filterHostIds:['financeRevenueTypeFilterHost','financeRevenuePayMethodFilterHost'],actionsHtml:'<span class="tms-export-action" onclick="exportCoachOpsRevenueCsv()">导出</span>'},table:{bodyId:'financeRevenueTbody',pager:{infoId:'financeRevenuePagerInfo',pageSizeId:'financeRevenuePageSize',buttonsId:'financeRevenuePagerBtns'},columns:[{label:'交易时间',style:'width:180px;padding-left:20px'},{label:'姓名',style:'width:120px'},{label:'业务类型',style:'width:150px'},{label:'支付方式',style:'width:110px'},{label:'应收',style:'width:90px'},{label:'实收',style:'width:90px'},{label:'差价',style:'width:90px'},{label:'差价说明',style:'width:150px'},{label:'校区',style:'width:100px'},{label:'操作人',style:'width:140px'},{label:'备注',style:'width:260px'}]}},
    {key:'finance-recognized',hostId:'financeRecognizedPanel',statsId:'coachOpsConsumeStats',statsClass:'tms-stats-row finance-ledger-stats',toolbar:{toolbarClass:'tms-toolbar finance-table-toolbar',search:{id:'coachOpsConsumeSearch',placeholder:'搜索姓名、手机号',oninput:'resetFinanceRecognizedPage();renderFinanceConsumeReport()'},actionsHtml:'<span class="tms-export-action" onclick="exportCoachOpsConsumeCsv()">导出</span>'},table:{bodyId:'financeConsumeTbody',pager:{infoId:'financeRecognizedPagerInfo',pageSizeId:'financeRecognizedPageSize',buttonsId:'financeRecognizedPagerBtns'},columns:[{label:'交易时间',style:'width:180px;padding-left:20px'},{label:'姓名',style:'width:120px'},{label:'业务类型',style:'width:150px'},{label:'支付方式',style:'width:110px'},{label:'扣减标的',style:'width:150px'},{label:'确认收入',style:'width:100px'},{label:'校区',style:'width:100px'},{label:'操作人',style:'width:140px'},{label:'备注',style:'width:260px'}]}}
  ];
}
function mountStandardListShells(){
  standardListPageShellConfigs().forEach(config=>{
    const host=document.getElementById(config.hostId||('page-'+config.key));
    if(!host||host.dataset.standardListShell!==config.key||host.dataset.standardListMounted==='1')return;
    host.innerHTML=renderStandardListPageShellHtml(config);
    host.dataset.standardListMounted='1';
  });
}
Object.assign(window,{
  standardTopChevronIcon,
  standardTopLocationIcon,
  standardTopTimeIcon,
  standardTopCoachIcon,
  renderStandardTopDropdown,
  closeStandardTopDropdowns,
  toggleStandardTopDropdown,
  renderStandardEmptyText,
  standardBusinessTagClass,
  renderStandardBusinessTag,
  renderStandardTooltipText,
  renderStandardCellText,
  renderStandardDropdownHtml,
  closeStandardDropdowns,
  toggleStandardDropdown,
  selectStandardDropdownItem,
  setStandardDropdownValue,
  renderStandardPaginationButtonsHtml,
  standardListFirstPage,
  standardListPageSize,
  standardListPagination,
  standardListSlice,
  renderStandardSearchHtml,
  renderStandardToolbarHtml,
  renderStandardStatsShellHtml,
  renderStandardStatsShellsHtml,
  renderStandardTableShellHtml,
  renderStandardListPagerShellHtml,
  renderStandardListStateHtml,
  renderStandardListPageShellHtml,
  standardPageSkeletonConfigs,
  standardPageSkeletonConfigForPage,
  renderStandardPageLoading,
  standardListPageShellConfigs,
  mountStandardListShells
});
document.documentElement.dataset.standardComponents='loaded';
document.addEventListener('click',closeStandardDropdowns);
document.addEventListener('click',closeStandardTopDropdowns);
