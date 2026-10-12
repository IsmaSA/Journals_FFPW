// SVG charts, built with the DOM API (no libraries, no innerHTML).
// All colours come from CSS classes/variables in css/style.css so light and dark themes both work.
import { fmtAis, fmtIf, fmtTop, NA } from './format.js';
import { topPct } from './model.js';

const NS = 'http://www.w3.org/2000/svg';

export function svgEl(name, attrs = {}, ...children) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
  for (const c of children) if (c != null) node.append(c);
  return node;
}
function text(x, y, str, cls, anchor = 'middle') {
  const t = svgEl('text', { x, y, class: cls, 'text-anchor': anchor });
  t.textContent = str;
  return t;
}
const r1 = (n) => Math.round(n * 10) / 10;

/** Evenly spaced x positions, one per year, whether or not the year has data. */
function xFor(i, n, left, innerW) {
  return left + (innerW * (i + 0.5)) / n;
}

/** Splits values into runs of consecutive present years, so gaps are never bridged by a line. */
function runs(points) {
  const out = [];
  let cur = [];
  for (const p of points) {
    if (p) cur.push(p);
    else if (cur.length) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Description used for aria-label / <title> of a position chart. */
export function describePosition(model, rec) {
  return model.years
    .map((y, i) => {
      const c = rec.row[i];
      return c ? `${y}: ${c[2]}, rank ${c[0]} of ${c[1]}, top ${fmtTop(topPct(c))}` : `${y}: not listed`;
    })
    .join('; ');
}

/**
 * Tiny sparkline of position in category (higher on the line = better standing).
 * Used in table rows; the numbers are in the row and in the detail panel, so it is decorative.
 */
export function sparkPosition(model, rec, yi, { w = 64, h = 22 } = {}) {
  const pad = 4;
  const n = model.years.length;
  const pts = rec.row.map((c, i) => (c ? { x: xFor(i, n, 0, w), y: pad + (topPct(c) / 100) * (h - 2 * pad), i } : null));
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, class: 'spark', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(svgEl('line', { x1: 0, x2: w, y1: h / 2, y2: h / 2, class: 'spark-mid' }));
  for (const run of runs(pts)) {
    if (run.length > 1) svg.append(svgEl('polyline', { points: run.map((p) => `${r1(p.x)},${r1(p.y)}`).join(' '), class: 'spark-line' }));
  }
  for (const p of pts) {
    if (!p) continue;
    svg.append(svgEl('circle', { cx: r1(p.x), cy: r1(p.y), r: p.i === yi ? 3 : 2, class: p.i === yi ? 'spark-dot spark-dot-now' : 'spark-dot' }));
  }
  return svg;
}

/**
 * Position within the category across the years: a path through quartile bands.
 * y axis is fixed at 0-100 % of the category, 0 (best) at the top. Never bridges a missing year.
 */
export function positionChart(model, rec, yi, { w = 300, h = 120, compact = false } = {}) {
  const m = { l: 26, r: 8, t: compact ? 12 : 16, b: 20 };
  const innerW = w - m.l - m.r;
  const innerH = h - m.t - m.b;
  const n = model.years.length;
  const y = (pct) => m.t + (pct / 100) * innerH;
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, class: 'chart chart-position', role: 'img', 'aria-label': 'Position in category. ' + describePosition(model, rec) });
  svg.append(svgEl('title', {}, document.createTextNode('Position in category by year')));

  for (let q = 0; q < 4; q++) {
    svg.append(svgEl('rect', { x: m.l, y: r1(y(q * 25)), width: innerW, height: r1(innerH / 4), class: `band band-${q + 1}` }));
    // Q1 is split: the top 10 % is the D1 zone (label used from 2024), so a D1 point visibly sits inside Q1.
    const mid = q === 0 ? 18 : q * 25 + 12.5;
    svg.append(text(m.l - 5, r1(y(mid)) + 3.5, `Q${q + 1}`, 'axis-label', 'end'));
  }
  svg.append(svgEl('line', { x1: m.l, x2: m.l + innerW, y1: r1(y(10)), y2: r1(y(10)), class: 'd1-line' }));
  svg.append(text(m.l - 5, r1(y(5)) + 3.5, 'D1', 'axis-label', 'end'));

  const pts = rec.row.map((c, i) => (c ? { c, i, x: xFor(i, n, m.l, innerW), y: y(topPct(c)) } : null));
  for (const run of runs(pts)) {
    if (run.length > 1) svg.append(svgEl('polyline', { points: run.map((p) => `${r1(p.x)},${r1(p.y)}`).join(' '), class: 'path-line' }));
  }
  const fs = compact ? 'pt-label pt-label-sm' : 'pt-label';
  pts.forEach((p, i) => {
    const x = xFor(i, n, m.l, innerW);
    svg.append(text(x, h - 5, String(model.years[i]), i === yi ? 'tick tick-now' : 'tick'));
    if (!p) {
      svg.append(text(x, r1(m.t + innerH / 2) + 3, 'not listed', 'na-label'));
      return;
    }
    const now = i === yi;
    const above = p.y > m.t + 20; // flip the label under the point when near the top edge
    svg.append(svgEl('circle', { cx: r1(p.x), cy: r1(p.y), r: now ? 5.5 : 4.5, class: now ? 'pt pt-now' : 'pt' }));
    svg.append(text(r1(p.x), r1(above ? p.y - 9 : p.y + 17), p.c[2], fs + ' pt-q'));
    svg.append(text(r1(p.x), r1(above ? p.y + 17 : p.y - 9), `${p.c[0]}/${p.c[1]}`, 'pt-rank'));
  });
  return svg;
}

