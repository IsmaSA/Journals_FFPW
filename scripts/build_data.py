#!/usr/bin/env python3
"""Build data/journals.json from the Tonda.JCI_<year>.xlsx workbooks.

Usage (from the repository root):
    python3 scripts/build_data.py            # writes data/journals.json
    python3 scripts/verify_data.py           # checks the output against the sources

To add a year, put Tonda.JCI_<year>.xlsx in the repository root and re-run both
scripts. The website reads the years from the data, so no front-end change is needed.

Requires: Python 3.9+ and openpyxl (pip install openpyxl).

Output layout (compact on purpose; the page loads it in one request):
{
  "meta":       {...build information, row counts, data notes...},
  "years":      [2023, 2024, 2025],
  "categories": ["ACOUSTICS", ...],
  "journals": [
    {
      "n":   "2D MATERIALS",                 # display name (from the latest year listed)
      "if":  [null, 4.3, 4.3],               # Impact Factor per year, null = not listed
      "ais": [null, 1.191, 1.027],           # Article Influence Score per year
      "c":   [[catIndex, [null, [35, 106, "Q2"], [39, 107, "Q2"]]], ...]
                                             # per category: [rank, category size, quartile label]
                                             # per year; a 4th element (n) is added when the
                                             # source lists the journal n>1 times in one category
    }, ...
  ]
}
Missing years are null. They are never filled with zeros or interpolated.
"""
import argparse
import datetime
import glob
import hashlib
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict

import openpyxl

COLUMNS = ["journal_name", "year", "subject_area_name", "Impact.Factor",
           "Article.Influence", "Ranking", "Faculty_Quartiles", "edition"]
QUARTILES = {"D1", "Q1", "Q2", "Q3", "Q4"}
RANK_RE = re.compile(r"^\s*(\d+)\s*/\s*(\d+)\s*$")
FILE_RE = re.compile(r"Tonda\.JCI_(\d{4})\.xlsx$")


def tidy_name(name):
    """Upper-case and collapse whitespace (the 2024 workbook mixes letter cases)."""
    return re.sub(r"\s+", " ", str(name).strip()).upper()


def link_key(name):
    """Key used to link the same journal across years.

    Upper-case, '&' -> 'AND', accents removed, everything except letters and digits
    dropped. This only merges spellings that differ in '&'/'AND', hyphens or spacing.
    """
    s = unicodedata.normalize("NFKD", tidy_name(name)).encode("ascii", "ignore").decode()
    s = s.replace("&", " AND ")
    return re.sub(r"[^A-Z0-9]+", "", s)


def to_number(value, field, where):
    if value is None or (isinstance(value, str) and value.strip() in ("", "N/A", "NA", "n/a")):
        return None
    if isinstance(value, str):
        value = value.strip().replace(",", ".")
    try:
        return float(value)
    except (TypeError, ValueError):
        raise SystemExit(f"{where}: {field} is not a number: {value!r}")


