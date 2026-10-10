#!/usr/bin/env python3
"""Check data/journals.json against the Excel sources and the legacy datos.json.

Usage (from the repository root):  python3 scripts/verify_data.py
Exits with status 1 if any check fails.

Checks
  1. Every source row appears in journals.json with identical Impact Factor, AIS,
     rank, category size and quartile (duplicates: best rank kept, count recorded).
  2. Nothing was invented: the number of year cells in journals.json equals the
     number of distinct (journal, category, year) combinations in the sources, and
     every stored journal-year metric has a source row.
  3. The 2025 slice reproduces the legacy datos.json row for row.
"""
import json
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_data import FILE_RE, RANK_RE, link_key, read_workbook, tidy_name, to_number  # noqa: E402

import glob

DATA = "data/journals.json"
LEGACY = "datos.json"
failures = []


def check(ok, message):
    print(("PASS  " if ok else "FAIL  ") + message)
    if not ok:
        failures.append(message)


def main():
    with open(DATA, encoding="utf-8") as fh:
        data = json.load(fh)
    years = data["years"]
    cats = data["categories"]
    year_idx = {y: i for i, y in enumerate(years)}

    # Lookup: (link key of any source spelling) -> journal entry
    by_key = {}
    for j in data["journals"]:
        by_key[link_key(j["n"])] = j
    check(len(by_key) == len(data["journals"]), f"journal link keys are unique ({len(by_key)} journals)")

    files = {}
    for path in glob.glob("Tonda.JCI_*.xlsx"):
        m = FILE_RE.search(path)
        if m:
            files[int(m.group(1))] = path
    check(sorted(files) == years, f"years in data {years} match source files {sorted(files)}")

    distinct_cells = set()
    distinct_metric_years = set()
    mismatches = Counter()
    examples = []
    dup_expected = defaultdict(list)
    legacy_2025 = Counter()

    for y in years:
        for line_no, r in read_workbook(files[y]):
            key = link_key(r["journal_name"])
            cat = tidy_name(r["subject_area_name"])
            j = by_key.get(key)
            if j is None or cat not in cats:
                mismatches["missing journal/category"] += 1
                continue
            ci = cats.index(cat)
            rec = next((c for c in j["c"] if c[0] == ci), None)
            if rec is None:
                mismatches["missing record"] += 1
                continue
            yi = year_idx[y]
            m = RANK_RE.match(str(r["Ranking"]))
            rank, total = int(m.group(1)), int(m.group(2))
            q = str(r["Faculty_Quartiles"]).strip()
            imp = to_number(r["Impact.Factor"], "Impact.Factor", "")
            ais = to_number(r["Article.Influence"], "Article.Influence", "")
            distinct_cells.add((key, cat, y))
            distinct_metric_years.add((key, y))
            if j["if"][yi] != imp or j["ais"][yi] != ais:
                mismatches["IF/AIS differ"] += 1
                examples.append((y, r["journal_name"], "IF/AIS", (imp, ais), (j["if"][yi], j["ais"][yi])))
            cell = rec[1][yi]
            if cell is None:
                mismatches["empty year cell"] += 1
                continue
            dup_expected[(key, cat, y)].append((rank, total, q))
            if cell[1] != total or cell[2] != q:
                mismatches["total/quartile differ"] += 1
                examples.append((y, r["journal_name"], "total/quartile", (total, q), cell[1:3]))
            if y == 2025:
                legacy_2025[(tidy_name(r["journal_name"]), cat, imp, ais, f"{rank} / {total}", q)] += 1

    for (key, cat, y), items in dup_expected.items():
        j = by_key[key]
        cell = next(c for c in j["c"] if c[0] == cats.index(cat))[1][year_idx[y]]
        if cell[0] != min(items)[0]:
            mismatches["duplicate: best rank not kept"] += 1
        if (len(items) > 1) != (len(cell) > 3) or (len(cell) > 3 and cell[3] != len(items)):
            mismatches["duplicate: count wrong"] += 1

    check(not mismatches, "every source row matches journals.json" + (f" -- problems: {dict(mismatches)} e.g. {examples[:3]}" if mismatches else ""))

    stored_cells = sum(1 for j in data["journals"] for _, row in j["c"] for cell in row if cell is not None)
    check(stored_cells == len(distinct_cells), f"year cells stored ({stored_cells}) = distinct source (journal, category, year) ({len(distinct_cells)})")
    stored_metrics = sum(1 for j in data["journals"] for i, _ in enumerate(years) if j["if"][i] is not None or j["ais"][i] is not None)
    check(stored_metrics == len(distinct_metric_years), f"journal-year metrics stored ({stored_metrics}) = distinct source (journal, year) ({len(distinct_metric_years)})")
    check(all(any(cell is not None for cell in row) for j in data["journals"] for _, row in j["c"]), "no record is empty in every year")
    check(cats == sorted(cats), "categories are sorted and unique" if len(cats) == len(set(cats)) else "categories not unique")

    if os.path.exists(LEGACY) and 2025 in year_idx:
        with open(LEGACY, encoding="utf-8") as fh:
            legacy = json.load(fh)
        old = Counter((tidy_name(r["journal_name"]), tidy_name(r["subject_area_name"]), float(r["Impact.Factor"]),
                       float(r["Article.Influence"]), r["Ranking"], r["Faculty_Quartiles"]) for r in legacy if r["year"] == 2025)
        new = Counter()
        yi = year_idx[2025]
        for j in data["journals"]:
            for ci, row in j["c"]:
                cell = row[yi]
                if cell is not None:
                    new[(tidy_name(j["n"]), cats[ci], j["if"][yi], j["ais"][yi], f"{cell[0]} / {cell[1]}", cell[2])] += 1
        check(old == new, f"2025 slice reproduces legacy datos.json ({sum(old.values())} rows)")
    else:
        print("SKIP  legacy datos.json comparison (file or 2025 not present)")

    print()
    print("ALL CHECKS PASSED" if not failures else f"{len(failures)} CHECK(S) FAILED")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