/**
 * One value across the years (AIS or IF). Lines are never drawn across a missing year.
 * The y axis is padded around the data (labelled at both ends); `truncated` is true when it
 * does not start at zero so the caller can say so.
 */
export function valueChart(model, values, yi, { w = 220, h = 96, fmt = fmtAis, axisFmt = fmt, label = '' } = {}) {
  const m = { l: 34, r: 8, t: 16, b: 20 };
  const innerW = w - m.l - m.r;
  const innerH = h - m.t - m.b;
  const n = model.years.length;
  const present = values.filter((v) => v != null);
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, class: 'chart chart-value', role: 'img' });
  const summary = model.years.map((yr, i) => `${yr}: ${values[i] == null ? 'not listed' : fmt(values[i])}`).join('; ');
  svg.setAttribute('aria-label', `${label}. ${summary}`);
  svg.append(svgEl('title', {}, document.createTextNode(label)));
  let truncated = false;
  if (!present.length) {
    svg.append(text(w / 2, h / 2, 'not listed in any year', 'na-label'));
    return { el: svg, truncated };
  }
  const min = Math.min(...present), max = Math.max(...present);
  const span = max - min;
  const pad = span > 0 ? span * 0.35 : Math.max(Math.abs(max) * 0.1, 0.05);
  let lo = min - pad;
  const hi = max + pad;
  if (min >= 0 && lo < 0) lo = 0;
  truncated = lo > 0;
  const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * innerH;

  svg.append(svgEl('line', { x1: m.l, x2: w - m.r, y1: y(lo), y2: y(lo), class: 'grid' }));
  svg.append(svgEl('line', { x1: m.l, x2: w - m.r, y1: y(hi), y2: y(hi), class: 'grid grid-faint' }));
  svg.append(text(m.l - 5, y(lo) + 3.5, axisFmt(lo), 'axis-label', 'end'));
  svg.append(text(m.l - 5, y(hi) + 3.5, axisFmt(hi), 'axis-label', 'end'));

  const pts = values.map((v, i) => (v == null ? null : { v, i, x: xFor(i, n, m.l, innerW), y: y(v) }));
  for (const run of runs(pts)) {
    if (run.length > 1) svg.append(svgEl('polyline', { points: run.map((p) => `${r1(p.x)},${r1(p.y)}`).join(' '), class: 'path-line' }));
  }
  pts.forEach((p, i) => {
    const x = xFor(i, n, m.l, innerW);
    svg.append(text(x, h - 5, String(model.years[i]), i === yi ? 'tick tick-now' : 'tick'));
    if (!p) {
      svg.append(text(x, r1(m.t + innerH / 2) + 3, 'not listed', 'na-label'));
      return;
    }
    const above = p.y > m.t + 14;
    svg.append(svgEl('circle', { cx: r1(p.x), cy: r1(p.y), r: i === yi ? 5 : 4, class: i === yi ? 'pt pt-now' : 'pt' }));
    svg.append(text(r1(p.x), r1(above ? p.y - 8 : p.y + 16), fmt(p.v), i === yi ? 'pt-label pt-label-sm pt-q' : 'pt-label pt-label-sm'));
  });
  return { el: svg, truncated };
}

