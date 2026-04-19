const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const projectConfig = readJson('wechat-miniprogram/project.config.json');
assert.strictEqual(projectConfig.miniprogramRoot, 'miniprogram/', 'project.config.json should point to miniprogram/');
assert.strictEqual(projectConfig.appid, 'wx7acb7603ee803923', 'project.config.json should use the real mini program AppID');

const appConfig = readJson('wechat-miniprogram/miniprogram/app.json');
assert.deepStrictEqual(appConfig.pages, ['pages/index/index'], 'mini program should keep one shell page');
assert.strictEqual(appConfig.sitemapLocation, 'sitemap.json', 'mini program should include sitemap config');

const indexWxml = readText('wechat-miniprogram/miniprogram/pages/index/index.wxml');
assert.match(indexWxml, /<web-view\s+src="\{\{webViewUrl\}\}"/, 'index page should render the PWA through web-view');

const indexJs = readText('wechat-miniprogram/miniprogram/pages/index/index.js');
assert.match(indexJs, /WEB_VIEW_URL/, 'index page should read the PWA URL from config');
assert.doesNotMatch(indexJs, /https:\/\/[^'"]+/, 'index page should not hardcode the business domain');

const configJs = readText('wechat-miniprogram/miniprogram/config.js');
assert.match(configJs, /WEB_VIEW_URL:\s*'https:\/\/www\.flowtennis\.cn'/, 'config should use the verified business domain');

console.log('miniprogram shell tests passed');
