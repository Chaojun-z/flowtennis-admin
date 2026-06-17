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

function getTestDataResetTables(){return [...TEST_DATA_RESET_TABLES];}

function createAdminToolRoutes(deps={}){
  const {
    init,sendJson,clearTables,scan,del
  }=deps;

  return async function handleAdminToolRoutes({path,method,body,user,res}){
    if(path==='/admin/clear-test-data'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      if(body.confirm!=='CLEAR_TEST_DATA')return sendJson(res,{error:'缺少清空确认'},400);
      await init();
      const result=await clearTables({scan,del},TEST_DATA_RESET_TABLES);
      return sendJson(res,{...result,kept:TEST_DATA_KEPT_TABLES});
    }
    return false;
  };
}

module.exports={createAdminToolRoutes,TEST_DATA_RESET_TABLES,getTestDataResetTables};
