// Store admin, loaded only for signed-in staff (or on /admin to show the sign-in form).
// Admins manage products, orders and store settings; the superadmin also manages the team.
// The admin UI follows the site language toggle; product text is edited per language.
import { LANGS } from './i18n.js';
import { TEXT_FIELDS } from './data.js';

let ctx;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const t = (key, vars) => ctx.t(key, vars);
const esc = (s) => ctx.esc(s);
const te = (key, vars) => esc(t(key, vars));

const SHAPES = ['bottle', 'spray', 'squeeze', 'pad', 'towel', 'block', 'applicator', 'kit'];
const ONLINE = new Set(['stripe', 'paypal', 'mercadopago']);
const STATUS = { paid: ['a.st.paid', 'ok'], shipped: ['a.st.shipped', 'blue'], cancelled: ['a.st.cancelled', 'muted'] };
const X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const payName = (id) => (id === 'stripe' ? 'Stripe' : t(`pay.${id}`));

const view = { name: null, ed: null, orders: null, filter: 'pending_payment', order: null, settings: null, users: null, temp: null };

export function init(context) {
  ctx = context;
  if (!document.querySelector('link[href^="/css/admin.css"]')) {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/css/admin.css' });
    document.head.append(link);
  }
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ctx.state.overlay === 'admin' && !view.busy) ctx.closeOverlays();
    if (e.key === 'Enter' && e.target.matches('tr[data-ad="order"]')) e.target.click();
  });
  $('#admin-modal').addEventListener('click', (e) => { if (e.target.id === 'admin-modal') ctx.closeOverlays(); });
  ctx.onLang(() => {
    if (ctx.state.me) { renderBar(); refreshOrderCount(); }
    if (ctx.state.overlay === 'admin') {
      if (view.name === 'editor') collectEditor($('[data-form="product"]'));
      if (view.name === 'section') collectSection($('[data-form="section"]'));
      render();
    }
  });

  if (ctx.state.me) { renderBar(); refreshOrderCount(); }
  else show('login');
}

/* ==========================================================================
   Shell
   ========================================================================== */
