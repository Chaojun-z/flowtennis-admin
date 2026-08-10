const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/state.js'), 'utf8');
const studentsSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/students.js'), 'utf8');
const corePagesSource = fs.readFileSync(path.join(__dirname, '../server/page-data/core-pages.js'), 'utf8');
const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');

function fnBodyFrom(sourceText, name) {
  const start = sourceText.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const next = sourceText.indexOf('\nfunction ', start + 1);
  return sourceText.slice(start, next === -1 ? sourceText.length : next);
}

assert.match(source, /students:\['campuses','students','coaches'\]/, 'students page should only block on the datasets needed to paint the list and coach filter immediately');
assert.match(source, /leads:\['campuses','leads'\]/, 'leads page should only block on the data needed for first paint');
assert.match(source, /'package-students':\['campuses','students','coaches','customerCenterPage'\]/, 'formal student page should use coaches and the customer center list read model before first render');
assert.match(source, /'trial-students':\['campuses','students','coaches','customerCenterPage'\]/, 'normal student page should use coaches and the customer center list read model before first render');
assert.doesNotMatch(source, /leads:\['campuses','leads','purchasesPage'\]/, 'leads page should not block on the full purchases aggregate for lifecycle stats');
assert.doesNotMatch(source, /'package-students':\['campuses','students','purchasesPage'\]/, 'formal student page should not block on the full purchases aggregate for lifecycle stats');
assert.doesNotMatch(source, /'trial-students':\['campuses','students','purchasesPage'\]/, 'normal student page should not block on the full purchases aggregate for lifecycle stats');
assert.match(source, /packages:\['packageCenterPage','products','packageBoardPreferences'\]/, 'packages page should wait for the lightweight package center list model so the empty state is stable');
assert.match(source, /purchases:\['packageCenterPage'\]/, 'purchases page should use the lightweight package center list model before first render');
assert.match(source, /entitlements:\['packageCenterPage'\]/, 'entitlements page should use the lightweight package center list model before first render');
assert.match(source, /finance:\[\]/, 'finance center should open shell immediately and load aggregated data in background');
assert.match(source, /courts:\[\]/, 'courts page should open shell immediately and load data in background');
assert.match(source, /memberships:\[\]/, 'memberships page should open shell immediately and load data in background');
assert.match(source, /workbench:\[\]/, 'coach workbench should open immediately and load data in background');
assert.match(source, /postfeedback:\[\]/, 'coach post-class feedback should open immediately and load data in background');
assert.match(source, /mystudents:\[\]/, 'coach students should open immediately and load data in background');
assert.match(source, /myclasses:\[\]/, 'coach classes should open immediately and load data in background');
assert.match(source, /schedule:\['campuses','students','courts','schedule','coaches','coachProposals'\]/, 'schedule page should load its first-screen datasets without blocking on lifecycle, feedback, entitlement, or ledger datasets');
assert.match(source, /coachschedule:\['coachSchedulePage'\]/, 'coach schedule calendar should block only on its lightweight calendar read model');
assert.match(source, /coachops:\['workbenchPage','operationsPage'\]/, 'coach workload should block on the backend unified coach schedule view and operations metrics');
assert.match(source, /const PAGE_DATA_BACKGROUND_REQUIREMENTS=\{[\s\S]*students:\['classes','schedule','courts'\][\s\S]*'package-students':\['classes','schedule','courts'\][\s\S]*'trial-students':\['classes','schedule','courts'\][\s\S]*leads:\[\][\s\S]*purchases:\[\][\s\S]*schedule:\['classes','feedbacks','entitlements','entitlementLedger','lifecycleMetricsPage','financePage'\][\s\S]*coachschedule:\['entitlements','entitlementLedger'\][\s\S]*finance:\['financePage'\][\s\S]*courts:\['courtsPage'\][\s\S]*memberships:\[\][\s\S]*workbench:\['workbenchPage'\][\s\S]*postfeedback:\['workbenchPage'\][\s\S]*mystudents:\['campuses','students','classes','schedule','feedbacks','entitlements'\][\s\S]*myclasses:\['students','classes'\]/, 'heavy page datasets should move behind first render, leads followups and lifecycle metrics should load only when explicitly needed');
assert.match(source, /const STUDENT_PAGE_DEFERRED_REQUIREMENTS=\[\];/, 'student list pages should not automatically pull heavy detail datasets after first paint');
assert.match(source, /const STUDENT_DETAIL_REQUIREMENTS=\[\];/, 'student detail tabs should not block on extra shared datasets');
assert.match(studentsSource, /function ensureStudentDetailDatasets\(/, 'student detail should have a lazy detail data loader');
assert.match(studentsSource, /ensureStudentDetailData\(id,\{force:studentDetailTabNeedsDatasets\(studentDetailActiveTab\)\}\)/, 'student detail should load one student detail record by id when the drawer opens');
assert.match(source, /function markStudentDetailDataStale\(studentId\)/, 'student detail should support invalidating one student after a package mutation');
assert.match(source, /function markReadModelsStale\(names=STUDENT_DRAWER_MUTATION_READ_MODELS\)/, 'student drawer mutations should be able to stale global read models without clearing detail caches');
assert.match(source, /function refreshReadModelsInBackground\(names=STUDENT_DRAWER_MUTATION_READ_MODELS[\s\S]*ensureDatasetsByName\(targets,\{force:true\}\)\.then/, 'student drawer mutations should refresh global read models in the background');
assert.match(source, /async function refreshStudentDetailDataAfterMutation\(studentId\)[\s\S]*markStudentDetailDataStale\(id\)[\s\S]*ensureStudentDetailData\(id,\{force:true\}\)/, 'student drawer mutations should refresh only one student detail synchronously');
assert.match(source, /function ensurePurchaseDetailData\(purchaseId/, 'purchase detail should have a per-purchase detail loader');
assert.match(source, /\/page-data\/purchase-detail\?id=/, 'purchase detail loader should call the per-purchase endpoint');
assert.match(source, /,purchaseCreatePage:\(\)=>apiCall\('GET','\/page-data\/purchase-create',null,20000\)/, 'purchase create drawer should use a lightweight create endpoint with a shorter timeout');
assert.match(source, /function ensureLeadFollowupsForLead\(leadId/, 'lead drawer should have a per-lead followup loader');
assert.match(source, /\/leads\/\$\{encodeURIComponent\(id\)\}\/followups/, 'lead followups should load by lead id');
assert.match(source, /function ensureCourtAccountDetailData\(courtId/, 'court membership drawer should have a per-account detail loader');
assert.match(source, /courtAccountDetailPageDataUrl\(id,\{fresh:force\}\)/, 'court membership detail should request a single account by id');
assert.match(source, /,packageCenterPage:\(\)=>apiCall\('GET','\/page-data\/package-center-list'\)/, 'package center first-screen pages should use a lightweight list endpoint');
assert.match(source, /,purchasesPage:\(\)=>apiCall\('GET','\/page-data\/purchases'\)/, 'purchases page should use a dedicated aggregated endpoint');
assert.match(source, /function customerCenterPageDataUrl\(\{fresh=false\}=\{\}\)\{[\s\S]*fresh\?appendPageDataQuery\(url,\{fresh:1,_ts:Date\.now\(\)\}\):url;/, 'customer center list endpoint url should support forced fresh reads after schedule and package mutations');
assert.match(source, /,customerCenterPage:\(\{fresh=false\}=\{\}\)=>apiCall\('GET',customerCenterPageDataUrl\(\{fresh\}\)\)/, 'customer center first-screen pages should use a lightweight scoped list endpoint and accept fresh reloads');
assert.match(source, /,lifecycleMetricsPage:\(\)=>apiCall\('GET',lifecycleMetricsPageDataUrl\(\)\)/, 'standard lifecycle stats should use a lightweight scoped lifecycle metrics endpoint');
assert.match(source, /,financePage:\(\)=>apiCall\('GET',financePageDataUrl\(\)\)/, 'finance center should use a dedicated scoped aggregated endpoint');
assert.match(source, /,courtsPage:\(\)=>apiCall\('GET','\/page-data\/courts'\)/, 'courts page should use a dedicated aggregated endpoint');
assert.doesNotMatch(source, /membershipsPage:\(\)=>apiCall\('GET','\/page-data\/memberships'\)/, 'memberships page should not keep the old raw membership aggregate loader');
assert.match(source, /,courtAccountListViewPage:\(\{fresh=false\}=\{\}\)=>apiCall\('GET',courtAccountListViewPageDataUrl\(\{fresh\}\)\)/, 'membership pages should use the scoped unified court account read model endpoint');
assert.match(source, /,workbenchPage:\(\)=>apiCall\('GET','\/page-data\/workbench'\)/, 'coach workbench should use a dedicated aggregated endpoint');
assert.match(source, /,coachSchedulePage:\(\)=>apiCall\('GET','\/page-data\/coach-schedule'\)/, 'coach schedule calendar should use a dedicated lightweight endpoint');
assert.match(source, /leads:\(\)=>apiCall\('GET',leadListPageDataUrl\(\)\)/, 'leads page should load its primary list dataset from the server-paged /leads endpoint');
assert.match(source, /leadFollowups:\(\)=>apiCall\('GET','\/lead-followups'\)/, 'leads page should load follow-up detail data separately');
assert.match(source, /Promise\.allSettled\(immediateNames\.map/, 'background loading should fetch the current background batch in parallel');
assert.match(source, /if\(isStudentListPage\(pg\)&&STUDENT_PAGE_DEFERRED_REQUIREMENTS\.length\)\{[\s\S]*setTimeout\(\(\)=>\{[\s\S]*ensureDatasetsByName\(STUDENT_PAGE_DEFERRED_REQUIREMENTS,\{force\}\)/, 'student list background loader should stay guarded when deferred requirements are enabled');
assert.match(source, /if\(name==='packageCenterPage'\)\{[\s\S]*setDatasetValue\('purchases',data\.purchases\|\|\[\]\);[\s\S]*setDatasetValue\('packages',data\.packages\|\|\[\]\);[\s\S]*setDatasetValue\('students',data\.students\|\|\[\]\);[\s\S]*setDatasetValue\('entitlements',data\.entitlements\|\|\[\]\);[\s\S]*purchaseUnifiedView=data\.purchaseUnifiedView/, 'package center list loader should hydrate first-screen package datasets without ledger rows');
assert.match(source, /if\(name==='purchaseCreatePage'\)\{[\s\S]*setDatasetValue\('packages',data\.packages\|\|\[\]\);[\s\S]*setDatasetValue\('students',data\.students\|\|\[\]\);[\s\S]*setDatasetValue\('coaches',data\.coaches\|\|\[\]\);[\s\S]*markDatasetLoaded\('purchaseCreatePage',requestKey\);/, 'purchase create loader should hydrate only create-form datasets');
assert.match(source, /if\(name==='purchasesPage'\)\{[\s\S]*setDatasetValue\('purchases',data\.purchases\|\|\[\]\);[\s\S]*setDatasetValue\('packages',data\.packages\|\|\[\]\);[\s\S]*setDatasetValue\('students',data\.students\|\|\[\]\);[\s\S]*setDatasetValue\('entitlements',data\.entitlements\|\|\[\]\);[\s\S]*setDatasetValue\('entitlementLedger',data\.entitlementLedger\|\|\[\]\);/, 'purchases page aggregate loader should hydrate all dependent datasets from one response');
assert.match(source, /if\(name==='customerCenterPage'\)\{[\s\S]*setDatasetValue\('customerLifecycleRows',data\.customerLifecycleRows\|\|\[\],\{persist:false\}\);[\s\S]*teachingStudentViews=data\.teachingStudentViews/, 'customer center list loader should hydrate lifecycle rows and teaching views');
assert.match(source, /if\(name==='lifecycleMetricsPage'\)\{[\s\S]*setDatasetValue\('customerLifecycleRows',data\.customerLifecycleRows\|\|\[\],\{persist:false\}\);[\s\S]*teachingStudentViews=data\.teachingStudentViews/, 'lifecycle metrics loader should hydrate only lifecycle rows and teaching views');
assert.match(source, /if\(name==='customerCenterPage'\)\{[\s\S]*staleCachedDatasets\.delete\('customerCenterPage'\)[\s\S]*markDatasetLoaded\('customerCenterPage',requestKey\)/, 'customer center refresh should clear its own stale marker after purchase or schedule mutations');
assert.match(source, /if\(name==='lifecycleMetricsPage'\)\{[\s\S]*staleCachedDatasets\.delete\('lifecycleMetricsPage'\)[\s\S]*markDatasetLoaded\('lifecycleMetricsPage',requestKey\)/, 'lifecycle metrics refresh should clear its own stale marker after purchase or schedule mutations');
assert.match(source, /if\(name==='financePage'\)\{[\s\S]*setDatasetValue\('campuses',data\.campuses\|\|\[\]\);[\s\S]*financeOverviewData=data\.financeOverviewData\|\|null;[\s\S]*markDatasetLoaded\('financePage',requestKey\);/, 'finance aggregate loader should only hydrate finance payload fields and not clear unrelated datasets');
assert.match(source, /if\(name==='courtsPage'\)\{[\s\S]*setDatasetValue\('campuses',data\.campuses\|\|\[\]\);[\s\S]*setDatasetValue\('students',data\.students\|\|\[\]\);[\s\S]*setDatasetValue\('courts',data\.courts\|\|\[\]\);[\s\S]*markDatasetLoaded\('courtsPage',requestKey\);/, 'courts page aggregate loader should only hydrate court first-screen datasets');
assert.doesNotMatch(source, /if\(name==='membershipsPage'\)\{[\s\S]*membershipOrders[\s\S]*membershipBenefitLedger[\s\S]*membershipFinanceSummary/, 'membership pages must not hydrate raw membership facts from the old aggregate response');
assert.match(source, /pg==='courts'\|\|pg==='memberships'\|\|pg==='membership-orders'\|\|pg==='membership-ledger'/, 'membership management, purchase records, and benefit ledger should all load the unified court account read model');
assert.match(source, /if\(name==='workbenchPage'\)\{[\s\S]*setDatasetValue\('campuses',data\.campuses\|\|\[\]\);[\s\S]*setDatasetValue\('students',data\.students\|\|\[\]\);[\s\S]*setDatasetValue\('classes',data\.classes\|\|\[\]\);[\s\S]*setDatasetValue\('schedule',data\.schedule\|\|\[\]\);[\s\S]*setDatasetValue\('feedbacks',data\.feedbacks\|\|\[\]\);[\s\S]*setDatasetValue\('purchases',data\.purchases\|\|\[\]\);/, 'workbench aggregate loader should hydrate coach homepage dependencies from one response');
assert.match(source, /if\(name==='coachSchedulePage'\)\{[\s\S]*setDatasetValue\('campuses',data\.campuses\|\|\[\]\);[\s\S]*setDatasetValue\('coaches',data\.coaches\|\|\[\]\);[\s\S]*setDatasetValue\('students',data\.students\|\|\[\]\);[\s\S]*setDatasetValue\('classes',data\.classes\|\|\[\]\);[\s\S]*setDatasetValue\('schedule',data\.schedule\|\|\[\]\);[\s\S]*setDatasetValue\('feedbacks',data\.feedbacks\|\|\[\]\);[\s\S]*coachOpsUnifiedView=data\.coachOpsUnifiedView\|\|\{rows:\[\]\}/, 'coach schedule loader should hydrate only calendar first-screen datasets');
assert.match(source, /if\(name==='workbenchPage'\)\{[\s\S]*window\.coachWorkbenchStats=data\.stats\|\|\{/, 'workbench aggregate loader should keep the backend standard stats payload');
assert.match(source, /if\(name==='workbenchPage'\)\{[\s\S]*setDatasetValue\('schedule',data\.schedule\|\|\[\]\);/, 'workbench aggregate loader should still hydrate schedule rows from the aggregated payload');
assert.match(source, /const DATA_CACHE_PREFIX='ft_dataset_cache_';/, 'state should persist the last successful datasets for refresh fallback');
assert.match(source, /function hydrateDatasetsFromCache\(\)/, 'state should hydrate cached datasets before network refresh');
assert.match(source, /function persistDatasetCache\(name,data\)/, 'state should cache every successful dataset load');
assert.doesNotMatch(source, /function persistDatasetCache\(name,data\)\{\s*return;\s*\}/, 'dataset cache persistence should not be disabled');
assert.doesNotMatch(source, /function readDatasetCache\(name\)\{\s*return null;\s*\}/, 'dataset cache reads should not be disabled');
assert.match(source, /const DATASETS_EXCLUDED_FROM_CACHE=new Set\(\['leads','leadFollowups','students','schedule','coachSchedulePage','packages','purchases','entitlements','entitlementLedger','coachProposals'\]\);/, 'volatile lead, schedule, package, purchase, ledger, and coach proposal datasets should stay network-only while normal lists use refresh cache');
assert.match(source, /function missingRequiredDatasetsForPage\(pg\)/, 'state should be able to detect when the current page still lacks blocking datasets');
assert.match(source, /function missingInitialDatasetsForPage\(pg\)/, 'state should detect empty-shell pages waiting for their first background dataset');
assert.match(source, /function renderPageLoading\(pg\)/, 'state should render inline loading placeholders instead of empty pages');
assert.match(source, /if\(pg==='leads'\)renderLeadTableLoading\(\);/, 'leads page should render an inline list loading placeholder');
assert.doesNotMatch(source, /renderBlockLoading\('coachOpsRevenueStats','财务汇总加载中\.\.\.'\)/, 'finance page should not render a duplicate top loading line above the revenue table');
assert.match(source, /if\(pageNeedsInlineLoading\(pg\)\)\{[\s\S]*renderPageLoading\(pg\);\s*return;\s*\}/, 'page rendering should show inline loading placeholders until the page has the datasets it needs');
assert.match(source, /const datasetLoadPromises=new Map\(\);/, 'state should de-duplicate concurrent dataset requests');
assert.match(source, /datasetLoadPromises\.has\(requestKey\)/, 'dataset loading should reuse in-flight requests');
assert.match(source, /DATASET_LOADERS\[name\]\(\{fresh:force\}\)/, 'forced dataset refreshes should pass fresh=true to loaders that bypass stale page-data summaries');
assert.match(source, /function markLearningDataStale\(\)\{[\s\S]*'customerCenterPage','lifecycleMetricsPage','packageCenterPage','purchaseCreatePage','purchasesPage','coachSchedulePage','workbenchPage'[\s\S]*financeOverviewData=null;[\s\S]*financePrepaidView=\{rows:\[\],summary:\{\}\};/, 'schedule and package mutations should invalidate student, package, lifecycle, coach schedule, workbench, and finance read-model caches together');
assert.match(source, /const DATASETS_WITH_REQUEST_KEYS=new Set\(\['leads','schedule','operationsPage','customerCenterPage','lifecycleMetricsPage','financePage','courtAccountListViewPage'\]\);/, 'scoped page-data datasets should be keyed by their current request url');
assert.match(source, /function pageDataScopeQuery\(\{dateRange='global'\}=\{\}\)/, 'scoped page-data requests should share the global campus and date filter query builder');
assert.match(source, /function datasetHasCurrentRequestKey\(name\)/, 'loaded scoped datasets should be invalidated when the top filter query changes');
assert.match(source, /if\(DATASETS_WITH_REQUEST_KEYS\.has\(name\)&&requestKey!==datasetRequestKey\(name\)\)return;/, 'stale scoped summary responses must not overwrite the latest top-filter metrics');
assert.match(source, /function refreshScopedTopSummaryForCurrentPage\(\)/, 'top-filter changes should refresh backend scoped summaries');
assert.match(source, /isStudentListPage\(pg\)\?\['customerCenterPage'\]/, 'student top filter changes should refresh the lightweight customer center summary');
assert.match(source, /ensureDatasetsByName\(names,\{force:true\}\)\.then\(\(\)=>\{[\s\S]*renderScopedSummaryPage\(pg\)/, 'top filter changes should still refresh the backend scoped summary');
assert.match(source, /return false;/, 'top filters should repaint the current page immediately and refresh backend scoped summaries asynchronously');
assert.match(source, /loadPageBackgroundDatasets\(pg,requestVersion,\{force\}\);/, 'page background loading should revalidate cached data without blocking first paint');
assert.match(apiSource, /schedule:2000,entitlementLedger:2000,/, 'production lifecycle page-data schedule reads must not be capped below current live schedule volume');
assert.doesNotMatch(corePagesSource, /T_SCHEDULE \? cappedScan\(T_SCHEDULE, PRODUCTION_PAGE_READ_LIMITS\.schedule\)\.catch\(\(\)=>\[\]\) : Promise\.resolve\(\[\]\)/, 'student lifecycle page-data must not silently treat schedule read overflow as an empty schedule table');
const packageCenterRouteSource = corePagesSource.slice(
  corePagesSource.indexOf("path==='/page-data/package-center-list'&&method==='GET'"),
  corePagesSource.indexOf("path==='/page-data/customer-center-list'&&method==='GET'")
);
assert.match(corePagesSource, /path==='\/page-data\/package-center-list'&&method==='GET'[\s\S]*cappedScan\(T_PURCHASES\)[\s\S]*cappedScan\(T_PACKAGES\)[\s\S]*cappedScan\(T_STUDENTS\)[\s\S]*cappedScan\(T_ENTITLEMENTS\)/, 'package center list endpoint should read only first-screen package datasets');
assert.match(corePagesSource, /path==='\/page-data\/package-center-list'&&method==='GET'[\s\S]*parseListPaging\(query\)[\s\S]*listPage=\{view, \.\.\.buildListPage\(rows,paging\)\}/, 'package center list endpoint should expose server-side paged list views');
assert.doesNotMatch(packageCenterRouteSource, /T_ENTITLEMENT_LEDGER/, 'package center list endpoint must not scan lesson ledger rows');
assert.doesNotMatch(packageCenterRouteSource, /T_SCHEDULE/, 'package center list endpoint must not scan schedule rows');
const coachScheduleRouteSource = corePagesSource.slice(
  corePagesSource.indexOf("path==='/page-data/coach-schedule'&&method==='GET'"),
  corePagesSource.indexOf("path==='/page-data/workbench'&&method==='GET'")
);
assert.match(coachScheduleRouteSource, /getFastStudentsRead\(\{columns:COACH_SCHEDULE_STUDENT_PROJECTION_FIELDS\}\)/, 'coach schedule endpoint should use a projected fast student read');
assert.match(coachScheduleRouteSource, /scheduleRowsPromise[\s\S]*cappedScan\(T_FEEDBACKS\)[\s\S]*scanCoachProposals\(\)/, 'coach schedule endpoint should read only calendar facts needed for first paint');
assert.doesNotMatch(coachScheduleRouteSource, /T_PURCHASES|T_ENTITLEMENTS|T_ENTITLEMENT_LEDGER|buildStandardLifecycleMetrics|buildWorkbenchStats|buildCustomerLifecycleRows|buildTeachingStudentViews|decorateWorkbenchStudents|decorateWorkbenchClasses/, 'coach schedule endpoint must not scan or calculate heavy package, lifecycle, student summary, or workbench-only facts');
assert.match(corePagesSource, /path==='\/page-data\/customer-center-list'&&method==='GET'[\s\S]*cappedScan\(T_STUDENTS\)[\s\S]*cappedScan\(T_PURCHASES\)[\s\S]*cappedScan\(T_ENTITLEMENTS\)/, 'customer center list endpoint should read the lightweight customer and course facts');
assert.match(corePagesSource, /path==='\/page-data\/customer-center-list'&&method==='GET'[\s\S]*const listPage=paging&&view\?\{view,\.\.\.buildListPage/, 'customer center list endpoint should expose server-side paged student views');
assert.match(corePagesSource, /path==='\/page-data\/customer-center-list'&&method==='GET'[\s\S]*searchableRows=q&&Array\.isArray\(teachingStudentViews\.searchableStudents\)\?teachingStudentViews\.searchableStudents:studentRows/, 'customer center paged search should use the stable lightweight full student search index');
assert.match(corePagesSource, /textSearchHit\(q,row\.searchText[\s\S]*row\.notes,row\.profileNote/, 'customer center paged search should include backend searchText, notes, and profileNote');
assert.match(corePagesSource, /path==='\/page-data\/customer-center-list'&&method==='GET'[\s\S]*getCachedScan\(T_STUDENT_TEACHING_SUMMARY\)/, 'customer center list endpoint should read precomputed student teaching summary rows for schedule facts');
assert.match(corePagesSource, /const fresh=query\?\.get\('fresh'\)==='1'\|\|query\?\.get\('forceFresh'\)==='1';/, 'customer center list endpoint should accept an explicit fresh flag');
assert.match(corePagesSource, /fresh \? Promise\.resolve\(\[\]\) : \(T_STUDENT_TEACHING_SUMMARY \? getCachedScan\(T_STUDENT_TEACHING_SUMMARY\)/, 'fresh customer center reads should bypass the precomputed student teaching summary');
assert.match(corePagesSource, /const needsTeachingFacts = fresh[\s\S]*teachingSummaryNeedsLessonFacts\(row, new Date\(\)\)/, 'customer center list endpoint should fall back to live lesson facts when teaching summaries are old or internally contradictory');
assert.match(corePagesSource, /needsTeachingFacts&&T_ENTITLEMENT_LEDGER \? cappedScan\(T_ENTITLEMENT_LEDGER, PRODUCTION_PAGE_READ_LIMITS\.entitlementLedger\)/, 'fresh or legacy-summary customer center reads should include live lesson ledger rows');
assert.match(corePagesSource, /needsTeachingFacts&&T_SCHEDULE \? cappedScan\(T_SCHEDULE, PRODUCTION_PAGE_READ_LIMITS\.schedule\)/, 'fresh or legacy-summary customer center reads should include live schedule rows');
assert.match(corePagesSource, /path==='\/page-data\/customer-center-list\/rebuild-summary'&&method==='POST'[\s\S]*buildStudentTeachingSummaryRows/, 'customer center should expose an explicit admin-only rebuild path for the student teaching summary read model');
assert.match(corePagesSource, /path==='\/page-data\/purchase-detail'&&method==='GET'[\s\S]*getCachedRow\(T_PURCHASES,purchaseId\)/, 'purchase drawer should have a per-purchase detail endpoint');
const purchaseCreateRouteSource = corePagesSource.slice(
  corePagesSource.indexOf("path==='/page-data/purchase-create'&&method==='GET'"),
  corePagesSource.indexOf("path==='/page-data/package-center-list'&&method==='GET'")
);
assert.match(purchaseCreateRouteSource, /getFastStudentsRead\(\{columns:PURCHASE_CREATE_STUDENT_PROJECTION_FIELDS\}\)/, 'purchase create endpoint should use a projected fast student read');
assert.match(purchaseCreateRouteSource, /getCachedScan\(T_PACKAGES\)/, 'purchase create endpoint should load packages for the package picker');
assert.match(purchaseCreateRouteSource, /cappedScan\(T_COACHES\)/, 'purchase create endpoint should load coaches for owner coach defaults');
assert.doesNotMatch(purchaseCreateRouteSource, /T_PURCHASES|T_ENTITLEMENTS|buildPurchaseUnifiedView|buildCustomerLifecycleRows/, 'purchase create endpoint must not load heavy package center facts');
assert.match(corePagesSource, /path==='\/page-data\/student-detail'&&method==='GET'[\s\S]*getCachedRow\(T_STUDENTS,studentId\)/, 'student drawer should have a per-student detail endpoint');
assert.match(corePagesSource, /const canUseStudentTeachingSummary=!fresh[\s\S]*teachingSummaryNeedsLessonFacts\(studentTeachingSummary,new Date\(\)\)/, 'student drawer may use the fast teaching summary only when the summary passes the same contradiction self-check');
assert.match(corePagesSource, /path==='\/page-data\/student-detail'&&method==='GET'[\s\S]*ignoreTeachingSummaryDetailRows:true/, 'student drawer detail rows must come from per-student fact reads, not stale teaching summary detail snapshots');
assert.match(corePagesSource, /path==='\/page-data\/student-detail'&&method==='GET'[\s\S]*studentScheduleIds[\s\S]*studentScheduleIds\.has\(String\(row\.scheduleId\|\|''\)\)/, 'student drawer should load ledger rows linked by scheduleId so authorized package usage appears for the actual student');
assert.match(corePagesSource, /path==='\/page-data\/student-detail'&&method==='GET'[\s\S]*relatedEntitlementIds[\s\S]*scopedEntitlements[\s\S]*relatedPurchaseIds[\s\S]*scopedPurchases[\s\S]*relatedStudents/, 'student drawer should include the package owner records needed to render authorized package usage names');
assert.doesNotMatch(fnBodyFrom(studentsSource, 'ensureStudentDetailDatasets'), /purchasesPage/, 'student detail must not load the full purchases aggregate');
assert.match(apiSource, /T_STUDENT_TEACHING_SUMMARY='ft_student_teaching_summary'/, 'api should declare the student teaching summary read model table');
assert.match(apiSource, /queueStudentTeachingSummaryRefresh\(t,meta\)/, 'source table writes should queue student teaching summary refreshes outside the first-screen read path');

console.log('page data requirements tests passed');
