import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { db, UPLOAD_DIR, listProducts, getProduct, getSettings, saveSettings, getOrder, parseOrder } from './db.js';
import { requireUser, requireSuper, hashPassword, verifyPassword, randomPassword, startSession, endSession, publicUser, limiter } from './auth.js';
import { providers } from './payments.js';
import { markPaid } from './shop.js';
import * as email from './email.js';
import { CATEGORIES, COLLECTIONS } from '../public/js/data.js';
import { US_TAX, round2 } from '../public/js/pricing.js';
import { fail } from './http.js';

export const admin = express.Router();

/* ==========================================================================
   Auth
   ========================================================================== */
const loginLimit = limiter({ windowMs: 15 * 60e3, max: 10 });

admin.post('/auth/login', (req, res) => {
  const emailAddr = String(req.body?.email || '').trim().toLowerCase();
  if (!loginLimit(`${req.ip}|${emailAddr}`)) return fail(res, 429, 'err.loginLimit');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(emailAddr);
  if (!user || !verifyPassword(String(req.body?.password || ''), user.password_hash)) {
    return fail(res, 401, 'err.login');
  }
  startSession(res, user.id);
  res.json({ me: publicUser(user) });
});

admin.post('/auth/logout', (req, res) => { endSession(req, res); res.json({ ok: true }); });

admin.use('/admin', requireUser);

admin.put('/admin/me/password', (req, res) => {
  const { current, next } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(String(current || ''), user.password_hash)) return fail(res, 400, 'err.currentPw');
  if (String(next || '').length < 10) return fail(res, 400, 'err.pwShort');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id); // sign out other devices
  startSession(res, user.id);
  res.json({ ok: true });
});

/* ==========================================================================
   Products
   ========================================================================== */
const SHAPES = ['bottle', 'spray', 'squeeze', 'pad', 'towel', 'block', 'applicator', 'kit'];
const IMAGE_PATH = /^\/uploads\/[A-Za-z0-9_-]{8,64}\.(jpg|png|webp)$/;
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const list = (v, maxItems, maxLen) => (Array.isArray(v) ? v : []).map((s) => text(s, maxLen)).filter(Boolean).slice(0, maxItems);

// Per-language text fields (Spanish on the product itself, English/Portuguese under `tr`).
function cleanText(input = {}) {
  const specs = {};
  (Array.isArray(input.specs) ? input.specs : []).slice(0, 20).forEach((pair) => {
    if (!Array.isArray(pair)) return;
    const key = text(pair[0], 40); const val = text(pair[1], 160);
    if (key && val) specs[key] = val;
  });
  const benefits = (Array.isArray(input.benefits) ? input.benefits : []).slice(0, 6)
    .filter(Array.isArray).map(([ti, d]) => [text(ti, 60), text(d, 200)]).filter(([ti]) => ti);
  return {
    name: text(input.name, 120),
    tagline: text(input.tagline, 160),
    size: text(input.size, 40),
    ribbon: text(input.ribbon, 20),
    badges: list(input.badges, 6, 24),
    description: text(input.description, 2000),
    specs,
    instructions: list(input.instructions, 15, 300),
    compatibility: list(input.compatibility, 20, 40),
    benefits,
  };
}

function cleanProduct(input, existing = {}) {
  const errors = {};
  const base = cleanText(input);
  if (!base.name) errors.name = 'err.name';
  const price = round2(Number(input.price));
  if (!(price >= 0 && price <= 100000)) errors.price = 'err.price';
  const category = CATEGORIES.includes(input.category) && input.category !== 'All' ? input.category : null;
  if (!category) errors.category = 'err.category';

  const { rating, reviews, sample, ...kept } = existing; // retire legacy demo-rating fields
  const product = {
    ...kept,
    ...base,
    short: text(input.short, 12).toUpperCase() || base.name.split(/\s+/)[0].toUpperCase().slice(0, 10),
    category,
    collections: list(input.collections, 4, 20).filter((c) => COLLECTIONS[c]),
    price,
    images: list(input.images, 8, 120).filter((u) => IMAGE_PATH.test(u)),
    shape: SHAPES.includes(input.shape) ? input.shape : existing.shape || 'bottle',
    hue: Math.max(0, Math.min(360, Math.round(Number(input.hue) || 0))),
    pairs: list(input.pairs, 4, 80).filter((id) => id !== existing.id && getProduct(id)),
    tr: { en: cleanText(input.tr?.en), pt: cleanText(input.tr?.pt) },
  };
  return { errors, product };
}

