// Turns a legal/contact page body (plain text with a tiny bit of formatting) into safe HTML.
// Used by the storefront and by the admin editor's live preview.
//
//   blank line → new paragraph      "## Title" → heading      "- item" / "1. item" → lists
//   **bold**                        {business} {email} {phone} {address} {updated} → filled in
//   [PENDIENTE: …] / [PENDING: …] / [PENDENTE: …] → highlighted so missing info stands out
//
// Safety: the whole text is HTML-escaped FIRST; only our own tags are added afterwards.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderPage(body, vars = {}, pendingLabel = 'Pending') {
  const pending = (what) => `<mark class="pending">[${esc(pendingLabel)}: ${what}]</mark>`;
  let text = esc(body)
    .replace(/\{(business|email|phone|address|updated)\}/g, (_, k) => {
      const v = String(vars[k] ?? '').trim();
      return v ? esc(v).replace(/\n+/g, ', ') : pending(k);
    })
    .replace(/\[(PENDIENTE|PENDING|PENDENTE):?([^\]]*)\]/g, (_, _w, what) => pending(what.trim()))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  return text.split(/\n\s*\n/).map((block) => renderBlock(block.trim().split('\n').map((l) => l.trim()).filter(Boolean))).join('');
}

function renderBlock(lines) {
  if (!lines.length) return '';
  // A heading may sit directly on top of a list or paragraph: emit it, then render the rest.
  if (lines[0].startsWith('## ')) return `<h3>${lines[0].slice(3)}</h3>${renderBlock(lines.slice(1))}`;
  if (lines.every((l) => l.startsWith('- '))) return `<ul>${lines.map((l) => `<li>${l.slice(2)}</li>`).join('')}</ul>`;
  if (lines.every((l) => /^\d+\.\s/.test(l))) return `<ol>${lines.map((l) => `<li>${l.replace(/^\d+\.\s/, '')}</li>`).join('')}</ol>`;
  return `<p>${lines.join('<br>')}</p>`;
}