const locale = () => LANGS[ctx.lang].locale;
const date = (s) => (s ? new Date(`${s.replace(' ', 'T')}Z`).toLocaleString(locale(), { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const usd = (n) => ctx.money(n);

function show(name, patch = {}) {
  Object.assign(view, { name }, patch);
  render();
  if (ctx.state.overlay !== 'admin') ctx.openOverlay('admin');
  $('#admin-card').scrollTop = 0;
}

function render() {
  const card = $('#admin-card');
  card.className = `modal-card admin-card ${view.name === 'login' ? 'narrow' : ''}`;
  card.innerHTML = { login: loginView, editor: editorView, section: sectionView, orders: ordersView, order: orderView, settings: settingsView, users: usersView, account: accountView }[view.name]();
  const af = card.querySelector('[data-autofocus]');
  if (af) requestAnimationFrame(() => af.focus({ preventScroll: true }));
}

function head(title, sub = '', back = '') {
  return `<div class="adm-head">
    <div>${back ? `<button class="adm-back" data-ad="${back}">${te('a.back')}</button>` : ''}<h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
    <button class="icon-btn" data-ad="close" aria-label="${te('close')}">${X}</button>
  </div>`;
}

function renderBar() {
  $('.admin-bar')?.remove();
  const me = ctx.state.me;
  if (!me) return;
  const bar = document.createElement('div');
  bar.className = 'admin-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', t('a.bar.aria'));
  bar.innerHTML = `
    <span class="ab-who"><b>${esc(me.name)}</b><span>${te(`a.role.${me.role}`)}</span></span>
    <button data-ab="new">${te('a.bar.product')}</button>
    <button data-ab="orders">${te('a.bar.orders')} <em id="ab-pending" hidden></em></button>
    <button data-ab="settings">${te('a.bar.settings')}</button>
    ${me.role === 'superadmin' ? `<button data-ab="users">${te('a.bar.team')}</button>` : ''}
    <button data-ab="account">${te('a.bar.account')}</button>
    <button data-ab="logout">${te('a.bar.signout')}</button>`;
  document.body.append(bar);
}

async function refreshOrderCount() {
  try {
    const { counts } = await ctx.api('/admin/orders?status=paid');
    const n = (counts.paid || 0) + (counts.awaiting_transfer || 0);
    const el = $('#ab-pending');
    if (el) { el.hidden = !n; el.textContent = n; el.title = t('a.bar.pending', { paid: counts.paid || 0, transfers: counts.awaiting_transfer || 0 }); }
  } catch { /* signed out elsewhere */ }
}

function fail(err) {
  if (err.status === 401 && view.name !== 'login') { ctx.setMe(null); $('.admin-bar')?.remove(); show('login', { error: t('a.sessionExpired') }); return; }
  ctx.toast({ icon: 'alert', title: esc(err.message) });
}

/* ==========================================================================
   Sign in
   ========================================================================== */
function loginView() {
  return `${head(te('a.signin.title'), te('a.signin.sub'))}
    <form class="adm-form" data-form="login">
      ${view.error ? `<div class="co-error">${esc(view.error)}</div>` : ''}
      <div class="field"><label for="ad-email">${te('a.email')}</label><input id="ad-email" name="email" type="email" autocomplete="username" required data-autofocus/></div>
      <div class="field"><label for="ad-pass">${te('a.password')}</label><input id="ad-pass" name="password" type="password" autocomplete="current-password" required/></div>
      <button class="btn btn-primary btn-block" ${view.busy ? 'disabled' : ''}>${te(view.busy ? 'a.signingIn' : 'a.signin')}</button>
    </form>`;
}

/* ==========================================================================
   Product editor
   Spanish text lives on the product; English/Portuguese in d.tr.en / d.tr.pt.
   ========================================================================== */
const lines = (arr) => (arr || []).join('\n');
const kv = (pairs) => (pairs || []).map(([k, v]) => `${k}: ${v}`).join('\n');
const parseLines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const parseKV = (s) => parseLines(s).map((l) => { const i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : [l, '']; });

function openEditor(id) {
  const p = id ? ctx.raw(id) : null;
  const d = p ? structuredClone(p) : { name: '', short: '', tagline: '', category: 'Coatings', collections: [], price: '', size: '', ribbon: '', badges: [], description: '', specs: {}, instructions: [], compatibility: [], benefits: [], pairs: [], images: [], shape: 'bottle', hue: 188 };
  d.tr = { en: {}, pt: {}, ...d.tr };
  show('editor', { ed: { id: p?.id || null, d, lang: 'es', errors: {}, uploading: 0, saving: false } });
}

// The text bucket for the language being edited.
const bucket = () => (view.ed.lang === 'es' ? view.ed.d : view.ed.d.tr[view.ed.lang]);

function editorView() {
  const { id, d, errors, lang } = view.ed;
  const b = bucket();
  const es = d; // Spanish values shown as hints on the translation tabs
  const isTr = lang !== 'es';
  const hint = (v) => (isTr && v ? esc(Array.isArray(v) ? v.join(', ') : String(v)).slice(0, 80) : '');
  const others = ctx.rawList().filter((p) => p.id !== id);
  const f = (name, label, input, hintText = '') => `<div class="field ${errors[name] ? 'invalid' : ''}"><label>${label}${hintText ? ` <small>${hintText}</small>` : ''}</label>${input}<span class="err">${errors[name] ? te(errors[name]) : ''}</span></div>`;
  const shared = (html) => (isTr ? '' : html);
  return `${head(te(id ? 'a.ed.edit' : 'a.ed.new'), id ? esc(es.name) : te('a.ed.newSub'))}
  <form class="adm-form editor" data-form="product" novalidate>
    <div class="ed-langs" role="tablist" aria-label="${te('a.ed.lang')}">
      ${Object.entries(LANGS).map(([k, l]) => `<button type="button" role="tab" data-ad="ed-lang" data-lang-tab="${k}" aria-selected="${lang === k}">${esc(l.label)}${k === 'es' ? ` <small>${te('a.ed.langMain')}</small>` : ''}</button>`).join('')}
    </div>
    ${isTr ? `<p class="ed-tr-note">${te('a.ed.langHint')}</p>` : ''}

    <section class="ed-sec">
      <h3>${te('a.ed.basics')}</h3>
      <div class="ed-grid">
        <div class="s2">${f('name', te('a.ed.name'), `<input name="name" value="${esc(b.name || '')}" placeholder="${hint(es.name)}" maxlength="120" ${isTr ? '' : 'required'} data-autofocus/>`)}</div>
        ${shared(f('price', te('a.ed.price'), `<input name="price" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(d.price)}" required/>`))}
        ${f('size', te('a.ed.size'), `<input name="size" value="${esc(b.size || '')}" maxlength="40" placeholder="${isTr ? hint(es.size) : te('a.ed.sizePh')}"/>`)}
        ${shared(f('category', te('a.ed.category'), `<select name="category">${ctx.CATEGORIES.filter((c) => c !== 'All').map((c) => `<option value="${esc(c)}" ${d.category === c ? 'selected' : ''}>${te(`cat.${c}`)}</option>`).join('')}</select>`))}
        ${f('ribbon', te('a.ed.ribbon'), `<input name="ribbon" value="${esc(b.ribbon || '')}" maxlength="20" placeholder="${isTr ? hint(es.ribbon) : te('a.ed.ribbonPh')}"/>`, te('a.optional'))}
        <div class="s2">${f('tagline', te('a.ed.tagline'), `<input name="tagline" value="${esc(b.tagline || '')}" placeholder="${hint(es.tagline)}" maxlength="160"/>`)}</div>
        ${shared(`<div class="s2"><div class="field"><label>${te('a.ed.collections')}</label><div class="ed-checks">
          ${Object.keys(ctx.COLLECTIONS).map((k) => `<label><input type="checkbox" class="check" name="collections" value="${k}" ${d.collections.includes(k) ? 'checked' : ''}/>${te(`col.${k}`)}</label>`).join('')}
        </div></div></div>`)}
      </div>
    </section>

    ${shared(`<section class="ed-sec">
      <h3>${te('a.ed.photos')} <small>${te('a.ed.photosHint')}</small></h3>
      <div class="ed-photos" id="ed-photos">${photosHTML()}</div>
    </section>

    <section class="ed-sec ${d.images.length ? 'muted-sec' : ''}" id="ed-art">
      <h3>${te('a.ed.art')} <small>${te(d.images.length ? 'a.ed.artHidden' : 'a.ed.artShown')}</small></h3>
      <div class="ed-art">
        <div class="ed-art-preview" id="ed-art-preview">${ctx.productArt(previewProduct(), 0)}</div>
        <div class="ed-grid">
          ${f('shape', te('a.ed.shape'), `<select name="shape">${SHAPES.map((k) => `<option value="${k}" ${d.shape === k ? 'selected' : ''}>${te(`a.shape.${k}`)}</option>`).join('')}</select>`)}
          ${f('short', te('a.ed.label'), `<input name="short" value="${esc(d.short)}" maxlength="12" placeholder="K-9"/>`)}
          <div class="s2">${f('hue', te('a.ed.color'), `<input name="hue" type="range" min="0" max="360" value="${Number(d.hue) || 0}" class="hue-range"/>`)}</div>
        </div>
      </div>
    </section>`)}

    <section class="ed-sec">
      <h3>${te('a.ed.details')}</h3>
      ${f('badges', te('a.ed.badges'), `<input name="badges" value="${esc((b.badges || []).join(', '))}" placeholder="${isTr ? hint(es.badges) : te('a.ed.badgesPh')}"/>`, te('a.ed.badgesHint'))}
      ${f('description', te('a.ed.description'), `<textarea name="description" rows="4" maxlength="2000" placeholder="${hint(es.description)}">${esc(b.description || '')}</textarea>`)}
      <div class="ed-grid">
        ${f('specs', te('a.ed.specs'), `<textarea name="specs" rows="6" placeholder="${isTr ? esc(kv(Object.entries(es.specs || {}))) : te('a.ed.specsPh')}">${esc(kv(Object.entries(b.specs || {})))}</textarea>`, te('a.ed.specsHint'))}
        ${f('benefits', te('a.ed.benefits'), `<textarea name="benefits" rows="6" placeholder="${isTr ? esc(kv(es.benefits)) : te('a.ed.benefitsPh')}">${esc(kv(b.benefits))}</textarea>`, te('a.ed.benefitsHint'))}
        ${f('instructions', te('a.ed.steps'), `<textarea name="instructions" rows="6" placeholder="${isTr ? esc(lines(es.instructions)) : te('a.ed.stepsPh')}">${esc(lines(b.instructions))}</textarea>`, te('a.ed.stepsHint'))}
        ${f('compatibility', te('a.ed.compat'), `<textarea name="compatibility" rows="6" placeholder="${isTr ? esc(lines(es.compatibility)) : te('a.ed.compatPh')}">${esc(lines(b.compatibility))}</textarea>`, te('a.ed.compatHint'))}
      </div>
    </section>

    ${shared(`<section class="ed-sec">
      <h3>${te('a.ed.pairs')} <small>${te('a.ed.pairsHint')}</small></h3>
      <div class="ed-pairs">
        ${others.map((p) => `<label class="${d.pairs.includes(p.id) ? 'on' : ''}"><input type="checkbox" class="check" name="pairs" value="${esc(p.id)}" ${d.pairs.includes(p.id) ? 'checked' : ''}/>${esc(p.name)}</label>`).join('') || `<p class="muted">${te('a.ed.noOthers')}</p>`}
      </div>
    </section>`)}

    <div class="ed-actions">
      ${id ? `<button type="button" class="btn btn-ghost danger-ghost" data-ad="delete" data-id="${esc(id)}">${te('a.ed.delete')}</button>` : '<span></span>'}
      <div>
        <button type="button" class="btn btn-ghost" data-ad="close">${te('a.cancel')}</button>
        <button class="btn btn-primary" ${view.ed.saving || view.ed.uploading ? 'disabled' : ''}>${editorButtonLabel()}</button>
      </div>
    </div>
  </form>`;
}

const editorButtonLabel = () => {
  const { saving, uploading, id } = view.ed;
  return te(saving ? 'a.ed.saving' : uploading ? 'a.ed.uploading' : id ? 'a.ed.save' : 'a.ed.create');
};

function photosHTML() {
  const { d, uploading } = view.ed;
  return `${d.images.map((src, i) => `<figure class="ed-photo">
      <img src="${esc(src)}" alt="${te('pm.photo', { n: i + 1 })}"/>
      ${i === 0 ? `<span class="main-tag">${te('a.ed.main')}</span>` : ''}
      <div class="ed-photo-tools">
        <button type="button" data-ad="img-left" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="${te('a.ed.moveLeft')}">←</button>
        <button type="button" data-ad="img-del" data-i="${i}" aria-label="${te('a.ed.removePhoto')}">${X}</button>
        <button type="button" data-ad="img-right" data-i="${i}" ${i === d.images.length - 1 ? 'disabled' : ''} aria-label="${te('a.ed.moveRight')}">→</button>
      </div>
    </figure>`).join('')}
    ${Array.from({ length: uploading }, () => '<div class="ed-photo loading"><span class="spin"></span></div>').join('')}
    ${d.images.length + uploading < 8 ? `<label class="ed-add-photo"><input type="file" accept="image/*" multiple data-ad-upload/><span>+</span>${te('a.ed.addPhotos')}</label>` : ''}`;
}

function previewProduct() {
  const d = view.ed.d;
  return { ...d, name: esc(d.name || 'Preview'), short: esc((d.short || d.name.split(/\s+/)[0] || 'NEW').toUpperCase().slice(0, 12)), size: esc(d.size || ''), hue: Number(d.hue) || 0 };
}

// Copies form values into the editor state so re-renders (tab switches, uploads) never lose typing.
function collectEditor(form) {
  if (!form || !view.ed) return;
  const d = view.ed.d;
  const b = bucket();
  const fd = new FormData(form);
  const has = (k) => fd.has(k);
  b.name = fd.get('name').trim();
  b.size = fd.get('size').trim();
  b.ribbon = fd.get('ribbon').trim();
  b.tagline = fd.get('tagline').trim();
  b.badges = fd.get('badges').split(',').map((s) => s.trim()).filter(Boolean);
  b.description = fd.get('description').trim();
  b.specs = Object.fromEntries(parseKV(fd.get('specs')).filter(([k, v]) => k && v));
  b.benefits = parseKV(fd.get('benefits'));
  b.instructions = parseLines(fd.get('instructions'));
  b.compatibility = parseLines(fd.get('compatibility'));
  if (has('price')) { // shared fields only exist on the Spanish tab
    d.price = fd.get('price');
    d.category = fd.get('category');
    d.collections = fd.getAll('collections');
    d.shape = fd.get('shape');
    d.short = fd.get('short').trim();
    d.hue = Number(fd.get('hue'));
    d.pairs = fd.getAll('pairs');
  }
}

async function saveProduct(form) {
  collectEditor(form);
  const { id, d } = view.ed;
  const pick = (src) => Object.fromEntries(TEXT_FIELDS.map((k) => [k, k === 'specs' ? Object.entries(src[k] || {}) : src[k]]));
  const payload = {
    ...d,
    ...pick(d),
    price: Number(d.price),
    tr: { en: pick(d.tr.en || {}), pt: pick(d.tr.pt || {}) },
  };
  view.ed.saving = true; refreshEditorButtons();
  try {
    const res = await ctx.api(id ? `/admin/products/${encodeURIComponent(id)}` : '/admin/products', { method: id ? 'PUT' : 'POST', body: payload });
    ctx.setProducts(res.products);
    ctx.closeOverlays();
    ctx.toast({ icon: 'check', ok: te(id ? 'a.t.saved' : 'a.t.created'), title: esc(res.product.name), text: te('a.t.live') });
    ctx.openProduct(res.product.id);
  } catch (err) {
    view.ed.saving = false;
    if (err.fields) {
      view.ed.errors = err.fields;
      view.ed.lang = 'es'; // required fields live on the Spanish tab
      render();
      $('#admin-card .field.invalid input, #admin-card .field.invalid select')?.focus();
    } else { refreshEditorButtons(); fail(err); }
  }
}

function refreshEditorButtons() {
  const btn = $('#admin-card .ed-actions .btn-primary');
  if (!btn) return;
  const { saving, uploading } = view.ed;
  btn.disabled = saving || uploading > 0;
  btn.textContent = t(saving ? 'a.ed.saving' : uploading ? 'a.ed.uploading' : view.ed.id ? 'a.ed.save' : 'a.ed.create');
}

function refreshPhotos() {
  const photos = $('#ed-photos');
  if (!photos) return;
  photos.innerHTML = photosHTML();
  const art = $('#ed-art');
  art.classList.toggle('muted-sec', view.ed.d.images.length > 0);
  art.querySelector('h3 small').textContent = t(view.ed.d.images.length ? 'a.ed.artHidden' : 'a.ed.artShown');
  refreshEditorButtons();
}

// Downscales to 1600px and re-encodes in the browser: smaller uploads, and it strips
// camera metadata (including GPS location) from phone photos.
async function prepareImage(file) {
  const bmp = await createImageBitmap(file).catch(() => { throw new Error(t('a.ed.unreadable', { file: file.name })); });
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) });
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const toBlob = (type, q) => new Promise((r) => canvas.toBlob(r, type, q));
  let blob = await toBlob('image/webp', 0.86);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.88);
  return blob;
}

async function uploadPhotos(files) {
  const room = 8 - view.ed.d.images.length - view.ed.uploading;
  const list = [...files].slice(0, Math.max(0, room));
  view.ed.uploading += list.length;
  refreshPhotos();
  await Promise.all(list.map(async (file) => {
    try {
      const blob = await prepareImage(file);
      const { url } = await ctx.api('/admin/uploads', { method: 'POST', raw: blob, contentType: blob.type });
      view.ed.d.images.push(url);
    } catch (err) { fail(err); }
    finally { view.ed.uploading -= 1; if (view.name === 'editor') refreshPhotos(); }
  }));
}

async function deleteProduct(id) {
  const p = ctx.raw(id);
  if (!p) return;
  if (!window.confirm(t('a.c.delete', { name: p.name }))) return;
  try {
    const res = await ctx.api(`/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (ctx.state.overlay === 'admin') ctx.closeOverlays();
    ctx.setProducts(res.products);
    ctx.toast({ icon: 'close', title: te('a.t.deleted'), text: esc(p.name) });
  } catch (err) { fail(err); }
}

