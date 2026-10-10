// Entry point: loads data, holds the UI state, wires events and re-renders.
import { h, $, $$ } from './dom.js';
import { fmtInt } from './format.js';
import { LABELS, buildModel } from './model.js';
import { DEFAULT_FILTERS, SORT_KEYS, filterRecords, largestChanges, sortRecords, summarise } from './query.js';
import { buildRow, initHoverCard, renderHead, renderPagination, renderRows } from './table.js';
import { renderOverview } from './overview.js';
import { MAX_COMPARE, renderCompare } from './compare.js';

const DATA_URL = 'data/journals.json';
const PAGE_SIZES = [25, 50, 100];

let model = null;
let hover = null;
const state = {
  yi: 0,
  f: { ...DEFAULT_FILTERS, qt: [] },
  sort: { key: 'ais', dir: 'desc' },
  page: 1,
  pageSize: 50,
  selected: [], // record ids chosen for comparison, in order
  expanded: new Set(), // record ids whose detail panel is open
  metric: 'ais', // metric of the "largest changes" lists
};
let filtered = [];
let view = [];
let summary = null;
let lastKey = '';
let yearTotals = [];

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- URL hash: shareable views ---------- */

function writeHash() {
  const p = new URLSearchParams();
  if (state.yi !== model.years.length - 1) p.set('y', model.years[state.yi]);
  const f = state.f;
  if (f.q) p.set('q', f.q);
  if (f.cat) p.set('cat', f.cat);
  if (f.qt.length) p.set('qt', f.qt.join(','));
  if (f.move) p.set('mv', f.move);
  if (f.minAis != null) p.set('ma', f.minAis);
  if (f.minIf != null) p.set('mi', f.minIf);
  if (state.sort.key !== 'ais' || state.sort.dir !== 'desc') p.set('s', `${state.sort.key}-${state.sort.dir}`);
  if (state.page > 1) p.set('p', state.page);
  if (state.pageSize !== 50) p.set('ps', state.pageSize);
  const s = p.toString();
  history.replaceState(null, '', s ? `#${s}` : location.pathname + location.search);
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const yi = model.years.indexOf(Number(p.get('y')));
  state.yi = yi >= 0 ? yi : model.years.length - 1;
  state.f.q = p.get('q') || '';
  state.f.cat = p.get('cat') || '';
  state.f.qt = (p.get('qt') || '').split(',').filter((x) => LABELS.includes(x));
  state.f.move = ['up', 'down', 'same', 'new'].includes(p.get('mv')) ? p.get('mv') : '';
  const num = (v) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  state.f.minAis = num(p.get('ma'));
  state.f.minIf = num(p.get('mi'));
  const [k, d] = (p.get('s') || '').split('-');
  if (SORT_KEYS[k] && (d === 'asc' || d === 'desc')) state.sort = { key: k, dir: d };
  state.page = Math.max(1, parseInt(p.get('p'), 10) || 1);
  const ps = parseInt(p.get('ps'), 10);
  if (PAGE_SIZES.includes(ps)) state.pageSize = ps;
}

/* ---------- compare selection ---------- */

const canSelect = () => state.selected.length < MAX_COMPARE;
const isSelected = (id) => state.selected.includes(id);

function toggleCompare(id) {
  if (isSelected(id)) state.selected = state.selected.filter((x) => x !== id);
  else if (canSelect()) state.selected.push(id);
  syncSelection();
}

function syncSelection() {
  for (const cb of $$('#journal-table input.sel')) {
    const id = +cb.dataset.id;
    cb.checked = isSelected(id);
    cb.disabled = !cb.checked && !canSelect();
    cb.closest('tr').classList.toggle('is-picked', cb.checked);
  }
  renderTray();
}

