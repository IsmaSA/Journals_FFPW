// The journal table: rows, headers, pagination, and the hover card.
import { h, sr, $ } from './dom.js';
import { sparkPosition, describePosition } from './charts.js';
import { NA, fmtAis, fmtDelta, fmtIf, fmtInt, fmtRank, fmtTop } from './format.js';
import { changeFor, topPct } from './model.js';
import { badge, buildDetail, buildHoverCard, naCell } from './detail.js';

const COLS = 9;

/** The "change since previous year" cell: quartile band movement first, AIS difference second. */
function changeCell(model, rec, yi) {
  const td = h('td', { class: 'c-chg', 'data-label': yi > 0 ? `Change since ${model.years[yi - 1]}` : 'Change' });
  if (yi === 0) { td.append(h('span', { class: 'na' }, NA), sr('no earlier year')); return td; }
  const ch = changeFor(model, rec, yi);
  const prevYear = model.years[yi - 1];
  if (!ch) { td.append(naCell()); return td; }
  let main;
  if (ch.status === 'up') main = h('span', { class: 'mv mv-up' }, h('span', { 'aria-hidden': 'true' }, '▲ '), `${ch.from} → ${ch.to}`, sr(`, moved up from ${ch.from} to ${ch.to}`));
  else if (ch.status === 'down') main = h('span', { class: 'mv mv-down' }, h('span', { 'aria-hidden': 'true' }, '▼ '), `${ch.from} → ${ch.to}`, sr(`, moved down from ${ch.from} to ${ch.to}`));
  else if (ch.status === 'same') main = h('span', { class: 'mv mv-same' }, h('span', { 'aria-hidden': 'true' }, '– '), 'Same band', ch.from !== ch.to ? h('span', { class: 'sub-inline' }, ` (${ch.from} → ${ch.to})`) : null);
  else main = h('span', { class: 'mv mv-new' }, `Not listed in ${prevYear}`);
  td.append(main);
  if (ch.dAis != null) td.append(h('span', { class: 'sub' }, `AIS ${fmtDelta(ch.dAis, 3)}`));
  return td;
}

export function buildRow(model, rec, yi, ctx) {
  const j = model.journals[rec.j];
  const cat = model.categories[rec.c];
  const cell = rec.row[yi];
  const top = topPct(cell);
  const expanded = ctx.expanded.has(rec.id);
  const checked = ctx.selected.includes(rec.id);

  const checkbox = h('input', {
    type: 'checkbox', class: 'sel', 'aria-label': `Compare ${j.name}, ${cat}`, dataset: { id: rec.id },
  });
  checkbox.checked = checked;
  checkbox.disabled = !checked && !ctx.canSelect();

  const tr = h('tr', { class: 'row' + (expanded ? ' is-open' : '') + (checked ? ' is-picked' : ''), dataset: { id: rec.id } },
    h('td', { class: 'c-sel' }, checkbox),
    h('td', { class: 'c-journal' },
      h('button', { type: 'button', class: 'rowbtn', 'aria-expanded': expanded ? 'true' : 'false', 'aria-controls': `detail-${rec.id}` },
        h('span', { class: 'chev', 'aria-hidden': 'true' }),
        h('span', { class: 'jname' }, j.name))),
    h('td', { class: 'c-cat', 'data-label': 'Category' }, cat),
    h('td', { class: 'c-num', 'data-label': 'Impact Factor' }, j.if[yi] == null ? naCell() : fmtIf(j.if[yi])),
    h('td', { class: 'c-num', 'data-label': 'AIS' }, j.ais[yi] == null ? naCell() : fmtAis(j.ais[yi])),
    h('td', { class: 'c-rank', 'data-label': 'Rank' },
      h('span', { class: 'rk' }, fmtRank(cell)),
      h('span', { class: 'sub' }, `top ${fmtTop(top)}`)),
    h('td', { class: 'c-q', 'data-label': 'Quartile' }, badge(cell[2]), cell[3] ? h('span', { class: 'dup', title: `The source lists this journal ${cell[3]} times in this category; the best rank is shown.` }, '*', sr(`source lists this journal ${cell[3]} times in this category`)) : null),
    changeCell(model, rec, yi),
    h('td', { class: 'c-trend', 'data-label': 'Trend' },
      sparkPosition(model, rec, yi),
      sr(`Position by year. ${describePosition(model, rec)}`)));
  const frag = [tr];
  if (expanded) frag.push(buildDetailRow(model, rec, yi, ctx));
  return frag;
}

export function buildDetailRow(model, rec, yi, ctx) {
  return h('tr', { class: 'detail-row', id: `detail-${rec.id}`, dataset: { for: rec.id } },
    h('td', { colspan: COLS }, buildDetail(model, rec, yi, ctx.detailHandlers)));
}

export function renderRows(tbody, model, records, yi, ctx) {
  const frag = document.createDocumentFragment();
  for (const rec of records) for (const node of buildRow(model, rec, yi, ctx)) frag.append(node);
  tbody.replaceChildren(frag);
}

