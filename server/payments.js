// Hosted-checkout integrations. Customers pay on Stripe / PayPal / Mercado Pago's own pages,
// so card numbers never touch this server. A provider is offered only when its keys are set.
// Every "paid" decision is made by asking the provider's API, never by trusting the return URL.
import crypto from 'node:crypto';
import { round2 } from '../public/js/pricing.js';
import { LANGS } from '../public/js/i18n.js';

const env = process.env;
const cents = (n) => Math.round(n * 100);

export const providers = {
  stripe: () => Boolean(env.STRIPE_SECRET_KEY),
  paypal: () => Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
  mercadopago: () => Boolean(env.MP_ACCESS_TOKEN),
};

async function call(url, opts, what) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    console.error(`[payments] ${what} failed (${res.status})`, text.slice(0, 500));
    throw Object.assign(new Error(`${what} failed`), { status: 502, publicMessage: 'err.provider' });
  }
  return body;
}

/* ==========================================================================
   Stripe Checkout
   ========================================================================== */
function stripeHeaders() {
  return { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' };
}

export async function stripeCreate(order, baseUrl) {
  const p = new URLSearchParams();
  p.append('mode', 'payment');
  p.append('success_url', `${baseUrl}/?order=${order.id}`);
  p.append('cancel_url', `${baseUrl}/?order=${order.id}&cancelled=1`);
  p.append('customer_email', order.email);
  p.append('client_reference_id', order.id);
  p.append('locale', LANGS[order.customer.lang]?.stripe || 'auto');
  p.append('metadata[order_id]', order.id);
  p.append('metadata[order_number]', order.number);
  p.append('payment_intent_data[description]', `Kovalent order ${order.number}`);

  // Stripe line items can't be negative, so a discounted order is charged as one combined line.
  const lines = order.totals.discount > 0
    ? [{ name: `Kovalent order ${order.number} (${order.items.length} items, ${order.totals.promo} applied)`, amount: order.totals.net, qty: 1 }]
    : order.items.map((i) => ({ name: i.name, amount: i.price, qty: i.qty }));
  if (order.totals.shipping > 0) lines.push({ name: `Shipping (${order.totals.methodLabel})`, amount: order.totals.shipping, qty: 1 });
  if (order.totals.tax > 0) lines.push({ name: `Sales tax (${order.totals.rate}%)`, amount: order.totals.tax, qty: 1 });
  lines.forEach((l, i) => {
    p.append(`line_items[${i}][quantity]`, String(l.qty));
    p.append(`line_items[${i}][price_data][currency]`, 'usd');
    p.append(`line_items[${i}][price_data][unit_amount]`, String(cents(l.amount)));
    p.append(`line_items[${i}][price_data][product_data][name]`, l.name.slice(0, 250));
  });

  const session = await call('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: stripeHeaders(), body: p }, 'Stripe session');
  return { redirect: session.url, ref: session.id };
}

export async function stripeVerify(order) {
  if (!order.payment_ref) return null;
  const s = await call(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(order.payment_ref)}`, { headers: stripeHeaders() }, 'Stripe session lookup');
  const ok = s.payment_status === 'paid' && s.client_reference_id === order.id && s.amount_total === cents(order.totals.total) && s.currency === 'usd';
  return ok ? { ref: s.payment_intent || s.id } : null;
}

// Verifies the Stripe-Signature header (HMAC-SHA256 over "timestamp.rawBody").
export function stripeEvent(rawBody, header) {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return null;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')).filter(([k]) => k === 't' || k === 'v1').map(([k, v]) => [k, v]));
  const signatures = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  if (!parts.t || !signatures.length || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return null;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  const valid = signatures.some((sig) => sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
  return valid ? JSON.parse(rawBody) : null;
}

/* ==========================================================================
   PayPal Orders v2 (redirect flow)
   ========================================================================== */
const paypalBase = () => (env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');

async function paypalToken() {
  const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const body = await call(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials',
  }, 'PayPal auth');
  return body.access_token;
}

export async function paypalCreate(order, baseUrl) {
  const token = await paypalToken();
  const body = await call(`${paypalBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `create-${order.id}` },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: order.id,
        custom_id: order.id,
        invoice_id: order.number,
        description: `Kovalent order ${order.number}`,
        amount: { currency_code: 'USD', value: order.totals.total.toFixed(2) },
      }],
      payment_source: { paypal: { experience_context: {
        brand_name: 'Kovalent', user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING',
        return_url: `${baseUrl}/?order=${order.id}`, cancel_url: `${baseUrl}/?order=${order.id}&cancelled=1`,
      } } },
    }),
  }, 'PayPal order');
  const link = body.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve');
  if (!link) throw Object.assign(new Error('PayPal returned no approval link'), { status: 502, publicMessage: 'err.provider' });
  return { redirect: link.href, ref: body.id };
}

