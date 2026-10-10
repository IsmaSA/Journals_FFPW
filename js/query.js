// Filtering and sorting. Pure functions, no DOM.
import { normalize } from './format.js';
import { LABEL_ORDER, derivedFor, topPct } from './model.js';

export const DEFAULT_FILTERS = {
  q: '', // journal name search
  cat: '', // category text (exact name, or part of a name)
  qt: [], // quartile labels to keep (empty = all)
  move: '', // '' | 'up' | 'down' | 'same' | 'new'
  minAis: null,
  minIf: null,
};

/** Default sort direction per key. */
export const SORT_KEYS = {
  ais: { label: 'Article Influence Score', dir: 'desc' },
  if: { label: 'Impact Factor', dir: 'desc' },
  pos: { label: 'Position in category', dir: 'asc' },
  quartile: { label: 'Quartile', dir: 'asc' },
  name: { label: 'Journal name', dir: 'asc' },
  cat: { label: 'Category', dir: 'asc' },
  dais: { label: 'Change in AIS', dir: 'desc' },
  dpos: { label: 'Change in position', dir: 'asc' },
};

/** Records listed in year yi that satisfy the filters. Returns an array of records. */
export function filterRecords(model, f, yi) {
  const tokens = normalize(f.q).split(' ').filter(Boolean);
  const catText = normalize(f.cat);
  const exactCat = catText ? model.categorySearch.indexOf(catText) : -1;
  const qt = f.qt.length ? new Set(f.qt) : null;
  const d = f.move ? derivedFor(model, yi) : null;
  const out = [];
  for (const rec of model.records) {
    const cell = rec.row[yi];
    if (!cell) continue;
    if (qt && !qt.has(cell[2])) continue;
    if (catText) {
      if (exactCat >= 0 ? rec.c !== exactCat : !model.categorySearch[rec.c].includes(catText)) continue;
    }
    const j = model.journals[rec.j];
    if (tokens.length && !tokens.every((t) => j.search.includes(t))) continue;
    if (f.minAis != null && !(j.ais[yi] != null && j.ais[yi] >= f.minAis)) continue;
    if (f.minIf != null && !(j.if[yi] != null && j.if[yi] >= f.minIf)) continue;
    if (d && d.status[rec.id] !== f.move) continue;
    out.push(rec);
  }
  return out;
}

function valueGetter(model, key, yi) {
  const d = key === 'dais' || key === 'dpos' ? derivedFor(model, yi) : null;
  switch (key) {
    case 'ais': return (r) => model.journals[r.j].ais[yi];
    case 'if': return (r) => model.journals[r.j].if[yi];
    case 'pos': return (r) => topPct(r.row[yi]);
    case 'quartile': return (r) => LABEL_ORDER[r.row[yi][2]] * 1000 + topPct(r.row[yi]);
    case 'name': return (r) => model.journals[r.j].name;
    case 'cat': return (r) => model.categories[r.c];
    case 'dais': return (r) => (Number.isNaN(d.dAis[r.id]) ? null : d.dAis[r.id]);
    case 'dpos': return (r) => (Number.isNaN(d.dPos[r.id]) ? null : d.dPos[r.id]);
    default: throw new Error('Unknown sort key: ' + key);
  }
}

/** Sorts a copy. Missing values always go last. Ties fall back to journal name, then category. */
export function sortRecords(model, records, key, dir, yi) {
  const get = valueGetter(model, key, yi);
  const sign = dir === 'desc' ? -1 : 1;
  const keyed = records.map((r) => ({ r, v: get(r) }));
  keyed.sort((a, b) => {
    const am = a.v == null, bm = b.v == null;
    if (am !== bm) return am ? 1 : -1;
    if (!am && a.v !== b.v) {
      const c = typeof a.v === 'string' ? a.v.localeCompare(b.v, 'en') : a.v - b.v;
      if (c !== 0) return c * sign;
    }
    const an = model.journals[a.r.j].name, bn = model.journals[b.r.j].name;
    if (an !== bn) return an < bn ? -1 : 1;
    return model.categories[a.r.c] < model.categories[b.r.c] ? -1 : 1;
  });
  return keyed.map((k) => k.r);
}

/** Summary used by the overview band. */
export function summarise(model, records, yi) {
  const journals = new Set();
  const cats = new Set();
  const quartiles = { D1: 0, Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  const moves = { up: 0, same: 0, down: 0, new: 0 };
  const d = yi > 0 ? derivedFor(model, yi) : null;
  for (const r of records) {
    journals.add(r.j);
    cats.add(r.c);
    quartiles[r.row[yi][2]]++;
    if (d && d.status[r.id]) moves[d.status[r.id]]++;
  }
  return { records: records.length, journals: journals.size, categories: cats.size, quartiles, moves };
}

/**
 * Largest changes between year yi-1 and yi within the records in view.
 * metric: 'ais' | 'if' (journal-level, one entry per journal) or 'pos' (journal x category,
 * change in top-% points; negative = moved up).
 * Returns { up: [...], down: [...] }, each entry { rec, value }. "up" = value increased
 * (for 'pos': improved standing, i.e. the share went down).
 */
export function largestChanges(model, records, yi, metric, n = 5) {
  if (yi <= 0) return { up: [], down: [] };
  const d = derivedFor(model, yi);
  const arr = metric === 'if' ? d.dIf : metric === 'ais' ? d.dAis : d.dPos;
  let items = [];
  if (metric === 'pos') {
    for (const r of records) if (!Number.isNaN(arr[r.id])) items.push({ rec: r, value: arr[r.id] });
  } else {
    const seen = new Set();
    for (const r of records) {
      if (seen.has(r.j) || Number.isNaN(arr[r.id])) continue;
      seen.add(r.j);
      items.push({ rec: r, value: arr[r.id] });
    }
  }
  const byName = (a, b) => model.journals[a.rec.j].name.localeCompare(model.journals[b.rec.j].name);
  if (metric === 'pos') {
    const improved = items.filter((i) => i.value < 0).sort((a, b) => a.value - b.value || byName(a, b));
    const worsened = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value || byName(a, b));
    return { up: improved.slice(0, n), down: worsened.slice(0, n) };
  }
  const up = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value || byName(a, b));
  const down = items.filter((i) => i.value < 0).sort((a, b) => a.value - b.value || byName(a, b));
  return { up: up.slice(0, n), down: down.slice(0, n) };
}
