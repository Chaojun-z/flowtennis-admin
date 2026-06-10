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
Object.assign(window,{
  renderStandardEmptyText,
  renderStandardCellText,
  renderStandardDropdownHtml,
  closeStandardDropdowns,
  toggleStandardDropdown,
  selectStandardDropdownItem,
  setStandardDropdownValue,
  renderStandardPaginationButtonsHtml
});
document.documentElement.dataset.standardComponents='loaded';
document.addEventListener('click',closeStandardDropdowns);
