const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const scriptSource = fs.readFileSync(path.join(__dirname, '../scripts/backfill-wechat-user-index.js'), 'utf8');

assert.match(apiSource, /T_USER_WECHAT_INDEX='ft_user_wechat_index'/, '必须声明微信用户索引表');
assert.match(apiSource, /async function getWechatUserByOpenId\(openid\)\{/, '必须提供微信索引读取 helper');
assert.match(apiSource, /const link=await getCachedRow\(T_USER_WECHAT_INDEX,key\)\.catch\(\(\)=>null\);/, '微信登录必须优先读取索引表');
assert.match(apiSource, /return findWechatUserByOpenId\(await getCachedScan\(T_USERS\)\.catch\(\(\)=>\[\]\),key\);/, '索引缺失时必须回落旧逻辑');
assert.match(apiSource, /const account=await getWechatUserByOpenId\(openid\);/, '微信登录入口必须走索引 helper');
assert.match(apiSource, /await bindWechatUserWithIndex\(stored,openid\);/, '微信绑定时必须同步写索引');
assert.match(apiSource, /if\(body\.clearWechat\)\{await unbindWechatUserWithIndex\(updates\);return sendJson\(res,\{success:true\}\);\}/, '后台解绑微信时必须同步删除索引');
assert.match(scriptSource, /const INDEX_TABLE = process\.env\.WECHAT_USER_INDEX_TABLE \|\| 'ft_user_wechat_index';/, '回填脚本默认索引表必须与主后端一致');
assert.match(scriptSource, /const TS_KEY_ID = process\.env\.ALIBABA_CLOUD_ACCESS_KEY_ID \|\| process\.env\.TS_KEY_ID \|\| '';/, '回填脚本必须优先读取正式环境变量');
assert.match(scriptSource, /const TS_KEY_SEC = process\.env\.ALIBABA_CLOUD_ACCESS_KEY_SECRET \|\| process\.env\.TS_KEY_SEC \|\| '';/, '回填脚本必须优先读取正式密钥环境变量');

console.log('wechat user index guard tests passed');