function renderTray() {
  const tray = $('#tray');
  const n = state.selected.length;
  tray.hidden = n === 0;
  if (!n) return;
  const chips = $('#tray-chips');
  chips.replaceChildren(...state.selected.map((id) => {
    const rec = model.records[id];
    const name = model.journals[rec.j].name;
    return h('li', { class: 'chip' },
      h('span', { class: 'chip-name', title: `${name}, ${model.categories[rec.c]}` }, name),
      h('button', { type: 'button', class: 'chip-x', 'aria-label': `Remove ${name}, ${model.categories[rec.c]} from comparison`, onclick: () => toggleCompare(id) }, '×'));
  }));
  $('#tray-count').textContent = `${n} of ${MAX_COMPARE} selected`;
  const go = $('#tray-go');
  go.disabled = n < 2;
  go.textContent = n < 2 ? 'Select one more to compare' : `Compare ${n}`;
}

function openCompare() {
  const recs = state.selected.map((id) => model.records[id]);
  if (recs.length < 2) return;
  const dlg = $('#compare-dialog');
  if (!dlg.open) dlg.showModal(); // open first so the charts can be sized to the dialog
  renderCompare($('#compare-body'), model, recs, state.yi);
}

/* ---------- expand / collapse a row ---------- */

const ctx = () => ({
  expanded: state.expanded,
  selected: state.selected,
  canSelect,
  detailHandlers: { onToggleCompare: toggleCompare, isSelected, canSelect },
});

function toggleExpand(id) {
  hover?.hide();
  if (state.expanded.has(id)) state.expanded.delete(id);
  else state.expanded.add(id);
  const old = $(`#journal-table tr.row[data-id="${id}"]`);
  if (!old) return;
  const hadFocus = old.contains(document.activeElement);
  const next = old.nextElementSibling;
  if (next?.classList.contains('detail-row')) next.remove();
  const nodes = buildRow(model, model.records[id], state.yi, ctx());
  old.replaceWith(...nodes);
  if (hadFocus) $(`#journal-table tr.row[data-id="${id}"] .rowbtn`)?.focus({ preventScroll: true });
}

/* ---------- main render ---------- */

function activeFilterCount() {
  const f = state.f;
  return (f.q ? 1 : 0) + (f.cat ? 1 : 0) + (f.qt.length ? 1 : 0) + (f.move ? 1 : 0) + (f.minAis != null ? 1 : 0) + (f.minIf != null ? 1 : 0);
}

function recompute() {
  const key = JSON.stringify([state.yi, state.f, state.sort]);
  if (key === lastKey) return;
  lastKey = key;
  filtered = filterRecords(model, state.f, state.yi);
  view = sortRecords(model, filtered, state.sort.key, state.sort.dir, state.yi);
  summary = summarise(model, filtered, state.yi);
}

function syncControls() {
  const f = state.f;
  const prev = state.yi > 0 ? model.years[state.yi - 1] : null;
  $('#f-q').value = f.q;
  $('#f-cat').value = f.cat;
  $('#f-minais').value = f.minAis ?? '';
  $('#f-minif').value = f.minIf ?? '';
  for (const r of $$('input[name=year]')) r.checked = Number(r.value) === model.years[state.yi];
  const hasD1 = yearTotals[state.yi].D1 > 0;
  for (const b of $$('#f-qt button')) {
    const on = f.qt.includes(b.dataset.q);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.disabled = b.dataset.q === 'D1' && !hasD1;
  }
  const mv = $('#f-move');
  mv.disabled = !prev;
  mv.value = f.move;
  mv.options[0].textContent = prev ? `Any change since ${prev}` : 'No earlier year to compare';
  for (const o of $$('#f-move option')) {
    if (o.value === 'new') o.textContent = prev ? `Not listed in ${prev}` : 'Not listed earlier';
  }
  const sel = $('#f-sort');
  for (const o of sel.options) o.disabled = (o.value === 'dais' || o.value === 'dpos') && !prev;
  sel.value = state.sort.key;
  const asc = state.sort.dir === 'asc';
  const dirBtn = $('#f-dir');
  dirBtn.textContent = asc ? '↑ Ascending' : '↓ Descending';
  dirBtn.setAttribute('aria-label', `Sort direction: ${asc ? 'ascending' : 'descending'}. Activate to reverse.`);
  $('#f-reset').disabled = activeFilterCount() === 0;
  $('#f-pagesize').value = String(state.pageSize);
}