def read_workbook(path):
    """Yield one dict per data row.

    read_only + reset_dimensions() is deliberate: the 2023 workbook declares its
    sheet size as A1 and references a drawing that is not in the file, which makes
    the normal openpyxl loader fail or return one cell.
    """
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    ws.reset_dimensions()
    rows = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(rows)]
    missing = [c for c in COLUMNS if c not in header]
    if missing:
        raise SystemExit(f"{path}: missing columns {missing}; found {header}")
    idx = {c: header.index(c) for c in COLUMNS}
    for line_no, row in enumerate(rows, start=2):
        if row is None or all(v is None for v in row):
            continue
        yield line_no, {c: row[idx[c]] for c in COLUMNS}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", default=".", help="folder containing Tonda.JCI_<year>.xlsx (default: .)")
    ap.add_argument("--out", default="data/journals.json", help="output file")
    args = ap.parse_args()

    files = {}
    for path in glob.glob(os.path.join(args.src, "Tonda.JCI_*.xlsx")):
        m = FILE_RE.search(path)
        if m:
            files[int(m.group(1))] = path
    if not files:
        raise SystemExit("No Tonda.JCI_<year>.xlsx files found in " + args.src)
    years = sorted(files)

    names = defaultdict(dict)          # key -> year -> tidy name
    metrics = defaultdict(dict)        # key -> year -> (IF, AIS)
    cells = defaultdict(lambda: defaultdict(list))   # (key, category) -> year -> [(rank,total,q)]
    stats = {"rows": {}, "metric_conflicts": 0, "missing_if": 0, "missing_ais": 0}
    editions = set()

    for year in years:
        n = 0
        for line_no, r in read_workbook(files[year]):
            where = f"{os.path.basename(files[year])} row {line_no}"
            if int(r["year"]) != year:
                raise SystemExit(f"{where}: year column says {r['year']}, file name says {year}")
            if r["journal_name"] is None or r["subject_area_name"] is None:
                raise SystemExit(f"{where}: journal or category is empty")
            m = RANK_RE.match(str(r["Ranking"]))
            if not m:
                raise SystemExit(f"{where}: Ranking is not 'n / m': {r['Ranking']!r}")
            rank, total = int(m.group(1)), int(m.group(2))
            if not 1 <= rank <= total:
                raise SystemExit(f"{where}: rank {rank} outside 1..{total}")
            q = str(r["Faculty_Quartiles"]).strip()
            if q not in QUARTILES:
                raise SystemExit(f"{where}: unknown quartile label {q!r}")
            imp = to_number(r["Impact.Factor"], "Impact.Factor", where)
            ais = to_number(r["Article.Influence"], "Article.Influence", where)
            stats["missing_if"] += imp is None
            stats["missing_ais"] += ais is None
            editions.add(str(r["edition"]).strip())

            key = link_key(r["journal_name"])
            names[key][year] = tidy_name(r["journal_name"])
            cat = tidy_name(r["subject_area_name"])
            cells[(key, cat)][year].append((rank, total, q))
            if year in metrics[key] and metrics[key][year] != (imp, ais):
                stats["metric_conflicts"] += 1      # IF/AIS differ between categories of one journal
            else:
                metrics[key][year] = (imp, ais)
            n += 1
        stats["rows"][year] = n

    categories = sorted({c for (_, c) in cells})
    cat_index = {c: i for i, c in enumerate(categories)}

    # Spellings that were linked across years (report so the maintainer can review them).
    linked = {k: sorted(set(v.values())) for k, v in names.items() if len(set(v.values())) > 1}

    per_journal = defaultdict(list)
    for (key, cat), by_year in cells.items():
        per_journal[key].append((cat, by_year))

    duplicates = defaultdict(int)       # year -> number of (journal, category) pairs listed more than once
    journals = []
    for key in sorted(names, key=lambda k: names[k][max(names[k])]):
        latest = max(names[key])
        entry = {
            "n": names[key][latest],
            "if": [metrics[key][y][0] if y in metrics[key] else None for y in years],
            "ais": [metrics[key][y][1] if y in metrics[key] else None for y in years],
            "c": [],
        }
        for cat, by_year in sorted(per_journal[key], key=lambda t: cat_index[t[0]]):
            row = []
            for y in years:
                items = by_year.get(y)
                if not items:
                    row.append(None)
                    continue
                best = min(items)                         # lowest rank number = best position
                cell = [best[0], best[1], best[2]]
                if len(items) > 1:
                    cell.append(len(items))
                    duplicates[y] += 1
                row.append(cell)
            entry["c"].append([cat_index[cat], row])
        journals.append(entry)

    out = {
        "meta": {
            "generated": datetime.date.today().isoformat(),
            "sources": {str(y): {"file": os.path.basename(files[y]), "rows": stats["rows"][y],
                                 "sha256": sha256(files[y])} for y in years},
            "edition": sorted(editions),
            "journals": len(journals),
            "records": sum(len(j["c"]) for j in journals),
            "duplicate_pairs": {str(y): duplicates[y] for y in sorted(duplicates)},
            "linked_spellings": linked,
            "notes": [
                "Impact Factor and Article Influence Score are journal-level; rank and quartile are per category.",
                "Rank is the position within a category ordered by Article Influence Score.",
                "Missing years are null, never zero.",
                "Duplicate (journal, category, year) rows keep the best rank; the 4th element of a cell is the source row count.",
            ],
        },
        "years": years,
        "categories": categories,
        "journals": journals,
    }

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")

    size = os.path.getsize(args.out)
    print(f"Wrote {args.out} ({size / 1e6:.2f} MB)")
    print(f"  years: {years}   source rows: {stats['rows']}")
    print(f"  journals: {out['meta']['journals']}   journal x category records: {out['meta']['records']}   categories: {len(categories)}")
    print(f"  duplicate (journal, category) pairs per year: {dict(duplicates) or 'none'}")
    print(f"  spellings linked across years: {len(linked)}")
    for k, v in sorted(linked.items()):
        print("    ", " | ".join(v))
    if stats["metric_conflicts"]:
        print(f"  WARNING: {stats['metric_conflicts']} journal-years have different IF/AIS in different categories (first value kept)")
    if stats["missing_if"] or stats["missing_ais"]:
        print(f"  note: {stats['missing_if']} rows without Impact Factor, {stats['missing_ais']} without AIS (stored as null)")


if __name__ == "__main__":
    sys.exit(main())
