# Post-launch roadmap

What to build after the store is live, in priority order. Each item says **why** it matters, so the
order can be revisited as the business grows. (Pre-launch items, which were backups, legal pages,
fresh-code caching and the activity log, are done; see README.)

Effort: **S** ≈ an afternoon · **M** ≈ a day or two · **L** ≈ a week.

---

## 1. Security & reliability

| # | Item | Why | Effort |
|---|---|---|---|
| 1.1 | **Two-factor sign-in (TOTP)** for staff: an authenticator-app code at sign-in; required for the superadmin, optional for admins. | An admin account can change prices and mark orders paid by hand. A stolen password shouldn't be enough. | M |
| 1.2 | **Uptime + error alerts:** a free monitor (UptimeRobot / Better Stack) on `/` and `/api/bootstrap`, plus error reporting (e.g. Sentry) on server exceptions. | Today nobody learns the site is down until a customer complains. | S |
| 1.3 | **GitHub security switches:** Dependabot alerts + security updates, secret scanning, push protection (Settings → Code security). | Catches vulnerable packages and blocks an `.env`/API key from ever being pushed. | S |
| 1.4 | **Log payments confirmed by providers** in the activity log too (Stripe/Mercado Pago webhooks, PayPal capture), as `system` entries. | Right now the log covers staff actions; online payments are only visible on the order itself. | S |
| 1.5 | **Restore drill:** restore a downloaded backup on a laptop once, following README → Backups. | A backup you've never restored is a hope, not a backup. | S |
| 1.6 | **Global sign-in rate limit per IP** (in addition to the per IP+email one), and persist limits across restarts if the site ever runs on more than one server. | Stops an attacker cycling through many email addresses from one IP. | S |

## 2. Storage & speed

| # | Item | Why | Effort |
|---|---|---|---|
| 2.1 | **Catalog thumbnails:** save a ~600 px copy at upload time and use it in the grid, search and cart. | Cards currently load the full 1600 px photo; on phone data the catalog would load several times faster. | S |
| 2.2 | **Orphaned photo cleanup:** a weekly job that deletes files in `uploads/` that no product (or deleted product's past orders) references. | Removed photos stay on the volume forever and slowly fill it (and every backup). | S |
| 2.3 | **Multipart backup upload** once archives pass ~200 MB (see the note in `server/backup.js`). | The off-site upload currently reads the whole archive into memory; fine for a small shop, not for thousands of photos. | M |

## 3. Business features

| # | Item | Why | Effort |
|---|---|---|---|
| 3.1 | **Stock tracking:** quantity per product, "Out of stock" at 0, low-stock alert email, stock reduced when an order is paid (restored if cancelled). | Without it the store can sell items it doesn't have. | M |
| 3.2 | **Real reviews from real buyers:** after an order is marked shipped, email a one-time link to review what they bought; reviews appear after admin approval; average rating computed from them. | Replaces "Sample review goes here" with reviews that are honest by design (only verified buyers). | L |
| 3.3 | **"Where's my order?"** lookup by order number + email, showing status and tracking. | Saves the owner from answering the same message repeatedly. | S |
| 3.4 | **WhatsApp contact button** (number from Settings → Business details). | The expected way to ask a store a question in Latin America and Puerto Rico. | S |
| 3.5 | **Search & link previews (SEO):** server-render product name/description/price into the HTML, add Open Graph tags (WhatsApp/Instagram previews), product structured data (JSON-LD) and a `sitemap.xml`. | Products are built by JavaScript, so search engines and link previews currently see an almost empty page. | M |
| 3.6 | **Privacy-friendly analytics** (Plausible / Umami / Cloudflare Web Analytics, no cookies). | Know which products and pages people look at, without needing a cookie banner. Update the Privacy Policy when added. | S |
| 3.7 | **Testimonials section:** built with the dynamic-sections system (this is exercise 3 in `docs/LEARN-dynamic-sections.md`). | Social proof on the home page, using real quotes only. | S |

## 4. Admin quality of life

| # | Item | Why | Effort |
|---|---|---|---|
| 4.1 | **Drag-and-drop reordering** for products and home-page items (exercise 4 in the lesson). | Faster than ↑ ↓ for long lists. | M |
| 4.2 | **Orders export (CSV)** by date range. | For the accountant and tax filings. | S |
| 4.3 | **Product categories editable** in the admin (exercise 5 in the lesson; handle products that still use a removed category). | Today categories are fixed in code. | M |
| 4.4 | **Password reset by email** for admins (needs Resend configured). | Today only the superadmin can reset an admin's password. | S |

---

### Before relying on this list
- Business details (Settings) and the legal pages need the owner's real information and a legal review.
- Off-site backups need `BACKUP_S3_*` set in production; check the Backups panel says **ACTIVADA**.
