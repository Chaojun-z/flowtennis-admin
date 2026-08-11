const path = require('path');

const express = require('express');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
if (!process.env.DISABLE_HOT_SCAN_PREWARM) process.env.DISABLE_HOT_SCAN_PREWARM = 'true';

const apiHandler = require(path.join(__dirname, '..', 'api', 'index.js'));

const app = express();
const localReadonlyProxyCache = new Map();
const LOCAL_READONLY_PROXY_CACHE_TTL_MS = 300000;

app.use(express.json({ limit: '2mb' }));

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// API bridge to the Vercel-style handler
app.all('/api/*', async (req, res) => {
  const readonlyProxyPaths = new Set([
    '/api/leads',
    '/api/page-data/customer-center-list',
    '/api/page-data/student-detail'
  ]);
  if (process.env.LOCAL_READONLY_API_PROXY === 'online' && req.method === 'GET' && readonlyProxyPaths.has(req.path)) {
    const target = new URL(req.originalUrl.replace(/^\/api/, '/api'), 'https://www.flowtennis.cn');
    const headers = { 'Cache-Control': 'no-cache' };
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;
    if (req.headers.cookie) headers.Cookie = req.headers.cookie;
    const cacheKey = target.href;
    const cached = localReadonlyProxyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.status(cached.status);
      res.setHeader('Content-Type', cached.contentType);
      return res.end(cached.body);
    }
    const upstream = await fetch(target, { headers });
    const body = await upstream.text();
    localReadonlyProxyCache.set(cacheKey, {
      status: upstream.status,
      contentType: upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      body,
      expiresAt: Date.now() + LOCAL_READONLY_PROXY_CACHE_TTL_MS
    });
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    return res.end(body);
  }

  if (process.env.LOCAL_FINANCE_PAGE_PROXY === 'online' && req.method === 'GET' && req.path === '/api/page-data/finance') {
    const target = new URL(req.originalUrl.replace(/^\/api/, '/api'), 'https://www.flowtennis.cn');
    const headers = { 'Cache-Control': 'no-cache' };
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;
    if (req.headers.cookie) headers.Cookie = req.headers.cookie;
    const upstream = await fetch(target, { headers });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    return res.end(body);
  }

  // Provide minimal Express-style helpers used by api/index.js
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(body));
  };

  // Make req.url look like Vercel's "/api/..." so the handler's path parsing works unchanged.
  req.url = req.originalUrl;

  try {
    await apiHandler(req, res);
  } catch (err) {
    console.error('Local dev API error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`FlowTennis local dev: http://127.0.0.1:${port}`);
});