function render({ resetPage = false } = {}) {
  if (resetPage) state.page = 1;
  // Fall back gracefully when the chosen year cannot support the current choices.
  if (state.yi === 0) {
    state.f.move = '';
    if (state.sort.key === 'dais' || state.sort.key === 'dpos') state.sort = { key: 'ais', dir: 'desc' };
  }
  if (!yearTotals[state.yi].D1) state.f.qt = state.f.qt.filter((q) => q !== 'D1');
  recompute();
  const pages = Math.max(1, Math.ceil(view.length / state.pageSize));
  state.page = Math.min(state.page, pages);
  const slice = view.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

  syncControls();
  renderHead($('#journal-table thead'), model, state.yi, state.sort);
  renderRows($('#journal-table tbody'), model, slice, state.yi, ctx());
  renderPagination($('#pagination'), state.page, pages, view.length, state.pageSize, (p) => {
    state.page = p;
    render();
    $('#table-top').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  });
  const empty = view.length === 0;
  $('#journal-table').hidden = empty;
  $('#empty').hidden = !empty;

  const total = yearTotals[state.yi].all;
  const year = model.years[state.yi];
  $('#result-count').replaceChildren(
    ...(activeFilterCount()
      ? [h('strong', {}, fmtInt(view.length)), ` of ${fmtInt(total)} records in ${year} match`]
      : [h('strong', {}, fmtInt(total)), ` records in ${year}`]));

  renderOverviewBand();
  renderTray();
  writeHash();
}

function renderOverviewBand() {
  renderOverview($('#overview-grid'), model, summary, state.yi, {
    metric: state.metric,
    movers: largestChanges(model, filtered, state.yi, state.metric),
    onMetric: (m) => { state.metric = m; renderOverviewBand(); $('#ov-h-x')?.closest('section')?.querySelector('select')?.focus(); },
    onPick: (rec, withCat) => {
      state.f.q = model.journals[rec.j].name;
      state.f.cat = withCat ? model.categories[rec.c] : '';
      state.f.qt = []; state.f.move = ''; state.f.minAis = null; state.f.minIf = null;
      render({ resetPage: true });
      $('#table-top').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    },
  });
}

/* ---------- events ---------- */