/**
 * Several series on one chart (compare view), with direct end labels, a legend supplied by the
 * caller, and a hover/keyboard readout. kind: 'ais' | 'if' | 'pos'.
 * series: [{ name, cls: 's1'.., values: [number|null per year] }]  (for 'pos', values are top-% numbers)
 */
export function compareChart(model, series, kind, { w = 460, h = 200 } = {}) {
  const m = { l: kind === 'pos' ? 34 : 40, r: Math.min(150, Math.round(w * 0.32)), t: 14, b: 22 };
  const innerW = w - m.l - m.r;
  const innerH = h - m.t - m.b;
  const n = model.years.length;
  const fmt = kind === 'if' ? fmtIf : kind === 'ais' ? fmtAis : (v) => fmtTop(v);
  const all = series.flatMap((s) => s.values).filter((v) => v != null);

  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, class: 'chart chart-compare', role: 'img', tabindex: '0' });
  const title = { ais: 'Article Influence Score', if: 'Impact Factor', pos: 'Position in category (share of category ranked above, lower is better)' }[kind];
  svg.setAttribute('aria-label', `${title} by year for ${series.length} journals. Values are listed in the table below.`);
  svg.append(svgEl('title', {}, document.createTextNode(title)));
  wrap.append(svg);

  let lo, hi, y, truncated = false;
  if (kind === 'pos') {
    lo = 0; hi = 100;
    y = (v) => m.t + (v / 100) * innerH;
    for (let q = 0; q < 4; q++) {
      svg.append(svgEl('rect', { x: m.l, y: r1(y(q * 25)), width: innerW, height: r1(innerH / 4), class: `band band-${q + 1}` }));
      svg.append(text(m.l - 5, r1(y(q * 25 + 12.5)) + 3.5, `Q${q + 1}`, 'axis-label', 'end'));
    }
  } else {
    const min = Math.min(...all), max = Math.max(...all);
    const span = max - min;
    const pad = span > 0 ? span * 0.2 : Math.max(Math.abs(max) * 0.1, 0.05);
    lo = min - pad; hi = max + pad;
    if (min >= 0 && lo < 0) lo = 0;
    truncated = lo > 0;
    y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * innerH;
    svg.append(svgEl('line', { x1: m.l, x2: w - m.r, y1: y(lo), y2: y(lo), class: 'grid' }));
    svg.append(svgEl('line', { x1: m.l, x2: w - m.r, y1: y(hi), y2: y(hi), class: 'grid grid-faint' }));
    const axisFmt = kind === 'if' ? (v) => v.toFixed(1) : fmt;
    svg.append(text(m.l - 5, y(lo) + 3.5, axisFmt(lo), 'axis-label', 'end'));
    svg.append(text(m.l - 5, y(hi) + 3.5, axisFmt(hi), 'axis-label', 'end'));
  }
  model.years.forEach((yr, i) => svg.append(text(xFor(i, n, m.l, innerW), h - 6, String(yr), 'tick')));

  const crosshair = svgEl('line', { y1: m.t, y2: m.t + innerH, class: 'crosshair', visibility: 'hidden' });
  svg.append(crosshair);

  const ends = [];
  series.forEach((s) => {
    const pts = s.values.map((v, i) => (v == null ? null : { v, i, x: xFor(i, n, m.l, innerW), y: y(v) }));
    for (const run of runs(pts)) {
      if (run.length > 1) svg.append(svgEl('polyline', { points: run.map((p) => `${r1(p.x)},${r1(p.y)}`).join(' '), class: `series-line ${s.cls}` }));
    }
    for (const p of pts) if (p) svg.append(svgEl('circle', { cx: r1(p.x), cy: r1(p.y), r: 4, class: `series-dot ${s.cls}` }));
    const last = [...pts].reverse().find(Boolean);
    if (last) ends.push({ s, x: last.x, y: last.y });
  });

  // Direct labels at each series' last point (name, plus the category on a second line when the
  // same journal appears more than once), nudged apart so they do not overlap.
  ends.sort((a, b) => a.y - b.y);
  const hgt = (e) => (e.s.sub ? 25 : 13);
  let prev = -Infinity, prevH = 0;
  for (const e of ends) { e.ly = Math.max(e.y, prev + prevH); prev = e.ly; prevH = hgt(e); }
  const last = ends[ends.length - 1];
  const overflow = last ? last.ly + hgt(last) - (m.t + innerH + 8) : 0;
  if (overflow > 0) ends.forEach((e) => { e.ly -= overflow; });
  const maxChars = Math.max(10, Math.floor((m.r - 12) / 5.6));
  const clip = (str) => (str.length > maxChars ? str.slice(0, maxChars - 1) + '\u2026' : str);
  for (const e of ends) {
    const t = svgEl('text', { x: r1(e.x + 9), y: r1(e.ly) + 3.5, class: 'end-label', 'text-anchor': 'start' });
    t.append(document.createTextNode(clip(e.s.short || e.s.name)));
    if (e.s.sub) {
      const sub = svgEl('tspan', { x: r1(e.x + 9), dy: 12, class: 'end-sub' });
      sub.textContent = clip(e.s.sub);
      t.append(sub);
    }
    svg.append(t);
  }

  // Readout on hover and with arrow keys: nearest year, every series.
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  wrap.append(tip);
  let idx = -1;
  const show = (i) => {
    idx = i;
    const x = xFor(i, n, m.l, innerW);
    crosshair.setAttribute('x1', x); crosshair.setAttribute('x2', x);
    crosshair.setAttribute('visibility', 'visible');
    tip.replaceChildren();
    const head = document.createElement('div');
    head.className = 'tip-year';
    head.textContent = String(model.years[i]);
    tip.append(head);
    for (const s of series) {
      const row = document.createElement('div');
      row.className = 'tip-row';
      const key = document.createElement('span');
      key.className = `tip-key ${s.cls}`;
      const val = document.createElement('strong');
      val.textContent = s.values[i] == null ? NA : fmt(s.values[i]);
      const nm = document.createElement('span');
      nm.className = 'tip-name';
      nm.textContent = s.name;
      row.append(key, val, nm);
      tip.append(row);
    }
    tip.hidden = false;
    const box = svg.getBoundingClientRect();
    const px = (x / w) * box.width;
    tip.style.left = Math.min(Math.max(px + 10, 0), Math.max(0, box.width - tip.offsetWidth)) + 'px';
    tip.style.top = '0px';
  };
  const hide = () => { idx = -1; crosshair.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  svg.addEventListener('pointermove', (ev) => {
    const box = svg.getBoundingClientRect();
    const vx = ((ev.clientX - box.left) / box.width) * w;
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.abs(xFor(i, n, m.l, innerW) - vx); if (d < bd) { bd = d; best = i; } }
    if (best !== idx) show(best);
  });
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight') { ev.preventDefault(); show(Math.min(n - 1, idx < 0 ? 0 : idx + 1)); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); show(Math.max(0, idx < 0 ? n - 1 : idx - 1)); }
    else if (ev.key === 'Escape') hide();
  });
  return { el: wrap, truncated };
}

