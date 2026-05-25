const http = require('http');

const PORT = Number(process.env.PORT || 8787);
const APPID = process.env.WECHAT_OFFICIAL_ACCOUNT_APPID || '';
const SECRET = process.env.WECHAT_OFFICIAL_ACCOUNT_SECRET || '';
const PROXY_SECRET = process.env.WECHAT_OFFICIAL_ACCOUNT_PROXY_SECRET || '';

let tokenCache = { token: '', expiresAt: 0 };

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('request_body_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function fetchAccessToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now) return tokenCache.token;
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(APPID)}&secret=${encodeURIComponent(SECRET)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`access_token_failed:${data.errmsg || data.errcode || res.status}`);
  }
  const ttlMs = Math.max(300000, ((parseInt(data.expires_in, 10) || 7200) - 300) * 1000);
  tokenCache = { token: data.access_token, expiresAt: now + ttlMs };
  return data.access_token;
}

async function sendTemplateMessage(message) {
  const token = await fetchAccessToken();
  const res = await fetch(`https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });
  const data = await res.json();
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`template_send_failed:${data.errmsg || data.errcode}`);
  }
  return data;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      return sendJson(res, 200, { ok: true });
    }
    if (req.method !== 'POST' || req.url !== '/wechat/send-template') {
      return sendJson(res, 404, { error: 'not_found' });
    }
    if (!APPID || !SECRET || !PROXY_SECRET) {
      return sendJson(res, 500, { error: 'missing_env' });
    }
    if (req.headers.authorization !== `Bearer ${PROXY_SECRET}`) {
      return sendJson(res, 401, { error: 'unauthorized' });
    }
    const rawBody = await readBody(req);
    const message = JSON.parse(rawBody || '{}');
    const data = await sendTemplateMessage(message);
    return sendJson(res, 200, data);
  } catch (err) {
    console.error('[wechat-official-proxy]', err.message);
    return sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`wechat official proxy listening on 127.0.0.1:${PORT}`);
});
