// Optional order emails through Resend (https://resend.com). Without RESEND_API_KEY + MAIL_FROM
// the emails are skipped and just logged, and the admin still sees every order in the Orders panel.
// Customer emails go out in the language the order was placed in; staff alerts use Spanish.
import { getSettings } from './db.js';
import { translate, formatMoney, DEFAULT_LANG } from '../public/js/i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const langOf = (order) => order.customer?.lang || DEFAULT_LANG;
const methodName = (id, lang) => translate(lang, id === 'stripe' ? 'pay.stripe.short' : `pay.${id}`);

async function send(to, subject, html) {
  const { RESEND_API_KEY, MAIL_FROM } = process.env;
  if (!RESEND_API_KEY || !MAIL_FROM || !to) { console.log(`[email] skipped "${subject}" → ${to || '(no recipient)'}`); return; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, html }),
    });
    if (!res.ok) console.error('[email] send failed', res.status, await res.text());
  } catch (err) {
    console.error('[email] send failed', err.message);
  }
}

function orderTable(order, lang) {
  const t = (k, v) => translate(lang, k, v);
  const m = (n) => formatMoney(lang, n);
  const rows = order.items.map((i) => `<tr><td>${esc(i.name)} × ${i.qty}</td><td align="right">${m(i.price * i.qty)}</td></tr>`).join('');
  const tt = order.totals;
  return `<table cellpadding="6" style="border-collapse:collapse;width:100%;max-width:520px;font-family:Arial,sans-serif;font-size:14px">
    ${rows}
    ${tt.discount ? `<tr><td>${esc(t('mail.discount'))} (${esc(tt.promo)})</td><td align="right">−${m(tt.discount)}</td></tr>` : ''}
    <tr><td>${esc(t('mail.shipping'))} (${esc(t(`ship.${tt.method}`))})</td><td align="right">${tt.shipping ? m(tt.shipping) : esc(t('mail.free'))}</td></tr>
    <tr><td>${esc(t('mail.tax'))}</td><td align="right">${m(tt.tax || 0)}</td></tr>
    <tr><td><b>${esc(t('mail.total'))}</b></td><td align="right"><b>${m(tt.total)}</b></td></tr>
  </table>`;
}

function address(c) {
  return [`${c.first} ${c.last}`, c.address, c.apt, `${c.city}${c.region ? `, ${c.region}` : ''} ${c.zip || ''}`, c.countryName].filter(Boolean).map(esc).join('<br>');
}

const b = (s) => `<b>${esc(s)}</b>`;

export function orderPlacedManual(order, instructions) {
  const lang = langOf(order);
  const t = (k, v) => translate(lang, k, v);
  send(order.email, t('mail.instructionsSubject', { n: order.number }), `
    <p>${t('mail.instructionsIntro', { amount: b(formatMoney(lang, order.totals.total)), method: b(methodName(order.payment_method, lang)) })}</p>
    <p style="white-space:pre-line;background:#f3f4f6;padding:12px;border-radius:8px">${esc(instructions)}</p>
    <p>${t('mail.instructionsNote', { n: b(order.number) })}</p>
    ${orderTable(order, lang)}`);
  notifyAdmin(order, 'a.st.transfer');
}

export function orderPaid(order) {
  const lang = langOf(order);
  const t = (k, v) => translate(lang, k, v);
  send(order.email, t('mail.paidSubject', { n: order.number }), `
    <p>${t('mail.paidIntro', { n: b(order.number) })}</p>
    ${orderTable(order, lang)}
    <p><b>${esc(t('mail.shippingTo'))}</b><br>${address(order.customer)}</p>`);
  notifyAdmin(order, 'a.st.paid');
}

export function orderShipped(order) {
  const lang = langOf(order);
  const t = (k, v) => translate(lang, k, v);
  send(order.email, t('mail.shippedSubject', { n: order.number }), `
    <p>${t('mail.shippedIntro', { n: b(order.number) })}</p>
    ${order.tracking ? `<p>${esc(t('mail.tracking'))}: <b>${esc(order.tracking)}</b></p>` : ''}`);
}

function notifyAdmin(order, statusKey) {
  const to = getSettings().contactEmail || process.env.ORDER_NOTIFY_EMAIL;
  const lang = DEFAULT_LANG;
  const headline = translate(lang, statusKey);
  send(to, `${headline}: ${order.number} (${formatMoney(lang, order.totals.total)})`, `
    <p><b>${esc(headline)}</b> · ${esc(methodName(order.payment_method, lang))}</p>
    <p>${esc(order.email)}${order.customer.phone ? ` · ${esc(order.customer.phone)}` : ''}</p>
    <p>${address(order.customer)}</p>
    ${orderTable(order, lang)}`);
}
