const assert = require('assert');
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
    'ft_entitlement_ledger',
    'ft_class_nos',
    'ft_membership_plans',
    'ft_membership_accounts',
    'ft_membership_orders',
    'ft_membership_benefit_ledger',
    'ft_membership_account_events'
  ],
  'runtime ensured tables should cover feedback, course package, and membership tables'
);

console.log('runtime table bootstrap tests passed');