/* ==========================================================================
   Dynamic section editor
   One form for every section: the fields come from the schema in sections.js.
   ========================================================================== */
function openSectionEditor(section, id) {
  const item = id ? ctx.content()[section].find((x) => x.id === Number(id)) : null;
  const empty = { shared: {}, es: {}, en: {}, pt: {} };
  const data = item ? structuredClone({ ...empty, ...item.data }) : empty;
  show('section', { sec: { section, id: item?.id || null, data, lang: 'es', errors: {}, saving: false } });
}

function sectionView() {
  const { section, id, data, lang, errors } = view.sec;
  const schema = ctx.SECTIONS[section];
  const sectionName = t(`sec.${section}`);
  const isTr = lang !== 'es';
  const field = (f) => {
    if (!f.tr && isTr) return ''; // shared fields (numbers, icons) only on the main tab
    const val = f.tr ? data[lang][f.key] || '' : data.shared[f.key] || '';
    const ph = isTr && f.tr ? esc(data.es[f.key] || '') : '';
    const err = errors[f.key] ? `<span class="err">${te(errors[f.key])}</span>` : '<span class="err"></span>';
    const label = `<label>${te(`fld.${f.key}`)}${f.hint ? ` <small>${te(f.hint)}</small>` : ''}</label>`;
    if (f.type === 'icon') {
      return `<div class="field ${errors[f.key] ? 'invalid' : ''}">${label}<div class="icon-pick">
        ${Object.entries(ctx.ICONS).map(([name, svg]) => `<label title="${name}"><input type="radio" name="${f.key}" value="${name}" ${val === name ? 'checked' : ''}/><svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg><span class="sr-only">${name}</span></label>`).join('')}
      </div>${err}</div>`;
    }
    const input = f.type === 'textarea'
      ? `<textarea name="${f.key}" rows="4" maxlength="${f.max}" placeholder="${ph}">${esc(val)}</textarea>`
      : `<input name="${f.key}" value="${esc(val)}" maxlength="${f.max}" placeholder="${ph}"/>`;
    return `<div class="field ${errors[f.key] ? 'invalid' : ''}">${label}${input}${err}</div>`;
  };
  return `${head(te(id ? 'a.sec.edit' : 'a.sec.new', { section: sectionName }), te('a.sec.sub'))}
  <form class="adm-form" data-form="section" novalidate>
    <div class="ed-langs" role="tablist" aria-label="${te('a.ed.lang')}">
      ${Object.entries(LANGS).map(([k, l]) => `<button type="button" role="tab" data-ad="sec-lang" data-lang-tab="${k}" aria-selected="${lang === k}">${esc(l.label)}${k === 'es' ? ` <small>${te('a.ed.langMain')}</small>` : ''}</button>`).join('')}
    </div>
    ${isTr ? `<p class="ed-tr-note">${te('a.ed.langHint')}</p>` : ''}
    ${schema.fields.map(field).join('')}
    <div class="ed-actions">
      ${id ? `<button type="button" class="btn btn-ghost danger-ghost" data-ad="sec-delete">${te('a.sec.delete')}</button>` : '<span></span>'}
      <div>
        <button type="button" class="btn btn-ghost" data-ad="close">${te('a.cancel')}</button>
        <button class="btn btn-primary" ${view.sec.saving ? 'disabled' : ''}>${te(view.sec.saving ? 'a.ed.saving' : id ? 'a.ed.save' : 'a.sec.create')}</button>
      </div>
    </div>
  </form>`;
}

