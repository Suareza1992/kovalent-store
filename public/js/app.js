import { CATEGORIES, COLLECTIONS, PRODUCTS as LAUNCH_PRODUCTS } from './data.js';
import { productArt, heroArt, LOGO_MARK } from './art.js';
import { computeTotals, COUNTRIES, US_STATES, SHIPPING_METHODS, shippingOptions, isDomestic } from './pricing.js';
import { LANGS, DEFAULT_LANG, isLang, translate, hasKey, localizeProduct, formatMoney, countryName } from './i18n.js';
import { SECTIONS, SECTION_KEYS, ICONS, localizeItem } from './sections.js';

/* ==========================================================================
   Language
   ========================================================================== */
const LANG_KEY = 'kovalent.lang';
let lang = (() => {
  try { const saved = localStorage.getItem(LANG_KEY); if (isLang(saved)) return saved; } catch { /* storage unavailable */ }
  return DEFAULT_LANG;
})();
const t = (key, vars) => translate(lang, key, vars);
const money = (n) => formatMoney(lang, n);

/* ==========================================================================
   Helpers
   ========================================================================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms) => { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; };
const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
  truck: '<svg viewBox="0 0 24 24"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  cart: '<svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20.5" r="1.3"/><circle cx="17" cy="20.5" r="1.3"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

/**
 * JSON API helper. X-Requested-With satisfies the server's CSRF guard; X-Lang lets it pick
 * the language for emails. Server errors come back as codes that are translated here.
 */
