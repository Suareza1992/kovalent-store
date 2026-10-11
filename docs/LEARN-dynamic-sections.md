# Lesson: dynamic, data-driven sections

**Goal:** understand how Kovalent turns rows in a database into cards on the page, and how the
shop owner edits them without touching code. Then build a new section yourself (exercises at the end).

Seven parts of the home page work this way: hero stats, hero callouts, trust badges, About highlights,
About stats, the policy banner and the FAQ. The product grid uses the same idea (it was the first one).

---

## 1. Static vs. dynamic: what changed

**Before:** the trust badges were written straight into `index.html`:

```html
<div class="trust-item">
  <svg>…</svg>
  <div><b>Pro-Grade Formulas</b><span>Same chemistry our installers use</span></div>
</div>
<!-- …and three more copies, each typed by hand -->
```

Changing a badge meant editing HTML and redeploying. Adding one meant copying markup.

**Now:** `index.html` only has an empty container, a "slot":

```html
<div class="trust-inner" data-section="trust"></div>
```

The *content* lives in the database, and JavaScript builds the cards from it. That split
(**data** in one place, **markup** in one place, **code that joins them**) is the core skill.

---

## 2. The four layers (follow one badge from database to screen)

```
 ┌───────────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌────────────────────┐
 │ 1. DATABASE   │ → │ 2. API           │ → │ 3. RENDER        │ → │ 4. PAGE            │
 │ content table │   │ GET /api/bootstrap│   │ renderSection()  │   │ <div data-section> │
 │ (one row per  │   │ returns JSON      │   │ + TEMPLATES      │   │ gets the cards     │
 │  card)        │   │                  │   │                  │   │                    │
 └───────────────┘   └──────────────────┘   └──────────────────┘   └────────────────────┘
        ▲                                                                   │
        └──────────── 5. ADMIN EDITOR (POST / PUT / DELETE) ◄────────────────┘
```

### Layer 1: the data (`server/db.js`)

One table holds every card from every section:

```sql
CREATE TABLE content (
  id      INTEGER PRIMARY KEY,
  section TEXT,      -- which slot it belongs to: 'trust', 'faq', …
  sort    INTEGER,   -- position inside that section
  data    TEXT       -- JSON with the actual content
);
```

A trust badge row's `data` looks like this:

```json
{
  "shared": { "icon": "flask" },
  "es": { "title": "Fórmulas profesionales", "text": "La misma química que usan…" },
  "en": { "title": "Pro-Grade Formulas",     "text": "Same chemistry our installers use" },
  "pt": { "title": "Fórmulas profissionais", "text": "A mesma química que…" }
}
```

`shared` holds things that are the same in every language (an icon, a number). Each language gets
its own bucket for text. Storing JSON in a column is a deliberate trade-off: new fields need no
database migration, but you can't easily query *inside* the JSON. That's fine for content like this.

`listContent()` reads all rows and groups them by section, ordered by `sort`.

### Layer 2: the API (`server/shop.js` + `server/admin.js`)

The browser asks for everything in one request when the page loads:

```
GET /api/bootstrap  →  { products: [...], content: { trust: [...], faq: [...], ... }, ... }
```

Staff change content through these endpoints (all require sign-in):

| Method | URL | Does |
|---|---|---|
| `POST` | `/api/admin/content` | add an item `{ section, data }` |
| `PUT` | `/api/admin/content/:id` | replace an item's `data` |
| `POST` | `/api/admin/content/:id/move` | swap with its neighbour `{ dir: -1 or 1 }` |
| `DELETE` | `/api/admin/content/:id` | remove it |

Every write goes through `cleanItem()`, which **never trusts the browser**: it keeps only the
fields the schema allows, trims and cuts text to the max length, checks required fields, checks the
icon is a real one, and enforces the section's item limit. Each write returns the fresh `content` so
the page can redraw without a second request.

### Layer 3: the schema (`public/js/sections.js`), the key idea

Instead of writing separate code for each section, one object *describes* them all:

```js
trust: {
  max: 4,
  fields: [
    { key: 'icon',  tr: false, type: 'icon', required: true },
    { key: 'title', tr: true,  max: 40, required: true },
    { key: 'text',  tr: true,  max: 80 },
  ],
},
```

This file is imported by **both** the server and the browser, so three different pieces of code read
the same description:

- the server uses it to **validate** (`cleanItem`),
- the admin uses it to **build the edit form** (`sectionView` loops over `fields`),
- the storefront uses it to know the **limit** and whether to show **placeholders**.

This is called *schema-driven* or *declarative* UI: you declare **what** a section is, and generic
code works out **how** to validate, edit and show it. Adding a section becomes mostly data, not code.

`localizeItem(item, lang)` flattens a stored item into one language, falling back to Spanish:
`{ id, icon: 'flask', title: 'Pro-Grade Formulas', text: '…' }`.

### Layer 4: render (`public/js/app.js` → "Dynamic sections")

