function createProductRouteHelpers(deps={}){
  const {changedCoreFields}=deps;

  function assertCanEditProductWithReferences(oldProduct,nextProduct,refs={}){
    if(!oldProduct||!nextProduct)return;
    const used=(refs.classes||[]).some(c=>c.productId===oldProduct.id)||(refs.packages||[]).some(p=>p.productId===oldProduct.id);
    if(!used)return;
    if(changedCoreFields(oldProduct,nextProduct,['type','maxStudents','lessons','price']).length)throw new Error('该课程产品已有班次或售卖课包使用，不能修改核心字段');
  }

  function assertCanDeleteProduct(productId,classes,packages=[]){
    if((classes||[]).some(c=>c.productId===productId))throw new Error('该课程产品已有班次使用，不能删除');
    if((packages||[]).some(p=>p.productId===productId))throw new Error('该课程产品已有售卖课包使用，不能删除');
  }

  function buildProductRenameDisplayUpdates(oldProduct,nextProduct,data={},now=new Date().toISOString()){
    const empty={classes:[],plans:[]};
    if(!oldProduct||!nextProduct)return empty;
    const oldName=String(oldProduct.name||'').trim();
    const nextName=String(nextProduct.name||'').trim();
    if(!oldName||!nextName||oldName===nextName)return empty;
    if(changedCoreFields(oldProduct,nextProduct,['type','maxStudents','lessons','price']).length)return empty;
    const classes=(data.classes||[]).filter(c=>c.productId===oldProduct.id).map(c=>{
      const className=c.classNo&&nextName?`${c.classNo}-${nextName}`:(nextName||c.className||'');
      return {...c,productName:nextName,className,updatedAt:now};
    });
    const classMap=new Map(classes.map(c=>[c.id,c]));
    const classIds=new Set(classes.map(c=>c.id));
    const plans=(data.plans||[]).filter(p=>classIds.has(p.classId)).map(p=>{
      const cls=classMap.get(p.classId)||null;
      return {...p,productName:nextName,className:cls?.className||p.className||'',updatedAt:now};
    });
    return {classes,plans};
  }

  return {assertCanEditProductWithReferences,assertCanDeleteProduct,buildProductRenameDisplayUpdates};
}

function createProductRoutes(deps={}){
  const {
    init,sendJson,getCachedScan,get,scan,put,del,uuidv4,
    normalizeProductRecord,assertCanEditProductWithReferences,assertCanDeleteProduct,
    buildProductRenameDisplayUpdates,
    T_PRODUCTS,T_CLASSES,T_PACKAGES,T_PLANS
  }=deps;

  return async function handleProductRoutes({path,method,body,user,res}){
    if(path==='/products'){
      await init();
      if(method==='GET')return sendJson(res,await getCachedScan(T_PRODUCTS).catch(()=>[]));
      if(method==='POST'){
        if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
        const id=uuidv4();
        const now=new Date().toISOString();
        const r=normalizeProductRecord({...body,id},null,now);
        r.createdAt=now;
        await put(T_PRODUCTS,id,r);
        return sendJson(res,r);
      }
    }
    const pM=path.match(/^\/products\/(.+)$/);
    if(pM){
      const id=pM[1];
      if(method==='GET')return sendJson(res,await get(T_PRODUCTS,id));
      if(method==='PUT'){
        if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
        const old=await get(T_PRODUCTS,id).catch(()=>null);
        if(!old)return sendJson(res,{error:'课程产品不存在'},404);
        const now=new Date().toISOString();
        const r=normalizeProductRecord({...body,id},old,now);
        const [classes,packages]=await Promise.all([scan(T_CLASSES).catch(()=>[]),scan(T_PACKAGES).catch(()=>[])]);
        assertCanEditProductWithReferences(old,r,{classes,packages});
        await put(T_PRODUCTS,id,r);
        const renamed=buildProductRenameDisplayUpdates(old,r,{classes},now);
        if(renamed.classes.length){
          const plans=await scan(T_PLANS).catch(()=>[]);
          const sync=buildProductRenameDisplayUpdates(old,r,{classes,plans},now);
          await Promise.all([...sync.classes.map(row=>put(T_CLASSES,row.id,row)),...sync.plans.map(row=>put(T_PLANS,row.id,row))]);
        }
        return sendJson(res,r);
      }
      if(method==='DELETE'){
        if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
        const [classes,packages]=await Promise.all([scan(T_CLASSES),scan(T_PACKAGES).catch(()=>[])]);
        assertCanDeleteProduct(id,classes,packages);
        await del(T_PRODUCTS,id);
        return sendJson(res,{success:true});
      }
    }
    return false;
  };
}

module.exports={createProductRoutes,createProductRouteHelpers};