// Form → editor state, into the bucket for the language tab being shown.
function collectSection(form) {
  if (!form || !view.sec) return;
  const { section, data, lang } = view.sec;
  const fd = new FormData(form);
  for (const f of ctx.SECTIONS[section].fields) {
    if (!fd.has(f.key)) continue; // not on this tab (or no icon picked yet)
    const value = String(fd.get(f.key)).trim();
    if (f.tr) data[lang][f.key] = value;
    else data.shared[f.key] = value;
  }
}

async function saveSection(form) {
  collectSection(form);
  const { section, id, data } = view.sec;
  view.sec.saving = true; render();
  try {
    const res = id
      ? await ctx.api(`/admin/content/${id}`, { method: 'PUT', body: { data } })
      : await ctx.api('/admin/content', { method: 'POST', body: { section, data } });
    ctx.setContent(res.content);
    ctx.closeOverlays();
    ctx.toast({ icon: 'check', ok: te('a.t.saved'), title: te('a.t.secSaved'), text: te(`sec.${section}`) });
  } catch (err) {
    view.sec.saving = false;
    if (err.fields) { view.sec.errors = err.fields; view.sec.lang = 'es'; render(); }
    else { render(); fail(err); }
  }
}

async function moveSection(id, dir) {
  try { ctx.setContent((await ctx.api(`/admin/content/${id}/move`, { method: 'POST', body: { dir } })).content); } catch (err) { fail(err); }
}

