// Components that explain one journal-in-a-category across the years:
// the quartile badge, the year table, the plain-language summary, the hover card and the
// expanded detail panel.
import { h, sr } from './dom.js';
import { positionChart, valueChart } from './charts.js';
import { NA, fmtAis, fmtDelta, fmtIf, fmtRank, fmtTop } from './format.js';
import { changeFor, siblingsOf, topPct } from './model.js';

export function badge(label) {
  return h('span', { class: `badge q-${label}` }, label);
}

/** Cell value or an explicit "not listed" marker (never 0). */
export function naCell() {
  return h('span', { class: 'na', title: 'Not listed this year' }, NA, sr('not listed'));
}

/**
 * One or two sentences describing the change since the previous year.
 * Quartile movement uses bands (D1 counted within Q1); AIS change is shown as a plain difference.
 */
export function trendSentence(model, rec, yi) {
  if (yi === 0) return 'First year in the data, so there is no earlier year to compare with.';
  const prevYear = model.years[yi - 1];
  const year = model.years[yi];
  const ch = changeFor(model, rec, yi);
  if (!ch) return `Not listed in ${year}.`;
  const parts = [];
  if (ch.status === 'new') parts.push(`Not listed in this category in ${prevYear}.`);
  else if (ch.status === 'same') {
    const note = ch.from !== ch.to ? ` (${ch.from} in ${prevYear}, ${ch.to} in ${year})` : '';
    parts.push(`Quartile band unchanged since ${prevYear}: ${ch.to}${note}.`);
  } else {
    parts.push(`Moved ${ch.status} from ${ch.from} to ${ch.to} since ${prevYear}.`);
  }
  const j = model.journals[rec.j];
  if (ch.dAis != null) parts.push(`AIS ${fmtAis(j.ais[yi - 1])} → ${fmtAis(j.ais[yi])} (${fmtDelta(ch.dAis, 3)}).`);
  return parts.join(' ');
}

export const CAUTION = 'Yearly values show how a journal differs between years. With only a few years they are not evidence of a statistical trend.';

/** Values by year. cols: which columns to include. */
export function yearTable(model, rec, yi, { full = true } = {}) {
  const j = model.journals[rec.j];
  const head = ['Year', 'IF', 'AIS'];
  if (full) head.push('Rank', 'Top', 'Quartile');
  return h('table', { class: 'year-table' },
    h('caption', { class: 'sr-only' }, `Values by year for ${j.name} in ${model.categories[rec.c]}`),
    h('thead', {}, h('tr', {}, head.map((t) => h('th', { scope: 'col' }, t)))),
    h('tbody', {}, model.years.map((y, i) => {
      const cell = rec.row[i];
      const now = i === yi;
      return h('tr', { class: now ? 'is-now' : null, 'aria-current': now ? 'true' : null },
        h('th', { scope: 'row' }, String(y)),
        h('td', {}, j.if[i] == null ? naCell() : fmtIf(j.if[i])),
        h('td', {}, j.ais[i] == null ? naCell() : fmtAis(j.ais[i])),
        full && h('td', {}, cell ? fmtRank(cell) : naCell()),
        full && h('td', {}, cell ? fmtTop(topPct(cell)) : naCell()),
        full && h('td', {}, cell ? badge(cell[2]) : naCell()));
    })));
}

