// Data model: turns data/journals.json into records and derives year-to-year changes.
// Pure functions, no DOM, so they can be tested in Node.
import { normalize } from './format.js';

/** Quartile labels in order of standing, best first. D1 = top decile label (2024 onward). */
export const LABELS = ['D1', 'Q1', 'Q2', 'Q3', 'Q4'];
export const LABEL_ORDER = { D1: 0, Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
/** Quartile band used for change-over-time: D1 is counted within Q1 so 2023 (no D1) compares with later years. */
export const BAND = { D1: 1, Q1: 1, Q2: 2, Q3: 3, Q4: 4 };

/**
 * @typedef {Object} Record  One journal in one category, with its value for every year.
 * @property {number} id
 * @property {number} j   index into model.journals
 * @property {number} c   index into model.categories
 * @property {Array<Array|null>} row  per year: [rank, categorySize, label, duplicateCount?] or null
 */

export function buildModel(raw) {
  const journals = raw.journals.map((j, id) => ({
    id,
    name: j.n,
    if: j.if,
    ais: j.ais,
    search: normalize(j.n),
  }));
  const records = [];
  raw.journals.forEach((j, ji) => {
    for (const [ci, row] of j.c) records.push({ id: records.length, j: ji, c: ci, row });
  });
  const categories = raw.categories;
  return {
    meta: raw.meta,
    years: raw.years,
    categories,
    categorySearch: categories.map(normalize),
    journals,
    records,
    _derived: new Map(),
  };
}

/** Position within the category as "top x %": rank / category size. Lower is better. */
export function topPct(cell) {
  return cell ? (cell[0] / cell[1]) * 100 : null;
}

export function cellAt(rec, yi) {
  return rec.row[yi] ?? null;
}

/**
 * Change between year yi and the year immediately before it in the data.
 * status: 'up' | 'down' | 'same' (quartile band moved higher / lower / unchanged),
 *         'new' (listed in yi but not in yi-1), or null (no earlier year, or not listed in yi).
 * Years are never skipped: a record missing in yi-1 is "new" even if it was listed earlier.
 */
export function changeFor(model, rec, yi) {
  if (yi <= 0) return null;
  const cur = rec.row[yi];
  if (!cur) return null;
  const prev = rec.row[yi - 1];
  const j = model.journals[rec.j];
  const dAis = j.ais[yi] != null && j.ais[yi - 1] != null ? j.ais[yi] - j.ais[yi - 1] : null;
  const dIf = j.if[yi] != null && j.if[yi - 1] != null ? j.if[yi] - j.if[yi - 1] : null;
  if (!prev) return { status: 'new', dAis, dIf, dPos: null, from: null, to: cur[2] };
  const bFrom = BAND[prev[2]];
  const bTo = BAND[cur[2]];
  return {
    status: bTo < bFrom ? 'up' : bTo > bFrom ? 'down' : 'same',
    dAis,
    dIf,
    dPos: topPct(cur) - topPct(prev), // percentage points; negative = moved up
    from: prev[2],
    to: cur[2],
  };
}

/** Per-year arrays of derived values, computed once and cached. Index = record id. */
export function derivedFor(model, yi) {
  let d = model._derived.get(yi);
  if (d) return d;
  const n = model.records.length;
  d = {
    status: new Array(n).fill(null),
    dAis: new Float64Array(n).fill(NaN),
    dIf: new Float64Array(n).fill(NaN),
    dPos: new Float64Array(n).fill(NaN),
  };
  for (const rec of model.records) {
    const ch = changeFor(model, rec, yi);
    if (!ch) continue;
    d.status[rec.id] = ch.status;
    if (ch.dAis != null) d.dAis[rec.id] = ch.dAis;
    if (ch.dIf != null) d.dIf[rec.id] = ch.dIf;
    if (ch.dPos != null) d.dPos[rec.id] = ch.dPos;
  }
  model._derived.set(yi, d);
  return d;
}

/** The other categories the same journal is ranked in (any year). */
export function siblingsOf(model, rec) {
  return model.records.filter((r) => r.j === rec.j && r.id !== rec.id);
}

/** Records grouped by journal, built lazily. */
export function recordsByJournal(model) {
  if (!model._byJournal) {
    model._byJournal = new Map();
    for (const r of model.records) {
      if (!model._byJournal.has(r.j)) model._byJournal.set(r.j, []);
      model._byJournal.get(r.j).push(r);
    }
  }
  return model._byJournal;
}
