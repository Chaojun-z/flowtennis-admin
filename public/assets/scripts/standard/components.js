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
function renderStandardSearchHtml({id='',placeholder='搜索姓名、手机号',oninput=''}={}){
  return `<div class="tms-search-wrapper"><span class="tms-search-icon" aria-hidden="true"></span><input type="text" class="tms-search-input" id="${esc(id)}" placeholder="${esc(placeholder)}"${oninput?` oninput="${esc(oninput)}"`:''}></div>`;
}
function renderStandardToolbarHtml({search=null,filterHostIds=[],actionsHtml='',leftHtml='',toolbarClass='tms-toolbar',filterClass='tms-filters',actionsClass='tms-toolbar-right'}={}){
  const filters=[search?renderStandardSearchHtml(search):'',...(filterHostIds||[]).map(id=>`<div id="${esc(id)}"></div>`)].join('');
  const filterHtml=`<div class="${esc(filterClass)}">${filters}</div>`;
  const main=leftHtml?`<div class="tms-toolbar-left">${leftHtml}${filterHtml}</div>`:filterHtml;
  return `<div class="${esc(toolbarClass)}">${main}${actionsHtml?`<div class="${esc(actionsClass)}">${actionsHtml}</div>`:''}</div>`;
}
function renderStandardStatsShellHtml(id){
  return id?`<div class="tms-stats-row" id="${esc(id)}"></div>`:'';
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
  const stats=renderStandardStatsShellHtml(config.statsId);
  const toolbar=renderStandardToolbarHtml(config.toolbar||{});
  const note=config.noteHtml?`<div class="tms-audit-note">${config.noteHtml}</div>`:'';
  const body=config.bodyHtml||renderStandardTableShellHtml(config.table||{});
  const pager=config.bodyHtml&&config.pager?renderStandardListPagerShellHtml(config.pager):'';
  const content=[stats,toolbar,note,body,pager].filter(Boolean).join('');
  return config.containerClass?`<div class="${esc(config.containerClass)}">${content}</div>`:content;
}
function standardListPageShellConfigs(){
  return [
    {key:'leads',statsId:'leadStatsRow',toolbar:{search:{id:'leadSearch',oninput:'applyLeadSearch()'},filterHostIds:['leadSourceFilterHost','leadConsultFilterHost','leadStatusFilterHost','leadConvertedFilterHost','leadOwnerFilterHost'],actionsHtml:'<span class="tms-import-action" onclick="openLeadImportPreviewModal()">导入</span><button class="tms-btn tms-btn-primary" onclick="openLeadModal(null)">新增线索</button>'},table:{bodyId:'leadTbody',pager:{infoId:'leadPagerInfo',pageSizeId:'leadPageSize',buttonsId:'leadPagerBtns'},columns:[{label:'微信名',className:'tms-sticky-l',style:'width:130px;padding-left:20px'},{label:'水平',style:'width:80px'},{style:'width:120px',html:'<button class="tms-sort-header" data-lead-sort="leadDate" onclick="cycleLeadSort(\'leadDate\')">线索时间<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{label:'线索渠道',style:'width:110px'},{label:'基本信息',style:'width:220px'},{label:'咨询需求',style:'width:220px'},{label:'跟进人',style:'width:100px'},{label:'跟进状态',style:'width:130px'},{style:'width:220px',html:'<button class="tms-sort-header" data-lead-sort="trialLessonAt" onclick="cycleLeadSort(\'trialLessonAt\')">体验课时间<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{label:'是否转化',style:'width:90px'},{label:'转化教练',style:'width:110px'},{label:'未转化原因',style:'width:170px'},{label:'操作',className:'tms-sticky-r',style:'width:150px;padding-right:20px;text-align:right'}]}},
    {key:'students',statsId:'studentStatsRow',toolbar:{search:{id:'stuSearch',oninput:'onStudentFilterChange()'},filterHostIds:['stuTypeFilterHost','stuSourceFilterHost','stuCoachFilterHost'],actionsHtml:'<span class="tms-export-action" onclick="exportStudentCSV()">导出</span><button class="tms-btn tms-btn-primary" onclick="openStudentModal(null)">添加学员</button>'},table:{bodyId:'stuTbody',pager:{infoId:'stuPagerInfo',pageSizeId:'stuPageSize',buttonsId:'stuPagerBtns'},columns:[{label:'学员',className:'tms-sticky-l',style:'width:150px;padding-left:20px'},{label:'电话',style:'width:94px'},{label:'类型',style:'width:58px'},{label:'校区',style:'width:105px'},{style:'width:140px',html:'<button class="tms-sort-header" data-student-sort="lastLesson" onclick="cycleStudentSort(\'lastLesson\')">最近上课<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{style:'width:100px',html:'<button class="tms-sort-header" data-student-sort="completedLessons" onclick="cycleStudentSort(\'completedLessons\')">累计上课<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{label:'负责教练',style:'width:110px'},{style:'width:90px',html:'<button class="tms-sort-header" data-student-sort="packageLessons" onclick="cycleStudentSort(\'packageLessons\')">课时/课包<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>'},{label:'来源',style:'width:90px'},{label:'备注',style:'width:180px'},{label:'操作',className:'tms-sticky-r',style:'width:150px;padding-right:20px;text-align:right'}]}},
    {key:'schedule',toolbar:{search:{id:'schSearch',oninput:'onScheduleFilterChange()'},filterHostIds:['schStatusFilterHost','schCoachFilterHost','schCourseTypeFilterHost'],actionsHtml:'<button class="tms-btn tms-btn-primary" onclick="openScheduleModal(null)">添加排课</button>'},table:{bodyId:'schTbody',pager:{infoId:'schPagerInfo',pageSizeId:'schPageSize',buttonsId:'schPagerBtns',pageSizeTag:'span'},columns:[{label:'日期',className:'tms-sticky-l',style:'width:84px;padding-left:14px'},{label:'上课时间',style:'width:92px'},{label:'时长',style:'width:52px'},{label:'校区/场地',style:'width:125px'},{label:'教练',style:'width:68px'},{label:'学员',style:'width:120px'},{label:'课程类型',style:'width:64px'},{label:'重复?',style:'width:64px'},{label:'反馈',style:'width:52px'},{label:'状态',style:'width:68px'},{label:'操作',className:'tms-sticky-r',style:'width:118px;padding-right:10px;text-align:right'}]}},
    {key:'admin-users',toolbar:{search:{id:'adminUserSearch',oninput:'onAdminUserFilterChange()'},actionsHtml:'<button class="tms-btn tms-btn-primary" onclick="openAdminUserModal(null)">新增账号</button>'},table:{bodyId:'adminUserTbody',pager:{infoId:'adminUserPagerInfo',pageSizeId:'adminUserPageSize',buttonsId:'adminUserPagerBtns'},columns:[{label:'账号名',className:'tms-sticky-l',style:'width:130px;padding-left:20px'},{label:'姓名',style:'width:100px'},{label:'手机号',style:'width:112px'},{label:'角色',style:'width:90px'},{label:'绑定教练',style:'width:100px'},{label:'微信绑定',style:'width:130px'},{label:'服务号绑定',style:'width:130px'},{label:'状态',style:'width:82px'},{label:'权限说明',style:'width:180px'},{label:'操作',className:'tms-sticky-r',style:'width:300px;padding-right:20px;text-align:right'}]}},
    {key:'packages',containerClass:'course-package-showcase',toolbar:{toolbarClass:'course-package-showcase-toolbar',filterClass:'course-package-showcase-filters',actionsClass:'course-package-showcase-actions',search:{id:'pkgSearch',oninput:'onPackageFilterChange()'},filterHostIds:['pkgTypeFilterHost','pkgAudienceFilterHost','pkgCoachFilterHost','pkgStatusFilterHost','pkgTimeBandFilterHost'],actionsHtml:'<button class="tms-btn tms-btn-ghost" onclick="openPackageMergeModal()">合并课包</button><button class="tms-btn tms-btn-primary" onclick="openPackageModal(null)">创建课包</button>'},bodyHtml:'<div class="course-package-showcase-grid" id="packageGrid"></div>',pager:{infoId:'pkgPagerInfo',pageSizeId:'pkgPageSize',buttonsId:'pkgPagerBtns'}},
    {key:'purchases',toolbar:{leftHtml:'<button class="tms-btn tms-btn-ghost" onclick="goPage(\'packages\')">课包售卖</button>',search:{id:'purSearch',oninput:'onPurchaseFilterChange()'},filterHostIds:['purPackageFilterHost'],actionsHtml:'<button class="tms-btn tms-btn-primary" onclick="openPurchaseEntryModal()">课包购买</button>'},table:{bodyId:'purchaseTbody',pager:{infoId:'purPagerInfo',pageSizeId:'purPageSize',buttonsId:'purPagerBtns'},columns:[{label:'支付日期',style:'width:100px;padding-left:20px'},{label:'学员',style:'width:80px'},{label:'课包',style:'width:110px'},{label:'实收',style:'width:90px'},{label:'余额',style:'width:105px'},{label:'状态',style:'width:80px'},{label:'归属教练',style:'width:95px'},{label:'支付方式',style:'width:90px'},{label:'操作',className:'tms-sticky-r',style:'width:120px;padding-right:20px;text-align:right'}]}},
    {key:'prices',noteHtml:'价格在这里统一维护。订场和渠道核销会自动引用价格，并在流水里保存当时的价格快照。',toolbar:{search:{id:'priceSearch',oninput:'onPriceFilterChange()'},filterHostIds:['priceTypeFilterHost','priceProductTypeFilterHost'],actionsHtml:'<button class="tms-btn tms-btn-primary" onclick="openPriceModal()">新增价格</button>'},table:{bodyId:'priceTbody',tableClass:'price-table',pager:{infoId:'pricePagerInfo',pageSizeId:'pricePageSize',buttonsId:'pricePagerBtns'},columns:[{label:'类型',style:'width:66px;padding-left:12px'},{label:'渠道',style:'width:64px'},{label:'名称',style:'width:372px'},{label:'场地类型',style:'width:50px'},{label:'日期类型',style:'width:60px'},{label:'商品类型',style:'width:62px'},{label:'关联业务',style:'width:58px'},{label:'时间段',style:'width:88px'},{label:'时长',style:'width:58px'},{label:'价格',style:'width:54px'},{label:'状态',style:'width:52px'},{label:'操作',className:'tms-sticky-r',style:'width:88px;padding-right:12px;text-align:right'}]}}
  ];
}
function mountStandardListShells(){
  standardListPageShellConfigs().forEach(config=>{
    const host=document.getElementById('page-'+config.key);
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
  renderStandardTableShellHtml,
  renderStandardListPagerShellHtml,
  renderStandardListStateHtml,
  renderStandardListPageShellHtml,
  standardListPageShellConfigs,
  mountStandardListShells
});
document.documentElement.dataset.standardComponents='loaded';
document.addEventListener('click',closeStandardDropdowns);
document.addEventListener('click',closeStandardTopDropdowns);
