function syncPackageFilterOptions(){
  const typeValue=document.getElementById('pkgTypeFilter')?.value||'';
  const audienceValue=document.getElementById('pkgAudienceFilter')?.value||'';
  const coachValue=document.getElementById('pkgCoachFilter')?.value||'';
  const statusValue=document.getElementById('pkgStatusFilter')?.value||'';
  const timeBandValue=document.getElementById('pkgTimeBandFilter')?.value||'';
  const baseRows=packageFilterBaseRows();
  const typeOptions=withStandardFilterCounts([{value:'',label:'全部',emptyDisplay:'类型'},...PRODUCT_TYPES.map(t=>({value:t,label:t}))],baseRows,packageMatchesCourseType);
  const audienceOptions=withStandardFilterCounts([{value:'',label:'全部',emptyDisplay:'学员类型'},{value:'成人',label:'成人'},{value:'青少年',label:'青少年'}],baseRows,packageMatchesAudience);
  const coachNames=[...new Set([...activeCoachNames(),...packages.flatMap(p=>[p.ownerCoach,...parseArr(p.coachNames||p.coachIds)]).map(coachName).filter(Boolean)])];
  const coachOptions=withStandardFilterCounts([{value:'',label:'全部',emptyDisplay:'教练'},...coachNames.map(name=>({value:name,label:name}))],baseRows,packageMatchesCoach);
  const statusOptions=withStandardFilterCounts([{value:'',label:'全部',emptyDisplay:'状态'},{value:'active',label:'售卖中'},{value:'inactive',label:'已停售'}],baseRows,packageMatchesStatus);
  const timeBandOptions=withStandardFilterCounts([{value:'',label:'全部',emptyDisplay:'时段'},{value:'全天',label:'全天'},{value:'黄金时段',label:'黄金'},{value:'非黄金时段',label:'非黄金'}],baseRows,packageMatchesTimeBand);
  const wrapMap=[
    ['pkgTypeFilterHost','pkgTypeFilter','类型',typeOptions,typeValue],
    ['pkgAudienceFilterHost','pkgAudienceFilter','学员类型',audienceOptions,audienceValue],
    ['pkgCoachFilterHost','pkgCoachFilter','教练',coachOptions,coachValue],
    ['pkgStatusFilterHost','pkgStatusFilter','状态',statusOptions,statusValue],
    ['pkgTimeBandFilterHost','pkgTimeBandFilter','时段',timeBandOptions,timeBandValue]
  ];
  wrapMap.forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=renderCourtDropdownHtml(id,label,options,value,false,'renderPackages');
  });
}
function packageDisplayTitle(p){
  const lessons=parseInt(p.lessons||p.packageLessons||p.totalLessons)||0;
  return [packageCoreClassLabel(p),lessons?`${lessons}课时`:'',packageTimeBandShortLabel(p.timeBand||p.packageTimeBand||'全天')].filter(Boolean).join(' · ')||p.name||'课包';
}
function renderPackageTopFilters(){
  if(typeof renderCourtTopDropdown!=='function'||typeof courtTopLocationIcon!=='function')return '';
  const campusSource=Array.isArray(campuses)?campuses:[];
  const campusOpts=[{value:'all',label:'全部校区'}].concat(campusSource.map(row=>({
    value:String(row?.code||row?.id||'').trim(),
    label:String(row?.name||row?.code||row?.id||'').trim()
  })).filter(opt=>opt.value&&opt.label));
  const campusMenu=campusOpts.map(opt=>`<div class="tms-dropdown-item ${campus===opt.value?'active':''}" data-value="${esc(opt.value)}" onclick="selectPackageTopCampus(${jsArg(opt.value)},event)">${esc(opt.label)}</div>`).join('');
  return `<div class="court-top-filterbar"><div class="court-top-filter-item">${renderCourtTopDropdown('packageTopCampus',campusOpts.find(opt=>opt.value===campus)?.label||'全部校区',courtTopLocationIcon(),campusMenu,'court-top-campus-menu')}</div></div>`;
}
function refreshPackageTopFilters(){
  const host=document.getElementById('campusTabs');
  if(host&&currentPage==='packages')host.innerHTML=renderPackageTopFilters();
}
function selectPackageTopCampus(value,event){
  if(event)event.stopPropagation();
  campus=value||'all';
  localStorage.setItem(CAMPUS_KEY,campus);
  refreshPackageTopFilters();
  renderPackages();
  closeCourtTopDropdowns();
}
function packageListStatusValue(p){
  const status=String(p.status||'active');
  if(status==='inactive'||status==='已停售'||status==='history')return'inactive';
  if(status==='merged')return'merged';
  return'active';
}
function packageListTitle(p){
  return packageCoreClassLabel(p)||p.name||'课包';
}
function packageListSubtitle(p){
  const lessons=parseInt(p.lessons||p.packageLessons||p.totalLessons)||0;
  return [packageAudienceLabelFromText([p.audience,p.type,p.productName,p.name,p.packageName,p.notes]),lessons?`${lessons}课时`:'' ].filter(Boolean).join(' · ');
}
function packageDisplayShortId(p){
  const raw=String(p?.id||'');
  if(!raw)return '-';
  let hash=0;
  for(let i=0;i<raw.length;i++)hash=(hash*31+raw.charCodeAt(i))>>>0;
  return String(hash%100000000).padStart(8,'0');
}
function packageCreatedDate(p){
  return String(p.createdAt||'').slice(0,10)||'-';
}
function packageSortValue(p){
  const n=Number(p?.sortOrder);
  return Number.isFinite(n)&&n>0?n:999999999;
}
let packageDragId='';
let packageColumnDragKey='';
const PACKAGE_BOARD_COLUMN_ORDER_KEY='flowtennis.packageBoardColumnOrder.v1';
const PACKAGE_COLUMN_DND_TYPE='application/x-flowtennis-package-column';
const PACKAGE_BOARD_COLUMNS=[
  {key:'青少年-私教课',title:'青少年 · 私教课'},
  {key:'青少年-小班课',title:'青少年 · 小班课'},
  {key:'成人-私教课',title:'成人 · 私教课'},
  {key:'成人-小班课',title:'成人 · 小班课'},
  {key:'chaojun',title:'朝珺'}
];
function packageValidBoardColumnKey(value){
  const key=String(value||'').trim();
  if(PACKAGE_BOARD_COLUMNS.some(col=>col.key===key)||key==='other')return key;
  return '';
}
function packageIsChaojunOwned(p={}){
  const names=[p.ownerCoach,...parseArr(p.coachNames||p.coachIds)].map(coachName).filter(Boolean);
  return names.includes('朝珺');
}
function packageBoardColumnKey(p={}){
  if(packageIsChaojunOwned(p))return'chaojun';
  const audience=packageAudienceLabelFromText([p.audience,p.type,p.productName,p.name,p.packageName,p.notes]);
  const baseType=normalizeCourseType(p.courseType||p.type);
  let courseGroup=baseType;
  if(baseType==='体验课'){
    const experienceType=packageExperienceTypeLabel(p)||'私教体验课';
    courseGroup=experienceType==='小班体验课'?'小班课':'私教课';
  }
  if((audience==='青少年'||audience==='成人')&&(courseGroup==='私教课'||courseGroup==='小班课'))return `${audience}-${courseGroup}`;
  return 'other';
}
function packageBaseBoardColumns(rows=[]){
  const columns=PACKAGE_BOARD_COLUMNS;
  return rows.some(p=>packageBoardColumnKey(p)==='other')?[...columns,{key:'other',title:'其他'}]:columns;
}
function packageSavedBoardColumnOrder(columns=[]){
  const valid=new Set(columns.map(col=>col.key));
  try{
    const raw=JSON.parse(localStorage.getItem(PACKAGE_BOARD_COLUMN_ORDER_KEY)||'[]');
    return Array.isArray(raw)?raw.map(packageValidBoardColumnKey).filter(key=>key&&valid.has(key)):[];
  }catch(e){
    return [];
  }
}
function packageBoardColumns(rows=[]){
  const columns=packageBaseBoardColumns(rows);
  const saved=packageSavedBoardColumnOrder(columns);
  if(!saved.length)return columns;
  const byKey=new Map(columns.map(col=>[col.key,col]));
  return [...saved.map(key=>byKey.get(key)).filter(Boolean),...columns.filter(col=>!saved.includes(col.key))];
}
function packageFilterBaseRows(){
  return packages.filter(p=>{
    const statusValue=packageListStatusValue(p);
    const campusIds=parseArr(p.campusIds);
    if(statusValue==='merged')return false;
    if(campus&&campus!=='all'&&campusIds.length&&!campusIds.includes(campus))return false;
    return true;
  });
}
function packageMatchesCourseType(p,value){return normalizeCourseType(p.courseType)===value;}
function packageMatchesAudience(p,value){return packageAudienceLabelFromText([p.audience,p.type,p.productName,p.name,p.packageName,p.notes])===value;}
function packageMatchesCoach(p,value){
  const names=parseArr(p.coachNames||p.coachIds).map(coachName);
  return coachName(p.ownerCoach)===value||names.includes(value);
}
function packageMatchesStatus(p,value){return packageListStatusValue(p)===value;}
function packageMatchesTimeBand(p,value){return String(p.timeBand||'全天')===value;}
function packageStatusBadge(p){
  const status=packageListStatusValue(p);
  return status==='inactive'||status==='merged'
    ?'<span class="package-status-badge is-off">已停售</span>'
    :'<span class="package-status-badge is-on">售卖中</span>';
}
function packageRuleIcon(kind){
  if(kind==='campus')return'<svg class="package-rule-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
  if(kind==='time')return'<svg class="package-rule-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  return'<svg class="package-rule-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
}
function packageCoachSummary(p){
  const ownerCoach=coachName(p.ownerCoach);
  const coaches=parseArr(p.coachNames||p.coachIds).map(coachName).filter(Boolean);
  if(ownerCoach&&coaches.length>1)return `归属：${ownerCoach}（+${coaches.length-1}）`;
  if(ownerCoach)return `归属：${ownerCoach}`;
  if(coaches.length)return `${coaches.length} 位可用`;
  return '未分配';
}
function packageCoachDetail(p){
  const ownerCoach=coachName(p.ownerCoach);
  const coaches=parseArr(p.coachNames||p.coachIds).map(coachName).filter(Boolean);
  return [ownerCoach?`归属：${ownerCoach}`:'',coaches.length?`可用：${coaches.join('、')}`:''].filter(Boolean).join('\n')||'未分配';
}
function packageCampusSummaryText(ids){
  const names=parseArr(ids).map(id=>cn(id)).filter(Boolean);
  if(!names.length)return'不限校区';
  return names.length===1?names[0]:`${names[0]} 等 ${names.length} 个校区`;
}
function packageCampusTitle(ids){
  return parseArr(ids).map(id=>cn(id)).filter(Boolean).join('、')||'不限校区';
}
function packageTimeBandBadgeClass(timeBand='全天'){
  const label=packageTimeBandShortLabel(timeBand||'全天');
  if(label==='黄金')return'is-prime';
  if(label==='非黄金')return'is-offpeak';
  return'is-all';
}
function packageTimeBandBadgeHtml(p={}){
  const label=packageTimeBandShortLabel(p.timeBand||p.packageTimeBand||'全天');
  const crown=label==='黄金'?'<span class="package-time-band-crown" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 18h14l1-10-5 4-3-6-3 6-5-4 1 10Zm0 2h14v2H5v-2Z"/></svg></span>':'';
  return `<span class="package-time-band-badge ${packageTimeBandBadgeClass(label)}">${crown}${esc(label)}</span>`;
}
function showPackageRuleTooltip(event){
  const source=event.currentTarget?.querySelector?.('.package-rule-tooltip');
  const text=(source?.textContent||'').trim();
  if(!text)return;
  let tip=document.getElementById('packageRuleTooltipFloat');
  if(!tip){
    tip=document.createElement('div');
    tip.id='packageRuleTooltipFloat';
    tip.className='package-rule-tooltip-float';
    document.body.appendChild(tip);
  }
  tip.textContent=text;
  tip.style.visibility='hidden';
  tip.classList.add('show');
  const rect=event.currentTarget.getBoundingClientRect();
  const tipRect=tip.getBoundingClientRect();
  const left=Math.max(8,Math.min(window.innerWidth-tipRect.width-8,rect.right-tipRect.width));
  const top=Math.max(8,rect.top-tipRect.height-8);
  tip.style.left=`${left}px`;
  tip.style.top=`${top}px`;
  tip.style.visibility='visible';
}
function hidePackageRuleTooltip(){
  const tip=document.getElementById('packageRuleTooltipFloat');
  if(tip)tip.classList.remove('show');
}
function packageBoardCardHtml(p){
  const windows=parseArr(p.dailyTimeWindows).map(packageTimeWindowText).filter(Boolean).join('、');
  const campusTitle=packageCampusTitle(p.campusIds);
  const coachTitle=packageCoachDetail(p);
  const title=packageListTitle(p);
  const subtitle=packageListSubtitle(p);
  const inactive=packageListStatusValue(p)==='inactive';
  return `<div class="package-card-shell ${inactive?'is-inactive':''}" draggable="true" onDragStart="startPackageDrag(event,'${p.id}')" ondragover="allowPackageDrop(event,'${p.id}')" ondrop="dropPackageCard(event,'${p.id}')" ondragend="endPackageDrag()"><div class="showcase-card-body package-sales-card-body"><div class="showcase-card-header package-sales-header"><div class="showcase-card-title-group"><div class="package-sales-title-row"><div class="showcase-card-title package-sales-title">${esc(title)}</div>${packageTimeBandBadgeHtml(p)}</div>${subtitle?`<div class="showcase-card-meta package-sales-subtitle">${esc(subtitle)}</div>`:''}</div>${packageStatusBadge(p)}</div><div class="package-sales-core"><div class="package-sales-price"><span class="package-sales-currency">¥</span><span class="package-sales-amount">${fmt(p.price)}</span></div><div class="package-sales-rules"><div class="package-rule-line" onmouseenter="showPackageRuleTooltip(event)" onmouseleave="hidePackageRuleTooltip()"><span>${esc(packageCampusSummaryText(p.campusIds))}</span>${packageRuleIcon('campus')}<div class="package-rule-tooltip">${esc(campusTitle)}</div></div><div class="package-rule-line" onmouseenter="showPackageRuleTooltip(event)" onmouseleave="hidePackageRuleTooltip()"><span>${esc(packageCoachSummary(p))}</span>${packageRuleIcon('coach')}<div class="package-rule-tooltip">${esc(coachTitle)}</div></div></div></div></div><div class="showcase-card-footer package-sales-footer"><div class="package-card-meta"><span class="package-meta-token">${esc(packageCreatedDate(p))}</span><span class="package-meta-dot"></span><button class="package-order-link" type="button" onclick="focusPurchaseByPackage('${p.id}')">${packagePurchaseCount(p.id)} 笔订单<span class="package-order-chevron">›</span></button></div><div class="showcase-card-actions"><button class="showcase-action-btn" onclick="openPackageModal('${p.id}')">编辑</button><button class="showcase-action-btn is-danger package-off-btn" onclick="deactivatePackage('${p.id}')">下架</button></div></div></div>`;
}
function renderPackages(){
  syncPackageFilterOptions();
  const q=(document.getElementById('pkgSearch')?.value||'').toLowerCase();
  const tf=document.getElementById('pkgTypeFilter')?.value||'';
  const af=document.getElementById('pkgAudienceFilter')?.value||'';
  const cf=document.getElementById('pkgCoachFilter')?.value||'';
  const sf=document.getElementById('pkgStatusFilter')?.value||'';
  const bf=document.getElementById('pkgTimeBandFilter')?.value||'';
  const list=packages.filter(p=>{
    const courseType=normalizeCourseType(p.courseType);
    const campusIds=parseArr(p.campusIds);
    const coachNames=parseArr(p.coachNames||p.coachIds).map(coachName);
    const statusValue=packageListStatusValue(p);
    if(statusValue==='merged')return false;
    if(!searchHit(q,p.name,packageDisplayTitle(p),courseType,p.price,p.lessons,p.timeBand,p.notes,p.productName,p.ownerCoach))return false;
    if(tf&&courseType!==tf)return false;
    if(af&&packageAudienceLabelFromText([p.audience,p.type,p.productName,p.name,p.packageName,p.notes])!==af)return false;
    if(cf&&coachName(p.ownerCoach)!==cf&&!coachNames.includes(cf))return false;
    if(sf&&statusValue!==sf)return false;
    if(bf&&String(p.timeBand||'全天')!==bf)return false;
    if(campus&&campus!=='all'&&campusIds.length&&!campusIds.includes(campus))return false;
    return true;
  }).sort((a,b)=>{
    const orderDiff=packageSortValue(a)-packageSortValue(b);
    return orderDiff||String(b.createdAt||'').localeCompare(String(a.createdAt||''));
  });
  const host=document.getElementById('packageGrid');
  if(!list.length){
    host.innerHTML=`<div class="course-package-showcase-empty"><div style="font-size:18px;font-weight:800;color:var(--cream-pale)">暂无售卖课包</div><div style="margin-top:8px;font-size:13px;line-height:1.7">点击创建即可直接配置课程类型、归属教练和可上课教练。</div><button class="tms-btn tms-btn-primary" onclick="openPackageModal(null)">创建课包</button></div>`;
    return;
  }
  const groups=new Map();
  list.forEach(p=>{
    const key=packageBoardColumnKey(p);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(p);
  });
  host.innerHTML=packageBoardColumns(list).map(col=>{
    const rows=groups.get(col.key)||[];
    return `<div class="package-board-column" data-package-column="${esc(col.key)}" draggable="true" ondragstart="startPackageColumnDrag(event,'${esc(col.key)}')" ondragover="allowPackageColumnDrop(event)" ondrop="dropPackageColumn(event,'${esc(col.key)}')" ondragend="endPackageColumnDrag()"><div class="package-board-header"><div class="package-board-title">${esc(col.title)}</div><div class="package-board-count">${rows.length}</div></div><div class="package-board-stack">${rows.length?rows.map(packageBoardCardHtml).join(''):'<div class="package-board-empty">暂无课包</div>'}</div></div>`;
  }).join('');
}
function packageOrderedRows(columnKey=''){
  return packages.filter(p=>packageListStatusValue(p)!=='merged'&&(!columnKey||packageBoardColumnKey(p)===columnKey)).sort((a,b)=>{
    const orderDiff=packageSortValue(a)-packageSortValue(b);
    return orderDiff||String(b.createdAt||'').localeCompare(String(a.createdAt||''));
  });
}
function startPackageDrag(event,id){
  packageDragId=id;
  event.stopPropagation();
  event.currentTarget?.classList.add('is-dragging');
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData('text/plain',id);
}
function isPackageColumnDragEvent(event){
  const types=Array.from(event?.dataTransfer?.types||[]);
  return !!packageColumnDragKey||types.includes(PACKAGE_COLUMN_DND_TYPE);
}
function allowPackageDrop(event){
  if(isPackageColumnDragEvent(event))return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget?.classList.add('is-drag-over');
}
function endPackageDrag(){
  packageDragId='';
  document.querySelectorAll('.package-card-shell.is-dragging,.package-card-shell.is-drag-over,.package-board-stack.is-drag-over').forEach(el=>el.classList.remove('is-dragging','is-drag-over'));
}
function startPackageColumnDrag(event,key){
  packageColumnDragKey=packageValidBoardColumnKey(key);
  event.currentTarget?.classList.add('is-column-dragging');
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData(PACKAGE_COLUMN_DND_TYPE,packageColumnDragKey);
  event.dataTransfer.setData('text/plain',`column:${packageColumnDragKey}`);
}
function allowPackageColumnDrop(event){
  if(!isPackageColumnDragEvent(event))return;
  event.preventDefault();
  event.currentTarget?.classList.add('is-column-drag-over');
}
function endPackageColumnDrag(){
  packageColumnDragKey='';
  document.querySelectorAll('.package-board-column.is-column-dragging,.package-board-column.is-column-drag-over').forEach(el=>el.classList.remove('is-column-dragging','is-column-drag-over'));
}
function dropPackageColumn(event,targetColumnKey){
  if(!isPackageColumnDragEvent(event))return;
  event.preventDefault();
  event.stopPropagation();
  const draggedKey=packageValidBoardColumnKey(packageColumnDragKey||event.dataTransfer.getData(PACKAGE_COLUMN_DND_TYPE)||String(event.dataTransfer.getData('text/plain')||'').replace(/^column:/,''));
  targetColumnKey=packageValidBoardColumnKey(targetColumnKey);
  endPackageColumnDrag();
  if(!draggedKey||!targetColumnKey||draggedKey===targetColumnKey)return;
  const current=packageBoardColumns(packageFilterBaseRows()).map(col=>col.key);
  const from=current.indexOf(draggedKey);
  const to=current.indexOf(targetColumnKey);
  if(from<0||to<0)return;
  const next=current.slice();
  const [moved]=next.splice(from,1);
  next.splice(to,0,moved);
  localStorage.setItem(PACKAGE_BOARD_COLUMN_ORDER_KEY,JSON.stringify(next));
  renderPackages();
}
async function dropPackageCard(event,targetId){
  if(isPackageColumnDragEvent(event))return;
  event.preventDefault();
  event.stopPropagation();
  const draggedId=packageDragId||event.dataTransfer.getData('text/plain');
  endPackageDrag();
  if(!draggedId||!targetId||draggedId===targetId)return;
  const dragged=packages.find(p=>String(p.id)===String(draggedId));
  const target=packages.find(p=>String(p.id)===String(targetId));
  if(!dragged||!target)return;
  if(packageBoardColumnKey(dragged)!==packageBoardColumnKey(target))return;
  const targetColumnKey=packageBoardColumnKey(target);
  const ordered=packageOrderedRows(targetColumnKey);
  const from=ordered.findIndex(p=>String(p.id)===String(draggedId));
  const to=ordered.findIndex(p=>String(p.id)===String(targetId));
  if(from<0||to<0)return;
  const moved=ordered.splice(from,1)[0];
  const insertAfter=from>=0&&from<to;
  const nextTo=ordered.findIndex(p=>String(p.id)===String(targetId));
  ordered.splice(insertAfter?nextTo+1:nextTo,0,moved);
  await savePackageBoardOrder(ordered);
}
async function savePackageBoardOrder(ordered){
  const orderedIds=ordered.map(p=>p.id);
  const previous=new Map(packages.map(p=>[p.id,p.sortOrder]));
  orderedIds.forEach((id,idx)=>{const p=packages.find(row=>row.id===id);if(p)p.sortOrder=(idx+1)*10;});
  renderPackages();
  try{
    await savePackageOrder(orderedIds);
    toast('课包顺序已保存','success');
  }catch(e){
    packages.forEach(p=>{if(previous.has(p.id))p.sortOrder=previous.get(p.id);});
    renderPackages();
    toast('保存排序失败：'+e.message,'error');
  }
}
async function savePackageOrder(orderedIds){
  const res=await apiCall('PUT','/packages/order',{orderedIds});
  (res.packages||[]).forEach(row=>{const i=packages.findIndex(p=>p.id===row.id);if(i>=0)packages[i]=row;});
  return res;
}
function packagePurchaseCount(packageId){
  return purchases.filter(p=>p.status!=='voided'&&isMeaningfulPurchaseRecord(p)&&purchaseMatchesPackage(p,packageId)).length;
}
function purchaseMatchesPackage(p,packageId){
  if(!packageId)return true;
  const purchaseIdsByEntitlement=new Set(entitlements.filter(e=>String(e.packageId||'')===String(packageId)).map(e=>String(e.purchaseId||'')).filter(Boolean));
  return String(p.packageId||'')===String(packageId)||String(p.originalPackageId||'')===String(packageId)||purchaseIdsByEntitlement.has(String(p.id||''));
}
function packageOpts(sel){
  return '<option value="">— 选择售卖课包 —</option>'+packages.filter(p=>p.status!=='inactive').map(p=>`<option value="${p.id}"${sel===p.id?' selected':''}>${esc(standardPackageLabel(p,false)||p.name)}${p.status==='inactive'?' · 已停售':''}</option>`).join('');
}
function purchasePackageOpts(sel){
  return '<option value="">— 选择售卖课包 —</option>'+packages.filter(p=>p.status!=='inactive'||p.id===sel).map(p=>`<option value="${p.id}"${sel===p.id?' selected':''}>${esc(standardPackageLabel(p,false)||p.name)}${p.status==='inactive'?' · 已停售':''}</option>`).join('');
}
function packageMergeOpts(sel){
  return [{value:'',label:'— 选择课包 —'},...packages.filter(p=>p.status!=='merged').map(p=>({value:p.id,label:standardPackageLabel(p,true)||p.name}))];
}
function openPackageMergeModal(){
  const opts=packageMergeOpts('');
  const body=`<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">保留课包 *</label>${renderCourtDropdownHtml('pkg_merge_master','选择课包',opts,'',true)}</div><div class="tms-form-item"><label class="tms-form-label">并入课包 *</label>${renderCourtDropdownHtml('pkg_merge_source','选择课包',opts,'',true)}</div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="packageMergeBtn" onclick="mergePackage()">确认合并</button>`;
  setCourtModalFrame('合并课包',body,footer,'modal-tight modal-merge-package');
}
async function mergePackage(){
  const masterPackageId=document.getElementById('pkg_merge_master')?.value||'';
  const sourcePackageId=document.getElementById('pkg_merge_source')?.value||'';
  if(!masterPackageId||!sourcePackageId){toast('请选择两个课包','warn');return;}
  if(masterPackageId===sourcePackageId){toast('请选择两个不同课包','warn');return;}
  const ok=await appConfirm('确认合并课包？并入课包会隐藏，历史购买记录和课包余额会显示为保留课包。',{title:'确认合并',confirmText:'确认合并'});
  if(!ok)return;
  const btn=document.getElementById('packageMergeBtn');if(btn){btn.disabled=true;btn.textContent='合并中…';}
  try{
    const res=await apiCall('POST','/packages/merge',{masterPackageId,sourcePackageId},120000);
    const sourceIndex=packages.findIndex(p=>p.id===res.sourcePackage?.id);
    if(sourceIndex>=0)packages[sourceIndex]=res.sourcePackage;
    (res.purchases||[]).forEach(row=>{const i=purchases.findIndex(p=>p.id===row.id);if(i>=0)purchases[i]=row;});
    (res.entitlements||[]).forEach(row=>{const i=entitlements.findIndex(e=>e.id===row.id);if(i>=0)entitlements[i]=row;});
    (res.schedules||[]).forEach(row=>{const i=schedules.findIndex(s=>s.id===row.id);if(i>=0)schedules[i]=row;});
    closeModal();
    renderPackages();
    if(currentPage==='purchases')renderPurchases();
    if(currentPage==='entitlements')renderEntitlements();
    toast('课包已合并','success');
  }catch(e){toast('合并失败：'+e.message,'error');if(btn){btn.disabled=false;btn.textContent='确认合并';}}
}
async function deactivatePackage(id){
  const p=packages.find(x=>x.id===id);
  if(!p)return;
  if(String(p.status||'active')==='inactive'){toast('该课包已停售','warn');return;}
  const ok=await appConfirm('确认下架该课包？下架后不再用于新购买，历史订单和课包余额保留。',{title:'确认下架',confirmText:'确认下架',danger:true});
  if(!ok)return;
  try{
    const data={...p,status:'inactive'};
    const r=await apiCall('PUT','/packages/'+id,data);
    const i=packages.findIndex(x=>x.id===id);
    if(i>=0)packages[i]=r;
    renderPackages();
    toast('课包已下架','success');
  }catch(e){toast('下架失败：'+e.message,'error');}
}
function purchaseAllowedCoachChecks(ids,cls='pur-allowed-coach-cb'){
  ids=parseArr(ids).map(coachName);
  return activeCoachNames().map(name=>`<label class="tms-checkbox-wrap"><input type="checkbox" value="${esc(name)}" class="tms-checkbox ${cls}" ${ids.includes(name)?'checked':''}><span>${esc(name)}</span></label>`).join('')||'<span style="color:var(--td);font-size:12px">暂无教练</span>';
}
function packageCoachChecks(ids){
  ids=parseArr(ids).map(coachName);
  return activeCoachNames().map(name=>`<label class="tms-checkbox-wrap"><input type="checkbox" value="${esc(name)}" class="tms-checkbox pkg-coach-cb" ${ids.includes(name)?'checked':''}><span>${esc(name)}</span></label>`).join('')||'<span style="color:var(--td);font-size:12px">暂无教练</span>';
}
function packageCampusChecks(ids){
  ids=parseArr(ids);
  return campuses.map(c=>`<label class="tms-checkbox-wrap"><input type="checkbox" value="${c.code||c.id}" class="tms-checkbox pkg-campus-cb" ${ids.includes(c.code||c.id)?'checked':''}><span>${esc(c.name)}</span></label>`).join('')||'<span style="color:var(--td);font-size:12px">暂无校区</span>';
}
function packageTimeScopeOptions(){
  return [{value:'weekday',label:'工作日'},{value:'weekend',label:'周末'}];
}
function packageTimeBandPresetWindows(timeBand='全天'){
  if(timeBand==='黄金时段')return[
    {label:'工作日',startTime:'16:00',endTime:'22:00',daysOfWeek:[1,2,3,4,5]},
    {label:'周六日',startTime:'09:00',endTime:'22:00',daysOfWeek:[6,7]}
  ];
  if(timeBand==='非黄金时段')return[
    {label:'工作日',startTime:'09:00',endTime:'16:00',daysOfWeek:[1,2,3,4,5]}
  ];
  return[
    {label:'工作日',startTime:'09:00',endTime:'22:00',daysOfWeek:[1,2,3,4,5]},
    {label:'周六日',startTime:'09:00',endTime:'22:00',daysOfWeek:[6,7]}
  ];
}
function packageTimeWindowText(w){
  const time=[w?.startTime,w?.endTime].filter(Boolean).join(' - ');
  const days=parseArr(w?.daysOfWeek).map(n=>parseInt(n)).filter(Boolean).sort((a,b)=>a-b).join(',');
  const scope=days==='6,7'?'周六日':'工作日';
  return time?`${scope} ${time}`:'';
}
function setPackageLessonShortcut(value){
  const input=document.getElementById('pkg_lessons');
  if(input)input.value=value;
  document.querySelectorAll('.package-lesson-chip').forEach(btn=>btn.classList.toggle('active',String(btn.dataset.lessons)===String(value)));
}
function applySmallClassPackagePreset(){
  const type=document.getElementById('pkg_type')?.value||'';
  if(type!=='小班课')return;
  const sub=document.getElementById('pkg_smallClassType')?.value||'single';
  const presets={
    single:{price:260,lessons:1,timeBand:'全天',maxStudents:'4'},
    bootcamp:{price:1999,lessons:10,timeBand:'黄金时段',maxStudents:'4'},
    dropin:{price:1499,lessons:6,timeBand:'全天',maxStudents:'4'}
  };
  const preset=presets[sub]||presets.single;
  const price=document.getElementById('pkg_price');
  const lessons=document.getElementById('pkg_lessons');
  if(price)price.value=preset.price;
  if(lessons)lessons.value=preset.lessons;
  setCourtDropdownValue('pkg_maxStudents',preset.maxStudents,`1v${preset.maxStudents}`);
  setCourtDropdownValue('pkg_timeBand',preset.timeBand,preset.timeBand);
  setPackageLessonShortcut(preset.lessons);
  applyPackageTimeBandPreset(preset.timeBand);
}
function syncPackageClassSize(){
  const type=document.getElementById('pkg_type')?.value||'私教课';
  const item=document.getElementById('pkg_classSizeItem');
  const experienceItem=document.getElementById('pkg_experienceTypeItem');
  const smallClassItem=document.getElementById('pkg_smallClassTypeItem');
  const experienceEl=document.getElementById('pkg_experienceType');
  if(item)item.style.display=(type==='私教课'||type==='小班课')?'':'none';
  if(experienceItem)experienceItem.style.display=type==='体验课'?'':'none';
  if(smallClassItem)smallClassItem.style.display=type==='小班课'?'':'none';
  if(type==='私教课'){
    setCourtDropdownValue('pkg_maxStudents','1','1v1');
  }else if(type==='小班课'){
    applySmallClassPackagePreset();
  }else if(type==='体验课'&&experienceEl){
    const value=experienceEl.value||'私教体验课';
    setCourtDropdownValue('pkg_experienceType',value,value);
  }
}
function applyPackageTimeBandPreset(value){
  const rows=packageTimeBandPresetWindows(value||document.getElementById('pkg_timeBand')?.value||'全天');
  const host=document.getElementById('pkg_timeWindowsWrap');
  if(!host)return;
  host.innerHTML=rows.map((row,idx)=>{
    const suffix=idx===0?'':'2';
    return `<div class="package-time-window-row"><div class="package-time-window-label">${esc(row.label)}</div><div class="package-time-window-fields">${renderCourtDropdownHtml(`pkg_timeStart${suffix}`,'开始时间',getScheduleTimeOptions(row.startTime||'09:00'),row.startTime||'09:00',true)}<span class="range-dash">-</span>${renderCourtDropdownHtml(`pkg_timeEnd${suffix}`,'结束时间',getScheduleTimeOptions(row.endTime||'22:00'),row.endTime||'22:00',true)}</div></div>`;
  }).join('');
}

