const path = require('path');
const fs = require('fs');

const express = require('express');
const dotenv = require('dotenv');

const envCandidates = [
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '..', '..', '.env')
];
const envPath = envCandidates.find(file => fs.existsSync(file));
if (envPath) dotenv.config({ path: envPath });

const apiHandler = require(path.join(__dirname, '..', 'api', 'index.js'));

const app = express();

app.use(express.json({ limit: '2mb' }));

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// API bridge to the Vercel-style handler
app.all('/api/*', async (req, res) => {
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
