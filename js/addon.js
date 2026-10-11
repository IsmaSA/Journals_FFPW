// Adds three things to the original table without changing it:
//  1. a "Trend position" sparkline in each row,
//  2. a hover card with the 2023-2025 values of the journal in that category,
//  3. a detail panel with the charts and yearly metrics when a row is clicked.
// Data comes from data/journals.json (all years); the original table still reads datos.json.
import { h } from './dom.js';
import { buildModel, changeFor } from './model.js';
import { sparkPosition, positionChart, valueChart } from './charts.js';
import { buildHoverCard, yearTable, trendSentence } from './detail.js';
import { fmtAis, fmtIf } from './format.js';

const tbody = document.querySelector('#tabla-datos tbody');
const colCount = document.querySelectorAll('#tabla-datos thead th').length;
let model = null, yi = 0, byKey = new Map();

const keyOf = (name, cat) => `${name}\u0001${cat}`;
const recFor = (row) => {
  const c = row.cells;
  return model && c.length > 3 ? byKey.get(keyOf(c[1].textContent, c[3].textContent)) : null;
};

/* ---------- 1. sparkline in each row ---------- */
function enhance(row) {
  if (row.dataset.enh) return;
  const rec = recFor(row);
  const cell = row.querySelector('.trend-cell');
  if (!cell) return;
  row.dataset.enh = '1';
  row.tabIndex = 0;
  row.setAttribute('aria-expanded', 'false');
  if (rec) {
    cell.replaceChildren(sparkPosition(model, rec, yi, { w: 60, h: 22 }));
    cell.title = 'Position in category, 2023 to 2025 (higher is better)';
  } else {
    cell.textContent = '—';
  }
}
const enhanceAll = () => tbody.querySelectorAll('tr.data-row').forEach(enhance);

/* ---------- 2. hover card (mouse only) ---------- */
const card = h('div', { id: 'hovercard', class: 'hovercard', role: 'tooltip', hidden: true });
document.body.append(card);
let timer = null, shownFor = null;
const hide = () => { clearTimeout(timer); timer = null; shownFor = null; card.hidden = true; };
function show(row, x) {
  const rec = recFor(row);
  if (!rec || row.classList.contains('is-open')) return hide();
  shownFor = row;
  card.replaceChildren(buildHoverCard(model, rec, yi));
  card.hidden = false;
  const r = row.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const left = Math.min(Math.max(8, x + 18), vw - card.offsetWidth - 8);
  let top = r.bottom + 6;
  if (top + card.offsetHeight > vh - 8) top = r.top - card.offsetHeight - 6;
  card.style.left = `${Math.round(left)}px`;
  card.style.top = `${Math.round(Math.max(8, top))}px`;
}
tbody.addEventListener('pointerover', (ev) => {
  if (ev.pointerType !== 'mouse') return;
  const row = ev.target.closest('tr.data-row');
  if (!row) return hide();
  if (row === shownFor) return;
  clearTimeout(timer);
  const x = ev.clientX;
  timer = setTimeout(() => show(row, x), card.hidden ? 220 : 70);
});
tbody.addEventListener('pointerleave', hide);
window.addEventListener('scroll', hide, { passive: true });
tbody.addEventListener('focusin', (ev) => { const row = ev.target.closest?.('tr.data-row'); if (row && ev.target === row) show(row, row.getBoundingClientRect().left + 40); });
tbody.addEventListener('focusout', hide);

/* ---------- 3. detail panel on click ---------- */
function closeDetails() {
  tbody.querySelectorAll('tr.detail-row, tr.detail-spacer').forEach((r) => r.remove());
  tbody.querySelectorAll('tr.is-open').forEach((r) => { r.classList.remove('is-open'); r.setAttribute('aria-expanded', 'false'); });
}
function buildPanel(rec) {
  const j = model.journals[rec.j];
  const aisChart = valueChart(model, j.ais, yi, { w: 230, h: 100, fmt: fmtAis, label: 'Article Influence Score' });
  const ifChart = valueChart(model, j.if, yi, { w: 230, h: 100, fmt: fmtIf, axisFmt: (v) => v.toFixed(1), label: 'Impact Factor' });
  return h('div', { class: 'detail' },
    h('h3', { class: 'detail-title' }, j.name),
    h('p', { class: 'detail-cat' }, model.categories[rec.c]),
    h('div', { class: 'detail-grid' },
      h('section', { class: 'detail-col', 'aria-label': 'Position in category' },
        h('h4', {}, 'Trend position in category'),
        positionChart(model, rec, yi, { w: 380, h: 170 })),
      h('section', { class: 'detail-col detail-values', 'aria-label': 'Impact Factor and Article Influence Score' },
        h('h4', {}, 'Article Influence Score'), aisChart.el,
        h('h4', {}, 'Impact Factor'), ifChart.el),
      h('section', { class: 'detail-col', 'aria-label': 'Values by year' },
        h('h4', {}, 'Values by year'),
        yearTable(model, rec, yi),
        h('p', { class: 'detail-sum' }, trendSentence(model, rec, yi)))));
}
function toggleDetail(row) {
  const wasOpen = row.classList.contains('is-open');
  closeDetails();
  if (wasOpen) return;
  const rec = recFor(row);
  if (!rec) return;
  hide();
  row.classList.add('is-open');
  row.setAttribute('aria-expanded', 'true');
  const detail = h('tr', { class: 'detail-row' }, h('td', { colspan: String(colCount) }, buildPanel(rec)));
  // The hidden spacer keeps the original odd/even row striping unchanged.
  row.after(detail, h('tr', { class: 'detail-spacer', 'aria-hidden': 'true' }));
}
tbody.addEventListener('click', (ev) => {
  if (ev.target.closest('input, button, a')) return;
  const row = ev.target.closest('tr.data-row');
  if (row) toggleDetail(row);
});
tbody.addEventListener('keydown', (ev) => {
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('tr.data-row')) { ev.preventDefault(); toggleDetail(ev.target); }
  if (ev.key === 'Escape') closeDetails();
});

/* ---------- start ---------- */
fetch('data/journals.json')
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((raw) => {
    model = buildModel(raw);
    yi = model.years.length - 1; // the table shows the latest year
    for (const r of model.records) byKey.set(keyOf(model.journals[r.j].name, model.categories[r.c]), r);
    enhanceAll();
    new MutationObserver(enhanceAll).observe(tbody, { childList: true });
  })
  .catch((e) => console.error('Trend data could not be loaded:', e));
