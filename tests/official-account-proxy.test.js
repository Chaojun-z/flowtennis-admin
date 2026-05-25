const assert = require('assert');

process.env.WECHAT_OFFICIAL_ACCOUNT_APPID = 'wx-test';
process.env.WECHAT_OFFICIAL_ACCOUNT_SECRET = 'wechat-secret';
process.env.WECHAT_OFFICIAL_ACCOUNT_PROXY_URL = 'http://proxy.local/wechat/send-template';
process.env.WECHAT_OFFICIAL_ACCOUNT_PROXY_SECRET = 'proxy-secret';

const api = require('../api/index.js');

const calls = [];
global.fetch = async (url, options = {}) => {
  calls.push({ url, options });
  return {
    ok: true,
    status: 200,
    async json() {
      return { errcode: 0, msgid: 123 };
    }
  };
};

(async () => {
  const message = {
    touser: 'openid-test',
    template_id: 'template-test',
    data: { first: { value: 'test' } }
  };

  const result = await api._test.sendOfficialAccountTemplateMessage(message);

  assert.deepStrictEqual(result, { errcode: 0, msgid: 123 });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, process.env.WECHAT_OFFICIAL_ACCOUNT_PROXY_URL);
  assert.strictEqual(calls[0].options.method, 'POST');
  assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer proxy-secret');
  assert.strictEqual(calls[0].options.headers['Content-Type'], 'application/json');
  assert.deepStrictEqual(JSON.parse(calls[0].options.body), message);

  console.log('official account proxy tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
