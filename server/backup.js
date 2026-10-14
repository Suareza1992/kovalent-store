// Backups: one .tar.gz with a consistent copy of the database + every uploaded photo.
//
//  • Nightly (and on demand from the admin): an archive is written to DATA_DIR/backups
//    (the newest 7 are kept on the volume).
//  • If BACKUP_S3_* is configured, each archive is also uploaded off-site to any S3-compatible
//    storage (Cloudflare R2, Backblaze B2, AWS S3). Set a lifecycle rule on the bucket to delete
//    objects after 30 days. That off-site copy is what survives losing the server or its volume.
//
// Restore: stop the service, extract the archive, put kovalent.db and uploads/ back into DATA_DIR,
// start the service. (See README → Backups.)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { db, DATA_DIR, UPLOAD_DIR } from './db.js';

export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP_LOCAL = 7;
const NAME_RE = /^kovalent-backup-\d{4}-\d{2}-\d{2}-\d{4}\.tar\.gz$/;
fs.mkdirSync(BACKUP_DIR, { recursive: true });

/* ---------- status (kept in the settings table) ---------- */

export function backupStatus() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'backup'").get();
  return row ? JSON.parse(row.value) : null;
}
function saveStatus(status) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('backup', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(status));
}

export const offsiteConfigured = () => Boolean(process.env.BACKUP_S3_ENDPOINT && process.env.BACKUP_S3_BUCKET
  && process.env.BACKUP_S3_KEY_ID && process.env.BACKUP_S3_SECRET);

export function listLocalBackups() {
  return fs.readdirSync(BACKUP_DIR).filter((f) => NAME_RE.test(f)).sort().reverse()
    .map((name) => ({ name, size: fs.statSync(path.join(BACKUP_DIR, name)).size }));
}
export const localBackupPath = (name) => (NAME_RE.test(name) ? path.join(BACKUP_DIR, name) : null);

/* ---------- archive (minimal tar writer: ustar headers + gzip) ---------- */

function tarHeader(name, size, mtimeMs) {
  const h = Buffer.alloc(512, 0);
  h.write(name, 0, 100, 'utf8');
  h.write('0000644\0', 100);                                   // mode
  h.write('0000000\0', 108);                                   // uid
  h.write('0000000\0', 116);                                   // gid
  h.write(`${size.toString(8).padStart(11, '0')}\0`, 124);     // size (octal)
  h.write(`${Math.floor(mtimeMs / 1000).toString(8).padStart(11, '0')}\0`, 136);
  h.write('        ', 148);                                    // checksum placeholder
  h.write('0', 156);                                           // regular file
  h.write('ustar\0', 257);
  h.write('00', 263);
  let sum = 0;
  for (const byte of h) sum += byte;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return h;
}

async function* tarStream(entries) {
  for (const e of entries) {
    const data = e.buffer ?? fs.readFileSync(e.path);
    yield tarHeader(e.name, data.length, e.mtime ?? Date.now());
    yield data;
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) yield Buffer.alloc(pad);
  }
  yield Buffer.alloc(1024); // end-of-archive marker
}

const stamp = (d = new Date()) => d.toISOString().replace(/T(\d\d):(\d\d).*/, '-$1$2'); // 2026-10-14-0315