async function api(path, { method = 'GET', body, raw, contentType } = {}) {
  const opts = { method, headers: { 'X-Requested-With': 'kovalent', 'X-Lang': lang }, credentials: 'same-origin' };
  if (raw) { opts.body = raw; opts.headers['Content-Type'] = contentType; }
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(`/api${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.code && hasKey(data.code) ? t(data.code) : data.error || t('err.generic');
    throw Object.assign(new Error(message), { status: res.status, code: data.code, fields: data.fields });
  }
  return data;
}

/* ==========================================================================
   Catalog data
   `source` keeps the API objects (all languages) for the admin editor. `rawById` is the
   current-language text, unescaped (search). `PRODUCTS` / `byId` are the current-language
   text escaped once, so every template can interpolate product fields safely.
   ========================================================================== */
let source = [];
let PRODUCTS = [];
let byId = {};
let rawById = {};
const escapeDeep = (v) => (typeof v === 'string' ? esc(v) : Array.isArray(v) ? v.map(escapeDeep)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, escapeDeep(x)])) : v);

function setProducts(list) {
  source = list;
  const localized = list.map((p) => ({ badges: [], collections: [], pairs: [], images: [], specs: {}, instructions: [], compatibility: [], benefits: [], ...localizeProduct(p, lang) }));
  rawById = Object.fromEntries(localized.map((p) => [p.id, p]));
  PRODUCTS = localized.map((p) => { const { tr, ...rest } = p; return escapeDeep(rest); });
  byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
  state.cart = state.cart.filter((l) => byId[l.id]);
}

// Uploaded photos win; products without photos fall back to the generated studio art.
function media(p, variant = 0, { lazy = true } = {}) {
  if (p.images?.length) {
    const src = p.images[Math.min(variant, p.images.length - 1)];
    return `<img src="${src}" alt="${p.name}" ${lazy ? 'loading="lazy"' : ''} decoding="async" />`;
  }
  return productArt(p, variant);
}

/* ==========================================================================
   State
   ========================================================================== */
const CART_KEY = 'kovalent.cart.v1';
const CHECKOUT_KEY = 'kovalent.checkout.v1';

const config = { content: {}, settings: { shipping: { standard: 0, express: 0, overnight: 0, international: 0, freeOver: 0 }, tax: { enabled: false, states: [] }, hasPromos: false }, payments: [] };

const state = {
  category: 'All',
  collection: null,
  query: '',
  sort: 'featured',
  cart: [],
  overlay: null, // 'cart' | 'product' | 'checkout' | 'admin'
  me: null,
  loadError: false,
};

const co = freshCheckout();
function freshCheckout() {
  return {
    step: 1,
    ship: { email: '', phone: '', first: '', last: '', country: 'US', address: '', apt: '', city: '', region: '', zip: '' },
    method: 'standard',
    payment: null,
    promo: null,
    promoPct: 0,
    errors: {}, // field -> error code
    error: '',
    placing: false,
    view: null, // null = form · 'confirming' · 'result'
    order: null,
  };
}

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return raw.filter((l) => l && typeof l.id === 'string' && l.qty > 0).map((l) => ({ id: l.id, qty: Math.min(99, Math.trunc(l.qty)) }));
  } catch { return []; }
}
function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch { /* storage unavailable */ }
}

/* ==========================================================================
   Cart operations
   ========================================================================== */
const cartCount = () => state.cart.reduce((n, l) => n + l.qty, 0);
const cartLines = () => state.cart.filter((l) => byId[l.id]).map((l) => ({ ...l, price: byId[l.id].price }));
const cartSubtotal = () => cartLines().reduce((s, l) => s + l.price * l.qty, 0);

function addToCart(id, qty = 1, { silent = false } = {}) {
  if (!byId[id]) return;
  const line = state.cart.find((l) => l.id === id);
  if (line) line.qty = Math.min(99, line.qty + qty);
  else state.cart.push({ id, qty });
  cartChanged();
  if (!silent) toastAdded(byId[id], qty);
}
function setQty(id, qty) {
  if (qty <= 0) return removeFromCart(id);
  const line = state.cart.find((l) => l.id === id);
  if (line) line.qty = Math.min(99, qty);
  cartChanged();
}
function removeFromCart(id) {
  const p = byId[id];
  const prev = state.cart.find((l) => l.id === id);
  state.cart = state.cart.filter((l) => l.id !== id);
  cartChanged();
  if (p && prev) toast({ icon: 'close', title: esc(t('toast.removed')), text: p.name, action: esc(t('toast.undo')), onAction: () => addToCart(id, prev.qty, { silent: true }) });
}
function clearCart() {
  state.cart = [];
  saveCart();
  renderBadge(true);
}
function cartChanged() {
  saveCart();
  renderBadge(true);
  if (state.overlay === 'cart') renderCart();
  if (state.overlay === 'checkout' && !co.view) renderCheckout();
}

function totals() {
  return computeTotals({ lines: cartLines(), settings: config.settings, method: co.method, address: co.ship, promoPct: co.promoPct });
}

/* ==========================================================================
   Static text + language switcher
   ========================================================================== */
function applyStatic() {
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(';').forEach((pair) => { const [attr, key] = pair.split(':'); el.setAttribute(attr, t(key)); });
  });
  $('#lang-current').textContent = LANGS[lang].short;
  $$('#lang-menu [data-lang]').forEach((b) => b.setAttribute('aria-selected', b.dataset.lang === lang));
  setMenu($('.site-header').classList.contains('nav-open'));
}

function setLangMenu(open) {
  $('#lang-menu').hidden = !open;
  $('#lang-button').setAttribute('aria-expanded', open);
  if (open) ($('#lang-menu [aria-selected="true"]') || $('#lang-menu button')).focus();
}

const langListeners = [];
function setLang(next) {
  if (!isLang(next) || next === lang) return;
  lang = next;
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* storage unavailable */ }
  setProducts(source);
  applyStatic();
  renderSections();
  renderGrid();
  renderBadge();
  closeSuggestions();
  if (state.overlay === 'cart') renderCart();
  if (state.overlay === 'product') rerenderProductKeepScroll();
  if (state.overlay === 'checkout') renderCheckout();
  langListeners.forEach((fn) => fn(lang));
}

/* ==========================================================================
   Header: badge, logo, nav
   ========================================================================== */
function renderBadge(bump = false) {
  const count = cartCount();
  const el = $('#cart-count');
  el.textContent = count;
  $('#cart-total').textContent = money(cartSubtotal());
  $('#cart-button').setAttribute('aria-label', t('cart.aria', { n: count, total: money(cartSubtotal()) }));
  if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}

// Mobile/tablet hamburger menu (the nav collapses below 1380px; see styles.css).
function setMenu(open) {
  $('.site-header').classList.toggle('nav-open', open);
  $('#menu-button').setAttribute('aria-expanded', open);
  $('#menu-button').setAttribute('aria-label', t(open ? 'menu.close' : 'menu.open'));
}

function renderNav() {
  $$('.main-nav [data-collection]').forEach((b) => b.classList.toggle('active', b.dataset.collection === state.collection));
}

/* ==========================================================================
   Catalog
   ========================================================================== */
function matches(p, q) {
  if (!q) return true;
  const r = rawById[p.id] || p;
  const hay = `${r.name} ${r.tagline} ${t(`cat.${r.category}`)} ${(r.badges || []).join(' ')} ${(r.collections || []).map((c) => t(`col.${c}`)).join(' ')}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

function visibleProducts() {
  let list = PRODUCTS.filter((p) =>
    (state.category === 'All' || p.category === state.category) &&
    (!state.collection || p.collections.includes(state.collection)) &&
    matches(p, state.query));
  const sorters = { 'price-asc': (a, b) => a.price - b.price, 'price-desc': (a, b) => b.price - a.price };
  if (sorters[state.sort]) list = [...list].sort(sorters[state.sort]);
  return list;
}

function renderChips() {
  const base = PRODUCTS.filter((p) => (!state.collection || p.collections.includes(state.collection)) && matches(p, state.query));
  $('#category-chips').innerHTML = CATEGORIES.map((c) => {
    const n = c === 'All' ? base.length : base.filter((p) => p.category === c).length;
    return `<button class="chip" role="tab" data-category="${c}" aria-selected="${state.category === c}">${esc(t(`cat.${c}`))}<span class="n">${n}</span></button>`;
  }).join('');
}

function renderActiveFilters(count) {
  const tags = [];
  if (state.collection) tags.push(`<span class="tag">${esc(t(`col.${state.collection}`))}<button data-action="clear-collection" aria-label="${esc(t('filters.removeCollection'))}">${ICON.close}</button></span>`);
  if (state.query) tags.push(`<span class="tag">“${esc(state.query)}”<button data-action="clear-query" aria-label="${esc(t('filters.clearSearch'))}">${ICON.close}</button></span>`);
  $('#active-filters').innerHTML = `${tags.join('')}<span>${count === 1 ? t('count.product') : t('count.products', { n: count })}</span>`;
}

// Placeholder until real ratings exist.
const ratingLine = () => `<span class="rating-ph"><span class="stars-ph" aria-hidden="true">☆☆☆☆☆</span>${esc(t('stats.placeholder'))}</span>`;

function adminRow(p) {
  if (!state.me) return '';
  return `<div class="admin-row">
    <button class="adm-btn" data-admin="edit" data-id="${p.id}">${esc(t('admin.edit'))}</button>
    <button class="adm-btn danger" data-admin="delete" data-id="${p.id}">${esc(t('admin.delete'))}</button>
  </div>`;
}

function cardHTML(p, i) {
  return `<article class="card" style="animation-delay:${Math.min(i, 8) * 40}ms" data-id="${p.id}">
    <div class="card-media" data-quick="${p.id}">
      ${p.ribbon ? `<span class="ribbon">${p.ribbon}</span>` : ''}
      ${media(p, 0)}
      <button class="quick-view" data-quick="${p.id}" aria-label="${t('card.quickViewAria', { name: p.name })}">${ICON.eye} ${esc(t('card.quickView'))}</button>
    </div>
    <div class="card-body">
      <span class="card-cat">${esc(t(`cat.${p.category}`))}</span>
      <button class="card-title" data-quick="${p.id}">${p.name}</button>
      <div class="rating">${ratingLine()}</div>
      <div class="specs">${p.badges.map((b) => `<span class="spec">${b}</span>`).join('')}</div>
      <div class="card-foot">
        <span class="price">${money(p.price)}<small>${p.size}</small></span>
        <button class="btn btn-primary add-btn" data-add="${p.id}">${ICON.cart} ${esc(t('card.add'))}</button>
      </div>
      ${adminRow(p)}
    </div>
  </article>`;
}

function renderGrid() {
  const list = visibleProducts();
  const addTile = state.me ? `<button class="card add-card" data-admin="new"><span>+</span>${esc(t('admin.add'))}</button>` : '';
  $('#product-grid').innerHTML = addTile + list.map(cardHTML).join('');
  $('#empty-state').hidden = list.length > 0 || state.loadError;
  if (state.loadError) {
    $('#product-grid').innerHTML = `<div class="load-error">${ICON.alert}<p>${esc(t('load.error'))}</p><button class="btn btn-ghost" data-action="reload">${esc(t('load.retry'))}</button></div>`;
  }
  renderChips();
  renderActiveFilters(list.length);
  renderNav();
  const kit = $('[data-quick="starter-kit"].btn');
  if (kit) kit.hidden = !byId['starter-kit'];
}

function scrollToCatalog() {
  $('#catalog').scrollIntoView({ behavior: 'smooth' });
}

/* ==========================================================================
   Search with predictive suggestions
   ========================================================================== */
let suggestIndex = -1;
let suggestions = [];

function highlight(text, q) {
  const words = q.trim().split(/\s+/).filter(Boolean).map((w) => w.toLowerCase());
  if (!words.length) return esc(text);
  const lower = text.toLowerCase();
  const marks = new Array(text.length).fill(false);
  words.forEach((w) => { let i = lower.indexOf(w); while (i !== -1) { for (let k = i; k < i + w.length; k++) marks[k] = true; i = lower.indexOf(w, i + 1); } });
  let out = ''; let open = false;
  [...text].forEach((ch, i) => {
    if (marks[i] && !open) { out += '<mark>'; open = true; }
    if (!marks[i] && open) { out += '</mark>'; open = false; }
    out += esc(ch);
  });
  return open ? out + '</mark>' : out;
}

function renderSuggestions() {
  const input = $('#search-input');
  const panel = $('#search-results');
  const q = input.value.trim();
  suggestIndex = -1;
  if (!q) {
    suggestions = PRODUCTS.filter((p) => p.ribbon).slice(0, 3);
    if (!suggestions.length) suggestions = PRODUCTS.slice(0, 3);
    panel.innerHTML = `<div class="sp-label">${esc(t('search.popular'))}</div>
      <div class="sp-chips">${t('search.terms').map((term) => `<button data-term="${esc(term)}">${esc(term)}</button>`).join('')}</div>
      ${suggestions.length ? `<div class="sp-label">${esc(t('search.trending'))}</div>${suggestions.map((p, i) => suggestionRow(p, '', i)).join('')}` : ''}`;
  } else {
    const all = PRODUCTS.filter((p) => matches(p, q));
    suggestions = all.slice(0, 6);
    panel.innerHTML = suggestions.length
      ? `<div class="sp-label">${esc(t('search.products'))}</div>${suggestions.map((p, i) => suggestionRow(p, q, i)).join('')}
         <button class="sp-item sp-all" data-all>${t('search.seeAll', { n: all.length, q: esc(q) })}</button>`
      : `<div class="sp-empty">${t('search.none', { q: esc(q) })}<br/>${esc(t('search.try'))}</div>`;
  }
  panel.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function suggestionRow(p, q, i) {
  const r = rawById[p.id] || p;
  const ql = q.toLowerCase();
  const why = q && !r.name.toLowerCase().includes(ql) ? (r.badges || []).find((b) => b.toLowerCase().includes(ql)) : null;
  return `<button class="sp-item" role="option" id="sug-${i}" data-sug="${p.id}">
    <span class="sp-thumb">${media(p, 0)}</span>
    <span class="sp-text"><span class="sp-name">${highlight(r.name, q)}</span><span class="sp-meta">${esc(t(`cat.${p.category}`))}${why ? ` · ${highlight(why, q)}` : ''}</span></span>
    <span class="sp-price">${money(p.price)}</span>
  </button>`;
}

function closeSuggestions() {
  $('#search-results').hidden = true;
  $('#search-input').setAttribute('aria-expanded', 'false');
  $('#search-input').removeAttribute('aria-activedescendant');
}

function moveSuggestion(dir) {
  const rows = $$('#search-results .sp-item');
  if (!rows.length) return;
  suggestIndex = (suggestIndex + dir + rows.length) % rows.length;
  rows.forEach((r, i) => r.classList.toggle('active', i === suggestIndex));
  rows[suggestIndex].scrollIntoView({ block: 'nearest' });
  if (rows[suggestIndex].id) $('#search-input').setAttribute('aria-activedescendant', rows[suggestIndex].id);
}

const applyQueryLive = debounce(() => { state.query = $('#search-input').value.trim(); renderGrid(); }, 160);

function initSearch() {
  const input = $('#search-input');
  input.addEventListener('focus', renderSuggestions);
  input.addEventListener('input', () => { renderSuggestions(); applyQueryLive(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSuggestion(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSuggestion(-1); }
    else if (e.key === 'Escape') { closeSuggestions(); input.blur(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const active = $$('#search-results .sp-item')[suggestIndex];
      if (active) active.click();
      else { state.query = input.value.trim(); renderGrid(); closeSuggestions(); input.blur(); scrollToCatalog(); }
    }
  });
  $('#search-results').addEventListener('mousedown', (e) => e.preventDefault()); // keep focus while clicking
  $('#search-results').addEventListener('click', (e) => {
    const sug = e.target.closest('[data-sug]');
    const term = e.target.closest('[data-term]');
    if (sug) { closeSuggestions(); input.blur(); openProduct(sug.dataset.sug); }
    else if (term) { input.value = term.dataset.term; renderSuggestions(); state.query = term.dataset.term; renderGrid(); }
    else if (e.target.closest('[data-all]')) { state.query = input.value.trim(); renderGrid(); closeSuggestions(); input.blur(); scrollToCatalog(); }
  });
  input.addEventListener('blur', () => setTimeout(closeSuggestions, 120));
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !state.overlay && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); }
  });
}

/* ==========================================================================
   Overlays (one at a time) + focus management
   ========================================================================== */
let lastFocus = null;

function openOverlay(name) {
  setMenu(false);
  setLangMenu(false);
  if (state.overlay && state.overlay !== name) hideOverlay(state.overlay);
  if (!state.overlay) lastFocus = document.activeElement;
  state.overlay = name;
  $('#scrim').hidden = false;
  document.body.classList.add('locked');
  const el = overlayEl(name);
  if (name === 'cart') { el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); }
  else el.hidden = false;
  requestAnimationFrame(() => (el.querySelector('[data-autofocus]') || el.querySelector('button, input, [tabindex]'))?.focus({ preventScroll: true }));
}
function overlayEl(name) {
  return { cart: $('#cart-drawer'), product: $('#product-modal'), checkout: $('#checkout-modal'), admin: $('#admin-modal') }[name];
}
function hideOverlay(name) {
  const el = overlayEl(name);
  if (name === 'cart') { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }
  else el.hidden = true;
}
function closeOverlays() {
  if (!state.overlay) return;
  if (state.overlay === 'checkout' && co.view) Object.assign(co, freshCheckout());
  hideOverlay(state.overlay);
  state.overlay = null;
  $('#scrim').hidden = true;
  document.body.classList.remove('locked');
  lastFocus?.focus?.({ preventScroll: true });
}

