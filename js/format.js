// Number and text formatting. Pure functions, no DOM.

export const NA = '—'; // em dash: "not listed" (never shown as 0)
const MINUS = '−';

/** Impact Factor: 1 decimal as in the source; 2 decimals only where the source has them. */
export function fmtIf(v) {
  if (v == null) return NA;
  const oneDecimal = Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;
  return oneDecimal ? v.toFixed(1) : v.toFixed(2);
}

/** Article Influence Score: 3 decimals as in the source. */
export function fmtAis(v) {
  return v == null ? NA : v.toFixed(3);
}

/** Share of the category ranked above or level with this journal, e.g. 5.1% or 36%. */
export function fmtTop(pct) {
  if (pct == null) return NA;
  return (pct < 10 ? pct.toFixed(1) : String(Math.round(pct))) + '%';
}

export function fmtRank(cell) {
  return cell ? `${cell[0]} / ${cell[1]}` : NA;
}

/** Signed difference with a true minus sign. digits = decimals to show. */
export function fmtDelta(d, digits) {
  if (d == null || Number.isNaN(d)) return NA;
  const r = Number(d.toFixed(digits));
  if (r === 0) return (0).toFixed(digits);
  return (r > 0 ? '+' : MINUS) + Math.abs(r).toFixed(digits);
}

export function fmtInt(n) {
  return Number(n).toLocaleString('en-US');
}

/** Lower-case, accent-free, "&" read as "and": the form used for searching. */
export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
