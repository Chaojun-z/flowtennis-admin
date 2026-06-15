const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const apiSource = fs.readFileSync(path.join(root, 'api', 'index.js'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const wechatIndexScript = fs.readFileSync(path.join(root, 'scripts', 'backfill-wechat-user-index.js'), 'utf8');
const matchKeepaliveWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'match-supabase-keepalive.yml'), 'utf8');

assert.doesNotMatch(
  apiSource,
  /TS_INSTANCE\s*=\s*process\.env\.TS_INSTANCE\s*\|\|\s*['"]flowtennis['"]/,
  'API must not silently fall back to the old TableStore instance'
);

assert.match(
  apiSource,
  /REQUIRED_ENV_VARS\s*=\s*\[[^\]]*['"]TS_INSTANCE['"][^\]]*\]/,
  'TS_INSTANCE must be a required runtime env var'
);

assert.doesNotMatch(
  wechatIndexScript,
  /TS_INSTANCE\s*=\s*process\.env\.TS_INSTANCE\s*\|\|\s*['"]flowtennis['"]/,
  'write-capable scripts must not silently fall back to the old TableStore instance'
);

assert.doesNotMatch(
  apiSource,
  /setHeader\(['"]Access-Control-Allow-Origin['"],\s*['"]\*['"]\)/,
  'API CORS must not globally allow every origin'
);

assert.match(apiSource, /function applyCorsHeaders\(req,res\)/, 'API should centralize CORS decisions');
assert.match(apiSource, /if\(req\.method==='OPTIONS'\)\{applyCorsHeaders\(req,res\);return res\.status\(200\)\.end\(\);\}/, 'OPTIONS should use the same CORS guard');

assert.match(apiSource, /function requireDiagnosticsAccess\(req,res\)/, 'diagnostics endpoints should have an auth guard');
assert.match(apiSource, /if\(path==='\/match-diag'&&method==='GET'\)\{[\s\S]*if\(!requireDiagnosticsAccess\(req,res\)\)return;/, 'match diagnostics must be protected');
assert.match(apiSource, /if\(path==='\/diag'&&method==='GET'\)\{[\s\S]*if\(!requireDiagnosticsAccess\(req,res\)\)return;/, 'TableStore diagnostics must be protected');

assert.match(apiSource, /function checkLoginRateLimit\(req,username/, 'login should check a rate limit before password verification');
assert.match(apiSource, /recordLoginAttempt\(req,username,false\)/, 'login failures should be recorded');
assert.match(apiSource, /recordLoginAttempt\(req,username,true\)/, 'login success should clear the rate limit');

assert.doesNotMatch(readme, /TS_INSTANCE`\s*—\s*`flowtennis`/, 'README must not document the old production instance');
assert.doesNotMatch(readme, /JWT_SECRET`\s*—\s*`flowtennis-jwt-2026`/, 'README must not document a hardcoded JWT secret');

assert.match(matchKeepaliveWorkflow, /DIAG_TOKEN:\s*\$\{\{\s*secrets\.DIAG_TOKEN\s*\}\}/, 'match diagnostics workflow must use DIAG_TOKEN');
assert.match(matchKeepaliveWorkflow, /Authorization:\s*Bearer \$DIAG_TOKEN/, 'match diagnostics workflow must call protected diagnostics with authorization');

console.log('production safety locks tests passed');
