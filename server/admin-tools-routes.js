const TEST_DATA_RESET_TABLES=[
  'ft_courts',
  'ft_students',
  'ft_products',
  'ft_plans',
  'ft_schedule',
  'ft_classes',
  'ft_class_nos',
  'ft_feedbacks',
  'ft_coach_proposals',
  'ft_packages',
  'ft_purchases',
  'ft_entitlements',
  'ft_entitlement_ledger',
  'ft_price_plans',
  'ft_membership_plans',
  'ft_membership_accounts',
  'ft_membership_orders',
  'ft_membership_benefit_ledger',
  'ft_membership_account_events'
];
const TEST_DATA_KEPT_TABLES=['ft_users','ft_coaches','ft_campuses'];
const COURSE_PACKAGE_KNOWN_ISSUES_REPAIR_ID='course-package-known-issues-20260722';
const JIAQI_DUPLICATE_PURCHASE_IDS=[
  '442f25fd-6c6e-45f1-bfda-81a2f28fe229',
  '483b742a-f146-4d6b-86ab-74373b76b89c'
];
const JIAQI_DUPLICATE_ENTITLEMENT_IDS=[
  'fb1aef29-13cd-4611-b725-c22802345f48',
  '9efa96a6-43e0-47b4-87f2-6b054675cfed'
];
const JIAQI_MAIN_PURCHASE_ID='private_lesson_csv_import_20260524-purchase-2065-佳琪（）';
const JIAQI_MAIN_ENTITLEMENT_ID='private_lesson_csv_import_20260527:entitlement:c27759386c39';
const MACHEN_GIFT_ENTITLEMENT_ID='private_lesson_csv_import_20260519_BATCH3_15_LIVE-entitlement-5450e5cc-2064-6293-3399-15b1dc6f4378';

function getTestDataResetTables(){return [...TEST_DATA_RESET_TABLES];}
function repairRowSnapshot(row){
  if(!row)return null;
  return JSON.parse(JSON.stringify(row));
}
function buildCoursePackageKnownIssuesRepairPlan(data={},options={}){
  const now=options.now||new Date().toISOString();
  const operator=options.operator||'';
  const operationId=options.operationId||`${COURSE_PACKAGE_KNOWN_ISSUES_REPAIR_ID}-${Date.now()}`;
  const purchasesById=new Map((data.purchases||[]).map(row=>[String(row.id||''),row]));
  const entitlementsById=new Map((data.entitlements||[]).map(row=>[String(row.id||''),row]));
  const blockers=[];
  const updates={purchases:[],entitlements:[]};
  const backups={purchases:[],entitlements:[]};

  const jiaqiMainPurchase=purchasesById.get(JIAQI_MAIN_PURCHASE_ID);
  const jiaqiMainEntitlement=entitlementsById.get(JIAQI_MAIN_ENTITLEMENT_ID);
  if(!jiaqiMainPurchase)blockers.push({id:JIAQI_MAIN_PURCHASE_ID,table:'ft_purchases',reason:'佳琪20课时主订单不存在'});
  if(!jiaqiMainEntitlement)blockers.push({id:JIAQI_MAIN_ENTITLEMENT_ID,table:'ft_entitlements',reason:'佳琪20课时主权益不存在'});
  if(jiaqiMainPurchase&&Number(jiaqiMainPurchase.packageLessons||jiaqiMainPurchase.totalLessons||0)!==20)blockers.push({id:JIAQI_MAIN_PURCHASE_ID,table:'ft_purchases',reason:'佳琪主订单不是20课时'});
  if(jiaqiMainEntitlement&&Number(jiaqiMainEntitlement.totalLessons||0)!==20)blockers.push({id:JIAQI_MAIN_ENTITLEMENT_ID,table:'ft_entitlements',reason:'佳琪主权益不是20课时'});

  JIAQI_DUPLICATE_PURCHASE_IDS.forEach(id=>{
    const row=purchasesById.get(id);
    if(!row){blockers.push({id,table:'ft_purchases',reason:'佳琪重复10课时订单不存在'});return;}
    backups.purchases.push(repairRowSnapshot(row));
    updates.purchases.push({
      ...row,
      status:'voided',
      voidedAt:row.voidedAt||now,
      voidedBy:operator,
      voidReason:'2026-07-22 确认佳琪只有一笔20课时9000元订单，4000+5000为拆分支付，作废重复10课时订单',
      repairReason:'2026-07-22 佳琪重复课包清理',
      operationId,
      batchId:`batch-${operationId}`,
      updatedAt:now
    });
  });
  JIAQI_DUPLICATE_ENTITLEMENT_IDS.forEach(id=>{
    const row=entitlementsById.get(id);
    if(!row){blockers.push({id,table:'ft_entitlements',reason:'佳琪重复10课时权益不存在'});return;}
    backups.entitlements.push(repairRowSnapshot(row));
    updates.entitlements.push({
      ...row,
      status:'voided',
      voidedAt:row.voidedAt||now,
      voidReason:'2026-07-22 确认佳琪只有一笔20课时9000元订单，作废重复10课时权益',
      repairReason:'2026-07-22 佳琪重复课包清理',
      operationId,
      batchId:`batch-${operationId}`,
      updatedAt:now
    });
  });

  const machen=row=>(row&&String(row.studentName||'').trim()==='马晨');
  const machenEntitlement=entitlementsById.get(MACHEN_GIFT_ENTITLEMENT_ID);
  if(!machenEntitlement)blockers.push({id:MACHEN_GIFT_ENTITLEMENT_ID,table:'ft_entitlements',reason:'马晨赠课权益不存在'});
  else if(!machen(machenEntitlement))blockers.push({id:MACHEN_GIFT_ENTITLEMENT_ID,table:'ft_entitlements',reason:'马晨赠课权益学员不匹配'});
  else{
    backups.entitlements.push(repairRowSnapshot(machenEntitlement));
    updates.entitlements.push({
      ...machenEntitlement,
      totalLessons:11,
      usedLessons:11,
      remainingLessons:0,
      status:'depleted',
      repairReason:'2026-07-22 马晨买10赠1，权益总课时补为11',
      operationId,
      batchId:`batch-${operationId}`,
      updatedAt:now
    });
  }

  return {
    operationId,
    now,
    blockers,
    backups,
    updates,
    summary:{
      purchaseUpdates:updates.purchases.length,
      entitlementUpdates:updates.entitlements.length,
      blockers:blockers.length
    }
  };
}

