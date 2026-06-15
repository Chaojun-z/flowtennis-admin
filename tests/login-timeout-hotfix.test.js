const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../server/auth.js'), 'utf8');
const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');

assert.match(source, /const LOGIN_STORAGE_TIMEOUT_ERROR='登录服务暂时超时，请重试';/, 'login should expose a readable timeout error');
assert.match(source, /const LOGIN_INVALID_ACCOUNT_ERROR='账号数据异常，请联系管理员处理';/, 'login should expose a readable invalid-account error');
assert.match(source, /const LOGIN_ROW_TIMEOUT_MS=4500;/, 'login row timeout should be relaxed for production flakiness');
assert.match(source, /const LOGIN_SCAN_TIMEOUT_MS=4500;/, 'login scan timeout should be relaxed for production flakiness');
assert.match(source, /const LOGIN_ROW_RETRY_LIMIT=2;/, 'login should retry row lookups before giving up');
assert.match(source, /async function loadLoginUser\(username\)\{[\s\S]*for\(let attempt=1;attempt<=LOGIN_ROW_RETRY_LIMIT;attempt\+\+\)\{[\s\S]*withTimeout\(getCachedRow\(T_USERS,username\),LOGIN_ROW_TIMEOUT_MS,rowTimeout\)[\s\S]*getCachedScan\(T_USERS\)\.catch\(\(err\)=>\{/, 'login should retry ft_users row lookup before falling back to cached user scan');
assert.match(apiSource, /if\(user\?\.__loginTimeout\)return sendJson\(res,\{error:LOGIN_STORAGE_TIMEOUT_ERROR\},503\);/, 'login should return 503 instead of surfacing a raw timeout crash');
assert.match(source, /async function verifyLoginPassword\(username,inputPassword,storedPassword\)\{[\s\S]*bcrypt\.compare\(inputPassword,storedPassword\)[\s\S]*return \{invalidAccount:true\};/, 'login should catch invalid password hash crashes');
assert.match(apiSource, /if\(passwordVerified\?\.\invalidAccount\)return sendJson\(res,\{error:LOGIN_INVALID_ACCOUNT_ERROR\},500\);/, 'login should turn invalid account rows into a readable 500 instead of invocation failure');

console.log('login timeout hotfix tests passed');