/** Table header: labels, units and sort state. */
export function renderHead(thead, model, yi, sort) {
  const year = model.years[yi];
  const prev = yi > 0 ? model.years[yi - 1] : null;
  const col = (key, label, sub, cls) => {
    const active = sort.key === key;
    const dir = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    return h('th', { scope: 'col', class: cls, 'aria-sort': dir },
      h('button', { type: 'button', class: 'thbtn', dataset: { sort: key } },
        h('span', { class: 'th-main' }, label, h('span', { class: 'sort-ind', 'aria-hidden': 'true' }, active ? (sort.dir === 'asc' ? '▲' : '▼') : '')),
        sub ? h('span', { class: 'th-sub' }, sub) : null));
  };
  const plain = (label, sub, cls) => h('th', { scope: 'col', class: cls }, h('span', { class: 'th-main' }, label), sub ? h('span', { class: 'th-sub' }, sub) : null);
  thead.replaceChildren(h('tr', {},
    h('th', { scope: 'col', class: 'c-sel' }, sr('Select for comparison')),
    col('name', 'Journal', null, 'c-journal'),
    col('cat', 'Category', null, 'c-cat'),
    col('if', 'Impact Factor', `${year}`, 'c-num'),
    col('ais', 'AIS', `${year}`, 'c-num'),
    col('pos', 'Rank in category', 'by AIS', 'c-rank'),
    col('quartile', 'Quartile', `${year}`, 'c-q'),
    prev ? col('dpos', `Change since ${prev}`, 'quartile band, AIS', 'c-chg') : plain('Change', 'no earlier year', 'c-chg'),
    plain('Trend', 'position', 'c-trend')));
}

/** Pagination with first/last, a window of pages, and previous/next. */
export function renderPagination(nav, page, pages, total, pageSize, onPage) {
  nav.replaceChildren();
  if (pages <= 1) return;
  const btn = (label, p, { current = false, disabled = false, aria } = {}) =>
    h('button', { type: 'button', class: 'pg' + (current ? ' is-current' : ''), 'aria-current': current ? 'page' : null, 'aria-label': aria, disabled, onclick: () => onPage(p) }, label);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) { set.add(2); set.add(3); }
  if (page >= pages - 2) { set.add(pages - 1); set.add(pages - 2); }
  const list = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  nav.append(btn('Previous', page - 1, { disabled: page === 1, aria: 'Previous page' }));
  let last = 0;
  for (const p of list) {
    if (p - last > 1) nav.append(h('span', { class: 'pg-gap', 'aria-hidden': 'true' }, '…'));
    nav.append(btn(String(p), p, { current: p === page, aria: `Page ${p}` }));
    last = p;
  }
  nav.append(btn('Next', page + 1, { disabled: page === pages, aria: 'Next page' }));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  nav.append(h('span', { class: 'pg-range' }, `${fmtInt(from)}–${fmtInt(to)} of ${fmtInt(total)}`));
}

/**
 * Hover card: appears after a short dwell on a row (mouse) or when a row control has keyboard focus.
 * It never takes pointer events, so it cannot block clicks on rows underneath it.
 * Touch devices skip it and use the tap-to-expand detail instead.
 */
export function initHoverCard(tbody, getModel, getYi, getRecord) {
  const card = $('#hovercard');
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  let timer = null, current = null, describedBy = null;

  const place = (row, x) => {
    const r = row.getBoundingClientRect();
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    let left = Math.min(Math.max(8, (x ?? r.left + 40) + 18), vw - cw - 8);
    let top = r.bottom + 6;
    if (top + ch > vh - 8) top = r.top - ch - 6;
    if (top < 8) top = Math.max(8, vh - ch - 8);
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  };
  const hide = () => {
    clearTimeout(timer); timer = null; current = null;
    card.hidden = true;
    if (describedBy) { describedBy.removeAttribute('aria-describedby'); describedBy = null; }
  };
  const show = (row, x, control) => {
    const rec = getRecord(+row.dataset.id);
    if (!rec || row.classList.contains('is-open')) { hide(); return; }
    current = row;
    card.replaceChildren(buildHoverCard(getModel(), rec, getYi()));
    card.hidden = false;
    place(row, x);
    if (describedBy) describedBy.removeAttribute('aria-describedby');
    describedBy = control;
    if (control) control.setAttribute('aria-describedby', 'hovercard');
  };
  const rowOf = (target) => target.closest?.('tr.row');

  tbody.addEventListener('pointerover', (ev) => {
    if (!canHover.matches || ev.pointerType !== 'mouse') return;
    const row = rowOf(ev.target);
    if (!row) { if (!ev.target.closest?.('tr.detail-row')) hide(); else hide(); return; }
    if (row === current) return;
    clearTimeout(timer);
    const x = ev.clientX;
    const delay = card.hidden ? 220 : 70;
    timer = setTimeout(() => show(row, x, row.querySelector('.rowbtn')), delay);
  });
  tbody.addEventListener('pointerleave', hide);
  tbody.addEventListener('focusin', (ev) => {
    const row = rowOf(ev.target);
    if (row && ev.target.matches('.rowbtn') && ev.target.matches(':focus-visible')) show(row, null, ev.target);
    else hide();
  });
  tbody.addEventListener('focusout', hide);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') hide(); });
  window.addEventListener('scroll', hide, { passive: true });
  return { hide };
}