export async function createArchive() {
  const name = `kovalent-backup-${stamp()}.tar.gz`;
  const tmpDb = path.join(BACKUP_DIR, `tmp-${crypto.randomBytes(4).toString('hex')}.db`);
  // VACUUM INTO writes a consistent, compacted copy even while the site keeps running.
  db.exec(`VACUUM INTO '${tmpDb.replace(/'/g, "''")}'`);
  try {
    const photos = fs.readdirSync(UPLOAD_DIR).filter((f) => /^[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(f));
    const meta = {
      createdAt: new Date().toISOString(),
      schema: db.prepare("SELECT value FROM settings WHERE key = 'schema'").get()?.value,
      counts: {
        products: db.prepare('SELECT COUNT(*) AS n FROM products WHERE deleted = 0').get().n,
        orders: db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,
        photos: photos.length,
      },
    };
    const entries = [
      { name: 'backup.json', buffer: Buffer.from(JSON.stringify(meta, null, 2)) },
      { name: 'kovalent.db', path: tmpDb },
      ...photos.map((f) => ({ name: `uploads/${f}`, path: path.join(UPLOAD_DIR, f), mtime: fs.statSync(path.join(UPLOAD_DIR, f)).mtimeMs })),
    ];
    const out = path.join(BACKUP_DIR, name);
    await pipeline(Readable.from(tarStream(entries)), zlib.createGzip({ level: 9 }), fs.createWriteStream(out));
    for (const old of listLocalBackups().slice(KEEP_LOCAL)) fs.rmSync(path.join(BACKUP_DIR, old.name)); // keep the newest 7
    return { name, path: out, size: fs.statSync(out).size, meta };
  } finally {
    fs.rmSync(tmpDb, { force: true });
  }
}

/* ---------- off-site upload: S3-compatible PUT with AWS Signature V4 ---------- */

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

/** AWS Signature V4 (exported so it can be checked against AWS's published test vector). */
export function signV4({ method, url, headers, payloadHash, amzDate, keyId, secret, region, service = 's3' }) {
  const u = new URL(url);
  const all = { ...headers, host: u.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const names = Object.keys(all).map((k) => k.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const signedHeaders = names.join(';');
  const canonicalRequest = [method, u.pathname, u.search.slice(1), names.map((n) => `${n}:${lower[n]}\n`).join(''), signedHeaders, payloadHash].join('\n');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return {
    signature,
    headers: { ...all, Authorization: `AWS4-HMAC-SHA256 Credential=${keyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` },
  };
}

async function uploadOffsite(archive) {
  const env = process.env;
  const key = `kovalent/${archive.name}`;
  const url = `${env.BACKUP_S3_ENDPOINT.replace(/\/$/, '')}/${env.BACKUP_S3_BUCKET}/${key}`;
  // Read into memory: fine for a small shop (archives of a few MB). Past ~200 MB, switch to multipart upload.
  const body = fs.readFileSync(archive.path);
  const { headers } = signV4({
    method: 'PUT', url, headers: { 'content-type': 'application/gzip' }, payloadHash: sha256(body),
    amzDate: new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''),
    keyId: env.BACKUP_S3_KEY_ID, secret: env.BACKUP_S3_SECRET, region: env.BACKUP_S3_REGION || 'auto',
  });
  delete headers.host; // fetch sets it
  const res = await fetch(url, { method: 'PUT', headers, body });
  if (!res.ok) throw new Error(`Off-site upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return key;
}

/* ---------- run + schedule ---------- */

let running = null;

export function runBackup(trigger = 'schedule') {
  if (running) return running; // never two at once
  running = (async () => {
    const status = { at: new Date().toISOString(), trigger, ok: false };
    try {
      const archive = await createArchive();
      Object.assign(status, { file: archive.name, size: archive.size, counts: archive.meta.counts });
      if (offsiteConfigured()) status.remote = await uploadOffsite(archive);
      status.ok = true;
      console.log(`[backup] ${archive.name} (${Math.round(archive.size / 1024)} KB)${status.remote ? ' → off-site' : ' (local only)'}`);
    } catch (err) {
      status.error = err.message.slice(0, 300);
      console.error('[backup] failed:', err.message);
    }
    saveStatus(status);
    return status;
  })().finally(() => { running = null; });
  return running;
}

// Checks every hour; runs when the last successful backup is older than ~a day.
export function startBackupSchedule() {
  const check = () => {
    const last = backupStatus();
    const age = last?.ok ? Date.now() - new Date(last.at).getTime() : Infinity;
    if (age > 23 * 3600e3) runBackup('schedule');
  };
  setTimeout(check, 60e3).unref();          // a minute after start
  setInterval(check, 3600e3).unref();       // then hourly
}
