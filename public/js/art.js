// Generated product imagery. Every render gets unique gradient ids so many SVGs can share a page.
// Variants: 0 studio · 1 three-quarter angle · 2 label close-up · 3 water-beading surface.

let uid = 0;

const hsl = (h, s, l, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

function defs(id, hue, variant) {
  const bg = variant === 3
    ? `<radialGradient id="bg${id}" cx="50%" cy="35%" r="80%"><stop offset="0" stop-color="${hsl(hue, 30, 22)}"/><stop offset="1" stop-color="#0b0c10"/></radialGradient>`
    : `<radialGradient id="bg${id}" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#2a2c35"/><stop offset=".6" stop-color="#17181d"/><stop offset="1" stop-color="#0d0e11"/></radialGradient>`;
  return `<defs>
    ${bg}
    <linearGradient id="body${id}" x1="0" x2="1">
      <stop offset="0" stop-color="#0c0d10"/><stop offset=".18" stop-color="#2b2e36"/>
      <stop offset=".42" stop-color="#15161b"/><stop offset=".8" stop-color="#0b0c0f"/><stop offset="1" stop-color="#23252c"/>
    </linearGradient>
    <linearGradient id="cap${id}" x1="0" x2="1">
      <stop offset="0" stop-color="${hsl(hue, 90, 22)}"/><stop offset=".35" stop-color="${hsl(hue, 100, 58)}"/>
      <stop offset=".6" stop-color="${hsl(hue, 90, 38)}"/><stop offset="1" stop-color="${hsl(hue, 90, 18)}"/>
    </linearGradient>
    <linearGradient id="accent${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${hsl(hue, 100, 62)}"/><stop offset="1" stop-color="${hsl(hue + 30, 100, 50)}"/>
    </linearGradient>
    <linearGradient id="soft${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hsl(hue, 45, 62)}"/><stop offset="1" stop-color="${hsl(hue, 50, 30)}"/>
    </linearGradient>
    <radialGradient id="glow${id}" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${hsl(hue, 100, 55, .45)}"/><stop offset="1" stop-color="${hsl(hue, 100, 55, 0)}"/>
    </radialGradient>
    <linearGradient id="floor${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".06"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <pattern id="loops${id}" width="6" height="6" patternUnits="userSpaceOnUse">
      <circle cx="3" cy="3" r="1.4" fill="#fff" opacity=".12"/>
    </pattern>
  </defs>`;
}

function label(id, p, x, y, w, h) {
  const cx = x + w / 2;
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#0a0b0e" stroke="url(#accent${id})" stroke-width="1.2" opacity=".95"/>
    <polygon points="${cx},${y + 14} ${cx + 11},${y + 20} ${cx + 11},${y + 33} ${cx},${y + 39} ${cx - 11},${y + 33} ${cx - 11},${y + 20}"
      fill="none" stroke="url(#accent${id})" stroke-width="2"/>
    <text x="${cx}" y="${y + 31}" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="12" fill="#fff">K</text>
    <text x="${cx}" y="${y + 56}" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="8" letter-spacing="2.4" fill="#cfd6e0">KOVALENT</text>
    <rect x="${x + 10}" y="${y + 63}" width="${w - 20}" height="1" fill="url(#accent${id})"/>
    <text x="${cx}" y="${y + 84}" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="${p.short.length > 6 ? 13 : 17}" letter-spacing="1" fill="url(#accent${id})">${p.short}</text>
    <text x="${cx}" y="${y + h - 10}" text-anchor="middle" font-family="Inter, sans-serif" font-size="6.5" letter-spacing="1.2" fill="#8a93a3">${p.size.toUpperCase()}</text>
  </g>`;
}

const gloss = (x, y, w, h) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2}" fill="#fff" opacity=".16"/>`;

const SHAPES = {
  bottle(id, p) {
    return `
      <rect x="168" y="96" width="64" height="36" fill="url(#body${id})"/>
      <rect x="158" y="44" width="84" height="56" rx="8" fill="url(#cap${id})"/>
      ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${164 + i * 13}" y="50" width="3" height="44" fill="#000" opacity=".18"/>`).join('')}
      <path d="M138 150 q0 -22 30 -22 h64 q30 0 30 22 v186 q0 16 -16 16 h-92 q-16 0 -16 -16z" fill="url(#body${id})"/>
      ${label(id, p, 148, 186, 104, 136)}
      ${gloss(146, 150, 10, 190)}`;
  },
  spray(id, p) {
    return `
      <rect x="176" y="100" width="48" height="34" fill="#16171c"/>
      <path d="M150 58 h80 q14 0 14 14 v30 h-94z" fill="url(#cap${id})"/>
      <path d="M150 62 h-44 v18 h44z" fill="${hsl(p.hue, 80, 30)}"/>
      <rect x="100" y="64" width="8" height="14" rx="2" fill="#0d0e11"/>
      <path d="M182 102 q-14 28 6 44 l8 -6 q-12 -14 0 -38z" fill="${hsl(p.hue, 90, 40)}"/>
      <path d="M140 160 q0 -26 30 -26 h60 q30 0 30 26 v176 q0 16 -16 16 h-88 q-16 0 -16 -16z" fill="url(#body${id})"/>
      ${label(id, p, 148, 192, 104, 132)}
      ${gloss(148, 162, 10, 176)}`;
  },
  squeeze(id, p) {
    return `
      <path d="M176 104 L224 104 L212 46 Q200 36 188 46 Z" fill="url(#cap${id})"/>
      <rect x="166" y="102" width="68" height="26" rx="4" fill="url(#cap${id})"/>
      <path d="M136 150 q0 -22 26 -22 h76 q26 0 26 22 v188 q0 14 -14 14 h-100 q-14 0 -14 -14z" fill="url(#body${id})"/>
      ${label(id, p, 146, 184, 108, 140)}
      ${gloss(144, 150, 10, 192)}`;
  },
  pad(id, p) {
    const layers = [
      { y: 262, c: hsl(p.hue, 85, 45), name: 'FINISH', off: 0 },
      { y: 214, c: hsl(p.hue + 160, 75, 50), name: 'POLISH', off: -18 },
      { y: 166, c: hsl(p.hue - 180 + 20, 80, 52), name: 'CUT', off: 14 },
    ];
    return layers.map((l) => `
      <g transform="translate(${l.off} 0)">
        <path d="M70 ${l.y} v26 a130 46 0 0 0 260 0 v-26z" fill="${l.c}" opacity=".75"/>
        <path d="M70 ${l.y} v26 a130 46 0 0 0 260 0 v-26z" fill="url(#loops${id})"/>
        <ellipse cx="200" cy="${l.y}" rx="130" ry="46" fill="${l.c}"/>
        <ellipse cx="200" cy="${l.y}" rx="130" ry="46" fill="url(#loops${id})"/>
        <ellipse cx="200" cy="${l.y}" rx="92" ry="32" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="2"/>
        <ellipse cx="200" cy="${l.y}" rx="18" ry="6.5" fill="#0d0e11"/>
        <text x="300" y="${l.y + 4}" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="9" font-weight="700" letter-spacing="1.5" fill="#000" opacity=".45">${l.name}</text>
      </g>`).join('');
  },
  towel(id, p) {
    const stack = [0, 1, 2].map((i) => {
      const y = 270 - i * 54;
      const l = 30 + i * 9;
      return `<g transform="rotate(${(i - 1) * -3} 200 ${y})">
        <rect x="76" y="${y - 30}" width="248" height="60" rx="16" fill="${hsl(p.hue, 50, l)}"/>
        <rect x="76" y="${y - 30}" width="248" height="60" rx="16" fill="url(#loops${id})"/>
        <rect x="76" y="${y - 30}" width="248" height="18" rx="12" fill="#fff" opacity=".08"/>
        <path d="M76 ${y + 6} h248" stroke="#000" stroke-opacity=".2" stroke-width="2"/>
      </g>`;
    }).join('');
    return `${stack}
      <g transform="translate(250 132) rotate(6)">
        <rect width="74" height="34" rx="4" fill="#0a0b0e" stroke="url(#accent${id})"/>
        <text x="37" y="15" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="7" letter-spacing="1.6" fill="#cfd6e0">KOVALENT</text>
        <text x="37" y="27" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="10" font-weight="700" fill="url(#accent${id})">${p.short}</text>
      </g>`;
  },
  block(id, p) {
    return `
      <path d="M96 236 l70 -54 h148 l-70 54z" fill="${hsl(p.hue, 30, 40)}"/>
      <path d="M96 236 h148 v52 h-148 q-12 0 -12 -12 v-28 q0 -12 12 -12z" fill="url(#soft${id})"/>
      <path d="M244 236 l70 -54 v48 q0 6 -4 9 l-66 49z" fill="${hsl(p.hue, 40, 22)}"/>
      <path d="M96 288 h148 v12 h-148 q-12 0 -12 -12z" fill="#e9e3d6" opacity=".9"/>
      <path d="M244 288 l66 -49 v12 l-66 49z" fill="#cfc8b8" opacity=".9"/>
      <path d="M96 236 l70 -54 h148 l-70 54z" fill="url(#loops${id})"/>
      <text x="170" y="268" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="13" font-weight="700" letter-spacing="3" fill="#0a0b0e" opacity=".6">KOVALENT</text>
      ${[0, 1, 2].map((i) => `<rect x="${120 + i * 18}" y="${120 - i * 10}" width="120" height="70" rx="6" transform="rotate(${-8 + i * 6} 180 150)" fill="#ece6d9" opacity="${0.35 + i * 0.2}"/>`).join('')}`;
  },
  applicator(id, p) {
    return [0, 1, 2, 3].map((i) => {
      const x = 120 + (i % 2) * 150 + (i > 1 ? -30 : 0);
      const y = 170 + Math.floor(i / 2) * 110;
      const c = hsl(p.hue + i * 12, 60, 38 + i * 5);
      return `<g>
        <path d="M${x - 78} ${y} v20 a78 28 0 0 0 156 0 v-20z" fill="${c}" opacity=".7"/>
        <ellipse cx="${x}" cy="${y}" rx="78" ry="28" fill="${c}"/>
        <ellipse cx="${x}" cy="${y}" rx="78" ry="28" fill="url(#loops${id})"/>
        <path d="M${x - 40} ${y - 2} q40 -12 80 0" stroke="#000" stroke-opacity=".35" stroke-width="3" fill="none"/>
      </g>`;
    }).join('');
  },
  kit(id, p) {
    return `
      <path d="M70 180 l60 -40 h220 l-60 40z" fill="#26282f"/>
      <path d="M290 180 l60 -40 v150 l-60 40z" fill="#0f1014"/>
      <rect x="70" y="180" width="220" height="150" rx="4" fill="url(#body${id})"/>
      <rect x="70" y="180" width="220" height="6" fill="url(#accent${id})"/>
      <polygon points="114,222 132,232 132,254 114,264 96,254 96,232" fill="none" stroke="url(#accent${id})" stroke-width="2.5"/>
      <text x="114" y="249" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="16" fill="#fff">K</text>
      <text x="148" y="236" font-family="Space Grotesk, sans-serif" font-size="10" font-weight="600" letter-spacing="3" fill="#cfd6e0">KOVALENT</text>
      <text x="148" y="258" font-family="Space Grotesk, sans-serif" font-size="18" font-weight="700" fill="url(#accent${id})">${p.short} SYSTEM</text>
      <text x="148" y="276" font-family="Inter, sans-serif" font-size="8" letter-spacing="1.5" fill="#8a93a3">${p.size.toUpperCase()}</text>
      <rect x="96" y="296" width="168" height="1" fill="#fff" opacity=".1"/>
      <text x="96" y="314" font-family="Inter, sans-serif" font-size="7.5" letter-spacing="1.5" fill="#6b7280">PROFESSIONAL SURFACE CHEMISTRY</text>
      <g transform="translate(240 70) scale(.42)">
        <rect x="168" y="96" width="64" height="36" fill="#16171c"/>
        <rect x="158" y="44" width="84" height="56" rx="8" fill="url(#cap${id})"/>
        <path d="M138 150 q0 -22 30 -22 h64 q30 0 30 22 v186 q0 16 -16 16 h-92 q-16 0 -16 -16z" fill="url(#body${id})"/>
      </g>`;
  },
};

function beads(hue) {
  // Deterministic water beads for the "beading" variant.
  let out = '';
  for (let i = 0; i < 34; i++) {
    const x = (i * 97) % 400;
    const y = 250 + ((i * 53) % 150);
    const r = 3 + ((i * 7) % 9);
    out += `<g><ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.8}" fill="${hsl(hue, 60, 70, .18)}" stroke="#fff" stroke-opacity=".35" stroke-width=".8"/>
      <ellipse cx="${x - r * 0.35}" cy="${y - r * 0.3}" rx="${r * 0.3}" ry="${r * 0.2}" fill="#fff" opacity=".8"/></g>`;
  }
  return out;
}

export function productArt(p, variant = 0) {
  const id = `k${++uid}`;
  const transforms = ['', 'translate(200 210) rotate(-9) scale(.95) translate(-200 -210)', 'translate(200 255) scale(1.75) translate(-200 -255)', 'translate(200 180) scale(.78) translate(-200 -200)'];
  return `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${p.name}" preserveAspectRatio="xMidYMid slice">
    ${defs(id, p.hue, variant)}
    <rect width="400" height="400" fill="url(#bg${id})"/>
    <ellipse cx="200" cy="200" rx="170" ry="150" fill="url(#glow${id})"/>
    <rect x="0" y="352" width="400" height="48" fill="url(#floor${id})"/>
    ${variant === 3 ? beads(p.hue) : ''}
    <ellipse cx="200" cy="356" rx="120" ry="10" fill="#000" opacity=".55"/>
    <g transform="${transforms[variant]}">${SHAPES[p.shape](id, p)}</g>
  </svg>`;
}

export function heroArt(products) {
  // Three hero bottles on a reflective surface with a light sweep.
  const id = `h${++uid}`;
  const [a, b, c] = products;
  const sub = (p) => id + 'abc'[products.indexOf(p)];
  const place = (p, x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">${SHAPES[p.shape](sub(p), p)}</g>`;
  const extraDefs = [a, b, c].map((p) => defs(sub(p), p.hue, 0)).join('');
  return `<svg viewBox="0 0 800 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Kovalent flagship coatings">
    ${extraDefs}
    <defs>
      <radialGradient id="hglow${id}" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#00E5FF" stop-opacity=".35"/><stop offset="1" stop-color="#00E5FF" stop-opacity="0"/></radialGradient>
      <linearGradient id="hfloor${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00E5FF" stop-opacity=".18"/><stop offset="1" stop-color="#00E5FF" stop-opacity="0"/></linearGradient>
      <linearGradient id="sweep${id}" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <clipPath id="clip${id}"><rect width="800" height="470"/></clipPath>
    </defs>
    <ellipse cx="400" cy="260" rx="360" ry="250" fill="url(#hglow${id})"/>
    <ellipse cx="400" cy="470" rx="380" ry="40" fill="url(#hfloor${id})"/>
    <path d="M20 470 H780" stroke="#00E5FF" stroke-opacity=".35"/>
    <g clip-path="url(#clip${id})">
      ${place(c, 430, 120, 0.9)}
      ${place(b, 10, 120, 0.9)}
      ${place(a, 175, 18, 1.15)}
      <rect class="hero-sweep" x="-300" y="0" width="200" height="470" fill="url(#sweep${id})" transform="skewX(-18)"/>
    </g>
    <g opacity=".22" transform="translate(0 940) scale(1 -1)">
      ${place(c, 430, 120, 0.9)}${place(b, 10, 120, 0.9)}${place(a, 175, 18, 1.15)}
    </g>
    <rect x="0" y="470" width="800" height="90" fill="#121212" opacity=".55"/>
  </svg>`;
}

export const LOGO_MARK = `<svg viewBox="0 0 40 40" aria-hidden="true">
  <defs><linearGradient id="lg-k" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00E5FF"/><stop offset="1" stop-color="#2F7BFF"/></linearGradient></defs>
  <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="none" stroke="url(#lg-k)" stroke-width="2.6"/>
  <path d="M15 11 v18 M15 20 l9 -9 M18.5 17 l6.5 12" stroke="#fff" stroke-width="2.8" stroke-linecap="round" fill="none"/>
  <circle cx="36" cy="11" r="2.6" fill="#00E5FF"/><circle cx="4" cy="29" r="2.6" fill="#00E5FF"/>
</svg>`;