```js
const TEMPLATES = {
  trust: (it, tools) => `<div class="trust-item dyn">${tools}${svgIcon(it.icon)}
                           <div><b>${it.title}</b><span>${it.text}</span></div></div>`,
  // …one small function per section
};

function renderSection(key) {
  const el = $(`[data-section="${key}"]`);                  // find the slot
  const items = config.content[key]
    .map((item) => escapeDeep(localizeItem(item, lang)));  // pick language, make text safe
  let html = items.map((it, i) => TEMPLATES[key](it, adminTools(…), i)).join('');
  if (!items.length && PLACEHOLDERS[key]) html = …;          // "Real stats go here"
  if (state.me && items.length < SECTIONS[key].max) html += addButton;
  el.innerHTML = html;
}
```

That's the whole pattern: **data → map each item through a template → join → put into the slot.**
`renderSections()` runs it for every section on page load, after a language switch, and after any
admin change.

**Why `escapeDeep`?** The text was typed by a person. If someone saved a FAQ answer of
`<script>…</script>` and we put it into `innerHTML` raw, the browser would run it (this is called
XSS). Escaping turns `<` into `&lt;` so it shows as text. Rule of thumb: **escape anything a user
typed before it goes into HTML.** (We tested this: the FAQ showed the tags as plain text.)

### Layer 5: the admin editor (`public/js/admin.js` → "Dynamic section editor")

When staff are signed in, each card gets a small ✎ ↑ ↓ ✕ strip (`adminTools()` in app.js), and each
section gets a "+ Add" button. Clicking ✎ opens `openSectionEditor()`, and `sectionView()` builds the
form **by looping over the schema's fields**: text → `<input>`, `textarea` → `<textarea>`,
`icon` → an icon picker. Language tabs switch which bucket (`es` / `en` / `pt`) the text inputs write to.
Saving calls the API, gets back the new content, and calls `ctx.setContent()`, which re-renders.

---

## 3. Why this matters beyond this project

- **Separation of concerns:** content changes don't need a developer or a redeploy.
- **One source of truth:** the schema means validation, forms and rendering can't drift apart.
- **The same pattern is everywhere:** React's `items.map(item => <Card {...item} />)`,
  WordPress blocks, Shopify sections, headless CMSs (Contentful, Sanity, Strapi). Each is
  "a list of typed records + a template per type + an editor generated from a schema".
  You just built a tiny headless CMS.

---

## 4. Exercises (do them in order)

**1. Read it running.** With the site open and signed in, open DevTools → Network, edit a trust badge
and watch the `PUT /api/admin/content/:id` request and its JSON response. Then in the Console:
`(await (await fetch('/api/bootstrap')).json()).content.trust`

**2. Add a field.** Give `policies` an optional `icon` (copy the field definition from `trust`).
Update the `policies` template in `TEMPLATES` to show it. Notice you didn't touch the server or the
editor, because they read the schema.

**3. Build a new section: "Testimonials".** Customer quotes the owner can add herself.
1. `sections.js`: add `testimonials` with `max: 6` and fields `quote` (textarea, tr), `name` (not tr),
   `car` (tr).
2. `index.html`: add a `<section>` with `<div class="testimonials" data-section="testimonials"></div>`.
3. `app.js`: add a `testimonials` entry to `TEMPLATES`.
4. `i18n.js`: add `sec.testimonials`, `fld.quote`, `fld.name`, `fld.car` in all three languages.
5. `styles.css`: lay out the cards (try `grid-template-columns: repeat(auto-fit, minmax(260px, 1fr))`).

   No server code needed. If you get stuck, compare with how `aboutPoints` is wired.
   (These must be **real** quotes from real customers, not invented ones.)

**4. Stretch: drag to reorder.** Replace the ↑ ↓ buttons with drag-and-drop (the HTML5 `draggable`
attribute and `dragstart`/`drop` events), sending a single `PUT /api/admin/content/order` with the
new id list. You'll write that endpoint yourself in `server/admin.js`.

**5. Stretch: make categories dynamic.** The product categories (`CATEGORIES` in `data.js`) are still
hard-coded. Sketch how you'd move them into the database. What breaks if the owner deletes a
category that products still use? (Thinking about that edge case is the real exercise.)

---

## File map

| Layer | File | Look for |
|---|---|---|
| Schema | `public/js/sections.js` | `SECTIONS`, `ICONS`, `localizeItem` |
| Database | `server/db.js` | `CREATE TABLE content`, "Migration 3", `listContent` |
| API | `server/admin.js` | `cleanItem`, `/admin/content` routes |
| API | `server/shop.js` | `content: listContent()` in `/bootstrap` |
| Render | `public/js/app.js` | `TEMPLATES`, `PLACEHOLDERS`, `renderSection` |
| Editor | `public/js/admin.js` | `openSectionEditor`, `sectionView`, `saveSection` |
| Slots | `public/index.html` | `data-section="…"` |
| Styles | `public/css/styles.css`, `admin.css` | `.dyn`, `.sec-tools`, `.sec-add` |