function trapFocus(e) {
  if (e.key !== 'Tab' || !state.overlay) return;
  const root = overlayEl(state.overlay);
  const items = $$('button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', root).filter((x) => x.offsetParent !== null);
  if (!items.length) return;
  const first = items[0]; const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* ==========================================================================
   Cart drawer
   ========================================================================== */
function openCart() { renderCart(); openOverlay('cart'); }

function renderCart() {
  const count = cartCount();
  const sub = cartSubtotal();
  const freeOver = config.settings.shipping.freeOver;
  $('#drawer-count').textContent = count ? `(${count})` : '';
  const left = Math.max(0, freeOver - sub);
  $('#ship-progress').innerHTML = count && freeOver > 0
    ? `${left > 0 ? t('cart.awayFree', { amount: money(left) }) : `<span class="ok">${esc(t('cart.unlocked'))}</span>`}
       <div class="bar"><i style="width:${Math.min(100, (sub / freeOver) * 100)}%"></i></div>`
    : '';
  $('#ship-progress').hidden = !count || !(freeOver > 0);

  if (!count) {
    $('#cart-items').innerHTML = `<div class="cart-empty">${ICON.cart}<h4>${esc(t('cart.empty'))}</h4><p>${esc(t('cart.emptyText'))}</p>
      <button class="btn btn-primary" data-action="shop-from-cart">${esc(t('hero.explore'))}</button></div>`;
    $('#cart-foot').innerHTML = '';
    return;
  }
  $('#cart-items').innerHTML = state.cart.filter((l) => byId[l.id]).map(({ id, qty }) => {
    const p = byId[id];
    return `<div class="line-item">
      <div class="li-thumb" data-quick="${id}">${media(p, 0)}</div>
      <div>
        <button class="li-name" data-quick="${id}">${p.name}</button>
        <div class="li-meta">${p.size ? `${p.size} · ` : ''}${t('cart.each', { price: money(p.price) })}</div>
        <div class="qty" role="group" aria-label="${t('cart.qtyFor', { name: p.name })}">
          <button data-qty="${id}" data-delta="-1" aria-label="${esc(t('qty.dec'))}">−</button><span>${qty}</span><button data-qty="${id}" data-delta="1" aria-label="${esc(t('qty.inc'))}" ${qty >= 99 ? 'disabled' : ''}>+</button>
        </div>
      </div>
      <div class="li-right"><span class="li-price">${money(p.price * qty)}</span><button class="li-remove" data-remove="${id}">${esc(t('cart.remove'))}</button></div>
    </div>`;
  }).join('');
  const s = config.settings.shipping;
  const shipping = freeOver > 0 && sub >= freeOver ? 0 : s.standard;
  $('#cart-foot').innerHTML = `
    <div class="sum-row"><span>${esc(t('sum.subtotal'))}</span><b>${money(sub)}</b></div>
    <div class="sum-row"><span>${esc(t('cart.stdShip'))}</span><b>${shipping ? money(shipping) : esc(t('free'))}</b></div>
    <div class="sum-row"><span>${esc(t('cart.taxLater'))}</span><b>${esc(t('cart.atCheckout'))}</b></div>
    <div class="sum-row total"><span>${esc(t('cart.estTotal'))}</span><b>${money(sub + shipping)}</b></div>
    <button class="btn btn-primary btn-lg btn-block" data-action="checkout">${ICON.lock} ${esc(t('cart.checkout'))}</button>
    <div class="drawer-note">${ICON.shield} ${esc(t('cart.note'))}</div>`;
}

/* ==========================================================================
   Product modal
   ========================================================================== */
const modal = { id: null, view: 0, tab: 'overview', qty: 1, fbt: new Set() };

function openProduct(id) {
  const p = byId[id];
  if (!p) return;
  Object.assign(modal, { id, view: 0, tab: 'overview', qty: 1, fbt: new Set([id, ...p.pairs.filter((x) => byId[x])]) });
  renderProduct();
  openOverlay('product');
  $('#product-modal-card').scrollTop = 0;
}

// Placeholders until real reviews and rating stats are available.
function reviewsSection() {
  const sample = `<article class="review review-ph">
      <div class="rv-head"><span class="avatar ph-avatar"></span><div class="rv-who"><span class="ph-line"></span></div></div>
      <span class="stars-ph" aria-hidden="true">☆☆☆☆☆</span>
      <p>${esc(t('reviews.placeholder'))}</p>
    </article>`;
  return `<section class="pm-section" id="pm-reviews">
    <h3>${esc(t('reviews.title'))}</h3>
    <div class="reviews-grid">
      <div class="rv-summary"><div class="ph-box">${esc(t('stats.placeholder'))}</div></div>
      <div class="rv-list">${sample}${sample}${sample}</div>
    </div>
  </section>`;
}

function renderProduct() {
  const p = byId[modal.id];
  if (!p) { closeOverlays(); return; }
  const views = p.images.length ? p.images.map((_, i) => t('pm.photo', { n: i + 1 })) : t('pm.views');
  modal.view = Math.min(modal.view, views.length - 1);
  const fbtItems = [p, ...p.pairs.map((x) => byId[x]).filter(Boolean)];
  const fbtTotal = fbtItems.filter((x) => modal.fbt.has(x.id)).reduce((s, x) => s + x.price, 0);
  const inCart = state.cart.find((l) => l.id === p.id)?.qty || 0;
  const specs = Object.entries(p.specs);
  const tabs = [['overview', p.benefits.length], ['specs', specs.length], ['apply', p.instructions.length], ['compat', p.compatibility.length]].filter((x) => x[1]);
  if (tabs.length && !tabs.some(([k]) => k === modal.tab)) modal.tab = tabs[0][0];

  $('#product-modal-card').innerHTML = `
    <button class="icon-btn modal-close" data-action="close-overlays" aria-label="${esc(t('close'))}">${ICON.close}</button>
    <div class="pm-top">
      <div class="pm-gallery">
        <div class="pm-main" id="pm-main">${media(p, modal.view, { lazy: false })}<span class="zoom-hint">${esc(t('pm.zoom'))}</span></div>
        ${views.length > 1 ? `<div class="pm-thumbs">${views.map((v, i) => `<button data-view="${i}" aria-pressed="${modal.view === i}" aria-label="${esc(v)}">${media(p, i)}<span>${esc(v)}</span></button>`).join('')}</div>` : ''}
      </div>
      <div class="pm-info">
        ${state.me ? `<div class="admin-row pm-admin"><span>${esc(t('admin.label'))}</span>
          <button class="adm-btn" data-admin="edit" data-id="${p.id}">${esc(t('admin.editProduct'))}</button>
          <button class="adm-btn danger" data-admin="delete" data-id="${p.id}">${esc(t('admin.delete'))}</button></div>` : ''}
        <span class="card-cat">${esc(t(`cat.${p.category}`))}${p.collections.length ? ` · ${p.collections.map((c) => esc(t(`col.${c}`))).join(' · ')}` : ''}</span>
        <h2 id="pm-title">${p.name}</h2>
        ${p.tagline ? `<p class="pm-tagline">${p.tagline}</p>` : ''}
        <div class="rating">${ratingLine()}</div>
        <div class="pm-price-row"><span class="price">${money(p.price)}</span><span class="pm-stock">${esc(t('pm.stock'))}</span></div>
        <div class="specs">${p.badges.map((b) => `<span class="spec">${b}</span>`).join('')}</div>
        ${p.description ? `<p class="pm-desc">${p.description}</p>` : ''}
        <div class="pm-buy">
          <div class="qty lg" role="group" aria-label="${esc(t('qty'))}">
            <button data-mqty="-1" aria-label="${esc(t('qty.dec'))}" ${modal.qty <= 1 ? 'disabled' : ''}>−</button><span>${modal.qty}</span><button data-mqty="1" aria-label="${esc(t('qty.inc'))}">+</button>
          </div>
          <button class="btn btn-primary" data-add="${p.id}" data-modal-add data-autofocus>${ICON.cart} ${esc(t('pm.addFor', { price: money(p.price * modal.qty) }))}</button>
        </div>
        <div class="pm-assure">
          <span>${ICON.truck} ${esc(t('pm.freeShip', { amount: money(config.settings.shipping.freeOver) }))}</span><span>${ICON.shield} ${esc(t('pm.guarantee'))}</span>
          ${inCart ? `<span style="color:var(--blue)">${ICON.check} ${esc(t('pm.inCart', { n: inCart }))}</span>` : ''}
        </div>
        ${tabs.length ? `<div class="tabs" role="tablist">
          ${tabs.map(([k]) => `<button role="tab" data-tab="${k}" aria-selected="${modal.tab === k}">${esc(t(`tab.${k}`))}</button>`).join('')}
        </div>
        <div class="tab-panel" role="tabpanel">${tabPanel(p)}</div>` : ''}
      </div>
    </div>

    ${fbtItems.length > 1 ? `<section class="pm-section">
      <h3>${esc(t('fbt.title'))}</h3>
      <div class="fbt">
        <div class="fbt-items">
          ${fbtItems.map((x, i) => `${i ? '<span class="fbt-plus">+</span>' : ''}
            <div class="fbt-item ${modal.fbt.has(x.id) ? '' : 'off'}"><div class="thumb">${media(x, 0)}</div></div>`).join('')}
        </div>
        <div>
          <div class="fbt-list">
            ${fbtItems.map((x, i) => `<label class="fbt-row ${modal.fbt.has(x.id) ? '' : 'off'}">
              <input type="checkbox" class="check" data-fbt="${x.id}" ${modal.fbt.has(x.id) ? 'checked' : ''}/>
              <span class="nm">${i === 0 ? `<b>${esc(t('fbt.thisItem'))}</b> ` : ''}${x.name}<em>${x.size}</em></span>
              <b>${money(x.price)}</b></label>`).join('')}
          </div>
          <div class="fbt-total">
            <div><span>${esc(t('fbt.totalFor', { n: modal.fbt.size }))}</span><b>${money(fbtTotal)}</b></div>
            <button class="btn btn-primary" data-action="add-fbt" ${modal.fbt.size ? '' : 'disabled'}>${ICON.cart} ${esc(t(modal.fbt.size === fbtItems.length ? 'fbt.addAll' : 'fbt.add', { n: modal.fbt.size }))}</button>
          </div>
        </div>
      </div>
    </section>` : ''}

    ${reviewsSection()}`;
}

function tabPanel(p) {
  if (modal.tab === 'specs') return `<table class="spec-table">${Object.entries(p.specs).map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`;
  if (modal.tab === 'apply') return `<ol class="steps">${p.instructions.map((s) => `<li>${s}</li>`).join('')}</ol>`;
  if (modal.tab === 'compat') return `<div class="compat">${p.compatibility.map((c) => `<span>${ICON.check}${c}</span>`).join('')}</div>
    <p class="compat-note">${esc(t('pm.compatNote'))}</p>`;
  return `<div class="benefits">${p.benefits.map(([ti, d], i) => `<div class="benefit"><span class="ico">0${i + 1}</span><div><b>${ti}</b><span>${d}</span></div></div>`).join('')}</div>`;
}

function rerenderProductKeepScroll() {
  const card = $('#product-modal-card');
  const top = card.scrollTop;
  const focusSel = document.activeElement?.dataset && Object.keys(document.activeElement.dataset)[0];
  const focusVal = focusSel && document.activeElement.dataset[focusSel];
  renderProduct();
  card.scrollTop = top;
  if (focusSel) {
    const attr = focusSel.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    card.querySelector(`[data-${attr}="${CSS.escape(focusVal)}"]`)?.focus({ preventScroll: true });
  }
}

function initZoom() {
  const card = $('#product-modal-card');
  card.addEventListener('mousemove', (e) => {
    const main = e.target.closest('#pm-main');
    if (!main || !main.classList.contains('zoom')) return;
    const r = main.getBoundingClientRect();
    main.querySelector('svg, img').style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  });
  card.addEventListener('mouseleave', () => $('#pm-main')?.classList.remove('zoom'), true);
}

/* ==========================================================================
   Checkout (guest only: no accounts, no passwords)
   Card details are entered on Stripe / PayPal / Mercado Pago's own pages, never here.
   ========================================================================== */
const payLabel = (id) => t(`pay.${id}`);
const paySub = (m) => (m.type === 'manual' ? t('pay.manual.sub') : t(`pay.${m.id}.sub`));
const payShort = (id) => (id === 'stripe' ? t('pay.stripe.short') : payLabel(id));

function openCheckout() {
  if (!cartCount()) return;
  if (co.view) Object.assign(co, freshCheckout());
  if (!co.payment && config.payments.length === 1) co.payment = config.payments[0].id;
  renderCheckout();
  openOverlay('checkout');
}

function renderCheckout() {
  const card = $('#checkout-card');
  if (co.view) { card.innerHTML = resultHTML(); return; }
  if (!cartCount()) { closeOverlays(); return; }
  card.innerHTML = `
    <div class="co-main">
      <div class="co-head">
        <h2>${esc(t('co.title'))} <span class="secure">${ICON.lock} ${esc(t('co.secure'))}</span></h2>
        <button class="icon-btn" data-action="close-overlays" aria-label="${esc(t('co.closeAria'))}">${ICON.close}</button>
      </div>
      <nav class="stepper" aria-label="${esc(t('co.progress'))}">
        ${[1, 2, 3].map((n) => {
          const cls = n < co.step ? 'done' : n === co.step ? 'current' : '';
          return `<button class="step ${cls}" ${n < co.step ? `data-goto="${n}"` : 'tabindex="-1"'} aria-current="${n === co.step ? 'step' : 'false'}">
            <span class="num">${n < co.step ? '✓' : n}</span><span class="lbl">${esc(t(`step.${n}`))}<small>${esc(t(`step.${n}s`))}</small></span></button>`;
        }).join('')}
      </nav>
      ${co.error ? `<div class="co-error" role="alert">${ICON.alert}<span>${esc(co.error)}</span></div>` : ''}
      <form id="co-form" novalidate autocomplete="on">${co.step === 1 ? stepShipping() : co.step === 2 ? stepPayment() : stepReview()}</form>
    </div>
    <aside class="co-side" id="co-side">${summaryHTML()}</aside>`;
}

function field(key, labelKey, opts = {}) {
  const { span = '', type = 'text', placeholder = '', auto = '', inputmode = '', max = '' } = opts;
  const err = co.errors[key];
  return `<div class="field ${span} ${err ? 'invalid' : ''}">
    <label for="f-${key}">${esc(t(labelKey))}</label>
    <input id="f-${key}" name="${key}" data-ship type="${type}" value="${esc(co.ship[key])}" placeholder="${esc(placeholder)}"
      ${auto ? `autocomplete="${auto}"` : ''} ${inputmode ? `inputmode="${inputmode}"` : ''} ${max ? `maxlength="${max}"` : ''}/>
    <span class="err">${err ? esc(t(err)) : ''}</span>
  </div>`;
}

function regionField() {
  const c = co.ship.country;
  if (c === 'PR') return '';
  if (c === 'US') {
    return `<div class="field s2 ${co.errors.region ? 'invalid' : ''}">
      <label for="f-region">${esc(t('f.state'))}</label>
      <select id="f-region" name="region" data-ship autocomplete="address-level1">
        <option value="">${esc(t('f.select'))}</option>${US_STATES.map((s) => `<option ${co.ship.region === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select><span class="err">${co.errors.region ? esc(t(co.errors.region)) : ''}</span>
    </div>`;
  }
  return field('region', 'f.region', { span: 's2', auto: 'address-level1' });
}

function shippingOptionsHTML() {
  const tot = totals();
  const s = config.settings.shipping;
  return shippingOptions(co.ship.country).map((k) => {
    const m = SHIPPING_METHODS[k];
    const free = k === 'standard' && s.freeOver > 0 && tot.net >= s.freeOver;
    return `<label class="radio-card"><input type="radio" name="method" value="${k}" ${tot.method === k ? 'checked' : ''}/>
      <span class="rc-text"><b>${esc(t(`ship.${k}`))}</b><span>${esc(t(`eta.${k}`))}${m.domestic ? ` · ${esc(t('co.arrives', { date: arrival(m.days) }))}` : ''}</span></span>
      <span class="rc-price ${free ? 'free' : ''}">${free ? esc(t('free')) : money(s[k])}</span></label>`;
  }).join('');
}

function stepShipping() {
  const domestic = isDomestic(co.ship.country);
  return `
    <div class="fieldset-title">${esc(t('co.contact'))} <span class="guest-pill">${esc(t('co.guest'))}</span></div>
    <div class="form-grid">
      ${field('email', 'f.email', { type: 'email', span: 's4', placeholder: t('f.emailPh'), auto: 'email' })}
      ${field('phone', 'f.phone', { type: 'tel', span: 's2', auto: 'tel', inputmode: 'tel' })}
    </div>
    <div class="fieldset-title">${esc(t('co.address'))}</div>
    <div class="form-grid">
      <div class="field ${co.errors.country ? 'invalid' : ''}">
        <label for="f-country">${esc(t('f.country'))}</label>
        <select id="f-country" name="country" data-ship autocomplete="country">
          ${COUNTRIES.map(([code]) => `<option value="${code}" ${co.ship.country === code ? 'selected' : ''}>${esc(countryName(lang, code))}</option>`).join('')}
        </select><span class="err">${co.errors.country ? esc(t(co.errors.country)) : ''}</span>
      </div>
      ${field('first', 'f.first', { span: 's3', auto: 'given-name' })}
      ${field('last', 'f.last', { span: 's3', auto: 'family-name' })}
      ${field('address', 'f.address', { span: 's4', auto: 'address-line1' })}
      ${field('apt', 'f.apt', { span: 's2', auto: 'address-line2' })}
      ${field('city', 'f.city', { span: co.ship.country === 'PR' ? 's3' : 's2', auto: 'address-level2' })}
      ${regionField()}
      ${field('zip', domestic ? 'f.zip' : 'f.postal', { span: co.ship.country === 'PR' ? 's3' : 's2', auto: 'postal-code', inputmode: domestic ? 'numeric' : '', max: domestic ? 5 : 12 })}
    </div>
    <div class="fieldset-title">${esc(t('co.delivery'))}</div>
    <div class="ship-options" id="ship-options">${shippingOptionsHTML()}</div>
    <div class="co-actions">
      <button type="button" class="link-btn" data-action="back-to-cart">${ICON.back} ${esc(t('co.backCart'))}</button>
      <button type="submit" class="btn btn-primary">${esc(t('co.toPayment'))} ${ICON.arrow}</button>
    </div>`;
}

function stepPayment() {
  if (!config.payments.length) {
    return `<div class="co-notice">${ICON.alert}<div><b>${esc(t('pay.none.title'))}</b>
      <span>${esc(t('pay.none.text'))}</span></div></div>
      <div class="co-actions"><button type="button" class="link-btn" data-goto="1">${ICON.back} ${esc(t('co.backShipping'))}</button></div>`;
  }
  const online = config.payments.filter((m) => m.type === 'online');
  const manual = config.payments.filter((m) => m.type === 'manual');
  const card = (m) => `<label class="radio-card pay-card"><input type="radio" name="payment" value="${m.id}" ${co.payment === m.id ? 'checked' : ''}/>
      <span class="rc-text"><b>${esc(payLabel(m.id))}</b><span>${esc(paySub(m))}</span></span><span class="pay-logo pay-${m.id}">${payLogo(m.id)}</span></label>`;
  return `
    <div class="fieldset-title">${esc(t('pay.how'))}</div>
    ${online.length ? `<div class="ship-options ${co.errors.payment ? 'invalid-group' : ''}">${online.map(card).join('')}</div>` : ''}
    ${manual.length ? `<div class="fieldset-title" style="margin-top:6px">${esc(t('pay.transfer'))} <small>${esc(t('pay.transferNote'))}</small></div>
      <div class="ship-options ${co.errors.payment ? 'invalid-group' : ''}">${manual.map(card).join('')}</div>` : ''}
    ${co.errors.payment ? `<p class="err-text">${esc(t(co.errors.payment))}</p>` : ''}
    <p class="pay-note">${ICON.lock} ${esc(t('pay.note'))}</p>
    <div class="co-actions">
      <button type="button" class="link-btn" data-goto="1">${ICON.back} ${esc(t('co.backShipping'))}</button>
      <button type="submit" class="btn btn-primary">${esc(t('co.toReview'))} ${ICON.arrow}</button>
    </div>`;
}

const payLogo = (id) => ({ stripe: 'VISA · MC · AMEX', paypal: 'PayPal', mercadopago: 'Mercado Pago', zelle: 'Zelle', athmovil: 'ATH Móvil', bank: '⇄' }[id] || '');

function stepReview() {
  const s = co.ship;
  const tot = totals();
  const m = SHIPPING_METHODS[tot.method];
  const pay = config.payments.find((x) => x.id === co.payment);
  const cta = pay?.type === 'online' ? t('co.continueTo', { provider: pay.id === 'stripe' ? t('co.securePayment') : payLabel(pay.id) }) : t('co.place');
  return `
    <div class="review-blocks">
      <div class="rb"><h5>${esc(t('rv.shipTo'))} <button type="button" data-goto="1">${esc(t('rv.edit'))}</button></h5>
        <b>${esc(s.first)} ${esc(s.last)}</b><br/>${esc(s.address)}${s.apt ? `, ${esc(s.apt)}` : ''}<br/>${esc(s.city)}${s.country === 'PR' ? ', PR' : s.region ? `, ${esc(s.region)}` : ''} ${esc(s.zip)}<br/>${esc(countryName(lang, s.country))}</div>
      <div class="rb"><h5>${esc(t('rv.contact'))} <button type="button" data-goto="1">${esc(t('rv.edit'))}</button></h5><b>${esc(s.email)}</b>${s.phone ? `<br/>${esc(s.phone)}` : ''}<br/>${esc(t('rv.receipt'))}</div>
      <div class="rb"><h5>${esc(t('rv.delivery'))} <button type="button" data-goto="1">${esc(t('rv.edit'))}</button></h5><b>${esc(t(`ship.${tot.method}`))}</b> · ${esc(t(`eta.${tot.method}`))}${m.domestic ? `<br/>${esc(t('rv.arrivesBy'))} <b>${arrival(m.days)}</b>` : ''}</div>
      <div class="rb"><h5>${esc(t('rv.payment'))} <button type="button" data-goto="2">${esc(t('rv.edit'))}</button></h5><b>${esc(pay ? payLabel(pay.id) : '—')}</b><br/>${esc(t(pay?.type === 'manual' ? 'rv.manualNote' : 'rv.onlineNote'))}</div>
    </div>
    <p class="terms">${esc(t('co.terms'))}</p>
    <div class="co-actions">
      <button type="button" class="link-btn" data-goto="2">${ICON.back} ${esc(t('co.backPayment'))}</button>
      <button type="submit" class="btn btn-primary" ${co.placing ? 'disabled' : ''}>
        ${co.placing ? `<span class="spin"></span> ${esc(t('co.placing'))}` : `${ICON.lock} ${esc(cta)} · ${money(tot.total)}`}
      </button>
    </div>`;
}

function summaryHTML() {
  const tot = totals();
  const n = cartCount();
  return `
    <h4>${esc(t('sum.title'))} <span>${n === 1 ? esc(t('sum.item')) : esc(t('sum.items', { n }))}</span></h4>
    <div class="co-items">
      ${state.cart.filter((l) => byId[l.id]).map(({ id, qty }) => {
        const p = byId[id];
        return `<div class="co-item"><div class="th"><div>${media(p, 0)}</div><em>${qty}</em></div>
          <div class="nm">${p.name}<small>${p.size}</small>
            ${co.step < 3 ? `<div class="qty" style="height:26px;margin-top:6px"><button type="button" data-qty="${id}" data-delta="-1" aria-label="${esc(t('qty.dec'))}">−</button><span>${qty}</span><button type="button" data-qty="${id}" data-delta="1" aria-label="${esc(t('qty.inc'))}">+</button></div>` : ''}
          </div><b>${money(p.price * qty)}</b></div>`;
      }).join('')}
    </div>
    ${config.settings.hasPromos ? `<form class="promo" data-promo>
      <input name="code" placeholder="${esc(t('promo.placeholder'))}" aria-label="${esc(t('promo.placeholder'))}" value="${esc(co.promo || '')}" ${co.promo ? 'disabled' : ''}/>
      ${co.promo ? `<button type="button" class="btn btn-ghost" data-action="remove-promo">${esc(t('promo.remove'))}</button>` : `<button class="btn btn-ghost">${esc(t('promo.apply'))}</button>`}
    </form>
    <div class="promo-msg" id="promo-msg"></div>` : ''}
    <div class="co-totals">
      <div class="sum-row"><span>${esc(t('sum.subtotal'))}</span><b>${money(tot.subtotal)}</b></div>
      ${tot.discount ? `<div class="sum-row discount"><span>${esc(t('sum.discount', { code: co.promo }))}</span><b>−${money(tot.discount)}</b></div>` : ''}
      <div class="sum-row"><span>${esc(t('sum.shipping'))} <small>· ${esc(t(`ship.${tot.method}`))}</small></span><b>${tot.shipping ? money(tot.shipping) : esc(t('free'))}</b></div>
      <div class="sum-row"><span>${esc(t('sum.tax'))} ${tot.rate ? `<small>· ${tot.rate}%</small>` : ''}</span><b>${tot.tax != null ? money(tot.tax) : `<small>${esc(t('sum.selectState'))}</small>`}</b></div>
      <div class="sum-row total"><span>${esc(t('sum.total'))} <small>USD</small></span><b>${money(tot.total)}</b></div>
    </div>
    <div class="co-guarantee">${ICON.shield}<span>${t('co.guarantee')}</span></div>`;
}

function refreshSummary() {
  const side = $('#co-side');
  if (!side) return;
  const before = side.querySelector('.sum-row.total b')?.textContent;
  side.innerHTML = summaryHTML();
  const after = side.querySelector('.sum-row.total b');
  if (before !== after.textContent) after.classList.add('flash');
  const opts = $('#ship-options');
  if (opts) opts.innerHTML = shippingOptionsHTML();
}

function arrival(days) {
  const d = new Date();
  let added = 0;
  while (added < days + 1) { d.setDate(d.getDate() + 1); if (d.getDay() % 6 !== 0) added++; }
  return d.toLocaleDateString(LANGS[lang].locale, { weekday: 'short', month: 'short', day: 'numeric' });
}

function validateShipping() {
  const s = co.ship; const e = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.email.trim())) e.email = 'err.email';
  if (!s.first.trim()) e.first = 'err.required';
  if (!s.last.trim()) e.last = 'err.required';
  if (s.address.trim().length < 4) e.address = 'err.address';
  if (!s.city.trim()) e.city = 'err.required';
  if (s.country === 'US' && !s.region) e.region = 'err.required';
  if (isDomestic(s.country) && !/^\d{5}$/.test(s.zip)) e.zip = 'err.zip';
  return e;
}

function goStep(n) {
  co.step = n; co.errors = {}; co.error = '';
  renderCheckout();
  $('#checkout-card .co-main').scrollTop = 0;
  $('#checkout-card').scrollTop = 0;
  $('#checkout-card .co-main input, #checkout-card .co-main select')?.focus({ preventScroll: true });
}

function submitStep() {
  if (co.step === 1) {
    co.errors = validateShipping();
    if (Object.keys(co.errors).length) { renderCheckout(); focusFirstError(); return; }
    goStep(2);
  } else if (co.step === 2) {
    if (!config.payments.some((m) => m.id === co.payment)) { co.errors = { payment: 'err.payment' }; renderCheckout(); return; }
    goStep(3);
  } else if (co.step === 3 && !co.placing) {
    placeOrder();
  }
}

function focusFirstError() {
  $('#checkout-card .field.invalid input, #checkout-card .field.invalid select')?.focus();
}

const STEP1_FIELDS = ['email', 'first', 'last', 'phone', 'country', 'address', 'apt', 'city', 'region', 'zip'];

async function placeOrder() {
  co.placing = true; co.error = '';
  renderCheckout();
  try {
    const res = await api('/orders', {
      method: 'POST',
      body: { items: state.cart, customer: co.ship, method: totals().method, payment: co.payment, promo: co.promo, lang },
    });
    if (res.redirect) {
      // Remember the form so a cancelled payment can come straight back to it.
      try { sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify({ ship: co.ship, method: co.method, payment: co.payment, promo: co.promo, promoPct: co.promoPct })); } catch { /* ignore */ }
      window.location.assign(res.redirect);
      return;
    }
    clearCart();
    await showOrder(res.order);
  } catch (err) {
    co.placing = false;
    co.error = err.message;
    const fields = err.fields || {};
    if (fields.promo) { co.promo = null; co.promoPct = 0; }
    if (STEP1_FIELDS.some((f) => fields[f])) { co.step = 1; co.errors = fields; }
    else if (fields.payment) { co.step = 2; co.errors = fields; }
    renderCheckout();
  }
}

/* ---------- order result (after placing, or returning from a payment page) ---------- */

async function showOrder(id, { cancelled = false } = {}) {
  if (cancelled) {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(CHECKOUT_KEY) || 'null'); } catch { /* ignore */ }
    Object.assign(co, freshCheckout(), saved || {}, { step: saved ? 3 : 1, error: t('res.paymentCancelled') });
    if (cartCount()) { renderCheckout(); openOverlay('checkout'); }
    return;
  }
  co.view = 'confirming';
  renderCheckout();
  if (state.overlay !== 'checkout') openOverlay('checkout');
  let order = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try { order = await api(`/orders/${encodeURIComponent(id)}?refresh=1`); } catch { order = null; break; }
    if (order.status !== 'pending_payment' || order.manual) break;
    await new Promise((r) => setTimeout(r, 1800)); // webhook / provider may lag a moment
  }
  co.view = 'result';
  co.order = order;
  if (order && (order.status === 'paid' || order.manual)) {
    clearCart();
    try { sessionStorage.removeItem(CHECKOUT_KEY); } catch { /* ignore */ }
  }
  renderCheckout();
}

function resultHTML() {
  if (co.view === 'confirming') {
    return `<div class="success"><div class="burst pending"><span class="spin big"></span></div>
      <h2>${esc(t('res.confirming'))}</h2><p>${esc(t('res.confirmingText'))}</p></div>`;
  }
  const o = co.order;
  const done = `<div class="success-actions"><button class="btn btn-primary btn-lg" data-action="finish-order" data-autofocus>${esc(t('res.continue'))}</button></div>`;
  if (!o) {
    return `<div class="success"><div class="burst warn">${ICON.alert}</div><h2>${esc(t('res.notFound'))}</h2>
      <p>${esc(t('res.notFoundText'))}</p>${done}</div>`;
  }
  const strong = (s) => `<b style="color:var(--white)">${esc(s)}</b>`;
  const method = payShort(o.paymentMethod);
  const meta = `<dl class="order-meta">
      <div><dt>${esc(t('res.orderNo'))}</dt><dd>${esc(o.number)}</dd></div>
      <div><dt>${esc(t(o.status === 'pending_payment' ? 'res.amountDue' : 'res.total'))}</dt><dd>${money(o.totals.total)}</dd></div>
      <div><dt>${esc(t('res.payment'))}</dt><dd>${esc(method)}</dd></div>
    </dl>`;

  if (o.status === 'paid' || o.status === 'shipped') {
    return `<div class="success"><div class="burst"><svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg></div>
      <h2>${esc(t('res.paidTitle'))}</h2>
      <p>${t('res.paidText', { email: strong(o.email) })}${o.days && o.days < 14 ? ` ${t('res.eta', { date: strong(arrival(o.days)) })}` : ''}</p>
      ${meta}${done}</div>`;
  }
  if (o.manual && o.status === 'pending_payment') {
    return `<div class="success"><div class="burst pending">${ICON.clock}</div>
      <h2>${esc(t('res.manualTitle'))}</h2>
      <p>${t('res.manualText', { amount: strong(money(o.totals.total)), method: strong(method), number: strong(o.number), email: esc(o.email) })}</p>
      <div class="pay-instructions">${esc(o.instructions || '')}</div>
      ${meta}${done}</div>`;
  }
  if (o.status === 'cancelled') {
    return `<div class="success"><div class="burst warn">${ICON.alert}</div><h2>${esc(t('res.cancelledTitle'))}</h2>
      <p>${esc(t('res.cancelledText'))}</p>${meta}${done}</div>`;
  }
  return `<div class="success"><div class="burst pending">${ICON.clock}</div>
    <h2>${esc(t('res.processingTitle'))}</h2>
    <p>${t('res.processingText', { method: esc(method), email: strong(o.email) })}</p>
    ${meta}
    <div class="success-actions">
      <button class="btn btn-ghost btn-lg" data-action="recheck-order">${esc(t('res.checkAgain'))}</button>
      <button class="btn btn-primary btn-lg" data-action="finish-order" data-autofocus>${esc(t('res.continue'))}</button>
    </div></div>`;
}

function handlePaymentReturn() {
  const params = new URLSearchParams(location.search);
  const id = params.get('order');
  if (!id) return;
  const cancelled = params.has('cancelled');
  history.replaceState(null, '', location.pathname); // drop provider query params from the address bar
  co.orderId = id;
  showOrder(id, { cancelled });
}

/* ==========================================================================
   Toasts
   Callers pass HTML-safe strings (product fields are pre-escaped).
   ========================================================================== */
function toast({ thumb = '', icon = 'check', title, text, action, onAction, ok }) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `${thumb ? `<div class="t-thumb">${thumb}</div>` : `<div class="t-ico">${ICON[icon] || ICON.check}</div>`}
    <div class="t-text">${ok ? `<b class="ok">${ok}</b>` : ''}<b>${title}</b>${text || ''}</div>
    ${action ? `<button class="btn btn-ghost">${action}</button>` : ''}`;
  const remove = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  if (action) el.querySelector('button').addEventListener('click', () => { onAction(); remove(); });
  $('#toasts').append(el);
  while ($('#toasts').children.length > 3) $('#toasts').firstElementChild.remove();
  let timer = setTimeout(remove, 3200);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => { timer = setTimeout(remove, 1500); });
}

function toastAdded(p, qty) {
  toast({
    thumb: media(p, 0),
    ok: `${esc(t('toast.added'))}${qty > 1 ? ` · ×${qty}` : ''}`,
    title: p.name,
    text: esc(t('toast.cartTotal', { total: money(cartSubtotal()) })),
    action: esc(t('toast.viewCart')),
    onAction: openCart,
  });
}

/* ==========================================================================
   Dynamic sections (trust badges, FAQ, stats…)
   The data comes from the database (config.content, loaded in /api/bootstrap).
   For each section: localize every item → escape it → run it through its template
   → put the HTML into the element marked data-section="…" in index.html.
   ========================================================================== */
const svgIcon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

// One template per section. `it` is already localized and HTML-escaped; `tools` is the
// admin's edit/move/delete strip (empty for shoppers); `i` is the position.
const TEMPLATES = {
  heroStats: (it, tools) => `<div class="dyn">${tools}<dt>${it.value}</dt><dd>${it.label}</dd></div>`,
  heroCallouts: (it, tools, i) => `<div class="hero-callout c${i + 1} dyn">${tools}<b>${it.title}</b><span>${it.text}</span></div>`,
  trust: (it, tools) => `<div class="trust-item dyn">${tools}${svgIcon(it.icon)}<div><b>${it.title}</b><span>${it.text}</span></div></div>`,
  aboutPoints: (it, tools) => `<li class="dyn">${tools}<b>${it.title}</b> <span>${it.text}</span></li>`,
  aboutStats: (it, tools) => `<div class="dyn">${tools}<dt>${it.value}</dt><dd>${it.label}</dd></div>`,
  policies: (it, tools) => `<div class="dyn">${tools}<b>${it.title}</b><span>${it.text}</span></div>`,
  faq: (it, tools, i) => {
    const open = faqOpen.has(it.id) || (!faqTouched && i === 0);
    return `<div class="acc-item dyn ${open ? 'open' : ''}" data-faq="${it.id}">${tools}
      <button class="acc-q" aria-expanded="${open}" aria-controls="faq-a-${it.id}" id="faq-q-${it.id}"><span>${it.tag ? `<span class="acc-tag">${it.tag}</span>` : ''}${it.question}</span><span class="plus" aria-hidden="true"></span></button>
      <div class="acc-a" id="faq-a-${it.id}" role="region" aria-labelledby="faq-q-${it.id}"><div><p>${it.answer}</p></div></div>
    </div>`;
  },
};

// Shown while a stats-type section is still empty, so the layout keeps its shape.
const PLACEHOLDERS = {
  heroStats: () => `<div><dt class="ph">${esc(t('stats.placeholder'))}</dt></div>`,
  heroCallouts: (i) => `<div class="hero-callout c${i + 1}"><span>${esc(t('stats.placeholder'))}</span></div>`,
  aboutStats: () => `<div><dt class="ph">${esc(t('stats.placeholder'))}</dt></div>`,
};

const faqOpen = new Set();
let faqTouched = false;

function adminTools(key, it, i, count) {
  if (!state.me) return '';
  const label = esc(t(`sec.${key}`));
  return `<span class="sec-tools" role="group" aria-label="${label}">
    <button data-admin="sec-edit" data-id="${it.id}" data-sec="${key}" aria-label="${esc(t('a.sec.edit1'))}" title="${esc(t('a.sec.edit1'))}">✎</button>
    <button data-admin="sec-up" data-id="${it.id}" ${i === 0 ? 'disabled' : ''} aria-label="${esc(t('a.sec.up'))}" title="${esc(t('a.sec.up'))}">↑</button>
    <button data-admin="sec-down" data-id="${it.id}" ${i === count - 1 ? 'disabled' : ''} aria-label="${esc(t('a.sec.down'))}" title="${esc(t('a.sec.down'))}">↓</button>
    <button data-admin="sec-delete" data-id="${it.id}" data-sec="${key}" aria-label="${esc(t('a.sec.delete'))}" title="${esc(t('a.sec.delete'))}">✕</button>
  </span>`;
}

function renderSection(key) {
  const el = $(`[data-section="${key}"]`);
  if (!el) return;
  const items = (config.content[key] || []).map((item) => escapeDeep(localizeItem(item, lang)));
  let html = items.map((it, i) => TEMPLATES[key](it, adminTools(key, it, i, items.length), i)).join('');
  if (!items.length && PLACEHOLDERS[key]) html = Array.from({ length: SECTIONS[key].max }, (_, i) => PLACEHOLDERS[key](i)).join('');
  if (state.me && items.length < SECTIONS[key].max) {
    const tag = el.tagName === 'UL' ? 'li' : 'div';
    html += `<${tag} class="sec-add-wrap"><button class="sec-add" data-admin="sec-new" data-sec="${key}">+ ${esc(t('a.sec.addTo', { section: t(`sec.${key}`) }))}</button></${tag}>`;
  }
  el.innerHTML = html;
  el.hidden = !html; // e.g. no policies yet → hide the banner for shoppers
}

function renderSections() {
  SECTION_KEYS.forEach(renderSection);
}

/* ==========================================================================
   Event wiring (delegated)
   ========================================================================== */
function onClick(e) {
  const tg = e.target;
  const q = (sel) => tg.closest(sel);
  let el;

  if (q('#menu-button')) { setMenu(!$('.site-header').classList.contains('nav-open')); return; }
  if (!q('.main-nav') || q('button')) setMenu(false);
  if (q('#lang-button')) { setLangMenu($('#lang-menu').hidden); return; }
  if ((el = q('[data-lang]'))) { setLangMenu(false); setLang(el.dataset.lang); $('#lang-button').focus(); return; }
  if (!q('#lang')) setLangMenu(false);
  if (q('[data-admin]') || q('#admin-modal') || q('.admin-bar')) return; // handled by admin.js

  if ((el = q('[data-add]'))) {
    const qty = el.hasAttribute('data-modal-add') ? modal.qty : 1;
    addToCart(el.dataset.add, qty);
    if (el.classList.contains('add-btn')) {
      el.classList.add('added'); el.innerHTML = `${ICON.check} ${esc(t('card.added'))}`;
      setTimeout(() => { el.classList.remove('added'); el.innerHTML = `${ICON.cart} ${esc(t('card.add'))}`; }, 1300);
    }
    if (state.overlay === 'product') { modal.qty = 1; rerenderProductKeepScroll(); }
    return;
  }
  if ((el = q('[data-quick]'))) { openProduct(el.dataset.quick); return; }
  if ((el = q('[data-category]'))) { state.category = el.dataset.category; renderGrid(); return; }
  if ((el = q('[data-collection]'))) {
    state.collection = state.collection === el.dataset.collection && !q('.site-footer') ? null : el.dataset.collection;
    state.category = 'All';
    closeOverlays(); renderGrid(); scrollToCatalog(); return;
  }
  if ((el = q('[data-scroll]'))) { closeOverlays(); $(`#${el.dataset.scroll}`).scrollIntoView({ behavior: 'smooth' }); return; }
  if ((el = q('[data-qty]'))) {
    const line = state.cart.find((l) => l.id === el.dataset.qty);
    if (line) setQty(line.id, line.qty + +el.dataset.delta);
    return;
  }
  if ((el = q('[data-remove]'))) { removeFromCart(el.dataset.remove); return; }
  if ((el = q('[data-view]'))) { modal.view = +el.dataset.view; rerenderProductKeepScroll(); return; }
  if ((el = q('[data-tab]'))) { modal.tab = el.dataset.tab; rerenderProductKeepScroll(); return; }
  if ((el = q('[data-mqty]'))) { modal.qty = Math.max(1, Math.min(99, modal.qty + +el.dataset.mqty)); rerenderProductKeepScroll(); return; }
  if ((el = q('#pm-main'))) { el.classList.toggle('zoom'); return; }
  if ((el = q('.acc-q'))) {
    const item = el.parentElement;
    const open = !item.classList.contains('open');
    item.classList.toggle('open', open);
    el.setAttribute('aria-expanded', open);
    faqTouched = true;
    const id = Number(item.dataset.faq);
    open ? faqOpen.add(id) : faqOpen.delete(id);
    return;
  }
  if ((el = q('[data-goto]'))) { goStep(+el.dataset.goto); return; }

  const action = q('[data-action]')?.dataset.action;
  switch (action) {
    case 'close-overlays': closeOverlays(); break;
    case 'home': e.preventDefault(); closeOverlays(); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
    case 'clear-collection': state.collection = null; renderGrid(); break;
    case 'clear-query': state.query = ''; $('#search-input').value = ''; renderGrid(); break;
    case 'clear-filters': Object.assign(state, { category: 'All', collection: null, query: '' }); $('#search-input').value = ''; renderGrid(); break;
    case 'checkout': openCheckout(); break;
    case 'shop-from-cart': closeOverlays(); scrollToCatalog(); break;
    case 'back-to-cart': openCart(); break;
    case 'remove-promo': co.promo = null; co.promoPct = 0; refreshSummary(); break;
    case 'finish-order': closeOverlays(); scrollToCatalog(); break;
    case 'recheck-order': if (co.orderId) showOrder(co.orderId); break;
    case 'reload': location.reload(); break;
    case 'add-fbt': {
      const ids = [...modal.fbt].filter((id) => byId[id]);
      ids.forEach((id) => addToCart(id, 1, { silent: true }));
      toast({ icon: 'check', ok: esc(t('toast.itemsAdded', { n: ids.length })), title: esc(t('toast.bundle')), text: esc(t('toast.cartTotal', { total: money(cartSubtotal()) })), action: esc(t('toast.viewCart')), onAction: openCart });
      rerenderProductKeepScroll();
      break;
    }
  }
}

function onInput(e) {
  const tg = e.target;
  if (!tg.hasAttribute('data-ship')) return;
  if (tg.name === 'zip' && isDomestic(co.ship.country)) tg.value = tg.value.replace(/\D/g, '').slice(0, 5);
  co.ship[tg.name] = tg.value;
  if (co.errors[tg.name]) { delete co.errors[tg.name]; tg.closest('.field')?.classList.remove('invalid'); }
  if (tg.name === 'region') refreshSummary();
}

function onChange(e) {
  const tg = e.target;
  if (tg.id === 'sort') { state.sort = tg.value; renderGrid(); return; }
  if (tg.dataset.fbt) {
    tg.checked ? modal.fbt.add(tg.dataset.fbt) : modal.fbt.delete(tg.dataset.fbt);
    rerenderProductKeepScroll(); return;
  }
  if (tg.name === 'country' && tg.hasAttribute('data-ship')) {
    co.ship.country = tg.value;
    co.ship.region = tg.value === 'PR' ? 'PR' : '';
    co.ship.zip = '';
    co.method = shippingOptions(tg.value)[0];
    co.errors = {};
    renderCheckout();
    $('#f-country')?.focus();
    return;
  }
  if (tg.name === 'method') { co.method = tg.value; refreshSummary(); return; }
  if (tg.name === 'payment') { co.payment = tg.value; co.errors = {}; return; }
}

async function onSubmit(e) {
  e.preventDefault();
  if (e.target.id === 'co-form') { submitStep(); return; }
  if (e.target.matches('[data-promo]')) {
    const code = e.target.code.value.trim().toUpperCase();
    const msg = $('#promo-msg');
    if (!code) { msg.className = 'promo-msg bad'; msg.textContent = t('promo.enter'); return; }
    try {
      const res = await api('/promo', { method: 'POST', body: { code } });
      co.promo = res.code; co.promoPct = res.pct;
      refreshSummary();
      const m = $('#promo-msg'); m.className = 'promo-msg ok'; m.textContent = t('promo.applied', { pct: res.pct });
    } catch (err) {
      msg.className = 'promo-msg bad'; msg.textContent = err.message;
    }
  }
}

function onKeydown(e) {
  if (e.key === 'Escape' && !$('#lang-menu').hidden) { setLangMenu(false); $('#lang-button').focus(); return; }
  if (!$('#lang-menu').hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const opts = $$('#lang-menu button');
    const i = opts.indexOf(document.activeElement);
    opts[(i + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length].focus();
    return;
  }
  if (e.key === 'Escape' && $('.site-header').classList.contains('nav-open')) { setMenu(false); $('#menu-button').focus(); return; }
  if (e.key === 'Escape' && state.overlay) {
    if ($('#pm-main.zoom')) { $('#pm-main').classList.remove('zoom'); return; }
    if (state.overlay === 'checkout' && co.view === 'confirming') return;
    closeOverlays();
  }
  trapFocus(e);
}

/* ==========================================================================
   Admin hand-off
   The admin module only loads for signed-in staff, or on /admin to show the sign-in form.
   ========================================================================== */
const ctx = {
  api, esc, money, media, productArt, toast, openOverlay, closeOverlays, openProduct, t,
  CATEGORIES, COLLECTIONS, state,
  get lang() { return lang; },
  onLang: (fn) => langListeners.push(fn),
  raw: (id) => source.find((p) => p.id === id), // all languages, for the editor
  rawList: () => source.map((p) => localizeProduct(p, lang)),
  setProducts(list) {
    setProducts(list);
    saveCart();
    renderBadge();
    renderGrid();
    if (state.overlay === 'product') { if (byId[modal.id]) rerenderProductKeepScroll(); else closeOverlays(); }
  },
  SECTIONS, ICONS,
  content: () => config.content, // raw items (all languages), for the section editor
  setContent(content) { config.content = content; renderSections(); },
  setMe(me) {
    state.me = me;
    document.body.classList.toggle('is-admin', Boolean(me));
    renderSections();
    renderGrid();
    if (state.overlay === 'product') rerenderProductKeepScroll();
  },
  reloadConfig: async () => {
    const data = await api('/bootstrap');
    config.settings = data.settings;
    config.payments = data.payments;
  },
};

async function loadAdmin() {
  const mod = await import('./admin.js');
  mod.init(ctx);
}

/* ==========================================================================
   Boot
   ========================================================================== */
async function init() {
  applyStatic();
  $('#logo-mark').innerHTML = LOGO_MARK;
  $('#logo-mark-foot').innerHTML = LOGO_MARK.replace(/lg-k/g, 'lg-k2');
  const heroIds = ['k9-quantum', 'graphene-shield', 'hydro-seal'];
  $('#hero-visual').insertAdjacentHTML('afterbegin', heroArt(heroIds.map((id) => LAUNCH_PRODUCTS.find((p) => p.id === id))));
  initSearch();
  initZoom();

  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', onKeydown);
  $('#cart-button').addEventListener('click', (e) => { e.stopPropagation(); setLangMenu(false); openCart(); });
  $('#scrim').addEventListener('click', () => { if (!(state.overlay === 'checkout' && co.view === 'confirming')) closeOverlays(); });
  $$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m && !(state.overlay === 'checkout' && co.view === 'confirming')) closeOverlays(); }));

  state.cart = loadCart();
  try {
    const data = await api('/bootstrap');
    config.settings = data.settings;
    config.payments = data.payments;
    config.content = data.content;
    setProducts(data.products);
    state.me = data.me;
    document.body.classList.toggle('is-admin', Boolean(data.me));
  } catch {
    state.loadError = true;
  }
  saveCart();
  renderSections();
  renderGrid();
  renderBadge();
  if (state.me || location.pathname === '/admin') loadAdmin();
  handlePaymentReturn();
}

init();