function openPackageModal(id,presetProductId=''){
  editId=id;const presetProduct=presetProductId?products.find(x=>x.id===presetProductId):null;const p=id?packages.find(x=>x.id===id):presetProduct?{courseType:presetProduct.type,experienceType:presetProduct.experienceType,audience:presetProduct.audience,maxStudents:presetProduct.maxStudents,price:presetProduct.price,lessons:presetProduct.lessons,productId:presetProduct.id,productName:presetProduct.name}:null;
  const locked=!!(id&&packageHasPurchases(id));
  const courseTypeForm=normalizeCourseTypeForForm(p);
  const courseType=courseTypeForm.courseType;
  const audience=rv(p,'audience')||packageAudienceLabelFromText([p?.type,p?.productName,p?.name,p?.packageName,p?.notes])||'成人';
  const audienceOptions=[{value:'成人',label:'成人'},{value:'青少年',label:'青少年'}];
  const courseTypeOptions=PRODUCT_TYPES.map(t=>({value:t,label:t}));
  const classSizeOptions=[{value:'1',label:'1v1'},{value:'2',label:'1v2'},{value:'3',label:'1v3'},{value:'4',label:'1v4'}];
  const experienceType=courseTypeForm.experienceType||packageExperienceTypeLabel(p)||'私教体验课';
  const smallClassType=courseTypeForm.smallClassType||'single';
  const smallClassOptions=[{value:'single',label:'单次'},{value:'bootcamp',label:'训练营'},{value:'dropin',label:'随到随学'}];
  const ownerCoachOptions=[{value:'',label:'— 未分配 —'},...activeCoachNames().map(name=>({value:name,label:name}))];
  const timeBandOptions=[{value:'全天',label:'全天'},{value:'黄金时段',label:'黄金时段'},{value:'非黄金时段',label:'非黄金时段'}];
  const body=`
    <div class="tms-section-header" style="margin-top:0;">基础属性</div>
      ${locked?'<div class="inline-help">该课包已有购买记录，价格、课时、人数、校区和可上课教练已锁定。</div>':''}
      <div class="tms-form-row package-basic-row">
        <div class="tms-form-item"><label class="tms-form-label">学员类型 *</label>${renderCourtDropdownHtml('pkg_audience','学员类型',audienceOptions,audience,true)}</div>
        <div class="tms-form-item"><label class="tms-form-label">课程类型 *</label>${renderCourtDropdownHtml('pkg_type','课程类型',courseTypeOptions,courseType,true,'syncPackageClassSize')}</div>
        <div class="tms-form-item" id="pkg_classSizeItem"><label class="tms-form-label">上课人数</label>${renderCourtDropdownHtml('pkg_maxStudents','上课人数',classSizeOptions,String(rv(p,'maxStudents',1)),true)}</div>
        <div class="tms-form-item" id="pkg_smallClassTypeItem" style="display:none"><label class="tms-form-label">小班类型</label>${renderCourtDropdownHtml('pkg_smallClassType','小班类型',smallClassOptions,smallClassType,true,'applySmallClassPackagePreset')}</div>
        <div class="tms-form-item" id="pkg_experienceTypeItem" style="display:none"><label class="tms-form-label">体验课类型</label>${renderCourtDropdownHtml('pkg_experienceType','体验课类型',experienceTypeOptions(),experienceType,true)}</div>
        <div class="tms-form-item"><label class="tms-form-label">状态</label>${renderCourtDropdownHtml('pkg_status','状态',[{value:'active',label:'售卖中'},{value:'inactive',label:'已停售'}],rv(p,'status','active'),true)}</div>
      </div>
    <div class="tms-section-header">规格与价格</div>
      <div class="tms-form-row package-spec-row">
        <div class="tms-form-item"><label class="tms-form-label">课时</label><input class="finput tms-form-control" id="pkg_lessons" type="number" value="${rv(p,'lessons',10)}"><div class="package-lesson-shortcuts"><button type="button" class="package-lesson-chip" data-lessons="10" onclick="setPackageLessonShortcut(10)">10课时</button><button type="button" class="package-lesson-chip" data-lessons="20" onclick="setPackageLessonShortcut(20)">20课时</button></div></div>
        <div class="tms-form-item"><label class="tms-form-label">价格</label><input class="finput tms-form-control" id="pkg_price" type="number" value="${rv(p,'price',0)}"></div>
      </div>
    <div class="tms-section-header">上课时间与效期</div>
      <div class="package-modal-panel">
      <div class="tms-form-row package-date-section">
        <div class="tms-form-item">
          <label class="tms-form-label">活动时间</label>
          <div class="range-pair">
            <button class="coach-date-btn" id="pkg_saleStartDate_btn" onclick="toggleGlobalDatePicker(event,'pkg_saleStartDate','pkg_saleStartDate_btn','活动开始')">${rv(p,'saleStartDate')||'活动开始'}</button>
            <span class="range-dash">-</span>
            <button class="coach-date-btn" id="pkg_saleEndDate_btn" onclick="toggleGlobalDatePicker(event,'pkg_saleEndDate','pkg_saleEndDate_btn','活动结束')">${rv(p,'saleEndDate')||'活动结束'}</button>
          </div>
          <input class="filter-hidden-date" id="pkg_saleStartDate" type="date" value="${rv(p,'saleStartDate')}" onchange="syncDateButton('pkg_saleStartDate','pkg_saleStartDate_btn','活动开始')">
          <input class="filter-hidden-date" id="pkg_saleEndDate" type="date" value="${rv(p,'saleEndDate')}" onchange="syncDateButton('pkg_saleEndDate','pkg_saleEndDate_btn','活动结束')">
        </div>
        <div class="tms-form-item">
          <label class="tms-form-label">可用时间</label>
          <div class="range-pair">
            <button class="coach-date-btn" id="pkg_usageStartDate_btn" onclick="toggleGlobalDatePicker(event,'pkg_usageStartDate','pkg_usageStartDate_btn','使用开始')">${rv(p,'usageStartDate')||'使用开始'}</button>
            <span class="range-dash">-</span>
            <button class="coach-date-btn" id="pkg_usageEndDate_btn" onclick="toggleGlobalDatePicker(event,'pkg_usageEndDate','pkg_usageEndDate_btn','使用结束')">${rv(p,'usageEndDate')||'使用结束'}</button>
          </div>
          <input class="filter-hidden-date" id="pkg_usageStartDate" type="date" value="${rv(p,'usageStartDate')}" onchange="syncDateButton('pkg_usageStartDate','pkg_usageStartDate_btn','使用开始')">
          <input class="filter-hidden-date" id="pkg_usageEndDate" type="date" value="${rv(p,'usageEndDate')}" onchange="syncDateButton('pkg_usageEndDate','pkg_usageEndDate_btn','使用结束')">
        </div>
      </div>
      <div class="package-panel-divider"></div>
      <div class="package-time-section">
        <div class="tms-form-item package-time-band-item"><label class="tms-form-label">时段类型</label>${renderCourtDropdownHtml('pkg_timeBand','时段类型',timeBandOptions,rv(p,'timeBand','全天'),true,'applyPackageTimeBandPreset')}</div>
        <div class="tms-form-item package-time-windows-item"><label class="tms-form-label">可用时段</label>
          <div class="time-window-stack" id="pkg_timeWindowsWrap"></div>
        </div>
      </div>
      </div>
    <div class="tms-section-header">教练和场地</div>
      <div class="package-modal-panel package-resource-panel">
        <div class="package-resource-row"><label class="tms-form-label">归属教练</label><div class="package-resource-content">${renderCourtDropdownHtml('pkg_ownerCoach','归属教练',ownerCoachOptions,coachName(rv(p,'ownerCoach')),true)}</div></div>
        <div class="package-panel-divider"></div>
        <div class="package-resource-row"><label class="tms-form-label">可用校区</label><div class="package-resource-content"><div class="tms-checkbox-matrix package-campus-grid">${packageCampusChecks(rv(p,'campusIds',[]))}</div></div></div>
        <div class="package-panel-divider"></div>
        <div class="package-resource-row"><label class="tms-form-label">可上课教练</label><div class="package-resource-content"><div class="tms-checkbox-matrix purchase-coach-picker package-coach-picker">${packageCoachChecks(rv(p,'coachNames',[]))}</div></div></div>
      </div>
      <div class="tms-form-row purchase-notes-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="pkg_notes_inline" placeholder="可选">${esc(rv(p,'notes'))}</textarea></div></div>
    <input type="hidden" id="pkg_name" value="${esc(rv(p,'name'))}">
    <textarea class="filter-hidden-date" id="pkg_notes" style="display:none">${esc(rv(p,'notes'))}</textarea>
    `;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button>${id&&String(p.status||'active')!=='inactive'?`<button class="tms-btn tms-btn-danger" onclick="deactivatePackage('${p.id}')">下架</button>`:''}<button class="tms-btn tms-btn-primary btn-save" onclick="savePackage()">保存</button>`;
  setCourtModalFrame(id?'编辑课包':'创建课包',body,footer,'modal-wide modal-package-edit');
  syncPackageClassSize();
  if(p&&document.getElementById('pkg_price'))document.getElementById('pkg_price').value=rv(p,'price',0);
  setPackageLessonShortcut(rv(p,'lessons',10));
  applyPackageTimeBandPreset(rv(p,'timeBand','全天'));
}
function packageSaveErrorText(err){
  const raw=String(err?.message||err||'').replace(/\s*\[[^\]]+\]$/,'').trim();
  if(!raw)return '系统有点忙，请稍后再试';
  const exactMap={
    '请填写课包名称':'课包信息不完整，请重新检查后再保存',
    '请填写课程类型':'课程类型还没选，请先选择课程类型',
    '课程产品不存在':'关联的课程产品已经不存在，请重新选择',
    '课时必须大于 0':'课时请填大于 0 的数字',
    '价格必须大于 0':'价格请填大于 0 的数字',
    '有效天数必须大于 0':'可用天数请填大于 0 的数字',
    '人数限制必须大于 0':'上课人数请填大于 0 的数字',
    '请选择小班课类型':'小班课类型还没选，请先选择小班课类型',
    '小班单次必须是 1 次':'单次小班课请把课时改成 1',
    '训练营必须是黄金时段':'训练营只能选黄金时段',
    '训练营固定 4 人':'训练营人数必须是 4 人',
    '随到随学必须是 6 次':'随到随学请把课时改成 6',
    '活动结束时间不能早于活动开始时间':'活动时间结束日期不能早于开始日期',
    '可用结束时间不能早于可用开始时间':'可用时间结束日期不能早于开始日期',
    '可用时段请填写完整':'请把可用时段的开始和结束时间都填完整',
    '可用结束时间必须晚于开始时间':'可用时段结束时间要晚于开始时间',
    '可用教练不存在':'可上课教练里有已删除的教练，请重新勾选',
    '主归属教练不存在':'归属教练已经不存在，请重新选择',
    '可用校区不存在':'可用校区里有已删除的校区，请重新勾选',
    '该课包已有购买记录，不能修改核心规则':'这个课包已经有人买过了，价格、课时、人数、时间、教练和校区这些核心规则不能改。要改请新建一个课包',
    '该课包已停用':'这个课包已经停售，不能继续保存'
  };
  if(exactMap[raw])return exactMap[raw];
  return raw;
}
async function savePackage(){
  const courseType=document.getElementById('pkg_type').value.trim();
  const audience=document.getElementById('pkg_audience').value;
  const experienceType=document.getElementById('pkg_experienceType')?.value.trim()||'';
  const smallClassType=document.getElementById('pkg_smallClassType')?.value||'';
  const name=standardPackageLabel({courseType,experienceType,smallClassType,maxStudents:parseInt(document.getElementById('pkg_maxStudents').value)||1,lessons:parseInt(document.getElementById('pkg_lessons').value)||0,timeBand:document.getElementById('pkg_timeBand').value.trim()||'全天'},document.getElementById('pkg_status').value==='inactive');
  const ownerCoach=document.getElementById('pkg_ownerCoach')?.value||'';
  const saleStartDate=document.getElementById('pkg_saleStartDate').value;
  const saleEndDate=document.getElementById('pkg_saleEndDate').value;
  const usageStartDate=document.getElementById('pkg_usageStartDate').value;
  const usageEndDate=document.getElementById('pkg_usageEndDate').value;
  const timeStart=document.getElementById('pkg_timeStart').value;
  const timeEnd=document.getElementById('pkg_timeEnd').value;
  const timeStart2=document.getElementById('pkg_timeStart2')?.value||'';
  const timeEnd2=document.getElementById('pkg_timeEnd2')?.value||'';
  if(saleStartDate&&saleEndDate&&saleEndDate<saleStartDate){toast('活动结束时间不能早于活动开始时间','warn');return;}
  if(usageStartDate&&usageEndDate&&usageEndDate<usageStartDate){toast('可用结束时间不能早于可用开始时间','warn');return;}
  if((timeStart&&!timeEnd)||(!timeStart&&timeEnd)){toast('第一个可用时段请填写完整','warn');return;}
  if(timeStart&&timeEnd&&timeEnd<=timeStart){toast('可用结束时间必须晚于可用开始时间','warn');return;}
  if((timeStart2&&!timeEnd2)||(!timeStart2&&timeEnd2)){toast('第二个可用时段请填写完整','warn');return;}
  if(timeStart2&&timeEnd2&&timeEnd2<=timeStart2){toast('第二个可用结束时间必须晚于开始时间','warn');return;}
  if((parseFloat(document.getElementById('pkg_price').value)||0)<=0){toast('价格必须大于 0','warn');return;}
  if((parseInt(document.getElementById('pkg_lessons').value)||0)<=0){toast('课时必须大于 0','warn');return;}
  if((parseInt(document.getElementById('pkg_maxStudents').value)||0)<=0){toast('人数限制必须大于 0','warn');return;}
  if(!courseType){toast('请选择课程类型','warn');return;}
  const coachNames=[...document.querySelectorAll('.pkg-coach-cb:checked')].map(cb=>cb.value);
  const campusIds=[...document.querySelectorAll('.pkg-campus-cb:checked')].map(cb=>cb.value);
  const btn=document.querySelector('.btn-save');btn.disabled=true;btn.textContent='保存中…';
  document.getElementById('pkg_notes').value=document.getElementById('pkg_notes_inline').value.trim();
  const timeBand=document.getElementById('pkg_timeBand').value.trim()||'全天';
  const packagePersistedValidDays=parseInt(rv(packages.find(x=>x.id===editId),'validDays',30))||30;
  const presetWindows=packageTimeBandPresetWindows(timeBand);
  const dailyTimeWindows=presetWindows.map((preset,idx)=>({
    label:preset.label,
    startTime:idx===0?timeStart:timeStart2,
    endTime:idx===0?timeEnd:timeEnd2,
    daysOfWeek:preset.daysOfWeek
  })).filter(row=>row.startTime&&row.endTime);
  const data={name,productId:'',productName:'',courseType,audience,type:audience,experienceType:courseType==='体验课'?experienceType:'',smallClassType:courseType==='小班课'?smallClassType:'',courseTypeLevel2:courseTypeLevel2Label(courseType,experienceType,smallClassType),standardCourseType:standardCourseTypeLabel(courseType,experienceType,smallClassType),fixedStudentCount:courseType==='小班课'&&smallClassType==='bootcamp'?4:0,minAttendStudents:courseType==='小班课'?2:0,freeAbsenceLimit:courseType==='小班课'&&smallClassType==='bootcamp'?1:0,ownerCoach,price:parseFloat(document.getElementById('pkg_price').value)||0,lessons:parseInt(document.getElementById('pkg_lessons').value)||0,validDays:packagePersistedValidDays,saleStartDate,saleEndDate,usageStartDate,usageEndDate,timeBand,dailyTimeWindows,coachNames,coachIds:coachNames,campusIds,maxStudents:parseInt(document.getElementById('pkg_maxStudents').value)||1,status:document.getElementById('pkg_status').value,notes:document.getElementById('pkg_notes').value.trim()};
  try{if(editId){const r=await apiCall('PUT','/packages/'+editId,data);const i=packages.findIndex(x=>x.id===editId);packages[i]=r;}else{const r=await apiCall('POST','/packages',data);packages.unshift(r);}closeModal();toast(editId?'课包修改成功 ✓':'课包创建成功 ✓','success');renderPackages();renderProducts();}catch(e){toast('保存失败：'+packageSaveErrorText(e),'error');btn.disabled=false;btn.textContent='保存';}
}
