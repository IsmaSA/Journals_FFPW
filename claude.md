# claude.md – project guide

Static GitHub Pages site for the Faculty of Fisheries and Protection of Waters (FFPW). Shows journal metrics for 2023–2025. Stay static: no backend, no bundler, no runtime dependencies.

## Architecture
- `index.html` – shell. `css/style.css` – tokens (light + dark via `prefers-color-scheme`), layout, breakpoints 1100px / 920px (below 920px the table becomes stacked cards).
- `data/journals.json` – generated; never edit by hand. `scripts/build_data.py` builds it from `Tonda.JCI_<year>.xlsx`; `scripts/verify_data.py` re-checks it independently.
- `js/` (ES modules, no globals): `format.js` formatting · `model.js` records + change logic · `query.js` filter/sort/summary (pure, tested) · `dom.js` helpers (no innerHTML with data) · `charts.js` SVG charts · `detail.js` hover card + expanded panel · `table.js` rows/head/pagination/hover · `overview.js` · `compare.js` · `main.js` state, URL-hash sync, render loop.
- `tests/unit.test.mjs` – `node --test tests/unit.test.mjs`.
- Paths are relative so the site works under `/Journals_FFPW/`. `error.html` is self-contained (GitHub Pages serves it at any depth).

## Data semantics
Columns: journal_name, year, subject_area_name, Impact.Factor, Article.Influence, Ranking ("rank / category size"), Faculty_Quartiles, edition (all SCIE). The only evidence of provenance is the sheet name "JCR metrics" and the SCIE edition; do not state more.
- IF and AIS are journal-level (same in every category). Rank and quartile are per journal × category.
- Rank follows AIS (checked: no monotonicity violations), not IF.
- Quartile labels are the faculty's own. D1 (about top 10%) exists only in 2024 and 2025; 2023 has Q1–Q4.
- 178 categories, same in all years. Category sizes change between years, so raw rank is not comparable across years; **top % = rank / size** is.
- Missing ≠ 0. A journal not listed in a year shows "—". A true 0 (e.g. AIS 0.000) is shown as 0.
- The 2023 xlsx has a broken declared dimension: read with openpyxl `read_only=True` and `ws.reset_dimensions()`.

## Derived metrics
- **Position** = rank / category size × 100 (lower is better; chart axis fixed 0–100%, best at top).
- **Quartile band for change** = Q1–Q4 with D1 counted in Q1 (all D1 rows are Q1 by ceil(4·rank/size)). Change = up / down / same band; "new" if not listed in the previous year. Years are never skipped.
- **ΔAIS, ΔIF** = plain differences with the previous year; Δposition in percentage points.
- **2024 duplicates**: 204 (journal, category) groups appear 2–3 times with identical metrics and consecutive ranks and inflated totals. Rule: keep the best rank, flag the cell (4th element).
- Names are linked across years by a loose key ("&"/"AND", hyphens). 2024 names were mixed case; names are shown upper case as in the source.

## Design principles
- Real data only. No statistical trend claims: three years are not a trend; the UI says so near every year chart.
- Never colour alone: improved/declined use teal/ochre **plus** arrows and words; quartiles use an ordinal teal scale plus text labels. IF/AIS changes are neutral.
- Hover card is mouse-only (220 ms dwell) and mirrors the expanded panel; keyboard focus and tap open the same content inline.
- Compare series colours were validated with the dataviz palette validator (light and dark); end labels and a table view cover the aqua contrast warning.
- Memorable element: the "position in category" chart (path through quartile bands).
- State lives in the URL hash (shareable).

## Known limitations
- No ISSN in the data: renamed journals are not linked across years.
- Names are upper case; title-casing heuristics were judged too error-prone.
- Source provenance beyond the sheet name is unknown; confirm before publishing claims about the source.
- Compare view: identical series overlap (hidden line); read the table.
- `datos.json` and `root/` are unused duplicates from the old site.

## Possible next steps
CSV export of the current view; a canonical journal title file (with ISSN) to link renamed journals and fix capitalisation; more years; browser-based e2e tests in the repo (Playwright was used manually, not committed).

## Testing done
Unit tests (11), `verify_data.py` (8 checks), manual Playwright/Chromium runs: desktop, 390px touch, dark mode, keyboard expand/collapse, empty state, URL-hash restore. Not tested: Safari/Firefox, screen readers.
