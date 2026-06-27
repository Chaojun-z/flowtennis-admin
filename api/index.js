const TableStore = require('tablestore');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const mabaoFinanceSeed = require('../server/seeds/mabao-finance-seed.json');
const { recordPerfMetric } = require('../server/lib/perf-metrics');
const { createCorePageDataRoutes } = require('../server/page-data/core-pages.js');
const { createResidualPageDataRoutes } = require('../server/page-data/residual-pages.js');
const { invalidateOperationsPageDataCache } = require('../server/page-data/operations-page.js'), { invalidateOperationsSourceCache } = require('../server/read-models/operations-source.js');
const { buildCustomerLifecycleRows } = require('../server/read-models/customer-lifecycle.js'), { createFinanceSnapshotHelpers } = require('../server/page-data/finance-snapshot.js');
const { normalizePermissionProfile, userHasFeaturePermission } = require('../server/permissions');
const { handleMatchDiag, handleTableStoreDiag } = require('../server/diagnostics');
const { createAuthServices } = require('../server/auth');
const { createStorageServices } = require('../server/storage');
const { createAuthRoutes } = require('../server/auth-routes');
const { createBootstrapRuntime, buildBootstrapSafetyFlags, readBooleanEnv, logBlockedAutoWrite } = require('../server/bootstrap');
const { createScheduleRules } = require('../server/schedule');
const { createPackageRules } = require('../server/packages');
const { createCourtFinanceRules } = require('../server/court-finance');
const { createMembershipRules } = require('../server/membership');
const { createCourtRoutes } = require('../server/courts-routes');
const { createMembershipRoutes } = require('../server/membership-routes');
const { createPurchaseEntitlementRoutes } = require('../server/purchase-entitlement-routes');
const { createScheduleRoutes } = require('../server/schedule-routes');
const { createAdminUserRoutes } = require('../server/admin-users-routes');
const { createAdminToolRoutes, TEST_DATA_RESET_TABLES, getTestDataResetTables } = require('../server/admin-tools-routes');
const { createPackageBoardRoutes, normalizePackageBoardColumnOrder } = require('../server/package-board-routes');
const { createMatchRoutes } = require('../server/match-routes');
const { createLeadsRoutes } = require('../server/leads-routes');
const { createCampusRoutes } = require('../server/campuses-routes');
const { createCoachRoutes, createCoachRuleHelpers } = require('../server/coaches-routes');
const { createProductRoutes, createProductRouteHelpers } = require('../server/products-routes');
const { createPackageRoutes, assertCanDeletePackage } = require('../server/packages-routes');
const { createStudentRoutes } = require('../server/students-routes');
const { createFeedbackRoutes } = require('../server/feedbacks-routes');
const { createCoachProposalRoutes } = require('../server/coach-proposals-routes');
const { LEAD_SOURCE_READ_LIMIT } = require('../server/lead-source-read-model.js');
const businessTaxonomy = require('../public/assets/scripts/core/business-taxonomy.js');
const { buildNotificationCenterSnapshot, toChinaDateKey } = require('../scripts/lib/notification-center-export.js');
const { buildFeishuCard: buildFeishuScheduleCard, generateReport: generateFeishuScheduleReport } = require('../standalone-services/feishu-report.js');

const JWT_SECRET = process.env.JWT_SECRET;
const TS_ENDPOINT = process.env.TS_ENDPOINT;
const TS_INSTANCE = String(process.env.TS_INSTANCE || '').trim();
const TS_KEY_ID = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
const TS_KEY_SEC = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
const REQUIRED_ENV_VARS = ['JWT_SECRET', 'TS_ENDPOINT', 'TS_INSTANCE', 'ALIBABA_CLOUD_ACCESS_KEY_ID', 'ALIBABA_CLOUD_ACCESS_KEY_SECRET'];
const BOOTSTRAP_SAFETY_FLAGS=buildBootstrapSafetyFlags();
const RAW_ENABLE_DEFAULT_USER_BOOTSTRAP=readBooleanEnv(process.env,'ENABLE_DEFAULT_USER_BOOTSTRAP');
const RAW_ENABLE_TABLE_BOOTSTRAP=readBooleanEnv(process.env,'ENABLE_TABLE_BOOTSTRAP');
const RAW_ENABLE_RUNTIME_TABLE_ENSURE=readBooleanEnv(process.env,'ENABLE_RUNTIME_TABLE_ENSURE');
const RAW_ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP=readBooleanEnv(process.env,'ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP');
const RAW_ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP=readBooleanEnv(process.env,'ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP');
const RAW_ENABLE_IMPORTED_LEDGER_AUTO_REPAIR=readBooleanEnv(process.env,'ENABLE_IMPORTED_LEDGER_AUTO_REPAIR');
const ENABLE_DEFAULT_USER_BOOTSTRAP = BOOTSTRAP_SAFETY_FLAGS.enableDefaultUserBootstrap;
const ENABLE_TABLE_BOOTSTRAP = BOOTSTRAP_SAFETY_FLAGS.enableTableBootstrap;
const ENABLE_RUNTIME_TABLE_ENSURE = BOOTSTRAP_SAFETY_FLAGS.enableRuntimeTableEnsure;
const ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP = BOOTSTRAP_SAFETY_FLAGS.enableDefaultPricePlanBootstrap;
const ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP = BOOTSTRAP_SAFETY_FLAGS.enableMabaoFinanceSeedBootstrap;
const ENABLE_IMPORTED_LEDGER_AUTO_REPAIR = BOOTSTRAP_SAFETY_FLAGS.enableImportedLedgerAutoRepair;
const RUNTIME_STAGE = BOOTSTRAP_SAFETY_FLAGS.runtimeStage;
const IS_PRODUCTION_RUNTIME = RUNTIME_STAGE === 'production';
const DEFAULT_ADMIN_BOOTSTRAP_PASSWORD = process.env.DEFAULT_ADMIN_BOOTSTRAP_PASSWORD || '';
const WECHAT_MINIPROGRAM_APPID = process.env.WECHAT_MINIPROGRAM_APPID || 'wx7acb7603ee803923';
const WECHAT_MINIPROGRAM_SECRET = process.env.WECHAT_MINIPROGRAM_SECRET;
const MATCH_MINIPROGRAM_APPID = process.env.MATCH_MINIPROGRAM_APPID || '';
const MATCH_MINIPROGRAM_SECRET = process.env.MATCH_MINIPROGRAM_SECRET || '';
const WECHAT_SCHEDULE_TEMPLATE_ID = process.env.WECHAT_SCHEDULE_TEMPLATE_ID;
const WECHAT_COURSE_REMINDER_TEMPLATE_ID = process.env.WECHAT_COURSE_REMINDER_TEMPLATE_ID;
const WECHAT_OFFICIAL_ACCOUNT_APPID = process.env.WECHAT_OFFICIAL_ACCOUNT_APPID || '';
const WECHAT_OFFICIAL_ACCOUNT_SECRET = process.env.WECHAT_OFFICIAL_ACCOUNT_SECRET || '';
const WECHAT_OFFICIAL_ACCOUNT_REMINDER_TEMPLATE_ID = process.env.WECHAT_OFFICIAL_ACCOUNT_REMINDER_TEMPLATE_ID || '';
const WECHAT_OFFICIAL_ACCOUNT_DIGEST_TEMPLATE_ID = process.env.WECHAT_OFFICIAL_ACCOUNT_DIGEST_TEMPLATE_ID || '';
const WECHAT_OFFICIAL_ACCOUNT_MOCK_SEND = readBooleanEnv(process.env,'WECHAT_OFFICIAL_ACCOUNT_MOCK_SEND');
const WECHAT_OFFICIAL_ACCOUNT_TOKEN = process.env.WECHAT_OFFICIAL_ACCOUNT_TOKEN || '';
const WECHAT_OFFICIAL_ACCOUNT_ENCODING_AES_KEY = process.env.WECHAT_OFFICIAL_ACCOUNT_ENCODING_AES_KEY || '';
const WECHAT_OFFICIAL_ACCOUNT_PROXY_URL = process.env.WECHAT_OFFICIAL_ACCOUNT_PROXY_URL || '';
const WECHAT_OFFICIAL_ACCOUNT_PROXY_SECRET = process.env.WECHAT_OFFICIAL_ACCOUNT_PROXY_SECRET || '';
const FEISHU_DAILY_REPORT_WEBHOOK = String(process.env.FEISHU_DAILY_REPORT_WEBHOOK || process.env.FEISHU_WEBHOOK_URL || '').trim();
const FEISHU_COACH_BOT_APP_ID = String(process.env.FEISHU_COACH_BOT_APP_ID || '').trim();
const FEISHU_COACH_BOT_APP_SECRET = String(process.env.FEISHU_COACH_BOT_APP_SECRET || '').trim();
const STUDENT_REMINDER_PUBLIC_BASE_URL = process.env.STUDENT_REMINDER_PUBLIC_BASE_URL || 'https://www.flowtennis.cn';
const MATCH_WECHAT_TEMPLATE_ID = process.env.MATCH_WECHAT_TEMPLATE_ID;
const MATCH_ADMIN_OFFICIAL_ACCOUNT_TEMPLATE_ID = process.env.MATCH_ADMIN_OFFICIAL_ACCOUNT_TEMPLATE_ID || '';
const MATCH_ADMIN_OFFICIAL_ACCOUNT_OPENIDS = process.env.MATCH_ADMIN_OFFICIAL_ACCOUNT_OPENIDS || '';
const MATCH_DATABASE_URL = process.env.MATCH_DATABASE_URL || process.env.DATABASE_URL;
const MATCH_CREATOR_CONFIRM_DEADLINE_HOURS = 12;
const MATCH_PREPAY_WINDOW_HOURS = 2;
const LEGACY_STATIC_COACH_REFS=[
  {id:'legacy-coach-tianhao',name:'天昊'},
  {id:'老吴',name:'刘润扬教练'}
];

const T_USERS='ft_users',T_COURTS='ft_courts',T_STUDENTS='ft_students',T_PRODUCTS='ft_products',T_PLANS='ft_plans',T_SCHEDULE='ft_schedule',T_COACHES='ft_coaches',T_CLASSES='ft_classes',T_CLASS_NOS='ft_class_nos',T_CAMPUSES='ft_campuses',T_FEEDBACKS='ft_feedbacks',T_COACH_PROPOSALS='ft_coach_proposals',T_PACKAGES='ft_packages',T_PURCHASES='ft_purchases',T_ENTITLEMENTS='ft_entitlements',T_ENTITLEMENT_LEDGER='ft_entitlement_ledger',T_FINANCIAL_LEDGER='ft_financial_ledger',T_MEMBERSHIP_PLANS='ft_membership_plans',T_MEMBERSHIP_ACCOUNTS='ft_membership_accounts',T_MEMBERSHIP_ORDERS='ft_membership_orders',T_MEMBERSHIP_BENEFIT_LEDGER='ft_membership_benefit_ledger',T_MEMBERSHIP_ACCOUNT_EVENTS='ft_membership_account_events',T_PRICE_PLANS='ft_price_plans',T_MATCH_SETTINGS='ft_match_settings',T_USER_WECHAT_INDEX='ft_user_wechat_index',T_COACH_SCHEDULE_INDEX='ft_coach_schedule_index',T_STUDENT_ACTIVE_ENTITLEMENT_INDEX='ft_student_active_entitlement_index',T_OFFICIAL_ACCOUNT_QUERY_SESSIONS='ft_official_account_query_sessions',T_LEADS='ft_leads',T_LEAD_FOLLOWUPS='ft_lead_followups',T_LEAD_IMPORT_BATCHES='ft_lead_import_batches';
const CAMPUS_DISPLAY_NAMES={mabao:'顺义马坡',shilipu:'朝阳十里堡',guowang:'国家网球中心',langang:'蓝色港湾',chaojun:'朝珺私教'};
const CAMPUS_ALIASES={'顺义马坡':'mabao','马坡':'mabao','mabao':'mabao','朝阳十里堡':'shilipu','十里堡':'shilipu','shilipu':'shilipu','国家网球中心':'guowang','国网':'guowang','guowang':'guowang','蓝色港湾':'langang','蓝港':'langang','langang':'langang','朝珺私教':'chaojun','chaojun':'chaojun'};
function normalizeCampusValue(value){const raw=String(value||'').trim();return CAMPUS_ALIASES[raw]||raw;}
function displayCampusName(value){const key=normalizeCampusValue(value);return CAMPUS_DISPLAY_NAMES[key]||String(value||'').trim();}
const MATCH_COURT_FINANCE_ACCOUNT_ID='match-court-finance';
const MATCH_SETTINGS_ROW_ID='match-launch-settings';
const MATCH_SQL_TABLES=['match_users','match_posts','match_registrations','match_attendance','match_bookings','match_fee_records','match_fee_splits','match_operation_logs','match_replacements','match_player_ratings'];
const MEMBERSHIP_TABLES=[T_MEMBERSHIP_PLANS,T_MEMBERSHIP_ACCOUNTS,T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_BENEFIT_LEDGER,T_MEMBERSHIP_ACCOUNT_EVENTS];
const RUNTIME_ENSURED_TABLES=[T_FEEDBACKS,T_PACKAGES,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_CLASS_NOS,T_PRICE_PLANS,T_MATCH_SETTINGS,T_USER_WECHAT_INDEX,T_COACH_SCHEDULE_INDEX,T_STUDENT_ACTIVE_ENTITLEMENT_INDEX,T_OFFICIAL_ACCOUNT_QUERY_SESSIONS,T_COACH_PROPOSALS,...MEMBERSHIP_TABLES];
const HOT_SCAN_TABLES=new Map([
  [T_USERS,{ttlMs:60000}],
  [T_COURTS,{ttlMs:60000}],
  [T_STUDENTS,{ttlMs:60000}],
  [T_PRODUCTS,{ttlMs:60000}],
  [T_SCHEDULE,{ttlMs:60000}],
  [T_CLASSES,{ttlMs:60000}],
  [T_PLANS,{ttlMs:60000}],
  [T_FEEDBACKS,{ttlMs:60000}],
  [T_PACKAGES,{ttlMs:60000}],
  [T_PURCHASES,{ttlMs:60000}],
  [T_ENTITLEMENTS,{ttlMs:60000}],
  [T_ENTITLEMENT_LEDGER,{ttlMs:60000}],
  [T_MEMBERSHIP_PLANS,{ttlMs:60000}],
  [T_MEMBERSHIP_ACCOUNTS,{ttlMs:60000}],
  [T_MEMBERSHIP_ORDERS,{ttlMs:60000}],
  [T_MEMBERSHIP_BENEFIT_LEDGER,{ttlMs:60000}],
  [T_MEMBERSHIP_ACCOUNT_EVENTS,{ttlMs:60000}],
  [T_COACHES,{ttlMs:60000}],
  [T_CAMPUSES,{ttlMs:60000}],
  [T_PRICE_PLANS,{ttlMs:60000}],
  [T_LEADS,{ttlMs:60000}],
  [T_LEAD_FOLLOWUPS,{ttlMs:60000}],
  [T_LEAD_IMPORT_BATCHES,{ttlMs:60000}],
  [T_OFFICIAL_ACCOUNT_QUERY_SESSIONS,{ttlMs:60000}]
]);
const FINANCE_SNAPSHOT_SOURCE_TABLES=new Set([
  T_COURTS,
  T_STUDENTS,
  T_PURCHASES,
  T_ENTITLEMENTS,
  T_ENTITLEMENT_LEDGER,
  T_MEMBERSHIP_ACCOUNTS,
  T_MEMBERSHIP_ORDERS,
  T_SCHEDULE,
  T_CAMPUSES
]);
const OPERATIONS_SOURCE_TABLES=new Set([T_LEADS,T_LEAD_FOLLOWUPS,T_SCHEDULE,T_COURTS,T_PURCHASES,T_STUDENTS,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_ACCOUNTS,T_COACHES,T_CAMPUSES]);
const LEAD_LIST_PROJECTION_FIELDS=[
  'displayName','name','wechatName','phone','level','leadDate','source','campus','customerType','demandProduct','consultType','intentLevel','profileNote','owner',
  'systemStatus','rawStatus','trialAtRaw','enrollAtRaw','convertedFlag','nextFollowupAt','lastFollowupAt','latestConcern','latestConclusion','nextAction','followupPriority','formalCoach',
  'studentId','courtId','membershipAccountId','isCourseConverted','isCourtConverted','isMembershipConverted','leadStage','dealType','conversionType','updatedAt','createdAt','lostReason'
];
const LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS=[
  'leadId',
  'followupAt',
  'createdAt',
  'followupBy',
  'followupType',
  'communicationNote',
  'concern',
  'conclusion',
  'statusAfter',
  'nextFollowupAt',
  'nextAction'
];
const ADMIN_USER_LIST_PROJECTION_FIELDS=[
  'name',
  'phone',
  'role',
  'status',
  'coachId',
  'coachName',
  'dataScope',
  'campusIds',
  'featurePermissions',
  'permissions',
  'matchPermissions',
  'matchOps',
  'matchFinance',
  'wechatOpenId',
  'wechatBoundAt',
  'officialAccountOpenId',
  'officialAccountBoundAt'
];
const SCHEDULE_LIST_PROJECTION_FIELDS=[
  'startTime',
  'endTime',
  'classId',
  'studentIds',
  'studentId',
  'studentName',
  'expectedStudentIds',
  'absentStudentIds',
  'courseType',
  'experienceType',
  'smallClassType',
  'coach',
  'campus',
  'venue',
  'venueId',
  'venueSpaceType',
  'lessonCount',
  'status',
  'cancelReason',
  'notifyStatus',
  'confirmStatus',
  'scheduleSource',
  'packageName',
  'entitlementId',
  'entitlementIds',
  'purchaseId',
  'requiresFieldFee',
  'fieldFeeReason',
  'fieldFeeAmount','fieldFeePayMethod','fieldFeeNote',
  'settlementType',
  'paymentType',
  'paidAmount',
  'paymentAmount',
  'payMethod',
  'paymentChannel',
  'notes',
  'coachLateFree',
  'coachLateFieldFeeAmount',
  'updatedAt',
  'createdAt'
];
const FINANCE_PAGE_COURT_PROJECTION_FIELDS=[
  'name',
  'phone',
  'campus',
  'campusName',
  'owner',
  'notes',
  'studentId',
  'studentIds',
  'balance',
  'totalDeposit',
  'spentAmount',
  'receivedAmount',
  'storedValueSpent',
  'directPaidSpent',
  'history',
  'cachedBalance',
  'cachedTotalDeposit',
  'cachedTotalSpent',
  'cachedTotalReceived',
  'joinDate',
  'createdAt',
  'updatedAt'
];
const COURTS_PAGE_COURT_PROJECTION_FIELDS=[
  'name',
  'phone',
  'campus',
  'source','sourceLeadId','leadId','fromLeadId',
  'studentId',
  'studentIds',
  'owner',
  'familiarity',
  'depositAttitude',
  'recentFollowUpDate',
  'nextFollowUpDate',
  'notes',
  'balance',
  'totalDeposit',
  'spentAmount',
  'receivedAmount',
  'storedValueSpent',
  'directPaidSpent',
  'history',
  'cachedBalance',
  'cachedTotalDeposit',
  'cachedTotalSpent',
  'cachedTotalReceived',
  'createdAt',
  'updatedAt',
  'status'
];
const COURTS_PAGE_STUDENT_PROJECTION_FIELDS=[
  'name',
  'phone',
  'campus'
];
const HOT_GET_TABLES=new Map([
  [T_USERS,{ttlMs:60000}],
  [T_USER_WECHAT_INDEX,{ttlMs:60000}],
  [T_COACH_SCHEDULE_INDEX,{ttlMs:60000}],
  [T_STUDENT_ACTIVE_ENTITLEMENT_INDEX,{ttlMs:60000}],
  [T_CLASSES,{ttlMs:60000}],
  [T_ENTITLEMENTS,{ttlMs:60000}],
  [T_COURTS,{ttlMs:60000}],
  [T_MEMBERSHIP_PLANS,{ttlMs:60000}],
  [T_MEMBERSHIP_ACCOUNTS,{ttlMs:60000}],
  [T_MEMBERSHIP_ORDERS,{ttlMs:60000}],
  [T_PRICE_PLANS,{ttlMs:60000}],
  [T_LEADS,{ttlMs:60000}],
  [T_LEAD_IMPORT_BATCHES,{ttlMs:60000}]
]);
const PRODUCTION_PAGE_READ_LIMITS={
  default:500,
  leads:LEAD_SOURCE_READ_LIMIT,
  leadFollowups:1000,
  schedule:800,entitlementLedger:2000,
  [T_COURTS]:1000,
  adminUsers:200
};
let financeSnapshotCache=null;

const wechatAccessTokenCacheByApp = new Map();
const wechatAccessTokenCache = wechatAccessTokenCacheByApp;
const feishuTenantAccessTokenCacheByApp = new Map();
let matchSqlPool;
const {
  gc,
  isTransientStorageError,
  scanLatestRowsDesc,
  invalidateHotScanCache,
  getCachedScan,
  productionReadTruncatedError,
  scanFirstRows,
  cappedScan,
  getCachedRow,
  put,
  putIfAbsent,
  get,
  scan,
  del,
  clearTables,
  mkTable,
  withTimeout,
  withRequiredStorageTimeout,
  cloneCacheValue
}=createStorageServices({
  tableStoreConfig:{
    accessKeyId:TS_KEY_ID,
    secretAccessKey:TS_KEY_SEC,
    endpoint:TS_ENDPOINT,
    instanceName:TS_INSTANCE
  },
  hotScanTables:HOT_SCAN_TABLES,
  hotGetTables:HOT_GET_TABLES,
  productionPageReadLimits:PRODUCTION_PAGE_READ_LIMITS,
  isProductionRuntime,
  onTableWrite(t){if(FINANCE_SNAPSHOT_SOURCE_TABLES.has(t))financeSnapshotCache=null;if(OPERATIONS_SOURCE_TABLES.has(t)){invalidateOperationsSourceCache();invalidateOperationsPageDataCache();}}
});
function getMatchSqlPool(){
  if(!MATCH_DATABASE_URL)throw new Error('缺少 MATCH_DATABASE_URL 或 DATABASE_URL，约球真实数据不能使用 mock 或 TableStore');
  if(!matchSqlPool)matchSqlPool=new Pool({connectionString:MATCH_DATABASE_URL,ssl:process.env.MATCH_DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
  return matchSqlPool;
}
function isMatchSqlUnavailableError(err){
  const msg=String(err?.message||err||'');
  return /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo|Connection terminated unexpectedly|staging-db\.example\.com|127\.0\.0\.1:5432|缺少 MATCH_DATABASE_URL/i.test(msg);
}
function shouldUseEmptyMatchAdminListFallback(err){
  return !isProductionRuntime()&&isMatchSqlUnavailableError(err);
}
function getScheduleListRows(){
  return isProductionRuntime()
    ? scan(T_SCHEDULE,{columns:SCHEDULE_LIST_PROJECTION_FIELDS}).catch((e)=>{console.error('schedule list scan err:',e);return [];})
    : getCachedScan(T_SCHEDULE,{columns:SCHEDULE_LIST_PROJECTION_FIELDS}).catch(()=>[]);
}
function getFinancePageScheduleRows(){
  return isProductionRuntime()
    ? scan(T_SCHEDULE,{columns:SCHEDULE_LIST_PROJECTION_FIELDS}).catch((e)=>{console.error('finance schedule scan err:',e);return [];})
    : getCachedScan(T_SCHEDULE,{columns:SCHEDULE_LIST_PROJECTION_FIELDS}).catch(()=>[]);
}
async function timed(label,fn){const startedAt=Date.now();try{return await fn();}finally{console.log(`[api-timing] ${label} ${Date.now()-startedAt}ms`);}}
async function timedEndpointMetric(name,fn,meta={}){
  const startedAt=Date.now();
  try{return await fn();}
  finally{recordPerfMetric(name,Date.now()-startedAt,meta);}
}
function scheduleSaveErrorStatus(err){
  return /超时/.test(String(err?.message||err||''))?503:400;
}
const FT_STUDENTS_FAST_TIMEOUT_MS=1200;
async function getFastStudentsRead(options={}){
  const fallback=[];
  let settled=false;
  const readPromise=getCachedScan(T_STUDENTS,options)
    .then(rows=>{settled=true;return Array.isArray(rows)?rows:fallback;})
    .catch(err=>{
      settled=true;
      console.error('[api-fast-read] ft_students read failed, fallback to empty array',err);
      return fallback;
    });
  const rows=await withTimeout(readPromise,FT_STUDENTS_FAST_TIMEOUT_MS,fallback);
  if(rows===fallback&&!settled)console.warn(`[api-fast-read] ft_students read timed out after ${FT_STUDENTS_FAST_TIMEOUT_MS}ms, fallback to empty array`);
  return rows;
}
function isTableMissingError(err){return /not.*exist|table.*not.*exist|OTSObjectNotExist/i.test(String(err?.message||err||''));}
function campusDisplayName(value,externalVenueName=''){
  const raw=String(value||'').trim();
  if(!raw)return '';
  if(raw==='__external__'||raw==='external')return String(externalVenueName||'').trim()||'校区外';
  if(raw==='mabao'||raw==='顺义马坡')return '马坡';
  if(raw==='shilipu'||raw==='朝阳十里堡')return '朝阳十里堡';
  if(raw==='guowang'||raw==='朝阳国网'||raw==='国家网球中心')return '国家网球中心';
  if(raw==='langang'||raw==='朝阳蓝色港湾')return '蓝色港湾';
  if(raw==='chaojun'||raw==='朝珺私教')return '朝珺私教';
  return raw;
}
async function putFeedback(id,row){
  try{return await put(T_FEEDBACKS,id,row);}
  catch(err){
    if(!isTableMissingError(err))throw err;
    await mkTable(T_FEEDBACKS);
    return put(T_FEEDBACKS,id,row);
  }
}
async function scanFeedbacks(){
  try{return await scan(T_FEEDBACKS);}
  catch(err){
    if(!isTableMissingError(err))throw err;
    return [];
  }
}
async function putCoachProposal(id,row){
  try{return await put(T_COACH_PROPOSALS,id,row);}
  catch(err){
    if(!isTableMissingError(err))throw err;
    await mkTable(T_COACH_PROPOSALS);
    return put(T_COACH_PROPOSALS,id,row);
  }
}
async function scanCoachProposals(){
  try{return await scan(T_COACH_PROPOSALS);}
  catch(err){
    if(!isTableMissingError(err))throw err;
    return [];
  }
}
async function prewarmHotScanCache(){
  await Promise.all([...HOT_SCAN_TABLES.keys()].map(t=>getCachedScan(t)));
}
const bootstrapRuntime=createBootstrapRuntime({
  env:process.env,
  bcrypt,
  requiredEnvVars:REQUIRED_ENV_VARS,
  defaultAdminBootstrapPassword:DEFAULT_ADMIN_BOOTSTRAP_PASSWORD,
  bootstrapSafetyFlags:BOOTSTRAP_SAFETY_FLAGS,
  rawFlags:{
    enableDefaultUserBootstrap:RAW_ENABLE_DEFAULT_USER_BOOTSTRAP,
    enableTableBootstrap:RAW_ENABLE_TABLE_BOOTSTRAP,
    enableDefaultPricePlanBootstrap:RAW_ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP,
    enableMabaoFinanceSeedBootstrap:RAW_ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP,
    enableImportedLedgerAutoRepair:RAW_ENABLE_IMPORTED_LEDGER_AUTO_REPAIR
  },
  runtimeEnsuredTables:RUNTIME_ENSURED_TABLES,
  tables:{
    T_USERS,
    T_COURTS,
    T_STUDENTS,
    T_PRODUCTS,
    T_PLANS,
    T_SCHEDULE,
    T_COACHES,
    T_CLASSES,
    T_CLASS_NOS,
    T_CAMPUSES,
    T_FEEDBACKS,
    T_COACH_PROPOSALS,
    T_PACKAGES,
    T_PURCHASES,
    T_ENTITLEMENTS,
    T_ENTITLEMENT_LEDGER,
    T_PRICE_PLANS
  },
  storage:{get,put,del,scan,mkTable},
  seedHelpers:{
    importedLedgerMonthKey,
    isMabaoFinanceSeedRow,
    isImportedMonthlyLedgerRow,
    collectDuplicateImportedLedgerIds
  },
  mabaoFinanceSeed,
  syncDefaultPricePlans,
  prewarmHotScanCache,
  isProductionRuntime,
  logBlockedAutoWrite
});
const DEFAULT_CAMPUSES=bootstrapRuntime.DEFAULT_CAMPUSES;
const {
  init,
  scheduleInitInBackground,
  getRuntimeEnsuredTables,
  collectMabaoSeedStaleRowIds,
  collectMabaoSeedImportedLedgerReplacementIds
}=bootstrapRuntime;
function parseArr(v){if(Array.isArray(v))return v;if(typeof v==='string'&&v){try{return JSON.parse(v)}catch{return[]}}return[];}
function parseLessonValue(v,fallback=0){
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
const courtFinanceRules=createCourtFinanceRules({
  uuidv4,
  parseArr,
  normalizeMoney,
  roundMoney,
  dateMs,
  businessTaxonomy,
  isBillableSchedule:(schedule)=>isBillableSchedule(schedule),
  isDirectPaidSchedule:(schedule)=>isDirectPaidSchedule(schedule),
  withOperationTrace,
  assertPhone,
  courtBookingRange:(court,row)=>courtBookingRange(court,row),
  validateScheduleConflicts:(candidate,schedules,excludeId)=>validateScheduleConflicts(candidate,schedules,excludeId)
});
const {
  scheduleStoredValuePaymentAmount,
  resolveScheduleStoredValueCourt,
  buildScheduleStoredValueHistoryRow,
  buildScheduleStoredValueCourtUpdate,
  normalizeStudentIds,
  extractDepositAmountFromText,
  normalizeCourtHistory,
  computeCourtFinance,
  summarizeCourtFinanceRevenue,
  isStoredValuePayMethod,
  mergeCourtRecords,
  normalizeCourtRecord,
  buildLegacyCourtOpeningHistory,
  legacyCourtFinanceWarnings
}=courtFinanceRules;
const scheduleRules=createScheduleRules({normalizeCourtHistory,campusDisplayName});
const {
  isBillableSchedule,
  scheduleSettlementType,
  isPackageSettlementSchedule,
  isDirectPaidSchedule,
  isScheduleLessonCharged,
  scheduleLessonDelta,
  effectiveScheduleStatus,
  scheduleLessonChargeStatus,
  assertCanWriteSchedule,
  validateScheduleConflicts,
  courtBookingRange,
  validateCourtBookingConflicts,
  scheduleParticipantSummary,
  collectScheduleRiskWarnings
}=scheduleRules;
const SMALL_CLASS_TYPES=['single','bootcamp','dropin'];
function isSmallGroupCourse(row={}){
  return String(row.courseType||row.type||'').trim()==='小班课';
}
function isSmallTrialCourse(row={}){
  const type=String(row.courseType||row.type||'').trim();
  const text=[row.experienceType,row.courseTypeLevel2,row.packageName,row.name,row.productName].filter(Boolean).join(' ');
  return type==='体验课'&&/小班|1v4/.test(text);
}
function isCountBasedCourse(row={}){
  return isSmallGroupCourse(row)||isSmallTrialCourse(row);
}
function normalizeSmallClassType(value='',fallback='single'){
  const raw=String(value||'').trim();
  if(SMALL_CLASS_TYPES.includes(raw))return raw;
  if(/训练营/.test(raw))return 'bootcamp';
  if(/随到随学/.test(raw))return 'dropin';
  if(/单次/.test(raw))return 'single';
  return fallback;
}
function smallClassTypesCompatible(entitlementType='',scheduleType=''){
  const entType=normalizeSmallClassType(entitlementType,'');
  const schType=normalizeSmallClassType(scheduleType,'');
  if(!entType||!schType)return true;
  if(entType===schType)return true;
  if(entType==='bootcamp'||schType==='bootcamp')return false;
  return ['single','dropin'].includes(entType)&&['single','dropin'].includes(schType);
}
function inferSmallClassType(source={},fallback='single'){
  const lessons=parseInt(source.lessons||source.totalLessons||source.packageLessons)||0;
  const price=normalizeMoney(source.price||source.packagePrice||source.amountPaid);
  const explicit=String(source.smallClassType||source.packageSubType||source.subType||'').trim();
  if(explicit&&!(explicit==='single'&&price===1499&&lessons!==1))return normalizeSmallClassType(explicit,fallback);
  const text=[source.courseTypeLevel2,source.name,source.packageName,source.productName].filter(Boolean).join(' ');
  if(/随到随学/.test(text)||(price===1499&&lessons!==1))return 'dropin';
  if(/训练营/.test(text))return 'bootcamp';
  if(/单次/.test(text))return 'single';
  return fallback;
}
function smallGroupLessonCountForStudentCount(count){
  const n=parseInt(count)||0;
  if(n===2)return 1;
  if(n===3)return 1.5;
  if(n===4)return 2;
  return 0;
}
function smallGroupRuleSnapshot(source={}){
  if(!isSmallGroupCourse(source))return {};
  const smallClassType=inferSmallClassType(source,parseInt(source.lessons||source.totalLessons||source.packageLessons)===6?'bootcamp':'single');
  const maxStudents=parseInt(source.maxStudents)||4;
  const fixedStudentCount=smallClassType==='bootcamp'?4:(parseInt(source.fixedStudentCount)||0);
  const minAttendStudents=smallClassType==='bootcamp'?2:(parseInt(source.minAttendStudents)||2);
  const freeAbsenceLimit=smallClassType==='bootcamp'?1:(parseInt(source.freeAbsenceLimit)||0);
  return {smallClassType,maxStudents,fixedStudentCount,minAttendStudents,freeAbsenceLimit};
}
const packageRules=createPackageRules({
  uuidv4,
  parseArr,
  parseLessonValue,
  normalizeMoney,
  dateKey,
  isSmallGroupCourse,
  smallGroupRuleSnapshot,
  withOperationTrace
});
const membershipRules=createMembershipRules({
  membershipTables:MEMBERSHIP_TABLES,
  uuidv4,
  parseArr,
  normalizeMoney,
  dateMs,
  computeCourtFinance,
  normalizeStudentIds,
  withOperationTrace
});
const {
  MEMBERSHIP_BENEFIT_FIELD_MAP,
  normalizeMembershipBenefitTemplate,
  buildMembershipPlanRecord,
  buildMembershipPurchase,
  summarizeMembershipBenefits,
  isDuplicateMembershipOrderSubmission,
  buildMembershipAccountEventRecord,
  buildMembershipBenefitLedgerRecord,
  buildStudentBenefitLedgerRecord,
  summarizeStudentBenefits,
  buildMembershipGrantLedgerRows,
  allocateMembershipBenefitUsage,
  reconcileMembershipAccounts,
  normalizeMembershipPlanViewRecord,
  normalizeMembershipOrderViewRecord
}=membershipRules;
const routeSendJson=(...args)=>{sendJson(...args);return true;};
const handleLeadsRoutes=createLeadsRoutes({
  init,sendJson:routeSendJson,getCachedScan,get,scan,put,filterLoadAllForUser,isProductionRuntime,isCampusScopedAdmin,
  cleanLeadText,ensureLeadTables,scanFirstRows,PRODUCTION_PAGE_READ_LIMITS,
  LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS,LEAD_LIST_PROJECTION_FIELDS,mergeDuplicateLeadRows,
  normalizeLeadRecord,leadCanonicalNameKey,mergeLeadRows,buildLeadInitialFollowup,
  normalizeLeadFollowupRecord,applyLeadFollowupsSnapshot,applyLeadFollowupSnapshot,normalizeLeadImportRows,
  buildLeadImportPreviewRows,leadImportPreviewSummary,dedupeLeadRows,buildLeadDedupKey,
  buildLeadStudentRecord,buildLeadCourtRecord,matchLeadToStudent,matchLeadToCourt,
  T_LEADS,T_LEAD_FOLLOWUPS,T_LEAD_IMPORT_BATCHES,T_STUDENTS,T_COURTS,T_MEMBERSHIP_ACCOUNTS,T_PURCHASES,T_ENTITLEMENTS,T_SCHEDULE,T_MEMBERSHIP_ORDERS
});
const handleCourtRoutes=createCourtRoutes({
  init,sendJson:routeSendJson,getCachedScan,getCachedRow,filterLoadAllForUser,uuidv4,
  buildOperationTrace,stampCourtHistoryOperationTrace,normalizeCourtRecord,put,
  importCourtRows,deleteCourtsByIds,loadCourtDeleteReferenceData,mergeCourtRecords,del,
  parseLegacyCourtNotes,shouldMigrateLegacyCourtFinance,buildLegacyCourtOpeningHistory,
  legacyCourtFinanceWarnings,computeCourtFinance,normalizeMoney,normalizeCourtHistory,courtDeleteAction,
  T_COURTS,T_SCHEDULE,T_MEMBERSHIP_ACCOUNTS,T_MEMBERSHIP_ORDERS,
  T_MEMBERSHIP_BENEFIT_LEDGER,T_MEMBERSHIP_ACCOUNT_EVENTS
});
const handleMembershipRoutes=createMembershipRoutes({
  init,sendJson:routeSendJson,getCachedScan,getCachedRow,filterLoadAllForUser,uuidv4,put,del,
  runMembershipReconcile,isCampusScopedAdmin,normalizeMoney,reserveRecentMembershipOrderRequest,
  releaseRecentMembershipOrderRequest,buildOperationTrace,normalizeMembershipPlanViewRecord,
  buildMembershipPlanRecord,buildMembershipPurchase,buildMembershipGrantLedgerRows,normalizeCourtHistory,
  normalizeCourtRecord,buildMembershipAccountEventRecord,operatorAccountName,normalizeOperatorAccountName,
  summarizeStudentBenefits,buildStudentBenefitLedgerRecord,MEMBERSHIP_BENEFIT_FIELD_MAP,
  normalizeMembershipOrderViewRecord,allocateMembershipBenefitUsage,buildMembershipBenefitLedgerRecord,
  T_MEMBERSHIP_PLANS,T_MEMBERSHIP_ACCOUNTS,T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_BENEFIT_LEDGER,
  T_MEMBERSHIP_ACCOUNT_EVENTS,T_COURTS,T_USERS
});
const handleStudentRoutes=createStudentRoutes({init,sendJson:routeSendJson,getFastStudentsRead,getCachedScan,scan,filterLoadAllForUser,buildCoachRefs,
  assertStudentWriteAccess,uuidv4,assertPhone,put,get,buildStudentReminderBindToken,buildStudentReminderLinkUpdate,
  normalizeStudentReminderMode,normalizeStudentReminderCustomHours,buildStudentOfficialAccountUnboundUpdate,
  applyStudentIdentityUpdate,deleteStudentCascade,T_STUDENTS,T_SCHEDULE,T_CLASSES,T_COACHES,T_USERS});
const handleFeedbackRoutes=createFeedbackRoutes({init,sendJson:routeSendJson,withTimeout,getCachedScan,filterLoadAllForUser,
  timedEndpointMetric,uuidv4,get,buildCoachRefs,assertCanWriteFeedback,buildFeedbackRecord,putFeedback,
  T_FEEDBACKS,T_SCHEDULE,T_COACHES,T_USERS});
const handleCoachProposalRoutes=createCoachProposalRoutes({init,sendJson:routeSendJson,withTimeout,getCachedScan,
  filterLoadAllForUser,getCoachScheduleRowsForUser,buildCoachRefs,uuidv4,get,assertCanWriteCoachProposal,
  buildCoachProposalRecord,putCoachProposal,T_COACH_PROPOSALS,T_SCHEDULE,T_COACHES,T_USERS});
const {
  buildEntitlementFromPurchase,
  buildPurchaseRecord,
  validateProductInput,
  normalizeProductRecord,
  validatePackageInput,
  normalizePackageRecord,
  stableRuleValue,
  changedCoreFields,
  syncSoldPackageRuleSnapshots,
  assertCanEditPackageWithPurchases,
  buildPackageDeactivateUpdate,
  assertCanMergePackages,
  buildPackageMergeUpdates,
  assertCanEditPurchaseWithLedger,
  purchaseHasEntitlementLedger,
  validatePurchaseInputForPackage,
  syncEntitlementFromPurchase
}=packageRules;
const {assertCanEditProductWithReferences,assertCanDeleteProduct,buildProductRenameDisplayUpdates}=createProductRouteHelpers({changedCoreFields});
const handlePurchaseEntitlementRoutes=createPurchaseEntitlementRoutes({
  init,sendJson:routeSendJson,getCachedScan,getCachedRow,get,scan,put,del,filterLoadAllForUser,uuidv4,
  isCampusScopedAdmin,parseArr,parseLessonValue,buildCoachRefs,buildOperationTrace,withOperationTrace,
  normalizeEntitlementLedgerRowsForDetailView,getIndexedActiveEntitlementsForStudents,recommendEntitlements,
  validateManualEntitlementAdjustment,applyEntitlementLessonDelta,buildManualEntitlementLedgerRecord,
  assertCanDeleteEntitlement,syncStudentActiveEntitlementIndexes,writePurchaseAndEntitlementAtomic,
  buildEntitlementFromPurchase,buildPurchaseRecord,assertCanEditPurchaseWithLedger,purchaseHasEntitlementLedger,
  validatePurchaseInputForPackage,syncEntitlementFromPurchase,assertCanVoidPurchase,
  T_PURCHASES,T_PACKAGES,T_STUDENTS,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_SCHEDULE,T_CLASSES,T_COACHES,T_USERS
});
const handleCorePageDataRoutes=createCorePageDataRoutes({
  init,sendJson:routeSendJson,cappedScan,filterLoadAllForUser,listCampusesWithDefaults,getFastStudentsRead,
  getCachedScan,getCachedRow,getScheduleListRows,getCoachScheduleRowsForUser,buildCoachRefs,
  scanCoachProposals,timedEndpointMetric,decorateWorkbenchStudents,decorateWorkbenchFeedbacks,
  decorateWorkbenchScheduleRows,decorateWorkbenchClasses,buildWorkbenchStats,projectScheduleListRow,
  normalizeMembershipPlanViewRecord,normalizeMembershipOrderViewRecord,DEFAULT_CAMPUSES,
  PRODUCTION_PAGE_READ_LIMITS,COURTS_PAGE_STUDENT_PROJECTION_FIELDS,COURTS_PAGE_COURT_PROJECTION_FIELDS,
  tables:{T_COACHES,T_CAMPUSES,T_STUDENTS,T_CLASSES,T_PLANS,T_PRODUCTS,T_SCHEDULE,T_COURTS,
    T_ENTITLEMENTS,T_PURCHASES,T_PACKAGES,T_ENTITLEMENT_LEDGER,T_MEMBERSHIP_ACCOUNTS,
    T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_BENEFIT_LEDGER,T_MEMBERSHIP_ACCOUNT_EVENTS,
    T_MEMBERSHIP_PLANS,T_USERS,T_FEEDBACKS,T_LEADS}
});
const handleCampusRoutes=createCampusRoutes({
  init,sendJson:routeSendJson,listCampusesWithDefaults,filterLoadAllForUser,uuidv4,
  put,del,scan,assertCanDeleteCampus,
  T_CAMPUSES,T_STUDENTS,T_COACHES,T_CLASSES,T_SCHEDULE,T_COURTS,T_PACKAGES,T_ENTITLEMENTS
});
async function applyLessonDelta(classId,delta,studentIds=[]){
  return null;
}
function scheduleHasFeedbackRecord(schedule,feedbacks=[]){
  const scheduleId=String(schedule?.id||'').trim();
  if(!scheduleId)return false;
  return (feedbacks||[]).some(item=>String(item?.scheduleId||'').trim()===scheduleId);
}
function scheduleIsTrialLesson(schedule){
  if(schedule?.isTrial===true)return true;
  return /体验/.test(String(schedule?.courseType||''));
}
function workbenchTrialConvertedByPurchaseRecord(schedule,purchases=[]){
  const studentIds=parseArr(schedule?.studentIds).filter(Boolean);
  const studentId=studentIds[0]||String(schedule?.studentId||'').trim();
  const studentName=String(schedule?.studentName||'').trim();
  const trialDate=dateKey(schedule?.endTime||schedule?.startTime);
  if(!trialDate)return false;
  return (purchases||[]).some(item=>{
    if(String(item?.status||'').trim()==='voided')return false;
    const purchaseDate=dateKey(item?.purchaseDate||item?.createdAt);
    if(!purchaseDate||purchaseDate<trialDate)return false;
    if(studentId)return String(item?.studentId||'').trim()===studentId;
    return !!studentName&&String(item?.studentName||'').trim()===studentName;
  });
}
function workbenchTrialStudentKeys(schedule){
  const ids=[...parseArr(schedule?.studentIds),schedule?.studentId]
    .map(value=>String(value||'').trim())
    .filter(Boolean);
  if(ids.length)return ids.map(id=>`id:${id}`);
  return String(schedule?.studentName||'')
    .split(/[、,，\s/]+/)
    .map(value=>value.trim())
    .filter(Boolean)
    .map(name=>`name:${name}`);
}
function workbenchPurchaseMatchesTrialStudent(purchase,key){
  if(String(key||'').startsWith('id:'))return String(purchase?.studentId||'').trim()===String(key).slice(3);
  return String(purchase?.studentName||'').trim()===String(key).slice(5);
}
function buildWorkbenchOverallTrialStats(scheduleRows=[],purchases=[]){
  const trialMap=new Map();
  (Array.isArray(scheduleRows)?scheduleRows:[])
    .filter(item=>scheduleIsTrialLesson(item)&&effectiveScheduleStatus(item)==='已结束')
    .forEach(item=>{
      const coachKey=String(item?.coach||'').trim();
      const trialDate=dateKey(item?.endTime||item?.startTime);
      workbenchTrialStudentKeys(item).forEach(studentKey=>{
        if(!studentKey)return;
        const mapKey=`${coachKey}__${studentKey}`;
        const existing=trialMap.get(mapKey);
        if(!existing||(!existing.trialDate&&trialDate)||(trialDate&&trialDate<existing.trialDate)){
          trialMap.set(mapKey,{studentKey,coachKey,trialDate});
        }
      });
    });
  const total=trialMap.size;
  const converted=[...trialMap.values()].filter(({ studentKey, coachKey, trialDate })=>{
    return (Array.isArray(purchases)?purchases:[]).some(item=>{
      if(!workbenchPurchaseMatchesTrialStudent(item,studentKey))return false;
      if(['voided','refunded'].includes(String(item?.status||'').trim()))return false;
      if(coachKey&&String(item?.ownerCoach||'').trim()!==coachKey)return false;
      const purchaseDate=dateKey(item?.purchaseDate||item?.createdAt);
      return !trialDate||!purchaseDate||purchaseDate>=trialDate;
    });
  }).length;
  const rate=total?Math.round(converted/total*1000)/10:0;
  return {
    overallTrialStudentCount:total,
    overallTrialConvertedStudentCount:converted,
    overallTrialConversionRate:Number.isInteger(rate)?rate:rate
  };
}
function resolveWorkbenchState(schedule,prevSchedule,now=new Date(),feedbacks=[]){
  const fromBackend=schedule?.workbenchState;
  if(fromBackend&&typeof fromBackend==='object'&&fromBackend.code&&fromBackend.label){
    return {code:fromBackend.code,label:fromBackend.label};
  }
  if(!schedule||effectiveScheduleStatus(schedule,now)==='已取消')return null;
  const startMs=dateMs(schedule.startTime);
  const endMs=dateMs(schedule.endTime||schedule.startTime);
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  const startDiff=Number.isFinite(startMs)&&Number.isFinite(nowMs)?Math.round((startMs-nowMs)/60000):null;
  const sameDay=prevSchedule&&dateKey(prevSchedule.startTime)===dateKey(schedule.startTime);
  const travelGap=sameDay&&prevSchedule&&prevSchedule.campus!==schedule.campus&&prevSchedule.endTime
    ? Math.round((dateMs(schedule.startTime)-dateMs(prevSchedule.endTime))/60000)
    : null;
  const ended=effectiveScheduleStatus(schedule,now)==='已结束';
  if(Number.isFinite(startMs)&&Number.isFinite(endMs)&&startMs<=nowMs&&nowMs<endMs){
    return {code:'live',label:'进行中'};
  }
  if(Number.isFinite(startDiff)&&startDiff>=0&&startDiff<=30){
    return {code:'upcoming',label:'即将开始'};
  }
  if(Number.isFinite(startDiff)&&startDiff>30&&Number.isFinite(travelGap)&&travelGap>=0&&travelGap<60){
    return {code:'travel',label:'需换场'};
  }
  if(Number.isFinite(startDiff)&&startDiff>30){
    return {code:'later',label:'今日后续'};
  }
  if(ended&&!scheduleHasFeedbackRecord(schedule,feedbacks)){
    return {code:'pending',label:'待反馈'};
  }
  return null;
}
function buildWorkbenchStats(input={}){
  if(
    Object.prototype.hasOwnProperty.call(input,'monthFinishedLessonUnits')
    ||Object.prototype.hasOwnProperty.call(input,'weekFinishedLessonUnits')
    ||Object.prototype.hasOwnProperty.call(input,'todayFinishedLessonUnits')
    ||Object.prototype.hasOwnProperty.call(input,'monthFeedbackCount')
    ||Object.prototype.hasOwnProperty.call(input,'pendingFeedbackCount')
    ||Object.prototype.hasOwnProperty.call(input,'monthTrialLessonCount')
    ||Object.prototype.hasOwnProperty.call(input,'trialConversionRate')
    ||Object.prototype.hasOwnProperty.call(input,'overallTrialStudentCount')
    ||Object.prototype.hasOwnProperty.call(input,'overallTrialConvertedStudentCount')
    ||Object.prototype.hasOwnProperty.call(input,'overallTrialConversionRate')
  ){
    return {
      monthFinishedLessonUnits:parseLessonValue(input.monthFinishedLessonUnits),
      weekFinishedLessonUnits:parseLessonValue(input.weekFinishedLessonUnits),
      todayFinishedLessonUnits:parseLessonValue(input.todayFinishedLessonUnits),
      monthFeedbackCount:parseInt(input.monthFeedbackCount,10)||0,
      pendingFeedbackCount:parseInt(input.pendingFeedbackCount,10)||0,
      monthTrialLessonCount:parseInt(input.monthTrialLessonCount,10)||0,
      trialConversionRate:parseLessonValue(input.trialConversionRate),
      overallTrialStudentCount:parseInt(input.overallTrialStudentCount,10)||0,
      overallTrialConvertedStudentCount:parseInt(input.overallTrialConvertedStudentCount,10)||0,
      overallTrialConversionRate:parseLessonValue(input.overallTrialConversionRate)
    };
  }
  const now=input.now instanceof Date?input.now:new Date();
  const scheduleRows=Array.isArray(input.schedule)?input.schedule:[];
  const feedbacks=Array.isArray(input.feedbacks)?input.feedbacks:[];
  const purchases=Array.isArray(input.purchases)?input.purchases:[];
  const monthKey=dateKey(now.toISOString()).slice(0,7);
  const dayKey=dateKey(now.toISOString());
  const weekStart=new Date(now);
  weekStart.setHours(0,0,0,0);
  const day=weekStart.getDay()||7;
  weekStart.setDate(weekStart.getDate()-day+1);
  const weekStartKey=dateKey(weekStart.toISOString());
  const weekEnd=new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate()+6);
  const weekEndKey=dateKey(weekEnd.toISOString());
  const endedRows=scheduleRows.filter(item=>effectiveScheduleStatus(item,now)==='已结束');
  const monthEndedRows=endedRows.filter(item=>dateKey(item.startTime).slice(0,7)===monthKey);
  const weekEndedRows=endedRows.filter(item=>{const key=dateKey(item.startTime);return key>=weekStartKey&&key<=weekEndKey;});
  const todayEndedRows=endedRows.filter(item=>dateKey(item.startTime)===dayKey);
  const monthTrialRows=monthEndedRows.filter(scheduleIsTrialLesson);
  const monthTrialConverted=monthTrialRows.filter(item=>workbenchTrialConvertedByPurchaseRecord(item,purchases)).length;
  const overallTrialStats=buildWorkbenchOverallTrialStats(scheduleRows,purchases);
  return {
    monthFinishedLessonUnits:monthEndedRows.reduce((sum,item)=>sum+parseLessonValue(item.lessonCount,1),0),
    weekFinishedLessonUnits:weekEndedRows.reduce((sum,item)=>sum+parseLessonValue(item.lessonCount,1),0),
    todayFinishedLessonUnits:todayEndedRows.reduce((sum,item)=>sum+parseLessonValue(item.lessonCount,1),0),
    monthFeedbackCount:monthEndedRows.filter(item=>scheduleHasFeedbackRecord(item,feedbacks)).length,
    pendingFeedbackCount:endedRows.filter(item=>!scheduleHasFeedbackRecord(item,feedbacks)).length,
    monthTrialLessonCount:monthTrialRows.length,
    trialConversionRate:monthTrialRows.length?Math.round(monthTrialConverted/monthTrialRows.length*100):0,
    overallTrialStudentCount:overallTrialStats.overallTrialStudentCount,
    overallTrialConvertedStudentCount:overallTrialStats.overallTrialConvertedStudentCount,
    overallTrialConversionRate:overallTrialStats.overallTrialConversionRate
  };
}
function decorateWorkbenchScheduleRows(schedule=[],feedbacks=[],purchases=[],now=new Date()){
  const sorted=(Array.isArray(schedule)?schedule:[]).slice().sort((a,b)=>{
    const coachCompare=String(a?.coach||'').localeCompare(String(b?.coach||''),'zh-CN');
    if(coachCompare!==0)return coachCompare;
    return String(a?.startTime||'').localeCompare(String(b?.startTime||''));
  });
  let prevByCoachDay=new Map();
  return sorted.map(item=>{
    const coachKey=String(item?.coach||'').trim();
    const dayKeyValue=dateKey(item?.startTime);
    const prevKey=`${coachKey}__${dayKeyValue}`;
    const prevSchedule=prevByCoachDay.get(prevKey)||null;
    const workbenchState=resolveWorkbenchState(item,prevSchedule,now,feedbacks);
    prevByCoachDay.set(prevKey,item);
    return {
      ...item,
      workbenchState:workbenchState
    };
  });
}
function assertClassSchedulable(cls,rec){
  return;
}
function dateMs(v){if(!v)return NaN;if(v instanceof Date)return v.getTime();return new Date(String(v).replace(' ','T')).getTime();}
function dateKey(v){return String(v||'').slice(0,10);}
function clockMin(v){const m=String(v||'').slice(0,5).match(/^(\d{1,2}):(\d{2})$/);return m?(parseInt(m[1])*60+parseInt(m[2])):NaN;}
function addDaysKey(ds,days){
  const d=new Date(`${ds}T00:00:00`);
  d.setDate(d.getDate()+(parseInt(days)||0));
  return d.toISOString().slice(0,10);
}
function dayOfWeek1to7(ds){
  const d=new Date(`${ds}T00:00:00`);
  const n=d.getDay();
  return n===0?7:n;
}
function normalizeVenue(v){
  const raw=String(v||'').trim();
  const m=raw.match(/([1-4])\s*号场/);
  return m?`${m[1]}号场`:raw;
}
function rangesOverlap(aStart,aEnd,bStart,bEnd){
  const as=dateMs(aStart),ae=dateMs(aEnd),bs=dateMs(bStart),be=dateMs(bEnd);
  if(!Number.isFinite(as)||!Number.isFinite(ae)||!Number.isFinite(bs)||!Number.isFinite(be))return false;
  return as<be&&bs<ae;
}
function minutesBetween(a,b){
  const am=dateMs(a),bm=dateMs(b);
  if(!Number.isFinite(am)||!Number.isFinite(bm))return null;
  return Math.round(Math.abs(bm-am)/60000);
}
function assertLessonCapacity(cls,oldDelta,nextDelta){
  return;
}
function buildOperationTrace({operationType='',operator='',now=new Date().toISOString(),idFactory=uuidv4,operationId='',batchId=''}={}){
  const resolvedOperationId=String(operationId||'').trim()||idFactory();
  return {
    operationId:resolvedOperationId,
    batchId:String(batchId||'').trim()||`batch-${resolvedOperationId}`,
    operationType:String(operationType||'').trim(),
    operationAt:now,
    operationBy:String(operator||'').trim()
  };
}
function withOperationTrace(record,trace){
  if(!record||!trace)return record;
  return {
    ...record,
    operationId:record.operationId||trace.operationId,
    batchId:record.batchId||trace.batchId,
    operationType:record.operationType||trace.operationType,
    operationAt:record.operationAt||trace.operationAt,
    operationBy:record.operationBy||trace.operationBy
  };
}
function stampCourtHistoryOperationTrace({previousCourt=null,nextCourt,operationTrace}={}){
  if(!nextCourt||!operationTrace)return nextCourt;
  const previousById=new Map(normalizeCourtHistory(previousCourt?.history).map(row=>[String(row.id||''),row]));
  const history=normalizeCourtHistory(nextCourt.history).map(row=>{
    if(row.operationId&&row.batchId)return row;
    const previous=previousById.get(String(row.id||''));
    if(previous&&JSON.stringify(previous)===JSON.stringify(row))return row;
    if(!['充值','消费','退款','冲正'].includes(String(row.type||'')))return row;
    return withOperationTrace(row,operationTrace);
  });
  return {...nextCourt,history};
}
function normalizeCourtBookingHistoryRows(court,history){
  return (history||[]).map(row=>{
    if(row?.type==='消费'&&row?.category==='订场'&&!row.campus){
      return {...row,campus:court?.campus||''};
    }
    return row;
  });
}
function assertCourtBookingHistoryAgainstSchedules(court,schedules){
  for(const row of normalizeCourtHistory(court?.history)){
    if(row?.type!=='消费'||row?.category!=='订场')continue;
    const booking=courtBookingRange(court,row);
    if(!booking)continue;
    validateScheduleConflicts(
      {
        id:row.id||court?.id||'court-booking',
        startTime:booking.startTime,
        endTime:booking.endTime,
        campus:booking.campus,
        venue:booking.venue,
        status:'已排课'
      },
      schedules,
      row.id
    );
  }
}
function assertScheduleEntitlementRequired(rec){
  if(!isBillableSchedule(rec))return;
  if(!isPackageSettlementSchedule(rec))return;
  assertSmallGroupScheduleRules(rec);
}
function assertSmallGroupScheduleRules(rec){
  if(!isSmallGroupCourse(rec)||!isBillableSchedule(rec))return;
  const actual=parseArr(rec.studentIds).filter(Boolean);
  const expected=parseArr(rec.expectedStudentIds).filter(Boolean);
  if(actual.length>4)throw new Error('小班课最多 4 人');
  if(actual.length>0&&actual.length<2)throw new Error('小班课至少 2 人到场才能开课');
}
async function writePurchaseAndEntitlementAtomic(store,purchaseTable,entitlementTable,purchase,entitlement){
  await store.put(purchaseTable,purchase.id,purchase);
  try{return await store.put(entitlementTable,entitlement.id,entitlement);}
  catch(err){
    await store.del(purchaseTable,purchase.id).catch(()=>null);
    throw err;
  }
}
function isScheduleInsideDailyTimeWindows(schedule,windows){
  const list=parseArr(windows);
  if(!list.length)return true;
  const ds=dateKey(schedule.startTime);
  if(!ds||ds!==dateKey(schedule.endTime))return false;
  const wd=dayOfWeek1to7(ds);
  const start=clockMin(String(schedule.startTime||'').slice(11,16));
  const end=clockMin(String(schedule.endTime||'').slice(11,16));
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return false;
  return list.some(w=>{
    const days=parseArr(w.daysOfWeek).map(n=>parseInt(n)).filter(Boolean);
    if(days.length&&!days.includes(wd))return false;
    const ws=clockMin(w.startTime),we=clockMin(w.endTime);
    return Number.isFinite(ws)&&Number.isFinite(we)&&start>=ws&&end<=we;
  });
}
function isNonPrimeEntitlement(entitlement){
  const band=String(entitlement?.timeBand||'');
  if(/非黄|非黄金|非黄金时段|非黄时间/.test(band))return true;
  if(/黄金时间|黄金时段/.test(band))return false;
  return /非黄|非黄金|非黄金时段|非黄时间/.test(String(entitlement?.packageName||''));
}
function entitlementTimeBandKind(entitlement){
  const band=String(entitlement?.timeBand||'');
  if(/非黄|非黄金|非黄金时段|非黄时间/.test(band))return 'nonprime';
  if(/黄金时间|黄金时段/.test(band))return 'prime';
  return '';
}
function standardTimeBandWindows(kind){
  if(kind==='prime')return [
    {startTime:'16:00',endTime:'22:00',daysOfWeek:[1,2,3,4,5]},
    {startTime:'09:00',endTime:'22:00',daysOfWeek:[6,7]}
  ];
  if(kind==='nonprime')return [
    {startTime:'09:00',endTime:'16:00',daysOfWeek:[1,2,3,4,5]}
  ];
  return [];
}
function isScheduleInsideEntitlementTimeWindows(schedule,entitlement){
  const kind=entitlementTimeBandKind(entitlement);
  if(kind==='prime')return true;
  const windows=standardTimeBandWindows(kind);
  return isScheduleInsideDailyTimeWindows(schedule,windows.length?windows:entitlement?.dailyTimeWindows);
}
function scheduleNeedsFieldFeeForEntitlement(entitlement,schedule){
  return isBillableSchedule(schedule)&&isNonPrimeEntitlement(entitlement)&&!isScheduleInsideEntitlementTimeWindows(schedule,entitlement);
}
function normalizeScheduleFieldFee(input={}){
  const requiresFieldFee=!!input.requiresFieldFee;
  const amount=requiresFieldFee?roundMoney(input.fieldFeeAmount||0):0;
  return {
    requiresFieldFee,
    fieldFeeReason:requiresFieldFee?String(input.fieldFeeReason||'排课场地费').trim():'',
    fieldFeeAmount:amount,
    fieldFeePayMethod:amount>0?String(input.fieldFeePayMethod||'').trim():'',
    fieldFeeNote:amount>0?String(input.fieldFeeNote||'排课场地费').trim():''
  };
}
function assertScheduleFieldFeeInput(schedule){
  if(!schedule?.requiresFieldFee)return;
  const amount=roundMoney(schedule.fieldFeeAmount||0);
  if(amount<=0)return;
  if(!String(schedule.fieldFeePayMethod||'').trim())throw new Error('请选择场地费支付方式');
  if(['储值扣款','课包划扣','大众点评券码','抖音券码','其他'].includes(String(schedule.fieldFeePayMethod||'').trim()))throw new Error('场地费支付方式不可用');
}
function buildScheduleFieldFeeFinancialLedger(schedule,user={},now=new Date().toISOString()){
  const amount=roundMoney(schedule?.fieldFeeAmount||0);
  if(!schedule?.requiresFieldFee||amount<=0)return null;
  return {
    id:`schedule-field-fee-${schedule.id}`,
    ledgerType:'schedule_field_fee',
    status:'active',
    sourceType:'schedule',
    sourceId:schedule.id,
    businessDate:String(schedule.startTime||now).slice(0,10),
    userId:String(schedule.studentId||parseArr(schedule.studentIds)[0]||''),
    userName:schedule.studentName||'',
    campus:schedule.campus||'',
    productSnapshotName:'排课场地费',
    businessType:'课程订场',
    action:'收款',
    paymentChannel:String(schedule.fieldFeePayMethod||'').trim(),
    cashDelta:Math.round(amount*100),
    recognizedRevenueDelta:Math.round(amount*100),
    deferredRevenueDelta:0,
    notes:schedule.fieldFeeNote||schedule.fieldFeeReason||'排课场地费',
    createdBy:user.name||'系统记录',
    createdAt:now,
    updatedAt:now
  };
}
async function syncScheduleFieldFeeFinancialLedger(schedule,user={},now=new Date().toISOString()){
  const row=buildScheduleFieldFeeFinancialLedger(schedule,user,now);
  const id=`schedule-field-fee-${schedule.id}`;
  if(row){
    await put(T_FINANCIAL_LEDGER,id,row);
    return row;
  }
  const existing=await get(T_FINANCIAL_LEDGER,id).catch(()=>null);
  if(existing){
    const voided={...existing,status:'voided',updatedAt:now,voidedAt:now,voidedBy:user.name||'系统记录'};
    await put(T_FINANCIAL_LEDGER,id,voided);
    return voided;
  }
  return null;
}
async function persistScheduleStoredValueCourts(update){
  const rows=Array.isArray(update?.courts)?update.courts:[];
  for(const court of rows)await put(T_COURTS,court.id,court);
  return rows;
}
async function rollbackScheduleStoredValueCourts(update){
  const rows=Array.isArray(update?.originalCourts)?update.originalCourts:[];
  for(const court of rows)await put(T_COURTS,court.id,court).catch(()=>null);
}
function validateEntitlementForSchedule(entitlement,schedule){
  if(!isBillableSchedule(schedule))return;
  if(!entitlement)return;
  if(entitlement.status&&entitlement.status!=='active')throw new Error('课包余额不可用');
  const lessonCount=isCountBasedCourse(schedule)?1:parseLessonValue(schedule.lessonCount,1);
  if(parseLessonValue(entitlement.remainingLessons)<lessonCount)throw new Error('课包剩余课时不足');
  const studentIds=parseArr(schedule.studentIds);
  if(entitlement.studentId&&studentIds.length&&!studentIds.includes(entitlement.studentId))throw new Error('课包所属学员不匹配');
  if(entitlement.courseType&&schedule.courseType&&entitlement.courseType!==schedule.courseType)throw new Error('课程类型不匹配');
  if(entitlement.courseType==='体验课'&&schedule.courseType==='体验课'&&entitlement.experienceType&&schedule.experienceType&&entitlement.experienceType!==schedule.experienceType)throw new Error('体验课类型不匹配');
  const campusIds=parseArr(entitlement.campusIds);
  if(campusIds.length&&schedule.campus&&!campusIds.map(normalizeCampusValue).includes(normalizeCampusValue(schedule.campus)))throw new Error('课包可用校区不匹配');
  const usedDate=dateKey(schedule.startTime);
  const from=entitlement.usageStartDate||entitlement.validFrom;
  if(from&&usedDate<from)throw new Error('不在课包可用日期范围');
  if(!isScheduleInsideEntitlementTimeWindows(schedule,entitlement)&&!scheduleNeedsFieldFeeForEntitlement(entitlement,schedule))throw new Error('不在课包可用时间段');
  const max=parseInt(entitlement.maxStudents)||0;
  if(max>0&&studentIds.length>max)throw new Error('课包适用人数不匹配');
  if(isSmallGroupCourse(entitlement)&&isSmallGroupCourse(schedule)){
    const entType=normalizeSmallClassType(entitlement.smallClassType);
    const schType=normalizeSmallClassType(schedule.smallClassType||schedule.packageSubType||schedule.subType,entType);
    if(!smallClassTypesCompatible(entType,schType))throw new Error('小班课类型不匹配');
  }
}
function isAnyCoachPackageValue(value){
  return ['不固定','不限教练','任意教练','全部教练'].includes(String(value||'').trim());
}
function filterFixedCoachValues(values){
  return parseArr(values).filter(value=>!isAnyCoachPackageValue(value));
}
function entitlementMatchesCoach(entitlement,coachName){
  const name=String(coachName||'').trim();
  if(!name)return false;
  return String(entitlement?.ownerCoach||'').trim()===name||parseArr(entitlement?.allowedCoaches).some(c=>String(c||'').trim()===name);
}
function scheduleEntitlementDeltas(rec){
  if(!rec||!isScheduleLessonCharged(rec))return[];
  const lessonCount=isCountBasedCourse(rec)?1:parseLessonValue(rec.lessonCount,1);
  if(lessonCount<=0)return[];
  const ids=parseArr(rec.entitlementIds).filter(Boolean);
  if(ids.length)return ids.map(entitlementId=>({entitlementId,delta:lessonCount}));
  if(rec.entitlementId)return[{entitlementId:rec.entitlementId,delta:lessonCount}];
  return[];
}
function normalizeCoachLateInfo(input={}){
  const late=!!input.coachLateFree;
  return {
    coachLateFree:late,
    lateMinutes:late?Math.max(0,parseInt(input.lateMinutes)||0):0,
    lateReason:late?String(input.lateReason||'').trim():'',
    coachLateFieldFeeAmount:late?Math.max(0,parseFloat(input.coachLateFieldFeeAmount)||0):0,
    coachLateHandledAt:late?String(input.coachLateHandledAt||'').trim():'',
    coachLateHandledBy:late?String(input.coachLateHandledBy||'').trim():''
  };
}
function buildCoachLateSettlementRows(schedules=[],month=''){
  return (schedules||[]).filter(s=>{
    if(!s?.coachLateFree)return false;
    const ds=String(s.startTime||'').slice(0,7);
    return !month||ds===month;
  }).map(s=>({
    scheduleId:s.id||'',
    month:String(s.startTime||'').slice(0,7),
    coach:s.coach||'',
    date:String(s.startTime||'').slice(0,10),
    time:`${String(s.startTime||'').slice(11,16)}-${String(s.endTime||'').slice(11,16)}`,
    campus:s.campus||'',
    venue:s.venue||'',
    studentName:s.studentName||'',
    lateMinutes:parseInt(s.lateMinutes)||0,
    fieldFeeAmount:parseFloat(s.coachLateFieldFeeAmount)||0
  }));
}
function recommendEntitlements(entitlements,schedule){
  const options=(entitlements||[]).map(ent=>{
    const warnings=[];
    try{validateEntitlementForSchedule(ent,schedule);}
    catch(e){warnings.push(e.message);}
    const requiresFieldFee=scheduleNeedsFieldFeeForEntitlement(ent,schedule);
    return {
      studentId:ent.studentId||'',
      entitlementId:ent.id,
      id:ent.id,
      packageName:ent.packageName||'',
      courseType:ent.courseType||'',
      experienceType:ent.experienceType||'',
      remainingLessons:parseLessonValue(ent.remainingLessons),
      totalLessons:parseLessonValue(ent.totalLessons),
      validUntil:ent.validUntil||'',
      timeBand:ent.timeBand||'',
      ownerCoach:ent.ownerCoach||'',
      requiresFieldFee,
      fieldFeeReason:requiresFieldFee?'排课场地费':'',
      selectable:warnings.length===0,
      warnings,
      _source:ent
    };
  }).sort((a,b)=>{
    if(a.selectable!==b.selectable)return a.selectable?-1:1;
    const av=a.validUntil||'9999-12-31',bv=b.validUntil||'9999-12-31';
    if(av!==bv)return av.localeCompare(bv);
    if(a.remainingLessons!==b.remainingLessons)return a.remainingLessons-b.remainingLessons;
    return String(a._source.purchaseDate||a._source.createdAt||'').localeCompare(String(b._source.purchaseDate||b._source.createdAt||''));
  });
  const clean=options.map(({_source,...rest})=>rest);
  return {recommended:clean.find(o=>o.selectable)||null,options:clean};
}
function resolveScheduleEntitlementDeltas(rec,entitlements=[]){
  const explicit=scheduleEntitlementDeltas(rec);
  if(explicit.length)return explicit;
  if(!rec||!isBillableSchedule(rec)||!isPackageSettlementSchedule(rec))return[];
  assertSmallGroupScheduleRules(rec);
  const lessonCount=isCountBasedCourse(rec)?1:parseLessonValue(rec.lessonCount,1);
  if(lessonCount<=0)return[];
  const attendIds=parseArr(rec.studentIds).filter(Boolean);
  const attendDeltas=attendIds.map(studentId=>{
    const options=(entitlements||[]).filter(e=>e.studentId===studentId);
    const {recommended}=recommendEntitlements(options,{...rec,studentIds:[studentId]});
    return recommended?{studentId,entitlementId:recommended.entitlementId,delta:lessonCount}:null;
  }).filter(Boolean);
  if(isSmallGroupCourse(rec)&&attendDeltas.length<attendIds.length)throw new Error('有学员没有可用课包');
  if(!isSmallGroupCourse(rec))return attendDeltas;
  const expected=parseArr(rec.expectedStudentIds).filter(Boolean);
  const absent=parseArr(rec.absentStudentIds).filter(Boolean);
  const absentBase=absent.length?absent:expected.filter(id=>!attendIds.includes(id));
  const absentDeltas=absentBase.map(studentId=>{
    const options=(entitlements||[]).filter(e=>e.studentId===studentId);
    const {recommended}=recommendEntitlements(options,{...rec,studentIds:[studentId]});
    if(!recommended)return null;
    const ent=(entitlements||[]).find(e=>e.id===recommended.entitlementId)||{};
    const limit=parseInt(ent.freeAbsenceLimit)||0;
    const used=parseInt(ent.freeAbsenceUsed)||0;
    if(used<limit)return null;
    return {studentId,entitlementId:recommended.entitlementId,delta:lessonCount,absenceCharged:true};
  }).filter(Boolean);
  return [...attendDeltas,...absentDeltas];
}
function applyEntitlementLessonDelta(entitlement,delta,now=new Date().toISOString()){
  const total=parseLessonValue(entitlement.totalLessons);
  const used=Math.max(0,parseLessonValue(entitlement.usedLessons)-parseLessonValue(delta));
  if(used>total)throw new Error('课包剩余课时不足');
  const remaining=Math.max(0,total-used);
  const status=remaining<=0?'depleted':(entitlement.status==='depleted'?'active':(entitlement.status||'active'));
  return {...entitlement,usedLessons:used,remainingLessons:remaining,status,updatedAt:now};
}
function manualEntitlementAdjustmentCampusSet({entitlement={},purchase={},packageRow={},student={}}={}){
  const packageSet=campusSetFromRow(packageRow);
  if(packageSet.size)return packageSet;
  const purchaseSet=campusSetFromRow(purchase);
  if(purchaseSet.size)return purchaseSet;
  const studentSet=campusSetFromRow(student);
  if(studentSet.size)return studentSet;
  return campusSetFromRow(entitlement);
}
function userCanManageManualEntitlementAdjustment(user,ctx={}){
  const profile=normalizePermissionProfile(user||{});
  if(profile.role!=='admin')return false;
  if(profile.dataScope!=='campus')return true;
  const targetSet=manualEntitlementAdjustmentCampusSet(ctx);
  if(!targetSet.size)return true;
  const allowed=new Set((profile.campusIds||[]).map(normalizeCampusValue).filter(Boolean));
  return campusSetsIntersect(targetSet,allowed);
}
function validateManualEntitlementAdjustment({entitlement={},purchase={},packageRow={},student={},user={},lessonDelta,relatedDate='',reason=''}={}){
  const delta=parseLessonValue(lessonDelta,0);
  if(!delta)throw new Error('请输入消课数量');
  if(!String(relatedDate||'').slice(0,10))throw new Error('请选择消课日期');
  if(!String(reason||'').trim())throw new Error('请填写备注');
  if(!userCanManageManualEntitlementAdjustment(user,{entitlement,purchase,packageRow,student}))throw new Error('无权限操作该课包');
  if(entitlement.status==='voided')throw new Error('已作废课包不能操作');
  const remaining=parseLessonValue(entitlement.remainingLessons);
  const used=parseLessonValue(entitlement.usedLessons);
  if(delta<0){
    if(entitlement.status&&entitlement.status!=='active')throw new Error('当前课包不可继续消课');
    const count=Math.abs(delta);
    if(remaining<count)throw new Error('课包剩余课时不足');
    const day=String(relatedDate||'').slice(0,10);
    const from=entitlement.usageStartDate||entitlement.validFrom||purchase.usageStartDate||packageRow.usageStartDate||'';
    const until=entitlement.usageEndDate||entitlement.validUntil||purchase.usageEndDate||packageRow.usageEndDate||'';
    if((from&&day<from)||(until&&day>until))throw new Error('不在课包可用日期范围');
  }else if(used<delta){
    throw new Error('退回课时不能超过已扣课时');
  }
}
function buildManualEntitlementLedgerRecord({entitlement={},lessonDelta,relatedDate='',reason='',user={},operationTrace=null}={},opts={}){
  const delta=parseLessonValue(lessonDelta,0);
  const notes=String(reason||'').trim();
  const action=delta<0?'manual_consume':'manual_return';
  const trace=operationTrace?Object.fromEntries(Object.entries(operationTrace).filter(([,value])=>value!==undefined&&value!==null&&value!=='')):null;
  return {
    id:opts.id||uuidv4(),
    entitlementId:entitlement.id||'',
    studentId:entitlement.studentId||'',
    purchaseId:entitlement.purchaseId||'',
    scheduleId:'',
    lessonDelta:delta,
    action,
    reason:`管理员${delta<0?'手动消课':'手动退回'}：${notes}`,
    notes,
    relatedDate:String(relatedDate||'').slice(0,10),
    sourceDate:String(relatedDate||'').slice(0,10),
    operator:user?.name||'',
    createdAt:opts.now||new Date().toISOString(),
    packageName:entitlement.packageName||'',
    coach:entitlement.ownerCoach||'',
    ...(trace||{})
  };
}
function applyEntitlementFreeAbsence(entitlement,now=new Date().toISOString()){
  const limit=parseInt(entitlement?.freeAbsenceLimit)||0;
  const used=parseInt(entitlement?.freeAbsenceUsed)||0;
  if(used>=limit)return entitlement;
  return {...entitlement,freeAbsenceUsed:used+1,updatedAt:now};
}
function returnEntitlementFreeAbsence(entitlement,now=new Date().toISOString()){
  const used=parseInt(entitlement?.freeAbsenceUsed)||0;
  return {...entitlement,freeAbsenceUsed:Math.max(0,used-1),updatedAt:now};
}
function assertScheduleEditableAfterFeedback(oldRec,nextRec,feedbacks){
  if(!oldRec||!nextRec)return;
  if(!(feedbacks||[]).some(f=>f.scheduleId===oldRec.id))return;
  const coreFields=['studentName','classId','entitlementId','startTime','endTime','coach','coachId','campus','venue','venueId','venueSpaceType','courseType','experienceType','isTrial','lessonCount','status'];
  const changed=coreFields.filter(k=>String(oldRec[k]??'')!==String(nextRec[k]??''));
  const oldStudents=parseArr(oldRec.studentIds).sort();
  const nextStudents=parseArr(nextRec.studentIds).sort();
  const sameStudents=oldStudents.length===nextStudents.length&&oldStudents.every((id,idx)=>id===nextStudents[idx]);
  if(!sameStudents)changed.push('studentIds');
  if(changed.length)throw new Error('该排课已有课后反馈，不能修改学员、班次、课包余额、时间、教练、校区、场地、课程类型、课时或状态');
}
function scheduleEntitlementDelta(rec){
  return scheduleEntitlementDeltas(rec)[0]||null;
}
function diffScheduleEntitlementDeltas(oldDeltas=[],nextDeltas=[]){
  const keyOf=d=>`${d.entitlementId}|${parseLessonValue(d.delta)}`;
  const nextCounts=new Map();
  nextDeltas.forEach(d=>nextCounts.set(keyOf(d),(nextCounts.get(keyOf(d))||0)+1));
  const returns=[];
  oldDeltas.forEach(d=>{
    const key=keyOf(d);
    const count=nextCounts.get(key)||0;
    if(count>0)nextCounts.set(key,count-1);
    else returns.push(d);
  });
  const oldCounts=new Map();
  oldDeltas.forEach(d=>oldCounts.set(keyOf(d),(oldCounts.get(keyOf(d))||0)+1));
  const consumes=[];
  nextDeltas.forEach(d=>{
    const key=keyOf(d);
    const count=oldCounts.get(key)||0;
    if(count>0)oldCounts.set(key,count-1);
    else consumes.push(d);
  });
  return {returns,consumes};
}
async function assertScheduleEntitlementCapacity(nextRec,oldRec){
  const nextDeltas=scheduleEntitlementDeltas(nextRec);
  if(!nextDeltas.length)return null;
  const oldDeltas=scheduleEntitlementDeltas(oldRec);
  const oldMap=new Map(oldDeltas.map(d=>[d.entitlementId,d.delta]));
  const checked=[];
  for(const nextDelta of nextDeltas){
    const ent=await withRequiredStorageTimeout(getCachedRow(T_ENTITLEMENTS,nextDelta.entitlementId),2500,'课包余额校验超时，请稍后重试');
    if(!ent)throw new Error('课包余额不存在');
    const adjusted=oldMap.has(nextDelta.entitlementId)?{...ent,status:'active',remainingLessons:parseLessonValue(ent.remainingLessons)+oldMap.get(nextDelta.entitlementId)}:ent;
    validateEntitlementForSchedule(adjusted,{...nextRec,studentIds:[adjusted.studentId].filter(Boolean)});
    checked.push(adjusted);
  }
  return checked;
}
async function applyEntitlementDelta(entitlementId,scheduleId,delta,action,reason,user,operationTrace=null){
  if(!entitlementId||!delta)return null;
  const ent=await getCachedRow(T_ENTITLEMENTS,entitlementId);
  if(!ent)return null;
  const next=withOperationTrace(applyEntitlementLessonDelta(ent,delta),operationTrace);
  await put(T_ENTITLEMENTS,entitlementId,next);
  await syncStudentActiveEntitlementIndexes(ent,next);
  const ledger=withOperationTrace({
    id:uuidv4(),
    entitlementId,
    studentId:ent.studentId||'',
    scheduleId:scheduleId||'',
    lessonDelta:delta,
    action,
    reason,
    operator:user?.name||'',
    createdAt:new Date().toISOString()
  },operationTrace);
  await put(T_ENTITLEMENT_LEDGER,ledger.id,ledger);
  return {entitlement:next,ledger};
}
async function applySmallGroupFreeAbsences(schedule,entitlements=[],user,operationTrace=null){
  if(!isSmallGroupCourse(schedule)||!isBillableSchedule(schedule))return[];
  const deltas=resolveScheduleEntitlementDeltas(schedule,entitlements);
  const chargedAbsent=new Set(deltas.filter(d=>d.absenceCharged).map(d=>d.studentId));
  const attending=new Set(parseArr(schedule.studentIds).filter(Boolean));
  const expected=parseArr(schedule.expectedStudentIds).filter(Boolean);
  const absent=parseArr(schedule.absentStudentIds).filter(Boolean);
  const absentBase=(absent.length?absent:expected.filter(id=>!attending.has(id))).filter(id=>!chargedAbsent.has(id));
  const rows=[];
  for(const studentId of absentBase){
    const ent=(entitlements||[]).find(e=>e.studentId===studentId&&isSmallGroupCourse(e)&&parseInt(e.freeAbsenceUsed)<(parseInt(e.freeAbsenceLimit)||0));
    if(!ent)continue;
    const next=withOperationTrace(applyEntitlementFreeAbsence(ent),operationTrace);
    await put(T_ENTITLEMENTS,ent.id,next);
    await syncStudentActiveEntitlementIndexes(ent,next);
    rows.push(withOperationTrace({
      id:uuidv4(),
      entitlementId:ent.id,
      studentId:ent.studentId||studentId,
      scheduleId:schedule.id||'',
      lessonDelta:0,
      action:'free_absence',
      reason:'小班课免费请假',
      operator:user?.name||'',
      createdAt:new Date().toISOString()
    },operationTrace));
    await put(T_ENTITLEMENT_LEDGER,rows[rows.length-1].id,rows[rows.length-1]);
  }
  return rows;
}
async function rollbackSmallGroupFreeAbsences(ledgerRows=[]){
  for(const row of ledgerRows||[]){
    if(row?.action!=='free_absence'||!row.entitlementId)continue;
    const ent=await getCachedRow(T_ENTITLEMENTS,row.entitlementId).catch(()=>null);
    if(!ent)continue;
    const next=returnEntitlementFreeAbsence(ent);
    await put(T_ENTITLEMENTS,ent.id,next).catch(()=>null);
    await syncStudentActiveEntitlementIndexes(ent,next).catch(()=>null);
    await del(T_ENTITLEMENT_LEDGER,row.id).catch(()=>null);
  }
}
async function restoreSmallGroupFreeAbsenceLedgerRows(ledgerRows=[]){
  for(const row of ledgerRows||[]){
    if(row?.action!=='free_absence'||!row.entitlementId)continue;
    const ent=await getCachedRow(T_ENTITLEMENTS,row.entitlementId).catch(()=>null);
    if(ent){
      const next=applyEntitlementFreeAbsence(ent);
      await put(T_ENTITLEMENTS,ent.id,next).catch(()=>null);
      await syncStudentActiveEntitlementIndexes(ent,next).catch(()=>null);
    }
    await put(T_ENTITLEMENT_LEDGER,row.id,row).catch(()=>null);
  }
}
function feedbackScopeForSchedule(schedule={}){
  const studentIds=parseArr(schedule?.studentIds).filter(Boolean);
  const courseType=String(schedule?.courseType||schedule?.type||schedule?.title||'').trim();
  if(schedule?.feedbackScope==='class'||schedule?.feedbackScope==='student')return schedule.feedbackScope;
  if(String(schedule?.classId||'').trim()&&(studentIds.length>1||/班课|训练营|小班|大师课/.test(courseType)))return 'class';
  return 'student';
}
function buildFeedbackRecord(body,base,user){
  if(!body.scheduleId)throw new Error('缺少排课ID');
  const now=new Date().toISOString();
  const studentIds=parseArr(body.studentIds).filter(Boolean);
  const feedbackScope=feedbackScopeForSchedule(body);
  const studentId=feedbackScope==='class'?'':(body.studentId||studentIds[0]||'');
  return {
    ...base,
    scheduleId:body.scheduleId,
    classId:body.classId||'',
    feedbackScope,
    studentId,
    studentIds,
    studentName:body.studentName||'',
    coach:body.coach||user?.name||'',
    startTime:body.startTime||'',
    campus:body.campus||'',
    venue:body.venue||'',
    lessonCount:body.lessonCount||0,
    isTrial:!!body.isTrial,
    remainingLessons:body.remainingLessons||'',
    practicedToday:body.practicedToday||body.focus||body.performance||'',
    knowledgePoint:body.knowledgePoint||body.problems||'',
    nextTraining:body.nextTraining||body.nextAdvice||'',
    playerLevel:body.playerLevel||'',
    goalType:body.goalType||'',
    experienceBackground:body.experienceBackground||'',
    mainIssues:body.mainIssues||'',
    conversionIntent:body.conversionIntent||'',
    recommendedProductType:body.recommendedProductType||'',
    recommendedReason:body.recommendedReason||'',
    needOpsFollowUp:body.needOpsFollowUp===true||body.needOpsFollowUp==='是',
    opsFollowUpPriority:body.opsFollowUpPriority||'',
    opsFollowUpSuggestion:body.opsFollowUpSuggestion||'',
    sentToStudent:body.sentToStudent||false,
    updatedBy:user?.name||'',
    updatedAt:now,
    createdAt:base.createdAt||now
  };
}
function buildCoachProposalRecord(body,base,user,schedule={}){
  if(!body.scheduleId)throw new Error('缺少排课ID');
  const now=new Date().toISOString();
  const studentIds=parseArr(schedule.studentIds||body.studentIds).filter(Boolean);
  const courseName=String(body.courseName||schedule.className||schedule.productName||schedule.courseType||'小班课').trim();
  const studentCount=body.studentCount==null||body.studentCount===''?studentIds.length:(parseInt(body.studentCount)||0);
  return {
    ...base,
    scheduleId:body.scheduleId,
    classId:schedule.classId||body.classId||'',
    coachId:schedule.coachId||body.coachId||user?.coachId||'',
    coachName:schedule.coach||body.coachName||body.coach||user?.coachName||user?.name||'',
    courseType:schedule.courseType||body.courseType||'小班课',
    courseName,
    studentLevel:String(body.studentLevel||'').trim(),
    studentCount,
    teachingGoal:String(body.teachingGoal||'').trim(),
    teachingOrganization:String(body.teachingOrganization||'').trim(),
    progression1:String(body.progression1||'').trim(),
    progression2:String(body.progression2||'').trim(),
    progression3:String(body.progression3||'').trim(),
    progressionLogic:String(body.progressionLogic||'').trim(),
    conclusion:String(body.conclusion||'').trim(),
    status:'submitted',
    submittedAt:base.submittedAt||now,
    updatedBy:user?.name||'',
    updatedAt:now,
    createdAt:base.createdAt||now
  };
}
function assertCanWriteCoachProposal(user,schedule,coachRefs=[]){
  if(!isSmallGroupCourse(schedule))throw new Error('只有小班课需要填写教练提案');
  assertCanWriteFeedback(user,schedule,coachRefs);
}
function assertCanWriteFeedback(user,schedule,coachRefs=[]){
  if(user?.role==='admin')return;
  const coachId=String(user?.coachId||user?.id||user?.username||'').trim();
  const coachName=String(user?.coachName||user?.name||'').trim();
  const authId=String(user?.id||user?.username||'').trim();
  const hasReliableCoachId=!!(coachId&&coachId!==authId);
  const scheduleCoachId=String(schedule?.coachId||'').trim();
  const scheduleCoach=String(schedule?.coach||'').trim();
  if(hasReliableCoachId&&scheduleCoachId){
    if(sameCoachName(coachId,scheduleCoachId,coachRefs))return;
    throw new Error('只能填写自己的课程反馈');
  }
  if(hasReliableCoachId&&scheduleCoach){
    if(sameCoachName(coachId,scheduleCoach,coachRefs))return;
    throw new Error('只能填写自己的课程反馈');
  }
  if(coachName&&scheduleCoach&&sameCoachName(coachName,scheduleCoach,coachRefs))return;
  throw new Error('只能填写自己的课程反馈');
}
function campusValuesFrom(value){
  if(value==null)return[];
  if(Array.isArray(value))return value.flatMap(campusValuesFrom);
  const raw=String(value||'').trim();
  if(!raw)return[];
  if(raw.startsWith('[')){
    try{return campusValuesFrom(JSON.parse(raw));}catch(e){}
  }
  return raw.split(/[,，;；|]/).map(item=>normalizeCampusValue(item)).filter(Boolean);
}
function addCampusValues(set,...values){
  values.flatMap(campusValuesFrom).forEach(value=>{if(value)set.add(value);});
  return set;
}
function addCampusSet(set,source){
  if(!source)return set;
  for(const value of source)set.add(value);
  return set;
}
function campusSetFromRow(row){
  const set=new Set();
  if(!row)return set;
  addCampusValues(
    set,
    row.campus,
    row.campusId,
    row.campusCode,
    row.campusName,
    row.sourceCampus,
    row.sourceCampusName,
    row.targetCampus,
    row.targetCampusName,
    row.venueCampus,
    row.campusIds,
    row.campuses
  );
  return set;
}
function campusSetFromCampusRow(row){
  const set=campusSetFromRow(row);
  addCampusValues(set,row?.id,row?.code,row?.name);
  return set;
}
function campusSetsIntersect(left,right){
  if(!left?.size||!right?.size)return false;
  for(const value of left)if(right.has(value))return true;
  return false;
}
function isCampusScopedAdmin(user){
  const profile=normalizePermissionProfile(user||{});
  return profile.role==='admin'&&profile.dataScope==='campus';
}
function buildCampusScopeContext(data,user){
  const profile=normalizePermissionProfile(user||{});
  const ctx={
    active:profile.role==='admin'&&profile.dataScope==='campus',
    allowed:new Set((profile.campusIds||[]).map(normalizeCampusValue).filter(Boolean)),
    byStudentId:new Map(),
    byClassId:new Map(),
    byScheduleId:new Map(),
    byCoachId:new Map(),
    byCoachName:new Map(),
    byPackageId:new Map(),
    byPurchaseId:new Map(),
    entitlementsByPurchaseId:new Map(),
    byEntitlementId:new Map(),
    byCourtId:new Map(),
    byMembershipAccountId:new Map(),
    byMembershipOrderId:new Map(),
    byLeadId:new Map(),
    schedulesByClassId:new Map(),
    schedulesByStudentId:new Map(),
    schedulesByCoachKey:new Map()
  };
  const put=(map,key,row)=>{const k=String(key||'').trim();if(k)map.set(k,row);};
  const push=(map,key,row)=>{const k=String(key||'').trim();if(k)map.set(k,[...(map.get(k)||[]),row]);};
  (data.students||[]).forEach(row=>put(ctx.byStudentId,row.id,row));
  (data.classes||[]).forEach(row=>put(ctx.byClassId,row.id,row));
  (data.schedule||[]).forEach(row=>{
    put(ctx.byScheduleId,row.id,row);
    push(ctx.schedulesByClassId,row.classId,row);
    parseArr(row.studentIds).forEach(id=>push(ctx.schedulesByStudentId,id,row));
    [row.coachId,row.coach,row.primaryCoachId,row.primaryCoach].forEach(key=>push(ctx.schedulesByCoachKey,key,row));
  });
  (data.coaches||[]).forEach(row=>{
    put(ctx.byCoachId,row.id,row);
    put(ctx.byCoachName,row.name,row);
  });
  (data.packages||[]).forEach(row=>put(ctx.byPackageId,row.id,row));
  (data.purchases||[]).forEach(row=>put(ctx.byPurchaseId,row.id,row));
  (data.entitlements||[]).forEach(row=>{
    put(ctx.byEntitlementId,row.id,row);
    push(ctx.entitlementsByPurchaseId,row.purchaseId,row);
  });
  (data.courts||[]).forEach(row=>put(ctx.byCourtId,row.id,row));
  (data.membershipAccounts||[]).forEach(row=>put(ctx.byMembershipAccountId,row.id,row));
  (data.membershipOrders||[]).forEach(row=>put(ctx.byMembershipOrderId,row.id,row));
  (data.leads||[]).forEach(row=>put(ctx.byLeadId,row.id,row));
  return ctx;
}
function campusSetForScopedRow(row,type,ctx){
  const set=type==='campuses'?campusSetFromCampusRow(row):campusSetFromRow(row);
  const addRow=(linked)=>addCampusSet(set,campusSetFromRow(linked));
  const addRows=(rows)=>{(rows||[]).forEach(addRow);};
  if(type==='students'){
    addRows(ctx.schedulesByStudentId.get(row?.id));
  }else if(type==='classes'){
    addRows(ctx.schedulesByClassId.get(row?.id));
  }else if(type==='schedule'){
    addRow(ctx.byClassId.get(String(row?.classId||'')));
    parseArr(row?.studentIds).forEach(id=>addRow(ctx.byStudentId.get(String(id||''))));
  }else if(type==='coaches'){
    [row?.id,row?.name].forEach(key=>addRows(ctx.schedulesByCoachKey.get(String(key||''))));
  }else if(type==='purchases'){
    addRow(ctx.byStudentId.get(String(row?.studentId||'')));
    addRow(ctx.byPackageId.get(String(row?.packageId||row?.originalPackageId||'')));
    addRows(ctx.entitlementsByPurchaseId.get(String(row?.id||'')));
  }else if(type==='entitlements'){
    const purchase=ctx.byPurchaseId.get(String(row?.purchaseId||''));
    addRow(purchase);
    addRow(ctx.byStudentId.get(String(row?.studentId||purchase?.studentId||'')));
    addRow(ctx.byPackageId.get(String(row?.packageId||purchase?.packageId||purchase?.originalPackageId||'')));
  }else if(type==='entitlementLedger'){
    const entitlement=ctx.byEntitlementId.get(String(row?.entitlementId||''));
    const purchase=ctx.byPurchaseId.get(String(row?.purchaseId||entitlement?.purchaseId||''));
    addRow(ctx.byScheduleId.get(String(row?.scheduleId||'')));
    addRow(entitlement);
    addRow(purchase);
    addRow(ctx.byStudentId.get(String(row?.studentId||entitlement?.studentId||purchase?.studentId||'')));
    addRow(ctx.byPackageId.get(String(entitlement?.packageId||purchase?.packageId||purchase?.originalPackageId||'')));
  }else if(type==='plans'){
    addRow(ctx.byStudentId.get(String(row?.studentId||'')));
    addRow(ctx.byClassId.get(String(row?.classId||'')));
    addRows(ctx.schedulesByClassId.get(String(row?.classId||'')));
  }else if(type==='feedbacks'||type==='coachProposals'){
    addRow(ctx.byScheduleId.get(String(row?.scheduleId||'')));
  }else if(type==='membershipAccounts'){
    addRow(ctx.byCourtId.get(String(row?.courtId||'')));
  }else if(type==='membershipOrders'){
    const account=ctx.byMembershipAccountId.get(String(row?.membershipAccountId||''));
    addRow(account);
    addRow(ctx.byCourtId.get(String(row?.courtId||account?.courtId||'')));
  }else if(type==='membershipBenefitLedger'||type==='membershipAccountEvents'){
    const account=ctx.byMembershipAccountId.get(String(row?.membershipAccountId||''));
    const order=ctx.byMembershipOrderId.get(String(row?.membershipOrderId||''));
    addRow(account);
    addRow(order);
    addRow(ctx.byCourtId.get(String(row?.courtId||account?.courtId||order?.courtId||'')));
  }else if(type==='leads'){
    const account=ctx.byMembershipAccountId.get(String(row?.membershipAccountId||''));
    addRow(ctx.byStudentId.get(String(row?.studentId||'')));
    addRow(ctx.byCourtId.get(String(row?.courtId||account?.courtId||'')));
    addRow(account);
  }else if(type==='leadFollowups'){
    addRow(ctx.byLeadId.get(String(row?.leadId||'')));
  }else if(type==='financialLedger'){
    addRow(ctx.byStudentId.get(String(row?.studentId||'')));
    addRow(ctx.byCourtId.get(String(row?.courtId||'')));
    addRow(ctx.byScheduleId.get(String(row?.scheduleId||'')));
  }
  return set;
}
function campusScopedRowVisible(row,type,ctx){
  if(!ctx.active)return true;
  if(!ctx.allowed.size)return false;
  const campusSet=campusSetForScopedRow(row,type,ctx);
  if(['products','packages','membershipPlans','pricePlans'].includes(type)&&!campusSet.size)return true;
  return campusSetsIntersect(campusSet,ctx.allowed);
}
function filterCampusScopedData(data,user){
  const ctx=buildCampusScopeContext(data,user);
  if(!ctx.active)return data;
  return Object.fromEntries(Object.entries(data).map(([key,value])=>[
    key,
    Array.isArray(value)?value.filter(row=>campusScopedRowVisible(row,key,ctx)):value
  ]));
}
function filterLoadAllForUser(data,user,coachRefs=[]){
  const normalized={
    courts:Array.isArray(data?.courts)?data.courts:[],
    students:Array.isArray(data?.students)?data.students:[],
    products:Array.isArray(data?.products)?data.products:[],
    packages:Array.isArray(data?.packages)?data.packages:[],
    purchases:Array.isArray(data?.purchases)?data.purchases:[],
    entitlements:Array.isArray(data?.entitlements)?data.entitlements:[],
    entitlementLedger:Array.isArray(data?.entitlementLedger)?data.entitlementLedger:[],
    financialLedger:Array.isArray(data?.financialLedger)?data.financialLedger:[],
    membershipPlans:Array.isArray(data?.membershipPlans)?data.membershipPlans:[],
    membershipAccounts:Array.isArray(data?.membershipAccounts)?data.membershipAccounts:[],
    membershipOrders:Array.isArray(data?.membershipOrders)?data.membershipOrders:[],
    membershipBenefitLedger:Array.isArray(data?.membershipBenefitLedger)?data.membershipBenefitLedger:[],
    membershipAccountEvents:Array.isArray(data?.membershipAccountEvents)?data.membershipAccountEvents:[],
    pricePlans:Array.isArray(data?.pricePlans)?data.pricePlans:[],
    plans:Array.isArray(data?.plans)?data.plans:[],
    schedule:Array.isArray(data?.schedule)?data.schedule:[],
    coaches:Array.isArray(data?.coaches)?data.coaches:[],
    classes:Array.isArray(data?.classes)?data.classes:[],
    campuses:Array.isArray(data?.campuses)?data.campuses:[],
    feedbacks:Array.isArray(data?.feedbacks)?data.feedbacks:[],
    coachProposals:Array.isArray(data?.coachProposals)?data.coachProposals:[],
    leads:Array.isArray(data?.leads)?data.leads:[],
    leadFollowups:Array.isArray(data?.leadFollowups)?data.leadFollowups:[]
  };
  const profile=normalizePermissionProfile(user||{});
  if(profile.role==='admin')return filterCampusScopedData(normalized,user);
  const coachId=String(user?.coachId||user?.id||'').trim();
  const coachName=String(user?.coachName||user?.name||'').trim();
  const authId=String(user?.id||user?.username||'').trim();
  const hasReliableCoachId=!!(coachId&&coachId!==authId);
  const rowMatchesCoach=(row)=>{
    const rowCoachId=String(row?.coachId||row?.primaryCoachId||'').trim();
    const rowCoachName=String(row?.coach||row?.primaryCoach||'').trim();
    if(hasReliableCoachId&&rowCoachId)return sameCoachName(rowCoachId,coachId,coachRefs);
    if(hasReliableCoachId&&rowCoachName)return sameCoachName(rowCoachName,coachId,coachRefs)||sameCoachName(rowCoachName,coachName,coachRefs);
    return coachName&&rowCoachName&&sameCoachName(rowCoachName,coachName,coachRefs);
  };
  const ownSchedule=normalized.schedule.filter(rowMatchesCoach);
  const scheduleIds=new Set(ownSchedule.map(s=>s.id).filter(Boolean));
  const scheduleClassIds=new Set(ownSchedule.map(s=>s.classId).filter(Boolean));
  const ownClasses=normalized.classes.filter(c=>rowMatchesCoach(c)||scheduleClassIds.has(c.id));
  const classIds=new Set([...ownClasses.map(c=>c.id).filter(Boolean),...scheduleClassIds]);
  const studentIds=new Set();
  normalized.students.filter(rowMatchesCoach).forEach(s=>studentIds.add(s.id));
  ownSchedule.forEach(s=>parseArr(s.studentIds).forEach(id=>studentIds.add(id)));
  ownClasses.forEach(c=>parseArr(c.studentIds).forEach(id=>studentIds.add(id)));
  const ownPlans=normalized.plans.filter(p=>studentIds.has(p.studentId)||classIds.has(p.classId));
  ownPlans.forEach(p=>{if(p.studentId)studentIds.add(p.studentId);});
  const safeEntitlements=normalized.entitlements.filter(e=>studentIds.has(e.studentId)).map(e=>({
    id:e.id,studentId:e.studentId,studentName:e.studentName,packageName:e.packageName,courseType:e.courseType,totalLessons:e.totalLessons,usedLessons:e.usedLessons,remainingLessons:e.remainingLessons,validFrom:e.validFrom,validUntil:e.validUntil,timeBand:e.timeBand,status:e.status,ownerCoach:e.ownerCoach,allowedCoaches:parseArr(e.allowedCoaches)
  }));
  const visibleEntitlementIds=new Set(normalized.entitlements.filter(e=>studentIds.has(e.studentId)).map(e=>e.id).filter(Boolean));
  const safeLedger=normalized.entitlementLedger.filter(l=>{
    if(scheduleIds.has(l.scheduleId))return true;
    if(Number(l.lessonDelta)>=0)return false;
    return studentIds.has(l.studentId)||visibleEntitlementIds.has(l.entitlementId);
  }).map(l=>({
    id:l.id,entitlementId:l.entitlementId,studentId:l.studentId,scheduleId:l.scheduleId,lessonDelta:l.lessonDelta,action:l.action,reason:l.reason,createdAt:l.createdAt,relatedDate:l.relatedDate,sourceMonth:l.sourceMonth,importSource:l.importSource,notes:l.notes,sourceDate:l.sourceDate,sourceTimeBand:l.sourceTimeBand,sourceVenue:l.sourceVenue,venue:l.venue,courtName:l.courtName,court:l.court,coach:l.coach,scheduleTime:l.scheduleTime
  }));
  const safePurchases=normalized.purchases.filter(p=>studentIds.has(p.studentId)).map(p=>({
    id:p.id,
    studentId:p.studentId||'',
    studentName:p.studentName||'',
    purchaseDate:p.purchaseDate||'',
    createdAt:p.createdAt||'',
    status:p.status||'active'
  }));
  return {
    courts:[],
    students:normalized.students.filter(s=>studentIds.has(s.id)),
    products:normalized.products,
    packages:[],
    purchases:safePurchases,
    entitlements:safeEntitlements,
    entitlementLedger:normalizeEntitlementLedgerRowsForDetailView(safeLedger),
    financialLedger:[],
    membershipPlans:[],
    membershipAccounts:[],
    membershipOrders:[],
    membershipBenefitLedger:[],
    membershipAccountEvents:[],
    pricePlans:[],
    plans:ownPlans,
    schedule:ownSchedule,
    coaches:normalized.coaches.filter(c=>sameCoachName(c.id||c.name,coachId||coachName,coachRefs)),
    classes:ownClasses,
    campuses:normalized.campuses,
    feedbacks:normalized.feedbacks.filter(f=>scheduleIds.has(f.scheduleId)),
    coachProposals:normalized.coachProposals.filter(p=>scheduleIds.has(p.scheduleId)),
    leads:[],
    leadFollowups:[]
  };
}
function addCoachAliasValue(values,value){
  const raw=String(value||'').trim();
  if(!raw)return;
  const base=raw.replace(/教练$/,'').trim();
  [raw,base,base?`${base}教练`:''].filter(Boolean).forEach(item=>values.add(item));
}
function coachAliasParts(value){
  const raw=String(value||'').trim();
  if(!raw)return [];
  const candidates=[raw,raw.replace(/教练$/,'').trim()];
  const parts=[];
  candidates.forEach(item=>{
    String(item||'').split(/[\/+、,，;；|]/).forEach(part=>{
      const text=part.trim();
      if(!text)return;
      parts.push(text);
      text.split(/\s+/).forEach(word=>{if(word)parts.push(word);});
    });
  });
  return [...new Set(parts)];
}
function coachRefAliases(value,coachRefs=[]){
  const raw=String(value||'').trim();
  const refs=Array.isArray(coachRefs)?coachRefs:[];
  if(!raw)return [];
  const values=new Set();
  coachAliasParts(raw).forEach(part=>addCoachAliasValue(values,part));
  refs.forEach(ref=>{
    const id=String(ref?.id||'').trim();
    const name=String(ref?.name||'').trim();
    const current=[...values];
    if(current.includes(id)||current.includes(name)){
      coachAliasParts(id).forEach(part=>addCoachAliasValue(values,part));
      coachAliasParts(name).forEach(part=>addCoachAliasValue(values,part));
    }
  });
  return [...values];
}
function sameCoachName(a,b,coachRefs=[]){
  const left=coachRefAliases(a,coachRefs);
  const right=new Set(coachRefAliases(b,coachRefs));
  return left.some(item=>right.has(item));
}
function buildCoachRefs({coaches=[],users=[]}={}){
  const refs=[];
  const seen=new Set();
  const push=(id,name)=>{
    const cid=String(id||'').trim();
    const cname=String(name||'').trim();
    if(!cid&&!cname)return;
    const key=`${cid}::${cname}`;
    if(seen.has(key))return;
    seen.add(key);
    refs.push({id:cid,name:cname});
  };
  (coaches||[]).forEach(coach=>push(coach?.id,coach?.name));
  LEGACY_STATIC_COACH_REFS.forEach(ref=>push(ref.id,ref.name));
  (users||[]).filter(user=>String(user?.role||'')==='editor').forEach(user=>{
    const coachName=user?.coachName||user?.name;
    push(user?.coachId||user?.id||user?.username,coachName);
    if(user?.id&&user?.coachId&&String(user.id).trim()!==String(user.coachId).trim())push(user.id,coachName);
    if(user?.username&&user?.coachId&&String(user.username).trim()!==String(user.coachId).trim())push(user.username,coachName);
  });
  return refs;
}
const {buildCoachRenameUpdates,assertCanDeleteCoachName,assertUniqueCoachName}=createCoachRuleHelpers({parseArr,sameCoachName});
const handleCoachRoutes=createCoachRoutes({
  init,sendJson:routeSendJson,getCachedScan,get,scan,put,del,filterLoadAllForUser,uuidv4,
  assertPhone,timed,withTimeout,scanFeedbacks,putFeedback,
  buildCoachRenameUpdates,assertCanDeleteCoachName,assertUniqueCoachName,
  T_COACHES,T_CLASSES,T_SCHEDULE,T_PLANS,T_USERS,T_FEEDBACKS,T_LEADS,T_STUDENTS,
  T_PACKAGES,T_PURCHASES,T_ENTITLEMENTS
});
const handleProductRoutes=createProductRoutes({
  init,sendJson:routeSendJson,getCachedScan,get,scan,put,del,uuidv4,
  normalizeProductRecord,assertCanEditProductWithReferences,assertCanDeleteProduct,
  buildProductRenameDisplayUpdates,
  T_PRODUCTS,T_CLASSES,T_PACKAGES,T_PLANS
});
const handlePackageRoutes=createPackageRoutes({init,sendJson:routeSendJson,getCachedScan,get,scan,put,del,filterLoadAllForUser,uuidv4,
  parseArr,normalizePackageRecord,assertCanEditPackageWithPurchases,buildPackageDeactivateUpdate,syncSoldPackageRuleSnapshots,
  buildPackageMergeUpdates,syncStudentActiveEntitlementIndexes,T_PACKAGES,T_PRODUCTS,T_COACHES,T_CAMPUSES,T_PURCHASES,T_ENTITLEMENTS,T_SCHEDULE});
const handleScheduleRoutes=createScheduleRoutes({
  init,sendJson:routeSendJson,getScheduleListRows,filterLoadAllForUser,getCachedScan,getCoachScheduleRowsForUser,
  buildCoachRefs,timedEndpointMetric,assertCanWriteSchedule,uuidv4,buildOperationTrace,withOperationTrace,
  normalizeCoachLateInfo,normalizeScheduleFieldFee,parseArr,normalizeVenue,timed,validateScheduleSave,
  assertScheduleEntitlementRequired,assertScheduleFieldFeeInput,withRequiredStorageTimeout,
  resolveScheduleEntitlementDeltas,assertScheduleEntitlementCapacity,scheduleStoredValuePaymentAmount,
  getFastStudentsRead,buildScheduleStoredValueCourtUpdate,put,scheduleLessonDelta,applyEntitlementDelta,
  applySmallGroupFreeAbsences,applyLessonDelta,syncScheduleFieldFeeFinancialLedger,persistScheduleStoredValueCourts,
  syncCoachScheduleIndexes,del,rollbackScheduleStoredValueCourts,rollbackSmallGroupFreeAbsences,
  scheduleSaveErrorStatus,get,withTimeout,scanFeedbacks,assertScheduleEditableAfterFeedback,scan,
  scheduleEntitlementDeltas,restoreSmallGroupFreeAbsenceLedgerRows,parseLessonValue,returnEntitlementFreeAbsence,
  diffScheduleEntitlementDeltas,effectiveScheduleStatus,assertCanDeleteSchedule,
  T_SCHEDULE,T_COACHES,T_USERS,T_ENTITLEMENTS,T_COURTS,T_ENTITLEMENT_LEDGER
});
const handleAdminUserRoutes=createAdminUserRoutes({
  init,sendJson:routeSendJson,bcrypt,assertPhone,buildStoredPermissionFields,put,get,
  unbindWechatUserWithIndex,buildOfficialAccountUnboundUser,isProductionRuntime,
  scanFirstRows,getCachedScan,buildAdminUserView,isVisibleAdminUser,
  PRODUCTION_PAGE_READ_LIMITS,ADMIN_USER_LIST_PROJECTION_FIELDS,T_USERS
});
const handleAdminToolRoutes=createAdminToolRoutes({
  init,sendJson:routeSendJson,clearTables,scan,del
});
const handlePackageBoardRoutes=createPackageBoardRoutes({
  init,sendJson:routeSendJson,get,put,T_MATCH_SETTINGS
});
function buildWechatCode2SessionUrl(appid,secret,code){
  return `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
}
function extractWechatOpenId(data){
  if(data?.openid)return String(data.openid);
  const msg=data?.errmsg||data?.errcode||'unknown';
  throw new Error(`微信登录失败：${msg}`);
}
function resolveWechatMiniConfig(kind='coach'){
  if(kind==='match'){
    return {
      appid: MATCH_MINIPROGRAM_APPID || WECHAT_MINIPROGRAM_APPID,
      secret: MATCH_MINIPROGRAM_SECRET || WECHAT_MINIPROGRAM_SECRET,
      errorText: '缺少约球小程序密钥配置'
    };
  }
  return {
    appid: WECHAT_MINIPROGRAM_APPID,
    secret: WECHAT_MINIPROGRAM_SECRET,
    errorText: '缺少微信小程序密钥配置'
  };
}
async function fetchWechatSession(code,kind='coach'){
  const config=resolveWechatMiniConfig(kind);
  if(!config.secret)throw new Error(config.errorText);
  const url=buildWechatCode2SessionUrl(config.appid,config.secret,code);
  const res=await fetch(url);
  const data=await res.json();
  return data;
}
function buildWechatBoundUser(user,openid,now=new Date().toISOString()){
  return {...user,wechatOpenId:String(openid||''),wechatBoundAt:now};
}
function buildWechatUnboundUser(user){
  return {...user,wechatOpenId:'',wechatBoundAt:''};
}
function buildOfficialAccountBoundUser(user,openid,now=new Date().toISOString()){
  return {...user,officialAccountOpenId:String(openid||''),officialAccountBoundAt:now};
}
function buildOfficialAccountUnboundUser(user){
  return {...user,officialAccountOpenId:'',officialAccountBoundAt:''};
}
function buildWechatUserIndexRow(user){
  return {
    userId:String(user?.id||''),
    role:String(user?.role||''),
    coachId:String(user?.coachId||''),
    coachName:String(user?.coachName||user?.name||''),
    updatedAt:new Date().toISOString()
  };
}
function buildAdminUserView(u){
  const profile=normalizePermissionProfile(u);
  return {
    id:u.id,
    name:u.name,
    phone:u.phone||'',
    role:profile.role,
    systemType:profile.systemType,
    dataScope:profile.dataScope,
    campusIds:profile.campusIds,
    status:u.status||'active',
    coachId:u.coachId||'',
    coachName:u.coachName||'',
    featurePermissions:profile.featurePermissions,
    matchPermissions:profile.featurePermissions,
    wechatBound:!!u.wechatOpenId,
    wechatBoundAt:u.wechatBoundAt||'',
    officialAccountBound:!!u.officialAccountOpenId,
    officialAccountBoundAt:u.officialAccountBoundAt||''
  };
}
function buildStoredPermissionFields(user){
  const profile=normalizePermissionProfile(user);
  return {
    systemType:profile.systemType,
    dataScope:profile.dataScope,
    campusIds:profile.campusIds,
    featurePermissions:profile.featurePermissions,
    permissions:profile.featurePermissions,
    matchPermissions:profile.featurePermissions,
    matchOps:profile.featurePermissions.includes('match_ops'),
    matchFinance:profile.featurePermissions.includes('match_finance')
  };
}
function isVisibleAdminUser(u){
  return String(u?.id||'')!=='pkgmergeadmin';
}
function buildWechatAccessTokenUrl(appid,secret){
  return `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`;
}
function buildWechatSignature(token,timestamp,nonce,encrypted=''){
  return crypto.createHash('sha1').update([token,timestamp,nonce,encrypted].map(x=>String(x||'')).sort().join('')).digest('hex');
}
function officialAccountAesKeyBuffer(encodingAesKey=''){
  const text=String(encodingAesKey||'').trim();
  if(text.length!==43)throw new Error('服务号 EncodingAESKey 长度不正确');
  return Buffer.from(`${text}=`, 'base64');
}
function pkcs7Unpad(buffer){
  if(!Buffer.isBuffer(buffer)||!buffer.length)return buffer;
  const pad=buffer[buffer.length-1];
  if(!pad||pad>32)return buffer;
  return buffer.subarray(0,buffer.length-pad);
}
function decryptWechatOfficialAccountMessage(encrypted,encodingAesKey,appId=''){
  const aesKey=officialAccountAesKeyBuffer(encodingAesKey);
  const iv=aesKey.subarray(0,16);
  const decipher=crypto.createDecipheriv('aes-256-cbc',aesKey,iv);
  decipher.setAutoPadding(false);
  const decrypted=Buffer.concat([decipher.update(String(encrypted||''),'base64'),decipher.final()]);
  const plain=pkcs7Unpad(decrypted);
  const msgLength=plain.readUInt32BE(16);
  const message=plain.subarray(20,20+msgLength).toString('utf8');
  const fromAppId=plain.subarray(20+msgLength).toString('utf8');
  if(appId&&fromAppId!==String(appId||''))throw new Error('服务号 AppID 不匹配');
  return {message,appId:fromAppId};
}
function resolveOfficialAccountCallbackEcho({token,timestamp,nonce,signature,encryptedEcho,encodingAesKey,appId}){
  const expected=buildWechatSignature(token,timestamp,nonce,encryptedEcho);
  if(String(signature||'').trim()!==expected)throw new Error('服务号签名校验失败');
  return decryptWechatOfficialAccountMessage(encryptedEcho,encodingAesKey,appId).message;
}
function pkcs7Pad(buffer){
  const blockSize=32;
  const pad=blockSize-(buffer.length%blockSize||blockSize);
  return Buffer.concat([buffer,Buffer.alloc(pad,pad)]);
}
function encryptWechatOfficialAccountMessage(message,encodingAesKey,appId=''){
  const aesKey=officialAccountAesKeyBuffer(encodingAesKey);
  const iv=aesKey.subarray(0,16);
  const random16=crypto.randomBytes(16);
  const messageBuf=Buffer.from(String(message||''),'utf8');
  const lenBuf=Buffer.alloc(4);
  lenBuf.writeUInt32BE(messageBuf.length,0);
  const plain=pkcs7Pad(Buffer.concat([random16,lenBuf,messageBuf,Buffer.from(String(appId||''),'utf8')]));
  const cipher=crypto.createCipheriv('aes-256-cbc',aesKey,iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(plain),cipher.final()]).toString('base64');
}
function getWechatXmlValue(xml,tag){
  const text=String(xml||'');
  const cdata=text.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`));
  if(cdata)return cdata[1];
  const plain=text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return plain?String(plain[1]||'').trim():'';
}
function parseWechatOfficialAccountXml(xml){
  const text=String(xml||'').trim();
  if(!text)return {};
  return {
    ToUserName:getWechatXmlValue(text,'ToUserName'),
    FromUserName:getWechatXmlValue(text,'FromUserName'),
    CreateTime:getWechatXmlValue(text,'CreateTime'),
    MsgType:getWechatXmlValue(text,'MsgType'),
    Content:getWechatXmlValue(text,'Content'),
    MsgId:getWechatXmlValue(text,'MsgId'),
    Event:getWechatXmlValue(text,'Event'),
    EventKey:getWechatXmlValue(text,'EventKey'),
    Ticket:getWechatXmlValue(text,'Ticket'),
    Encrypt:getWechatXmlValue(text,'Encrypt')
  };
}
function wrapWechatCdata(value){
  return `<![CDATA[${String(value||'').replace(/]]>/g,']]]]><![CDATA[>')}]]>`;
}
function buildWechatOfficialAccountTextReplyXml({toUserName,fromUserName,content,createTime=new Date()}){
  const epoch=Math.floor((createTime instanceof Date?createTime.getTime():Date.now())/1000);
  return `<xml><ToUserName>${wrapWechatCdata(toUserName)}</ToUserName><FromUserName>${wrapWechatCdata(fromUserName)}</FromUserName><CreateTime>${epoch}</CreateTime><MsgType>${wrapWechatCdata('text')}</MsgType><Content>${wrapWechatCdata(content)}</Content></xml>`;
}
function buildWechatOfficialAccountEncryptedReplyXml({plainXml,token,timestamp,nonce,encodingAesKey,appId}){
  const encrypted=encryptWechatOfficialAccountMessage(plainXml,encodingAesKey,appId);
  const ts=String(timestamp||Math.floor(Date.now()/1000));
  const no=String(nonce||crypto.randomBytes(8).toString('hex'));
  const signature=buildWechatSignature(token,ts,no,encrypted);
  return `<xml><Encrypt>${wrapWechatCdata(encrypted)}</Encrypt><MsgSignature>${wrapWechatCdata(signature)}</MsgSignature><TimeStamp>${wrapWechatCdata(ts)}</TimeStamp><Nonce>${wrapWechatCdata(no)}</Nonce></xml>`;
}
function extractOfficialAccountBindingPhone(text){
  const raw=String(text||'').trim();
  const match=raw.match(/^(?:#|＃)?\s*绑定(?:\s*|[:：]\s*)(1[3-9]\d{9})\s*$/);
  if(!match)return '';
  return assertPhone(match[1]);
}
function findOfficialAccountUserByPhone(users=[],phone='',coaches=[]){
  const normalized=assertPhone(phone);
  const matches=(users||[]).filter(u=>normalizePhone(u?.phone||'')===normalized);
  const directCoachMatches=matches.filter(u=>String(u?.role||'')==='editor');
  const linkedCoachIds=new Set((coaches||[]).filter(c=>normalizePhone(c?.phone||'')===normalized).map(c=>String(c?.id||'').trim()).filter(Boolean));
  const linkedCoachNames=new Set((coaches||[]).filter(c=>normalizePhone(c?.phone||'')===normalized).map(c=>String(c?.name||'').trim()).filter(Boolean));
  const linkedCoachMatches=(users||[]).filter(u=>String(u?.role||'')==='editor'&&(
    linkedCoachIds.has(String(u?.coachId||'').trim())||
    linkedCoachNames.has(String(u?.coachName||u?.name||'').trim())
  ));
  const coachMatches=[...directCoachMatches,...linkedCoachMatches].filter((u,i,arr)=>arr.findIndex(x=>String(x?.id||'')===String(u?.id||''))===i);
  const adminMatches=matches.filter(u=>String(u?.role||'')==='admin');
  if(matches.length===0&&coachMatches.length===0)return {user:null,error:'未找到对应的管理或教练账号'};
  if(coachMatches.length>1)return {user:null,error:'手机号对应多个教练账号，请先清理后台数据'};
  if(coachMatches.length===0&&adminMatches.length===0)return {user:null,error:'该手机号不是管理或教练账号'};
  if(coachMatches.length===0&&adminMatches.length>1)return {user:null,error:'手机号对应多个管理员账号，请先清理后台数据'};
  const user=coachMatches[0]||adminMatches[0];
  if(String(user?.status||'active')==='inactive')return {user:null,error:'该账号已停用'};
  return {user};
}
async function bindOfficialAccountUserByPhone({phone,openid,now=new Date().toISOString(),loadUsers=()=>getCachedScan(T_USERS).catch(()=>[]),loadCoaches=()=>getCachedScan(T_COACHES).catch(()=>[]),putUser=(id,user)=>put(T_USERS,id,user)}={}){
  const currentUsers=await loadUsers();
  let targetResult=findOfficialAccountUserByPhone(currentUsers,phone);
  if(!targetResult.user){
    const currentCoaches=await loadCoaches();
    targetResult=findOfficialAccountUserByPhone(currentUsers,phone,currentCoaches);
  }
  if(!targetResult.user)return {success:false,error:targetResult.error};
  const targetUser=targetResult.user;
  const nextOpenId=String(openid||'').trim();
  if(!nextOpenId)return {success:false,error:'缺少服务号 OpenID'};
  const existingOwner=(currentUsers||[]).find(u=>String(u?.officialAccountOpenId||'').trim()===nextOpenId&&String(u?.id||'')!==String(targetUser.id||''));
  if(existingOwner){
    await putUser(existingOwner.id,buildOfficialAccountUnboundUser(existingOwner));
  }
  const nextUser=buildOfficialAccountBoundUser(targetUser,nextOpenId,targetUser.officialAccountOpenId===nextOpenId?(targetUser.officialAccountBoundAt||now):now);
  await putUser(targetUser.id,nextUser);
  return {success:true,user:nextUser,rebound:!!existingOwner,message:'绑定成功，后续将接收排课提醒。'};
}
async function readRequestText(req){
  if(typeof req?.body==='string')return req.body;
  if(Buffer.isBuffer(req?.body))return req.body.toString('utf8');
  if(typeof req?.rawBody==='string')return req.rawBody;
  if(Buffer.isBuffer(req?.rawBody))return req.rawBody.toString('utf8');
  if(typeof req?.text==='function')return await req.text();
  if(req&&typeof req.on==='function'){
    const chunks=[];
    await new Promise((resolve,reject)=>{
      req.on('data',chunk=>chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)));
      req.on('end',resolve);
      req.on('error',reject);
    });
    return Buffer.concat(chunks).toString('utf8');
  }
  return '';
}
async function processOfficialAccountCallbackRequest({query,rawBody,loadUsers=()=>getCachedScan(T_USERS).catch(()=>[]),loadStudents=()=>getCachedScan(T_STUDENTS).catch(()=>[]),loadCoaches=()=>getCachedScan(T_COACHES).catch(()=>[]),loadRows=()=>getCachedScan(T_SCHEDULE).catch(()=>[]),loadQueryData=async()=>({users:await scan(T_USERS).catch(()=>[]),students:await scan(T_STUDENTS).catch(()=>[]),coaches:await scan(T_COACHES).catch(()=>[]),rows:await scan(T_SCHEDULE).catch(()=>[])}),putUser=(id,user)=>put(T_USERS,id,user),loadQuerySession=(openid)=>loadOfficialAccountQuerySession(openid),putQuerySession=(row)=>saveOfficialAccountQuerySession(row),deleteQuerySession=(openid)=>deleteOfficialAccountQuerySession(openid),now=new Date(),token=WECHAT_OFFICIAL_ACCOUNT_TOKEN,appId=WECHAT_OFFICIAL_ACCOUNT_APPID,encodingAesKey=WECHAT_OFFICIAL_ACCOUNT_ENCODING_AES_KEY}={}){
  const bodyText=String(rawBody||'').trim();
  const outerMessage=parseWechatOfficialAccountXml(bodyText);
  const timestamp=String(query?.get('timestamp')||'');
  const nonce=String(query?.get('nonce')||'');
  const encryptedEcho=String(outerMessage.Encrypt||'').trim();
  const encrypted=!!encryptedEcho;
  let message=outerMessage;
  if(encrypted){
    const signature=String(query?.get('msg_signature')||'').trim();
    const expected=buildWechatSignature(token,timestamp,nonce,encryptedEcho);
    if(signature!==expected)throw new Error('服务号签名校验失败');
    const plain=decryptWechatOfficialAccountMessage(encryptedEcho,encodingAesKey,appId).message;
    message=parseWechatOfficialAccountXml(plain);
  }else{
    const signature=String(query?.get('signature')||'').trim();
    if(signature){
      const expected=buildWechatSignature(token,timestamp,nonce,'');
      if(signature!==expected)throw new Error('服务号签名校验失败');
    }
  }
  const fromOpenId=String(message.FromUserName||'').trim();
  const toUserName=String(message.ToUserName||appId||'').trim();
  const msgType=String(message.MsgType||'').trim().toLowerCase();
  const content=String(message.Content||'').trim();
  let replyText='请发送 #绑定 手机号 完成绑定，例如 #绑定 13800138000。';
  let bindingResult=null;
  if(msgType==='text'){
    const phone=extractOfficialAccountBindingPhone(content);
    if(phone){
      bindingResult=await bindOfficialAccountUserByPhone({phone,openid:fromOpenId,now:now instanceof Date?now.toISOString():String(now||''),loadUsers,putUser});
      replyText=bindingResult.success?bindingResult.message:`绑定失败：${bindingResult.error}`;
    }else if(/^#?绑定/.test(content)){
      replyText='请发送 #绑定 手机号，例如 #绑定 13800138000。';
    }else{
      const queryChoice=normalizeOfficialAccountQueryChoice(content);
      const scheduleQuery=parseOfficialAccountScheduleQuery(content,now);
      const querySession=await loadQuerySession(fromOpenId).catch(()=>null);
      if(querySession&&queryChoice){
        const {users,students,coaches,rows}=await loadQueryData();
        const coachUser=findOfficialAccountCoachByOpenId(users,fromOpenId);
        const student=findOfficialAccountStudentByOpenId(students,fromOpenId);
        const coachRefs=buildCoachRefs({coaches,users});
        replyText=buildOfficialAccountScheduleQueryReply({
          role:queryChoice,
          coachUser,
          student,
          schedules:rows,
          students,
          coachRefs,
          now,
          query:querySession.query||null
        });
        await deleteQuerySession(fromOpenId);
      }else if(querySession){
        replyText='你同时绑定了教练和学员身份，请回复“教练”或“学员”继续查询。';
      }else if(scheduleQuery){
        const {users,students,coaches,rows}=await loadQueryData();
        const coachUser=findOfficialAccountCoachByOpenId(users,fromOpenId);
        const student=findOfficialAccountStudentByOpenId(students,fromOpenId);
        const coachRefs=buildCoachRefs({coaches,users});
        if(coachUser&&student){
          await putQuerySession({...buildOfficialAccountQuerySessionRow(fromOpenId,now),query:scheduleQuery});
          replyText='你同时绑定了教练和学员身份，请回复“教练”或“学员”继续查询。';
        }else if(coachUser){
          replyText=buildOfficialAccountScheduleQueryReply({role:'coach',coachUser,schedules:rows,students,coachRefs,now,query:scheduleQuery});
        }else if(student){
          replyText=buildOfficialAccountScheduleQueryReply({role:'student',student,schedules:rows,students,coachRefs,now,query:scheduleQuery});
        }else{
          replyText='请先绑定手机号后再查询排课。';
        }
      }
    }
  }else if(msgType==='event'&&String(message.Event||'').toLowerCase()==='subscribe'){
    replyText='请发送 #绑定 手机号 完成绑定，例如 #绑定 13800138000。';
  }
  const plainReply=buildWechatOfficialAccountTextReplyXml({
    toUserName:fromOpenId,
    fromUserName:toUserName,
    content:replyText,
    createTime:now
  });
  return {encrypted,replyText,plainReply,bindingResult,message,fromOpenId,toUserName};
}
function extractWechatAccessToken(data){
  if(data?.access_token)return String(data.access_token);
  const msg=data?.errmsg||data?.errcode||'unknown';
  throw new Error(`微信 access_token 获取失败：${msg}`);
}
function buildOfficialAccountOAuthUrl({appId=WECHAT_OFFICIAL_ACCOUNT_APPID,redirectUri='',state='',scope='snsapi_base'}={}){
  return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}#wechat_redirect`;
}
function buildOfficialAccountOAuthTokenUrl({appId=WECHAT_OFFICIAL_ACCOUNT_APPID,secret=WECHAT_OFFICIAL_ACCOUNT_SECRET,code=''}={}){
  return `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
}
function extractOfficialAccountOAuthOpenId(data){
  if(data?.openid)return String(data.openid);
  const msg=data?.errmsg||data?.errcode||'unknown';
  throw new Error(`服务号授权失败：${msg}`);
}
async function fetchOfficialAccountOAuthOpenId(code,{appId=WECHAT_OFFICIAL_ACCOUNT_APPID,secret=WECHAT_OFFICIAL_ACCOUNT_SECRET}={}){
  if(!appId||!secret)throw new Error('缺少服务号网页授权配置');
  const res=await fetch(buildOfficialAccountOAuthTokenUrl({appId,secret,code}));
  const data=await res.json();
  return extractOfficialAccountOAuthOpenId(data);
}
async function fetchWechatAccessToken(kind='coach'){
  const config=resolveWechatMiniConfig(kind);
  if(!config.secret)throw new Error(config.errorText);
  const now=Date.now();
  const cached=wechatAccessTokenCacheByApp.get(config.appid);
  if(cached&&cached.expiresAt>now)return cached.token;
  const res=await fetch(buildWechatAccessTokenUrl(config.appid,config.secret));
  const data=await res.json();
  const token=extractWechatAccessToken(data);
  const ttlMs=Math.max(300000,((parseInt(data.expires_in)||7200)-300)*1000);
  wechatAccessTokenCacheByApp.set(config.appid,{token,expiresAt:now+ttlMs});
  return token;
}
async function fetchWechatPhoneNumber(code,kind='coach'){
  const token=await fetchWechatAccessToken(kind);
  const res=await fetch(`https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token)}`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({code})
  });
  const data=await res.json();
  if(data.errcode&&data.errcode!==0)throw new Error(`微信手机号获取失败：${data.errmsg||data.errcode}`);
  const phone=data?.phone_info?.phoneNumber||data?.phone_info?.purePhoneNumber;
  if(!phone)throw new Error('微信未返回手机号');
  return assertPhone(phone);
}
function truncateWechatValue(value,max=20){
  const text=String(value||'').trim();
  return text.length>max?text.slice(0,max):text;
}
function scheduleNotifyLocation(schedule){
  return [displayCampusName(schedule.campus),schedule.venue||schedule.externalVenueName||schedule.externalCourtName].filter(Boolean).join(' ')||'待确认';
}
function findWechatScheduleRecipient(schedule,users=[]){
  const coachId=String(schedule?.coachId||'').trim();
  const coachName=String(schedule?.coach||'').trim();
  return (users||[]).find(u=>{
    if(!u?.wechatOpenId)return false;
    if(String(u.role||'')!=='editor')return false;
    if(coachId&&String(u.coachId||'').trim()===coachId)return true;
    return coachName&&String(u.coachName||u.name||'').trim()===coachName;
  })||null;
}
function findWechatUserByOpenId(users=[],openid=''){
  const key=String(openid||'').trim();
  if(!key)return null;
  const matched=(users||[]).filter(u=>String(u?.wechatOpenId||'').trim()===key);
  return matched.find(u=>String(u?.role||'')==='editor')||matched[0]||null;
}
function findOfficialAccountScheduleRecipient(schedule,users=[]){
  const coachId=String(schedule?.coachId||'').trim();
  const coachName=String(schedule?.coach||'').trim();
  return (users||[]).find(u=>{
    if(!u?.officialAccountOpenId)return false;
    if(String(u.role||'')!=='editor')return false;
    if(coachId&&String(u.coachId||'').trim()===coachId)return true;
    return coachName&&String(u.coachName||u.name||'').trim()===coachName;
  })||null;
}
const OFFICIAL_ACCOUNT_QUERY_SESSION_TTL_MS=10*60*1000;
function normalizeOfficialAccountQueryChoice(text){
  const raw=String(text||'').trim();
  if(raw==='教练')return 'coach';
  if(raw==='学员')return 'student';
  return '';
}
function normalizeOfficialAccountScheduleQueryText(text){
  return String(text||'').normalize('NFKC').toLowerCase().replace(/[\s,，.。!！?？:：;；、'"“”‘’`~·|/\\()[\]{}<>《》【】_\-—+*=#￥$%^&]+/g,'');
}
function shanghaiDateParts(date=new Date()){
  const d=date instanceof Date?date:new Date(date);
  const parts=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(d);
  const val=type=>Number(parts.find(part=>part.type===type)?.value||0);
  return {year:val('year'),month:val('month'),day:val('day')};
}
function shanghaiYmdFromOffset(base,offsetDays=0){
  const utc=new Date(Date.UTC(base.year,base.month-1,base.day+offsetDays));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth()+1).padStart(2,'0')}-${String(utc.getUTCDate()).padStart(2,'0')}`;
}
function shanghaiDayStartMs(ymd){
  return officialAccountScheduleMs(`${ymd} 00:00`);
}
function shanghaiDayEndMs(ymd){
  return officialAccountScheduleMs(`${ymd} 23:59:59`);
}
function shanghaiMonthYmd(base,monthOffset=0,day=1){
  const utc=new Date(Date.UTC(base.year,base.month-1+monthOffset,day));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth()+1).padStart(2,'0')}-${String(utc.getUTCDate()).padStart(2,'0')}`;
}
function officialAccountScheduleQueryRange(kind,now=new Date()){
  const base=shanghaiDateParts(now);
  const today=shanghaiYmdFromOffset(base,0);
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  if(kind==='today')return {startMs:shanghaiDayStartMs(today),endMs:shanghaiDayEndMs(today)};
  if(kind==='today_remaining')return {startMs:nowMs,endMs:shanghaiDayEndMs(today)};
  if(kind==='tomorrow'){
    const ymd=shanghaiYmdFromOffset(base,1);
    return {startMs:shanghaiDayStartMs(ymd),endMs:shanghaiDayEndMs(ymd)};
  }
  if(kind==='day_after_tomorrow'){
    const ymd=shanghaiYmdFromOffset(base,2);
    return {startMs:shanghaiDayStartMs(ymd),endMs:shanghaiDayEndMs(ymd)};
  }
  if(kind==='future_three_days')return {startMs:shanghaiDayStartMs(today),endMs:shanghaiDayEndMs(shanghaiYmdFromOffset(base,2))};
  if(kind==='this_week'){
    const dayOfWeek=new Date(Date.UTC(base.year,base.month-1,base.day)).getUTCDay()||7;
    return {startMs:shanghaiDayStartMs(shanghaiYmdFromOffset(base,1-dayOfWeek)),endMs:shanghaiDayEndMs(shanghaiYmdFromOffset(base,7-dayOfWeek))};
  }
  if(kind==='yesterday'){
    const ymd=shanghaiYmdFromOffset(base,-1);
    return {startMs:shanghaiDayStartMs(ymd),endMs:shanghaiDayEndMs(ymd)};
  }
  if(kind==='past_three_days')return {startMs:shanghaiDayStartMs(shanghaiYmdFromOffset(base,-3)),endMs:shanghaiDayEndMs(today)};
  if(kind==='past_seven_days')return {startMs:shanghaiDayStartMs(shanghaiYmdFromOffset(base,-7)),endMs:shanghaiDayEndMs(today)};
  if(kind==='last_week'){
    const dayOfWeek=new Date(Date.UTC(base.year,base.month-1,base.day)).getUTCDay()||7;
    return {startMs:shanghaiDayStartMs(shanghaiYmdFromOffset(base,1-dayOfWeek-7)),endMs:shanghaiDayEndMs(shanghaiYmdFromOffset(base,7-dayOfWeek-7))};
  }
  if(kind==='last_month'){
    const first=shanghaiMonthYmd(base,-1,1);
    const next=shanghaiMonthYmd(base,0,1);
    return {startMs:shanghaiDayStartMs(first),endMs:shanghaiDayStartMs(next)-1};
  }
  return {startMs:nowMs,endMs:Infinity};
}
function findOfficialAccountQueryCampus(text){
  const normalized=normalizeOfficialAccountScheduleQueryText(text);
  const aliases=[
    ['顺义马坡','mabao'],['马坡','mabao'],['mabao','mabao'],
    ['朝阳十里堡','shilipu'],['十里堡','shilipu'],['shilipu','shilipu'],
    ['国家网球中心','guowang'],['国网','guowang'],['guowang','guowang'],
    ['蓝色港湾','langang'],['蓝港','langang'],['langang','langang'],
    ['朝珺私教','chaojun'],['朝珺','chaojun'],['chaojun','chaojun']
  ];
  const hit=aliases.find(([alias])=>normalized.includes(normalizeOfficialAccountScheduleQueryText(alias)));
  return hit?hit[1]:'';
}
function parseOfficialAccountScheduleQuery(content,now=new Date()){
  const normalized=normalizeOfficialAccountScheduleQueryText(content);
  if(!normalized)return null;
  const hasScheduleWord=/排课|课表|课|节|安排|上课/.test(normalized);
  const campus=findOfficialAccountQueryCampus(content);
  const hasRangeWord=/今天|今日|明天|明日|后天|本周|这周|昨天|昨日|过去|最近|上周|上个月|未来|接下来/.test(normalized);
  const hasQueryIntent=/查|查询|几节|几点|在哪|哪里|什么时候|什么|哪些|有课吗|要上课吗|第一节|下一节|下节|下次|最近|最早/.test(normalized);
  if(normalized!=='查询排课'&&!(hasScheduleWord&&(hasQueryIntent||hasRangeWord||campus)))return null;
  let kind='future';
  let title='未来的排课';
  let mode='list';
  if(/上个月/.test(normalized)){kind='last_month';title='上个月的排课';}
  else if(/上周/.test(normalized)){kind='last_week';title='上周的排课';}
  else if(/过去七天|最近七天|过去一周/.test(normalized)){kind='past_seven_days';title='过去七天的排课';}
  else if(/过去三天|最近三天/.test(normalized)){kind='past_three_days';title='过去三天的排课';}
  else if(/昨天|昨日/.test(normalized)){kind='yesterday';title='昨天的排课';}
  else if(/未来三天|接下来三天|这三天/.test(normalized)){kind='future_three_days';title='未来三天的排课';}
  else if(/本周|这周/.test(normalized)){kind='this_week';title='本周的排课';}
  else if(/后天/.test(normalized)){kind='day_after_tomorrow';title='后天的排课';}
  else if(/明天|明日/.test(normalized)){kind='tomorrow';title='明天的排课';}
  else if(/今天|今日/.test(normalized)){
    if(/还有|剩|没上|有几节课|几节课/.test(normalized)){kind='today_remaining';title='今天剩下还没上的课';}
    else{kind='today';title='今天的排课';}
  }
  if(/第一节|最早/.test(normalized)){mode='first';title=kind==='tomorrow'?'明天最早的一节课':`${title.replace(/的排课$/,'')}最早的一节课`;}
  else if(/下一节|下节|下次|最近/.test(normalized)){mode='first';if(kind==='today_remaining')title='今天下一节课';else if(kind==='this_week')title='本周下一节课';else title=campus?`在${displayCampusName(campus)}的下一节课`:'下一节课';}
  if(campus&&mode!=='first')title=`在${displayCampusName(campus)}${title}`;
  const {startMs,endMs}=officialAccountScheduleQueryRange(kind,now);
  return {kind,title,mode,campus,startMs,endMs};
}
function buildOfficialAccountQuerySessionRow(openid,now=new Date()){
  const id=String(openid||'').trim();
  const nowText=now instanceof Date?now.toISOString():String(now||'');
  return {
    id,
    openid:id,
    status:'awaiting_role_choice',
    createdAt:nowText,
    updatedAt:nowText,
    expiresAt:new Date((now instanceof Date?now.getTime():Date.now())+OFFICIAL_ACCOUNT_QUERY_SESSION_TTL_MS).toISOString()
  };
}
async function loadOfficialAccountQuerySession(openid,{loadRow=(id)=>getCachedRow(T_OFFICIAL_ACCOUNT_QUERY_SESSIONS,id).catch(()=>null),deleteRow=(id)=>del(T_OFFICIAL_ACCOUNT_QUERY_SESSIONS,id).catch(()=>null)}={}){
  const id=String(openid||'').trim();
  if(!id)return null;
  const row=await loadRow(id).catch(()=>null);
  if(!row)return null;
  const expiresAt=Date.parse(row.expiresAt||'');
  if(Number.isFinite(expiresAt)&&expiresAt<=Date.now()){
    await deleteRow(id).catch(()=>null);
    return null;
  }
  return row;
}
async function saveOfficialAccountQuerySession(row,{putRow=(id,value)=>put(T_OFFICIAL_ACCOUNT_QUERY_SESSIONS,id,value)}={}){
  const id=String(row?.id||'').trim();
  if(!id)return null;
  try{
    await putRow(id,row);
  }catch(err){
    if(!isTableMissingError(err))throw err;
    await mkTable(T_OFFICIAL_ACCOUNT_QUERY_SESSIONS);
    await putRow(id,row);
  }
  return row;
}
async function deleteOfficialAccountQuerySession(openid,{deleteRow=(id)=>del(T_OFFICIAL_ACCOUNT_QUERY_SESSIONS,id).catch(()=>null)}={}){
  const id=String(openid||'').trim();
  if(!id)return;
  await deleteRow(id).catch(()=>null);
}
function findOfficialAccountCoachByOpenId(users=[],openid=''){
  const key=String(openid||'').trim();
  if(!key)return null;
  return (users||[]).find(u=>String(u?.officialAccountOpenId||'').trim()===key&&String(u?.role||'')==='editor')||null;
}
function findOfficialAccountStudentByOpenId(students=[],openid=''){
  const key=String(openid||'').trim();
  if(!key)return null;
  return (students||[]).find(student=>String(student?.officialAccountOpenId||'').trim()===key)||null;
}
function formatOfficialAccountQueryDateParts(ms){
  const parts=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(ms));
  const val=type=>parts.find(part=>part.type===type)?.value||'';
  return {month:val('month'),day:val('day'),hour:val('hour'),minute:val('minute')};
}
function formatOfficialAccountQueryScheduleTime(schedule){
  const start=officialAccountScheduleMs(schedule?.startTime);
  const rawEnd=String(schedule?.endTime||'').trim();
  const end=rawEnd?officialAccountScheduleMs(rawEnd):NaN;
  if(!Number.isFinite(start))return String(schedule?.startTime||'').trim();
  const s=formatOfficialAccountQueryDateParts(start);
  if(Number.isFinite(end)){
    const e=formatOfficialAccountQueryDateParts(end);
    return `${s.month}月${s.day}日 ${s.hour}:${s.minute}-${e.hour}:${e.minute}`;
  }
  return `${s.month}月${s.day}日 ${s.hour}:${s.minute}`;
}
function scheduleMatchesCoachForOfficialAccount(schedule,user,coachRefs=[]){
  const coachId=String(user?.coachId||user?.id||user?.username||'').trim();
  const coachName=String(user?.coachName||user?.name||'').trim();
  const rowCoachId=String(schedule?.coachId||'').trim();
  const rowCoachName=String(schedule?.coach||schedule?.coachName||'').trim();
  if(coachId&&rowCoachId&&sameCoachName(rowCoachId,coachId,coachRefs))return true;
  if(coachId&&rowCoachName&&sameCoachName(rowCoachName,coachId,coachRefs))return true;
  return !!(coachName&&rowCoachName&&sameCoachName(rowCoachName,coachName,coachRefs));
}
function scheduleMatchesStudentForOfficialAccount(schedule,student){
  const studentId=String(student?.id||'').trim();
  if(!studentId)return false;
  const scheduleStudentIds=parseArr(schedule?.studentIds).map(id=>String(id||'').trim()).filter(Boolean);
  if(scheduleStudentIds.includes(studentId))return true;
  if(String(schedule?.studentId||'').trim()===studentId)return true;
  return !scheduleStudentIds.length&&!String(schedule?.studentId||'').trim()&&String(schedule?.studentName||'').trim()===String(student?.name||'').trim();
}
function formatOfficialAccountQueryStudentNames(schedule,studentsById){
  const ids=parseArr(schedule?.studentIds).map(id=>String(id||'').trim()).filter(Boolean);
  const names=ids.map(id=>String(studentsById.get(id)?.name||'').trim()).filter(Boolean);
  const unique=[...new Set(names)];
  if(unique.length)return unique.join('、');
  return String(schedule?.studentName||'').trim()||'学员';
}
function formatOfficialAccountQueryCoachName(schedule){
  return String(schedule?.coach||schedule?.coachName||schedule?.primaryCoach||schedule?.coachId||'').trim()||'教练';
}
function buildOfficialAccountScheduleQueryReply({role,coachUser,student,schedules=[],students=[],coachRefs=[],now=new Date(),limit=5,query=null}={}){
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  const q=query||parseOfficialAccountScheduleQuery('查询排课',now);
  const studentsById=new Map((students||[]).map(item=>[String(item?.id||'').trim(),item]));
  const matchedRows=(schedules||[])
    .filter(schedule=>String(schedule?.status||'已排课')==='已排课'&&Number.isFinite(officialAccountScheduleMs(schedule.startTime)))
    .filter(schedule=>role==='coach'
      ?scheduleMatchesCoachForOfficialAccount(schedule,coachUser,coachRefs)
      :scheduleMatchesStudentForOfficialAccount(schedule,student))
    .filter(schedule=>{
      const start=officialAccountScheduleMs(schedule.startTime);
      if(start<(q?.startMs??nowMs))return false;
      if(Number.isFinite(q?.endMs)&&start>q.endMs)return false;
      if(q?.campus&&normalizeCampusValue(schedule?.campus)!==q.campus)return false;
      return true;
    })
    .sort((a,b)=>officialAccountScheduleMs(a.startTime)-officialAccountScheduleMs(b.startTime));
  const futureRows=q?.mode==='first'?matchedRows.slice(0,1):matchedRows;
  const roleLabel=role==='coach'?'教练':'学员';
  const name=role==='coach'
    ?String(coachUser?.coachName||coachUser?.name||coachUser?.coachId||'教练').trim()||'教练'
    :String(student?.name||student?.studentName||'学员').trim()||'学员';
  const total=futureRows.length;
  const shownRows=futureRows.slice(0,limit);
  const body=shownRows.length?shownRows.map((schedule,index)=>{
    const timeText=formatOfficialAccountQueryScheduleTime(schedule);
    const courseText=String(schedule?.courseType||'课程').trim()||'课程';
    const campusText=[displayCampusName(schedule?.campus),schedule?.venue||schedule?.externalVenueName||schedule?.externalCourtName].filter(Boolean).join(' ')||'待确认';
    const partnerText=role==='coach'?formatOfficialAccountQueryStudentNames(schedule,studentsById):formatOfficialAccountQueryCoachName(schedule);
    return `${index+1}. ${timeText}\n   ${role==='coach'?'学员':'教练'}：${partnerText}\n   课程：${courseText}\n   场地：${campusText}`;
  }).join('\n\n'):`暂无${q?.title||'未来的排课'}`;
  const moreText=total>limit?`\n\n还有 ${total-limit} 节未显示`:'';
  const countLabel=q?.kind==='future'?'未来共有':'共有';
  const title=q?.title||'未来的排课';
  const prefix=/^(在|今天|明天|后天|本周|上周|昨天|过去|上个月|未来)/.test(title)?`这是你${title}：`:`这是你的${title}：`;
  return `${prefix}\n\n姓名：${name}\n身份：${roleLabel}\n${countLabel} ${total} 节\n\n${body}${moreText}`;
}
async function putWechatUserIndex(openid,user){
  const key=String(openid||'').trim();
  if(!key||!user?.id)return;
  try{
    await put(T_USER_WECHAT_INDEX,key,buildWechatUserIndexRow(user));
  }catch(err){
    if(!isTableMissingError(err))throw err;
    await mkTable(T_USER_WECHAT_INDEX);
    await put(T_USER_WECHAT_INDEX,key,buildWechatUserIndexRow(user));
  }
}
async function deleteWechatUserIndex(openid,expectedUserId=''){
  const key=String(openid||'').trim();
  if(!key)return;
  const existing=await getCachedRow(T_USER_WECHAT_INDEX,key).catch(()=>null);
  if(expectedUserId&&existing&&String(existing.userId||'')!==String(expectedUserId))return;
  await del(T_USER_WECHAT_INDEX,key).catch(err=>{
    if(!isTableMissingError(err))throw err;
  });
}
async function bindWechatUserWithIndex(user,openid){
  const nextUser=buildWechatBoundUser(user,openid);
  await put(T_USERS,user.id,nextUser);
  const oldOpenId=String(user?.wechatOpenId||'').trim();
  const nextOpenId=String(openid||'').trim();
  if(oldOpenId&&oldOpenId!==nextOpenId)await deleteWechatUserIndex(oldOpenId,user.id);
  await putWechatUserIndex(nextOpenId,nextUser);
  return nextUser;
}
async function unbindWechatUserWithIndex(user){
  const oldOpenId=String(user?.wechatOpenId||'').trim();
  const nextUser=buildWechatUnboundUser(user);
  await put(T_USERS,user.id,nextUser);
  if(oldOpenId)await deleteWechatUserIndex(oldOpenId,user.id);
  return nextUser;
}
async function getWechatUserByOpenId(openid){
  const key=String(openid||'').trim();
  if(!key)return null;
  const link=await getCachedRow(T_USER_WECHAT_INDEX,key).catch(()=>null);
  if(link?.userId){
    const indexedUser=await getCachedRow(T_USERS,link.userId).catch(()=>null);
    if(indexedUser&&String(indexedUser.wechatOpenId||'').trim()===key)return indexedUser;
  }
  return findWechatUserByOpenId(await getCachedScan(T_USERS).catch(()=>[]),key);
}
function coachScheduleIndexKeysFromRecord(record){
  const keys=[];
  const coachId=String(record?.coachId||'').trim();
  const coachName=String(record?.coach||'').trim();
  if(coachId)keys.push(`coach-id:${coachId}`);
  if(coachName)keys.push(`coach-name:${coachName}`);
  return [...new Set(keys)];
}
function coachScheduleIndexKeysForUser(user){
  const keys=[];
  const coachId=String(user?.coachId||'').trim();
  const coachName=String(user?.coachName||user?.name||'').trim();
  const authId=String(user?.id||user?.username||'').trim();
  if(coachId&&coachId!==authId)keys.push(`coach-id:${coachId}`);
  if(coachName)keys.push(`coach-name:${coachName}`);
  return [...new Set(keys)];
}
async function rebuildCoachScheduleIndexRows(keys=[]){
  const normalized=[...new Set((keys||[]).map(key=>String(key||'').trim()).filter(Boolean))];
  if(!normalized.length)return;
  const rows=await getCachedScan(T_SCHEDULE).catch(()=>[]);
  const now=new Date().toISOString();
  for(const key of normalized){
    const scheduleIds=rows.filter(row=>coachScheduleIndexKeysFromRecord(row).includes(key)).map(row=>row.id).filter(Boolean);
    try{
      await put(T_COACH_SCHEDULE_INDEX,key,{scheduleIds,updatedAt:now});
    }catch(err){
      if(!isTableMissingError(err))throw err;
      await mkTable(T_COACH_SCHEDULE_INDEX);
      await put(T_COACH_SCHEDULE_INDEX,key,{scheduleIds,updatedAt:now});
    }
  }
}
async function syncCoachScheduleIndexes(oldRecord,nextRecord){
  const oldKeys=coachScheduleIndexKeysFromRecord(oldRecord);
  const nextKeys=coachScheduleIndexKeysFromRecord(nextRecord);
  const keys=[...new Set([...oldKeys,...nextKeys])];
  for(const key of keys){
    const hasOld=oldKeys.includes(key);
    const hasNext=nextKeys.includes(key);
    const row=await getCachedRow(T_COACH_SCHEDULE_INDEX,key).catch(()=>null);
    if(!row){
      await rebuildCoachScheduleIndexRows([key]);
      continue;
    }
    const scheduleIds=new Set(parseArr(row.scheduleIds).filter(Boolean));
    if(hasOld&&oldRecord?.id)scheduleIds.delete(oldRecord.id);
    if(hasNext&&nextRecord?.id)scheduleIds.add(nextRecord.id);
    try{
      await put(T_COACH_SCHEDULE_INDEX,key,{scheduleIds:[...scheduleIds],updatedAt:new Date().toISOString()});
    }catch(err){
      if(!isTableMissingError(err))throw err;
      await mkTable(T_COACH_SCHEDULE_INDEX);
      await put(T_COACH_SCHEDULE_INDEX,key,{scheduleIds:[...scheduleIds],updatedAt:new Date().toISOString()});
    }
  }
}
async function getCoachIndexedScheduleForUser(user){
  const keys=coachScheduleIndexKeysForUser(user);
  if(!keys.length)return null;
  const indexRows=await Promise.all(keys.map(key=>getCachedRow(T_COACH_SCHEDULE_INDEX,key).catch(()=>null)));
  if(indexRows.every(row=>!row))return null;
  const scheduleIds=[...new Set(indexRows.flatMap(row=>parseArr(row?.scheduleIds)).filter(Boolean))];
  if(!scheduleIds.length)return [];
  return (await Promise.all(scheduleIds.map(id=>getCachedRow(T_SCHEDULE,id).catch(()=>null)))).filter(Boolean).map(row=>projectScheduleListRow(row));
}
async function getCoachScheduleRowsForUser(user,coachRefs=[]){
  const indexedRows=await getCoachIndexedScheduleForUser(user);
  const fallbackRows=filterLoadAllForUser({schedule:await getScheduleListRows()},user,coachRefs).schedule;
  if(!indexedRows)return fallbackRows;
  const merged=new Map(fallbackRows.map(row=>[row.id,row]));
  indexedRows.forEach(row=>{if(row?.id)merged.set(row.id,row);});
  return [...merged.values()];
}
function projectScheduleListRow(row={}){
  const projected={id:row.id};
  SCHEDULE_LIST_PROJECTION_FIELDS.forEach(field=>{
    if(Object.prototype.hasOwnProperty.call(row,field))projected[field]=row[field];
  });
  return projected;
}
function isActiveEntitlementForIndex(entitlement){
  if(!entitlement?.studentId)return false;
  if(String(entitlement.status||'active')!=='active')return false;
  return parseLessonValue(entitlement.remainingLessons)>0;
}
async function rebuildStudentActiveEntitlementIndexRows(studentIds=[]){
  const normalized=[...new Set((studentIds||[]).map(id=>String(id||'').trim()).filter(Boolean))];
  if(!normalized.length)return;
  const rows=await getCachedScan(T_ENTITLEMENTS).catch(()=>[]);
  const now=new Date().toISOString();
  for(const studentId of normalized){
    const entitlementIds=rows.filter(row=>String(row.studentId||'').trim()===studentId&&isActiveEntitlementForIndex(row)).map(row=>row.id).filter(Boolean);
    await put(T_STUDENT_ACTIVE_ENTITLEMENT_INDEX,studentId,{studentId,entitlementIds,updatedAt:now});
  }
}
async function syncStudentActiveEntitlementIndexes(oldEntitlement,nextEntitlement){
  const studentIds=[String(oldEntitlement?.studentId||'').trim(),String(nextEntitlement?.studentId||'').trim()].filter(Boolean);
  await rebuildStudentActiveEntitlementIndexRows(studentIds);
}
async function getIndexedActiveEntitlementsForStudents(studentIds=[]){
  const normalized=[...new Set((studentIds||[]).map(id=>String(id||'').trim()).filter(Boolean))];
  if(!normalized.length)return [];
  const indexRows=await Promise.all(normalized.map(studentId=>getCachedRow(T_STUDENT_ACTIVE_ENTITLEMENT_INDEX,studentId).catch(()=>null)));
  const missingStudentIds=[];
  const entitlementIds=new Set();
  indexRows.forEach((row,index)=>{
    if(!row){
      missingStudentIds.push(normalized[index]);
      return;
    }
    parseArr(row.entitlementIds).forEach(id=>{ if(id)entitlementIds.add(id); });
  });
  const indexedRows=(await Promise.all([...entitlementIds].map(id=>getCachedRow(T_ENTITLEMENTS,id).catch(()=>null)))).filter(row=>row&&normalized.includes(String(row.studentId||'').trim())&&isActiveEntitlementForIndex(row));
  const needsFallback=missingStudentIds.length>0||!indexedRows.length;
  if(!needsFallback)return indexedRows;
  const fallbackRows=(await getCachedScan(T_ENTITLEMENTS).catch(()=>[])).filter(row=>normalized.includes(String(row.studentId||'').trim())&&isActiveEntitlementForIndex(row));
  const merged=new Map(indexedRows.map(row=>[row.id,row]));
  fallbackRows.forEach(row=>merged.set(row.id,row));
  return [...merged.values()];
}
function buildScheduleSubscribeMessage({templateId,openid,schedule}){
  const start=String(schedule?.startTime||'').trim();
  const scheduleId=encodeURIComponent(String(schedule?.id||''));
  return {
    touser:openid,
    template_id:templateId,
    page:`pages/detail/detail${scheduleId?`?scheduleId=${scheduleId}`:''}`,
    data:{
      thing1:{value:truncateWechatValue(schedule?.courseType||'课程')},
      time2:{value:start},
      thing3:{value:truncateWechatValue(schedule?.studentName||'学员')},
      thing4:{value:truncateWechatValue(scheduleNotifyLocation(schedule))}
    }
  };
}
async function sendWechatSubscribeMessage(message){
  const token=await fetchWechatAccessToken();
  const res=await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(token)}`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(message)
  });
  const data=await res.json();
  if(data.errcode&&data.errcode!==0)throw new Error(`微信订阅消息发送失败：${data.errmsg||data.errcode}`);
  return data;
}
function buildMatchSubscribeMessage({templateId,openid,match,content}){
  return {
    touser:openid,
    template_id:templateId,
    page:`pages/match-detail/index?id=${encodeURIComponent(String(match?.id||''))}`,
    data:{
      thing1:{value:truncateWechatValue(match?.title||'约球通知')},
      thing2:{value:truncateWechatValue(content||'约球状态已更新')},
      time3:{value:String(match?.starttime||match?.startTime||'').replace('T',' ').slice(0,16)}
    }
  };
}
function parseCommaList(value=''){
  return String(value||'').split(',').map(item=>item.trim()).filter(Boolean);
}
function formatMatchAdminNotifyTime(match={}){
  return String(match?.starttime||match?.startTime||'').replace('T',' ').slice(0,16);
}
function matchDetailPagePath(matchId=''){
  const id=encodeURIComponent(String(matchId||''));
  return `pages/match-detail/index${id?`?id=${id}`:''}`;
}
function buildOfficialAccountMatchAdminMessage({templateId,openid,match,appId=MATCH_MINIPROGRAM_APPID||WECHAT_MINIPROGRAM_APPID}={}){
  const title=match?.title||'新约球';
  const venue=match?.venueName||match?.venuename||'待定';
  const targetHeadcount=match?.targetHeadcount||match?.targetheadcount||'';
  return {
    touser:openid,
    template_id:templateId,
    miniprogram:{
      appid:String(appId||MATCH_MINIPROGRAM_APPID||WECHAT_MINIPROGRAM_APPID),
      pagepath:matchDetailPagePath(match?.id)
    },
    data:{
      time3:{value:formatOfficialAccountTemplateTime(match?.starttime||match?.startTime)},
      thing4:{value:truncateWechatValue(venue)},
      const7:{value:truncateWechatValue('私教课')},
      thing2:{value:truncateWechatValue('新约球')},
      thing6:{value:truncateWechatValue(targetHeadcount?`${title} ${targetHeadcount}人`:title)}
    }
  };
}
function collectMatchAdminOfficialAccountRecipients(users=[],configuredOpenids=MATCH_ADMIN_OFFICIAL_ACCOUNT_OPENIDS){
  const configured=parseCommaList(configuredOpenids);
  if(configured.length)return [...new Set(configured)];
  const openids=(users||[])
    .filter(user=>String(user?.officialAccountOpenId||'').trim())
    .filter(user=>String(user?.role||'')==='admin'||userHasFeaturePermission(user,'match_ops'))
    .map(user=>String(user.officialAccountOpenId||'').trim())
    .filter(Boolean);
  return [...new Set(openids)];
}
async function sendOfficialAccountMatchAdminNotification({match,users=null,loadUsers=()=>getCachedScan(T_USERS).catch(()=>[]),templateId=MATCH_ADMIN_OFFICIAL_ACCOUNT_TEMPLATE_ID,openids=MATCH_ADMIN_OFFICIAL_ACCOUNT_OPENIDS,appId=MATCH_MINIPROGRAM_APPID||WECHAT_MINIPROGRAM_APPID,forceMock=WECHAT_OFFICIAL_ACCOUNT_MOCK_SEND,sendTemplate=sendOfficialAccountTemplateMessage}={}){
  const resolvedUsers=users||await loadUsers();
  const recipients=collectMatchAdminOfficialAccountRecipients(resolvedUsers,openids);
  const mode=resolveOfficialAccountSendMode({appId:WECHAT_OFFICIAL_ACCOUNT_APPID,secret:WECHAT_OFFICIAL_ACCOUNT_SECRET,templateId,forceMock});
  const result={success:true,mode,checked:recipients.length,sent:0,failed:0,skipped:0,items:[]};
  if(!templateId){
    result.skipped=recipients.length;
    result.reason='missing_template';
    return result;
  }
  for(const openid of recipients){
    if(mode==='mock'){
      result.sent++;
      result.items.push({openid,sent:true,mocked:true});
      continue;
    }
    try{
      await sendTemplate(buildOfficialAccountMatchAdminMessage({templateId,openid,match,appId}));
      result.sent++;
      result.items.push({openid,sent:true});
    }catch(err){
      result.failed++;
      result.items.push({openid,sent:false,error:String(err?.message||err)});
    }
  }
  return result;
}
async function notifyMatchUsers(matchId,action){
  if(!MATCH_WECHAT_TEMPLATE_ID)return {skipped:true,reason:'missing_template'};
  const pool=getMatchSqlPool();
  const [matchRes,usersRes]=await Promise.all([
    pool.query('SELECT * FROM match_posts WHERE id=$1',[matchId]),
    pool.query("SELECT DISTINCT u.openid,u.id FROM match_users u LEFT JOIN match_registrations r ON r.userId=u.id WHERE r.matchId=$1 OR u.id=(SELECT creatorUserId FROM match_posts WHERE id=$1)",[matchId])
  ]);
  const match=matchRes.rows[0];
  if(!match)return {skipped:true,reason:'missing_match'};
  let sent=0,failed=0;
  for(const user of usersRes.rows){
    try{
      await sendWechatSubscribeMessage(buildMatchSubscribeMessage({templateId:MATCH_WECHAT_TEMPLATE_ID,openid:user.openid,match,content:matchNotificationText(action,match.title)}));
      sent++;
    }catch(err){
      failed++;
      await pool.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'admin_user','system','notify_failed',JSON.stringify({userId:user.id,action}),JSON.stringify({error:String(err?.message||err)})]).catch(()=>null);
    }
  }
  return {sent,failed};
}
async function notifyCoachScheduleCreated(schedule){
  if(!WECHAT_SCHEDULE_TEMPLATE_ID)return {skipped:true,reason:'missing_template'};
  const users=await getCachedScan(T_USERS).catch(()=>[]);
  const recipient=findWechatScheduleRecipient(schedule,users);
  if(!recipient)return {skipped:true,reason:'missing_openid'};
  const message=buildScheduleSubscribeMessage({templateId:WECHAT_SCHEDULE_TEMPLATE_ID,openid:recipient.wechatOpenId,schedule});
  await sendWechatSubscribeMessage(message);
  return {sent:true,userId:recipient.id};
}
function buildScheduleNotificationUpdate(schedule,result={},type='schedule_created',now=new Date().toISOString()){
  const sent=!!result.sent;
  const reason=String(result.reason||'').trim();
  const error=String(result.error||'').trim();
  const log={
    type,
    status:sent?'sent':'failed',
    channel:'wechat_subscribe',
    targetUserId:String(result.userId||'').trim(),
    reason,
    error,
    createdAt:now
  };
  return {
    notifyStatus:sent?'已通知教练':'通知失败',
    lastNotifyAt:now,
    lastNotifyError:sent?'':(error||reason||'通知失败'),
    notificationLogs:[...parseArr(schedule?.notificationLogs),log]
  };
}
function officialAccountScheduleMs(value){
  const raw=String(value||'').trim();
  if(!raw)return NaN;
  if(/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw))return dateMs(raw);
  return dateMs(`${raw.replace(' ','T')}+08:00`);
}
function formatOfficialAccountTemplateTime(value){
  const raw=String(value||'').trim();
  const match=raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})/);
  if(match)return `${match[1]}年${Number(match[2])}月${Number(match[3])}日 ${String(match[4]).padStart(2,'0')}:${match[5]}`;
  const ms=officialAccountScheduleMs(raw);
  if(!Number.isFinite(ms))return raw.slice(0,20);
  const parts=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(ms));
  const val=type=>parts.find(part=>part.type===type)?.value||'';
  return `${val('year')}年${Number(val('month'))}月${Number(val('day'))}日 ${val('hour')}:${val('minute')}`;
}
function collectCourseReminderCandidates(rows=[],now=new Date()){
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  const minMs=nowMs+90*60000;
  const maxMs=nowMs+150*60000;
  const active=(rows||[]).filter(s=>effectiveScheduleStatus(s,now)==='已排课'&&!s.courseReminderSentAt&&Number.isFinite(officialAccountScheduleMs(s.startTime)));
  return active
    .filter(s=>{const start=officialAccountScheduleMs(s.startTime);return start>=minMs&&start<=maxMs;})
    .sort((a,b)=>officialAccountScheduleMs(a.startTime)-officialAccountScheduleMs(b.startTime))
    .map(schedule=>{
      const sameCoach=(rows||[]).filter(s=>s.id!==schedule.id&&String(s.coach||'').trim()===String(schedule.coach||'').trim());
      const previous=sameCoach
        .filter(s=>Number.isFinite(officialAccountScheduleMs(s.endTime))&&officialAccountScheduleMs(s.endTime)<=officialAccountScheduleMs(schedule.startTime))
        .sort((a,b)=>officialAccountScheduleMs(b.endTime)-officialAccountScheduleMs(a.endTime))[0]||null;
      const gap=previous?Math.round((officialAccountScheduleMs(schedule.startTime)-officialAccountScheduleMs(previous.endTime))/60000):null;
      const crossCampus=!!(previous&&gap!==null&&gap>=0&&gap<=90&&String(previous.campus||'')!==String(schedule.campus||''));
      return {schedule,previous,gap,crossCampus};
    });
}
function courseReminderStudentValue(schedule={},previousFeedbackSummary=''){
  const studentName=String(schedule?.studentName||'学员').trim()||'学员';
  const summary=String(previousFeedbackSummary||'').trim();
  return summary?`${studentName}｜${summary}`:studentName;
}
function courseReminderStudentNames(schedule={}){
  return String(schedule?.studentName||'')
    .split(/[、,，|/]/)
    .map(item=>item.trim())
    .filter(Boolean);
}
function courseReminderSchedulesShareStudent(a={},b={}){
  const idsA=studentIdsForReminderSchedule(a);
  const idsB=studentIdsForReminderSchedule(b);
  if(idsA.length&&idsB.length)return idsA.some(id=>idsB.includes(id));
  const namesA=courseReminderStudentNames(a);
  const namesB=courseReminderStudentNames(b);
  return !!(namesA.length&&namesB.length&&namesA.some(name=>namesB.includes(name)));
}
function feedbackTextPart(value){
  return String(value||'').replace(/\s+/g,' ').trim();
}
function summarizePreviousCourseFeedback(feedback={}){
  const current=feedbackTextPart(feedback?.knowledgePoint||feedback?.practicedToday||feedback?.template?.focus);
  const next=feedbackTextPart(feedback?.nextTraining||feedback?.nextAdvice);
  const parts=[];
  if(current)parts.push(`上节：${current}`);
  if(next)parts.push(`下节${next}`);
  return parts.join('，');
}
function buildPreviousCourseFeedbackSummary({currentSchedule={},rows=[],feedbacks=[]}={}){
  const currentStart=officialAccountScheduleMs(currentSchedule?.startTime);
  if(!Number.isFinite(currentStart))return '';
  const previous=(rows||[])
    .filter(schedule=>String(schedule?.id||'')!==String(currentSchedule?.id||''))
    .filter(schedule=>courseReminderSchedulesShareStudent(schedule,currentSchedule))
    .filter(schedule=>effectiveScheduleStatus(schedule,new Date(currentStart))==='已结束')
    .filter(schedule=>{
      const end=officialAccountScheduleMs(schedule?.endTime||schedule?.startTime);
      return Number.isFinite(end)&&end<=currentStart;
    })
    .sort((a,b)=>officialAccountScheduleMs(b.endTime||b.startTime)-officialAccountScheduleMs(a.endTime||a.startTime))[0]||null;
  if(!previous)return '';
  const feedback=(feedbacks||[])
    .filter(item=>String(item?.scheduleId||'')===String(previous.id||''))
    .sort((a,b)=>String(b?.updatedAt||b?.createdAt||'').localeCompare(String(a?.updatedAt||a?.createdAt||'')))[0]||null;
  return feedback?summarizePreviousCourseFeedback(feedback):'';
}
function buildCourseReminderSubscribeMessage({templateId,openid,schedule,crossCampus=false,previousFeedbackSummary=''}){
  const scheduleId=encodeURIComponent(String(schedule?.id||''));
  return {
    touser:openid,
    template_id:templateId,
    page:`pages/detail/detail${scheduleId?`?scheduleId=${scheduleId}`:''}`,
    data:{
      time3:{value:formatOfficialAccountTemplateTime(schedule?.startTime)},
      thing4:{value:truncateWechatValue(scheduleNotifyLocation(schedule))},
      const7:{value:truncateWechatValue(schedule?.courseType||'私教课')},
      thing2:{value:truncateWechatValue(schedule?.coach||'教练')},
      thing6:{value:truncateWechatValue(courseReminderStudentValue(schedule,previousFeedbackSummary))}
    }
  };
}
function buildOfficialAccountCourseReminderMessage({templateId,openid,schedule,appId=WECHAT_MINIPROGRAM_APPID,previousFeedbackSummary=''}){
  const mini=buildCourseReminderSubscribeMessage({templateId,openid,schedule,previousFeedbackSummary});
  return {
    touser:openid,
    template_id:templateId,
    miniprogram:{
      appid:String(appId||WECHAT_MINIPROGRAM_APPID),
      pagepath:mini.page
    },
    data:mini.data
  };
}
function isCoachFeedbackReminderLessonNumber(value){
  const lessonNumber=parseInt(value,10);
  if(!Number.isFinite(lessonNumber)||lessonNumber<=0)return false;
  const mod=lessonNumber%8;
  return mod===1||mod===3||mod===5||mod===0;
}
function firstCoachFeedbackReminderLessonNumber(previousLessons=0,currentLessons=0){
  const start=Math.floor(Number(previousLessons)||0)+1;
  const end=Math.floor(Number(currentLessons)||0);
  for(let lessonNumber=start;lessonNumber<=end;lessonNumber++){
    if(isCoachFeedbackReminderLessonNumber(lessonNumber))return lessonNumber;
  }
  return null;
}
function buildCoachFeedbackReminderRelation(schedule={},entitlements=[],plans=[]){
  const studentIds=parseArr(schedule?.studentIds).filter(Boolean);
  const studentId=String(schedule?.studentId||studentIds[0]||'').trim();
  const entitlementId=String(schedule?.entitlementId||'').trim();
  if(entitlementId){
    const entitlement=(entitlements||[]).find(row=>String(row?.id||'').trim()===entitlementId)||null;
    return {
      relationType:'entitlement',
      relationKey:`entitlement:${entitlementId}`,
      studentId,
      totalLessons:parseLessonValue(entitlement?.totalLessons)
    };
  }
  const classId=String(schedule?.classId||'').trim();
  if(classId&&studentId){
    const plan=(plans||[]).find(row=>String(row?.classId||'').trim()===classId&&String(row?.studentId||'').trim()===studentId)||null;
    return {
      relationType:'plan',
      relationKey:`plan:${classId}:${studentId}`,
      studentId,
      totalLessons:parseLessonValue(plan?.totalLessons)
    };
  }
  return null;
}
function collectCoachFeedbackReminderCandidates({rows=[],feedbacks=[],entitlements=[],plans=[],now=new Date()}={}){
  const endedRows=(Array.isArray(rows)?rows:[])
    .filter(schedule=>feedbackScopeForSchedule(schedule)==='student')
    .filter(schedule=>effectiveScheduleStatus(schedule,now)==='已结束')
    .filter(schedule=>parseLessonValue(schedule?.lessonCount,1)>0)
    .map(schedule=>{
      const relation=buildCoachFeedbackReminderRelation(schedule,entitlements,plans);
      return relation?{schedule,relation}:null;
    })
    .filter(Boolean);
  const grouped=new Map();
  endedRows.forEach(item=>{
    const key=item.relation.relationKey;
    if(!key)return;
    if(!grouped.has(key))grouped.set(key,[]);
    grouped.get(key).push(item);
  });
  const candidates=[];
  grouped.forEach(items=>{
    const sorted=items.slice().sort((a,b)=>{
      const timeDiff=officialAccountScheduleMs(a.schedule?.endTime||a.schedule?.startTime)-officialAccountScheduleMs(b.schedule?.endTime||b.schedule?.startTime);
      if(timeDiff!==0)return timeDiff;
      return String(a.schedule?.id||'').localeCompare(String(b.schedule?.id||''));
    });
    let completedLessons=0;
    sorted.forEach(item=>{
      const lessonCount=parseLessonValue(item.schedule?.lessonCount,1);
      const previousLessons=completedLessons;
      completedLessons+=lessonCount;
      const triggerLessonNumber=firstCoachFeedbackReminderLessonNumber(previousLessons,completedLessons);
      const totalLessons=parseLessonValue(item.relation?.totalLessons);
      const isLastLesson=totalLessons>0&&previousLessons<totalLessons&&completedLessons>=totalLessons;
      if(scheduleHasFeedbackRecord(item.schedule,feedbacks))return;
      if(item.schedule?.coachFeedbackReminderSentAt)return;
      if(!triggerLessonNumber&&!isLastLesson)return;
      candidates.push({
        schedule:item.schedule,
        relationType:item.relation.relationType,
        relationKey:item.relation.relationKey,
        triggerLessonNumber,
        isLastLesson,
        previousCompletedLessonUnits:previousLessons,
        completedLessonUnits:completedLessons,
        totalLessons
      });
    });
  });
  return candidates.sort((a,b)=>{
    const timeDiff=officialAccountScheduleMs(a.schedule?.endTime||a.schedule?.startTime)-officialAccountScheduleMs(b.schedule?.endTime||b.schedule?.startTime);
    if(timeDiff!==0)return timeDiff;
    return String(a.schedule?.id||'').localeCompare(String(b.schedule?.id||''));
  });
}
function buildCoachFeedbackReminderLessonLabel(reminder={}){
  const lessonNumber=reminder?.triggerLessonNumber;
  const hasLessonNumber=Number.isFinite(Number(lessonNumber))&&Number(lessonNumber)>0;
  if(hasLessonNumber){
    const base=`第${formatStudentReminderLessonCount(lessonNumber)}次课`;
    return reminder?.isLastLesson?`${base}/最后一节课`:base;
  }
  if(reminder?.isLastLesson)return '最后一节课';
  return '课后评价';
}
function buildOfficialAccountCoachFeedbackReminderMessage({templateId,openid,schedule,reminder,appId=WECHAT_MINIPROGRAM_APPID}){
  const scheduleId=encodeURIComponent(String(schedule?.id||''));
  const pagepath=scheduleId
    ? `pages/schedule/schedule?scheduleId=${scheduleId}&action=feedback`
    : 'pages/schedule/schedule';
  const mini=buildCourseReminderSubscribeMessage({templateId,openid,schedule});
  return {
    touser:openid,
    template_id:templateId,
    miniprogram:{
      appid:String(appId||WECHAT_MINIPROGRAM_APPID),
      pagepath
    },
    data:{
      time3:mini.data.time3,
      thing4:mini.data.thing4,
      const7:{value:truncateWechatValue(buildCoachFeedbackReminderLessonLabel(reminder))},
      thing2:{value:truncateWechatValue('请完成课后评价')},
      thing6:{value:truncateWechatValue(schedule?.studentName||'学员')}
    }
  };
}
function buildStudentReminderBindToken(){
  return crypto.randomBytes(24).toString('hex');
}
function normalizeStudentReminderMode(value){
  const mode=String(value||'').trim();
  return ['all','only24h','custom','off'].includes(mode)?mode:'all';
}
function normalizeStudentReminderCustomHours(value){
  const num=Number(value);
  if(!Number.isFinite(num))return 12;
  return Math.min(72,Math.max(1,Math.round(num)));
}
function findStudentReminderBindTarget(rows=[],tokenValue='',openid=''){
  const token=String(tokenValue||'').trim();
  const openIdText=String(openid||'').trim();
  const byToken=(rows||[]).find(row=>String(row?.officialAccountBindToken||'').trim()===token);
  if(byToken)return {student:byToken,alreadyBound:false};
  const byOpenId=openIdText?(rows||[]).find(row=>String(row?.officialAccountOpenId||'').trim()===openIdText):null;
  if(byOpenId)return {student:byOpenId,alreadyBound:true};
  return {student:null,alreadyBound:false};
}
function buildStudentReminderLinkUpdate(student,token=buildStudentReminderBindToken(),now=new Date().toISOString()){
  return {
    ...student,
    officialAccountBindToken:String(token||'').trim(),
    officialAccountBindTokenCreatedAt:now,
    officialAccountReminderMode:normalizeStudentReminderMode(student?.officialAccountReminderMode),
    officialAccountReminderCustomHours:normalizeStudentReminderCustomHours(student?.officialAccountReminderCustomHours)
  };
}
function buildStudentOfficialAccountBoundUpdate(student,openid,now=new Date().toISOString()){
  return {
    ...student,
    officialAccountBindToken:'',
    officialAccountBindTokenCreatedAt:'',
    officialAccountReminderMode:normalizeStudentReminderMode(student?.officialAccountReminderMode),
    officialAccountReminderCustomHours:normalizeStudentReminderCustomHours(student?.officialAccountReminderCustomHours),
    officialAccountOpenId:String(openid||'').trim(),
    officialAccountBoundAt:now
  };
}
function buildStudentOfficialAccountUnboundUpdate(student){
  return {
    ...student,
    officialAccountOpenId:'',
    officialAccountBoundAt:'',
    officialAccountReminderMode:'off',
    officialAccountReminderCustomHours:normalizeStudentReminderCustomHours(student?.officialAccountReminderCustomHours)
  };
}
function formatStudentReminderDateTime(schedule){
  return formatOfficialAccountTemplateTime(schedule?.startTime);
}
function formatStudentReminderLessonCount(value){
  const num=Number(value);
  if(!Number.isFinite(num)||num<=0)return '';
  return Number.isInteger(num)?String(num):String(num).replace(/\.0$/,'');
}
function studentReminderLogs(schedule){
  return parseArr(schedule?.studentReminderLogs);
}
function hasStudentReminderSent(schedule,studentId,stage){
  const sid=String(studentId||'');
  const key=String(stage||'');
  return studentReminderLogs(schedule).some(log=>String(log?.studentId||'')===sid&&String(log?.stage||'')===key&&String(log?.status||'')==='sent');
}
function studentIdsForReminderSchedule(schedule){
  const ids=parseArr(schedule?.studentIds).filter(Boolean);
  if(!ids.length&&schedule?.studentId)ids.push(schedule.studentId);
  return [...new Set(ids.map(id=>String(id||'').trim()).filter(Boolean))];
}
function studentReminderStageForSchedule(schedule,now){
  const start=officialAccountScheduleMs(schedule?.startTime);
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  if(!Number.isFinite(start)||!Number.isFinite(nowMs))return '';
  const diffHours=(start-nowMs)/3600000;
  if(diffHours>24.5&&diffHours<=48.5)return '48h';
  if(diffHours>0&&diffHours<=24.5)return '24h';
  return '';
}
function studentCustomReminderStageForSchedule(schedule,student,now){
  const start=officialAccountScheduleMs(schedule?.startTime);
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  if(!Number.isFinite(start)||!Number.isFinite(nowMs))return '';
  const hours=normalizeStudentReminderCustomHours(student?.officialAccountReminderCustomHours);
  const diffHours=(start-nowMs)/3600000;
  return diffHours>0&&diffHours<=hours+0.5?`custom${hours}h`:'';
}
function collectStudentCourseReminderCandidates(rows=[],students=[],now=new Date()){
  const studentById=new Map((students||[]).map(student=>[String(student?.id||''),student]));
  const active=(rows||[]).filter(schedule=>effectiveScheduleStatus(schedule,now)==='已排课');
  const result=[];
  for(const schedule of active){
    for(const studentId of studentIdsForReminderSchedule(schedule)){
      const student=studentById.get(studentId);
      if(!student?.officialAccountOpenId)continue;
      const mode=normalizeStudentReminderMode(student.officialAccountReminderMode);
      if(mode==='off')continue;
      let stage=studentReminderStageForSchedule(schedule,now);
      if(mode==='custom')stage=studentCustomReminderStageForSchedule(schedule,student,now);
      if(!stage)continue;
      if(mode==='only24h'&&stage==='48h')continue;
      if(hasStudentReminderSent(schedule,studentId,stage))continue;
      result.push({schedule,student,stage});
    }
  }
  return result.sort((a,b)=>officialAccountScheduleMs(a.schedule.startTime)-officialAccountScheduleMs(b.schedule.startTime));
}
function buildStudentReminderDetailUrl(schedule,student){
  const scheduleId=encodeURIComponent(String(schedule?.id||''));
  const studentId=encodeURIComponent(String(student?.id||''));
  return `${String(STUDENT_REMINDER_PUBLIC_BASE_URL||'https://www.flowtennis.cn').replace(/\/$/,'')}/student-reminder-detail?scheduleId=${scheduleId}&studentId=${studentId}`;
}
function studentReminderStageText(stage){
  const text=String(stage||'');
  const custom=text.match(/^custom(\d+)h$/);
  if(custom)return `课前${custom[1]}小时提醒`;
  return text==='48h'?'课前48小时提醒':'课前24小时提醒';
}
function buildStudentCourseReminderMessage({templateId,openid,schedule,student,stage}){
  const lesson=formatStudentReminderLessonCount(schedule?.lessonCount);
  const studentText=[student?.name||schedule?.studentName||'学员',lesson?`第${lesson}课时`:''].filter(Boolean).join(' ');
  return {
    touser:openid,
    template_id:templateId,
    url:buildStudentReminderDetailUrl(schedule,student),
    data:{
      time3:{value:formatStudentReminderDateTime(schedule)},
      thing4:{value:truncateWechatValue(scheduleNotifyLocation(schedule))},
      const7:{value:truncateWechatValue(schedule?.courseType||'私教课')},
      thing2:{value:truncateWechatValue(studentReminderStageText(stage))},
      thing6:{value:truncateWechatValue(studentText)}
    }
  };
}
function resolveOfficialAccountSendMode({appId='',secret='',templateId='',forceMock=WECHAT_OFFICIAL_ACCOUNT_MOCK_SEND}={}){
  if(forceMock)return 'mock';
  if(!String(appId||'').trim()||!String(secret||'').trim()||!String(templateId||'').trim())return 'mock';
  return 'live';
}
function collectCoachDailyDigestCandidates(rows=[],now=new Date(),options={}){
  const sentDateField=String(options?.sentDateField||'coachDailyDigestSentDate').trim()||'coachDailyDigestSentDate';
  const baseDateKey=dateKey(now instanceof Date?now.toISOString():now);
  const baseDate=new Date(`${baseDateKey}T12:00:00`);
  baseDate.setDate(baseDate.getDate()+1);
  const digestDate=baseDate.toISOString().slice(0,10);
  const grouped=new Map();
  (rows||[])
    .filter(schedule=>{
      if(effectiveScheduleStatus(schedule,now)!=='已排课')return false;
      if(dateKey(schedule.startTime)!==digestDate)return false;
      return String(schedule?.[sentDateField]||'').trim()!==digestDate;
    })
    .sort((a,b)=>dateMs(a.startTime)-dateMs(b.startTime))
    .forEach(schedule=>{
      const coachId=String(schedule.coachId||schedule.coach||'').trim();
      const coachName=String(schedule.coach||'').trim();
      const key=`${coachId}::${coachName}`;
      if(!grouped.has(key)){
        grouped.set(key,{coachId,coachName,digestDate,schedules:[],scheduleIds:[]});
      }
      const entry=grouped.get(key);
      entry.schedules.push(schedule);
      entry.scheduleIds.push(schedule.id);
    });
  return [...grouped.values()].map(entry=>({
    ...entry,
    lessonCount:entry.schedules.length
  }));
}
function buildCoachDailyDigestMessage({coachName='',digestDate='',schedules=[]}={}){
  const rows=(schedules||[]).slice().sort((a,b)=>dateMs(a.startTime)-dateMs(b.startTime));
  return {
    title:`${coachName||'教练'}教练次日课表`,
    summary:`${digestDate} 共 ${rows.length} 节课`,
    lines:rows.map(schedule=>`${String(schedule.startTime||'').slice(11,16)}-${String(schedule.endTime||'').slice(11,16)} ${schedule.courseType||'课程'}｜${schedule.studentName||'学员'}｜${[displayCampusName(schedule.campus),schedule.venue||schedule.externalVenueName||schedule.externalCourtName].filter(Boolean).join(' ')}`)
  };
}
function normalizeFeishuMobile(value){
  return String(value||'').trim().replace(/[\s-]/g,'');
}
function firstFeishuOpenId(row={}){
  return String(row?.feishuOpenId||row?.larkOpenId||row?.feishuUserId||row?.larkUserId||'').trim();
}
function firstFeishuMobile(row={}){
  return normalizeFeishuMobile(row?.phone||row?.mobile||row?.tel||row?.telephone||'');
}
function findFeishuCoachDigestRecipient(item={},refs={}){
  const coachId=String(item?.coachId||'').trim();
  const coachName=String(item?.coachName||item?.coach||'').trim();
  const users=refs?.users||[];
  const coaches=refs?.coaches||[];
  const user=(users||[]).find(u=>{
    if(String(u?.role||'')!=='editor')return false;
    if(coachId&&String(u?.coachId||u?.id||u?.username||'').trim()===coachId)return true;
    return coachName&&String(u?.coachName||u?.name||'').trim()===coachName;
  })||null;
  const coach=(coaches||[]).find(c=>{
    if(coachId&&String(c?.id||'').trim()===coachId)return true;
    return coachName&&String(c?.name||'').trim()===coachName;
  })||null;
  const openId=firstFeishuOpenId(user)||firstFeishuOpenId(coach);
  const mobile=firstFeishuMobile(user)||firstFeishuMobile(coach);
  return {coachId,coachName,openId,mobile};
}
function buildFeishuCoachDailyDigestText(message={}){
  const coachName=String(message?.coachName||'教练').trim()||'教练';
  const nameText=/教练$/.test(coachName)?coachName:`${coachName}教练`;
  const summary=String(message?.summary||`${message?.digestDate||''} 共 ${(message?.lines||[]).length} 节课`).trim();
  const lines=(message?.lines||[]).map((line,index)=>`${index+1}. ${line}`);
  return [`【FlowTennis 明日排课提醒】`,`${nameText}，${summary}`,...lines].filter(Boolean).join('\n');
}
async function readFeishuJsonResponse(response){
  if(typeof response?.text==='function'){
    const text=await response.text();
    if(text){
      try{return JSON.parse(text);}catch{return {raw:text};}
    }
  }
  if(typeof response?.json==='function')return response.json();
  return null;
}
function assertFeishuApiOk(response,data,action){
  if(!response?.ok)throw new Error(`${action} HTTP ${response?.status||'unknown'}`);
  if(data&&data.code!==undefined&&data.code!==0)throw new Error(`${action}失败：${data.msg||data.message||data.code}`);
}
async function fetchFeishuTenantAccessToken({appId=FEISHU_COACH_BOT_APP_ID,appSecret=FEISHU_COACH_BOT_APP_SECRET,fetchImpl=fetch}={}){
  const id=String(appId||'').trim();
  const secret=String(appSecret||'').trim();
  if(!id||!secret)throw new Error('缺少飞书机器人环境变量');
  const now=Date.now();
  const cached=feishuTenantAccessTokenCacheByApp.get(id);
  if(cached&&cached.expiresAt>now)return cached.token;
  const response=await fetchImpl('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({app_id:id,app_secret:secret})
  });
  const data=await readFeishuJsonResponse(response);
  assertFeishuApiOk(response,data,'获取飞书 tenant_access_token');
  const token=String(data?.tenant_access_token||data?.data?.tenant_access_token||'').trim();
  if(!token)throw new Error('获取飞书 tenant_access_token 失败：返回为空');
  const ttlMs=Math.max(60,Number(data?.expire||data?.data?.expire||7200)-120)*1000;
  feishuTenantAccessTokenCacheByApp.set(id,{token,expiresAt:now+ttlMs});
  return token;
}
function extractFeishuMobileOpenIdMap(data={}){
  const map=new Map();
  const rows=data?.data?.user_list||data?.user_list||[];
  for(const row of rows||[]){
    const mobile=normalizeFeishuMobile(row?.mobile||row?.phone||row?.mobile_visible||'');
    const openId=String(row?.user_id||row?.open_id||row?.id||'').trim();
    if(mobile&&openId)map.set(mobile,openId);
  }
  return map;
}
async function resolveFeishuOpenIdsByMobiles({mobiles=[],tenantAccessToken='',fetchImpl=fetch}={}){
  const unique=[...new Set((mobiles||[]).map(normalizeFeishuMobile).filter(Boolean))];
  if(!unique.length)return new Map();
  const response=await fetchImpl('https://open.feishu.cn/open-apis/contact/v3/users/batch_get_id?user_id_type=open_id',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${tenantAccessToken}`},
    body:JSON.stringify({mobiles:unique,include_resigned:false})
  });
  const data=await readFeishuJsonResponse(response);
  assertFeishuApiOk(response,data,'飞书手机号换 open_id');
  return extractFeishuMobileOpenIdMap(data);
}
async function sendFeishuBotTextMessage({tenantAccessToken='',openId='',text='',fetchImpl=fetch}={}){
  const response=await fetchImpl('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${tenantAccessToken}`},
    body:JSON.stringify({receive_id:openId,msg_type:'text',content:JSON.stringify({text:String(text||'')})})
  });
  const data=await readFeishuJsonResponse(response);
  assertFeishuApiOk(response,data,'飞书私发消息');
  return data;
}
async function fetchOfficialAccountAccessToken(){
  const mode=resolveOfficialAccountSendMode({
    appId:WECHAT_OFFICIAL_ACCOUNT_APPID,
    secret:WECHAT_OFFICIAL_ACCOUNT_SECRET,
    templateId:'placeholder'
  });
  if(mode==='mock')throw new Error('official_account_mock_mode');
  const cacheKey=`official:${WECHAT_OFFICIAL_ACCOUNT_APPID}`;
  const now=Date.now();
  const cached=wechatAccessTokenCacheByApp.get(cacheKey);
  if(cached&&cached.expiresAt>now)return cached.token;
  const res=await fetch(buildWechatAccessTokenUrl(WECHAT_OFFICIAL_ACCOUNT_APPID,WECHAT_OFFICIAL_ACCOUNT_SECRET));
  const data=await res.json();
  const token=extractWechatAccessToken(data);
  const ttlMs=Math.max(300000,((parseInt(data.expires_in)||7200)-300)*1000);
  wechatAccessTokenCacheByApp.set(cacheKey,{token,expiresAt:now+ttlMs});
  return token;
}
function extractOfficialAccountSubscribeStatus(data){
  if(Number(data?.subscribe)===1)return true;
  if(Number(data?.subscribe)===0)return false;
  const msg=data?.errmsg||data?.errcode||'unknown';
  throw new Error(`服务号关注状态查询失败：${msg}`);
}
async function fetchOfficialAccountSubscribeStatus(openid){
  const token=await fetchOfficialAccountAccessToken();
  const url=`https://api.weixin.qq.com/cgi-bin/user/info?access_token=${encodeURIComponent(token)}&openid=${encodeURIComponent(openid)}&lang=zh_CN`;
  const res=await fetch(url);
  const data=await res.json();
  return extractOfficialAccountSubscribeStatus(data);
}
async function sendOfficialAccountTemplateMessage(message){
  if(String(WECHAT_OFFICIAL_ACCOUNT_PROXY_URL||'').trim()&&String(WECHAT_OFFICIAL_ACCOUNT_PROXY_SECRET||'').trim()){
    const res=await fetch(WECHAT_OFFICIAL_ACCOUNT_PROXY_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${WECHAT_OFFICIAL_ACCOUNT_PROXY_SECRET}`},
      body:JSON.stringify(message)
    });
    const data=await res.json();
    if(!res.ok)throw new Error(`服务号代理发送失败：${data.error||res.status}`);
    if(data.errcode&&data.errcode!==0)throw new Error(`服务号代理发送失败：${data.errmsg||data.errcode}`);
    return data;
  }
  const token=await fetchOfficialAccountAccessToken();
  const res=await fetch(`https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${encodeURIComponent(token)}`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(message)
  });
  const data=await res.json();
  if(data.errcode&&data.errcode!==0)throw new Error(`服务号模板消息发送失败：${data.errmsg||data.errcode}`);
  return data;
}
function buildOfficialAccountDigestTemplatePayload({templateId,openid,message,appId=WECHAT_MINIPROGRAM_APPID}){
  const lines=Array.isArray(message?.lines)?message.lines:[];
  return {
    touser:openid,
    template_id:templateId,
    miniprogram:{
      appid:String(appId||WECHAT_MINIPROGRAM_APPID),
      pagepath:'pages/schedule/schedule'
    },
    data:{
      thing1:{value:truncateWechatValue(message?.title||'明日排课汇总')},
      phrase2:{value:'次日课表'},
      time4:{value:String(message?.digestDate||'').trim()},
      thing7:{value:truncateWechatValue(lines.join('；')||message?.summary||'暂无排课')},
      character_string11:{value:String(message?.lessonCount??lines.length??'')}
    }
  };
}
function verifyOfficialAccountCallbackRequest(query){
  const timestamp=query.get('timestamp')||'';
  const nonce=query.get('nonce')||'';
  const echostr=query.get('echostr')||'';
  const msgSignature=query.get('msg_signature')||'';
  const signature=query.get('signature')||'';
  if(msgSignature){
    const expected=buildWechatSignature(WECHAT_OFFICIAL_ACCOUNT_TOKEN,timestamp,nonce,echostr);
    if(String(msgSignature||'').trim()!==expected)throw new Error('服务号签名校验失败');
    if(!WECHAT_OFFICIAL_ACCOUNT_ENCODING_AES_KEY)throw new Error('缺少服务号 EncodingAESKey');
    return decryptWechatOfficialAccountMessage(echostr,WECHAT_OFFICIAL_ACCOUNT_ENCODING_AES_KEY,WECHAT_OFFICIAL_ACCOUNT_APPID).message;
  }
  const expected=buildWechatSignature(WECHAT_OFFICIAL_ACCOUNT_TOKEN,timestamp,nonce);
  if(String(signature||'').trim()!==expected)throw new Error('服务号签名校验失败');
  return echostr;
}
async function sendOfficialAccountCourseReminders({now=new Date(),rows=null,users=null,feedbacks=null,loadRows=()=>getCachedScan(T_SCHEDULE).catch(()=>[]),loadUsers=()=>getCachedScan(T_USERS).catch(()=>[]),loadFeedbacks=()=>getCachedScan(T_FEEDBACKS).catch(()=>[]),putSchedule=(id,row)=>put(T_SCHEDULE,id,row),appId=WECHAT_OFFICIAL_ACCOUNT_APPID,secret=WECHAT_OFFICIAL_ACCOUNT_SECRET,templateId=WECHAT_OFFICIAL_ACCOUNT_REMINDER_TEMPLATE_ID,forceMock=WECHAT_OFFICIAL_ACCOUNT_MOCK_SEND,sendTemplate=sendOfficialAccountTemplateMessage}={}){
  const [nextRows,nextUsers,nextFeedbacks]=await Promise.all([rows||loadRows(),users||loadUsers(),feedbacks||loadFeedbacks()]);
  const resolvedRows=rows||nextRows;
  const resolvedUsers=users||nextUsers;
  const resolvedFeedbacks=feedbacks||nextFeedbacks;
  const candidates=collectCourseReminderCandidates(resolvedRows,now);
  const mode=resolveOfficialAccountSendMode({
    appId,
    secret,
    templateId,
    forceMock
  });
  const result={success:true,mode,checked:candidates.length,sent:0,failed:0,skipped:0,items:[]};
  for(const item of candidates){
    const recipient=findOfficialAccountScheduleRecipient(item.schedule,resolvedUsers);
    if(!recipient){
      result.skipped++;
      result.items.push({id:item.schedule.id,skipped:true,reason:'missing_official_account_openid'});
      continue;
    }
    if(mode==='mock'){
      result.sent++;
      result.items.push({id:item.schedule.id,sent:true,mocked:true});
      continue;
    }
    try{
      const previousFeedbackSummary=buildPreviousCourseFeedbackSummary({currentSchedule:item.schedule,rows:resolvedRows,feedbacks:resolvedFeedbacks});
      const message=buildOfficialAccountCourseReminderMessage({templateId,openid:recipient.officialAccountOpenId,schedule:item.schedule,appId,previousFeedbackSummary});
      await sendTemplate(message);
      await putSchedule(item.schedule.id,{...item.schedule,courseReminderSentAt:new Date(now).toISOString(),courseReminderCrossCampus:item.crossCampus?'true':'false'});
      result.sent++;
      result.items.push({id:item.schedule.id,sent:true});
    }catch(err){
      result.failed++;
      result.items.push({id:item.schedule.id,sent:false,error:err.message});
    }
  }
  return result;
}
async function sendOfficialAccountCoachFeedbackReminders({now=new Date(),rows=null,users=null,feedbacks=null,plans=null,entitlements=null,loadRows=()=>getCachedScan(T_SCHEDULE).catch(()=>[]),loadUsers=()=>getCachedScan(T_USERS).catch(()=>[]),loadFeedbacks=()=>getCachedScan(T_FEEDBACKS).catch(()=>[]),loadPlans=()=>getCachedScan(T_PLANS).catch(()=>[]),loadEntitlements=()=>getCachedScan(T_ENTITLEMENTS).catch(()=>[]),putSchedule=(id,row)=>put(T_SCHEDULE,id,row),appId=WECHAT_OFFICIAL_ACCOUNT_APPID,secret=WECHAT_OFFICIAL_ACCOUNT_SECRET,templateId=WECHAT_OFFICIAL_ACCOUNT_REMINDER_TEMPLATE_ID,forceMock=WECHAT_OFFICIAL_ACCOUNT_MOCK_SEND,sendTemplate=sendOfficialAccountTemplateMessage}={}){
  const [nextRows,nextUsers,nextFeedbacks,nextPlans,nextEntitlements]=await Promise.all([
    rows||loadRows(),
    users||loadUsers(),
    feedbacks||loadFeedbacks(),
    plans||loadPlans(),
    entitlements||loadEntitlements()
  ]);
  const resolvedRows=rows||nextRows;
  const resolvedUsers=users||nextUsers;
  const resolvedFeedbacks=feedbacks||nextFeedbacks;
  const resolvedPlans=plans||nextPlans;
  const resolvedEntitlements=entitlements||nextEntitlements;
  const candidates=collectCoachFeedbackReminderCandidates({
    rows:resolvedRows,
    feedbacks:resolvedFeedbacks,
    plans:resolvedPlans,
    entitlements:resolvedEntitlements,
    now
  });
  const mode=resolveOfficialAccountSendMode({appId,secret,templateId,forceMock});
  const result={success:true,mode,checked:candidates.length,sent:0,failed:0,skipped:0,items:[]};
  for(const item of candidates){
    const recipient=findOfficialAccountScheduleRecipient(item.schedule,resolvedUsers);
    if(!recipient){
      result.skipped++;
      result.items.push({id:item.schedule.id,skipped:true,reason:'missing_official_account_openid'});
      continue;
    }
    if(mode==='mock'){
      result.sent++;
      result.items.push({id:item.schedule.id,sent:true,mocked:true,lessonNumber:item.triggerLessonNumber,lastLesson:item.isLastLesson});
      continue;
    }
    try{
      const message=buildOfficialAccountCoachFeedbackReminderMessage({templateId,openid:recipient.officialAccountOpenId,schedule:item.schedule,reminder:item,appId});
      await sendTemplate(message);
      const sentAt=new Date(now).toISOString();
      const update={
        ...item.schedule,
        coachFeedbackReminderSentAt:sentAt,
        coachFeedbackReminderLessonNumber:item.triggerLessonNumber||'',
        coachFeedbackReminderLastLesson:item.isLastLesson?'true':'false',
        coachFeedbackReminderRelationType:item.relationType||'',
        coachFeedbackReminderCompletedLessonUnits:item.completedLessonUnits
      };
      await putSchedule(item.schedule.id,update);
      Object.assign(item.schedule,update);
      result.sent++;
      result.items.push({id:item.schedule.id,sent:true,lessonNumber:item.triggerLessonNumber,lastLesson:item.isLastLesson});
    }catch(err){
      result.failed++;
      result.items.push({id:item.schedule.id,sent:false,error:err.message,lessonNumber:item.triggerLessonNumber,lastLesson:item.isLastLesson});
    }
  }
  return result;
}
async function sendOfficialAccountStudentCourseReminders({now=new Date(),rows=null,students=null,loadRows=()=>getCachedScan(T_SCHEDULE).catch(()=>[]),loadStudents=()=>getCachedScan(T_STUDENTS).catch(()=>[]),putSchedule=(id,row)=>put(T_SCHEDULE,id,row),appId=WECHAT_OFFICIAL_ACCOUNT_APPID,secret=WECHAT_OFFICIAL_ACCOUNT_SECRET,templateId=WECHAT_OFFICIAL_ACCOUNT_REMINDER_TEMPLATE_ID,forceMock=WECHAT_OFFICIAL_ACCOUNT_MOCK_SEND,sendTemplate=sendOfficialAccountTemplateMessage}={}){
  const [nextRows,nextStudents]=await Promise.all([rows||loadRows(),students||loadStudents()]);
  const resolvedRows=rows||nextRows;
  const resolvedStudents=students||nextStudents;
  const candidates=collectStudentCourseReminderCandidates(resolvedRows,resolvedStudents,now);
  const mode=resolveOfficialAccountSendMode({appId,secret,templateId,forceMock});
  const result={success:true,mode,checked:candidates.length,sent:0,failed:0,skipped:0,items:[]};
  for(const item of candidates){
    if(mode==='mock'){
      result.sent++;
      result.items.push({id:item.schedule.id,studentId:item.student.id,stage:item.stage,sent:true,mocked:true});
      continue;
    }
    try{
      const message=buildStudentCourseReminderMessage({templateId,openid:item.student.officialAccountOpenId,schedule:item.schedule,student:item.student,stage:item.stage});
      await sendTemplate(message);
      const sentAt=new Date(now).toISOString();
      const log={type:'student_course_reminder',channel:'official_account',status:'sent',studentId:item.student.id,stage:item.stage,createdAt:sentAt};
      const update={...item.schedule,studentReminderLogs:[...studentReminderLogs(item.schedule),log],studentReminderLastSentAt:sentAt};
      if(item.stage==='48h')update.studentReminder48hSentAt=sentAt;
      if(item.stage==='24h')update.studentReminder24hSentAt=sentAt;
      await putSchedule(item.schedule.id,update);
      Object.assign(item.schedule,update);
      result.sent++;
      result.items.push({id:item.schedule.id,studentId:item.student.id,stage:item.stage,sent:true});
    }catch(err){
      result.failed++;
      result.items.push({id:item.schedule.id,studentId:item.student.id,stage:item.stage,sent:false,error:err.message});
    }
  }
  return result;
}
async function sendOfficialAccountReminderJobs({now=new Date()}={}){
  const [coach,students,feedback]=await Promise.all([
    sendOfficialAccountCourseReminders({now}),
    sendOfficialAccountStudentCourseReminders({now}),
    sendOfficialAccountCoachFeedbackReminders({now})
  ]);
  return {success:!!(coach?.success&&students?.success&&feedback?.success),coach,students,feedback};
}
async function sendOfficialAccountDailyDigests({now=new Date(),rows=null,users=null,loadRows=()=>getCachedScan(T_SCHEDULE).catch(()=>[]),loadUsers=()=>getCachedScan(T_USERS).catch(()=>[]),putSchedule=(id,row)=>put(T_SCHEDULE,id,row),appId=WECHAT_OFFICIAL_ACCOUNT_APPID,secret=WECHAT_OFFICIAL_ACCOUNT_SECRET,templateId=WECHAT_OFFICIAL_ACCOUNT_DIGEST_TEMPLATE_ID,forceMock=WECHAT_OFFICIAL_ACCOUNT_MOCK_SEND,sendTemplate=sendOfficialAccountTemplateMessage}={}){
  const [nextRows,nextUsers]=await Promise.all([rows||loadRows(),users||loadUsers()]);
  const resolvedRows=rows||nextRows;
  const resolvedUsers=users||nextUsers;
  const candidates=collectCoachDailyDigestCandidates(resolvedRows,now);
  const mode=resolveOfficialAccountSendMode({
    appId,
    secret,
    templateId,
    forceMock
  });
  const result={success:true,mode,checked:candidates.length,sent:0,failed:0,skipped:0,items:[]};
  for(const item of candidates){
    const recipient=findOfficialAccountScheduleRecipient({coachId:item.coachId,coach:item.coachName},resolvedUsers);
    if(!recipient){
      result.skipped++;
      result.items.push({coachId:item.coachId,skipped:true,reason:'missing_official_account_openid'});
      continue;
    }
    const digestMessage=buildCoachDailyDigestMessage(item);
    if(mode==='mock'){
      result.sent++;
      result.items.push({coachId:item.coachId,sent:true,mocked:true,lessonCount:item.lessonCount});
      continue;
    }
    try{
      await sendTemplate(buildOfficialAccountDigestTemplatePayload({
        templateId,
        openid:recipient.officialAccountOpenId,
        message:{...digestMessage,digestDate:item.digestDate,coachName:item.coachName,lessonCount:item.lessonCount},
        appId
      }));
      await Promise.all((item.scheduleIds||[]).map(scheduleId=>putSchedule(scheduleId,{
        ...(((resolvedRows||[]).find(row=>String(row.id||'')===String(scheduleId)))||{}),
        coachDailyDigestSentDate:item.digestDate,
        coachDailyDigestSentAt:new Date(now).toISOString()
      })));
      result.sent++;
      result.items.push({coachId:item.coachId,sent:true,lessonCount:item.lessonCount});
    }catch(err){
      result.failed++;
      result.items.push({coachId:item.coachId,sent:false,error:err.message});
    }
  }
  return result;
}
async function sendFeishuCoachDailyDigests({now=new Date(),rows=null,users=null,coaches=null,loadRows=()=>getCachedScan(T_SCHEDULE).catch(()=>[]),loadUsers=()=>getCachedScan(T_USERS).catch(()=>[]),loadCoaches=()=>getCachedScan(T_COACHES).catch(()=>[]),putSchedule=(id,row)=>put(T_SCHEDULE,id,row),appId=FEISHU_COACH_BOT_APP_ID,appSecret=FEISHU_COACH_BOT_APP_SECRET,fetchImpl=fetch}={}){
  const [resolvedRows,resolvedUsers,resolvedCoaches]=await Promise.all([rows||loadRows(),users||loadUsers(),coaches||loadCoaches()]);
  const candidates=collectCoachDailyDigestCandidates(resolvedRows,now,{sentDateField:'feishuCoachDailyDigestSentDate'});
  const result={success:true,checked:candidates.length,sent:0,failed:0,skipped:0,items:[]};
  if(!String(appId||'').trim()||!String(appSecret||'').trim()){
    return {...result,success:true,skipped:candidates.length,reason:'missing_feishu_credentials',items:candidates.map(item=>({coachId:item.coachId,skipped:true,reason:'missing_feishu_credentials'}))};
  }
  const recipients=candidates.map(item=>({item,recipient:findFeishuCoachDigestRecipient(item,{users:resolvedUsers,coaches:resolvedCoaches})}));
  const mobiles=recipients.filter(row=>!row.recipient.openId&&row.recipient.mobile).map(row=>row.recipient.mobile);
  let tenantAccessToken='';
  let openIdsByMobile=new Map();
  if(recipients.some(row=>row.recipient.openId||row.recipient.mobile)){
    tenantAccessToken=await fetchFeishuTenantAccessToken({appId,appSecret,fetchImpl});
    openIdsByMobile=await resolveFeishuOpenIdsByMobiles({mobiles,tenantAccessToken,fetchImpl});
  }
  for(const row of recipients){
    const item=row.item;
    const recipient=row.recipient;
    const openId=recipient.openId||openIdsByMobile.get(recipient.mobile)||'';
    if(!openId){
      result.skipped++;
      result.items.push({coachId:item.coachId,coachName:item.coachName,skipped:true,reason:recipient.mobile?'missing_feishu_open_id':'missing_coach_mobile'});
      continue;
    }
    try{
      const digestMessage=buildCoachDailyDigestMessage(item);
      await sendFeishuBotTextMessage({tenantAccessToken,openId,text:buildFeishuCoachDailyDigestText({...digestMessage,coachName:item.coachName,digestDate:item.digestDate}),fetchImpl});
      await Promise.all((item.scheduleIds||[]).map(scheduleId=>putSchedule(scheduleId,{
        ...(((resolvedRows||[]).find(schedule=>String(schedule.id||'')===String(scheduleId)))||{}),
        feishuCoachDailyDigestSentDate:item.digestDate,
        feishuCoachDailyDigestSentAt:new Date(now).toISOString()
      })));
      result.sent++;
      result.items.push({coachId:item.coachId,coachName:item.coachName,sent:true,lessonCount:item.lessonCount});
    }catch(err){
      result.failed++;
      result.items.push({coachId:item.coachId,coachName:item.coachName,sent:false,error:err.message});
    }
  }
  result.success=result.failed===0;
  return result;
}
async function sendFeishuDailyScheduleReport({now=new Date(),webhook=FEISHU_DAILY_REPORT_WEBHOOK}={}){
  const targetWebhook=String(webhook||'').trim();
  if(!targetWebhook)throw new Error('缺少环境变量 FEISHU_DAILY_REPORT_WEBHOOK');
  const [scheduleRows,coaches,campuses]=await Promise.all([
    scan(T_SCHEDULE),
    scan(T_COACHES).catch(()=>[]),
    scan(T_CAMPUSES).catch(()=>[])
  ]);
  const snapshot=buildNotificationCenterSnapshot({
    scheduleRows,
    coaches,
    campuses,
    targetDate:toChinaDateKey(now),
    now,
    generatedAt:new Date(now).toISOString()
  });
  const stats=generateFeishuScheduleReport(snapshot);
  const payload=buildFeishuScheduleCard(stats);
  const response=await fetch(targetWebhook,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(payload)
  });
  const responseText=await response.text();
  let responseData=null;
  try{responseData=responseText?JSON.parse(responseText):null;}catch{responseData={raw:responseText};}
  if(!response.ok)throw new Error(`飞书接口 HTTP ${response.status}`);
  if(responseData&&responseData.code!==undefined&&responseData.code!==0)throw new Error(`飞书接口返回失败：${responseData.msg||responseData.message||responseData.code}`);
  return {
    success:true,
    today:snapshot.today,
    tomorrow:snapshot.tomorrow,
    todayStats:snapshot.todayStats,
    tomorrowStats:snapshot.tomorrowStats
  };
}
async function sendCourseReminders({now=new Date()}={}){
  return {success:true,skipped:true,reason:'official_account_reminder_only',sent:0,failed:0};
}
function operatorAccountName(user){
  return String(user?.username||user?.id||user?.name||'').trim();
}
function normalizeOperatorAccountName(operator,users=[]){
  const raw=String(operator||'').trim();
  if(!raw)return '';
  const byUsername=(users||[]).find(u=>String(u?.username||'').trim()===raw||String(u?.id||'').trim()===raw);
  if(byUsername)return String(byUsername.username||byUsername.id||raw).trim();
  const byName=(users||[]).find(u=>String(u?.name||'').trim()===raw);
  return String(byName?.username||byName?.id||raw).trim();
}
function buildStudentIdentityUpdates(oldStudent,nextStudent,data,now=new Date().toISOString()){
  const id=oldStudent?.id||nextStudent?.id;
  const name=String(nextStudent?.name||'').trim();
  const phone=normalizePhone(nextStudent?.phone);
  const oldName=String(oldStudent?.name||'').trim();
  const oldPhone=normalizePhone(oldStudent?.phone);
  const empty={plans:[],schedule:[],purchases:[],entitlements:[],feedbacks:[],courts:[],leads:[],leadFollowups:[]};
  if(!id||(!name&&!phone))return empty;
  const changedName=String(oldStudent?.name||'')!==String(nextStudent?.name||'');
  const changedPhone=normalizePhone(oldStudent?.phone)!==phone;
  if(!changedName&&!changedPhone)return empty;
  const touch=row=>({...row,updatedAt:now});
  return {
    plans:(data.plans||[]).filter(r=>r.studentId===id).map(r=>touch({...r,studentName:name||r.studentName,studentPhone:phone})),
    schedule:(data.schedule||[]).filter(r=>parseArr(r.studentIds).includes(id)||r.studentId===id).map(r=>touch({...r,studentName:name||r.studentName})),
    purchases:(data.purchases||[]).filter(r=>r.studentId===id).map(r=>touch({...r,studentName:name||r.studentName,studentPhone:phone})),
    entitlements:(data.entitlements||[]).filter(r=>r.studentId===id).map(r=>touch({...r,studentName:name||r.studentName})),
    feedbacks:(data.feedbacks||[]).filter(r=>r.studentId===id||parseArr(r.studentIds).includes(id)).map(r=>touch({...r,studentName:name||r.studentName})),
    leads:(data.leads||[]).filter(r=>r.studentId===id||r.studentMatchId===id).map(r=>touch({...r,studentName:name||r.studentName,studentMatchName:name||r.studentMatchName})),
    leadFollowups:(data.leadFollowups||[]).filter(r=>r.studentId===id).map(r=>touch({...r,studentName:name||r.studentName})),
    courts:(data.courts||[]).filter(r=>{
      const ids=parseArr(r.studentIds);
      if(ids.includes(id)||r.studentId===id)return false;
      const exactName=oldName&&String(r.name||'').trim()===oldName;
      const exactPhone=oldPhone&&normalizePhone(r.phone)===oldPhone;
      return exactName||exactPhone;
    }).map(r=>touch({...r,studentId:id,studentIds:[id]}))
  };
}
async function loadStudentReferenceData(){
  const [plans,schedule,purchases,entitlements,feedbacks,courts,leads,leadFollowups]=await Promise.all([
    getCachedScan(T_PLANS).catch(()=>[]),
    getCachedScan(T_SCHEDULE).catch(()=>[]),
    scan(T_PURCHASES).catch(()=>[]),
    getCachedScan(T_ENTITLEMENTS).catch(()=>[]),
    withTimeout(scanFeedbacks().catch(()=>[]),3000,[]),
    getCachedScan(T_COURTS).catch(()=>[]),
    scan(T_LEADS).catch(()=>[]),
    scan(T_LEAD_FOLLOWUPS).catch(()=>[])
  ]);
  return {plans,schedule,purchases,entitlements,feedbacks,courts,leads,leadFollowups};
}
async function applyStudentIdentityUpdate(oldStudent,nextStudent){
  const updates=buildStudentIdentityUpdates(oldStudent,nextStudent,await loadStudentReferenceData());
  await Promise.all([
    ...updates.plans.map(r=>put(T_PLANS,r.id,r)),
    ...updates.schedule.map(r=>put(T_SCHEDULE,r.id,r)),
    ...updates.purchases.map(r=>put(T_PURCHASES,r.id,r)),
    ...updates.entitlements.map(r=>put(T_ENTITLEMENTS,r.id,r)),
    ...updates.feedbacks.map(r=>putFeedback(r.id,r)),
    ...updates.courts.map(r=>put(T_COURTS,r.id,r)),
    ...updates.leads.map(r=>put(T_LEADS,r.id,r)),
    ...updates.leadFollowups.map(r=>put(T_LEAD_FOLLOWUPS,r.id,r))
  ]);
  return updates;
}
async function validateScheduleSave(nextRec,oldRec){
  const schedules=await timed('scan schedule for conflict check',()=>withRequiredStorageTimeout(getCachedScan(T_SCHEDULE),3500,'排课校验超时，请稍后重试'));
  validateScheduleConflicts(nextRec,schedules,nextRec.id);
  /* hot-cache guard: timed('scan courts for schedule conflict check',()=>getCachedScan(T_COURTS).catch(()=>[])) */
  validateCourtBookingConflicts(nextRec,await timed('scan courts for schedule conflict check',()=>withTimeout(getCachedScan(T_COURTS).catch(()=>[]),2500,[])));
  return {warnings:collectScheduleRiskWarnings(nextRec,schedules,nextRec.id)};
}

function isMabaoFinanceSeedRow(row){
  return String(row?.seedTag||'').startsWith('mabao-finance-seed-');
}
function importedLedgerMonthKey(row){
  const sourceMonth=String(row?.sourceMonth||'').trim();
  if(sourceMonth)return sourceMonth;
  if(row?.scheduleId||Number(row?.lessonDelta)>=0)return '';
  const reason=String(row?.reason||'').trim();
  const match=reason.match(/^历史导入\s*(\d{1,2})月消课$/);
  if(!match)return '';
  const year=String(row?.relatedDate||row?.createdAt||'').slice(0,4);
  if(!/^\d{4}$/.test(year))return '';
  return `${year}-${String(match[1]).padStart(2,'0')}`;
}
function isImportedMonthlyLedgerRow(row){
  return !!importedLedgerMonthKey(row);
}
function importedLedgerDuplicateKey(row){
  const monthKey=importedLedgerMonthKey(row);
  if(!monthKey)return '';
  return [
    row.entitlementId,
    row.purchaseId,
    row.reason||'',
    monthKey
  ].join('|');
}
function isCurrentImportedLedgerRow(row){
  return !!(importedLedgerMonthKey(row)&&String(row?.sourceMonth||'').trim()&&isMabaoFinanceSeedRow(row)&&String(row?.studentId||'').trim());
}
function importedLedgerExactKey(row){
  const monthKey=importedLedgerMonthKey(row);
  if(!monthKey)return '';
  return [
    row.entitlementId,
    row.purchaseId,
    row.studentId,
    Number(row.lessonDelta)||0,
    row.action||'',
    row.reason||'',
    monthKey,
    row.sourceSheet||'',
    row.notes||''
  ].join('|');
}
function importedLedgerRowScore(row){
  return [
    String(row?.sourceMonth||'').trim()?1:0,
    isMabaoFinanceSeedRow(row)?1:0,
    String(row?.relatedDate||''),
    String(row?.createdAt||'')
  ];
}
function compareImportedLedgerRowScore(a,b){
  const as=importedLedgerRowScore(a),bs=importedLedgerRowScore(b);
  for(let i=0;i<as.length;i++){
    if(as[i]===bs[i])continue;
    return as[i]>bs[i]?1:-1;
  }
  return 0;
}
function collectDuplicateImportedLedgerIds(existingRows=[]){
  const grouped=new Map();
  const removeIds=[];
  (existingRows||[]).forEach(row=>{
    const key=importedLedgerDuplicateKey(row);
    if(!key)return;
    const list=grouped.get(key)||[];
    list.push(row);
    grouped.set(key,list);
  });
  grouped.forEach(list=>{
    const currentRows=list.filter(isCurrentImportedLedgerRow);
    const candidates=currentRows.length?currentRows:list;
    const currentIds=new Set(candidates.map(row=>row.id));
    list.forEach(row=>{if(!currentIds.has(row.id))removeIds.push(row.id);});
    const keepers=new Map();
    candidates.forEach(row=>{
      const key=importedLedgerExactKey(row)||importedLedgerDuplicateKey(row);
      const current=keepers.get(key);
      if(!current){
        keepers.set(key,row);
        return;
      }
      if(compareImportedLedgerRowScore(row,current)>0){
        removeIds.push(current.id);
        keepers.set(key,row);
        return;
      }
      removeIds.push(row.id);
    });
  });
  return [...new Set(removeIds.filter(Boolean))];
}
function filterImportedLedgerRowsForView(rows=[]){
  const grouped=new Map();
  const passthrough=[];
  for(const row of rows||[]){
    const key=importedLedgerDuplicateKey(row);
    if(!key){
      passthrough.push(row);
      continue;
    }
    const list=grouped.get(key)||[];
    list.push(row);
    grouped.set(key,list);
  }
  const filtered=[...passthrough];
  grouped.forEach(list=>{
    const currentRows=list.filter(isCurrentImportedLedgerRow);
    filtered.push(...(currentRows.length?currentRows:list));
  });
  return filtered;
}
function normalizeEntitlementLedgerRowsForView(rows=[]){
  const deduped=[];
  const seen=new Set();
  for(const row of filterImportedLedgerRowsForView(rows)||[]){
    const monthKey=importedLedgerMonthKey(row);
    const key=monthKey
      ? [
          row.entitlementId,
          row.purchaseId,
          row.studentId,
          Number(row.lessonDelta)||0,
          row.action||'',
          row.reason||'',
          monthKey,
          row.sourceSheet||'',
          row.notes||''
        ].join('|')
      : [
          row.entitlementId,
          row.purchaseId,
          row.studentId,
          row.scheduleId||'',
          Number(row.lessonDelta)||0,
          row.action||'',
          row.reason||'',
          row.relatedDate||'',
          row.sourceMonth||'',
          row.sourceSheet||'',
          row.notes||''
        ].join('|');
    if(seen.has(key))continue;
    seen.add(key);
    deduped.push(row);
  }
  const monthlyMap=new Map();
  const result=[];
  for(const row of deduped){
    const monthKey=importedLedgerMonthKey(row);
    if(!monthKey){
      result.push(row);
      continue;
    }
    const key=[row.entitlementId,row.purchaseId,row.studentId,row.reason||'',monthKey].join('|');
    const current=monthlyMap.get(key);
    if(!current){
      monthlyMap.set(key,{...row,sourceMonth:row.sourceMonth||monthKey});
      continue;
    }
    monthlyMap.set(key,{
      ...current,
      lessonDelta:(Number(current.lessonDelta)||0)+(Number(row.lessonDelta)||0),
      relatedDate:String(row.relatedDate||'')>String(current.relatedDate||'')?row.relatedDate:current.relatedDate,
      createdAt:String(row.createdAt||'')>String(current.createdAt||'')?row.createdAt:current.createdAt,
      sourceMonth:current.sourceMonth||monthKey
    });
  }
  return [...result,...monthlyMap.values()];
}
function normalizeEntitlementLedgerRowsForDetailView(rows=[]){
  const deduped=[];
  const seen=new Set();
  for(const row of filterImportedLedgerRowsForView(rows)||[]){
    const monthKey=importedLedgerMonthKey(row);
    const key=[
      row.entitlementId,
      row.purchaseId,
      row.studentId,
      row.scheduleId||'',
      Number(row.lessonDelta)||0,
      row.action||'',
      row.reason||'',
      row.relatedDate||'',
      monthKey,
      row.sourceDate||'',
      row.sourceTimeBand||'',
      row.sourceLocation||row.location||'',
      row.sourceVenue||row.venue||row.courtName||row.court||'',
      row.coach||'',
      row.sourceSheet||'',
      row.notes||''
    ].join('|');
    if(seen.has(key))continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}
async function listCampusesWithDefaults(){
  const rows=await getCachedScan(T_CAMPUSES).catch(()=>[]);
  return rows.length?rows:DEFAULT_CAMPUSES;
}
function financeWeekdayText(value){
  const day=String(value||'').slice(0,10);
  if(!day)return '—';
  const date=new Date(`${day}T00:00:00`);
  if(Number.isNaN(date.getTime()))return '—';
  return ['周一','周二','周三','周四','周五','周六','周日'][(date.getDay()+6)%7]||'—';
}
function financeTimeText(value){
  const text=String(value||'');
  if(text.includes('T'))return text.slice(11,16)||'—';
  if(/^\d{2}:\d{2}/.test(text))return text.slice(0,5);
  return '—';
}
function financeDateTimeText(value){
  const text=String(value||'');
  if(!text)return '—';
  if(text.includes('T'))return `${text.slice(0,10)} ${text.slice(11,16)}`.trim();
  return text;
}
function financeNormalizeDateTimeValue(value){
  const text=String(value||'').trim().replace('T',' ');
  const match=text.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?::(\d{2}))?/);
  return match?`${match[1]} ${match[2]}:${match[3]||'00'}`:'';
}
function financeBusinessDateTime(primary,...fallbacks){
  const primaryText=String(primary||'').trim();
  const primaryFull=financeNormalizeDateTimeValue(primaryText);
  if(primaryFull)return primaryFull;
  const day=primaryText.slice(0,10)||fallbacks.map(item=>String(item||'').slice(0,10)).find(Boolean)||'';
  for(const item of fallbacks){
    const full=financeNormalizeDateTimeValue(item);
    if(full&&(!day||full.slice(0,10)===day))return full;
  }
  return day?`${day} 00:00:00`:'';
}
function financePurchaseStatusText(purchase){
  return purchase?.status==='voided'?'已作废':'正常';
}
function buildFinanceCampusResolvers(campuses=[]){
  const codeToName=new Map();
  const knownNames=new Set();
  (campuses||[]).forEach(item=>{
    const code=String(item?.code||item?.id||'').trim();
    const name=String(item?.name||item?.code||item?.id||'').trim();
    if(code&&name)codeToName.set(code,name);
    if(name)knownNames.add(name);
  });
  const fromValue=(value)=>{
    if(Array.isArray(value))return fromValue(value[0]);
    const raw=String(value||'').trim();
    if(!raw)return '';
    if(codeToName.has(raw))return codeToName.get(raw)||'';
    if(knownNames.has(raw))return raw;
    return '';
  };
  const fromHints=(...values)=>{
    for(const value of values){
      const direct=fromValue(value);
      if(direct)return direct;
    }
    const hintText=values.flatMap(value=>Array.isArray(value)?value:[value]).map(value=>String(value||'')).join(' ');
    if(/mabao|马坡/i.test(hintText))return '顺义马坡';
    if(/shilipu|十里堡/i.test(hintText))return '朝阳十里堡';
    if(/guowang|国网/i.test(hintText))return '朝阳国网';
    if(/langang|蓝色港湾/i.test(hintText))return '朝阳蓝色港湾';
    if(/chaojun|朝珺/i.test(hintText))return '朝珺私教';
    return '';
  };
  return {fromValue,fromHints};
}
function financeDifferenceReason(text=''){
  const hint=String(text||'');
  if(/会员储值补足/.test(hint))return '系统补的会员储值来源，不计入三张业务表';
  if(/期初导入汇总/.test(hint))return '期初导入汇总，不计入三张业务表';
  return '';
}
const {
  buildFinanceUnifiedRows,
  buildFinanceSettlementRows,
  buildFinancePageSnapshot,
  buildVerifiedFinanceWithImportIncrements
} = createFinanceSnapshotHelpers({
  buildFinanceCampusResolvers,
  normalizeOperatorAccountName,
  parseArr,
  financeBusinessDateTime,
  financeWeekdayText,
  financeDifferenceReason,
  financePurchaseStatusText,
  normalizeEntitlementLedgerRowsForView,
  importedLedgerMonthKey,
  isBillableSchedule,
  isDirectPaidSchedule,
  isStoredValuePayMethod,
  roundMoney,
  financeTimeText,
  financeDateTimeText,
  normalizeCourtHistory,
  effectiveScheduleStatus,
  parseLessonValue,
  computeCourtFinance
});
const handleResidualPageDataRoutes=createResidualPageDataRoutes({
  init,sendJson:routeSendJson,listCampusesWithDefaults,getCachedScan,scanFirstRows,isProductionRuntime,getFinancePageScheduleRows,
  filterLoadAllForUser,mergeDuplicateLeadRows,buildFinancePageSnapshot,getFinancePageSnapshot,getFinancePageSnapshotIfCached,FINANCE_PAGE_COURT_PROJECTION_FIELDS,
  tables:{T_STUDENTS,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_COURTS,T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_ACCOUNTS,T_MEMBERSHIP_PLANS,T_USERS,T_LEADS,T_LEAD_FOLLOWUPS,T_COACHES,T_SCHEDULE}
});
function parseSimpleCsv(text=''){
  const rows=[];
  let current='';
  let row=[];
  let inQuotes=false;
  for(let i=0;i<text.length;i+=1){
    const ch=text[i];
    if(ch==='"'){
      if(inQuotes&&text[i+1]==='"'){
        current+='"';
        i+=1;
      }else{
        inQuotes=!inQuotes;
      }
      continue;
    }
    if(ch===','&&!inQuotes){
      row.push(current);
      current='';
      continue;
    }
    if((ch==='\n'||ch==='\r')&&!inQuotes){
      if(ch==='\r'&&text[i+1]==='\n')i+=1;
      row.push(current);
      current='';
      if(row.some(cell=>String(cell||'').trim()))rows.push(row);
      row=[];
      continue;
    }
    current+=ch;
  }
  row.push(current);
  if(row.some(cell=>String(cell||'').trim()))rows.push(row);
  return rows;
}
function loadVerifiedFinanceArtifacts(campuses=[]){
  const summaryPath=path.join(__dirname,'verified-finance','summary-2026-05-07.json');
  const sourcePath=path.join(__dirname,'verified-finance','rows-2026-05-07.csv');
  if(!fs.existsSync(summaryPath)||!fs.existsSync(sourcePath))return null;
  const raw=JSON.parse(fs.readFileSync(summaryPath,'utf8'));
  const {fromHints}=buildFinanceCampusResolvers(campuses);
  const packageIncome=Number(raw?.['分来源汇总']?.['课包购买']?.['金额']||0);
  const bookingIncome=Number(raw?.['分来源汇总']?.['订场现金/微信收入']?.['金额']||0);
  const storedValueIncome=79000;
  const storedValueConsumed=Number(raw?.['分来源汇总']?.['储值扣款已入账']?.['金额']||0);
  const packageRecognized=82773.33;
  const bookingRecognized=255038;
  const directCourseIncome=0;
  const directCourseRecognized=0;
  const cash=packageIncome+bookingIncome+storedValueIncome;
  const recognized=packageRecognized+storedValueConsumed+bookingRecognized;
  const deferred=Math.max(0,cash-recognized);
  const csvRows=parseSimpleCsv(fs.readFileSync(sourcePath,'utf8'));
  const headers=(csvRows.shift()||[]).map(item=>String(item||'').trim());
  const normalizedRows=csvRows.map((cells,index)=>{
    const record=Object.fromEntries(headers.map((key,i)=>[key,String(cells[i]||'').trim()]));
    const source=record['来源'];
    const amount=Math.round(Number(record['金额']||0)*100)/100;
    const campusName=fromHints(record['校区'],record['备注'],record['单据'],record['客户'])||'—';
    const common={
      id:`verified-${index+1}`,
      businessDate:record['日期']||'',
      campusName,
      customer:record['客户']||'—',
      paymentChannel:record['支付方式']||'—',
      sourceDocument:record['单据']||'—',
      notes:record['备注']||'',
      systemStatus:'已核对'
    };
    if(source==='课包购买'){
      return {
        ...common,
        businessType:'课程',
        action:'收款',
        cashDelta:amount,
        recognizedRevenueDelta:0,
        deferredRevenueDelta:amount
      };
    }
    if(source==='会员储值充值'){
      return {
        ...common,
        businessType:'会员储值',
        action:'收款',
        cashDelta:amount,
        recognizedRevenueDelta:0,
        deferredRevenueDelta:amount
      };
    }
    if(source==='储值扣款已入账'){
      return {
        ...common,
        businessType:'会员订场',
        action:'已入账',
        cashDelta:0,
        recognizedRevenueDelta:amount,
        deferredRevenueDelta:-amount
      };
    }
    const bookingType=/约球/.test(`${record['备注']||''} ${record['单据']||''}`)?'约球局':'散客订场';
    return {
      ...common,
      businessType:bookingType,
      action:'收款',
      cashDelta:amount,
      recognizedRevenueDelta:amount,
      deferredRevenueDelta:0
    };
  }).filter(Boolean);
  normalizedRows.push({
    id:'verified-course-recognized-summary',
    businessDate:'2026-05-07',
    campusName:'—',
    customer:'—',
    businessType:'课程',
    action:'已入账',
    cashDelta:0,
    recognizedRevenueDelta:packageRecognized,
    deferredRevenueDelta:-packageRecognized,
    paymentChannel:'课包划扣',
    sourceDocument:'已核对汇总 2026-05-07',
    notes:'课包已入账汇总',
    systemStatus:'已核对'
  });
  return {
    overviewData:{
      all:{
        cash,
        recognized,
        deferred,
        courseIncome:packageIncome,
        courseRecognized:packageRecognized,
        directCourseIncome,
        directCourseRecognized,
        packageIncome,
        packageRecognized,
        storedValueIncome,
        storedValueConsumed,
        bookingIncome,
        bookingRecognized,
        tradeCount:985
      },
      campuses:[]
    },
    normalizedRows
  };
}
async function getFinancePageSnapshot(){
  if(financeSnapshotCache)return cloneCacheValue(financeSnapshotCache);
  const campuses=await listCampusesWithDefaults();
  const [students,purchases,entitlements,entitlementLedger,courts,membershipOrders,schedule]=await Promise.all([
    getCachedScan(T_STUDENTS).catch(()=>[]),
    getCachedScan(T_PURCHASES).catch(()=>[]),
    getCachedScan(T_ENTITLEMENTS).catch(()=>[]),
    getCachedScan(T_ENTITLEMENT_LEDGER).catch(()=>[]),
    getCachedScan(T_COURTS,{columns:FINANCE_PAGE_COURT_PROJECTION_FIELDS}).catch(()=>[]),
    getCachedScan(T_MEMBERSHIP_ORDERS).catch(()=>[]),
    getCachedScan(T_SCHEDULE,{columns:SCHEDULE_LIST_PROJECTION_FIELDS}).catch(()=>[])
  ]);
  const snapshot=buildFinancePageSnapshot({campuses,students,purchases,entitlements,entitlementLedger,courts,membershipOrders,schedule});
  financeSnapshotCache=cloneCacheValue(snapshot);
  return snapshot;
}
function getFinancePageSnapshotIfCached(){
  return financeSnapshotCache?cloneCacheValue(financeSnapshotCache):null;
}
function isProductionRuntime(){
  return RUNTIME_STAGE==='production';
}

scheduleInitInBackground();

async function ensureLeadTables(){
  for(const table of [T_LEADS,T_LEAD_FOLLOWUPS,T_LEAD_IMPORT_BATCHES])await mkTable(table);
}

function sendJson(res,body,code=200){
  applyCorsHeaders(res.req,res);
  res.status(code).json(body);
}
function sendPlainText(res,text,code=200){
  applyCorsHeaders(res.req,res);
  res.status(code).send(String(text||''));
}
function sendXml(res,xml,code=200){
  applyCorsHeaders(res.req,res);
  res.setHeader('Content-Type','application/xml; charset=utf-8');
  res.status(code).send(String(xml||''));
}
function configuredCorsOrigins(env=process.env){
  return String(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);
}
function resolveCorsOrigin(req,env=process.env){
  const origin=String(req?.headers?.origin||'').trim();
  const allowed=configuredCorsOrigins(env);
  const origins=allowed.length?allowed:(isProductionRuntime()?['https://www.flowtennis.cn']:['*']);
  if(origins.includes('*'))return origin||'*';
  if(origin&&origins.includes(origin))return origin;
  return origins[0]||'';
}
function applyCorsHeaders(req,res){
  const origin=resolveCorsOrigin(req);
  if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
  if(origin&&origin!=='*')res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
}
const {
  LOGIN_STORAGE_TIMEOUT_ERROR,
  LOGIN_INVALID_ACCOUNT_ERROR,
  checkLoginRateLimit,
  recordLoginAttempt,
  loadLoginUser,
  verifyLoginPassword,
  authUser,
  mergeStoredAuthUser,
  assertAuthUserActive,
  requireAdminUser,
  requireMatchAdminPermission,
  requireMatchUser,
  ensureMatchUserResponse
}=createAuthServices({JWT_SECRET,normalizePermissionProfile,userHasFeaturePermission,getCachedRow,getCachedScan,isTableMissingError,withTimeout,T_USERS,sendJson});
const handleAuthRoutes=createAuthRoutes({
  sendJson:routeSendJson,jwt,JWT_SECRET,timedEndpointMetric,checkLoginRateLimit,recordLoginAttempt,
  loadLoginUser,verifyLoginPassword,mergeStoredAuthUser,assertAuthUserActive,
  LOGIN_STORAGE_TIMEOUT_ERROR,LOGIN_INVALID_ACCOUNT_ERROR,
  fetchWechatSession,extractWechatOpenId,getWechatUserByOpenId,
  get,put,bcrypt,bindWechatUserWithIndex,T_USERS
});
const handleMatchRoutes=createMatchRoutes({
  sendJson:routeSendJson,uuidv4,MATCH_MINIPROGRAM_SECRET,isProductionRuntime,fetchWechatSession,extractWechatOpenId,
  getMatchSqlPool,buildMatchUserToken,canMatchUserCreate,ensureMatchUserResponse,
  listMatchesForViewer,createMatchForUser,getMatchForViewer,toMatchDetailResponse,updateMatchForUser,
  cancelMatchForUser,registerMatchUser,cancelRegistrationForUser,submitMatchTechnicalRating,
  listMyMatches,getMatchProfile,updateMatchProfile,fetchWechatPhoneNumber,getMatchSettings,
  creatorConfirmMatchAttendance,listMatchNotifications,listMatchPlayers,requireAdminUser,
  requireMatchAdminPermission,listAdminMatches,shouldUseEmptyMatchAdminListFallback,saveMatchSettings,
  getMatchFinanceDailyReportForAdmin,adminBookMatch,adminCancelMatch,confirmMatchAttendance,
  adminHandleBookedWithdrawal,adminTransferMatchReplacement,generateMatchFeeLedger,markMatchFeeSplit
});
function diagnosticsTokenAllowed(req){
  const tokens=[process.env.DIAG_TOKEN,process.env.CRON_SECRET].map(value=>String(value||'').trim()).filter(Boolean);
  if(!tokens.length)return false;
  const auth=String(req?.headers?.authorization||'');
  return tokens.some(token=>auth===`Bearer ${token}`);
}
function requireDiagnosticsAccess(req,res){
  const user=authUser(req);
  if(user?.role==='admin'&&user?.type!=='match_user')return true;
  if(diagnosticsTokenAllowed(req))return true;
  sendJson(res,{error:'无权限'},403);
  return false;
}
function userMatchPermissions(user){
  return normalizePermissionProfile(user).featurePermissions;
}
function canMatchUserCreateByAdminUser(adminUser){
  return true;
}
async function canMatchUserCreate(userId){
  const pool=getMatchSqlPool();
  const userRes=await pool.query('SELECT * FROM match_users WHERE id=$1',[userId]);
  const user=userRes.rows[0]||{};
  const phone=normalizePhone(user.phone||'');
  if(!phone)return false;
  return canMatchUserCreateByAdminUser(null);
}
function buildMatchUserToken(user){
  return jwt.sign({id:user.id,type:'match_user',openid:user.openid},JWT_SECRET,{expiresIn:'7d'});
}
function assertMatchPostInput(input){
  const title=String(input.title||'').trim();
  if(!title)throw new Error('请填写标题');
  const matchType=normalizeMatchType(input.matchType);
  if(!['single','double'].includes(matchType))throw new Error('请选择约球类型');
  const targetHeadcount=parseInt(input.targetHeadcount,10);
  if(!Number.isInteger(targetHeadcount)||targetHeadcount<2)throw new Error('请填写有效人数');
  const rawNtrpMin=String(input.ntrpMin??'').trim();
  const rawNtrpMax=String(input.ntrpMax??'').trim();
  const hasPresetLevel=rawNtrpMin!==''||rawNtrpMax!=='';
  const ntrpMin=hasPresetLevel?Number(rawNtrpMin):0;
  const ntrpMax=hasPresetLevel?Number(rawNtrpMax):0;
  if(hasPresetLevel&&(!isValidNtrp(ntrpMin)||!isValidNtrp(ntrpMax)||ntrpMin>ntrpMax))throw new Error('NTRP 范围不正确');
  if(!hasPresetLevel&&(rawNtrpMin!==rawNtrpMax))throw new Error('NTRP 范围不正确');
  if(!['不限','男生','女生'].includes(input.genderPreference))throw new Error('请选择性别偏好');
  const estimatedCourtFee=normalizeMoney(input.estimatedCourtFee);
  if(estimatedCourtFee<=0)throw new Error('费用必须大于 0');
  const startMs=dateMs(input.startTime);
  const endMs=dateMs(input.endTime);
  if(!Number.isFinite(startMs))throw new Error('请选择开始时间');
  if(!Number.isFinite(endMs)||endMs<=startMs)throw new Error('结束时间必须晚于开始时间');
  const venueName=String(input.venueName||'').trim();
  const venueAddress=String(input.venueAddress||'').trim();
  const venueLatitude=Number(input.venueLatitude);
  const venueLongitude=Number(input.venueLongitude);
  if(!venueName||!venueAddress||!Number.isFinite(venueLatitude)||!Number.isFinite(venueLongitude))throw new Error('请选择球场');
  if(String(input.startTime||'').slice(0,10)!==String(input.endTime||'').slice(0,10))throw new Error('不能跨天');
  return {...input,title,matchType,targetHeadcount,ntrpMin,ntrpMax,levelMode:hasPresetLevel?'preset':'first_join',estimatedCourtFee,venueName,venueAddress,venueLatitude,venueLongitude,status:input.status||'open'};
}
function creatorAttendanceDeadline(match){
  const endTime=match?.endtime||match?.endTime||match?.starttime||match?.startTime;
  const endMs=dateMs(endTime);
  if(!Number.isFinite(endMs))return NaN;
  return endMs+MATCH_CREATOR_CONFIRM_DEADLINE_HOURS*60*60*1000;
}
function normalizeMatchType(value){
  const raw=String(value||'').trim();
  if(raw==='单打')return 'single';
  if(raw==='双打')return 'double';
  return raw;
}
function maskPhone(value=''){
  const phone=normalizePhone(value);
  if(!/^1\d{10}$/.test(phone))return '';
  return `${phone.slice(0,3)}****${phone.slice(-4)}`;
}
function isValidNtrp(value){
  return Number.isFinite(value)&&value>=1&&value<=5&&Math.abs(value*2-Math.round(value*2))<0.001;
}
function formatNtrpValue(value){
  const num=Number(value);
  if(!isValidNtrp(num))return '';
  return num.toFixed(1);
}
function formatNtrpRangeText(minValue,maxValue){
  const min=formatNtrpValue(minValue);
  const max=formatNtrpValue(maxValue);
  if(min&&max)return min===max?min:`${min}-${max}`;
  return min||max||'待首位报名定级';
}
const MATCH_TECHNICAL_LEVELS=['1.0','1.5','2.0','2.5','3.0','3.5','4.0','4.5','5.0+'];
function technicalLevelNumber(value){
  const raw=String(value||'').trim();
  if(raw==='5.0+')return 5;
  const num=Number(raw);
  return Number.isFinite(num)?num:NaN;
}
function formatTechnicalRatingAverage(value){
  const num=Number(value);
  if(!Number.isFinite(num)||num<=0)return '';
  if(num>=5)return '5.0+';
  return num.toFixed(1);
}
function assertMatchTechnicalRatingInput(input={},raterUserId=''){
  const ratedUserId=String(input.ratedUserId||'').trim();
  const technicalLevel=String(input.technicalLevel||'').trim();
  if(!ratedUserId)throw new Error('请选择球友');
  if(String(ratedUserId)===String(raterUserId))throw new Error('不能给自己评定');
  if(!MATCH_TECHNICAL_LEVELS.includes(technicalLevel))throw new Error('技术等级不正确');
  return {ratedUserId,technicalLevel};
}
function buildMatchTechnicalRatingSummary(ratings=[]){
  const grouped=new Map();
  for(const row of ratings||[]){
    const userId=String(row.rateduserid||row.ratedUserId||'').trim();
    const level=String(row.technicallevel||row.technicalLevel||'').trim();
    const numeric=technicalLevelNumber(level);
    if(!userId||!Number.isFinite(numeric))continue;
    const current=grouped.get(userId)||{sum:0,count:0};
    grouped.set(userId,{sum:current.sum+numeric,count:current.count+1});
  }
  const result=new Map();
  for(const [userId,item] of grouped.entries()){
    const average=item.count?item.sum/item.count:0;
    result.set(userId,{
      technicalRatingAverage:Number(average.toFixed(2)),
      technicalRatingText:formatTechnicalRatingAverage(average),
      technicalRatingCount:item.count
    });
  }
  return result;
}
function activeMatchRegistrations(registrations=[]){
  return (registrations||[]).filter(row=>String(row.registrationstatus||row.registrationStatus)==='registered');
}
function activeRegistrationLevels(registrations=[]){
  return activeMatchRegistrations(registrations)
    .map(row=>Number(row.ntrplevel||row.ntrpLevel||0))
    .filter(isValidNtrp)
    .sort((a,b)=>a-b);
}
function resolveEffectiveLevelRange(row,registrations=[]){
  const levels=activeRegistrationLevels(registrations);
  if(levels.length>0)return {min:levels[0],max:levels[levels.length-1],pending:false};
  const min=Number(row.ntrpmin||row.ntrpMin||0);
  const max=Number(row.ntrpmax||row.ntrpMax||0);
  if(isValidNtrp(min)&&isValidNtrp(max))return {min,max,pending:false};
  return {min:0,max:0,pending:true};
}
function matchTimelineStatus(match,now=new Date()){
  const status=String(match?.status||'open');
  if(status==='cancelled')return '已取消';
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  const startMs=dateMs(match.startTime||match.starttime);
  const endMs=dateMs(match.endTime||match.endtime);
  if(Number.isFinite(endMs)&&nowMs>=endMs)return '已结束';
  if(Number.isFinite(startMs)&&nowMs<startMs)return '待开始';
  return '进行中';
}
function deriveMatchStatus(match,now=new Date()){
  const status=String(match?.status||'open');
  if(['cancelled','settled','fee_pending'].includes(status))return status;
  const nowMs=now instanceof Date?now.getTime():dateMs(now);
  const startTime=match.startTime||match.starttime;
  const endTime=match.endTime||match.endtime;
  if(status==='booked'){
    if(Number.isFinite(dateMs(endTime))&&nowMs>=dateMs(endTime))return 'attendance_pending';
    if(Number.isFinite(dateMs(startTime))&&nowMs>=dateMs(startTime))return 'playing';
  }
  return status;
}
function matchDurationHours(startTime,endTime){
  const startMs=dateMs(startTime);
  const endMs=dateMs(endTime);
  if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<=startMs)return 0;
  return (endMs-startMs)/(60*60*1000);
}
function isFourPlayerGroupMatch(match){
  return Number(match?.targetheadcount||match?.targetHeadcount||0)===4;
}
function computeMatchSettlementAmount({matchType,startTime,endTime,finalCourtFee,participantCount}={}){
  const base=Math.round(normalizeMoney(finalCourtFee));
  const count=Number(participantCount||0);
  if(count<=1)throw new Error('1人默认取消，不能生成AA');
  let surcharge=0;
  if(normalizeMatchType(matchType)==='single'&&count===2&&matchDurationHours(startTime,endTime)>=1.99)surcharge=60;
  return base+surcharge;
}
function buildPreviewAaText({matchType,startTime,endTime,estimatedCourtFee=0,finalCourtFee=0,activeCount=0,targetHeadcount=0}={}){
  const currentCount=Number(activeCount||0);
  const previewCount=currentCount>1?currentCount:Number(targetHeadcount||0);
  const finalFee=normalizeMoney(finalCourtFee);
  const estimatedFee=normalizeMoney(estimatedCourtFee);
  if(previewCount>1&&finalFee>0){
    const total=computeMatchSettlementAmount({matchType,startTime,endTime,finalCourtFee:finalFee,participantCount:previewCount});
    return `约 ¥${Math.ceil(total/previewCount)}/人`;
  }
  if(previewCount>1&&estimatedFee>0){
    const total=computeMatchSettlementAmount({matchType,startTime,endTime,finalCourtFee:estimatedFee,participantCount:previewCount});
    return `约 ¥${Math.ceil(total/previewCount)}/人`;
  }
  if(currentCount===1)return '待成团';
  return 'AA待定';
}
function splitAaFee(finalCourtFee,participantIds){
  const total=Math.round(normalizeMoney(finalCourtFee));
  const ids=[...new Set((participantIds||[]).filter(Boolean).map(String))];
  if(total<=0)throw new Error('最终费用必须大于 0');
  if(ids.length<=0)throw new Error('没有可计费参与人');
  const each=Math.ceil(total/ids.length);
  return ids.map((userId,index)=>{
    const amount=index===ids.length-1?total-each*(ids.length-1):each;
    return {userId,amount};
  });
}
async function withMatchSqlTransaction(fn){
  const client=await getMatchSqlPool().connect();
  try{
    await client.query('BEGIN');
    const result=await fn(client);
    await client.query('COMMIT');
    return result;
  }catch(err){
    await client.query('ROLLBACK').catch(()=>null);
    throw err;
  }finally{
    client.release();
  }
}
async function registerMatchUser(matchId,userId){
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const status=deriveMatchStatus(match);
    if(!['open','full'].includes(status))throw new Error('当前状态不能报名');
    if(dateMs(match.starttime||match.startTime)<=Date.now())throw new Error('已开始，不能报名');
    const [dup,activeRegsRes,userRes]=await Promise.all([
      client.query("SELECT id FROM match_registrations WHERE matchId=$1 AND userId=$2 AND registrationStatus='registered'",[matchId,userId]),
      client.query("SELECT r.*,u.ntrpLevel FROM match_registrations r LEFT JOIN match_users u ON u.id=r.userId WHERE r.matchId=$1 AND r.registrationStatus='registered' ORDER BY r.createdAt ASC",[matchId]),
      client.query('SELECT * FROM match_users WHERE id=$1',[userId])
    ]);
    if(dup.rowCount>0)throw new Error('已报名');
    const user=userRes.rows[0];
    if(!user)throw new Error('用户不存在');
    const userNtrp=Number(user.ntrplevel||user.ntrpLevel||0);
    if(!isValidNtrp(userNtrp))throw new Error('请先在“我的”页面设置真实水平');
    const activeRegs=activeRegsRes.rows;
    const count=activeRegs.length;
    if(count>=Number(match.targetheadcount||match.targetHeadcount))throw new Error('名额已满');
    const currentMin=Number(match.ntrpmin||match.ntrpMin||0);
    const levelMode=String(match.levelmode||match.levelMode||'preset');
    if(levelMode==='first_join'&&count===0&&currentMin<=0){
      await client.query('UPDATE match_posts SET ntrpMin=$1,ntrpMax=$1,updatedAt=NOW() WHERE id=$2',[userNtrp,matchId]);
    }else if(isValidNtrp(currentMin)&&userNtrp<currentMin){
      throw new Error(`本局最低水平为 ${currentMin.toFixed(1)}`);
    }
    const id=uuidv4();
    await client.query("INSERT INTO match_registrations(id,matchId,userId,registrationStatus,createdAt) VALUES($1,$2,$3,'registered',NOW())",[id,matchId,userId]);
    const nextCount=count+1;
    const nextStatus=nextCount>=Number(match.targetheadcount||match.targetHeadcount)?'full':'open';
    let formationStatus=String(match.formationstatus||match.formationStatus||'free_open');
    let justFormedGroup=false;
    if(isFourPlayerGroupMatch(match)&&nextCount>=4){
      const prepayDeadlineAt=new Date(Date.now()+MATCH_PREPAY_WINDOW_HOURS*60*60*1000).toISOString();
      const participantIds=[...activeRegs.map(row=>String(row.userid||row.userId)),String(userId)];
      const existingFeeRes=await client.query('SELECT * FROM match_fee_records WHERE matchId=$1 LIMIT 1',[matchId]);
      if(existingFeeRes.rowCount<=0){
        const ledger=buildGroupPrepayLedger({matchId,estimatedCourtFee:match.estimatedcourtfee||match.estimatedCourtFee,participantIds});
        await client.query(
          'INSERT INTO match_fee_records(id,matchId,estimatedCourtFee,finalCourtFee,participantCount,aaAmount,roundingRule,roundingDifference,status,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())',
          [ledger.record.id,matchId,ledger.record.estimatedCourtFee,ledger.record.finalCourtFee,ledger.record.participantCount,ledger.record.aaAmount,ledger.record.roundingRule,ledger.record.roundingDifference,ledger.record.status]
        );
        for(const split of ledger.splits){
          await client.query('INSERT INTO match_fee_splits(id,matchId,userId,amount,payStatus,paidAmount,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,NOW(),NOW())',[split.id,matchId,split.userId,split.amount,split.payStatus,split.paidAmount]);
        }
        justFormedGroup=true;
      }
      formationStatus='group_ready';
      await client.query('UPDATE match_posts SET status=$1,formationStatus=$2,prepayTriggeredAt=NOW(),prepayDeadlineAt=$3,updatedAt=NOW() WHERE id=$4',[nextStatus,formationStatus,prepayDeadlineAt,matchId]);
    }else{
      await client.query('UPDATE match_posts SET status=$1,formationStatus=$2,updatedAt=NOW() WHERE id=$3',[nextStatus,formationStatus,matchId]);
    }
    return {
      id,
      currentHeadcount:nextCount,
      status:nextStatus,
      formationStatus,
      justFormedGroup,
      formationNotice:justFormedGroup?'本局已成团，需在2小时内完成预付；全员付款成功后约球生效':''};
  });
}
function buildMatchStatusHint({match,registrations=[],attendanceRows=[],feeRecord=null}={}){
  const activeRegs=(registrations||[]).filter(row=>String(row.registrationstatus||row.registrationStatus)==='registered');
  const confirmedCount=(attendanceRows||[]).filter(row=>['attended','absent'].includes(row.finalstatus||row.finalStatus)).length;
  const feeGenerated=!!feeRecord;
  const deadlineMs=creatorAttendanceDeadline(match);
  const status=deriveMatchStatus(match);
  if(feeGenerated)return {attendanceLocked:true,needsOperatorTakeover:false,creatorConfirmDeadlineAt:Number.isFinite(deadlineMs)?new Date(deadlineMs).toISOString():'',statusHintText:'AA 已生成，到场名单已锁定'};
  if(['attendance_pending','playing','booked'].includes(status)&&Number.isFinite(deadlineMs)&&Date.now()>deadlineMs)return {attendanceLocked:false,needsOperatorTakeover:true,creatorConfirmDeadlineAt:new Date(deadlineMs).toISOString(),statusHintText:'发起者超时未确认，请联系运营接管'};
  if(['attendance_pending','playing','booked'].includes(status)&&confirmedCount<activeRegs.length)return {attendanceLocked:false,needsOperatorTakeover:false,creatorConfirmDeadlineAt:Number.isFinite(deadlineMs)?new Date(deadlineMs).toISOString():'',statusHintText:`待确认到场 ${confirmedCount}/${activeRegs.length}`};
  if(status==='fee_pending')return {attendanceLocked:false,needsOperatorTakeover:false,creatorConfirmDeadlineAt:Number.isFinite(deadlineMs)?new Date(deadlineMs).toISOString():'',statusHintText:'到场已确认，待生成或确认 AA'};
  if(status==='settled')return {attendanceLocked:true,needsOperatorTakeover:false,creatorConfirmDeadlineAt:Number.isFinite(deadlineMs)?new Date(deadlineMs).toISOString():'',statusHintText:'AA 已结清'};
  return {attendanceLocked:false,needsOperatorTakeover:false,creatorConfirmDeadlineAt:Number.isFinite(deadlineMs)?new Date(deadlineMs).toISOString():'',statusHintText:''};
}
function toMatchView(row,registrations=[],viewerId='',feeSplits=[],viewerAttendance=null,attendanceRows=[],feeRecord=null){
  const attendanceByUser=new Map((attendanceRows||[]).map(item=>[String(item.userid||item.userId),item]));
  const mappedRegistrations=(registrations||[]).map(item=>{
    const attendance=attendanceByUser.get(String(item.userid||item.userId));
    const confirmedCount=Number(item.confirmedattendancecount||item.confirmedAttendanceCount||0);
    const attendedCount=Number(item.attendedcount||item.attendedCount||0);
    const userId=String(item.userid||item.userId||'');
    const phone=String(item.phone||'').trim();
    const fallbackName=phone?`${phone.slice(0,3)}****${phone.slice(-4)}`:(userId?'球友':'');
    return {
      ...item,
      userId,
      userName:String(item.nickname||item.nickName||item.username||item.userName||fallbackName||'球友'),
      registrationStatus:item.registrationstatus||item.registrationStatus||'',
      ntrpText:String(item.ntrplevel||item.ntrpLevel||'').trim()||'未设水平',
      attendanceRateText:confirmedCount>0?`${Math.round(attendedCount*100/confirmedCount)}%`:'暂无守约率',
      finalAttendanceStatus:attendance?.finalstatus||attendance?.finalStatus||''
    };
  });
  const active=(mappedRegistrations||[]).filter(r=>String(r.registrationStatus||r.registrationstatus)==='registered');
  const viewerRegistration=(registrations||[]).find(r=>String(r.userid||r.userId)===String(viewerId));
  const finalFee=normalizeMoney(row.finalcourtfee||row.finalCourtFee);
  const estimatedCourtFee=normalizeMoney(row.estimatedcourtfee||row.estimatedCourtFee);
  const targetHeadcount=Number(row.targetheadcount||row.targetHeadcount||0);
  const activeCount=active.length;
  const viewerFeeSplit=(feeSplits||[]).find(row=>String(row.userid||row.userId)===String(viewerId))||null;
  const levelRange=resolveEffectiveLevelRange(row,active);
  const formationStatus=String(row.formationstatus||row.formationStatus||'free_open');
  const canSelfCancel=Boolean(viewerRegistration&&String(viewerRegistration.registrationstatus||viewerRegistration.registrationStatus)==='registered'&&formationStatus!=='group_locked');
  const derivedStatus=deriveMatchStatus(row);
  const statusText=formationStatus==='group_ready'?'待预付':formationStatus==='group_locked'?'已成团':matchStatusText(derivedStatus);
  const viewerFinalAttendanceStatus=viewerAttendance?.finalstatus||viewerAttendance?.finalStatus||'';
  const statusMeta=buildMatchStatusHint({match:row,registrations:mappedRegistrations,attendanceRows,feeRecord});
  return {
    id:row.id,
    creatorUserId:row.creatoruserid||row.creatorUserId,
    title:row.title,
    matchType:row.matchtype||row.matchType,
    targetHeadcount,
    currentHeadcount:activeCount,
    startTime:row.starttime||row.startTime,
    endTime:row.endtime||row.endTime,
    venueName:row.venuename||row.venueName||'',
    venueAddress:row.venueaddress||row.venueAddress||'',
    venueLatitude:Number(row.venuelatitude||row.venueLatitude||0),
    venueLongitude:Number(row.venuelongitude||row.venueLongitude||0),
    ntrpMin:levelRange.min,
    ntrpMax:levelRange.max,
    ntrpRangeText:formatNtrpRangeText(levelRange.min,levelRange.max),
    levelMode:row.levelmode||row.levelMode||'preset',
    genderPreference:row.genderpreference||row.genderPreference||'不限',
    estimatedCourtFee,
    finalCourtFee:finalFee,
    status:derivedStatus,
    statusText,
    timelineStatusText:matchTimelineStatus(row),
    formationStatus,
    prepayDeadlineAt:row.prepaydeadlineat||row.prepayDeadlineAt||'',
    statusHintText:buildMatchStatusHint({match:row,registrations:active,viewerId,viewerJoined:Boolean(viewerRegistration)}),
    viewerJoined:!!viewerRegistration&&String(viewerRegistration.registrationstatus||viewerRegistration.registrationStatus)==='registered',
    viewerIsCreator:String(row.creatoruserid||row.creatorUserId)===String(viewerId),
    viewerRegistrationStatus:viewerRegistration?.registrationstatus||viewerRegistration?.registrationStatus||'',
    viewerFinalAttendanceStatus,
    creatorConfirmDeadlineAt:statusMeta.creatorConfirmDeadlineAt,
    needsOperatorTakeover:statusMeta.needsOperatorTakeover,
    attendanceLocked:statusMeta.attendanceLocked,
    statusHintText:statusMeta.statusHintText,
    aaDisplayText:buildPreviewAaText({matchType:row.matchtype||row.matchType,startTime:row.starttime||row.startTime,endTime:row.endtime||row.endTime,estimatedCourtFee:row.estimatedcourtfee||row.estimatedCourtFee,finalCourtFee:finalFee,activeCount,targetHeadcount:row.targetheadcount||row.targetHeadcount}),
    viewerFeeSplit,
    offlinePaymentText:viewerFeeSplit&&String(viewerFeeSplit.paystatus||viewerFeeSplit.payStatus)==='pending'?'请线下联系运营收款，付款后由管理端确认':'',
    canSelfCancel,
    registrations:active.map(reg=>({
      ...reg,
      userName:String(reg.nickname||reg.nickName||maskPhone(reg.phone)||reg.userid||reg.userId||'球友').trim(),
      ntrpText:formatNtrpValue(reg.ntrplevel||reg.ntrpLevel)||'未设水平',
      attendanceRateText:reg.attendanceratetext||reg.attendanceRateText||'暂无守约率',
      technicalRatingText:reg.technicalratingtext||reg.technicalRatingText||'',
      technicalRatingCount:Number(reg.technicalratingcount||reg.technicalRatingCount||0),
      finalAttendanceStatus:reg.finalattendancestatus||reg.finalAttendanceStatus||'pending'
    }))
  };
}
async function loadAttendanceRateMap(pool,userIds=[]){
  const uniqueUserIds=[...new Set((userIds||[]).map(id=>String(id||'').trim()).filter(Boolean))];
  if(!uniqueUserIds.length)return new Map();
  const statsRows=await pool.query(`
    SELECT
      userId,
      COUNT(*) FILTER (WHERE finalStatus IN ('attended','absent'))::int AS resolved_count,
      COUNT(*) FILTER (WHERE finalStatus='attended')::int AS attended_count
    FROM match_attendance
    WHERE userId = ANY($1::text[])
    GROUP BY userId
  `,[uniqueUserIds]);
  const rateMap=new Map();
  for(const row of statsRows.rows){
    const resolved=Number(row.resolved_count||0);
    const attended=Number(row.attended_count||0);
    rateMap.set(String(row.userid||row.userId),resolved>0?`${Math.round(attended*100/resolved)}%`:'暂无守约率');
  }
  return rateMap;
}
async function loadTechnicalRatingSummaryMap(pool,userIds=[]){
  const uniqueUserIds=[...new Set((userIds||[]).map(id=>String(id||'').trim()).filter(Boolean))];
  if(!uniqueUserIds.length)return new Map();
  const rows=await pool.query('SELECT ratedUserId,technicalLevel FROM match_player_ratings WHERE ratedUserId = ANY($1::text[])',[uniqueUserIds]);
  return buildMatchTechnicalRatingSummary(rows.rows);
}
async function loadMatchRegistrationViews(pool,matchIds=[],{registeredOnly=true}={}){
  const uniqueMatchIds=[...new Set((matchIds||[]).map(id=>String(id||'').trim()).filter(Boolean))];
  if(!uniqueMatchIds.length)return [];
  const statusClause=registeredOnly?"AND r.registrationStatus='registered'":'';
  const regRows=await pool.query(`
    SELECT
      r.*,
      u.nickName,
      u.phone,
      u.avatarUrl,
      u.ntrpLevel,
      a.finalStatus
    FROM match_registrations r
    LEFT JOIN match_users u ON u.id=r.userId
    LEFT JOIN match_attendance a ON a.matchId=r.matchId AND a.userId=r.userId
    WHERE r.matchId = ANY($1::text[])
    ${statusClause}
  `,[uniqueMatchIds]);
  const userIds=regRows.rows.map(row=>String(row.userid||row.userId||''));
  const [rateMap,ratingMap]=await Promise.all([
    loadAttendanceRateMap(pool,userIds),
    loadTechnicalRatingSummaryMap(pool,userIds)
  ]);
  return regRows.rows.map(row=>({
    ...row,
    attendanceRateText:rateMap.get(String(row.userid||row.userId||''))||'暂无守约率',
    ...(ratingMap.get(String(row.userid||row.userId||''))||{technicalRatingText:'',technicalRatingCount:0})
  }));
}
function toMatchDetailResponse(view){
  if(!view)return null;
  const registrations=Array.isArray(view.registrations)?view.registrations:[];
  const match={...view};
  delete match.registrations;
  return {...view,match,registrations};
}
function matchStatusText(status){
  return ({open:'招募中',full:'已满员',booked:'已订场',playing:'进行中',attendance_pending:'待确认到场',fee_pending:'待确认费用',settled:'已结清',cancelled:'已取消'})[status]||status;
}
function assertMatchBookingInput(input){
  const finalCourtFee=normalizeMoney(input.finalCourtFee);
  if(finalCourtFee<=0)throw new Error('请填写最终场地费');
  const bookingStatus=input.bookingStatus||'booked';
  if(!['booked','cancelled'].includes(bookingStatus))throw new Error('订场状态不正确');
  return {...input,finalCourtFee,bookingStatus};
}
function assertBookedWithdrawalInput(input={}){
  const financialResponsibility=String(input.financialResponsibility||'').trim();
  if(!['charge','waive','abnormal'].includes(financialResponsibility))throw new Error('退赛责任不正确');
  const reason=String(input.reason||input.withdrawalReason||'').trim();
  return {financialResponsibility,reason};
}
function assertMatchFeeSplitUpdateInput(input={}){
  const payStatus=String(input.payStatus||'paid').trim();
  if(!['pending','paid','waived','refunded','bad_debt','abnormal'].includes(payStatus))throw new Error('收款状态不正确');
  const note=String(input.note||'').trim();
  const amount=input.amount==null?null:normalizeMoney(input.amount);
  if(amount!=null&&amount<0)throw new Error('AA金额不能小于 0');
  if((['waived','refunded','bad_debt','abnormal'].includes(payStatus)||amount!=null)&&!note)throw new Error('请填写原因');
  const paidAmount=input.paidAmount==null?null:normalizeMoney(input.paidAmount);
  return {payStatus,paidAmount,amount,note};
}
function defaultMatchSettings(){
  return {
    operatorWechatId:String(process.env.MATCH_OPERATOR_WECHAT_ID||'').trim(),
    operatorPaymentQr:String(process.env.MATCH_OPERATOR_PAYMENT_QR||'').trim(),
    creatorConfirmDeadlineHours:MATCH_CREATOR_CONFIRM_DEADLINE_HOURS
  };
}
async function getMatchSettings(){
  await mkTable(T_MATCH_SETTINGS);
  const stored=await get(T_MATCH_SETTINGS,MATCH_SETTINGS_ROW_ID).catch(()=>null);
  return {...defaultMatchSettings(),...(stored||{})};
}
async function saveMatchSettings(input={},operatorId=''){
  const current=await getMatchSettings();
  const next={
    ...current,
    operatorWechatId:String(input.operatorWechatId??current.operatorWechatId??'').trim(),
    operatorPaymentQr:String(input.operatorPaymentQr??current.operatorPaymentQr??'').trim(),
    updatedAt:new Date().toISOString(),
    updatedBy:String(operatorId||'').trim()
  };
  await put(T_MATCH_SETTINGS,MATCH_SETTINGS_ROW_ID,next);
  return next;
}
function assertMatchReplacementTransferInput(input={}){
  const fromUserId=String(input.fromUserId||'').trim();
  if(!fromUserId)throw new Error('请选择原报名人');
  const replacementPhone=assertPhone(input.replacementPhone||input.phone||'');
  const replacementPayStatus=String(input.replacementPayStatus||'paid').trim();
  if(!['pending','paid'].includes(replacementPayStatus))throw new Error('替补付款状态不正确');
  const refundNote=String(input.refundNote||input.note||'').trim();
  if(!refundNote)throw new Error('请填写转让说明');
  return {
    fromUserId,
    replacementPhone,
    replacementPayStatus,
    refundNote,
    transferNote:String(input.transferNote||'').trim()
  };
}
function resolveFinalAttendanceStatus(row){
  if(row?.creatorStatus==='attended'||row?.creatorstatus==='attended')return 'attended';
  if(row?.creatorStatus==='absent'||row?.creatorstatus==='absent')return 'absent';
  return 'pending';
}
function buildMatchStatusHint({match={},registrations=[],viewerId='',viewerJoined=false}={}){
  const activeCount=activeMatchRegistrations(registrations).length;
  const formationStatus=String(match.formationstatus||match.formationStatus||'free_open');
  const timeline=matchTimelineStatus(match);
  if(timeline==='已结束'&&String(match.status||'')!=='settled')return '球局已结束，等待到场和费用确认';
  if(resolveEffectiveLevelRange(match,registrations).pending)return '未设水平时，以首位报名球友的真实水平定级';
  if(isFourPlayerGroupMatch(match)&&formationStatus==='group_ready')return '本局已成团，需在2小时内完成预付，全员付款成功约球生效';
  if(isFourPlayerGroupMatch(match)&&formationStatus==='group_locked')return '四人成团已锁定，如需退出请自行联系替补并由后台处理名额转让';
  if(isFourPlayerGroupMatch(match)&&activeCount<4)return '未满4人前仅占位报名，不收款，可自由取消';
  return '';
}
function buildGroupPrepayLedger({matchId,estimatedCourtFee=0,participantIds=[]}={}){
  const total=Math.round(normalizeMoney(estimatedCourtFee));
  if(total<=0)throw new Error('预付金额必须大于 0');
  const splits=splitAaFee(total,participantIds);
  return {
    record:{
      id:uuidv4(),
      matchId,
      estimatedCourtFee:total,
      finalCourtFee:total,
      participantCount:splits.length,
      aaAmount:Math.ceil(total/splits.length),
      roundingRule:'ceil',
      roundingDifference:total-splits.reduce((sum,row)=>sum+row.amount,0),
      status:'prepay_pending'
    },
    splits:splits.map(row=>({id:uuidv4(),matchId,userId:row.userId,amount:row.amount,payStatus:'pending',paidAmount:0}))
  };
}
function resolveMatchPrepayClosure({mode='cancelled',reason='',splits=[]}={}){
  const normalizedReason=String(reason||'').trim();
  const nextSplits=(splits||[]).map((row)=>{
    const paidAmount=normalizeMoney(row.paidamount??row.paidAmount??0);
    const nextStatus=paidAmount>0||String(row.paystatus||row.payStatus||'')==='paid'?'refunded':'cancelled';
    const baseNote=String(row.note||'').trim();
    return {
      ...row,
      payStatus:nextStatus,
      paidAmount,
      note:[baseNote,normalizedReason].filter(Boolean).join('；')
    };
  });
  const refunded=nextSplits.some((row)=>row.payStatus==='refunded');
  const recordStatus=mode==='downgraded'
    ? (refunded?'prepay_downgraded_refunded':'prepay_downgraded')
    : (refunded?'prepay_cancelled_refunded':'prepay_cancelled');
  return {recordStatus,splits:nextSplits};
}
async function closeMatchPrepayLedger(client,matchId,{mode='cancelled',reason=''}={}){
  const feeRecordRes=await client.query('SELECT * FROM match_fee_records WHERE matchId=$1 FOR UPDATE',[matchId]);
  const feeRecord=feeRecordRes.rows[0]||null;
  if(!feeRecord)return {changed:false,recordStatus:'',splits:[]};
  if(!/^prepay_/.test(String(feeRecord.status||'')))return {changed:false,recordStatus:String(feeRecord.status||''),splits:[]};
  const splitRes=await client.query('SELECT * FROM match_fee_splits WHERE matchId=$1 FOR UPDATE',[matchId]);
  const closure=resolveMatchPrepayClosure({mode,reason,splits:splitRes.rows});
  for(const row of closure.splits){
    await client.query(
      'UPDATE match_fee_splits SET payStatus=$1,paidAmount=$2,paidAt=$3,note=$4,updatedAt=NOW() WHERE id=$5',
      [row.payStatus,row.paidAmount,row.payStatus==='refunded'?(row.paidat||row.paidAt||new Date()):null,row.note||'',row.id]
    );
  }
  await client.query('UPDATE match_fee_records SET status=$1,updatedAt=NOW() WHERE matchId=$2',[closure.recordStatus,matchId]);
  return {...closure,changed:true};
}
async function syncMatchFeeRecordState(client,matchId,{isPrepay=false}={}){
  const activeSplitsRes=await client.query("SELECT payStatus FROM match_fee_splits WHERE matchId=$1 AND payStatus NOT IN ('cancelled','refunded')",[matchId]);
  const settled=activeSplitsRes.rows.length>0&&activeSplitsRes.rows.every(row=>['paid','waived'].includes(row.paystatus||row.payStatus));
  if(isPrepay){
    const status=settled?'prepay_paid':'prepay_pending';
    await client.query('UPDATE match_fee_records SET status=$1,updatedAt=NOW() WHERE matchId=$2',[status,matchId]);
    await client.query("UPDATE match_posts SET formationStatus=$2,updatedAt=NOW() WHERE id=$1",[matchId,settled?'group_locked':'group_ready']);
    return {settled,status};
  }
  const status=settled?'settled':'confirmed';
  await client.query('UPDATE match_fee_records SET status=$1,updatedAt=NOW() WHERE matchId=$2',[status,matchId]);
  if(settled)await client.query("UPDATE match_posts SET status='settled',updatedAt=NOW() WHERE id=$1",[matchId]);
  return {settled,status};
}
function buildMatchFeeLedger({matchId,estimatedCourtFee=0,finalCourtFee,matchType,startTime,endTime,participants=[]}={}){
  const billable=(participants||[]).filter(row=>row.finalStatus==='attended'||row.finalstatus==='attended'||row.chargeAbsent===true);
  const settlementTotal=computeMatchSettlementAmount({matchType,startTime,endTime,finalCourtFee,participantCount:billable.length});
  const splits=splitAaFee(settlementTotal,billable.map(row=>row.userId||row.userid));
  const distributedTotal=splits.reduce((sum,row)=>sum+row.amount,0);
  const aaAmount=Math.ceil(normalizeMoney(settlementTotal)/splits.length);
  return {
    record:{
      id:uuidv4(),
      matchId,
      estimatedCourtFee:normalizeMoney(estimatedCourtFee),
      finalCourtFee:Math.round(normalizeMoney(settlementTotal)),
      participantCount:splits.length,
      aaAmount,
      roundingRule:'ceil',
      roundingDifference:Math.round(normalizeMoney(settlementTotal))-distributedTotal,
      status:'pending'
    },
    splits:splits.map(row=>({id:uuidv4(),matchId,userId:row.userId,amount:row.amount,payStatus:'pending',paidAmount:0}))
  };
}
async function listMatchesForViewer(viewerId){
  const pool=getMatchSqlPool();
  const matches=await pool.query("SELECT * FROM match_posts WHERE status<>'cancelled' ORDER BY startTime ASC");
  const registrations=await loadMatchRegistrationViews(pool,matches.rows.map(row=>String(row.id||'')),{registeredOnly:true});
  const regsByMatch=new Map();
  for(const row of registrations){
    const key=String(row.matchid||row.matchId);
    regsByMatch.set(key,[...(regsByMatch.get(key)||[]),row]);
  }
  return matches.rows.map(row=>toMatchView(row,regsByMatch.get(String(row.id))||[],viewerId));
}
async function getMatchForViewer(matchId,viewerId){
  const pool=getMatchSqlPool();
  const match=await pool.query('SELECT * FROM match_posts WHERE id=$1',[matchId]);
  if(!match.rows[0])return null;
  const [regs,splits,attendance,feeRecord,ratings]=await Promise.all([
    loadMatchRegistrationViews(pool,[matchId],{registeredOnly:false}),
    pool.query('SELECT * FROM match_fee_splits WHERE matchId=$1',[matchId]),
    pool.query('SELECT * FROM match_attendance WHERE matchId=$1',[matchId]),
    pool.query('SELECT * FROM match_fee_records WHERE matchId=$1 LIMIT 1',[matchId]),
    pool.query('SELECT * FROM match_player_ratings WHERE matchId=$1',[matchId])
  ]);
  const viewerAttendance=attendance.rows.find(row=>String(row.userid||row.userId)===String(viewerId))||null;
  const view=toMatchView(match.rows[0],regs,viewerId,splits.rows,viewerAttendance,attendance.rows,feeRecord.rows[0]||null);
  const viewerRatings=new Map(ratings.rows.filter(row=>String(row.rateruserid||row.raterUserId)===String(viewerId)).map(row=>[String(row.rateduserid||row.ratedUserId),String(row.technicallevel||row.technicalLevel||'')]));
  const attendedUserIds=new Set(attendance.rows.filter(row=>String(row.finalstatus||row.finalStatus)==='attended').map(row=>String(row.userid||row.userId)));
  const ended=dateMs(match.rows[0].endtime||match.rows[0].endTime)<=Date.now();
  view.registrations=(view.registrations||[]).map(row=>{
    const userId=String(row.userId||row.userid||'');
    return {
      ...row,
      viewerTechnicalLevel:viewerRatings.get(userId)||'',
      canRateTechnical:ended&&attendedUserIds.has(String(viewerId))&&attendedUserIds.has(userId)&&userId!==String(viewerId)
    };
  });
  return view;
}
async function createMatchForUser(userId,input){
  if(!(await canMatchUserCreate(userId)))throw new Error('请先授权手机号');
  const row=assertMatchPostInput(input);
  const id=uuidv4();
  await getMatchSqlPool().query(
    'INSERT INTO match_posts(id,creatorUserId,title,matchType,targetHeadcount,startTime,endTime,venueName,venueAddress,venueLatitude,venueLongitude,ntrpMin,ntrpMax,levelMode,genderPreference,estimatedCourtFee,status,formationStatus,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW())',
    [id,userId,row.title,row.matchType,row.targetHeadcount,row.startTime,row.endTime,row.venueName||'',row.venueAddress||'',row.venueLatitude||null,row.venueLongitude||null,row.ntrpMin,row.ntrpMax,row.levelMode,row.genderPreference,row.estimatedCourtFee,'open','free_open']
  );
  const created=await getMatchForViewer(id,userId);
  await sendOfficialAccountMatchAdminNotification({match:created}).catch(err=>console.warn('[match-admin-notify] failed',String(err?.message||err)));
  return created;
}
async function updateMatchForUser(matchId,userId,input){
  const row=assertMatchPostInput(input);
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    if(String(match.creatoruserid||match.creatorUserId)!==String(userId))throw new Error('只有发起者可编辑');
    if(dateMs(match.starttime||match.startTime)<=Date.now())throw new Error('已开始，不能编辑');
    const regs=await client.query("SELECT COUNT(*)::int AS count FROM match_registrations WHERE matchId=$1 AND registrationStatus='registered'",[matchId]);
    await client.query(
      'UPDATE match_posts SET title=$1,matchType=$2,targetHeadcount=$3,startTime=$4,endTime=$5,venueName=$6,venueAddress=$7,venueLatitude=$8,venueLongitude=$9,ntrpMin=$10,ntrpMax=$11,levelMode=$12,genderPreference=$13,estimatedCourtFee=$14,updatedAt=NOW() WHERE id=$15',
      [row.title,row.matchType,row.targetHeadcount,row.startTime,row.endTime,row.venueName||'',row.venueAddress||'',row.venueLatitude||null,row.venueLongitude||null,row.ntrpMin,row.ntrpMax,row.levelMode,row.genderPreference,row.estimatedCourtFee,matchId]
    );
    if((regs.rows[0]?.count||0)>0){
      await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'match_user',userId,'match_update',JSON.stringify(match),JSON.stringify(row)]);
    }
    return {success:true};
  });
}
async function closeMatchFeeLedger(client,matchId,note,{feeRecord=null,onlyPrepay=false,mode='cancelled'}={}){
  const lockedFeeRecord=feeRecord||((await client.query('SELECT * FROM match_fee_records WHERE matchId=$1 FOR UPDATE',[matchId])).rows[0]||null);
  if(!lockedFeeRecord)return {feeRecord:null,isPrepay:false,updatedSplits:[]};
  const isPrepay=/^prepay_/.test(String(lockedFeeRecord.status||''));
  if(onlyPrepay&&!isPrepay)return {feeRecord:lockedFeeRecord,isPrepay,updatedSplits:[]};
  const splitRows=(await client.query('SELECT * FROM match_fee_splits WHERE matchId=$1 FOR UPDATE',[matchId])).rows;
  if(isPrepay){
    const closure=resolveMatchPrepayClosure({mode,reason:note,splits:splitRows});
    for(const split of closure.splits){
      await client.query(
        'UPDATE match_fee_splits SET payStatus=$1,paidAmount=$2,paidAt=$3,note=$4,updatedAt=NOW() WHERE id=$5',
        [split.payStatus,split.paidAmount,split.payStatus==='refunded'?(split.paidat||split.paidAt||new Date()):null,split.note||'',String(split.id||'')]
      );
    }
    await client.query('UPDATE match_fee_records SET status=$1,updatedAt=NOW() WHERE id=$2',[closure.recordStatus,String(lockedFeeRecord.id||'')]);
    return {feeRecord:lockedFeeRecord,isPrepay,updatedSplits:closure.splits};
  }
  const updatedSplits=[];
  for(const split of splitRows){
    const currentStatus=String(split.paystatus||split.payStatus||'').trim();
    if(['cancelled','refunded'].includes(currentStatus))continue;
    const paidAmount=normalizeMoney(split.paidamount||split.paidAmount);
    const nextStatus=paidAmount>0?'refunded':'cancelled';
    const nextPaidAmount=nextStatus==='refunded'?paidAmount:0;
    await client.query(
      'UPDATE match_fee_splits SET payStatus=$1,paidAmount=$2,paidAt=$3,note=$4,updatedAt=NOW() WHERE id=$5',
      [nextStatus,nextPaidAmount,nextStatus==='refunded'?new Date():null,note,String(split.id||'')]
    );
    updatedSplits.push({...split,payStatus:nextStatus,paidAmount:nextPaidAmount});
  }
  const nextRecordStatus=updatedSplits.some(row=>String(row.payStatus||'')==='refunded')?'refunded':'cancelled';
  await client.query('UPDATE match_fee_records SET status=$1,updatedAt=NOW() WHERE id=$2',[nextRecordStatus,String(lockedFeeRecord.id||'')]);
  return {feeRecord:lockedFeeRecord,isPrepay,updatedSplits};
}
async function cancelMatchForUser(matchId,userId,reason='',options={}){
  const requireCreator=options.requireCreator!==false;
  const operatorType=options.operatorType||'match_user';
  const defaultReason=options.defaultReason||'发起者取消';
  const cancellationReason=String(reason||defaultReason).trim()||defaultReason;
  const financeSync={refundUserIds:[]};
  const result=await withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    if(requireCreator&&String(match.creatoruserid||match.creatorUserId)!==String(userId))throw new Error('只有发起者可取消');
    const status=deriveMatchStatus(match);
    if(!['open','full','booked'].includes(status))throw new Error('当前状态不能取消');
    if(dateMs(match.starttime||match.startTime)<=Date.now())throw new Error('已开始，不能取消');
    let feeClosure=null;
    if(status==='booked'){
      await client.query(
        "UPDATE match_registrations SET registrationStatus='cancelled',cancelledAt=NOW(),financialResponsibility='waive',withdrawalReason=$1,withdrawalHandledBy=$2,withdrawalHandledAt=NOW() WHERE matchId=$3 AND registrationStatus='registered'",
        [cancellationReason,userId,matchId]
      );
      feeClosure=await closeMatchFeeLedger(client,matchId,cancellationReason,{mode:'cancelled'});
      if(feeClosure&&!feeClosure.isPrepay){
        financeSync.refundUserIds=feeClosure.updatedSplits
          .filter(row=>String(row.payStatus||'')==='refunded')
          .map(row=>String(row.userid||row.userId||''))
          .filter(Boolean);
      }
    }
    await client.query("UPDATE match_posts SET status='cancelled',formationStatus='free_open',cancelReason=$1,prepayTriggeredAt=NULL,prepayDeadlineAt=NULL,updatedAt=NOW() WHERE id=$2",[cancellationReason,matchId]);
    await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,operatorType,userId,status==='booked'?'match_cancel_booked':'match_cancel',JSON.stringify(match),JSON.stringify({reason:cancellationReason,closedFeeSplits:feeClosure?.updatedSplits?.length||0})]);
    return {success:true,status:'cancelled',closedFeeSplits:feeClosure?.updatedSplits?.length||0};
  });
  for(const refundUserId of financeSync.refundUserIds){
    await syncMatchFeeSplitRefundToCourtFinance(matchId,refundUserId,userId,cancellationReason).catch(()=>null);
  }
  notifyMatchUsers(matchId,'match_update').catch(()=>null);
  return result;
}
async function adminCancelMatch(matchId,operatorId,reason=''){
  return cancelMatchForUser(matchId,operatorId,reason,{requireCreator:false,operatorType:'admin_user',defaultReason:'运营下架'});
}
async function cancelRegistrationForUser(matchId,userId){
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const status=deriveMatchStatus(match);
    const formationStatus=String(match.formationstatus||match.formationStatus||'free_open');
    if(status==='booked')throw new Error('已订场，请联系运营处理');
    if(formationStatus==='group_locked')throw new Error('四人成团并付款后不能自主退局，请先联系替补');
    if(!['open','full'].includes(status))throw new Error('当前状态不能取消报名');
    if(dateMs(match.starttime||match.startTime)<=Date.now())throw new Error('已开始，不能取消报名');
    const result=await client.query("UPDATE match_registrations SET registrationStatus='cancelled',cancelledAt=NOW() WHERE matchId=$1 AND userId=$2 AND registrationStatus='registered' RETURNING id",[matchId,userId]);
    if(result.rowCount<=0)throw new Error('未报名');
    const countRes=await client.query("SELECT COUNT(*)::int AS count FROM match_registrations WHERE matchId=$1 AND registrationStatus='registered'",[matchId]);
    const nextCount=countRes.rows[0]?.count||0;
    const nextStatus=nextCount>=Number(match.targetheadcount||match.targetHeadcount)?'full':'open';
    if(isFourPlayerGroupMatch(match)&&nextCount<4){
      const feeClosure=await closeMatchFeeLedger(client,matchId,'四人局人数不足，已降级为自由局',{onlyPrepay:true,mode:'downgraded'});
      await client.query('UPDATE match_posts SET status=$1,formationStatus=$2,prepayTriggeredAt=NULL,prepayDeadlineAt=NULL,updatedAt=NOW() WHERE id=$3',[nextStatus,'free_open',matchId]);
      await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'match_user',userId,'formation_downgrade',JSON.stringify(match),JSON.stringify({reason:'四人局人数不足，已降级为自由局',closedFeeSplits:feeClosure.updatedSplits.length})]);
      return {success:true,currentHeadcount:nextCount,status:nextStatus,formationStatus:'free_open'};
    }
    await client.query('UPDATE match_posts SET status=$1,updatedAt=NOW() WHERE id=$2',[nextStatus,matchId]);
    return {success:true,currentHeadcount:nextCount,status:nextStatus,formationStatus};
  });
}
async function listAdminMatches(){
  const pool=getMatchSqlPool();
  const [matches,registrations,bookings,fees,splits,logs,attendance]=await Promise.all([
    pool.query('SELECT * FROM match_posts ORDER BY startTime DESC'),
    pool.query('SELECT r.*,u.nickName,u.phone FROM match_registrations r LEFT JOIN match_users u ON u.id=r.userId'),
    pool.query('SELECT * FROM match_bookings ORDER BY createdAt DESC'),
    pool.query('SELECT * FROM match_fee_records ORDER BY createdAt DESC'),
    pool.query('SELECT s.*,u.nickName,u.phone FROM match_fee_splits s LEFT JOIN match_users u ON u.id=s.userId ORDER BY s.createdAt ASC'),
    pool.query('SELECT * FROM match_operation_logs ORDER BY createdAt DESC'),
    pool.query('SELECT * FROM match_attendance')
  ]);
  const regsByMatch=new Map();
  for(const row of registrations.rows){
    const key=String(row.matchid||row.matchId);
    regsByMatch.set(key,[...(regsByMatch.get(key)||[]),row]);
  }
  const bookingByMatch=new Map(bookings.rows.map(row=>[String(row.matchid||row.matchId),row]));
  const feeByMatch=new Map(fees.rows.map(row=>[String(row.matchid||row.matchId),row]));
  const feeSplitsByMatch=new Map();
  for(const row of splits.rows){
    const key=String(row.matchid||row.matchId);
    feeSplitsByMatch.set(key,[...(feeSplitsByMatch.get(key)||[]),row]);
  }
  const logsByMatch=new Map();
  for(const row of logs.rows){
    const key=String(row.matchid||row.matchId);
    logsByMatch.set(key,[...(logsByMatch.get(key)||[]),row]);
  }
  const attendanceByMatch=new Map();
  for(const row of attendance.rows){
    const key=String(row.matchid||row.matchId);
    attendanceByMatch.set(key,[...(attendanceByMatch.get(key)||[]),row]);
  }
  return matches.rows.map(row=>({...toMatchView(row,regsByMatch.get(String(row.id))||[], '', feeSplitsByMatch.get(String(row.id))||[], null, attendanceByMatch.get(String(row.id))||[], feeByMatch.get(String(row.id))||null),booking:bookingByMatch.get(String(row.id))||null,feeRecord:feeByMatch.get(String(row.id))||null,feeSplits:feeSplitsByMatch.get(String(row.id))||[],operationLogs:logsByMatch.get(String(row.id))||[]}));
}
async function adminBookMatch(matchId,operatorId,input){
  const booking=assertMatchBookingInput(input);
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const id=uuidv4();
    await client.query(
      'INSERT INTO match_bookings(id,matchId,operatorUserId,venueNameFinal,venueAddressFinal,venueLatitudeFinal,venueLongitudeFinal,courtNo,bookingStartTime,bookingEndTime,finalCourtFee,bookingStatus,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())',
      [id,matchId,operatorId,booking.venueNameFinal||'',booking.venueAddressFinal||'',booking.venueLatitudeFinal||null,booking.venueLongitudeFinal||null,booking.courtNo||'',booking.bookingStartTime||match.starttime||match.startTime,booking.bookingEndTime||match.endtime||match.endTime,booking.finalCourtFee,booking.bookingStatus]
    );
    const nextStatus=booking.bookingStatus==='booked'?'booked':'cancelled';
    await client.query('UPDATE match_posts SET status=$1,finalCourtFee=$2,updatedAt=NOW() WHERE id=$3',[nextStatus,booking.finalCourtFee,matchId]);
    await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'admin_user',operatorId,'booking',JSON.stringify(match),JSON.stringify(booking)]);
    notifyMatchUsers(matchId,'booking').catch(()=>null);
    return {success:true,matchId,status:nextStatus,bookingId:id,finalCourtFee:booking.finalCourtFee};
  });
}
async function confirmMatchAttendance(matchId,operatorId,items=[]){
  if(!Array.isArray(items)||items.length===0)throw new Error('请提交到场名单');
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const feeRecordRes=await client.query('SELECT id FROM match_fee_records WHERE matchId=$1 LIMIT 1',[matchId]);
    if(feeRecordRes.rowCount>0)throw new Error('已生成AA，不能再修改到场名单');
    for(const item of items){
      const userId=String(item.userId||'').trim();
      if(!userId)continue;
      const creatorStatus=item.finalStatus||item.creatorStatus;
      if(!['attended','absent'].includes(creatorStatus))throw new Error('到场状态不正确');
      const finalStatus=resolveFinalAttendanceStatus({creatorStatus});
      await client.query(
        "INSERT INTO match_attendance(id,matchId,userId,selfStatus,creatorStatus,finalStatus,updatedAt) VALUES($1,$2,$3,'pending',$4,$5,NOW()) ON CONFLICT(matchId,userId) DO UPDATE SET creatorStatus=EXCLUDED.creatorStatus,finalStatus=EXCLUDED.finalStatus,updatedAt=NOW()",
        [uuidv4(),matchId,userId,creatorStatus,finalStatus]
      );
    }
    await client.query("UPDATE match_posts SET status='fee_pending',updatedAt=NOW() WHERE id=$1",[matchId]);
    await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'admin_user',operatorId,'attendance_takeover',JSON.stringify(match),JSON.stringify({label:'运营接管',items})]);
    return {success:true,status:'fee_pending'};
  });
}
async function adminHandleBookedWithdrawal(matchId,userId,operatorId,input={}){
  const withdrawal=assertBookedWithdrawalInput(input);
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const status=deriveMatchStatus(match);
    if(status!=='booked')throw new Error('只有已订场球局需要后台处理退赛');
    const regRes=await client.query("SELECT * FROM match_registrations WHERE matchId=$1 AND userId=$2 AND registrationStatus='registered' FOR UPDATE",[matchId,userId]);
    const reg=regRes.rows[0];
    if(!reg)throw new Error('报名记录不存在');
    await client.query(
      "UPDATE match_registrations SET registrationStatus='cancelled',cancelledAt=NOW(),financialResponsibility=$1,withdrawalReason=$2,withdrawalHandledBy=$3,withdrawalHandledAt=NOW() WHERE matchId=$4 AND userId=$5 AND registrationStatus='registered'",
      [withdrawal.financialResponsibility,withdrawal.reason,operatorId,matchId,userId]
    );
    await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'admin_user',operatorId,'booked_withdrawal',JSON.stringify(reg),JSON.stringify(withdrawal)]);
    return {success:true,financialResponsibility:withdrawal.financialResponsibility};
  });
}
async function adminTransferMatchReplacement(matchId,operatorId,input={}){
  const transfer=assertMatchReplacementTransferInput(input);
  const financeSync={refund:null,paid:null};
  const result=await withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    if(!isFourPlayerGroupMatch(match))throw new Error('当前仅支持四人局替补转让');
    const formationStatus=String(match.formationstatus||match.formationStatus||'free_open');
    if(!['group_ready','group_locked'].includes(formationStatus))throw new Error('当前状态无需替补转让');
    const [fromRegRes,replacementUserRes]=await Promise.all([
      client.query("SELECT r.*,u.nickName,u.phone FROM match_registrations r LEFT JOIN match_users u ON u.id=r.userId WHERE r.matchId=$1 AND r.userId=$2 AND r.registrationStatus='registered' FOR UPDATE",[matchId,transfer.fromUserId]),
      client.query('SELECT * FROM match_users WHERE phone=$1 ORDER BY updatedAt DESC LIMIT 1',[transfer.replacementPhone])
    ]);
    const fromReg=fromRegRes.rows[0];
    if(!fromReg)throw new Error('原报名记录不存在');
    const replacementUser=replacementUserRes.rows[0];
    if(!replacementUser)throw new Error('替补用户不存在，请先让对方登录小程序并完成手机号授权');
    const replacementUserId=String(replacementUser.id||'');
    if(replacementUserId===String(transfer.fromUserId))throw new Error('替补用户不能和原报名人相同');
    const replacementDupRes=await client.query("SELECT id FROM match_registrations WHERE matchId=$1 AND userId=$2 AND registrationStatus='registered' LIMIT 1",[matchId,replacementUserId]);
    if(replacementDupRes.rowCount>0)throw new Error('替补用户已经在本局报名名单里');
    const replacementLevel=Number(replacementUser.ntrplevel||replacementUser.ntrpLevel||0);
    const matchMinLevel=Number(match.ntrpmin||match.ntrpMin||0);
    if(!isValidNtrp(replacementLevel))throw new Error('替补用户还没有设置真实水平');
    if(isValidNtrp(matchMinLevel)&&replacementLevel<matchMinLevel)throw new Error(`本局最低水平为 ${matchMinLevel.toFixed(1)}，替补不符合要求`);
    const feeRecordRes=await client.query('SELECT * FROM match_fee_records WHERE matchId=$1 FOR UPDATE',[matchId]);
    const feeRecord=feeRecordRes.rows[0]||null;
    const isPrepay=/^prepay_/.test(String(feeRecord?.status||''));
    let previousSplit=null;
    if(feeRecord){
      const splitRes=await client.query('SELECT * FROM match_fee_splits WHERE matchId=$1 AND userId=$2 FOR UPDATE',[matchId,transfer.fromUserId]);
      previousSplit=splitRes.rows[0]||null;
      if(!previousSplit)throw new Error('原报名人的账单不存在');
    }

    const replacementRegistrationId=uuidv4();
    await client.query(
      "UPDATE match_registrations SET registrationStatus='cancelled',cancelledAt=NOW(),financialResponsibility='transferred',withdrawalReason=$1,withdrawalHandledBy=$2,withdrawalHandledAt=NOW() WHERE id=$3",
      [transfer.refundNote,operatorId,fromReg.id]
    );
    await client.query(
      "INSERT INTO match_registrations(id,matchId,userId,registrationStatus,createdAt,financialResponsibility,withdrawalReason) VALUES($1,$2,$3,'registered',NOW(),$4,$5)",
      [replacementRegistrationId,matchId,replacementUserId,'replacement',transfer.transferNote||'']
    );
    await client.query('DELETE FROM match_attendance WHERE matchId=$1 AND userId=$2',[matchId,replacementUserId]);

    let replacementSplitId='';
    let originalSplitStatus='';
    if(previousSplit){
      const amount=normalizeMoney(previousSplit.amount);
      const previousPaidAmount=normalizeMoney(previousSplit.paidamount||previousSplit.paidAmount);
      originalSplitStatus=previousPaidAmount>0?'refunded':'cancelled';
      await client.query(
        'UPDATE match_fee_splits SET payStatus=$1,paidAmount=$2,paidAt=$3,note=$4,updatedAt=NOW() WHERE matchId=$5 AND userId=$6',
        [originalSplitStatus,previousPaidAmount,originalSplitStatus==='refunded'?new Date():null,transfer.refundNote,matchId,transfer.fromUserId]
      );
      replacementSplitId=uuidv4();
      const replacementPaidAmount=transfer.replacementPayStatus==='paid'?amount:0;
      await client.query(
        'INSERT INTO match_fee_splits(id,matchId,userId,amount,payStatus,paidAmount,paidAt,note,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())',
        [replacementSplitId,matchId,replacementUserId,amount,transfer.replacementPayStatus,replacementPaidAmount,transfer.replacementPayStatus==='paid'?new Date():null,transfer.transferNote||transfer.refundNote]
      );
      if(feeRecord){
        const nextFeeState=await syncMatchFeeRecordState(client,matchId,{isPrepay});
        if(isPrepay&&nextFeeState.status==='prepay_pending'){
          await client.query("UPDATE match_posts SET status='full',updatedAt=NOW() WHERE id=$1",[matchId]);
        }
      }
      financeSync.refund=!isPrepay&&originalSplitStatus==='refunded'?{needed:true}:null;
      financeSync.paid=!isPrepay&&transfer.replacementPayStatus==='paid'?{needed:true,userId:replacementUserId}:null;
    }

    const replacementRowId=uuidv4();
    await client.query(
      'INSERT INTO match_replacements(id,matchId,fromUserId,toUserId,operatorUserId,originalSplitAmount,originalSplitRefundedAmount,replacementSplitAmount,replacementPayStatus,reason,note,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())',
      [
        replacementRowId,
        matchId,
        transfer.fromUserId,
        replacementUserId,
        operatorId,
        normalizeMoney(previousSplit?.amount||0),
        normalizeMoney(previousSplit?.paidamount||previousSplit?.paidAmount||0),
        normalizeMoney(previousSplit?.amount||0),
        transfer.replacementPayStatus,
        transfer.refundNote,
        transfer.transferNote||''
      ]
    );
    await client.query(
      'INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',
      [
        uuidv4(),
        matchId,
        'admin_user',
        operatorId,
        'replacement_transfer',
        JSON.stringify({fromUserId:transfer.fromUserId,fromPhone:fromReg.phone||'',fromNickName:fromReg.nickname||fromReg.nickName||''}),
        JSON.stringify({toUserId:replacementUserId,toPhone:replacementUser.phone||'',toNickName:replacementUser.nickname||replacementUser.nickName||'',replacementPayStatus:transfer.replacementPayStatus,reason:transfer.refundNote,note:transfer.transferNote||''})
      ]
    );
    return {
      success:true,
      fromUserId:transfer.fromUserId,
      toUserId:replacementUserId,
      replacementPayStatus:transfer.replacementPayStatus,
      replacementNickName:replacementUser.nickname||replacementUser.nickName||maskPhone(replacementUser.phone)||replacementUserId,
      message:transfer.replacementPayStatus==='paid'?'替补已入局并完成付款':'替补名额已转让，等待替补付款'
    };
  });
  if(financeSync.refund?.needed)result.refundSync=await syncMatchFeeSplitRefundToCourtFinance(matchId,transfer.fromUserId,operatorId,transfer.refundNote);
  if(financeSync.paid?.needed)result.paidSync=await syncMatchFeeSplitToCourtFinance(matchId,financeSync.paid.userId,operatorId);
  notifyMatchUsers(matchId,'match_update').catch(()=>null);
  return result;
}
async function selfConfirmMatchAttendance(matchId,userId){
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const status=deriveMatchStatus(match);
    if(!['booked','playing','attendance_pending'].includes(status))throw new Error('当前还不能确认到场');
    if(dateMs(match.starttime||match.startTime)>Date.now())throw new Error('未到开始时间');
    const reg=await client.query("SELECT id FROM match_registrations WHERE matchId=$1 AND userId=$2 AND registrationStatus='registered'",[matchId,userId]);
    if(reg.rowCount<=0)throw new Error('未报名，不能确认到场');
    await client.query(
      "INSERT INTO match_attendance(id,matchId,userId,selfStatus,creatorStatus,finalStatus,updatedAt) VALUES($1,$2,$3,'attended','pending','pending',NOW()) ON CONFLICT(matchId,userId) DO UPDATE SET selfStatus='attended',updatedAt=NOW()",
      [uuidv4(),matchId,userId]
    );
    return {success:true,selfStatus:'attended'};
  });
}
async function creatorConfirmMatchAttendance(matchId,creatorUserId,registrationId,finalStatus){
  if(!['attended','absent'].includes(finalStatus))throw new Error('到场状态不正确');
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    if(String(match.creatoruserid||match.creatorUserId)!==String(creatorUserId))throw new Error('只有发起者可确认');
    const status=deriveMatchStatus(match);
    if(!['booked','playing','attendance_pending','fee_pending'].includes(status))throw new Error('当前还不能确认到场');
    if(dateMs(match.starttime||match.startTime)>Date.now())throw new Error('未到开始时间');
    if(Number.isFinite(creatorAttendanceDeadline(match))&&Date.now()>creatorAttendanceDeadline(match))throw new Error('已超过发起者确认时限，请联系运营处理');
    const feeRecordRes=await client.query('SELECT id FROM match_fee_records WHERE matchId=$1 LIMIT 1',[matchId]);
    if(feeRecordRes.rowCount>0||['fee_pending','settled'].includes(String(match.status||'')))throw new Error('已生成AA，不能再修改到场名单');
    const reg=await client.query('SELECT * FROM match_registrations WHERE id=$1 AND matchId=$2',[registrationId,matchId]);
    const row=reg.rows[0];
    if(!row)throw new Error('报名记录不存在');
    if(String(row.registrationstatus||row.registrationStatus)!=='registered')throw new Error('仅可确认有效报名用户');
    await client.query(
      "INSERT INTO match_attendance(id,matchId,userId,selfStatus,creatorStatus,finalStatus,updatedAt) VALUES($1,$2,$3,'pending',$4,$4,NOW()) ON CONFLICT(matchId,userId) DO UPDATE SET creatorStatus=$4,finalStatus=$4,updatedAt=NOW()",
      [uuidv4(),matchId,row.userid||row.userId,finalStatus]
    );
    return {success:true,finalStatus};
  });
}
async function generateMatchFeeLedger(matchId,operatorId,{chargeAbsentUserIds=[]}={}){
  const chargeAbsentSet=new Set((chargeAbsentUserIds||[]).map(String));
  const result=await withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    const bookingRes=await client.query("SELECT * FROM match_bookings WHERE matchId=$1 AND bookingStatus='booked' ORDER BY createdAt DESC LIMIT 1",[matchId]);
    const finalCourtFee=bookingRes.rows[0]?.finalcourtfee||bookingRes.rows[0]?.finalCourtFee||match.finalcourtfee||match.finalCourtFee;
    const attendanceRes=await client.query('SELECT * FROM match_attendance WHERE matchId=$1',[matchId]);
    const activeRegsRes=await client.query("SELECT userId FROM match_registrations WHERE matchId=$1 AND registrationStatus='registered'",[matchId]);
    const confirmedAttendanceUserIds=new Set(
      attendanceRes.rows
        .filter(row=>['attended','absent'].includes(row.finalstatus||row.finalStatus))
        .map(row=>String(row.userid||row.userId))
    );
    const unconfirmedUsers=activeRegsRes.rows.filter(row=>!confirmedAttendanceUserIds.has(String(row.userid||row.userId)));
    if(unconfirmedUsers.length)throw new Error('请先完成全部到场确认，再生成AA');
    const chargeWithdrawalRes=await client.query("SELECT userId FROM match_registrations WHERE matchId=$1 AND registrationStatus='cancelled' AND financialResponsibility='charge'",[matchId]);
    const existingSplitsRes=await client.query('SELECT * FROM match_fee_splits WHERE matchId=$1',[matchId]);
    const existingPaidByUser=new Map(existingSplitsRes.rows.map(row=>[String(row.userid||row.userId),normalizeMoney(row.paidamount||row.paidAmount)]));
    const ledger=buildMatchFeeLedger({
      matchId,
      estimatedCourtFee:match.estimatedcourtfee||match.estimatedCourtFee,
      finalCourtFee,
      matchType:match.matchtype||match.matchType,
      startTime:match.starttime||match.startTime,
      endTime:match.endtime||match.endTime,
      participants:[
        ...attendanceRes.rows.map(row=>({...row,chargeAbsent:chargeAbsentSet.has(String(row.userid||row.userId))})),
        ...chargeWithdrawalRes.rows.map(row=>({userId:row.userid||row.userId,finalStatus:'absent',chargeAbsent:true}))
      ]
    });
    ledger.splits=ledger.splits.map(split=>{
      const paidAmount=existingPaidByUser.get(String(split.userId))||0;
      return {...split,paidAmount,payStatus:paidAmount>=split.amount?'paid':'pending'};
    });
    await client.query('DELETE FROM match_fee_splits WHERE matchId=$1',[matchId]);
    await client.query('DELETE FROM match_fee_records WHERE matchId=$1',[matchId]);
    await client.query(
      'INSERT INTO match_fee_records(id,matchId,estimatedCourtFee,finalCourtFee,participantCount,aaAmount,roundingRule,roundingDifference,status,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())',
      [ledger.record.id,matchId,ledger.record.estimatedCourtFee,ledger.record.finalCourtFee,ledger.record.participantCount,ledger.record.aaAmount,ledger.record.roundingRule,ledger.record.roundingDifference,ledger.splits.every(row=>row.payStatus==='paid')?'settled':ledger.record.status]
    );
    for(const split of ledger.splits){
      await client.query('INSERT INTO match_fee_splits(id,matchId,userId,amount,payStatus,paidAmount,paidAt,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())',[split.id,matchId,split.userId,split.amount,split.payStatus,split.paidAmount,split.payStatus==='paid'?new Date():null]);
    }
    await client.query("UPDATE match_posts SET status=$2,updatedAt=NOW() WHERE id=$1",[matchId,ledger.splits.every(row=>row.payStatus==='paid')?'settled':'fee_pending']);
    await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'admin_user',operatorId,'fee_generate',JSON.stringify(match),JSON.stringify(ledger.record)]);
    notifyMatchUsers(matchId,'fee_generate').catch(()=>null);
    return {ledger,paidUserIds:ledger.splits.filter(row=>row.payStatus==='paid').map(row=>String(row.userId))};
  });
  for(const paidUserId of result.paidUserIds){
    await syncMatchFeeSplitToCourtFinance(matchId,paidUserId,operatorId).catch(()=>null);
  }
  return result.ledger;
}
async function markMatchFeeSplit(matchId,userId,operatorId,input={}){
  const update=assertMatchFeeSplitUpdateInput(input);
  const result=await withMatchSqlTransaction(async(client)=>{
    const feeRecordRes=await client.query('SELECT * FROM match_fee_records WHERE matchId=$1 FOR UPDATE',[matchId]);
    const feeRecord=feeRecordRes.rows[0]||{};
    const isPrepay=/^prepay_/.test(String(feeRecord.status||''));
    const splitRes=await client.query('SELECT * FROM match_fee_splits WHERE matchId=$1 AND userId=$2 FOR UPDATE',[matchId,userId]);
    const split=splitRes.rows[0];
    if(!split)throw new Error('账单不存在');
    const amount=update.amount==null?normalizeMoney(split.amount):normalizeMoney(update.amount);
    const previousPaidAmount=normalizeMoney(split.paidamount||split.paidAmount);
    if(update.payStatus==='refunded'&&String(split.paystatus||split.payStatus)!=='paid'&&previousPaidAmount<=0)throw new Error('未收款不能退款');
    const nextPaidAmount=update.paidAmount==null?(update.payStatus==='paid'?amount:(update.payStatus==='refunded'?previousPaidAmount:0)):update.paidAmount;
    await client.query('UPDATE match_fee_splits SET amount=$1,payStatus=$2,paidAmount=$3,paidAt=$4,note=$5,updatedAt=NOW() WHERE matchId=$6 AND userId=$7',[amount,update.payStatus,nextPaidAmount,update.payStatus==='paid'?new Date():null,update.note,matchId,userId]);
    const feeRowsRes=await client.query("SELECT * FROM match_fee_splits WHERE matchId=$1 AND payStatus NOT IN ('cancelled','refunded')",[matchId]);
    const activeRows=feeRowsRes.rows;
    const participantCount=activeRows.length;
    const finalCourtFee=activeRows.reduce((sum,row)=>sum+normalizeMoney(row.amount),0);
    const aaAmount=participantCount>0?Math.ceil(finalCourtFee/participantCount):0;
    const distributedTotal=activeRows.reduce((sum,row)=>sum+normalizeMoney(row.amount),0);
    await client.query('UPDATE match_fee_records SET finalCourtFee=$1,participantCount=$2,aaAmount=$3,roundingDifference=$4,updatedAt=NOW() WHERE matchId=$5',[finalCourtFee,participantCount,aaAmount,finalCourtFee-distributedTotal,matchId]);
    const nextState=await syncMatchFeeRecordState(client,matchId,{isPrepay});
    await client.query('INSERT INTO match_operation_logs(id,matchId,operatorType,operatorId,action,before,after,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())',[uuidv4(),matchId,'admin_user',operatorId,'fee_split_update',JSON.stringify(split),JSON.stringify({amount,payStatus:update.payStatus,paidAmount:nextPaidAmount,note:update.note})]);
    return {success:true,status:nextState.status,isPrepay};
  });
  if(!result.isPrepay&&update.payStatus==='paid')result.financeSync=await syncMatchFeeSplitToCourtFinance(matchId,userId,operatorId);
  if(!result.isPrepay&&update.payStatus==='refunded')result.financeSync=await syncMatchFeeSplitRefundToCourtFinance(matchId,userId,operatorId,update.note);
  return result;
}
function buildMatchProfileStats({createdMatches=[],joinedMatches=[],attendanceRows=[],feeSplits=[]}={}){
  const confirmedAttendance=(attendanceRows||[]).filter(row=>{
    const finalStatus=row.finalStatus||row.finalstatus;
    const matchStatus=row.matchStatus||row.matchstatus;
    return ['attended','absent'].includes(finalStatus)&&matchStatus!=='cancelled';
  });
  const attended=confirmedAttendance.filter(row=>(row.finalStatus||row.finalstatus)==='attended').length;
  const attendanceRate=confirmedAttendance.length?Math.round(attended*100/confirmedAttendance.length):0;
  const totalFeeAmount=(feeSplits||[]).reduce((sum,row)=>{
    const status=String(row.payStatus||row.paystatus||'').trim();
    const amount=normalizeMoney(row.paidAmount??row.paidamount??row.amount);
    if(status==='paid')return sum+amount;
    if(status==='refunded')return sum-amount;
    return sum;
  },0);
  return {
    createdCount:(createdMatches||[]).length,
    joinedCount:(joinedMatches||[]).length,
    matchCreatedCount:(createdMatches||[]).length,
    matchJoinedCount:(joinedMatches||[]).length,
    matchCompletedCount:confirmedAttendance.length,
    attendanceRate,
    attendanceRateText:confirmedAttendance.length?`${attendanceRate}%`:'暂无记录',
    totalFeeAmount
  };
}
async function listMyMatches(userId){
  const pool=getMatchSqlPool();
  const rows=await pool.query(
    "SELECT DISTINCT p.* FROM match_posts p LEFT JOIN match_registrations r ON r.matchId=p.id LEFT JOIN match_attendance a ON a.matchId=p.id WHERE p.creatorUserId=$1 OR (r.userId=$1 AND r.registrationStatus='registered') OR a.userId=$1 ORDER BY p.startTime DESC",
    [userId]
  );
  const [registrations,attendanceRows]=await Promise.all([
    loadMatchRegistrationViews(pool,rows.rows.map(row=>String(row.id||'')),{registeredOnly:true}),
    pool.query('SELECT * FROM match_attendance WHERE userId=$1',[userId])
  ]);
  const regsByMatch=new Map();
  for(const row of registrations){
    const key=String(row.matchid||row.matchId);
    regsByMatch.set(key,[...(regsByMatch.get(key)||[]),row]);
  }
  const attendanceByMatch=new Map();
  for(const row of attendanceRows.rows){
    attendanceByMatch.set(String(row.matchid||row.matchId),row);
  }
  return rows.rows.map(row=>toMatchView(row,regsByMatch.get(String(row.id))||[],userId,[],attendanceByMatch.get(String(row.id))||null));
}
async function getMatchProfile(userId){
  const pool=getMatchSqlPool();
  const [userRes,created,joined,attendance,fees,ratings]=await Promise.all([
    pool.query('SELECT * FROM match_users WHERE id=$1',[userId]),
    pool.query('SELECT id FROM match_posts WHERE creatorUserId=$1',[userId]),
    pool.query("SELECT DISTINCT matchId AS id FROM match_registrations WHERE userId=$1 AND registrationStatus='registered'",[userId]),
    pool.query('SELECT a.*,p.status AS matchStatus FROM match_attendance a LEFT JOIN match_posts p ON p.id=a.matchId WHERE a.userId=$1',[userId]),
    pool.query('SELECT * FROM match_fee_splits WHERE userId=$1',[userId]),
    pool.query('SELECT ratedUserId,technicalLevel FROM match_player_ratings WHERE ratedUserId=$1',[userId])
  ]);
  const stats=buildMatchProfileStats({createdMatches:created.rows,joinedMatches:joined.rows,attendanceRows:attendance.rows,feeSplits:fees.rows});
  const ratingSummary=buildMatchTechnicalRatingSummary(ratings.rows).get(String(userId))||{technicalRatingAverage:0,technicalRatingText:'',technicalRatingCount:0};
  const user=userRes.rows[0]||{};
  return {...stats,...ratingSummary,user:{id:user.id,phone:user.phone||'',nickName:user.nickname||user.nickName||'',avatarUrl:user.avatarurl||user.avatarUrl||'',ntrpLevel:user.ntrplevel||user.ntrpLevel||'',canCreateMatch:await canMatchUserCreate(userId)}};
}
async function updateMatchProfile(userId,input){
  const phone=assertPhone(input.phone||'');
  const ntrpLevel=input.ntrpLevel==null?'':String(input.ntrpLevel||'').trim();
  const nickName=input.nickName==null?'':String(input.nickName||'').trim();
  const avatarUrl=input.avatarUrl==null?'':String(input.avatarUrl||'').trim();
  await getMatchSqlPool().query(
    'UPDATE match_users SET phone=COALESCE(NULLIF($2,$6),phone),ntrpLevel=COALESCE(NULLIF($3,$6),ntrpLevel),nickName=COALESCE(NULLIF($4,$6),nickName),avatarUrl=COALESCE(NULLIF($5,$6),avatarUrl),updatedAt=NOW() WHERE id=$1',
    [userId,phone,ntrpLevel,nickName,avatarUrl,'']
  );
  return getMatchProfile(userId);
}
async function submitMatchTechnicalRating(matchId,raterUserId,input={}){
  const rating=assertMatchTechnicalRatingInput(input,raterUserId);
  return withMatchSqlTransaction(async(client)=>{
    const matchRes=await client.query('SELECT * FROM match_posts WHERE id=$1 FOR UPDATE',[matchId]);
    const match=matchRes.rows[0];
    if(!match)throw new Error('球局不存在');
    if(dateMs(match.endtime||match.endTime)>Date.now())throw new Error('球局结束后才能评定');
    const attendance=await client.query(
      "SELECT userId,finalStatus FROM match_attendance WHERE matchId=$1 AND userId = ANY($2::text[])",
      [matchId,[raterUserId,rating.ratedUserId]]
    );
    const attended=new Set(attendance.rows.filter(row=>String(row.finalstatus||row.finalStatus)==='attended').map(row=>String(row.userid||row.userId)));
    if(!attended.has(String(raterUserId))||!attended.has(String(rating.ratedUserId)))throw new Error('只允许确认到场的同场球友互相评定');
    const id=uuidv4();
    await client.query(
      "INSERT INTO match_player_ratings(id,matchId,raterUserId,ratedUserId,technicalLevel,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,NOW(),NOW()) ON CONFLICT(matchId,raterUserId,ratedUserId) DO UPDATE SET technicalLevel=EXCLUDED.technicalLevel,updatedAt=NOW()",
      [id,matchId,raterUserId,rating.ratedUserId,rating.technicalLevel]
    );
    const rows=await client.query('SELECT ratedUserId,technicalLevel FROM match_player_ratings WHERE ratedUserId=$1',[rating.ratedUserId]);
    const summary=buildMatchTechnicalRatingSummary(rows.rows).get(String(rating.ratedUserId))||{technicalRatingText:'',technicalRatingCount:0};
    return {success:true,...rating,...summary};
  });
}
async function listMatchNotifications(userId){
  const rows=await getMatchSqlPool().query(
    "SELECT l.*,p.title FROM match_operation_logs l LEFT JOIN match_posts p ON p.id=l.matchId LEFT JOIN match_registrations r ON r.matchId=l.matchId AND r.userId=$1 WHERE p.creatorUserId=$1 OR r.userId=$1 ORDER BY l.createdAt DESC LIMIT 50",
    [userId]
  );
  return rows.rows.map(row=>({
    id:row.id,
    matchId:row.matchid||row.matchId,
    title:row.title||'约球通知',
    action:row.action,
    content:matchNotificationText(row.action,row.title),
    createdAt:row.createdat||row.createdAt
  }));
}
function matchNotificationText(action,title=''){
  const name=title||'球局';
  return ({booking:`${name} 已更新订场信息`,match_cancel:`${name} 已取消`,fee_generate:`${name} 已生成 AA 应收`,attendance_confirm:`${name} 已确认到场名单`,match_update:`${name} 信息已更新`})[action]||`${name} 有新动态`;
}
async function listMatchPlayers(){
  const rows=await getMatchSqlPool().query(
    "SELECT u.id,u.nickName,u.avatarUrl,u.ntrpLevel,COUNT(r.id)::int AS joinedCount FROM match_users u LEFT JOIN match_registrations r ON r.userId=u.id AND r.registrationStatus='registered' GROUP BY u.id ORDER BY joinedCount DESC,u.createdAt DESC LIMIT 100"
  );
  return rows.rows.map(row=>({id:row.id,nickName:row.nickname||row.nickName||'球友',avatarUrl:row.avatarurl||row.avatarUrl||'',ntrpLevel:row.ntrplevel||row.ntrpLevel||'',joinedCount:row.joinedcount||row.joinedCount||0}));
}
function normalizePhone(value){return String(value||'').replace(/\s+/g,'').trim();}
function isValidCnPhone(value){return /^1[3-9]\d{9}$/.test(normalizePhone(value));}
function assertPhone(value){
  const phone=normalizePhone(value);
  if(phone&&!isValidCnPhone(phone))throw new Error('手机号格式不正确');
  return phone;
}
function normalizeMoney(value){
  const n=parseFloat(String(value??'').replace(/,/g,''));
  return Number.isFinite(n)?n:0;
}
function safeDatabaseUrlHost(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  try{
    return new URL(raw).hostname || '';
  }catch(err){
    return '';
  }
}
function cleanLeadText(value){
  return String(value??'').trim();
}
function normalizeLeadBoolean(value){
  const raw=String(value||'').trim();
  if(!raw)return false;
  return /^(是|已转化|已报名|true|1|yes)$/i.test(raw);
}
function normalizeLeadPriority(value){
  const raw=cleanLeadText(value).toUpperCase();
  return /^P[0-4]$/.test(raw)?raw:'';
}
function extractLeadPhoneMeta(value){
  const raw=cleanLeadText(value);
  const match=raw.match(/1[3-9]\d{9}/);
  const phone=match?match[0]:'';
  const wechatName=cleanLeadText(raw.replace(phone,'').replace(/[\/|｜，,;；]+/g,' '));
  return {raw,phone,wechatName};
}
function deriveLeadSystemStatus(input={}){
  const rawStatus=cleanLeadText(input.rawStatus||input.statusAfter||input.leadStage||input.systemStatus);
  const linked=cleanLeadText(input.courtId)||cleanLeadText(input.membershipAccountId)||input.isCourseConverted===true||input.isCourtConverted===true||input.isMembershipConverted===true;
  if(linked||/已报名|已转课程|已转订场|已订场|已定场|定场|订场|会员|储值|成交/.test(rawStatus))return '已成交';
  if(rawStatus==='已流失'||rawStatus==='无意向')return '已流失';
  if(rawStatus==='体验课预约'||rawStatus==='已约体验')return '已约体验';
  if(['体验课完成','已体验待转化','已体验待成交'].includes(rawStatus))return '已体验待成交';
  return rawStatus==='新线索'?'新线索':'跟进中';
}
const LEAD_DEAL_TYPE_VALUES=['课程','订场','会员','课程+订场','课程+会员','订场+会员','课程+订场+会员'];
function normalizeLeadDealType(value){
  const raw=cleanLeadText(value);
  if(!raw||raw==='未转化')return '';
  const normalized=raw.replace(/已转/g,'').replace(/转化/g,'').replace(/成交/g,'').replace(/\s/g,'');
  return LEAD_DEAL_TYPE_VALUES.includes(raw)?raw:LEAD_DEAL_TYPE_VALUES.includes(normalized)?normalized:'';
}
function deriveLeadDealType(input={}){
  const stored=normalizeLeadDealType(input.dealType||input.conversionType);
  if(stored)return stored;
  const rawStatus=cleanLeadText(input.rawStatus||input.statusAfter||input.systemStatus||input.leadStage);
  const parts=[['课程',input.isCourseConverted===true||/已报名|已转课程|课程/.test(rawStatus)],['订场',cleanLeadText(input.courtId)||input.isCourtConverted===true||/已定场|已订场|订场|定场/.test(rawStatus)],['会员',cleanLeadText(input.membershipAccountId)||input.isMembershipConverted===true||/已转会员|会员|储值/.test(rawStatus)]].filter(([,ok])=>!!ok).map(([label])=>label);
  return parts.length?parts.join('+'):(input.convertedFlag===true?'课程':'');
}
function deriveLeadConversionType(input={}){return deriveLeadDealType(input);}
function applyLeadOutcomeFields(next){next.leadStage=deriveLeadSystemStatus(next);next.systemStatus=next.leadStage;next.dealType=deriveLeadDealType(next);next.conversionType=next.dealType;return next;}
function normalizeLeadRecord(input={},opts={}){
  const now=opts.now||new Date().toISOString();
  const id=input.id||opts.id||uuidv4();
  const phoneMeta=extractLeadPhoneMeta(input['微信名/电话']??input.contactRaw??input.displayName??'');
  const studentId=cleanLeadText(input.studentId);
  const courtId=cleanLeadText(input.courtId);
  const concern=cleanLeadText(input.latestConcern??input['用户顾虑点']),conclusion=cleanLeadText(input.latestConclusion??input['沟通情况和方案建议']),rawStatus=cleanLeadText(input.rawStatus??input['跟进状态']);
  const customerType=businessTaxonomy.normalizeLeadCustomerType(input.customerType??input['客户类型']??input.consultType??input['咨询需求']??input.profileNote??input['其他信息（包含年纪等）']),demandProduct=businessTaxonomy.normalizeLeadDemandProduct(input.demandProduct??input['需求产品']??input.consultType??input['咨询需求']);
  const next={
    id,
    leadDate:cleanLeadText(input.leadDate??input['线索时间']),
    displayName:cleanLeadText(input.displayName??phoneMeta.wechatName??phoneMeta.phone??phoneMeta.raw),
    phone:assertPhone(input.phone??phoneMeta.phone),
    wechatName:cleanLeadText(input.wechatName??phoneMeta.wechatName),
    level:cleanLeadText(input.level??input['水平']),
    profileNote:cleanLeadText(input.profileNote??input['其他信息（包含年纪等）']),
    source:businessTaxonomy.normalizeLeadSource(input.source??input['线索渠道']),
    campus:normalizeCampusValue(cleanLeadText(input.campus??input['所属校区'])),
    customerType,demandProduct,consultType:demandProduct,intentLevel:cleanLeadText(input.intentLevel??input['意向类型']),
    owner:cleanLeadText(input.owner??input['跟进人']),
    rawStatus,
    trialAtRaw:cleanLeadText(input.trialAtRaw??input['体验课时间']),
    enrollAtRaw:cleanLeadText(input.enrollAtRaw??input['正式课报名时间']),
    convertedFlag:normalizeLeadBoolean(input.convertedFlag??input['是否转化']),
    formalCoach:cleanLeadText(input.formalCoach??input['正式课教练']),
    lostReason:cleanLeadText(input.lostReason??input['未成交原因']),
    latestConcern:concern,
    latestConclusion:conclusion,
    nextAction:cleanLeadText(input.nextAction),
    followupPriority:normalizeLeadPriority(input.followupPriority??input['跟进优先级']),
    lastFollowupAt:cleanLeadText(input.lastFollowupAt),
    nextFollowupAt:cleanLeadText(input.nextFollowupAt),
    studentId,
    courtId,
    membershipAccountId:cleanLeadText(input.membershipAccountId),
    isCourseConverted:input.isCourseConverted===true||!!studentId,
    isCourtConverted:input.isCourtConverted===true||!!courtId,
    isMembershipConverted:input.isMembershipConverted===true||!!cleanLeadText(input.membershipAccountId),
    closedAt:cleanLeadText(input.closedAt),
    createdAt:input.createdAt||now,
    updatedAt:now
  };
  return applyLeadOutcomeFields(next);
}
function normalizeLeadFollowupRecord(input={},opts={}){
  const now=opts.now||new Date().toISOString();
  return {
    id:input.id||opts.id||uuidv4(),
    leadId:cleanLeadText(input.leadId),
    followupAt:cleanLeadText(input.followupAt)||now,
    followupBy:cleanLeadText(input.followupBy),
    followupType:cleanLeadText(input.followupType)||'manual',
    concern:cleanLeadText(input.concern),
    communicationNote:cleanLeadText(input.communicationNote),
    statusAfter:cleanLeadText(input.statusAfter),
    conclusion:cleanLeadText(input.conclusion||input.communicationNote),
    nextFollowupAt:cleanLeadText(input.nextFollowupAt),
    nextAction:cleanLeadText(input.nextAction),
    createdAt:input.createdAt||now,
    updatedAt:now
  };
}
function applyLeadFollowupSnapshot(lead,followup){
  const next={
    ...lead,
    lastFollowupAt:cleanLeadText(followup.followupAt)||lead.lastFollowupAt||'',
    latestConcern:cleanLeadText(followup.concern)||lead.latestConcern||'',
    latestConclusion:cleanLeadText(followup.conclusion)||lead.latestConclusion||'',
    nextFollowupAt:cleanLeadText(followup.nextFollowupAt)||'',
    nextAction:cleanLeadText(followup.nextAction)||'',
    rawStatus:cleanLeadText(followup.statusAfter)||lead.rawStatus||'',
    updatedAt:followup.updatedAt||new Date().toISOString()
  };
  return applyLeadOutcomeFields(next);
}
function latestLeadFollowupSnapshot(followups=[]){
  return [...(followups||[])].filter(Boolean).sort((a,b)=>
    String(b.followupAt||b.createdAt||'').localeCompare(String(a.followupAt||a.createdAt||''))||
    String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))
  )[0]||null;
}
function applyLeadFollowupsSnapshot(lead,followups=[]){
  const latest=latestLeadFollowupSnapshot(followups);
  if(latest)return applyLeadFollowupSnapshot(lead,latest);
  const next={...lead,lastFollowupAt:'',latestConcern:'',latestConclusion:'',nextFollowupAt:'',nextAction:''};
  return applyLeadOutcomeFields(next);
}
function splitCsvLine(line=''){
  const cells=[];
  let current='';
  let inQuotes=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){
      if(inQuotes&&line[i+1]==='"'){current+='"';i++;continue;}
      inQuotes=!inQuotes;
      continue;
    }
    if(ch===','&&!inQuotes){
      cells.push(current);
      current='';
      continue;
    }
    current+=ch;
  }
  cells.push(current);
  return cells;
}
function parseCsvText(text=''){
  const lines=String(text||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(line=>line!==''||text.includes('\n'));
  return lines.map(splitCsvLine);
}
const LEAD_IMPORT_REQUIRED_COLUMNS=[
  '线索时间','微信名/电话','水平','其他信息（包含年纪等）','线索渠道','咨询需求','意向类型','跟进人','跟进状态','体验课时间','正式课报名时间','用户顾虑点','沟通情况和方案建议','是否转化','正式课教练','未成交原因'
];
function findLeadImportHeaderIndex(rows=[]){
  return rows.findIndex(row=>{
    const cells=(row||[]).map(cell=>cleanLeadText(cell));
    return cells.includes('序号')&&cells.includes('线索时间')&&cells.includes('微信名/电话');
  });
}
function buildLeadImportHeaderRows(rows=[],headerIndex=-1){
  const mainHeader=(rows[headerIndex]||[]).map(cell=>cleanLeadText(cell));
  const subHeader=(rows[headerIndex+1]||[]).map(cell=>cleanLeadText(cell));
  const isTwoRowHeader=subHeader.some(cell=>['水平','其他信息（包含年纪等）','用户顾虑点','沟通情况和方案建议'].includes(cell));
  if(!isTwoRowHeader)return {header:mainHeader,dataStartIndex:headerIndex+1};
  const header=mainHeader.map((cell,index)=>subHeader[index]||cell);
  return {header,dataStartIndex:headerIndex+2};
}
function normalizeLeadImportRows(input={}){
  if(Array.isArray(input.rows))return input.rows.map(row=>normalizeLeadRecord(row));
  const csvText=String(input.csvText||'');
  if(!csvText.trim())return [];
  const rows=parseCsvText(csvText);
  if(rows.length<2)return [];
  const headerIndex=findLeadImportHeaderIndex(rows);
  if(headerIndex<0)throw new Error(`缺少必需列：${LEAD_IMPORT_REQUIRED_COLUMNS.join('、')}`);
  const {header,dataStartIndex}=buildLeadImportHeaderRows(rows,headerIndex);
  const missing=LEAD_IMPORT_REQUIRED_COLUMNS.filter(col=>!header.includes(col));
  if(missing.length)throw new Error(`缺少必需列：${missing.join('、')}`);
  return rows.slice(dataStartIndex).filter(row=>row.some(cell=>cleanLeadText(cell))).map(row=>{
    const raw={};
    LEAD_IMPORT_REQUIRED_COLUMNS.forEach(col=>{ raw[col]=row[header.indexOf(col)]||''; });
    return normalizeLeadRecord(raw);
  });
}
function buildLeadInitialFollowup(lead){
  return normalizeLeadFollowupRecord({
    leadId:lead.id,
    followupAt:lead.leadDate||lead.createdAt||new Date().toISOString(),
    followupBy:lead.owner,
    followupType:'import',
    concern:lead.latestConcern,
    communicationNote:lead.latestConclusion,
    statusAfter:lead.rawStatus,
    conclusion:lead.latestConclusion,
    nextFollowupAt:lead.nextFollowupAt,
    nextAction:lead.nextAction
  });
}
function buildLeadDedupKey(input={}){
  const phone=normalizeLeadDedupPhone(input);
  const name=normalizeLeadIdentityName(input.displayName||input.wechatName);
  const identity=phone?`phone:${phone}`:(name?`name:${name}`:`id:${cleanLeadText(input.id||input.sourceRowNo||input['序号'])}`);
  return [
    identity,
    normalizeLeadKeyDate(input.leadDate),
    normalizeLeadKeyText(input.source),
    normalizeLeadKeyText(input.consultType)
  ].join('|');
}
function normalizeLeadDedupPhone(input={}){
  const direct=cleanLeadText(input.phone);
  if(direct)return assertPhone(direct);
  return extractLeadPhoneMeta(input.displayName||input.wechatName||input.name||input.contactRaw||'').phone;
}
function normalizeLeadIdentityName(value){
  return cleanLeadText(value).replace(/1[3-9]\d{9}/g,'').toLowerCase().replace(/\s+/g,'').replace(/[·.。_\-\/|｜，,;；]/g,'');
}
function normalizeLeadKeyText(value){
  return cleanLeadText(value).toLowerCase().replace(/\s+/g,'');
}
function normalizeLeadKeyDate(value){
  const raw=cleanLeadText(value);
  let m=raw.match(/(\d{4})[年\/.-](\d{1,2})[月\/.-](\d{1,2})/);
  if(m)return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m=raw.match(/^(\d{1,2})[月.\/-](\d{1,2})(?:日)?/);
  if(m)return `${new Date().getFullYear()}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  return raw;
}
function dedupeLeadRows(rows=[]){
  const seen=new Set();
  const next=[];
  for(const row of rows||[]){
    const key=buildLeadDedupKey(row);
    if(seen.has(key))continue;
    seen.add(key);
    next.push(row);
  }
  return next;
}
function leadCanonicalNameKey(input={}){
  const name=normalizeLeadIdentityName(input.wechatName||input.displayName||input.name);
  return name?`name:${name}`:`id:${cleanLeadText(input.id||'')}`;
}
function leadMergeDateValue(value){
  const normalized=normalizeLeadKeyDate(value);
  const ts=Date.parse(normalized);
  return Number.isFinite(ts)?ts:Number.MAX_SAFE_INTEGER;
}
function mergeLeadRows(rows=[]){
  const list=(rows||[]).filter(Boolean);
  if(!list.length)return null;
  const primary=[...list].sort((a,b)=>
    leadMergeDateValue(a.leadDate)-leadMergeDateValue(b.leadDate)||
    String(a.createdAt||'').localeCompare(String(b.createdAt||''))||
    String(a.id||'').localeCompare(String(b.id||''))
  )[0];
  const latest=[...list].sort((a,b)=>
    String(b.updatedAt||b.lastFollowupAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.lastFollowupAt||a.createdAt||''))
  );
  const merged={...primary};
  const preserve=new Set(['id','createdAt','leadDate']);
  latest.reverse().forEach(row=>{
    Object.entries(row).forEach(([key,value])=>{
      if(preserve.has(key))return;
      if(cleanLeadText(value)!=='')merged[key]=value;
    });
  });
  merged.id=primary.id;
  merged.createdAt=primary.createdAt;
  merged.leadDate=primary.leadDate;
  merged.updatedAt=latest[0]?.updatedAt||primary.updatedAt||'';
  merged.lastFollowupAt=latest.map(row=>cleanLeadText(row.lastFollowupAt)).filter(Boolean).sort().pop()||merged.lastFollowupAt||'';
  merged._mergedLeadIds=Array.from(new Set(list.map(row=>cleanLeadText(row.id)).filter(Boolean)));
  return applyLeadOutcomeFields(merged);
}
function mergeDuplicateLeadRows(rows=[]){
  const groups=new Map();
  (rows||[]).forEach(row=>{
    const key=leadCanonicalNameKey(row);
    const group=groups.get(key)||[];
    group.push(row);
    groups.set(key,group);
  });
  return [...groups.values()].map(mergeLeadRows).filter(Boolean);
}
function leadNameCandidates(lead){
  return [lead.displayName,lead.wechatName].map(cleanLeadText).filter(Boolean);
}
function matchLeadToStudent(lead,students=[]){
  const phone=assertPhone(lead.phone||'');
  if(phone){
    const exact=(students||[]).find(student=>assertPhone(student.phone||'')===phone);
    if(exact)return {matchType:'auto',record:exact};
  }
  const names=leadNameCandidates(lead);
  if(!names.length)return {matchType:'none',record:null};
  const exactName=(students||[]).find(student=>names.includes(cleanLeadText(student.name)));
  return exactName?{matchType:'possible',record:exactName}:{matchType:'none',record:null};
}
function matchLeadToCourt(lead,courts=[]){
  const phone=assertPhone(lead.phone||'');
  if(phone){
    const exact=(courts||[]).find(court=>assertPhone(court.phone||'')===phone);
    if(exact)return {matchType:'auto',record:exact};
  }
  const names=leadNameCandidates(lead);
  if(!names.length)return {matchType:'none',record:null};
  const exactName=(courts||[]).find(court=>names.includes(cleanLeadText(court.name)));
  return exactName?{matchType:'possible',record:exactName}:{matchType:'none',record:null};
}
function matchLeadToMembership(courtId,membershipAccounts=[]){
  if(!cleanLeadText(courtId))return null;
  return (membershipAccounts||[]).find(account=>String(account.courtId||'')===String(courtId)&&account.status!=='voided')||null;
}
function leadImportPreviewSummary(rows=[]){
  return rows.reduce((acc,row)=>{
    acc.totalRows++;
    acc.importableRows++;
    if(row.studentMatchType==='auto')acc.autoLinkedStudents++;
    if(row.courtMatchType==='auto')acc.autoLinkedCourts++;
    if(row.studentMatchType==='possible'||row.courtMatchType==='possible')acc.possibleMatches++;
    if(row.studentMatchType==='none'&&row.courtMatchType==='none')acc.unmatchedRows++;
    acc.byStatus[row.systemStatus]=(acc.byStatus[row.systemStatus]||0)+1;
    return acc;
  },{totalRows:0,importableRows:0,errorRows:0,autoLinkedStudents:0,autoLinkedCourts:0,possibleMatches:0,unmatchedRows:0,byStatus:{}});
}
function buildLeadImportPreviewRows(leads,{students=[],courts=[],membershipAccounts=[]}={}){
  return (leads||[]).map(lead=>{
    const studentMatch=matchLeadToStudent(lead,students);
    const courtMatch=matchLeadToCourt(lead,courts);
    const membershipMatch=courtMatch.matchType==='auto'?matchLeadToMembership(courtMatch.record?.id||'',membershipAccounts):null;
    const linkedLead={...lead,studentId:studentMatch.matchType==='auto'?studentMatch.record?.id:'',courtId:courtMatch.matchType==='auto'?courtMatch.record?.id:'',membershipAccountId:membershipMatch?.id||''},leadStage=deriveLeadSystemStatus(linkedLead),dealType=deriveLeadDealType(linkedLead);
    return {
      ...lead,
      studentId:studentMatch.matchType==='auto'?studentMatch.record.id:'',
      courtId:courtMatch.matchType==='auto'?courtMatch.record.id:'',
      membershipAccountId:membershipMatch?.id||'',
      isCourseConverted:studentMatch.matchType==='auto',
      isCourtConverted:courtMatch.matchType==='auto',
      isMembershipConverted:!!membershipMatch,
      studentMatchType:studentMatch.matchType,
      studentMatchId:studentMatch.record?.id||'',
      studentMatchName:studentMatch.record?.name||'',
      courtMatchType:courtMatch.matchType,
      courtMatchId:courtMatch.record?.id||'',
      courtMatchName:courtMatch.record?.name||'',
      leadStage,systemStatus:leadStage,dealType,conversionType:dealType
    };
  });
}
function buildLeadStudentRecord(lead,{id=uuidv4(),now=new Date().toISOString()}={}){
  return {
    id,
    name:cleanLeadText(lead.wechatName||lead.displayName)||'未命名线索',
    phone:assertPhone(lead.phone||''),
    primaryCoach:cleanLeadText(lead.formalCoach||''),
    type:cleanLeadText(lead.consultType).includes('青少')?'青少年':'成人',
    source:cleanLeadText(lead.source),
    sourceLeadId:cleanLeadText(lead.id),
    activityRange:'',
    campus:'',
    notes:[cleanLeadText(lead.profileNote),cleanLeadText(lead.latestConcern),cleanLeadText(lead.latestConclusion)].filter(Boolean).join('；'),
    createdAt:now,
    updatedAt:now
  };
}
function buildLeadCourtRecord(lead,{studentId='',id=uuidv4(),now=new Date().toISOString()}={}){
  return normalizeCourtRecord({
    id,
    name:cleanLeadText(lead.wechatName||lead.displayName)||'未命名线索',
    phone:assertPhone(lead.phone||''),
    studentId:cleanLeadText(studentId),
    studentIds:studentId?[studentId]:[],
    source:cleanLeadText(lead.source),
    sourceLeadId:cleanLeadText(lead.id),
    campus:'',
    owner:cleanLeadText(lead.owner),
    notes:[cleanLeadText(lead.profileNote),cleanLeadText(lead.latestConcern),cleanLeadText(lead.latestConclusion)].filter(Boolean).join('；'),
    history:[],
    status:'active',
    createdAt:now,
    updatedAt:now
  });
}
function defaultMabaoPricePlans(){
  const venue=[
    ['工作日','06:00','08:00',100],
    ['工作日','08:00','16:00',140],
    ['工作日','16:00','20:00',220],
    ['工作日','20:00','22:00',180],
    ['周末节假日','06:00','08:00',100],
    ['周末节假日','08:00','22:00',220]
  ].map(([dateType,startTime,endTime,unitPrice])=>({type:'venue_rate',campus:'mabao',venueSpaceType:'室内',dateType,startTime,endTime,unitPrice,status:'active',notes:'默认马坡场地价'}));
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
    ['新客福利 约球双打局 2H','订场券','court','2小时',120,70],
    ['晚场福利 场地预定 1H','订场券','court','1小时',60,180],
    ['黄金时段 场地预定 1H','订场券','court','1小时',60,220],
    ['实力之选 网球陪打 1H','订场券','court','1小时',60,100],
    ['闲时特惠 场地预定 1H','订场券','court','1小时',60,140],
    ['刷球时刻 网球发球机畅打 1H','订场券','court','1小时',60,60],
    ['晨练 场地预定 30min','订场券','court','30min',30,50]
  ].map(([productName,productType,businessType,durationLabel,durationMinutes,salePrice])=>({type:'channel_product',channel:'大众点评',productName,productType,experienceType:productType==='体验课'?(/小班|1v4/.test(productName)?'小班体验课':'私教体验课'):'',businessType,durationLabel,durationMinutes,salePrice,status:'active',notes:'默认大众点评商品价'}));
  return [...venue,...products];
}
function normalizeDefaultPriceName(name){
  return String(name||'').replace(/[：:\s]/g,'').replace(/体验课$/,'体验').trim();
}
function assertPricePlanInput(plan){
  const type=String(plan?.type||'').trim();
  if(!['venue_rate','channel_product'].includes(type))throw new Error('请选择价格类型');
  if(type==='venue_rate'){
    if(!String(plan.campus||'').trim())throw new Error('请选择校区');
    if(!String(plan.venueSpaceType||'').trim())throw new Error('请选择场地类型');
    if(!String(plan.dateType||'').trim())throw new Error('请选择日期类型');
    const start=clockMin(plan.startTime),end=clockMin(plan.endTime);
    if(!Number.isFinite(start)||!Number.isFinite(end))throw new Error('请填写有效时间段');
    if(end<=start)throw new Error('结束时间必须晚于开始时间');
    if(normalizeMoney(plan.unitPrice)<=0)throw new Error('场地价格必须大于 0');
  }
  if(type==='channel_product'){
    if(!String(plan.channel||'').trim())throw new Error('请选择渠道');
    if(!String(plan.productName||'').trim())throw new Error('请填写渠道商品名称');
    if(!String(plan.productType||'').trim())throw new Error('请选择商品类型');
    if(!String(plan.businessType||'').trim())throw new Error('请选择关联业务');
    if(String(plan.businessType||'').trim()==='court'&&(parseInt(plan.durationMinutes)||0)<=0&&!String(plan.durationLabel||'').trim())throw new Error('订场券请填写时长');
    if(normalizeMoney(plan.salePrice)<=0)throw new Error('渠道商品售价必须大于 0');
  }
}
function normalizePricePlan(input={},id=uuidv4(),now=new Date().toISOString(),old=null){
  const type=String(input.type||old?.type||'').trim();
  const base={
    id,
    type,
    campus:String(input.campus??old?.campus??'').trim(),
    venueSpaceType:String(input.venueSpaceType??old?.venueSpaceType??'室内').trim()||'室内',
    dateType:String(input.dateType??old?.dateType??'').trim(),
    startTime:String(input.startTime??old?.startTime??'').trim(),
    endTime:String(input.endTime??old?.endTime??'').trim(),
    unitPrice:normalizeMoney(input.unitPrice??old?.unitPrice),
    channel:String(input.channel??old?.channel??'').trim(),
    productName:String(input.productName??old?.productName??'').trim(),
    productType:String(input.productType??old?.productType??'').trim(),
    businessType:String(input.businessType??old?.businessType??'').trim(),
    durationMinutes:parseInt(input.durationMinutes??old?.durationMinutes)||0,
    durationLabel:String(input.durationLabel??old?.durationLabel??'').trim(),
    salePrice:normalizeMoney(input.salePrice??old?.salePrice),
    status:String(input.status??old?.status??'active').trim()||'active',
    effectiveFrom:String(input.effectiveFrom??old?.effectiveFrom??'').trim(),
    effectiveTo:String(input.effectiveTo??old?.effectiveTo??'').trim(),
    notes:String(input.notes??old?.notes??'').trim(),
    createdAt:old?.createdAt||input.createdAt||now,
    updatedAt:now
  };
  if(input.experienceType!==undefined||old?.experienceType!==undefined)base.experienceType=String(input.experienceType??old?.experienceType??'').trim();
  if(base.type==='venue_rate'){
    base.channel='';
    base.productName='';
    base.productType='';
    base.businessType='';
    base.durationMinutes=0;
    base.durationLabel='';
    base.salePrice=0;
  }
  if(base.type==='channel_product'){
    base.campus='';
    base.venueSpaceType='';
    base.dateType='';
    base.startTime='';
    base.endTime='';
    base.unitPrice=0;
    if(base.productType!=='体验课')delete base.experienceType;
  }
  assertPricePlanInput(base);
  return base;
}
async function syncDefaultPricePlans(){
  const existing=await scan(T_PRICE_PLANS).catch(()=>[]);
  const now=new Date().toISOString();
  for(const row of defaultMabaoPricePlans()){
    const same=existing.find(p=>{
      if(p.type!==row.type)return false;
      if(row.type==='venue_rate')return p.campus===row.campus&&p.dateType===row.dateType&&p.startTime===row.startTime&&p.endTime===row.endTime;
      return p.channel===row.channel&&normalizeDefaultPriceName(p.productName)===normalizeDefaultPriceName(row.productName);
    });
    const normalized=normalizePricePlan(row,same?.id||uuidv4(),now,same||null);
    await put(T_PRICE_PLANS,normalized.id,normalized);
    if(!same)existing.push(normalized);
  }
}
function priceDateType(date){
  const d=new Date(`${dateKey(date)}T00:00:00`);
  const day=d.getDay();
  return day===0||day===6?'周末节假日':'工作日';
}
function roundMoney(n){return Math.round((Number(n)||0)*100)/100;}
function quoteVenuePrice(pricePlans=[],input={}){
  const campus=String(input.campus||'').trim();
  const ds=dateKey(input.date||input.startTime);
  const dateType=String(input.dateType||'').trim()||priceDateType(ds);
  const start=clockMin(input.startTime);
  const end=clockMin(input.endTime);
  if(!campus)throw new Error('请选择校区');
  if(!ds)throw new Error('请选择日期');
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error('请填写有效时间段');
  const candidates=(pricePlans||[]).filter(plan=>{
    if(plan?.type!=='venue_rate'||plan.status==='inactive')return false;
    if(String(plan.campus||'').trim()!==campus)return false;
    if(String(plan.dateType||'').trim()!==dateType)return false;
    if(plan.effectiveFrom&&ds<plan.effectiveFrom)return false;
    if(plan.effectiveTo&&ds>plan.effectiveTo)return false;
    return true;
  }).sort((a,b)=>clockMin(a.startTime)-clockMin(b.startTime));
  let cursor=start;
  const segments=[];
  while(cursor<end){
    const hit=candidates.find(plan=>{
      const ps=clockMin(plan.startTime),pe=clockMin(plan.endTime);
      return Number.isFinite(ps)&&Number.isFinite(pe)&&cursor>=ps&&cursor<pe;
    });
    if(!hit)throw new Error('未找到匹配的场地价格');
    const segmentEnd=Math.min(end,clockMin(hit.endTime));
    const hours=(segmentEnd-cursor)/60;
    const amount=roundMoney(hours*normalizeMoney(hit.unitPrice));
    segments.push({pricePlanId:hit.id,startTime:minToClock(cursor),endTime:minToClock(segmentEnd),unitPrice:normalizeMoney(hit.unitPrice),amount});
    cursor=segmentEnd;
  }
  const originalAmount=roundMoney(segments.reduce((sum,row)=>sum+row.amount,0));
  const rawDiscount=parseFloat(input.memberDiscount);
  const memberDiscount=Number.isFinite(rawDiscount)&&rawDiscount>0?rawDiscount:1;
  const systemAmount=roundMoney(originalAmount*memberDiscount);
  return {pricePlanIds:[...new Set(segments.map(s=>s.pricePlanId))],dateType,systemAmount,originalAmount,memberDiscount,segments};
}
function minToClock(min){
  return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;
}
function hasMoneyValue(value){
  return value!==undefined&&value!==null&&String(value).trim()!=='';
}
function isoDateKey(value){
  const raw=String(value||'').trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(raw))return raw.slice(0,10);
  const ms=Date.parse(raw);
  return Number.isNaN(ms)?'':new Date(ms).toISOString().slice(0,10);
}
function matchFinanceRowDate(row){
  const rawPrimary=String(row.occurredDate||row.date||'').trim();
  const primary=/^\d{4}-\d{2}-\d{2}/.test(rawPrimary)?isoDateKey(rawPrimary):'';
  if(primary)return primary;
  return isoDateKey(row.recordedAt||row.createdAt);
}
function buildMatchFinanceDailyReport({date=new Date().toISOString().slice(0,10),feeSplits=[],financeHistory=[]}={}){
  const target=isoDateKey(date)||new Date().toISOString().slice(0,10);
  const summary={receivable:0,paid:0,pending:0,waived:0,abnormal:0,refunded:0,ledgerIncome:0,ledgerRefund:0,ledgerNet:0,expectedNet:0,diff:0};
  const splitRows=(feeSplits||[]).filter(row=>isoDateKey(row.updatedAt||row.updatedat||row.paidAt||row.paidat||row.createdAt||row.createdat)===target);
  for(const split of splitRows){
    const amount=normalizeMoney(split.amount);
    const paidAmount=normalizeMoney(split.paidAmount||split.paidamount||amount);
    const status=split.payStatus||split.paystatus||'pending';
    summary.receivable+=amount;
    if(status==='paid'||status==='refunded')summary.paid+=paidAmount;
    else if(status==='waived')summary.waived+=amount;
    else if(status==='abnormal'||status==='bad_debt')summary.abnormal+=amount;
    else summary.pending+=amount;
  }
  const ledgerRows=normalizeCourtHistory(financeHistory).filter(row=>row.sourceCategory==='约球订场'&&row.category==='订场'&&matchFinanceRowDate(row)===target);
  for(const row of ledgerRows){
    const amount=normalizeMoney(row.amount);
    if(row.type==='消费')summary.ledgerIncome+=amount;
    if(row.type==='退款')summary.ledgerRefund+=amount;
  }
  summary.refunded=summary.ledgerRefund;
  summary.ledgerNet=summary.ledgerIncome-summary.ledgerRefund;
  summary.expectedNet=summary.paid-summary.refunded;
  summary.diff=summary.expectedNet-summary.ledgerNet;
  Object.keys(summary).forEach(key=>summary[key]=Math.round(summary[key]*100)/100);
  return {date:target,summary,feeSplits:splitRows,ledgerRows};
}
async function getMatchFinanceDailyReportForAdmin(date=new Date().toISOString().slice(0,10)){
  const pool=getMatchSqlPool();
  const target=isoDateKey(date)||new Date().toISOString().slice(0,10);
  const splits=await pool.query(`
    SELECT s.*,u.nickName,u.phone,p.title,p.startTime,p.venueName
    FROM match_fee_splits s
    LEFT JOIN match_users u ON u.id=s.userId
    LEFT JOIN match_posts p ON p.id=s.matchId
    WHERE DATE(COALESCE(s.updatedAt,s.paidAt,s.createdAt))=$1::date
    ORDER BY s.updatedAt DESC
  `,[target]);
  const financeAccount=await getCachedRow(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID).catch(()=>null);
  return buildMatchFinanceDailyReport({date:target,feeSplits:splits.rows,financeHistory:financeAccount?.history||[]});
}
function matchClockText(value){
  const raw=String(value||'');
  if(!raw)return '';
  const m=raw.replace('T',' ').match(/\s(\d{2}:\d{2})/);
  return m?m[1]:raw.slice(11,16);
}
function matchDateText(value){
  const raw=String(value||'');
  return raw.slice(0,10);
}
function buildMatchCourtFinanceHistoryRow({match={},split={},user={},operatorId='',now=new Date().toISOString()}={}){
  const amount=normalizeMoney(split.amount||split.paidAmount);
  if(amount<=0)throw new Error('约球收款金额必须大于 0');
  const start=match.starttime||match.startTime;
  const end=match.endtime||match.endTime;
  const title=String(match.title||'约球').trim();
  const payer=String(user.nickName||user.nickname||user.phone||user.id||split.userId||split.userid||'球友').trim();
  const operationTrace=buildOperationTrace({operationType:'match-fee-sync',operator:operatorId,now});
  return withOperationTrace({
    id:`match-fee-${split.id||uuidv4()}`,
    date:matchDateText(start)||String(now).slice(0,10),
    occurredDate:matchDateText(start)||String(now).slice(0,10),
    createdAt:now,
    recordedAt:now,
    type:'消费',
    category:'订场',
    sourceCategory:'约球订场',
    payMethod:'微信转账',
    amount,
    note:`约球订场 - ${title} - ${payer}`,
    startTime:matchClockText(start),
    endTime:matchClockText(end),
    venue:match.venuename||match.venueName||'',
    campus:match.campus||'',
    revenueBucket:'现场收款',
    priceMode:'manual',
    systemAmount:amount,
    finalAmount:amount,
    priceOverridden:false,
    overrideReason:'',
    matchId:match.id||split.matchId||split.matchid||'',
    matchFeeSplitId:split.id||'',
    matchUserId:split.userid||split.userId||user.id||'',
    operator:operatorId
  },operationTrace);
}
function buildMatchCourtFinanceRefundRow({paidRow={},split={},operatorId='',note='',now=new Date().toISOString()}={}){
  const amount=normalizeMoney(split.paidAmount||split.paidamount||split.amount||paidRow.amount);
  if(amount<=0)throw new Error('约球退款金额必须大于 0');
  const operationTrace=buildOperationTrace({operationType:'match-refund-sync',operator:operatorId,now});
  return withOperationTrace({
    ...paidRow,
    id:`match-fee-refund-${split.id||uuidv4()}`,
    createdAt:now,
    recordedAt:now,
    type:'退款',
    category:'订场',
    sourceCategory:'约球订场',
    payMethod:paidRow.payMethod||'微信转账',
    revenueBucket:paidRow.revenueBucket||'现场收款',
    amount,
    note:`约球订场退款 - ${String(note||'运营退款').trim()}`,
    matchFeeSplitId:split.id||paidRow.matchFeeSplitId||'',
    matchUserId:split.userid||split.userId||paidRow.matchUserId||'',
    operator:operatorId,
    operationId:'',
    batchId:'',
    operationType:'',
    operationAt:'',
    operationBy:''
  },operationTrace);
}
async function syncMatchFeeSplitToCourtFinance(matchId,userId,operatorId){
  const pool=getMatchSqlPool();
  const [matchRes,splitRes,userRes]=await Promise.all([
    pool.query('SELECT * FROM match_posts WHERE id=$1',[matchId]),
    pool.query('SELECT * FROM match_fee_splits WHERE matchId=$1 AND userId=$2',[matchId,userId]),
    pool.query('SELECT * FROM match_users WHERE id=$1',[userId])
  ]);
  const match=matchRes.rows[0];
  const split=splitRes.rows[0];
  if(!match||!split||String(split.paystatus||split.payStatus)!=='paid')return {synced:false};
  const now=new Date().toISOString();
  const existing=await getCachedRow(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID).catch(()=>null);
  const base=existing||{
    id:MATCH_COURT_FINANCE_ACCOUNT_ID,
    name:'约球订场',
    phone:'',
    campus:'',
    status:'active',
    history:[],
    createdAt:now
  };
  const history=normalizeCourtHistory(base.history);
  if(history.some(row=>String(row.matchFeeSplitId||'')===String(split.id)))return {synced:true,skipped:true};
  const row=buildMatchCourtFinanceHistoryRow({match,split,user:userRes.rows[0]||{},operatorId,now});
  const next=normalizeCourtRecord({...base,history:[...history,row],updatedAt:now});
  await put(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID,next);
  return {synced:true,historyId:row.id};
}
async function syncMatchFeeSplitRefundToCourtFinance(matchId,userId,operatorId,note=''){
  const pool=getMatchSqlPool();
  const splitRes=await pool.query('SELECT * FROM match_fee_splits WHERE matchId=$1 AND userId=$2',[matchId,userId]);
  const split=splitRes.rows[0];
  if(!split||String(split.paystatus||split.payStatus)!=='refunded')return {synced:false};
  const now=new Date().toISOString();
  const existing=await getCachedRow(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID).catch(()=>null);
  if(!existing)return {synced:false,error:'match court finance account missing'};
  const history=normalizeCourtHistory(existing.history);
  const splitId=String(split.id||'');
  if(history.some(row=>String(row.id||'')===`match-fee-refund-${splitId}`))return {synced:true,skipped:true};
  const paidRow=history.find(row=>String(row.matchFeeSplitId||'')===splitId&&row.type==='消费');
  if(!paidRow)throw new Error('未找到原收款流水，不能退款');
  const row=buildMatchCourtFinanceRefundRow({paidRow,split,operatorId,note,now});
  const next=normalizeCourtRecord({...existing,history:[...history,row],updatedAt:now});
  await put(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID,next);
  return {synced:true,historyId:row.id};
}
async function getCourtRecordForTest(id){
  return getCachedRow(T_COURTS,id);
}
async function removeMatchCourtFinanceRowsForTest(matchIdPrefix){
  const account=await getCachedRow(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID).catch(()=>null);
  if(!account)return {removed:0};
  const history=normalizeCourtHistory(account.history);
  const prefix=String(matchIdPrefix||'');
  const nextHistory=history.filter(row=>{
    const haystack=[row.matchId,row.note,row.matchUserId,row.id].map(x=>String(x||'')).join(' ');
    return !haystack.includes(prefix);
  });
  const removed=history.length-nextHistory.length;
  if(removed>0){
    const next=normalizeCourtRecord({...account,history:nextHistory,updatedAt:new Date().toISOString()});
    await put(T_COURTS,MATCH_COURT_FINANCE_ACCOUNT_ID,next);
  }
  return {removed};
}
function assertCanVoidPurchase(purchaseId,entitlements,ledger){
  const entitlementIds=new Set((entitlements||[]).filter(e=>e.purchaseId===purchaseId).map(e=>e.id));
  if((ledger||[]).some(l=>entitlementIds.has(l.entitlementId)))throw new Error('该购买记录已有课时消耗，不能直接作废');
}
function assertCanDeleteEntitlement(entitlementId,ledger,entitlements=[]){
  if((ledger||[]).some(l=>l.entitlementId===entitlementId))throw new Error('该课包余额已有消耗记录，不能删除');
  if((entitlements||[]).some(e=>e.id===entitlementId&&e.purchaseId))throw new Error('该课包余额来自购买记录，不能删除');
}
function firstNonEmptyText(...values){
  for(const value of values){
    const text=String(value??'').trim();
    if(text)return text;
  }
  return '';
}
function formatClassScheduleDaysText(days){
  const list=parseArr(days).map(item=>String(item||'').trim()).filter(Boolean);
  if(!list.length)return '';
  return `每${list.join('、')}`;
}
function formatClassScheduleTimeFromLesson(lesson){
  const start=String(lesson?.startTime||'').trim();
  const end=String(lesson?.endTime||'').trim();
  if(!start||!end)return '';
  const startDate=new Date(start.replace(' ','T'));
  const endDate=new Date(end.replace(' ','T'));
  if(Number.isNaN(startDate.getTime())||Number.isNaN(endDate.getTime()))return '';
  const weekDays=['周日','周一','周二','周三','周四','周五','周六'];
  const startText=`${String(startDate.getHours()).padStart(2,'0')}:${String(startDate.getMinutes()).padStart(2,'0')}`;
  const endText=`${String(endDate.getHours()).padStart(2,'0')}:${String(endDate.getMinutes()).padStart(2,'0')}`;
  return `${weekDays[startDate.getDay()]} ${startText} - ${endText}`;
}
function decorateWorkbenchClasses(classes,schedule){
  const lessons=Array.isArray(schedule)?schedule:[];
  return (Array.isArray(classes)?classes:[]).map(item=>{
    const classLessons=lessons
      .filter(lesson=>String(lesson?.status||'')!=='已取消')
      .filter(lesson=>String(lesson?.classId||'').trim()===String(item?.id||'').trim())
      .sort((a,b)=>String(a?.startTime||'').localeCompare(String(b?.startTime||'')));
    const scheduleTime=firstNonEmptyText(
      classLessons[0]&&formatClassScheduleTimeFromLesson(classLessons[0]),
      formatClassScheduleDaysText(item?.scheduleDays)
    );
    return {
      ...item,
      courseContent:firstNonEmptyText(item?.courseContent,item?.productName),
      scheduleTime:scheduleTime,
      campus:firstNonEmptyText(item?.campus,item?.campusName),
      remark:firstNonEmptyText(item?.remark,item?.opsNote)
    };
  });
}
function workbenchLessonUnits(schedule){
  const count=parseLessonValue(schedule?.lessonCount);
  if(count>0)return count;
  const start=dateMs(schedule?.startTime);
  const end=dateMs(schedule?.endTime);
  if(Number.isFinite(start)&&Number.isFinite(end)&&end>start)return Math.max(0,(end-start)/3600000);
  return 1;
}
function decorateWorkbenchStudents(students=[],schedule=[],now=new Date()){
  const lessons=Array.isArray(schedule)?schedule:[];
  return (Array.isArray(students)?students:[]).map(item=>({
    ...item,
    phone:firstNonEmptyText(item?.phone,item?.mobile,item?.phoneNumber),
    type:firstNonEmptyText(item?.type,item?.studentType,item?.category),
    campus:firstNonEmptyText(item?.campus,item?.campusName,item?.primaryCampus),
    primaryCoach:firstNonEmptyText(item?.primaryCoach,item?.coachName),
    ownerCoach:firstNonEmptyText(item?.ownerCoach,item?.saleCoach,item?.salesCoach),
    remark:firstNonEmptyText(item?.remark,item?.studentRemark,item?.note,item?.notes),
    historyIssue:firstNonEmptyText(item?.historyIssue,item?.issueHistory,item?.issueNote,item?.healthNote),
    focusNote:firstNonEmptyText(item?.focusNote,item?.sessionFocus),
    lessonUnitsCompleted:lessons
      .filter(lesson=>effectiveScheduleStatus(lesson,now)==='已结束')
      .filter(lesson=>parseArr(lesson?.studentIds).includes(item?.id)||String(lesson?.studentId||'')===String(item?.id||''))
      .reduce((sum,lesson)=>sum+workbenchLessonUnits(lesson),0)
  }));
}
function decorateWorkbenchFeedbacks(feedbacks=[]){
  return (Array.isArray(feedbacks)?feedbacks:[]).map(item=>({
    ...item,
    focusNote:firstNonEmptyText(item?.focusNote,item?.sessionFocus,item?.coachFocus,item?.coachNote),
    summary:firstNonEmptyText(item?.summary,item?.practicedToday)
  }));
}
function assertCanDeleteSchedule(schedule,feedbacks,ledger=[]){
  const scheduleId=typeof schedule==='string'?schedule:schedule?.id;
  const isCancelled=typeof schedule==='string'?false:effectiveScheduleStatus(schedule)==='已取消';
  if((feedbacks||[]).some(f=>f.scheduleId===scheduleId))throw new Error('该排课已有课后反馈，不能直接删除');
  if(!isCancelled&&(ledger||[]).some(l=>l.scheduleId===scheduleId))throw new Error('该排课已有权益消耗记录，请先取消排课再删除');
}
function assertCanDeleteStudent(studentId,data){
  if(!studentId)return;
  const reasons=[];
  if((data.classes||[]).some(c=>parseArr(c.studentIds).includes(studentId)))reasons.push('班次');
  if((data.schedule||[]).some(s=>parseArr(s.studentIds).includes(studentId)))reasons.push('排课');
  if((data.plans||[]).some(p=>p.studentId===studentId))reasons.push('学习计划');
  if((data.purchases||[]).some(p=>p.studentId===studentId))reasons.push('购买记录');
  if((data.entitlements||[]).some(e=>e.studentId===studentId))reasons.push('课包余额');
  if((data.entitlementLedger||[]).some(l=>l.studentId===studentId))reasons.push('扣课记录');
  if((data.courts||[]).some(c=>c.studentId===studentId||parseArr(c.studentIds).includes(studentId)||normalizeCourtHistory(c.history).some(h=>h.studentId===studentId)))reasons.push('订场账户');
  if((data.feedbacks||[]).some(f=>f.studentId===studentId||parseArr(f.studentIds).includes(studentId)))reasons.push('课后反馈');
  if(reasons.length)throw new Error(`该学员不能直接删除：已关联${[...new Set(reasons)].join('、')}`);
}
function buildStudentCascadeDeletePlan(studentId,data={},now=new Date().toISOString()){
  const id=String(studentId||'').trim();
  const deletes={students:id?[id]:[],studentActiveEntitlementIndex:id?[id]:[],classes:[],schedule:[],plans:[],purchases:[],entitlements:[],entitlementLedger:[],membershipBenefitLedger:[],financialLedger:[],feedbacks:[]};
  const updates={classes:[],schedule:[],courts:[],leads:[],leadFollowups:[]};
  if(!id)return {deletes,updates};
  const touch=row=>({...row,updatedAt:now});
  const purchaseIds=new Set((data.purchases||[]).filter(row=>String(row?.studentId||'')===id).map(row=>String(row.id||'')).filter(Boolean));
  const entitlementIds=new Set((data.entitlements||[]).filter(row=>String(row?.studentId||'')===id||purchaseIds.has(String(row?.purchaseId||''))).map(row=>String(row.id||'')).filter(Boolean));
  const deletedScheduleIds=new Set();
  const studentNameById=new Map((data.students||[]).map(row=>[String(row?.id||''),String(row?.name||row?.studentName||'').trim()]));

  (data.classes||[]).forEach(row=>{
    const ids=parseArr(row?.studentIds).filter(Boolean);
    if(!ids.includes(id))return;
    const nextIds=ids.filter(sid=>sid!==id);
    if(nextIds.length)updates.classes.push(touch({...row,studentIds:nextIds}));
    else deletes.classes.push(row.id);
  });
  (data.schedule||[]).forEach(row=>{
    const ids=parseArr(row?.studentIds).filter(Boolean);
    const matches=ids.includes(id)||String(row?.studentId||'')===id;
    if(!matches)return;
    const nextIds=ids.filter(sid=>sid!==id);
    if(nextIds.length){
      updates.schedule.push(touch({
        ...row,
        studentId:nextIds[0]||'',
        studentIds:nextIds,
        expectedStudentIds:parseArr(row?.expectedStudentIds).filter(sid=>sid!==id),
        absentStudentIds:parseArr(row?.absentStudentIds).filter(sid=>sid!==id),
        studentName:nextIds.map(sid=>studentNameById.get(String(sid))||'').filter(Boolean).join('、')||row.studentName||''
      }));
    }else{
      deletes.schedule.push(row.id);
      deletedScheduleIds.add(String(row.id||''));
    }
  });
  deletes.plans=(data.plans||[]).filter(row=>String(row?.studentId||'')===id||deletes.classes.includes(row?.classId)).map(row=>row.id);
  deletes.purchases=[...purchaseIds];
  deletes.entitlements=[...entitlementIds];
  deletes.entitlementLedger=(data.entitlementLedger||[])
    .filter(row=>String(row?.studentId||'')===id||purchaseIds.has(String(row?.purchaseId||''))||entitlementIds.has(String(row?.entitlementId||''))||parseArr(row?.entitlementIds).some(entId=>entitlementIds.has(String(entId)))||deletedScheduleIds.has(String(row?.scheduleId||'')))
    .map(row=>row.id);
  deletes.membershipBenefitLedger=(data.membershipBenefitLedger||[]).filter(row=>String(row?.studentId||'')===id).map(row=>row.id);
  deletes.financialLedger=(data.financialLedger||[]).filter(row=>String(row?.userId||row?.studentId||'')===id||deletedScheduleIds.has(String(row?.sourceId||row?.scheduleId||''))).map(row=>row.id);
  deletes.feedbacks=(data.feedbacks||[]).filter(row=>String(row?.studentId||'')===id||parseArr(row?.studentIds).includes(id)||deletedScheduleIds.has(String(row?.scheduleId||''))).map(row=>row.id);
  (data.courts||[]).forEach(row=>{
    const ids=parseArr(row?.studentIds).filter(Boolean);
    const history=normalizeCourtHistory(row?.history);
    const nextIds=ids.filter(sid=>sid!==id);
    const nextHistory=history.filter(item=>String(item?.studentId||'')!==id);
    const linked=String(row?.studentId||'')===id||ids.includes(id)||history.length!==nextHistory.length;
    if(!linked)return;
    updates.courts.push(touch({...row,studentId:String(row?.studentId||'')===id?(nextIds[0]||''):row.studentId,studentIds:nextIds,history:nextHistory}));
  });
  (data.leads||[]).forEach(row=>{
    if(String(row?.studentId||'')!==id&&String(row?.studentMatchId||'')!==id)return;
    updates.leads.push(touch({...row,studentId:'',studentMatchId:'',studentName:'',studentMatchName:'',isCourseConverted:false}));
  });
  (data.leadFollowups||[]).forEach(row=>{
    if(String(row?.studentId||'')!==id)return;
    updates.leadFollowups.push(touch({...row,studentId:'',studentName:''}));
  });
  Object.keys(deletes).forEach(key=>{deletes[key]=[...new Set((deletes[key]||[]).map(value=>String(value||'')).filter(Boolean))];});
  return {deletes,updates};
}
async function deleteStudentCascade(studentId,{confirm='',user={}}={}){
  assertStudentWriteAccess(user);
  const id=String(studentId||'').trim();
  if(!id)throw new Error('缺少学员ID');
  if(confirm!=='DELETE_STUDENT_HISTORY')throw new Error('缺少删除确认');
  const student=await get(T_STUDENTS,id).catch(()=>null);
  if(!student)throw new Error('学员不存在');
  const [classes,schedule,plans,courts,feedbacks,purchases,entitlements,entitlementLedger,membershipBenefitLedger,financialLedger,leads,leadFollowups,students]=await Promise.all([
    scan(T_CLASSES).catch(()=>[]),
    scan(T_SCHEDULE).catch(()=>[]),
    scan(T_PLANS).catch(()=>[]),
    scan(T_COURTS).catch(()=>[]),
    scanFeedbacks().catch(()=>[]),
    scan(T_PURCHASES).catch(()=>[]),
    scan(T_ENTITLEMENTS).catch(()=>[]),
    scan(T_ENTITLEMENT_LEDGER).catch(()=>[]),
    scan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]),
    scan(T_FINANCIAL_LEDGER).catch(()=>[]),
    scan(T_LEADS).catch(()=>[]),
    scan(T_LEAD_FOLLOWUPS).catch(()=>[]),
    scan(T_STUDENTS).catch(()=>[])
  ]);
  const plan=buildStudentCascadeDeletePlan(id,{classes,schedule,plans,courts,feedbacks,purchases,entitlements,entitlementLedger,membershipBenefitLedger,financialLedger,leads,leadFollowups,students});
  await Promise.all([
    ...plan.updates.classes.map(row=>put(T_CLASSES,row.id,row)),
    ...plan.updates.schedule.map(row=>put(T_SCHEDULE,row.id,row)),
    ...plan.updates.courts.map(row=>put(T_COURTS,row.id,row)),
    ...plan.updates.leads.map(row=>put(T_LEADS,row.id,row)),
    ...plan.updates.leadFollowups.map(row=>put(T_LEAD_FOLLOWUPS,row.id,row))
  ]);
  await Promise.all([
    ...plan.deletes.feedbacks.map(rowId=>del(T_FEEDBACKS,rowId)),
    ...plan.deletes.entitlementLedger.map(rowId=>del(T_ENTITLEMENT_LEDGER,rowId)),
    ...plan.deletes.membershipBenefitLedger.map(rowId=>del(T_MEMBERSHIP_BENEFIT_LEDGER,rowId)),
    ...plan.deletes.financialLedger.map(rowId=>del(T_FINANCIAL_LEDGER,rowId)),
    ...plan.deletes.plans.map(rowId=>del(T_PLANS,rowId)),
    ...plan.deletes.schedule.map(rowId=>del(T_SCHEDULE,rowId)),
    ...plan.deletes.classes.map(rowId=>del(T_CLASSES,rowId)),
    ...plan.deletes.entitlements.map(rowId=>del(T_ENTITLEMENTS,rowId)),
    ...plan.deletes.purchases.map(rowId=>del(T_PURCHASES,rowId)),
    ...plan.deletes.studentActiveEntitlementIndex.map(rowId=>del(T_STUDENT_ACTIVE_ENTITLEMENT_INDEX,rowId).catch(()=>null)),
    del(T_STUDENTS,id)
  ]);
  return {success:true,deleted:plan.deletes,updated:plan.updates};
}
function assertStudentWriteAccess(user){
  if(user?.role!=='admin')throw new Error('无权限');
}
function assertCanDeleteCourt(court,data={}){
  const reasons=[];
  if(parseArr(court?.history).length)reasons.push('已存在财务流水');
  if(normalizeMoney(court?.balance)||normalizeMoney(court?.totalDeposit)||normalizeMoney(court?.spentAmount))reasons.push('仍有财务余额或累计金额');
  const courtId=String(court?.id||'').trim();
  if(courtId){
    if((data.membershipAccounts||[]).some(r=>String(r.courtId||'').trim()===courtId))reasons.push('已关联会员账户');
    if((data.membershipOrders||[]).some(r=>String(r.courtId||'').trim()===courtId))reasons.push('已关联会员订单');
    if((data.membershipBenefitLedger||[]).some(r=>String(r.courtId||'').trim()===courtId))reasons.push('已关联权益流水');
    if((data.membershipAccountEvents||[]).some(r=>String(r.courtId||'').trim()===courtId))reasons.push('已关联账户事件');
  }
  if(reasons.length)throw new Error(`该客户不能直接删除：${[...new Set(reasons)].join('、')}`);
}
function courtDeleteAction(court,data={}){
  try{
    assertCanDeleteCourt(court,data);
    return 'delete';
  }catch(e){
    return 'archive';
  }
}
function assertCanDeleteCampus(campusId,data={}){
  const id=String(campusId||'').trim();
  if(!id)return;
  const used=
    (data.students||[]).some(r=>String(r.campus||'').trim()===id)||
    (data.coaches||[]).some(r=>String(r.campus||'').trim()===id)||
    (data.classes||[]).some(r=>String(r.campus||'').trim()===id)||
    (data.schedule||[]).some(r=>String(r.campus||'').trim()===id)||
    (data.courts||[]).some(r=>String(r.campus||'').trim()===id)||
    (data.packages||[]).some(r=>parseArr(r.campusIds).some(c=>String(c||'').trim()===id))||
    (data.entitlements||[]).some(r=>parseArr(r.campusIds).some(c=>String(c||'').trim()===id));
  if(used)throw new Error('该校区已有学员、教练、班次、排课、课包或权益关联，不能直接删除');
}
const RECENT_MEMBERSHIP_ORDER_TTL_MS=60000;
const recentMembershipOrderRequests=new Map();
function membershipOrderRequestDedupKey({courtId,membershipPlanId,purchaseDate,rechargeAmount,requestKey=''}={}){
  const cleanRequestKey=String(requestKey||'').trim();
  if(cleanRequestKey)return `request:${cleanRequestKey}`;
  return `payload:${String(courtId||'')}|${String(membershipPlanId||'')}|${String(purchaseDate||'')}|${normalizeMoney(rechargeAmount)}`;
}
function reserveRecentMembershipOrderRequest(input={},now=new Date().toISOString()){
  const key=membershipOrderRequestDedupKey(input);
  const nowMs=dateMs(now);
  for(const [requestKey,ts] of recentMembershipOrderRequests.entries()){
    if(!Number.isFinite(nowMs)||!Number.isFinite(ts)||Math.abs(nowMs-ts)>RECENT_MEMBERSHIP_ORDER_TTL_MS)recentMembershipOrderRequests.delete(requestKey);
  }
  const existingAt=recentMembershipOrderRequests.get(key);
  if(Number.isFinite(existingAt)&&Number.isFinite(nowMs)&&Math.abs(nowMs-existingAt)<=RECENT_MEMBERSHIP_ORDER_TTL_MS)return null;
  recentMembershipOrderRequests.set(key,Number.isFinite(nowMs)?nowMs:Date.now());
  return key;
}
function releaseRecentMembershipOrderRequest(key,{keep=false}={}){
  if(!key)return;
  if(!keep)recentMembershipOrderRequests.delete(key);
}
function shouldMigrateLegacyCourtFinance(court){
  return !normalizeCourtHistory(court?.history).length&&(
    normalizeMoney(court?.balance)>0||
    normalizeMoney(court?.totalDeposit)>0||
    normalizeMoney(court?.spentAmount)>0
  );
}
async function loadCourtDeleteReferenceData(){
  const [membershipAccounts,membershipOrders,membershipBenefitLedger,membershipAccountEvents]=await Promise.all([
    getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]),
    getCachedScan(T_MEMBERSHIP_ORDERS).catch(()=>[]),
    getCachedScan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]),
    getCachedScan(T_MEMBERSHIP_ACCOUNT_EVENTS).catch(()=>[])
  ]);
  return {membershipAccounts,membershipOrders,membershipBenefitLedger,membershipAccountEvents};
}
async function deleteCourtsByIds(ids,data={}){
  const uniqueIds=[...new Set((ids||[]).map(id=>String(id||'').trim()).filter(Boolean))];
  const courts=await getCachedScan(T_COURTS).catch(()=>[]);
  const courtMap=new Map((courts||[]).map(c=>[String(c.id||''),c]));
  const deleted=[],archived=[],errors=[];
  for(let i=0;i<uniqueIds.length;i+=25){
    const chunk=uniqueIds.slice(i,i+25);
    const results=await Promise.all(chunk.map(async(id)=>{
      try{
        const court=courtMap.get(id)||null;
        if(!court)return {id,ok:false,error:'订场用户不存在'};
        const action=courtDeleteAction(court,data);
        if(action==='delete'){
          await del(T_COURTS,id);
          return {id,ok:true,action};
        }
        const now=new Date().toISOString();
        await put(T_COURTS,id,{...court,status:'inactive',deletedAt:court.deletedAt||now,updatedAt:now});
        return {id,ok:true,action};
      }catch(e){
        return {id,ok:false,error:e.message};
      }
    }));
    results.forEach(r=>{
      if(!r.ok){errors.push({id:r.id,error:r.error});return;}
      if(r.action==='archive')archived.push(r.id);
      else deleted.push(r.id);
    });
  }
  return {success:deleted.length,archivedCount:archived.length,failed:errors.length,deleted,archived,errors};
}
async function clearAllCourts(){
  const existing=await getCachedScan(T_COURTS);
  for(let i=0;i<existing.length;i+=20)await Promise.all(existing.slice(i,i+20).map(r=>del(T_COURTS,r.id)));
  return existing.length;
}
async function importCourtRows(rows){
  const schedules=await getCachedScan(T_SCHEDULE).catch(()=>[]);
  let success=0,failed=0;
  const errors=[];
  for(const row of rows){
    try{
      const id=uuidv4();
      const record={...normalizeCourtRecord(row,{schedules}),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      await put(T_COURTS,id,record);
      success++;
    }catch(e){
      failed++;
      errors.push({name:row?.name||'',error:e.message});
    }
  }
  return {success,failed,errors};
}
async function runMembershipReconcile(rows){
  const accounts=Array.isArray(rows?.accounts)?rows.accounts:await getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]);
  const courts=Array.isArray(rows?.courts)?rows.courts:await getCachedScan(T_COURTS).catch(()=>[]);
  const result=reconcileMembershipAccounts({accounts,courts});
  const accountMap=new Map((accounts||[]).map(a=>[a.id,a]));
  const changedAccounts=result.accounts.filter(a=>JSON.stringify(a)!==JSON.stringify(accountMap.get(a.id)));
  for(const account of changedAccounts)await put(T_MEMBERSHIP_ACCOUNTS,account.id,account);
  const courtMap=new Map((courts||[]).map(c=>[c.id,c]));
  for(const row of result.historyRows){
    const court=courtMap.get(row.courtId);
    if(!court)continue;
    const history=[...normalizeCourtHistory(court.history),row];
    const next=normalizeCourtRecord({...court,history,updatedAt:new Date().toISOString()});
    await put(T_COURTS,court.id,next);
    courtMap.set(court.id,next);
  }
  for(const event of result.events)await put(T_MEMBERSHIP_ACCOUNT_EVENTS,event.id,event);
  return {...result,accounts:result.accounts,courts:[...courtMap.values()]};
}
function parseLegacyCourtNotes(notes){
  const raw=String(notes||'').trim();
  if(!raw)return{notes:'',updates:{},changed:false};
  const parts=raw.split(/[；;]\s*/).map(x=>String(x||'').trim()).filter(Boolean);
  const remain=[];
  const updates={};
  for(const part of parts){
    const m=part.match(/^([^：:]+)[：:]\s*(.+)$/);
    if(!m){remain.push(part);continue;}
    const key=String(m[1]||'').trim();
    const value=String(m[2]||'').trim();
    if(!value)continue;
    if(key==='序号')continue;
    if((key==='负责人'||key==='对接人')&&!updates.owner)updates.owner=value;
    else if((key==='对储值的态度'||key==='对储值态度')&&!updates.depositAttitude)updates.depositAttitude=value;
    else if(key==='熟悉程度'&&!updates.familiarity)updates.familiarity=value;
    else if((key==='消费金额'||key==='消费金额（仅自己订场部分）')&&updates.spentAmount==null){
      const amt=parseFloat(String(value).replace(/[^\d.-]/g,''));
      if(!Number.isNaN(amt))updates.spentAmount=amt;
    }else remain.push(part);
  }
  const nextNotes=remain.join('；');
  const changed=nextNotes!==raw||Object.keys(updates).length>0;
  return {notes:nextNotes,updates,changed};
}

module.exports = async (req, res) => {
  const path=(req.url||'').replace(/^\/api/,'').split('?')[0];
  const method=req.method;
  const startedAt=Date.now();
  if(res&&typeof res.on==='function')res.on('finish',()=>{console.log(`[api] ${method} ${path} ${res.statusCode} ${Date.now()-startedAt}ms`);});
  if(req.method==='OPTIONS'){applyCorsHeaders(req,res);return res.status(200).end();}
  if(path==='/health'&&method==='GET'){
    console.log('[health] GET bypass scheduleInitInBackground');
    return sendJson(res,{status:'ok',time:new Date().toISOString()});
  }
  if(path==='/campuses'&&method==='GET'){
    console.log('[campuses] GET bypass scheduleInitInBackground');
    return sendJson(res,DEFAULT_CAMPUSES);
  }
  if(path==='/match-diag'&&method==='GET'){
    if(!requireDiagnosticsAccess(req,res))return;
    return handleMatchDiag({res,sendJson,safeDatabaseUrlHost,MATCH_DATABASE_URL,getMatchSqlPool});
  }
  if(path==='/diag'&&method==='GET'){
    if(!requireDiagnosticsAccess(req,res))return;
    return handleTableStoreDiag({res,sendJson,gc,isProductionRuntime,listCampusesWithDefaults,cappedScan,tables:{T_CAMPUSES,T_STUDENTS,T_COURTS,T_MEMBERSHIP_ACCOUNTS,T_COACHES,T_PRICE_PLANS}});
  }
  if(path==='/diag2'&&method==='GET'){
    const result = { log: [] };
    const tStart = Date.now();
    try {
      await new Promise((res, rej) => {
        let pages = 0;
        function f(sk) {
          result.log.push(`Page ${pages+1} starting, sk: ` + !!sk);
          gc().getRange({
            tableName: T_STUDENTS,
            direction: TableStore.Direction.FORWARD,
            inclusiveStartPrimaryKey: sk || [{ id: TableStore.INF_MIN }],
            exclusiveEndPrimaryKey: [{ id: TableStore.INF_MAX }],
            maxVersions: 1,
            limit: 20
          }, (e, d) => {
            if (e) return rej(e);
            pages++;
            const pRows = (d.rows || []);
            result.log.push(`Page ${pages} fetched ${pRows.length} rows.`);
            if (pRows.length > 0) {
              result.log.push(`First: ${pRows[0].primaryKey[0].value}, Last: ${pRows[pRows.length-1].primaryKey[0].value}`);
            }
            const nextStartPrimaryKey = d.nextStartPrimaryKey ? d.nextStartPrimaryKey.map(pk => ({ [pk.name]: pk.value })) : null;
            result.log.push(`Next token exists: ${!!nextStartPrimaryKey}, content: ${JSON.stringify(nextStartPrimaryKey)}`);
            if (pages > 15) {
              result.log.push("ABORTING INFINITE LOOP!");
              return res();
            }
            nextStartPrimaryKey ? f(nextStartPrimaryKey) : res();
          });
        }
        f();
      });
      result.ms = Date.now() - tStart;
      result.status = 'ok';
    } catch(e) {
      result.status = 'error';
      result.error = String(e);
    }
    return sendJson(res, result);
  }
  scheduleInitInBackground();
  const query=new URL(req.url||'/', 'http://local').searchParams;
  const body=req.body||{};
  try{
    if(path==='/health')return sendJson(res,{status:'ok',time:new Date().toISOString()});
    if((path==='/official-account/callback'||path==='/wechat/official-callback')&&method==='GET'){
      try{
        return sendPlainText(res,verifyOfficialAccountCallbackRequest(query),200);
      }catch(err){
        return sendPlainText(res,String(err?.message||'invalid'),401);
      }
    }
    if((path==='/official-account/callback'||path==='/wechat/official-callback')&&method==='POST'){
      try{
        await init();
        const rawBody=await readRequestText(req);
        const callback=await processOfficialAccountCallbackRequest({query,rawBody});
        if(callback.encrypted){
          return sendXml(res,buildWechatOfficialAccountEncryptedReplyXml({
            plainXml:callback.plainReply,
            token:WECHAT_OFFICIAL_ACCOUNT_TOKEN,
            timestamp:query.get('timestamp')||'',
            nonce:query.get('nonce')||'',
            encodingAesKey:WECHAT_OFFICIAL_ACCOUNT_ENCODING_AES_KEY,
            appId:WECHAT_OFFICIAL_ACCOUNT_APPID
          }),200);
        }
        return sendXml(res,callback.plainReply,200);
      }catch(err){
        return sendPlainText(res,String(err?.message||'invalid'),400);
      }
    }
    if(path==='/student-reminder-bind/oauth-url'&&method==='GET'){
      const tokenValue=String(query.get('token')||'').trim();
      const redirectUri=String(query.get('redirectUri')||'').trim();
      if(!tokenValue)return sendJson(res,{error:'缺少绑定码'},400);
      if(!redirectUri)return sendJson(res,{error:'缺少回跳地址'},400);
      if(!WECHAT_OFFICIAL_ACCOUNT_APPID)return sendJson(res,{error:'缺少服务号 AppID 配置'},500);
      return sendJson(res,{authorizeUrl:buildOfficialAccountOAuthUrl({redirectUri,state:tokenValue})});
    }
    if(path==='/student-reminder-bind/complete'&&method==='POST'){
      await init();
      const tokenValue=String(body.token||'').trim();
      const code=String(body.code||'').trim();
      if(!tokenValue)return sendJson(res,{error:'缺少绑定码'},400);
      if(!code)return sendJson(res,{error:'缺少微信授权码'},400);
      const rows=await getCachedScan(T_STUDENTS).catch(()=>[]);
      const openid=await fetchOfficialAccountOAuthOpenId(code);
      const bindTarget=findStudentReminderBindTarget(rows,tokenValue,openid);
      const student=bindTarget.student;
      if(!student)return sendJson(res,{error:'这条绑定链接已经不能使用了，请联系教练重新发一条新的链接。'},404);
      let officialAccountSubscribed=false;
      try{
        officialAccountSubscribed=await fetchOfficialAccountSubscribeStatus(openid);
      }catch(e){
        console.warn('student reminder subscribe status skipped:',e.message);
      }
      if(bindTarget.alreadyBound){
        return sendJson(res,{success:true,alreadyBound:true,officialAccountSubscribed,student:{id:student.id,name:student.name||'',officialAccountBound:true,officialAccountBoundAt:student.officialAccountBoundAt||'',officialAccountReminderMode:normalizeStudentReminderMode(student.officialAccountReminderMode),officialAccountReminderCustomHours:normalizeStudentReminderCustomHours(student.officialAccountReminderCustomHours)}});
      }
      const now=new Date().toISOString();
      const next=buildStudentOfficialAccountBoundUpdate(student,openid,now);
      await put(T_STUDENTS,student.id,next);
      return sendJson(res,{success:true,alreadyBound:false,officialAccountSubscribed,student:{id:next.id,name:next.name||'',officialAccountBound:true,officialAccountBoundAt:now,officialAccountReminderMode:next.officialAccountReminderMode,officialAccountReminderCustomHours:next.officialAccountReminderCustomHours}});
    }
    if(path==='/cron/course-reminders'&&method==='GET'){
      const ua=String(req.headers['user-agent']||'');
      if(process.env.CRON_SECRET){
        const auth=String(req.headers.authorization||'');
        if(auth!==`Bearer ${process.env.CRON_SECRET}`)return sendJson(res,{error:'无权限'},403);
      }else if(!/vercel-cron/i.test(ua)){
        return sendJson(res,{error:'无权限'},403);
      }
      await init();
      return sendJson(res,await sendCourseReminders());
    }
    if(path==='/cron/official-account-reminders'&&method==='GET'){
      const ua=String(req.headers['user-agent']||'');
      if(process.env.CRON_SECRET){
        const auth=String(req.headers.authorization||'');
        if(auth!==`Bearer ${process.env.CRON_SECRET}`)return sendJson(res,{error:'无权限'},403);
      }else if(!/vercel-cron/i.test(ua)){
        return sendJson(res,{error:'无权限'},403);
      }
      await init();
      return sendJson(res,await sendOfficialAccountReminderJobs());
    }
    if(path==='/cron/official-account-daily-digests'&&method==='GET'){
      const ua=String(req.headers['user-agent']||'');
      if(process.env.CRON_SECRET){
        const auth=String(req.headers.authorization||'');
        if(auth!==`Bearer ${process.env.CRON_SECRET}`)return sendJson(res,{error:'无权限'},403);
      }else if(!/vercel-cron/i.test(ua)){
        return sendJson(res,{error:'无权限'},403);
      }
      await init();
      return sendJson(res,await sendOfficialAccountDailyDigests());
    }
    if(path==='/cron/feishu-daily-report'&&method==='GET'){
      const ua=String(req.headers['user-agent']||'');
      if(process.env.CRON_SECRET){
        const auth=String(req.headers.authorization||'');
        if(auth!==`Bearer ${process.env.CRON_SECRET}`)return sendJson(res,{error:'无权限'},403);
      }else if(!/vercel-cron/i.test(ua)){
        return sendJson(res,{error:'无权限'},403);
      }
      await init();
      return sendJson(res,await sendFeishuDailyScheduleReport());
    }
    if(path==='/cron/feishu-coach-daily-digests'&&method==='GET'){
      const ua=String(req.headers['user-agent']||'');
      if(process.env.CRON_SECRET){
        const auth=String(req.headers.authorization||'');
        if(auth!==`Bearer ${process.env.CRON_SECRET}`)return sendJson(res,{error:'无权限'},403);
      }else if(!/vercel-cron/i.test(ua)){
        return sendJson(res,{error:'无权限'},403);
      }
      await init();
      return sendJson(res,await sendFeishuCoachDailyDigests());
    }
    if(await handleAuthRoutes({path,method,body,req,user:null,res}))return;
    if(await handleMatchRoutes({path,method,body,req,res,query}))return;
    let user=authUser(req);if(!user)return sendJson(res,{error:'未登录'},401);
    if(user.type==='match_user')return sendJson(res,{error:'无管理端权限'},403);
    const storedAuthUser=await getCachedRow(T_USERS,user.id).catch(()=>null);
    user=mergeStoredAuthUser(user,storedAuthUser);
    try{assertAuthUserActive(user);}catch(e){return sendJson(res,{error:e.message},403);}
    if(await handlePackageBoardRoutes({path,method,body,user,res}))return;
    if(await handleMatchRoutes({path,method,body,req,res,user,query}))return;
    if(await handleAdminUserRoutes({path,method,body,user,res}))return;
    if(await handleAdminToolRoutes({path,method,body,user,res}))return;
    if(path==='/admin/replace-courts'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const cleared=await clearAllCourts();
      const rows=Array.isArray(body.rows)?body.rows:[];
      const result=await importCourtRows(rows);
      return sendJson(res,{cleared,...result});
    }
    if(path==='/admin/clear-courts'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const cleared=await clearAllCourts();
      return sendJson(res,{cleared});
    }
    if(path==='/admin/import-courts'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const rows=Array.isArray(body.rows)?body.rows:[];
      return sendJson(res,await importCourtRows(rows));
    }
    if(await handleAuthRoutes({path,method,body,req,user,res}))return;
    if(path==='/load-all'&&method==='GET'){
      await init();
      const [rawCourts,students,products,packages,purchases,entitlements,entitlementLedger,financialLedger,membershipPlans,membershipAccounts,membershipOrders,membershipBenefitLedger,membershipAccountEvents,pricePlans,plans,schedule,coaches,classes,campuses,feedbacks,coachProposals]=await Promise.all([
        timed('load-all scan courts',()=>cappedScan(T_COURTS)),
        timed('load-all scan students',()=>cappedScan(T_STUDENTS)),
        timed('load-all scan products',()=>cappedScan(T_PRODUCTS)),
        timed('load-all scan packages',()=>cappedScan(T_PACKAGES)),
        timed('load-all scan purchases',()=>cappedScan(T_PURCHASES)),
        timed('load-all scan entitlements',()=>cappedScan(T_ENTITLEMENTS)),
        timed('load-all scan entitlement ledger',()=>cappedScan(T_ENTITLEMENT_LEDGER)),
        timed('load-all scan financial ledger',()=>cappedScan(T_FINANCIAL_LEDGER)),
        timed('load-all scan membership plans',()=>cappedScan(T_MEMBERSHIP_PLANS)),
        timed('load-all scan membership accounts',()=>cappedScan(T_MEMBERSHIP_ACCOUNTS)),
        timed('load-all scan membership orders',()=>cappedScan(T_MEMBERSHIP_ORDERS)),
        timed('load-all scan membership benefit ledger',()=>cappedScan(T_MEMBERSHIP_BENEFIT_LEDGER)),
        timed('load-all scan membership account events',()=>cappedScan(T_MEMBERSHIP_ACCOUNT_EVENTS)),
        timed('load-all scan price plans',()=>cappedScan(T_PRICE_PLANS)),
        timed('load-all scan plans',()=>cappedScan(T_PLANS)),
        timed('load-all scan schedule',()=>cappedScan(T_SCHEDULE, PRODUCTION_PAGE_READ_LIMITS.schedule)),
        timed('load-all scan coaches',()=>cappedScan(T_COACHES)),
        timed('load-all scan classes',()=>cappedScan(T_CLASSES)),
        timed('load-all scan campuses',()=>listCampusesWithDefaults()),
        timed('load-all scan feedbacks',()=>cappedScan(T_FEEDBACKS)),
        timed('load-all scan coach proposals',()=>scanCoachProposals())
      ]);
      const normalizedMembershipPlans=(Array.isArray(membershipPlans)?membershipPlans:[]).map(normalizeMembershipPlanViewRecord);
      const membershipPlanMap=new Map(normalizedMembershipPlans.map(p=>[p.id,p]));
      const normalizedMembershipOrders=(Array.isArray(membershipOrders)?membershipOrders:[]).map(order=>normalizeMembershipOrderViewRecord(order,membershipPlanMap.get(order.membershipPlanId)));
      const reconciled=await runMembershipReconcile({accounts:membershipAccounts,courts:rawCourts});
      const courts=reconciled.courts||rawCourts;
      const loaded=filterLoadAllForUser({
        courts:Array.isArray(courts)?courts:[],
        students:Array.isArray(students)?students:[],
        products:Array.isArray(products)?products:[],
        packages:Array.isArray(packages)?packages:[],
        purchases:Array.isArray(purchases)?purchases:[],
        entitlements:Array.isArray(entitlements)?entitlements:[],
        entitlementLedger:normalizeEntitlementLedgerRowsForDetailView(Array.isArray(entitlementLedger)?entitlementLedger:[]),
        financialLedger:Array.isArray(financialLedger)?financialLedger:[],
        membershipPlans:normalizedMembershipPlans,
        membershipAccounts:Array.isArray(reconciled.accounts)?reconciled.accounts:[],
        membershipOrders:normalizedMembershipOrders,
        membershipBenefitLedger:Array.isArray(membershipBenefitLedger)?membershipBenefitLedger:[],
        membershipAccountEvents:[...(Array.isArray(membershipAccountEvents)?membershipAccountEvents:[]),...(reconciled.events||[])],
        pricePlans:Array.isArray(pricePlans)?pricePlans:[],
        plans:Array.isArray(plans)?plans:[],
        schedule:Array.isArray(schedule)?schedule:[],
        coaches:Array.isArray(coaches)?coaches:[],
        classes:Array.isArray(classes)?classes:[],
        campuses:Array.isArray(campuses)?campuses:[],
        feedbacks:Array.isArray(feedbacks)?feedbacks:[],
        coachProposals:Array.isArray(coachProposals)?coachProposals:[]
      },user);
      const customerLifecycleRows=buildCustomerLifecycleRows(loaded);
      return sendJson(res,{...loaded,user,customerLifecycleRows});
    }
    if(path==='/price-plans'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET')return sendJson(res,await getCachedScan(T_PRICE_PLANS).catch(()=>[]));
      if(method==='POST'){
        const id=uuidv4();
        const now=new Date().toISOString();
        const r=normalizePricePlan({...body,id},id,now);
        await put(T_PRICE_PLANS,id,r);
        return sendJson(res,r);
      }
    }
    if(path==='/price-plans/quote'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      return sendJson(res,quoteVenuePrice(await getCachedScan(T_PRICE_PLANS).catch(()=>[]),body));
    }
    const pricePlanM=path.match(/^\/price-plans\/(.+)$/);
    if(pricePlanM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const id=pricePlanM[1];
      if(method==='GET')return sendJson(res,await getCachedRow(T_PRICE_PLANS,id));
      const old=await getCachedRow(T_PRICE_PLANS,id).catch(()=>null);
      if(!old)return sendJson(res,{error:'价格方案不存在'},404);
      if(method==='PUT'){
        const r=normalizePricePlan({...old,...body,id},id,new Date().toISOString(),old);
        await put(T_PRICE_PLANS,id,r);
        return sendJson(res,r);
      }
      if(method==='DELETE'){
        const r={...old,status:'inactive',updatedAt:new Date().toISOString()};
        await put(T_PRICE_PLANS,id,r);
        return sendJson(res,{success:true,archived:true,pricePlan:r});
      }
    }
    if(await handleCourtRoutes({path,method,body,user,res}))return;if(await handleMembershipRoutes({path,method,body,user,res,query}))return;
    if(await handleStudentRoutes({path,method,body,user,res}))return;
    if(path==='/init-data'&&method==='POST'){if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);await init();const ss=body.students||[];for(const s of ss)await put(T_STUDENTS,s.id||uuidv4(),{...s,updatedAt:new Date().toISOString()});return sendJson(res,{success:true,count:ss.length});}
    if(await handleProductRoutes({path,method,body,user,res}))return;
    if(await handlePackageRoutes({path,method,body,user,res}))return;
    if(await handlePurchaseEntitlementRoutes({path,method,body,user,res,query}))return;
    if(await handleCoachProposalRoutes({path,method,body,user,res}))return;
    if(await handleFeedbackRoutes({path,method,body,user,res}))return;
    if(await handleScheduleRoutes({path,method,body,user,res}))return;
    if(await handleCoachRoutes({path,method,body,user,res}))return;
    if(await handleCorePageDataRoutes({path,method,user,res}))return;
    if(await handleResidualPageDataRoutes({path,method,user,res,query}))return;
    if(await handleLeadsRoutes({path,method,body,user,res,query}))return;
    if(await handleCampusRoutes({path,method,body,user,res}))return;
    return sendJson(res,{error:'Not found'},404);
  }catch(e){console.error('API error:',e);return sendJson(res,{error:e.message},500);}
};

module.exports._test={
  MEMBERSHIP_TABLES,
  TEST_DATA_RESET_TABLES,
  extractLeadPhoneMeta,
  deriveLeadSystemStatus,
  deriveLeadDealType,
  deriveLeadConversionType,
  normalizeLeadRecord,
  normalizeLeadFollowupRecord,
  applyLeadFollowupSnapshot,
  applyLeadFollowupsSnapshot,
  normalizeLeadImportRows,
  buildLeadInitialFollowup,
  buildLeadDedupKey,
  normalizeLeadIdentityName,
  dedupeLeadRows,
  leadCanonicalNameKey,
  mergeLeadRows,
  mergeDuplicateLeadRows,
  buildLeadImportPreviewRows,
  leadImportPreviewSummary,
  matchLeadToStudent,
  matchLeadToCourt,
  buildLeadStudentRecord,
  buildLeadCourtRecord,
  scheduleLessonDelta,
  effectiveScheduleStatus,
  scheduleLessonChargeStatus,
  isScheduleLessonCharged,
  normalizeCoachLateInfo,
  buildCoachLateSettlementRows,
  smallGroupLessonCountForStudentCount,
  assertSmallGroupScheduleRules,
  assertClassSchedulable,
  assertLessonCapacity,
  validateScheduleConflicts,
  validateCourtBookingConflicts,
  buildOperationTrace,
  withOperationTrace,
  stampCourtHistoryOperationTrace,
  buildEntitlementFromPurchase,
  buildPurchaseRecord,
  validateProductInput,
  normalizeProductRecord,
  validatePackageInput,
  normalizePackageRecord,
  validatePurchaseInputForPackage,
  assertCanEditProductWithReferences,
  assertCanEditPackageWithPurchases,
  buildPackageDeactivateUpdate,
  syncSoldPackageRuleSnapshots,
  assertCanMergePackages,
  buildPackageMergeUpdates,
  assertCanEditPurchaseWithLedger,
  assertScheduleEntitlementRequired,
  scheduleParticipantSummary,
  collectMabaoSeedStaleRowIds,
  collectMabaoSeedImportedLedgerReplacementIds,
  collectDuplicateImportedLedgerIds,
  normalizeEntitlementLedgerRowsForView,
  normalizeEntitlementLedgerRowsForDetailView,
  syncEntitlementFromPurchase,
  writePurchaseAndEntitlementAtomic,
  scheduleStoredValuePaymentAmount,
  resolveScheduleStoredValueCourt,
  buildScheduleStoredValueHistoryRow,
  buildScheduleStoredValueCourtUpdate,
  validateEntitlementForSchedule,
  recommendEntitlements,
  normalizeCampusValue,
  displayCampusName,
  scheduleNotifyLocation,
  buildCoachDailyDigestMessage,
  scheduleEntitlementDeltas,
  resolveScheduleEntitlementDeltas,
  applyEntitlementLessonDelta,
  userCanManageManualEntitlementAdjustment,
  validateManualEntitlementAdjustment,
  buildManualEntitlementLedgerRecord,
  diffScheduleEntitlementDeltas,
  assertScheduleEditableAfterFeedback,
  isScheduleInsideDailyTimeWindows,
  scheduleEntitlementDelta,
  collectScheduleRiskWarnings,
  buildFeedbackRecord,
  assertCanWriteFeedback,
  buildFeedbackRecord,
  feedbackScopeForSchedule,
  assertCanWriteSchedule,
  filterLoadAllForUser,
  buildWorkbenchStats,
  resolveWorkbenchState,
  decorateWorkbenchClasses,
  decorateWorkbenchStudents,
  decorateWorkbenchFeedbacks,
  workbenchLessonUnits,
  buildCoachRenameUpdates,
  buildStudentIdentityUpdates,
  buildProductRenameDisplayUpdates,
  assertCanDeleteCoachName,
  assertUniqueCoachName,
  assertAuthUserActive,
  mergeStoredAuthUser,
  userMatchPermissions,
  requireMatchAdminPermission,
  buildWechatCode2SessionUrl,
  extractWechatOpenId,
  buildWechatBoundUser,
  buildWechatUnboundUser,
  buildAdminUserView,
  buildWechatAccessTokenUrl,
  buildWechatSignature,
  buildOfficialAccountOAuthUrl,
  buildOfficialAccountOAuthTokenUrl,
  extractOfficialAccountOAuthOpenId,
  decryptWechatOfficialAccountMessage,
  resolveOfficialAccountCallbackEcho,
  encryptWechatOfficialAccountMessage,
  parseWechatOfficialAccountXml,
  buildWechatOfficialAccountTextReplyXml,
  buildWechatOfficialAccountEncryptedReplyXml,
  extractOfficialAccountBindingPhone,
  findOfficialAccountUserByPhone,
  bindOfficialAccountUserByPhone,
  readRequestText,
  processOfficialAccountCallbackRequest,
  extractWechatAccessToken,
  fetchWechatPhoneNumber,
  buildOfficialAccountBoundUser,
  buildOfficialAccountUnboundUser,
  findWechatScheduleRecipient,
  findWechatUserByOpenId,
  findOfficialAccountScheduleRecipient,
  normalizeOfficialAccountQueryChoice,
  normalizeOfficialAccountScheduleQueryText,
  parseOfficialAccountScheduleQuery,
  buildOfficialAccountQuerySessionRow,
  loadOfficialAccountQuerySession,
  saveOfficialAccountQuerySession,
  deleteOfficialAccountQuerySession,
  findOfficialAccountCoachByOpenId,
  findOfficialAccountStudentByOpenId,
  formatOfficialAccountQueryScheduleTime,
  scheduleMatchesCoachForOfficialAccount,
  scheduleMatchesStudentForOfficialAccount,
  buildOfficialAccountScheduleQueryReply,
  buildScheduleSubscribeMessage,
  buildScheduleNotificationUpdate,
  collectCourseReminderCandidates,
  buildPreviousCourseFeedbackSummary,
  buildCourseReminderSubscribeMessage,
  buildOfficialAccountCourseReminderMessage,
  collectCoachFeedbackReminderCandidates,
  buildOfficialAccountCoachFeedbackReminderMessage,
  buildStudentReminderBindToken,
  buildStudentReminderLinkUpdate,
  buildStudentOfficialAccountBoundUpdate,
  buildStudentOfficialAccountUnboundUpdate,
  normalizeStudentReminderMode,
  normalizeStudentReminderCustomHours,
  findStudentReminderBindTarget,
  collectStudentCourseReminderCandidates,
  formatOfficialAccountTemplateTime,
  studentReminderStageText,
  buildStudentCourseReminderMessage,
  collectCoachDailyDigestCandidates,
  buildCoachDailyDigestMessage,
  buildFeishuCoachDailyDigestText,
  findFeishuCoachDigestRecipient,
  fetchFeishuTenantAccessToken,
  resolveFeishuOpenIdsByMobiles,
  sendFeishuBotTextMessage,
  buildOfficialAccountDigestTemplatePayload,
  resolveOfficialAccountSendMode,
  extractOfficialAccountSubscribeStatus,
  fetchOfficialAccountSubscribeStatus,
  sendOfficialAccountTemplateMessage,
  sendOfficialAccountCourseReminders,
  sendOfficialAccountCoachFeedbackReminders,
  sendOfficialAccountStudentCourseReminders,
  sendOfficialAccountReminderJobs,
  sendOfficialAccountDailyDigests,
  sendFeishuCoachDailyDigests,
  sendFeishuDailyScheduleReport,
  normalizeVenue,
  rangesOverlap,
  computeCourtFinance,
  summarizeCourtFinanceRevenue,
  buildMatchFinanceDailyReport,
  buildMatchCourtFinanceHistoryRow,
  buildMatchCourtFinanceRefundRow,
  normalizePricePlan,
  assertPricePlanInput,
  quoteVenuePrice,
  normalizeMembershipBenefitTemplate,
  buildMembershipPlanRecord,
  buildMembershipPurchase,
  summarizeMembershipBenefits,
  isDuplicateMembershipOrderSubmission,
  buildMembershipAccountEventRecord,
  buildMembershipBenefitLedgerRecord,
  buildStudentBenefitLedgerRecord,
  summarizeStudentBenefits,
  buildMembershipGrantLedgerRows,
  allocateMembershipBenefitUsage,
  reconcileMembershipAccounts,
  mergeCourtRecords,
  normalizeMembershipPlanViewRecord,
  normalizeMembershipOrderViewRecord,
  isTransientStorageError,
  normalizeCourtRecord,
  buildLegacyCourtOpeningHistory,
  legacyCourtFinanceWarnings,
  extractDepositAmountFromText,
  importCourtRows,
  assertCanDeleteProduct,
  assertCanDeletePackage,
  assertCanVoidPurchase,
  assertCanDeleteEntitlement,
  assertStudentWriteAccess,
  assertCanDeleteSchedule,
  assertCanDeleteStudent,
  buildStudentCascadeDeletePlan,
  assertCanDeleteCourt,
  courtDeleteAction,
  assertCanDeleteCampus,
  deleteCourtsByIds,
  buildFinanceUnifiedRows,
  buildFinanceSettlementRows,
  buildFinancePageSnapshot,
  buildVerifiedFinanceWithImportIncrements,
  buildBootstrapSafetyFlags,
  getRuntimeEnsuredTables,
  getTestDataResetTables,
  clearTables
  ,MATCH_SQL_TABLES
  ,getMatchSqlPool
  ,requireAdminUser
  ,requireMatchUser
  ,canMatchUserCreateByAdminUser
  ,ensureMatchUserResponse
  ,canMatchUserCreateByAdminUser
  ,buildMatchUserToken
  ,assertMatchPostInput
  ,normalizeMatchType
  ,matchTimelineStatus
  ,deriveMatchStatus
  ,splitAaFee
  ,registerMatchUser
  ,toMatchView
  ,toMatchDetailResponse
  ,matchStatusText
  ,assertMatchBookingInput
  ,assertBookedWithdrawalInput
  ,assertMatchFeeSplitUpdateInput
  ,getMatchSettings
  ,saveMatchSettings
  ,assertMatchReplacementTransferInput
  ,assertMatchTechnicalRatingInput
  ,buildMatchTechnicalRatingSummary
  ,safeDatabaseUrlHost
  ,resolveMatchPrepayClosure
  ,resolveFinalAttendanceStatus
  ,buildMatchFeeLedger
  ,creatorAttendanceDeadline
  ,listMatchesForViewer
  ,getMatchForViewer
  ,createMatchForUser
  ,updateMatchForUser
  ,cancelMatchForUser
  ,adminCancelMatch
  ,cancelRegistrationForUser
  ,listAdminMatches
  ,adminBookMatch
  ,confirmMatchAttendance
  ,adminHandleBookedWithdrawal
  ,adminTransferMatchReplacement
  ,creatorConfirmMatchAttendance
  ,generateMatchFeeLedger
  ,markMatchFeeSplit
  ,buildMatchProfileStats
  ,listMyMatches
  ,getMatchProfile
  ,updateMatchProfile
  ,submitMatchTechnicalRating
  ,listMatchNotifications
  ,matchNotificationText
  ,buildOfficialAccountMatchAdminMessage
  ,collectMatchAdminOfficialAccountRecipients
  ,sendOfficialAccountMatchAdminNotification
  ,listMatchPlayers
  ,buildMatchSubscribeMessage
  ,notifyMatchUsers
  ,syncMatchFeeSplitToCourtFinance
  ,syncMatchFeeSplitRefundToCourtFinance
  ,getMatchFinanceDailyReportForAdmin
  ,getCourtRecordForTest
  ,removeMatchCourtFinanceRowsForTest
};
