// SQLite via Node's built-in driver (node:sqlite), so there's nothing native to compile on deploy.
// Everything persistent (database + uploaded photos) lives under DATA_DIR; mount a volume there in production.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS as SEED_PRODUCTS } from '../public/js/data.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'kovalent.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('superadmin', 'admin')),
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  -- Products are stored as a JSON document so new fields don't need migrations.
  CREATE TABLE IF NOT EXISTS products (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    sort       INTEGER NOT NULL DEFAULT 0,
    deleted    INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id             TEXT PRIMARY KEY,          -- unguessable token used in the customer's order link
    number         TEXT NOT NULL UNIQUE,      -- human-friendly KV-123456
    status         TEXT NOT NULL CHECK (status IN ('pending_payment', 'paid', 'shipped', 'cancelled')),
    email          TEXT NOT NULL,
    customer       TEXT NOT NULL,             -- JSON: contact + shipping address
    items          TEXT NOT NULL,             -- JSON snapshot of what was bought, at the price paid
    totals         TEXT NOT NULL,             -- JSON
    payment_method TEXT NOT NULL,
    payment_ref    TEXT,                      -- Stripe session / PayPal order / Mercado Pago payment id
    tracking       TEXT,
    notes          TEXT,
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at        TEXT,
    shipped_at     TEXT,
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS orders_status ON orders(status, created_at);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

/* ---------- products ---------- */

// First boot: import the launch catalog.
if (db.prepare('SELECT COUNT(*) AS n FROM products').get().n === 0) {
  const insert = db.prepare('INSERT INTO products (id, data, sort) VALUES (?, ?, ?)');
  SEED_PRODUCTS.forEach((p, i) => insert.run(p.id, JSON.stringify({ ...p, images: [] }), i));
}

// Migration 2 (Oct 2026): products became multilingual (Spanish base + tr.en/tr.pt) and the demo
// ratings/reviews were retired. Launch products get the translated text; whatever staff changed
// that isn't text (price, photos, category, pairs, art) is kept.
const schema = db.prepare("SELECT value FROM settings WHERE key = 'schema'").get();
if (!schema || Number(schema.value) < 2) {
  const seeds = Object.fromEntries(SEED_PRODUCTS.map((p) => [p.id, p]));
  const update = db.prepare('UPDATE products SET data = ? WHERE id = ?');
  for (const row of db.prepare('SELECT id, data FROM products').all()) {
    const { rating, reviews, sample, ...p } = JSON.parse(row.data);
    const seed = seeds[row.id];
    const next = seed && !p.tr
      ? { ...p, ...Object.fromEntries(['name', 'tagline', 'size', 'ribbon', 'badges', 'description', 'specs', 'instructions', 'compatibility', 'benefits'].map((k) => [k, seed[k] ?? ''])), tr: seed.tr }
      : { ...p, tr: p.tr || { en: {}, pt: {} } };
    update.run(JSON.stringify(next), row.id);
  }
  db.prepare("INSERT INTO settings (key, value) VALUES ('schema', '2') ON CONFLICT(key) DO UPDATE SET value = '2'").run();
}

export function listProducts() {
  return db.prepare('SELECT id, data FROM products WHERE deleted = 0 ORDER BY sort, rowid').all()
    .map((r) => ({ ...JSON.parse(r.data), id: r.id }));
}

export function getProduct(id) {
  const row = db.prepare('SELECT id, data FROM products WHERE id = ? AND deleted = 0').get(id);
  return row ? { ...JSON.parse(row.data), id: row.id } : null;
}

/* ---------- settings ---------- */

export const DEFAULT_SETTINGS = {
  contactEmail: '',
  shipping: { standard: 6.95, express: 14.95, overnight: 29.95, international: 24.95, freeOver: 75 },
  tax: { enabled: true, states: [] }, // empty list = collect in every state in the rate table
  promos: [],
  manual: {
    zelle: { enabled: false, label: 'Zelle', instructions: '' },
    athmovil: { enabled: false, label: 'ATH Móvil', instructions: '' },
    bank: { enabled: false, label: 'Bank transfer', instructions: '' },
  },
  mercadopago: { currency: 'MXN', usdRate: 17 },
};

export function getSettings() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'store'").get();
  const saved = row ? JSON.parse(row.value) : {};
  const d = DEFAULT_SETTINGS;
  return {
    ...d,
    ...saved,
    shipping: { ...d.shipping, ...saved.shipping },
    tax: { ...d.tax, ...saved.tax },
    manual: Object.fromEntries(Object.entries(d.manual).map(([k, v]) => [k, { ...v, ...saved.manual?.[k] }])),
    mercadopago: { ...d.mercadopago, ...saved.mercadopago },
  };
}

export function saveSettings(settings) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('store', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(settings));
}

/* ---------- orders ---------- */

export function parseOrder(row) {
  if (!row) return null;
  return {
    ...row,
    customer: JSON.parse(row.customer),
    items: JSON.parse(row.items),
    totals: JSON.parse(row.totals),
  };
}

export function getOrder(id) {
  return parseOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(id));
}
