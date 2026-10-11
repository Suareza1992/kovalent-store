import crypto from 'node:crypto';
import express from 'express';
import { db, listProducts, getProduct, getSettings, getOrder, listContent } from './db.js';
import { limiter, publicUser } from './auth.js';
import { providers, create, verify, stripeEvent, mpPayment, mpPaymentMatches, mpLocalAmount } from './payments.js';
import * as email from './email.js';
import { computeTotals, COUNTRY_CODES, US_TAX, SHIPPING_METHODS, isDomestic } from '../public/js/pricing.js';
import { translate, localizeProduct, countryName } from '../public/js/i18n.js';
import { fail, reqLang } from './http.js';

export const shop = express.Router();

/* ---------- payment method catalog ---------- */

export function paymentMethods(settings = getSettings()) {
  // Labels are translated in the browser by id (see i18n.js `pay.*`).
  const online = Object.keys(providers).filter((k) => providers[k]()).map((id) => ({ id, type: 'online' }));
  const manual = Object.entries(settings.manual).filter(([, m]) => m.enabled && m.instructions.trim()).map(([id]) => ({ id, type: 'manual' }));
  return [...online, ...manual];
}
export const methodLabel = (id, lang) => translate(lang, id === 'stripe' ? 'pay.stripe.short' : `pay.${id}`);

function publicSettings(s) {
  return { shipping: s.shipping, tax: s.tax, hasPromos: s.promos.length > 0 };
}

/* ---------- catalog ---------- */

shop.get('/bootstrap', (req, res) => {
  const settings = getSettings();
  res.set('Cache-Control', 'no-store').json({
    products: listProducts(),
    content: listContent(), // dynamic home-page sections, rendered by app.js
    settings: publicSettings(settings),
    payments: paymentMethods(settings),
    me: publicUser(req.user),
  });
});

const promoLimit = limiter({ windowMs: 10 * 60e3, max: 20 });
shop.post('/promo', (req, res) => {
  if (!promoLimit(req.ip)) return fail(res, 429, 'err.limit');
  const code = String(req.body?.code || '').trim().toUpperCase();
  const promo = getSettings().promos.find((p) => p.code === code);
  if (!promo) return fail(res, 404, 'err.promoInvalid');
  res.json({ code: promo.code, pct: promo.pct });
});

/* ---------- orders ---------- */

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateOrder(body, settings, lang) {
  const errors = {};
  const c = body.customer || {};
  const customer = {
    email: str(c.email, 120), first: str(c.first, 60), last: str(c.last, 60), phone: str(c.phone, 30),
    country: str(c.country, 2).toUpperCase(), address: str(c.address, 120), apt: str(c.apt, 60),
    city: str(c.city, 60), region: str(c.region, 60), zip: str(c.zip, 12), lang,
  };
  if (!EMAIL_RE.test(customer.email)) errors.email = 'err.email';
  if (!customer.first) errors.first = 'err.required';
  if (!customer.last) errors.last = 'err.required';
  if (!COUNTRY_CODES.has(customer.country)) errors.country = 'err.country';
  if (customer.address.length < 4) errors.address = 'err.address';
  if (!customer.city) errors.city = 'err.required';
  if (customer.country === 'PR') customer.region = 'PR';
  if (customer.country === 'US' && (US_TAX[customer.region] == null || customer.region === 'PR')) errors.region = 'err.required';
  if (isDomestic(customer.country) && !/^\d{5}$/.test(customer.zip)) errors.zip = 'err.zip';
  customer.countryName = countryName(lang, customer.country);

  const lines = [];
  const rawItems = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  for (const it of rawItems) {
    const p = localizeProduct(getProduct(String(it?.id || '')), lang); // snapshot names in the shopper's language
    const qty = Math.trunc(Number(it?.qty));
    if (!p || !(qty >= 1 && qty <= 99)) continue;
    lines.push({ id: p.id, name: p.name, size: p.size, price: p.price, qty, image: p.images?.[0] || null });
  }
  if (!lines.length) errors.items = 'err.cart';

  const methods = paymentMethods(settings);
  const payment = methods.find((m) => m.id === body.payment);
  if (!payment) errors.payment = 'err.payment';

  let promo = null;
  if (body.promo) {
    promo = settings.promos.find((p) => p.code === String(body.promo).toUpperCase());
    if (!promo) errors.promo = 'err.promoGone';
  }
  return { errors, customer, lines, payment, promo };
}

const orderLimit = limiter({ windowMs: 10 * 60e3, max: 15 });