async function deleteSectionItem(section, id) {
  if (!window.confirm(t('a.c.secDelete', { section: t(`sec.${section}`) }))) return;
  try {
    const res = await ctx.api(`/admin/content/${id}`, { method: 'DELETE' });
    if (ctx.state.overlay === 'admin') ctx.closeOverlays();
    ctx.setContent(res.content);
    ctx.toast({ icon: 'close', title: te('a.t.secDeleted') });
  } catch (err) { fail(err); }
}

/* ==========================================================================
   Orders
   ========================================================================== */
async function openOrders(filter = view.filter) {
  view.filter = filter;
  try {
    const res = await ctx.api(`/admin/orders${filter ? `?status=${filter}` : ''}`);
    show('orders', { orders: res });
    refreshOrderCount();
  } catch (err) { fail(err); }
}

function chip(status, method) {
  if (status === 'pending_payment' && ONLINE.has(method)) return `<span class="st-chip muted" title="${te('a.st.incompleteTitle')}">${te('a.st.incomplete')}</span>`;
  if (status === 'pending_payment') return `<span class="st-chip warn">${te('a.st.transfer')}</span>`;
  const [key, tone] = STATUS[status] || [status, 'muted'];
  return `<span class="st-chip ${tone}">${te(key)}</span>`;
}

