// Overview band above the table. Everything here describes the records currently in view.
import { h } from './dom.js';
import { fmtAis, fmtDelta, fmtIf, fmtInt } from './format.js';
import { LABELS } from './model.js';

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

/** Horizontal stacked bar. Segments are separated by a gap; the legend below always carries the numbers. */
function stackedBar(parts, total, ariaLabel) {
  const bar = h('div', { class: 'sbar', role: 'img', 'aria-label': ariaLabel });
  for (const p of parts) {
    if (!p.n) continue;
    bar.append(h('span', { class: `sbar-seg ${p.cls}`, style: `flex: ${p.n} 1 0`, title: `${p.label}: ${fmtInt(p.n)} (${pct(p.n, total)}%)` }));
  }
  return bar;
}
function legend(parts, total) {
  return h('ul', { class: 'legend' }, parts.map((p) => h('li', {},
    h('span', { class: `swatch ${p.cls}`, 'aria-hidden': 'true' }),
    h('span', { class: 'lg-label' }, p.label),
    h('strong', {}, fmtInt(p.n)),
    h('span', { class: 'lg-pct' }, `${pct(p.n, total)}%`))));
}

export function renderOverview(root, model, summary, yi, ui) {
  const year = model.years[yi];
  const prev = yi > 0 ? model.years[yi - 1] : null;
  const { records, journals, categories, quartiles, moves } = summary;

  // 1. Where the records in view stand in the selected year.
  const qParts = LABELS.filter((l) => quartiles[l] > 0).map((l) => ({ label: l, n: quartiles[l], cls: `q-${l}` }));
  const quartileBlock = h('section', { class: 'ov-block', 'aria-labelledby': 'ov-h-q' },
    h('h3', { id: 'ov-h-q' }, `Quartiles in ${year}`),
    h('p', { class: 'ov-lead' }, h('strong', {}, fmtInt(records)), ` records from ${fmtInt(journals)} journals in ${fmtInt(categories)} ${categories === 1 ? 'category' : 'categories'}`),
    records
      ? [stackedBar(qParts, records, 'Quartile labels in ' + year + ': ' + qParts.map((p) => `${p.label} ${p.n}`).join(', ')), legend(qParts, records)]
      : h('p', { class: 'ov-empty' }, 'No records match the current filters.'),
    quartiles.D1 === 0 && records ? h('p', { class: 'ov-note' }, `The D1 label (top decile) is not used in ${year}.`) : null);

  // 2. Movement of the quartile band since the previous year.
  let moveBlock;
  if (!prev) {
    moveBlock = h('section', { class: 'ov-block', 'aria-labelledby': 'ov-h-m' },
      h('h3', { id: 'ov-h-m' }, 'Change since the previous year'),
      h('p', { class: 'ov-empty' }, `${year} is the first year in the data, so there is no earlier year to compare with.`));
  } else {
    const both = moves.up + moves.same + moves.down;
    const mParts = [
      { label: 'Moved up', n: moves.up, cls: 'mv-bg-up' },
      { label: 'Same band', n: moves.same, cls: 'mv-bg-same' },
      { label: 'Moved down', n: moves.down, cls: 'mv-bg-down' },
    ];
    moveBlock = h('section', { class: 'ov-block', 'aria-labelledby': 'ov-h-m' },
      h('h3', { id: 'ov-h-m' }, `Change ${prev} → ${year}`),
      h('p', { class: 'ov-lead' }, h('strong', {}, fmtInt(both)), ` records listed in both years`),
      both
        ? [stackedBar(mParts, both, `Quartile band ${prev} to ${year}: ` + mParts.map((p) => `${p.label} ${p.n}`).join(', ')), legend(mParts, both)]
        : h('p', { class: 'ov-empty' }, 'No records in view are listed in both years.'),
      h('p', { class: 'ov-note' }, `${fmtInt(moves.new)} not listed in ${prev}. Bands are Q1–Q4 with D1 counted in Q1, so 2023 can be compared with later years.`));
  }

  // 3. Largest changes in the chosen metric.
  const metricSel = h('select', { class: 'ov-select', 'aria-label': 'Metric for the largest changes', onchange: (e) => ui.onMetric(e.target.value) },
    [['ais', 'Article Influence Score'], ['if', 'Impact Factor'], ['pos', 'Position in category']].map(([v, t]) => h('option', { value: v, selected: v === ui.metric ? '' : null }, t)));
  const fmtVal = (v) => (ui.metric === 'pos' ? `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)} pts` : ui.metric === 'if' ? fmtDelta(v, 1) : fmtDelta(v, 3));
  const list = (items, kind) => h('ol', { class: 'movers' }, items.length
    ? items.map(({ rec, value }) => h('li', {},
      h('button', { type: 'button', class: 'linklike', title: `Show ${model.journals[rec.j].name} in the table`, onclick: () => ui.onPick(rec, ui.metric === 'pos') },
        model.journals[rec.j].name),
      ui.metric === 'pos' ? h('span', { class: 'mv-cat' }, model.categories[rec.c]) : null,
      h('span', { class: 'mv-val' }, fmtVal(value)),
      h('span', { class: 'mv-now' }, ui.metric === 'ais' ? fmtAis(model.journals[rec.j].ais[yi]) : ui.metric === 'if' ? fmtIf(model.journals[rec.j].if[yi]) : '')))
    : [h('li', { class: 'ov-empty' }, 'None in view')]);
  const moverBlock = h('section', { class: 'ov-block ov-movers', 'aria-labelledby': 'ov-h-x' },
    h('div', { class: 'ov-row' }, h('h3', { id: 'ov-h-x' }, prev ? `Largest changes since ${prev}` : 'Largest changes'), metricSel),
    prev
      ? h('div', { class: 'movers-cols' },
        h('div', {}, h('h4', {}, ui.metric === 'pos' ? 'Moved up in category' : 'Increased'), list(ui.movers.up, 'up')),
        h('div', {}, h('h4', {}, ui.metric === 'pos' ? 'Moved down in category' : 'Decreased'), list(ui.movers.down, 'down')))
      : h('p', { class: 'ov-empty' }, 'No earlier year to compare with.'),
    prev ? h('p', { class: 'ov-note' }, ui.metric === 'pos'
      ? 'Change in the share of the category ranked above the journal, in percentage points. Only records listed in both years.'
      : `Journal-level value, one entry per journal in view. The figure shown is the change; the value in ${year} is in the table.`) : null);

  root.replaceChildren(quartileBlock, moveBlock, moverBlock);
}