function bind() {
  $('#f-q').addEventListener('input', (e) => { state.f.q = e.target.value; render({ resetPage: true }); });
  $('#f-cat').addEventListener('input', (e) => { state.f.cat = e.target.value; render({ resetPage: true }); });
  for (const r of $$('input[name=year]')) r.addEventListener('change', () => { state.yi = model.years.indexOf(Number(r.value)); render({ resetPage: true }); });
  $('#f-qt').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-q]');
    if (!b || b.disabled) return;
    const q = b.dataset.q;
    state.f.qt = state.f.qt.includes(q) ? state.f.qt.filter((x) => x !== q) : [...state.f.qt, q];
    render({ resetPage: true });
  });
  $('#f-move').addEventListener('change', (e) => { state.f.move = e.target.value; render({ resetPage: true }); });
  const numInput = (id, key) => $(id).addEventListener('input', (e) => {
    const v = e.target.value.trim();
    state.f[key] = v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null;
    render({ resetPage: true });
  });
  numInput('#f-minais', 'minAis');
  numInput('#f-minif', 'minIf');
  $('#f-sort').addEventListener('change', (e) => { const k = e.target.value; state.sort = { key: k, dir: SORT_KEYS[k].dir }; render({ resetPage: true }); });
  $('#f-dir').addEventListener('click', () => { state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc'; render({ resetPage: true }); });
  $('#f-pagesize').addEventListener('change', (e) => { state.pageSize = Number(e.target.value); render({ resetPage: true }); });
  const reset = () => { state.f = { ...DEFAULT_FILTERS, qt: [] }; render({ resetPage: true }); $('#f-q').focus(); };
  $('#f-reset').addEventListener('click', reset);
  $('#empty-reset').addEventListener('click', reset);
  $('#filters').addEventListener('submit', (e) => e.preventDefault());

  $('#journal-table thead').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sort]');
    if (!b) return;
    const k = b.dataset.sort;
    state.sort = state.sort.key === k
      ? { key: k, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' }
      : { key: k, dir: SORT_KEYS[k].dir };
    render({ resetPage: true });
    $(`#journal-table thead button[data-sort="${k}"]`)?.focus();
  });

  const tbody = $('#journal-table tbody');
  tbody.addEventListener('click', (e) => {
    const row = e.target.closest('tr.row');
    if (!row) return;
    const id = +row.dataset.id;
    if (e.target.matches('input.sel')) { toggleCompare(id); return; }
    if (e.target.closest('a, input, select, textarea')) return;
    toggleExpand(id);
  });

  $('#tray-go').addEventListener('click', openCompare);
  $('#tray-clear').addEventListener('click', () => { state.selected = []; syncSelection(); });
  const dlg = $('#compare-dialog');
  $('#compare-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // click on the backdrop

  hover = initHoverCard(tbody, () => model, () => state.yi, (id) => model.records[id]);
}

/* ---------- boot ---------- */

function buildControls() {
  const list = $('#cat-list');
  list.replaceChildren(...model.categories.map((c) => h('option', { value: c })));
  const years = $('#f-year');
  years.replaceChildren(...model.years.map((y, i) => h('label', { class: 'seg' },
    h('input', { type: 'radio', name: 'year', value: String(y) }),
    h('span', {}, String(y), i === model.years.length - 1 ? h('em', {}, ' latest') : null))));
  const sort = $('#f-sort');
  sort.replaceChildren(...Object.entries(SORT_KEYS).map(([k, v]) => h('option', { value: k }, v.label)));
  $('#f-pagesize').replaceChildren(...PAGE_SIZES.map((n) => h('option', { value: String(n) }, `${n} per page`)));
  $('#data-years').textContent = `${model.years[0]}–${model.years[model.years.length - 1]}`;
  $('#data-meta').textContent = `Built ${model.meta.generated} from ${model.years.map((y) => model.meta.sources[y].file).join(', ')}.`;
  $('#about-dup').textContent = Object.entries(model.meta.duplicate_pairs || {})
    .map(([y, n]) => `The ${y} file lists ${fmtInt(n)} journal and category pairs more than once (identical metrics, consecutive ranks); the best rank is used and these rows are marked with an asterisk.`).join(' ');
}

async function boot() {
  const status = $('#status');
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`${DATA_URL}: HTTP ${res.status}`);
    model = buildModel(await res.json());
  } catch (err) {
    console.error(err);
    status.className = 'status status-error';
    status.replaceChildren(
      h('strong', {}, 'The journal data could not be loaded. '),
      'Check your connection and try again. If you opened this page as a local file, serve the folder with a web server instead (for example python3 -m http.server).',
      ' ', h('button', { type: 'button', class: 'btn', onclick: () => location.reload() }, 'Reload'));
    return;
  }
  yearTotals = model.years.map((_, yi) => {
    const t = { all: 0, D1: 0 };
    for (const r of model.records) { const c = r.row[yi]; if (c) { t.all++; if (c[2] === 'D1') t.D1++; } }
    return t;
  });
  buildControls();
  readHash();
  bind();
  status.hidden = true;
  $('#app').removeAttribute('aria-busy');
  $('#app').hidden = false;
  render();
}

boot();
