// Activity log: every admin change (and every sign-in attempt) gets a row, so "who changed this
// price?" or "who marked this paid?" always has an answer. Only the superadmin can read it.
import { db } from './db.js';

const KEEP_DAYS = 365;
db.prepare(`DELETE FROM audit WHERE at < datetime('now', ?)`).run(`-${KEEP_DAYS} days`);

const insert = db.prepare(`INSERT INTO audit (user_id, user_email, ip, action, target, summary, details)
  VALUES (?, ?, ?, ?, ?, ?, ?)`);

/**
 * @param req     Express request (who + IP)
 * @param action  dotted name, e.g. 'product.update' (translated in the viewer as `audit.<action>`)
 * @param opts    { target, summary, details, email } — email overrides req.user (failed logins)
 */
export function audit(req, action, { target = null, summary = '', details = null, email = null } = {}) {
  try {
    insert.run(
      req.user?.id ?? null,
      email ?? req.user?.email ?? null,
      req.ip || null,
      action,
      target == null ? null : String(target),
      String(summary).slice(0, 300),
      details ? JSON.stringify(details).slice(0, 8000) : null,
    );
  } catch (err) {
    console.error('[audit] could not write entry', err.message); // never block the real action
  }
}

/** { field: [before, after] } for the keys whose values differ. Long values are shortened. */
export function diff(before = {}, after = {}, keys = Object.keys({ ...before, ...after })) {
  const show = (v) => {
    if (v === undefined || v === null || v === '') return '—';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  };
  const out = {};
  for (const k of keys) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) out[k] = [show(before[k]), show(after[k])];
  }
  return Object.keys(out).length ? out : null;
}

export function listAudit({ before = null, limit = 100 } = {}) {
  const rows = before
    ? db.prepare('SELECT * FROM audit WHERE id < ? ORDER BY id DESC LIMIT ?').all(before, limit)
    : db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit);
  return rows.map((r) => ({ ...r, details: r.details ? JSON.parse(r.details) : null }));
}
