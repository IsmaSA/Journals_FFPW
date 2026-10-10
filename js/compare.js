// Side-by-side comparison of up to four records (a journal in a category).
import { h, sr } from './dom.js';
import { compareChart } from './charts.js';
import { NA, fmtAis, fmtIf, fmtRank, fmtTop } from './format.js';
import { topPct } from './model.js';
import { badge } from './detail.js';

export const MAX_COMPARE = 4;

export function renderCompare(root, model, records, yi) {
  const info = records.map((r) => {
    const name = model.journals[r.j].name;
    const clash = records.filter((o) => model.journals[o.j].name === name).length > 1;
    return { full: clash ? `${name} (${model.categories[r.c]})` : name, short: name, sub: clash ? model.categories[r.c] : null };
  });
  // Size the charts to the space available so labels stay legible (no scaled-down text).
  const avail = root.clientWidth || 900;
  const chartW = Math.round(Math.min(560, Math.max(300, avail >= 940 ? (avail - 24) / 2 : avail)));
  const series = (pick) => records.map((r, i) => ({ name: info[i].full, short: info[i].short, sub: info[i].sub, cls: `s${i + 1}`, values: model.years.map((_, k) => pick(r, k)) }));
  const opts = { w: chartW, h: 200 };
  const ais = compareChart(model, series((r, k) => model.journals[r.j].ais[k]), 'ais', opts);
  const imp = compareChart(model, series((r, k) => model.journals[r.j].if[k]), 'if', opts);
  const pos = compareChart(model, series((r, k) => topPct(r.row[k])), 'pos', opts);

  const categories = [...new Set(records.map((r) => model.categories[r.c]))];
  const mixed = categories.length > 1;

  const fig = (title, chart, note) => h('figure', { class: 'cmp-fig' },
    h('figcaption', {}, title),
    chart.el,
    note || (chart.truncated ? h('p', { class: 'chart-note' }, 'Axis does not start at zero; read the labelled values in the table.') : null));

  const cell = (v) => (v == null ? h('span', { class: 'na' }, NA, sr('not listed')) : v);
  const rows = [];
  records.forEach((r, i) => {
    const j = model.journals[r.j];
    const metric = (label, fn) => h('tr', {},
      label === 'IF' ? h('th', { scope: 'rowgroup', rowspan: '4', class: 'cmp-name' },
        h('span', { class: `key s${i + 1}`, 'aria-hidden': 'true' }), j.name, h('span', { class: 'cmp-cat' }, model.categories[r.c])) : null,
      h('th', { scope: 'row', class: 'cmp-metric' }, label),
      model.years.map((_, k) => h('td', { class: k === yi ? 'is-now' : null }, cell(fn(k)))));
    rows.push(
      metric('IF', (k) => (j.if[k] == null ? null : fmtIf(j.if[k]))),
      metric('AIS', (k) => (j.ais[k] == null ? null : fmtAis(j.ais[k]))),
      metric('Rank', (k) => (r.row[k] ? `${fmtRank(r.row[k])} · top ${fmtTop(topPct(r.row[k]))}` : null)),
      metric('Quartile', (k) => (r.row[k] ? badge(r.row[k][2]) : null)));
  });

  root.replaceChildren(
    h('p', { class: 'cmp-intro' },
      'Impact Factor and Article Influence Score are journal-level values. Position and quartile are within each record’s own category. ',
      mixed ? h('strong', {}, 'These records are in different categories, so position compares standing within each category’s own ranking, not across fields.') : `All records are in ${categories[0]}.`),
    h('div', { class: 'cmp-grid' },
      fig('Article Influence Score', ais),
      fig('Impact Factor', imp),
      fig('Position in category (top %, lower is better)', pos, h('p', { class: 'chart-note' }, 'Shaded bands are equal quarters of each category.')),
      h('div', { class: 'cmp-key' },
        h('h4', {}, 'Key'),
        h('ul', { class: 'legend', 'aria-label': 'Series' }, records.map((r, i) => h('li', {},
          h('span', { class: `key s${i + 1}`, 'aria-hidden': 'true' }),
          h('span', { class: 'lg-label' }, model.journals[r.j].name),
          h('span', { class: 'lg-pct' }, model.categories[r.c])))),
        h('p', { class: 'chart-note' }, 'Hover a chart, or focus it and use the arrow keys, to read the values for a year. Lines are not drawn across a year in which a journal is not listed.'))),
    h('table', { class: 'cmp-table' },
      h('caption', { class: 'sr-only' }, 'Values by year for each compared record'),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Journal'), h('th', { scope: 'col' }, 'Metric'),
        model.years.map((y, k) => h('th', { scope: 'col', class: k === yi ? 'is-now' : null }, String(y))))),
      h('tbody', {}, rows)),
    h('p', { class: 'caution' }, 'Yearly values show how journals differ between years. With only a few years they are not evidence of a statistical trend.'));
}
