// Dynamic content sections: the one place that describes them.
//
// Every section is a list of "items" stored in the `content` table. This schema tells
//   • the server how to validate an item (server/admin.js → cleanItem),
//   • the admin how to build an editing form (public/js/admin.js → sectionEditorView),
//   • the storefront which template turns an item into a card (public/js/app.js → TEMPLATES).
// Add a new section here, add a template in app.js and a container in index.html, and it works.
//
// Item shape in the database:
//   { shared: { value, icon }, es: { label, ... }, en: { ... }, pt: { ... } }
// Fields with `tr: true` are translated (es is required, en/pt fall back to es).
// Fields with `tr: false` are the same in every language (numbers, icons).

export const SECTIONS = {
  heroStats: {
    max: 3,
    placeholder: true, // show "Real stats go here" cards while empty
    fields: [
      { key: 'value', tr: false, max: 16, required: true, hint: 'fld.valueHint' },
      { key: 'label', tr: true, max: 40, required: true },
    ],
  },
  heroCallouts: {
    max: 2,
    placeholder: true,
    fields: [
      { key: 'title', tr: true, max: 30, required: true },
      { key: 'text', tr: true, max: 50 },
    ],
  },
  trust: {
    max: 4,
    fields: [
      { key: 'icon', tr: false, type: 'icon', required: true },
      { key: 'title', tr: true, max: 40, required: true },
      { key: 'text', tr: true, max: 80 },
    ],
  },
  aboutPoints: {
    max: 5,
    fields: [
      { key: 'title', tr: true, max: 50, required: true },
      { key: 'text', tr: true, max: 160, type: 'textarea' },
    ],
  },
  aboutStats: {
    max: 4,
    placeholder: true,
    fields: [
      { key: 'value', tr: false, max: 16, required: true, hint: 'fld.valueHint' },
      { key: 'label', tr: true, max: 40, required: true },
    ],
  },
  policies: {
    max: 3,
    fields: [
      { key: 'title', tr: true, max: 50, required: true },
      { key: 'text', tr: true, max: 200, type: 'textarea' },
    ],
  },
  faq: {
    max: 30,
    fields: [
      { key: 'tag', tr: true, max: 24, hint: 'fld.tagHint' },
      { key: 'question', tr: true, max: 160, required: true },
      { key: 'answer', tr: true, max: 1200, type: 'textarea', required: true },
    ],
  },
};

export const SECTION_KEYS = Object.keys(SECTIONS);
export const CONTENT_LANGS = ['es', 'en', 'pt'];

// Icon choices for sections with an `icon` field (inner SVG markup, 24×24 viewBox).
export const ICONS = {
  flask: '<path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21.5h11.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7 15h10"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  truck: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19 13 11"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z"/>',
};

/** Flatten a stored item into the fields for one language (Spanish fills any gap). */
export function localizeItem(item, lang) {
  const out = { id: item.id };
  for (const f of SECTIONS[item.section].fields) {
    out[f.key] = f.tr
      ? (item.data[lang]?.[f.key] || item.data.es?.[f.key] || '')
      : (item.data.shared?.[f.key] ?? '');
  }
  return out;
}
