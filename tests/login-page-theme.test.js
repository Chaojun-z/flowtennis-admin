const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public', 'assets', 'styles', 'pages.css'), 'utf8');
const loginButtonRule = styles.match(/\.login-btn\{[^}]+\}/)?.[0] || '';

assert.match(html, /<meta name="theme-color" content="#805435">/, 'login page browser theme color should follow the current shell color');
assert.match(styles, /\.login-page\{[\s\S]*background:linear-gradient\(180deg,#805435 0%,#875C3C 42%,#F7F3EF 42%,#F7F3EF 100%\)/, 'login page should use the current shell brand background');
assert.match(styles, /\.login-card\{[\s\S]*border-radius:16px[\s\S]*box-shadow:0 18px 50px rgba\(47,37,29,0\.16\)/, 'login card should match the current calm management UI style');
assert.match(styles, /\.login-input\{[\s\S]*background:#FBF7F4[\s\S]*border:1px solid #E2D6CC[\s\S]*border-radius:8px/, 'login inputs should use the new neutral form tokens');
assert.match(styles, /\.login-btn\{[\s\S]*background:#805435[\s\S]*border-radius:8px/, 'login button should use the current primary shell color');
assert.doesNotMatch(loginButtonRule, /linear-gradient\(135deg,var\(--amber-base\),var\(--amber-warm\)\)/, 'login button should no longer use the old amber gradient');

console.log('login page theme tests passed');
