const assert = require('assert');
const fs = require('fs');
const path = require('path');

const corePageDataSource = fs.readFileSync(path.join(__dirname, '../server/page-data/core-pages.js'), 'utf8');

assert.match(
  corePageDataSource,
  /if\(path==='\/page-data\/memberships'&&method==='GET'\)\{[\s\S]*const normalizedMembershipPlans=\(Array\.isArray\(membershipPlans\)\?membershipPlans:\[\]\)\.map\(normalizeMembershipPlanViewRecord\);[\s\S]*const membershipPlanMap=new Map\(normalizedMembershipPlans\.map\(p=>\[p\.id,p\]\)\);[\s\S]*const normalizedMembershipOrders=\(Array\.isArray\(membershipOrders\)\?membershipOrders:\[\]\)\.map\(order=>normalizeMembershipOrderViewRecord\(order,membershipPlanMap\.get\(order\.membershipPlanId\)\)\);[\s\S]*const scoped=filterLoadAllForUser\(\{[\s\S]*courts[\s\S]*membershipAccounts:Array\.isArray\(membershipAccounts\)\?membershipAccounts:\[\][\s\S]*membershipOrders:normalizedMembershipOrders[\s\S]*membershipBenefitLedger:Array\.isArray\(membershipBenefitLedger\)\?membershipBenefitLedger:\[\][\s\S]*membershipAccountEvents:Array\.isArray\(membershipAccountEvents\)\?membershipAccountEvents:\[\][\s\S]*membershipPlans:normalizedMembershipPlans[\s\S]*coaches[\s\S]*\},user\);[\s\S]*return sendJson\(res,\{[\s\S]*courts:scoped\.courts[\s\S]*membershipAccounts:scoped\.membershipAccounts[\s\S]*membershipOrders:scoped\.membershipOrders[\s\S]*membershipBenefitLedger:scoped\.membershipBenefitLedger[\s\S]*membershipAccountEvents:scoped\.membershipAccountEvents[\s\S]*membershipPlans:scoped\.membershipPlans[\s\S]*coaches:scoped\.coaches[\s\S]*\}\);[\s\S]*\}/s,
  'memberships page aggregate endpoint should stay read-only and return normalized membership data without reconcile side effects'
);

assert.doesNotMatch(
  corePageDataSource,
  /if\(path==='\/page-data\/memberships'&&method==='GET'\)\{[\s\S]*runMembershipReconcile\(/s,
  'memberships page aggregate endpoint must not trigger reconcile during read'
);

assert.match(
  corePageDataSource,
  /buildCourtAccountListViewFromData/,
  'memberships page aggregate endpoint should reuse the court account read model for membership finance summary'
);

assert.match(
  corePageDataSource,
  /if\(path==='\/page-data\/memberships'&&method==='GET'\)\{[\s\S]*getCachedScan\(T_COURTS\)/s,
  'memberships page aggregate endpoint must load the full court accounts set before matching membership accounts'
);

assert.match(
  corePageDataSource,
  /buildMembershipFinanceSummary\(\{[\s\S]*courtAccountItems:membershipCourtAccountView\.items/s,
  'memberships page finance summary should receive the same member rows as the court account page'
);

console.log('memberships page data regression tests passed');
