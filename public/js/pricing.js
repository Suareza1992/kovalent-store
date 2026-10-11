// Shared by the browser (live estimates) and the server (the amount actually charged).
// The server always recomputes totals from database prices; the client copy is display-only.

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Countries we ship to: North, Central and South America + the Caribbean.
export const COUNTRIES = [
  ['US', 'United States'], ['PR', 'Puerto Rico'], ['CA', 'Canada'], ['MX', 'Mexico'],
  ['BZ', 'Belize'], ['CR', 'Costa Rica'], ['SV', 'El Salvador'], ['GT', 'Guatemala'], ['HN', 'Honduras'], ['NI', 'Nicaragua'], ['PA', 'Panama'],
  ['BS', 'Bahamas'], ['BB', 'Barbados'], ['DO', 'Dominican Republic'], ['JM', 'Jamaica'], ['TT', 'Trinidad and Tobago'],
  ['AR', 'Argentina'], ['BO', 'Bolivia'], ['BR', 'Brazil'], ['CL', 'Chile'], ['CO', 'Colombia'], ['EC', 'Ecuador'],
  ['GY', 'Guyana'], ['PY', 'Paraguay'], ['PE', 'Peru'], ['SR', 'Suriname'], ['UY', 'Uruguay'], ['VE', 'Venezuela'],
];
export const COUNTRY_CODES = new Set(COUNTRIES.map(([c]) => c));
export const isDomestic = (country) => country === 'US' || country === 'PR';

// Simplified statewide base sales-tax rates (%). Local add-on rates are not included.
export const US_TAX = {
  AL: 4, AK: 0, AZ: 5.6, AR: 6.5, CA: 7.25, CO: 2.9, CT: 6.35, DE: 0, DC: 6, FL: 6, GA: 4, HI: 4, ID: 6, IL: 6.25,
  IN: 7, IA: 6, KS: 6.5, KY: 6, LA: 5, ME: 5.5, MD: 6, MA: 6.25, MI: 6, MN: 6.875, MS: 7, MO: 4.225, MT: 0, NE: 5.5,
  NV: 6.85, NH: 0, NJ: 6.625, NM: 4.875, NY: 4, NC: 4.75, ND: 5, OH: 5.75, OK: 4.5, OR: 0, PA: 6, RI: 7, SC: 6,
  SD: 4.2, TN: 7, TX: 6.25, UT: 6.1, VT: 6, VA: 5.3, WA: 6.5, WV: 6, WI: 5, WY: 4, PR: 11.5,
};
export const US_STATES = Object.keys(US_TAX).filter((s) => s !== 'PR').sort();

export const SHIPPING_METHODS = {
  standard: { label: 'Standard', eta: '2–5 business days', days: 5, domestic: true },
  express: { label: 'Express', eta: '1–2 business days', days: 2, domestic: true },
  overnight: { label: 'Overnight', eta: 'Next business day', days: 1, domestic: true },
  international: { label: 'International', eta: '7–14 business days', days: 14, domestic: false },
};

export function shippingOptions(country) {
  return Object.entries(SHIPPING_METHODS).filter(([, m]) => m.domestic === isDomestic(country)).map(([k]) => k);
}

/**
 * @param lines    [{ price, qty }]
 * @param settings { shipping: {standard, express, overnight, international, freeOver}, tax: {enabled, states} }
 * @param address  { country, region }
 */
export function computeTotals({ lines, settings, method, address = {}, promoPct = 0 }) {
  const subtotal = round2(lines.reduce((s, l) => s + l.price * l.qty, 0));
  const discount = round2(subtotal * (promoPct || 0) / 100);
  const net = round2(subtotal - discount);
  const country = address.country || 'US';
  const options = shippingOptions(country);
  const m = options.includes(method) ? method : options[0];
  const ship = settings.shipping;
  let shipping = 0;
  if (subtotal > 0) {
    if (m === 'international') shipping = ship.international;
    else shipping = m === 'standard' && ship.freeOver > 0 && net >= ship.freeOver ? 0 : ship[m];
  }
  const region = country === 'PR' ? 'PR' : address.region;
  let rate = null;
  if (!isDomestic(country) || !settings.tax?.enabled) rate = 0;
  else if (region && US_TAX[region] != null) {
    const states = settings.tax.states || [];
    rate = states.length === 0 || states.includes(region) ? US_TAX[region] : 0;
  }
  const tax = rate == null ? null : round2(net * rate / 100);
  return { subtotal, discount, net, shipping: round2(shipping), tax, rate, method: m, total: round2(net + shipping + (tax || 0)) };
}