function slugify(name) {
  const base = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'product';
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

admin.post('/admin/products', (req, res) => {
  const { errors, product } = cleanProduct(req.body || {});
  if (Object.keys(errors).length) return fail(res, 400, 'err.fields', { fields: errors });
  const id = slugify(product.name);
  const top = db.prepare('SELECT COALESCE(MIN(sort), 0) AS s FROM products').get().s;
  db.prepare('INSERT INTO products (id, data, sort) VALUES (?, ?, ?)').run(id, JSON.stringify({ ...product, id }), top - 1);
  res.status(201).json({ product: getProduct(id), products: listProducts() });
});

admin.put('/admin/products/:id', (req, res) => {
  const existing = getProduct(req.params.id);
  if (!existing) return fail(res, 404, 'err.productNotFound');
  const { errors, product } = cleanProduct(req.body || {}, existing);
  if (Object.keys(errors).length) return fail(res, 400, 'err.fields', { fields: errors });
  db.prepare('UPDATE products SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify({ ...product, id: existing.id }), existing.id);
  res.json({ product: getProduct(existing.id), products: listProducts() });
});

// Soft delete: the product disappears from the store, but past orders keep their snapshot.
admin.delete('/admin/products/:id', (req, res) => {
  const changed = db.prepare('UPDATE products SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted = 0').run(req.params.id).changes;
  if (!changed) return fail(res, 404, 'err.productNotFound');
  res.json({ products: listProducts() });
});

/* ---------- photo uploads (raw body; the browser resizes before sending) ---------- */

function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

admin.post('/admin/uploads', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return fail(res, 400, 'err.imageMissing');
  const ext = sniffImage(req.body); // trust the file's bytes, not its declared type
  if (!ext) return fail(res, 400, 'err.imageType');
  const name = `${crypto.randomBytes(12).toString('base64url')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), req.body);
  res.status(201).json({ url: `/uploads/${name}` });
});

/* ==========================================================================
   Orders
   ========================================================================== */
admin.get('/admin/orders', (req, res) => {
  const status = ['pending_payment', 'paid', 'shipped', 'cancelled'].includes(req.query.status) ? req.query.status : null;
  const rows = status
    ? db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT 300').all(status)
    : db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 300').all();
  const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all().map((r) => [r.status, r.n]));
  // Transfers (Zelle etc.) need a human to confirm; unpaid card/PayPal checkouts are usually just abandoned.
  counts.awaiting_transfer = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE status = 'pending_payment'
    AND payment_method NOT IN ('stripe', 'paypal', 'mercadopago')`).get().n;
  res.json({ orders: rows.map(parseOrder), counts });
});

