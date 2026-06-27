const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose admin user helpers');
assert.ok(rules.assertAuthUserActive, 'api._test should expose auth user active helper');
assert.ok(rules.buildWechatCode2SessionUrl, 'api._test should expose wechat session URL helper');
assert.ok(rules.extractWechatOpenId, 'api._test should expose wechat openid helper');
assert.ok(rules.buildWechatBoundUser, 'api._test should expose wechat bind helper');
assert.ok(rules.buildOfficialAccountBoundUser, 'api._test should expose official account bind helper');
assert.ok(rules.buildAdminUserView, 'api._test should expose admin user view helper');
assert.ok(rules.buildWechatUnboundUser, 'api._test should expose wechat unbind helper');
assert.ok(rules.buildOfficialAccountUnboundUser, 'api._test should expose official account unbind helper');

assert.doesNotThrow(
  () => rules.assertAuthUserActive({ id: 'coach_1', status: 'active' }),
  'active users should be allowed to login'
);

assert.doesNotThrow(
  () => rules.assertAuthUserActive({ id: 'coach_2' }),
  'users without status should default to active'
);

assert.throws(
  () => rules.assertAuthUserActive({ id: 'coach_3', status: 'inactive' }),
  /账号已停用/,
  'inactive users should be blocked from login'
);

const sessionUrl = rules.buildWechatCode2SessionUrl('wx-app-id', 'secret-value', 'login-code');
assert.strictEqual(
  sessionUrl,
  'https://api.weixin.qq.com/sns/jscode2session?appid=wx-app-id&secret=secret-value&js_code=login-code&grant_type=authorization_code',
  'wechat session helper should build the official code2session URL'
);

assert.strictEqual(
  rules.extractWechatOpenId({ openid: 'openid-123' }),
  'openid-123',
  'wechat openid helper should return openid'
);

assert.throws(
  () => rules.extractWechatOpenId({ errcode: 40029, errmsg: 'invalid code' }),
  /微信登录失败/,
  'wechat openid helper should reject wx API errors'
);

assert.deepStrictEqual(
  rules.buildWechatBoundUser(
    { id: 'coach_1', name: '朝珺', role: 'editor', password: 'hashed' },
    'openid-123',
    '2026-04-19 12:00:00'
  ),
  { id: 'coach_1', name: '朝珺', role: 'editor', password: 'hashed', wechatOpenId: 'openid-123', wechatBoundAt: '2026-04-19 12:00:00' },
  'wechat bind helper should preserve user fields and attach openid'
);

assert.deepStrictEqual(
  rules.buildAdminUserView({
    id: 'coach_1',
    name: '朝珺',
    phone: '13800138000',
    role: 'editor',
    status: 'active',
    coachId: 'coach-id',
    coachName: '朝珺',
    wechatOpenId: 'openid-secret',
    wechatBoundAt: '2026-04-19 12:00:00'
  }),
  {
    id: 'coach_1',
    name: '朝珺',
    phone: '13800138000',
    role: 'editor',
    systemType: 'coach',
    dataScope: 'coach',
    campusIds: [],
    status: 'active',
    coachId: 'coach-id',
    coachName: '朝珺',
    featurePermissions: [],
    matchPermissions: [],
    wechatBound: true,
    wechatBoundAt: '2026-04-19 12:00:00',
    officialAccountBound: false,
    officialAccountBoundAt: ''
  },
  'admin user view should expose binding status without leaking openid'
);

assert.deepStrictEqual(
  rules.buildAdminUserView({
    id: 'mira',
    name: 'Mira',
    role: 'admin',
    dataScope: 'campus',
    campusIds: ['shunyi_mapo'],
    matchPermissions: ['match_ops']
  }),
  {
    id: 'mira',
    name: 'Mira',
    phone: '',
    role: 'admin',
    systemType: 'management',
    dataScope: 'campus',
    campusIds: ['shunyi_mapo'],
    status: 'active',
    coachId: '',
    coachName: '',
    featurePermissions: ['match_ops', 'match_finance'],
    matchPermissions: ['match_ops', 'match_finance'],
    wechatBound: false,
    wechatBoundAt: '',
    officialAccountBound: false,
    officialAccountBoundAt: ''
  },
  'admin user view should expose campus data scope and normalized feature permissions'
);

assert.deepStrictEqual(
  rules.buildWechatUnboundUser({
    id: 'coach_1',
    name: '朝珺',
    wechatOpenId: 'openid-secret',
    wechatBoundAt: '2026-04-19 12:00:00'
  }),
  { id: 'coach_1', name: '朝珺', wechatOpenId: '', wechatBoundAt: '' },
  'wechat unbind helper should clear openid and bind time'
);

assert.deepStrictEqual(
  rules.buildOfficialAccountBoundUser(
    { id: 'coach_1', name: '朝珺', role: 'editor', password: 'hashed' },
    'oa-openid-123',
    '2026-04-19 12:00:00'
  ),
  { id: 'coach_1', name: '朝珺', role: 'editor', password: 'hashed', officialAccountOpenId: 'oa-openid-123', officialAccountBoundAt: '2026-04-19 12:00:00' },
  'official account bind helper should preserve user fields and attach openid'
);

assert.deepStrictEqual(
  rules.buildOfficialAccountUnboundUser({
    id: 'coach_1',
    name: '朝珺',
    officialAccountOpenId: 'oa-openid-123',
    officialAccountBoundAt: '2026-04-19 12:00:00'
  }),
  { id: 'coach_1', name: '朝珺', officialAccountOpenId: '', officialAccountBoundAt: '' },
  'official account unbind helper should clear service account openid and bind time'
);

console.log('admin user rules tests passed');
