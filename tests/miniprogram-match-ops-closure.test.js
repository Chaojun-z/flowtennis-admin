const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'wechat-miniprogram', 'miniprogram');
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const apiJs = fs.readFileSync(path.join(root, 'utils', 'api.js'), 'utf8');
const indexJs = fs.readFileSync(path.join(root, 'pages', 'index', 'index.js'), 'utf8');
const indexWxml = fs.readFileSync(path.join(root, 'pages', 'index', 'index.wxml'), 'utf8');

assert.ok(!appJson.pages.includes('pages/profile/index'), 'coach mini program should not register match profile page');
assert.ok(!appJson.pages.includes('pages/match-create/index'), 'coach mini program should not register match create page');
assert.ok(!fs.existsSync(path.join(root, 'pages', 'profile')), 'coach mini program should not keep match profile page files');
assert.ok(!fs.existsSync(path.join(root, 'pages', 'match-create')), 'coach mini program should not keep match create page files');
assert.doesNotMatch(apiJs, /mini-match|\/auth\/wechat-mini-login|\/match-profile|MATCH_TOKEN_KEY|MATCH_USER_KEY|loginMatchWithWechat|bindMatchPhoneByCode|createMatch/, 'coach mini program api should not keep match mini-program helpers');
assert.doesNotMatch(indexWxml, /约球入口|微信进入约球/, 'index page should not expose the match mini-program entry');
assert.match(indexWxml, /其他登录方式[\s\S]*微信快捷登录/, 'index page should reuse the secondary area for coach WeChat login');
assert.doesNotMatch(indexJs, /loginMatchWithWechat|enterMatchMini|loadMatchProfile|matchLoggingIn/, 'index page should not support match WeChat login');

console.log('miniprogram coach-only login tests passed');