/** Compact card shown on row hover or keyboard focus. Everything here is also in the detail panel. */
export function buildHoverCard(model, rec, yi) {
  const j = model.journals[rec.j];
  // Transposed mini table: years across, IF and AIS down.
  const mini = h('table', { class: 'mini-table' },
    h('thead', {}, h('tr', {}, h('td', {}), model.years.map((y, i) => h('th', { scope: 'col', class: i === yi ? 'is-now' : null }, String(y))))),
    h('tbody', {},
      h('tr', {}, h('th', { scope: 'row' }, 'IF'), model.years.map((_, i) => h('td', { class: i === yi ? 'is-now' : null }, j.if[i] == null ? NA : fmtIf(j.if[i])))),
      h('tr', {}, h('th', { scope: 'row' }, 'AIS'), model.years.map((_, i) => h('td', { class: i === yi ? 'is-now' : null }, j.ais[i] == null ? NA : fmtAis(j.ais[i]))))));
  return h('div', { class: 'hc-body' },
    h('p', { class: 'hc-journal' }, j.name),
    h('p', { class: 'hc-cat' }, model.categories[rec.c]),
    h('p', { class: 'hc-title' }, 'Position in category'),
    positionChart(model, rec, yi, { w: 300, h: 108, compact: true }),
    mini,
    h('p', { class: 'hc-sum' }, trendSentence(model, rec, yi)),
    h('p', { class: 'hc-hint' }, 'Click the row for more detail'));
}

/** Expanded panel placed under the row. */
export function buildDetail(model, rec, yi, { onToggleCompare, isSelected, canSelect }) {
  const j = model.journals[rec.j];
  const aisChart = valueChart(model, j.ais, yi, { w: 230, h: 100, fmt: fmtAis, label: 'Article Influence Score' });
  const ifChart = valueChart(model, j.if, yi, { w: 230, h: 100, fmt: fmtIf, axisFmt: (v) => v.toFixed(1), label: 'Impact Factor' });
  const sibs = siblingsOf(model, rec);
  const cmpBtn = h('button', { type: 'button', class: 'btn btn-quiet', onclick: (ev) => { onToggleCompare(rec.id); ev.currentTarget.textContent = isSelected(rec.id) ? 'Remove from comparison' : 'Add to comparison'; } },
    isSelected(rec.id) ? 'Remove from comparison' : 'Add to comparison');
  if (!isSelected(rec.id) && !canSelect()) cmpBtn.disabled = true;

  return h('div', { class: 'detail' },
    h('div', { class: 'detail-head' },
      h('div', {},
        h('h3', { class: 'detail-title' }, j.name),
        h('p', { class: 'detail-cat' }, model.categories[rec.c])),
      cmpBtn),
    h('div', { class: 'detail-grid' },
      h('section', { class: 'detail-col detail-position', 'aria-label': 'Position in category' },
        h('h4', {}, 'Position in category'),
        positionChart(model, rec, yi, { w: 380, h: 170 }),
        h('p', { class: 'chart-note' }, 'Shaded bands are equal quarters of the category, best at the top. Labels are the faculty quartile for each year; D1 (top decile) is used from 2024. Years are never joined across a gap.')),
      h('section', { class: 'detail-col detail-values', 'aria-label': 'Impact Factor and Article Influence Score' },
        h('h4', {}, 'Article Influence Score'),
        aisChart.el,
        h('h4', {}, 'Impact Factor'),
        ifChart.el,
        (aisChart.truncated || ifChart.truncated) && h('p', { class: 'chart-note' }, 'These axes do not start at zero; read the labelled values.')),
      h('section', { class: 'detail-col detail-facts', 'aria-label': 'Values by year' },
        h('h4', {}, 'Values by year'),
        yearTable(model, rec, yi),
        h('p', { class: 'detail-sum' }, trendSentence(model, rec, yi)),
        sibs.length > 0 && h('div', { class: 'siblings' },
          h('h4', {}, `Also ranked in ${sibs.length} other ${sibs.length === 1 ? 'category' : 'categories'}`),
          h('ul', {}, sibs.map((s) => {
            const yk = s.row.map((c, i) => (c ? i : -1)).filter((i) => i >= 0).pop();
            return h('li', {}, h('span', {}, model.categories[s.c]),
              yk != null ? h('span', { class: 'sib-q' }, h('span', { class: 'sub-inline' }, String(model.years[yk])), badge(s.row[yk][2])) : null);
          }))))),
    h('p', { class: 'caution' }, CAUTION));
}
