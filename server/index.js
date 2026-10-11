import path from 'node:path';
import express from 'express';
import { ROOT, UPLOAD_DIR } from './db.js';
import { loadUser, ensureSuperadmin } from './auth.js';
import { shop, webhooks } from './shop.js';
import { admin } from './admin.js';
import { fail } from './http.js';

const PUBLIC = path.join(ROOT, 'public');
const isProd = process.env.NODE_ENV === 'production';
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // behind Railway's / any host's HTTPS proxy

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  });
  if (isProd) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Webhooks need the raw, unparsed body for signature checks, so they go before express.json().
app.use('/api/webhooks', webhooks);

app.use(express.json({ limit: '200kb' }));
app.use(loadUser);

// CSRF guard: every state-changing API call from our own pages sends this header,
// which a cross-site form or image can't set. (Session cookies are also SameSite=Strict.)
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.get('x-requested-with') !== 'kovalent') return fail(res, 403, 'err.forbidden');
  next();
});

app.use('/api', shop);
app.use('/api', admin);
app.use('/api', (_req, res) => fail(res, 404, 'err.notFound'));

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true, fallthrough: false }));
app.use(express.static(PUBLIC, { maxAge: isProd ? '1h' : 0 }));
app.get('/admin', (_req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode;
  if (status >= 400 && status < 500 && !err.publicMessage && err.type !== 'entity.too.large') return res.status(status).end(); // e.g. static 403/404
  if (err.type === 'entity.too.large') return fail(res, 413, 'err.tooLarge');
  console.error(err);
  fail(res, err.status || 500, err.publicMessage || 'err.generic');
});

ensureSuperadmin();
const port = Number(process.env.PORT) || 5195;
app.listen(port, () => console.log(`Kovalent running on http://localhost:${port}`));
