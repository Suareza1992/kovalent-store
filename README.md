# Kovalent: Storefront + Store Admin

E-commerce site for **Kovalent**, a premium automotive surface-care brand: ceramic coatings, paint correction and detailing tools.

- **Shoppers** check out as guests. There are no accounts and no sign-up, just an email for the receipt, a shipping address and a payment method.
- **Staff** sign in at `/admin` and edit the store in place. They can add, edit and delete products, upload photos, change prices, handle orders and change settings.

**Languages:** Spanish (default), English and Portuguese (BR), switchable from the globe button in the header. The choice is remembered per browser.

**Stack:** Node 22.13+ · Express · SQLite (Node's built-in `node:sqlite`, nothing native to compile) · vanilla HTML/CSS/ES modules (no build step).

---

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:5195 (shop) or http://localhost:5195/admin (staff sign-in).

On first boot the server:
1. creates `data/kovalent.db` and imports the 14 launch products, and
2. creates the **superadmin** from `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` in `.env`.

Copy `.env.example` to `.env` to start. Your local `.env` already has a generated superadmin password. `data/` and `.env` are git-ignored; delete `data/` to reset the store to its launch state.

## Roles

| | Admin (the client) | Superadmin (Angel) |
|---|---|---|
| Add / edit / delete products, photos, prices | ✓ | ✓ |
| Orders: confirm transfers, mark shipped, cancel, notes | ✓ | ✓ |
| Settings: shipping rates, tax, promo codes, Zelle/ATH Móvil/bank instructions, Mercado Pago rate | ✓ | ✓ |
| Add / remove admins, reset their passwords | | ✓ |
| Payment provider keys (server environment variables) | | ✓ |

Admins are created by the superadmin under **Team**. A temporary password is shown once, and the admin changes it under **Account**.

## Payments

Customers pay on each provider's **own hosted page**, so card numbers never touch this server (PCI scope stays minimal). A method only appears at checkout once it's configured.

| Method | Where it works | How it's confirmed | Setup |
|---|---|---|---|
| **Stripe** (cards, Apple Pay, Google Pay) | Merchant accounts in US, Canada, Mexico, Brazil; buyers worldwide | Webhook + API check on return | `STRIPE_SECRET_KEY`, plus webhook `https://YOUR-DOMAIN/api/webhooks/stripe` with events `checkout.session.completed` and `checkout.session.async_payment_succeeded` → `STRIPE_WEBHOOK_SECRET` |
| **PayPal** | Most of the Americas | Captured server-side when the buyer returns | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=live` (REST app from developer.paypal.com) |
| **Mercado Pago** | MX, AR, BR, CL, CO, PE, UY | Webhook (auto-registered per order) + API check | `MP_ACCESS_TOKEN`. Charges in the account's local currency, converted with the rate set in Settings |
| **Zelle / ATH Móvil / bank transfer** | Zelle: US banks · ATH Móvil: Puerto Rico | Admin confirms in **Orders** → "mark as paid" | Turn on and write instructions in **Settings**. No keys needed |

**Rule:** an order is only marked paid after the server asks the provider's API, or an admin confirms it. A customer landing on the "success" URL proves nothing by itself, and every amount is recomputed on the server from database prices.

If a provider is down when a customer places an order, that order is cancelled automatically and the customer sees a friendly error. Card/PayPal/Mercado Pago orders that are started but never paid show as "Checkout not completed" in Orders. They're usually abandoned and don't need action.

## Deploying (Railway, or any Node host)

1. Create a service from this folder. The start command is `npm start`.
2. **Add a volume** and set `DATA_DIR` to its mount path (for example `/data`). This holds the database and uploaded photos. Without it, every redeploy wipes products and orders.
3. Set the environment variables: `NODE_ENV=production`, `PUBLIC_URL=https://your-domain`, `SUPERADMIN_*`, plus the provider keys you're using (see `.env.example`).
4. Point the Stripe webhook at `https://your-domain/api/webhooks/stripe`.
5. Optional order emails: create a [Resend](https://resend.com) account, verify the domain, then set `RESEND_API_KEY` and `MAIL_FROM`.

## Structure

```
server/
  index.js      Express app: security headers, CSRF guard, static files
  db.js         SQLite schema, first-boot product import, settings
  auth.js       scrypt passwords, hashed session tokens, rate limiter, roles
  shop.js       public API: catalog, promo codes, orders, webhooks
  admin.js      staff API: products, photo uploads, orders, settings, team
  payments.js   Stripe / PayPal / Mercado Pago (REST, no SDKs)
  email.js      optional Resend emails (receipt, transfer instructions, shipped, staff alert)
public/
  index.html, css/styles.css, css/admin.css
  js/app.js     storefront: catalog, search, cart, guest checkout, payment returns
  js/admin.js   staff UI (only loaded when signed in or on /admin)
  js/pricing.js totals, shipping, tax: shared by browser and server so they always agree
  js/i18n.js    every UI string, error code and email in es / en / pt, plus product-text fallback
  js/data.js    categories, launch catalog in 3 languages (first-boot import)
  js/art.js     generated product art (used until a product has photos)
```

## Dynamic home-page sections

Hero stats, hero callouts, trust badges, About highlights, About stats, the policy banner and the FAQ
are stored in the database (`content` table) and rendered by JavaScript, so staff edit them on the page
(✎ ↑ ↓ ✕ and "+ Add" appear when signed in). The schema in `public/js/sections.js` drives validation,
the edit form and the item limits. **Full walkthrough with exercises: [docs/LEARN-dynamic-sections.md](docs/LEARN-dynamic-sections.md).**

## Translations

- **Interface text:** every label, message, FAQ entry and email lives in `public/js/i18n.js` (`es`, `en`, `pt`). Add or change a string in all three blocks; a missing key falls back to Spanish.
- **Static HTML:** elements carry `data-i18n="key"` (text) or `data-i18n-attr="aria-label:key"` (attributes) and are filled on load and on every language switch.
- **Server errors:** the API returns a `code` (e.g. `err.promoInvalid`) that the browser translates. The English `error` text is only for logs.
- **Product text:** Spanish is stored on the product; English and Portuguese go in `tr.en` / `tr.pt`. The editor has ES / EN / PT tabs, and any empty translated field shows the Spanish text.
- **Orders:** each order remembers the shopper's language. Item names are saved in that language, customer emails go out in it, and Stripe's checkout page opens in it. Staff alerts are in Spanish.
- **Header menu:** it uses short labels in Spanish and Portuguese (`nav.*` keys) so it fits on laptops; the full names are used everywhere else.

## Placeholders to replace before launch

- **"Real stats go here"**: the hero stats, hero callouts and About stats. These disappear as soon as staff add real items to those sections from the page. The rating line on each product is still a placeholder in code.
- **"Sample review goes here"**: the review cards in each product's detail view.

Real reviews need a review system (or an import from wherever the client collects them); none is built yet.

## Security notes

- Session cookie is `HttpOnly; SameSite=Strict` (plus `Secure` in production). The token is stored hashed, and sessions last 7 days.
- Every state-changing `/api` call needs an `X-Requested-With: kovalent` header (CSRF guard).
- Logins are rate-limited (10 per 15 minutes per IP+email). Orders and promo checks are rate-limited per IP.
- Uploads are checked by their actual bytes (JPG/PNG/WebP only, max 8 MB), get random filenames and are served with `nosniff`. The browser downscales photos to 1600px and strips camera metadata, including GPS, before uploading.
- Admin-entered text is escaped before rendering. A strict CSP (`script-src 'self'`) blocks inline scripts as a second layer.
- Deleting a product hides it from the store; past orders keep their own snapshot of what was bought.
- The product API replaces all editable fields on save (the editor always sends the full product). Scripts calling `PUT /api/admin/products/:id` directly must send the whole product too.

## Responsive breakpoints

All breakpoints are in the "Responsive layer" block at the end of `public/css/styles.css`; admin breakpoints are at the end of `admin.css`.

| Width | What changes |
|---|---|
| ≤1380px | Nav collapses into a hamburger menu |
| ≤1024px | Hero, about, FAQ, product modal and checkout go single-column; order summary moves below the form |
| ≤900px | 2-column product grid; category chips scroll sideways; cart drawer goes full-width |
| ≤760px | Header splits into 2 rows; modals go full-screen; 16px inputs (no iOS zoom); single toast |
| ≤560px | Compact product cards; buttons stack full-width |
| ≤360px | Single-column product grid |
| `hover: none` | Touch devices get an always-visible Quick View icon |

---

## Store guide (for the shop owner)

**Sign in:** go to `yourdomain.com/admin`. Once signed in, a toolbar appears at the bottom of every page.

- **Add a product:** tap **+ Product** in the toolbar, or the **Add product** tile at the start of the catalog. Fill in the name, price and category, and add photos. The first photo is the main one; use the arrows to reorder. It goes live as soon as you save.
- **Edit or delete:** every product shows **Edit** and **Delete** buttons, both on its card and inside its detail view.
- **Lists in the editor:** write one item per line. Tech specs and benefits use `Name: Value`, for example `Durability: Up to 5 years`.
- **Orders:**
  - Card, PayPal and Mercado Pago orders become **Paid** on their own.
  - Zelle / ATH Móvil orders show as **Awaiting transfer**. Check your bank app, then open the order and tap **Payment received**; the customer gets a confirmation email.
  - Once it's shipped, add the tracking number and tap **Mark as shipped**.
- **Home page text:** the trust badges, FAQ, policies, About points and stats each show ✎ (edit), ↑ ↓ (reorder) and ✕ (delete), plus an "+ Add" button. Fill in Spanish first; the English and Portuguese tabs are optional.
- **Settings:** shipping prices, free-shipping threshold, sales tax states, promo codes, and your Zelle / ATH Móvil instructions.
