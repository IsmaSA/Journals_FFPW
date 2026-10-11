Code for webpage: https://ismasa.github.io/Journals_FFPW/

The page looks and works as before (same colours, layout, filters, sorting, compare). Three things were added:

- a **Trend position** column: a small line of the journal's position in its category in 2023, 2024 and 2025;
- a **hover card** (mouse only) with the 2023-2025 IF, AIS, rank and quartile of that journal in that category;
- a **detail panel** that opens when you click a row: position chart, AIS and IF charts and a table of values by year. Click again (or press Esc) to close it.

The table itself still reads `datos.json` (2025). The additions read `data/journals.json`, which holds all years.

## Run locally

```bash
python3 -m http.server 8765      # then open http://localhost:8765/   (ES modules need http, not file://)
```

## Data pipeline (for the three-year data)

```bash
pip install openpyxl
python3 scripts/build_data.py     # Tonda.JCI_<year>.xlsx -> data/journals.json
python3 scripts/verify_data.py    # independent checks against the xlsx files
node --test tests/unit.test.mjs   # unit tests for the change logic and the data
```

To add a year, put `Tonda.JCI_<year>.xlsx` in the repo root and run the two scripts. `datos.json` (the table's data) is still the 2025 file, as before.

See `claude.md` for data semantics, definitions and limitations.

## Notes carried over from the original README

- Added manually to the source data: `PAKISTAN JOURNAL OF ZOOLOGY 2024 ZOOLOGY 0,48 0,1 172 / 178 Q4 SCIE`
- To-do list:
  - Fix AIS of ANNUAL REVIEW OF ECOLOGY EVOLUTION AND SYSTEMATICS ==> 5.866 (DONE)
  - Add suggestion mode to the "Subject" column (DONE: category field suggests names as you type)
  - Add a search bar in the AIS column (DONE: minimum AIS / IF filters and AIS sorting)

## Legacy files

The `root/` folder holds copies of the data files from an earlier version; the page does not use it.