// PayPal orders must be captured after the buyer approves; capture is idempotent via PayPal-Request-Id.
export async function paypalVerify(order) {
  if (!order.payment_ref) return null;
  const token = await paypalToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  let po = await call(`${paypalBase()}/v2/checkout/orders/${encodeURIComponent(order.payment_ref)}`, { headers }, 'PayPal lookup');
  if (po.status === 'APPROVED') {
    po = await call(`${paypalBase()}/v2/checkout/orders/${encodeURIComponent(order.payment_ref)}/capture`, {
      method: 'POST', headers: { ...headers, 'PayPal-Request-Id': `capture-${order.id}` },
    }, 'PayPal capture');
  }
  if (po.status !== 'COMPLETED') return null;
  const capture = po.purchase_units?.[0]?.payments?.captures?.[0];
  const ok = capture && capture.status === 'COMPLETED' && capture.amount?.currency_code === 'USD' && Number(capture.amount.value) === order.totals.total;
  return ok ? { ref: capture.id } : null;
}

/* ==========================================================================
   Mercado Pago Checkout Pro
   Mercado Pago charges in the merchant account's local currency, so the USD total
   is converted with the rate the admin sets in Settings.
   ========================================================================== */
const ZERO_DECIMAL = new Set(['CLP', 'COP', 'PYG']);
export function mpLocalAmount(totalUsd, mp) {
  const local = totalUsd * mp.usdRate;
  return ZERO_DECIMAL.has(mp.currency) ? Math.round(local) : round2(local);
}

const mpHeaders = () => ({ Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' });

export async function mpCreate(order, baseUrl) {
  const { currency, amount } = order.totals.local;
  const pref = await call('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { ...mpHeaders(), 'X-Idempotency-Key': `pref-${order.id}` },
    body: JSON.stringify({
      items: [{ id: order.number, title: `Kovalent order ${order.number}`, quantity: 1, currency_id: currency, unit_price: amount }],
      payer: { email: order.email },
      external_reference: order.id,
      back_urls: {
        success: `${baseUrl}/?order=${order.id}`,
        pending: `${baseUrl}/?order=${order.id}`,
        failure: `${baseUrl}/?order=${order.id}&cancelled=1`,
      },
      auto_return: 'approved',
      notification_url: `${baseUrl}/api/webhooks/mercadopago`,
      statement_descriptor: 'KOVALENT',
    }),
  }, 'Mercado Pago preference');
  const sandbox = env.MP_ACCESS_TOKEN.startsWith('TEST-');
  return { redirect: sandbox ? pref.sandbox_init_point : pref.init_point, ref: pref.id };
}

function mpPaymentMatches(payment, order) {
  const { currency, amount } = order.totals.local;
  return payment.status === 'approved' && payment.external_reference === order.id
    && payment.currency_id === currency && Math.abs(Number(payment.transaction_amount) - amount) < 0.01;
}

export async function mpVerify(order) {
  const q = new URLSearchParams({ external_reference: order.id, sort: 'date_created', criteria: 'desc' });
  const res = await call(`https://api.mercadopago.com/v1/payments/search?${q}`, { headers: mpHeaders() }, 'Mercado Pago search');
  const paid = res.results?.find((p) => mpPaymentMatches(p, order));
  return paid ? { ref: String(paid.id) } : null;
}

// Webhooks only carry an id; we fetch the payment from Mercado Pago itself, so a forged call can't mark anything paid.
export async function mpPayment(id) {
  return call(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, { headers: mpHeaders() }, 'Mercado Pago payment');
}
export { mpPaymentMatches };

export const create = { stripe: stripeCreate, paypal: paypalCreate, mercadopago: mpCreate };
export const verify = { stripe: stripeVerify, paypal: paypalVerify, mercadopago: mpVerify };
