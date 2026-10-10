// Run with: node --test tests/unit.test.mjs   (Node >= 18, no dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel, changeFor, topPct, BAND } from '../js/model.js';
import { filterRecords, sortRecords, summarise, largestChanges, DEFAULT_FILTERS } from '../js/query.js';
import { fmtIf, fmtAis, fmtDelta, fmtTop, normalize } from '../js/format.js';

// Small hand-made fixture: row cells are [rank, categorySize, label].
const raw = {
  meta: {}, years: [2023, 2024, 2025], categories: ['ECOLOGY', 'ZOOLOGY'],
  journals: [
    { n: 'ALPHA', if: [1.0, 2.0, 3.0], ais: [0.5, 0.6, 0.9], c: [[0, [[10, 100, 'Q1'], [5, 100, 'D1'], [20, 100, 'Q1']]]] },
    { n: 'BETA & CO', if: [null, 1.0, 1.0], ais: [null, 0.1, 0.0], c: [[0, [null, [90, 100, 'Q4'], [10, 100, 'Q1']]], [1, [null, null, [50, 50, 'Q4']]]] },
    { n: 'GAMMA', if: [2.0, 2.0, null], ais: [0.2, 0.2, null], c: [[1, [[1, 4, 'Q1'], [2, 4, 'Q2'], null]]] },
  ],
};
const m = buildModel(raw);
const rec = (name, cat) => m.records.find((r) => m.journals[r.j].name === name && m.categories[r.c] === cat);

test('topPct is rank/size in percent', () => assert.equal(topPct([5, 100, 'D1']), 5));

test('changeFor: D1 counted in Q1, so Q1->D1 is the same band', () => {
  const c = changeFor(m, rec('ALPHA', 'ECOLOGY'), 1);
  assert.equal(c.status, 'same'); assert.equal(c.from, 'Q1'); assert.equal(c.to, 'D1');
  assert.ok(Math.abs(c.dAis - 0.1) < 1e-12);
});
test('changeFor: up, down, new, not listed, first year', () => {
  assert.equal(changeFor(m, rec('BETA & CO', 'ECOLOGY'), 2).status, 'up');
  assert.equal(changeFor(m, rec('GAMMA', 'ZOOLOGY'), 1).status, 'down');
  assert.equal(changeFor(m, rec('BETA & CO', 'ZOOLOGY'), 2).status, 'new');
  assert.equal(changeFor(m, rec('GAMMA', 'ZOOLOGY'), 2), null);
  assert.equal(changeFor(m, rec('ALPHA', 'ECOLOGY'), 0), null);
});
test('a zero AIS is a value, not missing', () => {
  const c = changeFor(m, rec('BETA & CO', 'ECOLOGY'), 2);
  assert.ok(Math.abs(c.dAis - -0.1) < 1e-12);
});

test('filter: only records listed in the chosen year', () => {
  assert.equal(filterRecords(m, DEFAULT_FILTERS, 2).length, 3);
  assert.equal(filterRecords(m, DEFAULT_FILTERS, 0).length, 2);
});
test('filter: search treats & as and, quartile, category, min AIS, movement', () => {
  assert.equal(filterRecords(m, { ...DEFAULT_FILTERS, q: 'beta and co' }, 2).length, 2);
  assert.equal(filterRecords(m, { ...DEFAULT_FILTERS, qt: ['Q4'] }, 2).length, 1);
  assert.equal(filterRecords(m, { ...DEFAULT_FILTERS, cat: 'zool' }, 2).length, 1);
  assert.equal(filterRecords(m, { ...DEFAULT_FILTERS, minAis: 0.5 }, 2).length, 1);
  assert.equal(filterRecords(m, { ...DEFAULT_FILTERS, move: 'new' }, 2).length, 1);
});
test('sort: nulls last in both directions, deterministic ties', () => {
  const all = filterRecords(m, DEFAULT_FILTERS, 1);
  for (const dir of ['asc', 'desc']) {
    const s = sortRecords(m, all, 'dais', dir, 1);
    assert.equal(s.length, all.length);
  }
  const s = sortRecords(m, filterRecords(m, DEFAULT_FILTERS, 2), 'dais', 'desc', 2);
  assert.equal(m.journals[s[0].j].name, 'ALPHA');            // +0.3 is the largest
  assert.equal(m.categories[s.at(-1).c], 'ZOOLOGY');          // "new" record has no change -> last
});
test('summarise counts quartiles and moves', () => {
  const s = summarise(m, filterRecords(m, DEFAULT_FILTERS, 2), 2);
  assert.equal(s.records, 3); assert.equal(s.journals, 2); assert.equal(s.quartiles.Q1, 2); assert.equal(s.moves.new, 1); assert.equal(s.moves.up, 1);
});
test('largestChanges: AIS is one entry per journal', () => {
  const l = largestChanges(m, filterRecords(m, DEFAULT_FILTERS, 2), 2, 'ais');
  assert.equal(m.journals[l.up[0].rec.j].name, 'ALPHA');
  assert.equal(m.journals[l.down[0].rec.j].name, 'BETA & CO');
});

test('formatting', () => {
  assert.equal(fmtIf(17.1), '17.1'); assert.equal(fmtIf(1.25), '1.25'); assert.equal(fmtAis(0), '0.000');
  assert.equal(fmtDelta(-0.0004, 3), '0.000'); assert.equal(fmtDelta(0.1234, 3), '+0.123'); assert.equal(fmtDelta(-2, 1), '−2.0');
  assert.equal(fmtTop(0.55), '0.6%'); assert.equal(fmtTop(36.4), '36%'); assert.equal(normalize('Ecology & Évolution'), 'ecology and evolution');
  assert.deepEqual(BAND, { D1: 1, Q1: 1, Q2: 2, Q3: 3, Q4: 4 });
});

test('real data: structural invariants of data/journals.json', () => {
  const real = buildModel(JSON.parse(readFileSync(new URL('../data/journals.json', import.meta.url))));
  assert.deepEqual(real.years, [2023, 2024, 2025]);
  assert.equal(filterRecords(real, DEFAULT_FILTERS, 2).length, 14814);
  for (const r of real.records) for (const c of r.row) if (c) { assert.ok(c[0] >= 1 && c[0] <= c[1]); assert.ok(['D1','Q1','Q2','Q3','Q4'].includes(c[2])); }
  const ca = real.records.find((r) => real.journals[r.j].name === 'CA-A CANCER JOURNAL FOR CLINICIANS');
  assert.deepEqual(ca.row.map((c) => c.slice(0, 2)), [[1, 242], [1, 241], [1, 239]]);
  assert.deepEqual(real.journals[ca.j].ais, [80.147, 94.116, 108.634]);
});
