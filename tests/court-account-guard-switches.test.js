const assert = require('assert');
const fs = require('fs');
const path = require('path');

const stateSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/state.js'), 'utf8');
const courtsSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/courts.js'), 'utf8');
const residualPageDataSource = fs.readFileSync(path.join(__dirname, '../server/page-data/residual-pages.js'), 'utf8');

assert.match(residualPageDataSource, /court-account-read-model/, 'page-data residual routes 应接入订场用户读模型模块');
assert.match(residualPageDataSource, /\/page-data\/court-account-list-view/, 'page-data residual routes 应保留订场用户读模型入口');
assert.match(residualPageDataSource, /\/page-data\/court-account-list-view-compare/, 'page-data residual routes 应保留新旧结果 compare 入口');

assert.match(stateSource, /const COURT_READ_MODEL_STORAGE_KEY='ft_court_read_model_mode';/, '前端应保留隐藏验证模式存储键');
assert.match(stateSource, /COURT_GUARD_QUERY\.get\('courtCompare'\)==='1'\|\|localStorage\.getItem\(COURT_READ_MODEL_COMPARE_STORAGE_KEY\)==='1'/, 'courtCompare=1 仍应能拉起 compare 验收链');
assert.doesNotMatch(stateSource, /COURT_READ_MODEL_FORCE_LEGACY_KEY|courtRollback|force-legacy|queryMode==='legacy'|courtView'\)==='legacy'/, '订场用户/会员管理不应再保留强退旧前端链');
assert.match(stateSource, /function shouldUseCourtReadModelByDefault\(\)\{\s*return true;\s*\}/, '订场用户和会员管理必须默认且只能走统一读模型');
assert.match(stateSource, /function shouldUseCourtReadModelByDefault\(/, '前端应暴露订场用户页新链总开关判断');
assert.match(stateSource, /function isCourtReadModelPreviewEnabled\(/, '前端应暴露隐藏验证开关判断');
assert.match(stateSource, /\/page-data\/court-account-list-view/, '前端应可加载订场用户隐藏读模型');
assert.match(stateSource, /\/page-data\/court-account-list-view-compare/, '前端应可加载 compare 输出');
assert.doesNotMatch(stateSource, /catch\(e\)\{\s*courtAccountListViewData=null;[\s\S]*console\.warn\('court read model guard load failed'/, '统一读模型加载失败时不得清空后继续渲染旧链');

assert.match(courtsSource, /function renderCourtAccountListView\(/, '订场用户页应增加隐藏读模型渲染入口');
assert.match(courtsSource, /!courtAccountListViewData\|\|\(typeof courtAccountListViewDataIsCurrent==='function'&&!courtAccountListViewDataIsCurrent\(\)\)/, '订场用户页应识别当前筛选范围的统一读模型是否已加载');
assert.match(courtsSource, /loadCourtReadModelGuardData\(\{force:true\}\)/, '订场用户页缺少当前筛选范围的统一读模型时应自动重拉');
assert.match(courtsSource, /catch\(e=>\{[\s\S]*renderCourtTableError\(String\(e\.message\|\|e\)\);/, '订场用户页统一读模型重拉失败时应报错，不得回旧链');
assert.doesNotMatch(courtsSource, /if\(shouldUseCourtReadModelByDefault\(\)&&courtAccountListViewData\)/, '订场用户页不得再用读模型存在与否决定是否回旧链');
assert.match(courtsSource, /window\.__courtAccountListViewCompare=/, '前端应暴露最新 compare 输出供内部验证');
assert.match(courtsSource, /const filters=courtAccountListViewData\?\.filters\|\|\{\};/, '隐藏读模型路径应直接消费后端 filters');
assert.match(courtsSource, /let list=getCurrentCourtAccountRows\(\);[\s\S]*const summary=courtAccountListViewData\?\.summary\|\|FlowTennisPlatformDataStandards\.currentCourtAccountSummary\(list\);[\s\S]*renderCourtStatsCards\(summary\);/, '订场用户顶部必须使用后端统一读模型返回的筛选后汇总');
assert.doesNotMatch(courtsSource, /const scopedSummary=summarizeCourtAccountListItems\(list\);|list\.map\(courtFinanceLocal\)|list\.map\(courtBookingSummary\)/, '订场用户顶部不得再前端本地汇总');
assert.doesNotMatch(courtsSource, /function renderCourts\([\s\S]*const finBase=list\.map\(courtFinanceLocal\)/, '订场用户页不得保留旧链顶部计算');
assert.doesNotMatch(courtsSource, /function exportCourtCSV\([\s\S]*courtFinanceLocal\(u\)/, '订场用户导出不得再用前端旧财务算法');

console.log('court account guard switch tests passed');