shop.post('/orders', async (req, res, next) => {
  try {
    if (!orderLimit(req.ip)) return fail(res, 429, 'err.orderLimit');
    const settings = getSettings();
    const lang = reqLang(req);
    const { errors, customer, lines, payment, promo } = validateOrder(req.body || {}, settings, lang);
    if (Object.keys(errors).length) return fail(res, 400, errors.items ? 'err.cart' : errors.promo ? 'err.promoGone' : 'err.fields', { fields: errors });

    const t = computeTotals({ lines, settings, method: req.body.method, address: customer, promoPct: promo?.pct || 0 });
    const totals = { ...t, promo: promo?.code || null, methodLabel: translate(lang, `ship.${t.method}`) };
    if (payment.id === 'mercadopago') {
      totals.local = { currency: settings.mercadopago.currency, amount: mpLocalAmount(t.total, settings.mercadopago), rate: settings.mercadopago.usdRate };
    }

    const id = crypto.randomBytes(18).toString('base64url');
    let number;
    for (let i = 0; i < 10; i++) {
      number = `KV-${crypto.randomInt(100000, 999999)}`;
      if (!db.prepare('SELECT 1 FROM orders WHERE number = ?').get(number)) break;
    }
    db.prepare(`INSERT INTO orders (id, number, status, email, customer, items, totals, payment_method)
      VALUES (?, ?, 'pending_payment', ?, ?, ?, ?, ?)`)
      .run(id, number, customer.email, JSON.stringify(customer), JSON.stringify(lines), JSON.stringify(totals), payment.id);
    const order = getOrder(id);

    if (payment.type === 'manual') {
      email.orderPlacedManual(order, settings.manual[payment.id].instructions);
      return res.json({ order: id });
    }
    let result;
    try {
      result = await create[payment.id](order, baseUrl(req));
    } catch (err) {
      // The customer never reached the payment page, so this order can't be paid; don't leave it dangling.
      db.prepare(`UPDATE orders SET status = 'cancelled', notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(`Auto-cancelled: ${payment.label} was unavailable when the order was placed.`, id);
      throw err;
    }
    db.prepare('UPDATE orders SET payment_ref = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(result.ref, id);
    res.json({ order: id, redirect: result.redirect });
  } catch (err) { next(err); }
});

// Customer-facing order status. The id is a 144-bit random token, so the link itself is the credential.
shop.get('/orders/:id', async (req, res, next) => {
  try {
    let order = getOrder(req.params.id);
    if (!order) return fail(res, 404, 'err.orderNotFound');
    if (order.status === 'pending_payment' && verify[order.payment_method] && req.query.refresh) {
      await confirmPayment(order);
      order = getOrder(order.id);
    }
    const settings = getSettings();
    const manual = settings.manual[order.payment_method];
    res.set('Cache-Control', 'no-store').json({
      number: order.number,
      status: order.status,
      email: order.email,
      items: order.items,
      totals: order.totals,
      paymentMethod: order.payment_method,
      paymentLabel: methodLabel(order.payment_method, reqLang(req)),
      manual: Boolean(manual),
      instructions: manual && order.status === 'pending_payment' ? manual.instructions : null,
      tracking: order.tracking,
      createdAt: order.created_at,
      days: SHIPPING_METHODS[order.totals.method]?.days,
    });
  } catch (err) { next(err); }
});

/* ---------- marking orders paid ---------- */

export function markPaid(order, ref) {
  const changed = db.prepare(`UPDATE orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
    payment_ref = COALESCE(?, payment_ref) WHERE id = ? AND status = 'pending_payment'`).run(ref || null, order.id).changes;
  if (changed) email.orderPaid(getOrder(order.id));
  return changed > 0;
}

async function confirmPayment(order) {
  try {
    const ok = await verify[order.payment_method](order);
    if (ok) markPaid(order, ok.ref);
  } catch (err) {
    console.error('[payments] verification error', err.message);
  }
}

/* ---------- webhooks (mounted before the JSON body parser) ---------- */

export const webhooks = express.Router();

webhooks.post('/stripe', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const event = stripeEvent(req.body.toString('utf8'), req.get('stripe-signature'));
  if (!event) return res.status(400).send('Invalid signature');
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    const s = event.data.object;
    const order = getOrder(s.client_reference_id);
    if (order && s.payment_status === 'paid' && s.amount_total === Math.round(order.totals.total * 100)) markPaid(order, s.payment_intent || s.id);
  }
  res.json({ received: true });
});

webhooks.post('/mercadopago', express.json({ limit: '100kb' }), async (req, res) => {
  res.sendStatus(200); // acknowledge fast; Mercado Pago retries otherwise
  const type = req.body?.type || req.query.type || req.query.topic;
  const id = req.body?.data?.id || req.query['data.id'] || req.query.id;
  if (type !== 'payment' || !id || !providers.mercadopago()) return;
  try {
    const payment = await mpPayment(id);
    const order = getOrder(payment.external_reference);
    if (order && mpPaymentMatches(payment, order)) markPaid(order, String(payment.id));
  } catch (err) {
    console.error('[webhook] mercadopago', err.message);
  }
});

/* ---------- helpers ---------- */

export function baseUrl(req) {
  // In production PUBLIC_URL is authoritative, so a spoofed Host header can't redirect customers elsewhere.
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}
