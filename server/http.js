import { translate, isLang, DEFAULT_LANG } from '../public/js/i18n.js';

// Errors carry a translation code; the browser shows it in the shopper's language.
// `error` stays as readable English for logs and API debugging.
export function fail(res, status, code, extra = {}) {
  return res.status(status).json({ error: translate('en', code), code, ...extra });
}

export function reqLang(req) {
  const l = req.get('x-lang') || req.body?.lang;
  return isLang(l) ? l : DEFAULT_LANG;
}