function createAdminToolRoutes(deps={}){
  const {
    init,sendJson,clearTables,scan,put,del,
    tables={}
  }=deps;

  return async function handleAdminToolRoutes({path,method,body,user,res}){
    if(path==='/admin/clear-test-data'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      if(body.confirm!=='CLEAR_TEST_DATA')return sendJson(res,{error:'缺少清空确认'},400);
      await init();
      const result=await clearTables({scan,del},TEST_DATA_RESET_TABLES);
      return sendJson(res,{...result,kept:TEST_DATA_KEPT_TABLES});
    }
    if(path==='/admin/repair-course-package-known-issues-20260722'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const purchases=await scan(tables.T_PURCHASES||'ft_purchases').catch(()=>[]);
      const entitlements=await scan(tables.T_ENTITLEMENTS||'ft_entitlements').catch(()=>[]);
      const plan=buildCoursePackageKnownIssuesRepairPlan({purchases,entitlements},{operator:user.name||user.id||''});
      if(plan.blockers.length)return sendJson(res,{success:false,write:false,...plan},409);
      const write=body.write===true;
      if(write&&body.confirm!=='REPAIR_COURSE_PACKAGE_KNOWN_ISSUES_20260722')return sendJson(res,{error:'缺少修复确认'},400);
      if(!write)return sendJson(res,{success:true,write:false,...plan});
      for(const row of plan.updates.purchases)await put(tables.T_PURCHASES||'ft_purchases',row.id,row);
      for(const row of plan.updates.entitlements)await put(tables.T_ENTITLEMENTS||'ft_entitlements',row.id,row);
      return sendJson(res,{success:true,write:true,...plan});
    }
    return false;
  };
}

module.exports={
  createAdminToolRoutes,
  TEST_DATA_RESET_TABLES,
  getTestDataResetTables,
  buildCoursePackageKnownIssuesRepairPlan,
  COURSE_PACKAGE_KNOWN_ISSUES_REPAIR_ID,
  JIAQI_DUPLICATE_PURCHASE_IDS,
  JIAQI_DUPLICATE_ENTITLEMENT_IDS,
  MACHEN_GIFT_ENTITLEMENT_ID
};