admin.patch('/admin/orders/:id', (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return fail(res, 404, 'err.orderNotFound');
  const { action, tracking, notes } = req.body || {};
  if (notes !== undefined) db.prepare('UPDATE orders SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(text(notes, 2000), order.id);

  if (action === 'mark_paid') {
    if (order.status !== 'pending_payment') return fail(res, 400, 'err.onlyPending');
    markPaid(order, `manual:${req.user.email}`);
  } else if (action === 'mark_shipped') {
    if (order.status !== 'paid') return fail(res, 400, 'err.onlyPaid');
    db.prepare(`UPDATE orders SET status = 'shipped', tracking = ?, shipped_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(text(tracking, 120) || null, order.id);
    email.orderShipped(getOrder(order.id));
  } else if (action === 'cancel') {
    if (!['pending_payment', 'paid'].includes(order.status)) return fail(res, 400, 'err.noCancel');
    db.prepare(`UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(order.id);
  } else if (action) {
    return fail(res, 400, 'err.generic');
  }
  res.json({ order: getOrder(order.id) });
});

/* ==========================================================================
   Settings
   ========================================================================== */
admin.get('/admin/settings', (_req, res) => {
  res.json({
    settings: getSettings(),
    providers: Object.fromEntries(Object.keys(providers).map((k) => [k, providers[k]()])),
    email: Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM),
  });
});

const MP_CURRENCIES = ['MXN', 'ARS', 'BRL', 'CLP', 'COP', 'PEN', 'UYU'];
admin.put('/admin/settings', (req, res) => {
  const b = req.body || {};
  const cur = getSettings();
  const money = (v, fallback) => { const n = round2(Number(v)); return n >= 0 && n <= 10000 ? n : fallback; };
  const contactEmail = text(b.contactEmail, 120);
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail)) return fail(res, 400, 'err.notifyEmail');

  const promos = [];
  for (const p of Array.isArray(b.promos) ? b.promos.slice(0, 30) : []) {
    const code = text(p.code, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const pct = Math.round(Number(p.pct));
    if (code.length >= 3 && pct >= 1 && pct <= 90 && !promos.some((x) => x.code === code)) promos.push({ code, pct });
  }
  const rate = Number(b.mercadopago?.usdRate);
  const next = {
    contactEmail,
    shipping: Object.fromEntries(Object.keys(cur.shipping).map((k) => [k, money(b.shipping?.[k], cur.shipping[k])])),
    tax: {
      enabled: Boolean(b.tax?.enabled),
      states: list(b.tax?.states, 60, 2).map((s) => s.toUpperCase()).filter((s) => US_TAX[s] != null),
    },
    promos,
    manual: Object.fromEntries(Object.entries(cur.manual).map(([k, m]) => [k, {
      label: m.label,
      enabled: Boolean(b.manual?.[k]?.enabled),
      instructions: text(b.manual?.[k]?.instructions, 1000),
    }])),
    mercadopago: {
      currency: MP_CURRENCIES.includes(b.mercadopago?.currency) ? b.mercadopago.currency : cur.mercadopago.currency,
      usdRate: rate > 0 && rate < 100000 ? rate : cur.mercadopago.usdRate,
    },
  };
  saveSettings(next);
  res.json({ settings: getSettings() });
});

/* ==========================================================================
   Users (superadmin only)
   ========================================================================== */
admin.get('/admin/users', requireSuper, (_req, res) => {
  res.json({ users: db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY role DESC, created_at').all() });
});

admin.post('/admin/users', requireSuper, (req, res) => {
  const emailAddr = text(req.body?.email, 120).toLowerCase();
  const name = text(req.body?.name, 60);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailAddr) || !name) return fail(res, 400, 'err.userFields');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(emailAddr)) return fail(res, 409, 'err.userExists');
  const password = randomPassword();
  db.prepare("INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, 'admin', ?)").run(emailAddr, name, hashPassword(password));
  res.status(201).json({ tempPassword: password }); // shown once to the superadmin to pass along
});

admin.post('/admin/users/:id/reset', requireSuper, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'admin'").get(req.params.id);
  if (!user) return fail(res, 404, 'err.adminNotFound');
  const password = randomPassword();
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  res.json({ tempPassword: password });
});

admin.delete('/admin/users/:id', requireSuper, (req, res) => {
  const changed = db.prepare("DELETE FROM users WHERE id = ? AND role = 'admin'").run(req.params.id).changes;
  if (!changed) return fail(res, 404, 'err.adminNotFound');
  res.json({ ok: true });
});