function ordersView() {
  const { orders, counts } = view.orders;
  const all = ['pending_payment', 'paid', 'shipped', 'cancelled'].reduce((a, k) => a + (counts[k] || 0), 0);
  const tabs = [['pending_payment', 'a.o.awaiting'], ['paid', 'a.o.toShip'], ['shipped', 'a.o.shipped'], ['cancelled', 'a.o.cancelled'], ['', 'a.o.all']];
  return `${head(te('a.o.title'), te('a.o.sub'))}
    <div class="adm-tabs">${tabs.map(([k, l]) => `<button data-ad="orders-tab" data-f="${k}" aria-pressed="${view.filter === k}">${te(l)} <em>${k ? counts[k] || 0 : all}</em></button>`).join('')}</div>
    ${orders.length ? `<div class="adm-table-wrap"><table class="adm-table">
      <thead><tr><th>${te('a.o.order')}</th><th>${te('a.o.date')}</th><th>${te('a.o.customer')}</th><th>${te('a.o.payment')}</th><th class="r">${te('a.o.total')}</th><th>${te('a.o.status')}</th></tr></thead>
      <tbody>${orders.map((o) => `<tr data-ad="order" data-id="${esc(o.id)}" tabindex="0">
        <td><b>${esc(o.number)}</b><small>${te('a.o.items', { n: o.items.reduce((n, i) => n + i.qty, 0) })}</small></td>
        <td>${date(o.created_at)}</td>
        <td>${esc(o.customer.first)} ${esc(o.customer.last)}<small>${esc(o.email)}</small></td>
        <td>${esc(payName(o.payment_method))}</td>
        <td class="r"><b>${usd(o.totals.total)}</b></td>
        <td>${chip(o.status, o.payment_method)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="adm-empty">${te('a.o.empty')}</div>`}`;
}

function orderView() {
  const o = view.order;
  const c = o.customer;
  const tt = o.totals;
  const cancelBtn = `<button class="btn btn-ghost danger-ghost" data-ad="order-act" data-act="cancel">${te('a.o.cancel')}</button>`;
  const actions = {
    pending_payment: ONLINE.has(o.payment_method)
      ? `<p class="muted">${te('a.o.onlinePending', { method: payName(o.payment_method) })}</p>
      <button class="btn btn-ghost" data-ad="order-act" data-act="mark_paid">${te('a.o.markPaidManual')}</button>${cancelBtn}`
      : `<button class="btn btn-primary" data-ad="order-act" data-act="mark_paid">${te('a.o.markPaid')}</button>${cancelBtn}`,
    paid: `<div class="ship-form"><input id="ad-tracking" placeholder="${te('a.o.trackingPh')}" maxlength="120"/>
      <button class="btn btn-primary" data-ad="order-act" data-act="mark_shipped">${te('a.o.markShipped')}</button></div>${cancelBtn}`,
  }[o.status] || '';
  return `${head(te('a.o.orderN', { n: o.number }), `${chip(o.status, o.payment_method)} ${te('a.o.placed', { date: date(o.created_at) })}`, 'orders')}
    <div class="ord-grid">
      <div>
        <div class="ord-box"><h4>${te('a.o.itemsH')}</h4>
          ${o.items.map((i) => `<div class="ord-item">${i.image ? `<img src="${esc(i.image)}" alt=""/>` : '<span class="ph"></span>'}<span>${esc(i.name)}<small>${esc(i.size || '')} · ${usd(i.price)} × ${i.qty}</small></span><b>${usd(i.price * i.qty)}</b></div>`).join('')}
          <div class="ord-tot">
            <span>${te('a.o.subtotal')}</span><b>${usd(tt.subtotal)}</b>
            ${tt.discount ? `<span>${te('a.o.discount', { code: tt.promo })}</span><b>−${usd(tt.discount)}</b>` : ''}
            <span>${te('a.o.shipping', { method: t(`ship.${tt.method}`) })}</span><b>${usd(tt.shipping)}</b>
            <span>${te('a.o.tax')}${tt.rate ? ` · ${tt.rate}%` : ''}</span><b>${usd(tt.tax || 0)}</b>
            <span class="big">${te('a.o.totalH')}</span><b class="big">${usd(tt.total)}</b>
            ${tt.local ? `<span>${te('a.o.mp')}</span><b>${tt.local.amount.toLocaleString(locale())} ${esc(tt.local.currency)}</b>` : ''}
          </div>
        </div>
        ${actions ? `<div class="ord-box ord-actions"><h4>${te('a.o.next')}</h4>${actions}</div>` : ''}
      </div>
      <div>
        <div class="ord-box"><h4>${te('a.o.customerH')}</h4>
          <p><b>${esc(c.first)} ${esc(c.last)}</b><br/><a href="mailto:${esc(o.email)}?subject=${encodeURIComponent(t('a.o.emailSubject', { n: o.number }))}">${esc(o.email)}</a>${c.phone ? `<br/>${esc(c.phone)}` : ''}
          ${c.lang && LANGS[c.lang] ? `<br/><small>${te('a.o.lang', { lang: LANGS[c.lang].label })}</small>` : ''}</p>
          <h4>${te('a.o.shipTo')}</h4>
          <p>${esc(c.address)}${c.apt ? `, ${esc(c.apt)}` : ''}<br/>${esc(c.city)}${c.region ? `, ${esc(c.region)}` : ''} ${esc(c.zip)}<br/>${esc(c.countryName)}</p>
          <button class="btn btn-ghost btn-sm" data-ad="copy-address">${te('a.o.copyAddress')}</button>
        </div>
        <div class="ord-box"><h4>${te('a.o.paymentH')}</h4>
          <p>${esc(payName(o.payment_method))}${o.payment_ref ? `<br/><small class="mono">${esc(o.payment_ref)}</small>` : ''}</p>
          ${o.paid_at ? `<p><small>${te('a.o.paidAt', { date: date(o.paid_at) })}</small></p>` : ''}
          ${o.shipped_at ? `<p><small>${te('a.o.shippedAt', { date: date(o.shipped_at) })}${o.tracking ? ` · ${te('a.o.tracking')} <span class="mono">${esc(o.tracking)}</span>` : ''}</small></p>` : ''}
        </div>
        <form class="ord-box" data-form="notes"><h4>${te('a.o.notes')}</h4>
          <textarea name="notes" rows="3" maxlength="2000" placeholder="${te('a.o.notesPh')}">${esc(o.notes || '')}</textarea>
          <button class="btn btn-ghost btn-sm">${te('a.o.saveNotes')}</button>
        </form>
      </div>
    </div>`;
}

async function orderAction(act) {
  const o = view.order;
  const confirmText = {
    mark_paid: t('a.c.markPaid', { amount: usd(o.totals.total), n: o.number }),
    cancel: `${t('a.c.cancel', { n: o.number })}${o.status === 'paid' ? ` ${t('a.c.cancelRefund')}` : ''}`,
  }[act];
  if (confirmText && !window.confirm(confirmText)) return;
  try {
    const res = await ctx.api(`/admin/orders/${encodeURIComponent(o.id)}`, { method: 'PATCH', body: { action: act, tracking: $('#ad-tracking')?.value } });
    show('order', { order: res.order });
    refreshOrderCount();
    ctx.toast({ icon: 'check', title: te({ mark_paid: 'a.t.markPaid', mark_shipped: 'a.t.markShipped', cancel: 'a.t.cancelled' }[act]) });
  } catch (err) { fail(err); }
}

/* ==========================================================================
   Settings
   ========================================================================== */
async function openSettings() {
  try { show('settings', { settings: await ctx.api('/admin/settings') }); } catch (err) { fail(err); }
}

function settingsView() {
  const { settings: s, providers, email } = view.settings;
  const moneyField = (name, label, val) => `<div class="field"><label>${label}</label><div class="money-input"><span>$</span><input name="${name}" type="number" min="0" step="0.01" inputmode="decimal" value="${val}"/></div></div>`;
  const pv = (ok, name, keys) => `<li class="${ok ? 'on' : ''}"><b>${ok ? '✓' : '○'} ${name}</b><span>${ok ? te('a.s.connected') : te('a.s.notConnected', { keys })}</span></li>`;
  return `${head(te('a.s.title'))}
  <form class="adm-form" data-form="settings">
    <section class="ed-sec">
      <h3>${te('a.s.online')}</h3>
      <ul class="prov-list">
        ${pv(providers.stripe, 'Stripe', 'STRIPE_*')}
        ${pv(providers.paypal, 'PayPal', 'PAYPAL_*')}
        ${pv(providers.mercadopago, 'Mercado Pago', 'MP_ACCESS_TOKEN')}
        ${pv(email, te('a.s.emails'), 'RESEND_*')}
      </ul>
      <p class="muted">${te('a.s.keysNote')}</p>
      <div class="ed-grid">
        <div class="field"><label>${te('a.s.mpCurrency')}</label><select name="mpCurrency">${['MXN', 'ARS', 'BRL', 'CLP', 'COP', 'PEN', 'UYU'].map((c) => `<option ${s.mercadopago.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>${te('a.s.rate')} <small>${te('a.s.rateHint')}</small></label><input name="mpRate" type="number" min="0" step="0.0001" value="${s.mercadopago.usdRate}"/></div>
      </div>
    </section>

    <section class="ed-sec">
      <h3>${te('a.s.transfer')} <small>${te('a.s.transferHint')}</small></h3>
      ${Object.entries(s.manual).map(([k, m]) => `<div class="manual-pay">
        <label class="switch"><input type="checkbox" class="check" name="manual_${k}_enabled" ${m.enabled ? 'checked' : ''}/> <b>${te(`pay.${k}`)}</b></label>
        <textarea name="manual_${k}_instructions" rows="2" maxlength="1000" placeholder="${te(`a.s.ph.${k}`)}">${esc(m.instructions)}</textarea>
      </div>`).join('')}
    </section>

    <section class="ed-sec">
      <h3>${te('a.s.shipping')}</h3>
      <div class="ed-grid four">
        ${moneyField('ship_standard', te('a.s.std'), s.shipping.standard)}
        ${moneyField('ship_express', te('a.s.exp'), s.shipping.express)}
        ${moneyField('ship_overnight', te('a.s.ovn'), s.shipping.overnight)}
        ${moneyField('ship_international', te('a.s.intl'), s.shipping.international)}
        ${moneyField('ship_freeOver', te('a.s.freeOver'), s.shipping.freeOver)}
      </div>
      <p class="muted">${te('a.s.freeHint')}</p>
    </section>

    <section class="ed-sec">
      <h3>${te('a.s.tax')} <small>${te('a.s.taxHint')}</small></h3>
      <label class="switch"><input type="checkbox" class="check" name="tax_enabled" ${s.tax.enabled ? 'checked' : ''}/> ${te('a.s.collect')}</label>
      <div class="field"><label>${te('a.s.states')} <small>${te('a.s.statesHint')}</small></label><input name="tax_states" value="${esc(s.tax.states.join(', '))}"/></div>
    </section>

    <section class="ed-sec">
      <h3>${te('a.s.promos')}</h3>
      <div class="promo-rows" id="promo-rows">${s.promos.map(promoRow).join('')}</div>
      <button type="button" class="btn btn-ghost btn-sm" data-ad="promo-add">${te('a.s.addCode')}</button>
    </section>

    <section class="ed-sec">
      <h3>${te('a.s.notify')}</h3>
      <div class="field"><label>${te('a.s.notifyEmail')}</label><input name="contactEmail" type="email" value="${esc(s.contactEmail)}" placeholder="orders@yourstore.com"/></div>
    </section>

    <div class="ed-actions"><span></span><div><button type="button" class="btn btn-ghost" data-ad="close">${te('a.cancel')}</button><button class="btn btn-primary">${te('a.s.save')}</button></div></div>
  </form>`;
}

const promoRow = (p = { code: '', pct: 10 }) => `<div class="promo-row">
  <input name="promo_code" value="${esc(p.code)}" placeholder="CODE" maxlength="20"/>
  <div class="money-input pct"><input name="promo_pct" type="number" min="1" max="90" value="${p.pct}"/><span>${te('a.s.off')}</span></div>
  <button type="button" class="icon-btn" data-ad="promo-del" aria-label="${te('a.s.removeCode')}">${X}</button></div>`;

async function saveSettings(form) {
  const fd = new FormData(form);
  const num = (k) => Number(fd.get(k));
  const codes = fd.getAll('promo_code');
  const pcts = fd.getAll('promo_pct');
  const body = {
    contactEmail: fd.get('contactEmail').trim(),
    shipping: { standard: num('ship_standard'), express: num('ship_express'), overnight: num('ship_overnight'), international: num('ship_international'), freeOver: num('ship_freeOver') },
    tax: { enabled: fd.has('tax_enabled'), states: fd.get('tax_states').split(/[\s,]+/).filter(Boolean) },
    promos: codes.map((code, i) => ({ code, pct: Number(pcts[i]) })).filter((p) => p.code.trim()),
    manual: Object.fromEntries(Object.keys(view.settings.settings.manual).map((k) => [k, { enabled: fd.has(`manual_${k}_enabled`), instructions: fd.get(`manual_${k}_instructions`) }])),
    mercadopago: { currency: fd.get('mpCurrency'), usdRate: num('mpRate') },
  };
  const enabledEmpty = Object.entries(body.manual).find(([, m]) => m.enabled && !m.instructions.trim());
  if (enabledEmpty) { ctx.toast({ icon: 'alert', title: te('a.s.needInstr', { method: t(`pay.${enabledEmpty[0]}`) }) }); return; }
  try {
    await ctx.api('/admin/settings', { method: 'PUT', body });
    await ctx.reloadConfig();
    ctx.closeOverlays();
    ctx.toast({ icon: 'check', ok: te('a.t.saved'), title: te('a.t.settingsSaved') });
  } catch (err) { fail(err); }
}

/* ==========================================================================
   Team (superadmin) and account
   ========================================================================== */
async function openUsers() {
  try { show('users', { users: (await ctx.api('/admin/users')).users, temp: null }); } catch (err) { fail(err); }
}

function usersView() {
  return `${head(te('a.u.title'), te('a.u.sub'))}
    ${view.temp ? `<div class="temp-pass"><b>${te('a.u.temp', { email: view.temp.email })}</b>
      <code>${esc(view.temp.password)}</code><span>${te('a.u.tempNote')}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-ad="copy-temp">${te('a.u.copy')}</button></div>` : ''}
    <div class="adm-table-wrap"><table class="adm-table">
      <thead><tr><th>${te('a.u.name')}</th><th>${te('a.u.email')}</th><th>${te('a.u.role')}</th><th></th></tr></thead>
      <tbody>${view.users.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${te(`a.role.${u.role}`)}</td>
        <td class="r">${u.role === 'admin' ? `<button class="btn btn-ghost btn-sm" data-ad="user-reset" data-id="${u.id}">${te('a.u.reset')}</button>
          <button class="btn btn-ghost btn-sm danger-ghost" data-ad="user-del" data-id="${u.id}">${te('a.u.remove')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
    <form class="adm-form inline" data-form="user-add">
      <h3>${te('a.u.add')}</h3>
      <div class="ed-grid"><div class="field"><label>${te('a.u.name')}</label><input name="name" required maxlength="60"/></div>
      <div class="field"><label>${te('a.u.email')}</label><input name="email" type="email" required maxlength="120"/></div></div>
      <button class="btn btn-primary">${te('a.u.create')}</button>
    </form>`;
}

function accountView() {
  const me = ctx.state.me;
  return `${head(te('a.acc.title'), `${esc(me.name)} · ${esc(me.email)} · ${te(`a.role.${me.role}`)}`)}
    <form class="adm-form" data-form="password">
      <h3>${te('a.acc.change')}</h3>
      <div class="field"><label>${te('a.acc.current')}</label><input name="current" type="password" autocomplete="current-password" required data-autofocus/></div>
      <div class="field"><label>${te('a.acc.new')} <small>${te('a.acc.newHint')}</small></label><input name="next" type="password" autocomplete="new-password" minlength="10" required/></div>
      <button class="btn btn-primary">${te('a.acc.update')}</button>
    </form>`;
}

/* ==========================================================================
   Events
   ========================================================================== */
async function onClick(e) {
  const tg = e.target;
  const bar = tg.closest('[data-ab]');
  if (bar) {
    const a = bar.dataset.ab;
    if (a === 'new') openEditor(null);
    if (a === 'orders') openOrders();
    if (a === 'settings') openSettings();
    if (a === 'users') openUsers();
    if (a === 'account') show('account');
    if (a === 'logout') {
      await ctx.api('/auth/logout', { method: 'POST' }).catch(() => {});
      $('.admin-bar')?.remove();
      ctx.setMe(null);
      ctx.toast({ icon: 'check', title: te('a.t.signedOut') });
    }
    return;
  }

  const adm = tg.closest('[data-admin]');
  if (adm) {
    e.preventDefault();
    if (adm.dataset.admin === 'new') openEditor(null);
    if (adm.dataset.admin === 'edit') openEditor(adm.dataset.id);
    if (adm.dataset.admin === 'delete') deleteProduct(adm.dataset.id);
    if (adm.dataset.admin === 'sec-new') openSectionEditor(adm.dataset.sec, null);
    if (adm.dataset.admin === 'sec-edit') openSectionEditor(adm.dataset.sec, adm.dataset.id);
    if (adm.dataset.admin === 'sec-up') moveSection(adm.dataset.id, -1);
    if (adm.dataset.admin === 'sec-down') moveSection(adm.dataset.id, 1);
    if (adm.dataset.admin === 'sec-delete') deleteSectionItem(adm.dataset.sec, adm.dataset.id);
    return;
  }

  const el = tg.closest('[data-ad]');
  if (!el || !tg.closest('#admin-modal')) return;
  const a = el.dataset.ad;
  const i = Number(el.dataset.i);
  const imgs = view.ed?.d.images;
  switch (a) {
    case 'close': ctx.closeOverlays(); break;
    case 'sec-lang': {
      collectSection($('[data-form="section"]'));
      view.sec.lang = el.dataset.langTab;
      render();
      $(`[data-lang-tab="${view.sec.lang}"]`)?.focus();
      break;
    }
    case 'sec-delete': deleteSectionItem(view.sec.section, view.sec.id); break;
    case 'delete': deleteProduct(el.dataset.id); break;
    case 'ed-lang': {
      collectEditor($('[data-form="product"]'));
      view.ed.lang = el.dataset.langTab;
      const top = $('#admin-card').scrollTop;
      render();
      $('#admin-card').scrollTop = top;
      $(`[data-lang-tab="${view.ed.lang}"]`)?.focus();
      break;
    }
    case 'img-left': [imgs[i - 1], imgs[i]] = [imgs[i], imgs[i - 1]]; refreshPhotos(); break;
    case 'img-right': [imgs[i + 1], imgs[i]] = [imgs[i], imgs[i + 1]]; refreshPhotos(); break;
    case 'img-del': imgs.splice(i, 1); refreshPhotos(); break;
    case 'orders': openOrders(); break;
    case 'orders-tab': openOrders(el.dataset.f); break;
    case 'order': show('order', { order: view.orders.orders.find((o) => o.id === el.dataset.id) }); break;
    case 'order-act': orderAction(el.dataset.act); break;
    case 'copy-address': {
      const c = view.order.customer;
      await navigator.clipboard?.writeText([`${c.first} ${c.last}`, c.address, c.apt, `${c.city}${c.region ? `, ${c.region}` : ''} ${c.zip}`, c.countryName, c.phone].filter(Boolean).join('\n'));
      ctx.toast({ icon: 'check', title: te('a.t.copied') });
      break;
    }
    case 'promo-add': $('#promo-rows').insertAdjacentHTML('beforeend', promoRow()); $('#promo-rows .promo-row:last-child input').focus(); break;
    case 'promo-del': el.closest('.promo-row').remove(); break;
    case 'copy-temp': await navigator.clipboard?.writeText(view.temp.password); ctx.toast({ icon: 'check', title: te('a.t.pwCopied') }); break;
    case 'user-reset': {
      const u = view.users.find((x) => String(x.id) === el.dataset.id);
      if (!window.confirm(t('a.c.reset', { name: u.name }))) return;
      try { const r = await ctx.api(`/admin/users/${u.id}/reset`, { method: 'POST' }); view.temp = { email: u.email, password: r.tempPassword }; render(); } catch (err) { fail(err); }
      break;
    }
    case 'user-del': {
      const u = view.users.find((x) => String(x.id) === el.dataset.id);
      if (!window.confirm(t('a.c.remove', { name: u.name, email: u.email }))) return;
      try { await ctx.api(`/admin/users/${u.id}`, { method: 'DELETE' }); openUsers(); } catch (err) { fail(err); }
      break;
    }
  }
}

async function onSubmit(e) {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const fd = new FormData(form);
  switch (form.dataset.form) {
    case 'login': {
      view.busy = true; view.error = ''; render();
      try {
        const { me } = await ctx.api('/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
        view.busy = false;
        history.replaceState(null, '', '/');
        ctx.setMe(me);
        renderBar();
        refreshOrderCount();
        ctx.closeOverlays();
        ctx.toast({ icon: 'check', ok: te('a.t.signedIn'), title: te('a.t.welcome', { name: me.name }), text: te('a.t.welcomeText') });
      } catch (err) {
        view.busy = false; view.error = err.message; render();
        $('#ad-email').value = fd.get('email');
        $('#ad-pass').focus();
      }
      break;
    }
    case 'product': saveProduct(form); break;
    case 'section': saveSection(form); break;
    case 'settings': saveSettings(form); break;
    case 'notes':
      try {
        const res = await ctx.api(`/admin/orders/${encodeURIComponent(view.order.id)}`, { method: 'PATCH', body: { notes: fd.get('notes') } });
        view.order = res.order;
        ctx.toast({ icon: 'check', title: te('a.t.notes') });
      } catch (err) { fail(err); }
      break;
    case 'user-add':
      try {
        const r = await ctx.api('/admin/users', { method: 'POST', body: { name: fd.get('name'), email: fd.get('email') } });
        const users = (await ctx.api('/admin/users')).users;
        show('users', { users, temp: { email: fd.get('email'), password: r.tempPassword } });
      } catch (err) { fail(err); }
      break;
    case 'password':
      try {
        await ctx.api('/admin/me/password', { method: 'PUT', body: { current: fd.get('current'), next: fd.get('next') } });
        ctx.closeOverlays();
        ctx.toast({ icon: 'check', title: te('a.t.pwUpdated'), text: te('a.t.pwOthers') });
      } catch (err) { fail(err); }
      break;
  }
}

function onInput(e) {
  if (view.name !== 'editor' || !e.target.closest('[data-form="product"]')) return;
  if (['short', 'shape', 'hue'].includes(e.target.name) || (view.ed.lang === 'es' && ['name', 'size'].includes(e.target.name))) {
    collectEditor(e.target.form);
    const prev = $('#ed-art-preview');
    if (prev) prev.innerHTML = ctx.productArt(previewProduct(), 0);
  }
  e.target.closest('.field.invalid')?.classList.remove('invalid');
}

function onChange(e) {
  if (e.target.matches('[data-ad-upload]') && e.target.files?.length) {
    collectEditor(e.target.form);
    uploadPhotos(e.target.files);
    e.target.value = '';
  }
  if (e.target.name === 'pairs') {
    const checked = $$('#admin-card input[name="pairs"]:checked');
    if (checked.length > 4) { e.target.checked = false; ctx.toast({ icon: 'alert', title: te('a.ed.max4') }); }
    e.target.closest('label').classList.toggle('on', e.target.checked);
  }
}
