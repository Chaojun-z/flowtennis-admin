const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose runtime table helpers');

assert.deepStrictEqual(
  rules.getRuntimeEnsuredTables(),
  [
    'ft_feedbacks',
    'ft_packages',
    'ft_purchases',
    'ft_entitlements',
    'ft_entitlement_authorizations',
    'ft_entitlement_ledger',
    'ft_class_nos',
    'ft_price_plans',
    'ft_match_settings',
    'ft_user_wechat_index',
    'ft_coach_schedule_index',
    'ft_schedule_conflict_index',
    'ft_student_active_entitlement_index',
    'ft_student_teaching_summary',
    'ft_official_account_query_sessions',
    'ft_coach_proposals',
    'ft_feishu_schedule_sync',
    'ft_feishu_schedule_tasks',
    'ft_court_account_list_index',
    'ft_court_account_list_index_tasks',
    'ft_court_account_list_snapshot',
    'ft_court_account_list_snapshot_tasks',
    'ft_schedule_list_snapshot',
    'ft_schedule_list_snapshot_tasks',
    'ft_operations_snapshot',
    'ft_operations_snapshot_tasks',
    'ft_weekly_business_reports',
    'ft_membership_plans',
    'ft_membership_accounts',
    'ft_membership_orders',
    'ft_membership_benefit_ledger',
    'ft_membership_account_events'
  ],
  'runtime ensured tables should cover feedback, course package, secondary index, list snapshots, and membership tables'
);

const apiSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
assert.match(
  apiSource,
  /createFeishuScheduleSyncRoutes\(\{[^}]*mkTable/s,
  'feishu schedule sync route should receive mkTable so it can create its runtime sync tables before writing'
);

console.log('runtime table bootstrap tests passed');
