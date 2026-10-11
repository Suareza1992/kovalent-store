import crypto from 'node:crypto';
import { db } from './db.js';
import { fail } from './http.js';

const COOKIE = 'kv_session';
const SESSION_DAYS = 7;
const isProd = process.env.NODE_ENV === 'production';

/* ---------- passwords (scrypt, no native deps) ---------- */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

export const randomPassword = () => crypto.randomBytes(9).toString('base64url'); // 12 chars

/* ---------- simple in-memory rate limiter ---------- */

export function limiter({ windowMs, max }) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return true; }
    entry.n += 1;
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return entry.n <= max;
  };
}

/* ---------- sessions ---------- */

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_DAYS * 864e5;
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, expires);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: isProd, maxAge: SESSION_DAYS * 864e5, path: '/' });
}

export function endSession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.clearCookie(COOKIE, { path: '/' });
}

export const publicUser = (u) => u && { id: u.id, email: u.email, name: u.name, role: u.role };

// Attaches req.user (or null) on every request.
export function loadUser(req, _res, next) {
  req.user = null;
  const token = readCookie(req, COOKIE);
  if (token) {
    req.user = db.prepare(`
      SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`).get(sha256(token), Date.now()) || null;
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return fail(res, 401, 'err.signin');
  next();
}

export function requireSuper(req, res, next) {
  if (req.user?.role !== 'superadmin') return fail(res, 403, 'err.super');
  next();
}

// Creates the first superadmin from env vars so a fresh deploy is never left without an owner.
export function ensureSuperadmin() {
  const exists = db.prepare("SELECT 1 FROM users WHERE role = 'superadmin'").get();
  if (exists) return;
  const { SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, SUPERADMIN_NAME } = process.env;
  if (!SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD) {
    console.warn('[auth] No superadmin yet. Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD, then restart.');
    return;
  }
  db.prepare("INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, 'superadmin', ?)")
    .run(SUPERADMIN_EMAIL.trim(), SUPERADMIN_NAME || 'Superadmin', hashPassword(SUPERADMIN_PASSWORD));
  console.log(`[auth] Superadmin created for ${SUPERADMIN_EMAIL}`);
}
