# Journal metrics – Faculty of Fisheries and Protection of Waters

Live site: https://ismasa.github.io/Journals_FFPW/

An interactive, static web app for browsing Impact Factor, Article Influence Score (AIS), category rank and quartile of journals for **2023, 2024 and 2025**. Hover a row (or tap it) to see how the journal changed between years; compare up to four journal–category records side by side. No backend, no build step, no runtime dependencies.

## Run locally

ES modules need HTTP (opening `index.html` as `file://` will not work):

```bash
python3 -m http.server 8765      # then open http://localhost:8765/
```

## Data pipeline

The Excel files are the source of truth (`Tonda.JCI_<year>.xlsx`). The page reads one generated file, `data/journals.json`.

```bash
pip install openpyxl
python3 scripts/build_data.py     # xlsx -> data/journals.json
python3 scripts/verify_data.py    # independent checks against the xlsx files
node --test tests/unit.test.mjs   # unit tests for filtering, sorting and change logic
```

**Adding a year:** drop `Tonda.JCI_<year>.xlsx` (same columns) in the repo root, run the two scripts, commit `data/journals.json`.

See `claude.md` for data semantics, derived metrics, design decisions and limitations.

## Notes carried over from the original README

- Added manually to the source data: `PAKISTAN JOURNAL OF ZOOLOGY 2024 ZOOLOGY 0,48 0,1 172 / 178 Q4 SCIE`
- To-do list:
  - Fix AIS of ANNUAL REVIEW OF ECOLOGY EVOLUTION AND SYSTEMATICS ==> 5.866 (DONE)
  - Add suggestion mode to the "Subject" column (DONE: category field suggests names as you type)
  - Add a search bar in the AIS column (DONE: minimum AIS / IF filters and AIS sorting)

## Legacy files

`datos.json` (2025 only) and the `root/` folder are copies from the previous version of the site. The new page does not use them; they can be deleted once you are happy with the redesign.

## Fonts

Fira Sans and Source Serif 4, self-hosted in `fonts/` (SIL Open Font License 1.1; licence texts included). No external requests are made by the page.
