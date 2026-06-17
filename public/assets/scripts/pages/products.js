function syncProductFilterOptions(){
  const typeValue=document.getElementById('prodTypeFilter')?.value||'';
  const typeOptions=[{value:'',label:'全部类型'},...PRODUCT_TYPES.map(t=>({value:t,label:t}))];
  const host=document.getElementById('prodTypeFilterHost');
  if(host)host.innerHTML=renderStandardDropdownHtml('prodTypeFilter','全部类型',typeOptions,typeValue,false,'renderProducts');
}
function renderProducts(){
  syncProductFilterOptions();
  const q=(document.getElementById('prodSearch')?.value||'').toLowerCase();
  const tf=document.getElementById('prodTypeFilter')?.value||'';
  const list=products.filter(p=>{const typeText=courseTypeDisplayLabel(p);if(!searchHit(q,p.name,p.type,typeText,p.price,p.lessons,p.maxStudents,p.notes))return false;if(tf&&normalizeCourseType(p.type)!==tf)return false;return true;});
  document.getElementById('productGrid').innerHTML=list.length?list.map(p=>{
    const linkedPackages=packages.filter(pkg=>pkg.productId===p.id).length;
    const locked=productHasReferences(p.id);
    const typeText=courseTypeDisplayLabel(p);
    return `<div class="product-card-shell"><div class="showcase-card-body"><div class="showcase-card-header"><div class="showcase-card-title-group"><div class="showcase-card-title">${esc(p.name)}<span class="tms-tag ${productTypeTagClass(p.type)}">${esc(typeText||'—')}</span></div><div class="showcase-card-subtitle">用于创建售卖课包的课程模板</div></div>${locked?'<span class="showcase-status-tag is-linked">已被引用</span>':''}</div><div class="showcase-highlight"><span class="showcase-highlight-value">${p.maxStudents||1}<span class="showcase-highlight-unit">人</span></span><span class="showcase-highlight-divider">/</span><span class="showcase-highlight-value">¥${fmt(p.price)}</span><span class="showcase-highlight-divider">/</span><span class="showcase-highlight-value">${p.lessons||0}<span class="showcase-highlight-unit">节</span></span></div><div class="showcase-kv-list"><div class="showcase-kv-row"><div class="showcase-kv-label">已建课包</div><div class="showcase-kv-value">${linkedPackages} 个</div></div></div></div><div class="showcase-card-footer"><div class="showcase-card-actions"><button class="showcase-action-btn is-primary" onclick="openPackageModal(null,'${p.id}')">建课包</button></div><div class="showcase-card-actions"><button class="showcase-action-btn" onclick="openProductModal('${p.id}')">编辑</button><button class="showcase-action-btn is-danger" onclick="confirmDel('${p.id}','${esc(p.name)}','product')">删除</button></div></div></div>`;
  }).join(''):'<div class="course-showcase-empty"><div class="empty"><p>暂无课程产品</p></div></div>';
}

function syncProductExperienceType(){
  const type=document.getElementById('p_type')?.value||'';
  const item=document.getElementById('p_experienceTypeItem');
  if(item)item.style.display=normalizeCourseType(type)==='体验课'?'':'none';
}
function openProductModal(id){
  editId=id;const p=id?products.find(x=>x.id===id):null;
  const locked=!!(id&&productHasReferences(id));
  const typeOptions=PRODUCT_TYPES.map(t=>({value:t,label:t}));
  const experienceType=normalizeExperienceType(rv(p,'experienceType')||rv(p,'type'),'私教体验课');
  const body=`<div class="tms-section-header" style="margin-top:0;">基本信息</div>${locked?'<div class="tms-audit-note" style="margin-bottom:18px">该课程产品已经被售卖课包引用。为避免售卖规则、已购权益口径被改乱，类型、人数、定价、课时不能再改，只保留名称和备注可改。</div>':''}<div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">课程名称 *</label><input class="finput tms-form-control" id="p_name" value="${rv(p,'name')}"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">类型</label>${locked?`<input class="finput tms-form-control" id="p_type" value="${rv(p,'type')}" readonly>`:renderStandardDropdownHtml('p_type','类型',typeOptions,rv(p,'type'),true,'syncProductExperienceType')}</div><div class="tms-form-item" id="p_experienceTypeItem" style="display:none"><label class="tms-form-label">体验课类型</label>${locked?`<input class="finput tms-form-control" id="p_experienceType" value="${esc(experienceType)}" readonly>`:renderStandardDropdownHtml('p_experienceType','体验课类型',experienceTypeOptions(),experienceType,true)}</div><div class="tms-form-item"><label class="tms-form-label">人数</label><input class="finput tms-form-control" id="p_max" type="number" value="${rv(p,'maxStudents',1)}"${locked?' readonly':''}></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">定价</label><input class="finput tms-form-control" id="p_price" type="number" value="${rv(p,'price',0)}"${locked?' readonly':''}></div><div class="tms-form-item"><label class="tms-form-label">课时</label><input class="finput tms-form-control" id="p_lessons" type="number" value="${rv(p,'lessons',0)}"${locked?' readonly':''}></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="p_notes">${esc(rv(p,'notes'))}</textarea></div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button>${id?`<button class="tms-btn tms-btn-danger" onclick="confirmDel('${p.id}','${esc(p.name)}','product')">删除</button>`:''}<button class="tms-btn tms-btn-primary" id="productSaveBtn" onclick="saveProduct()">保存</button>`;
  openStandardModal({title:id?'编辑课程产品':'新增课程产品',bodyHtml:body,actionsHtml:footer,extraClass:'modal-tight'});
  syncProductExperienceType();
}
async function saveProduct(){
  const name=document.getElementById('p_name').value.trim();if(!name){toast('请输入名称','warn');return;}
  const type=normalizeCourseType(document.getElementById('p_type').value);
  const data={name,type,experienceType:type==='体验课'?normalizeExperienceType(document.getElementById('p_experienceType')?.value):'',maxStudents:parseInt(document.getElementById('p_max').value)||1,price:parseFloat(document.getElementById('p_price').value)||0,lessons:parseInt(document.getElementById('p_lessons').value)||0,notes:document.getElementById('p_notes').value.trim()};
  await runStandardMutation('productSaveBtn',async()=>{
    if(editId){await apiCall('PUT','/products/'+editId,data);const i=products.findIndex(x=>x.id===editId);products[i]={...products[i],...data,id:editId};}
    else{const r=await apiCall('POST','/products',data);products.unshift(r);}
  },{
    successText:editId?'修改成功 ✓':'添加成功，可以去创建课包',
    closeOnSuccess:true,
    refresh:[renderProducts,renderPackages]
  });
}
