"""Match LinkedIn good-fit names against ApplicantSync full data.

Reads two CSVs:
- A good-fit list (from the Tampermonkey exporter) — has Name + minimal fields
- An ApplicantSync export — has Name + Email + Phone + everything

Outputs ONE CSV with full ApplicantSync data for only the matching good-fit rows.

Match key: normalized name (lowercase, collapsed whitespace, stripped).

Reports any names in the good-fit list that didn't match ApplicantSync (so HR knows
which good-fit candidates are missing email/phone data and may need manual follow-up).
"""
import csv
import re
import sys
from pathlib import Path

GOOD = "/mnt/c/Users/HP/Downloads/linkedin-applicants-good-fit-job4415076416-2026-05-22-12-34.csv"
SYNC = "/mnt/c/Users/HP/Downloads/applicants-2026-05-20.csv"
OUT = "/mnt/c/Users/HP/Downloads/goodfit-merged-{date}.csv"


def norm(name: str) -> str:
    if not name:
        return ""
    # Lowercase, collapse whitespace, strip punctuation that varies between sources.
    n = name.strip().lower()
    n = re.sub(r"\s+", " ", n)
    n = n.replace(".", "")  # Match "Siddhant K" vs "Siddhant K."
    return n


def load(path):
    with open(path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def main():
    from datetime import datetime

    good_rows = load(GOOD)
    sync_rows = load(SYNC)

    print(f"Loaded: {len(good_rows)} good-fit rows, {len(sync_rows)} ApplicantSync rows")

    # Build lookup: normalized name -> list of ApplicantSync rows
    sync_by_norm = {}
    for r in sync_rows:
        key = norm(r.get("Name", ""))
        if key:
            sync_by_norm.setdefault(key, []).append(r)

    # Match good-fit names
    matched_rows = []
    unmatched_names = []
    ambiguous = []
    seen_sync_ids = set()  # avoid duplicates if a name matches multiple sync rows

    for g in good_rows:
        key = norm(g.get("Name", ""))
        matches = sync_by_norm.get(key, [])
        if len(matches) == 0:
            unmatched_names.append(g.get("Name", ""))
        elif len(matches) == 1:
            m = matches[0]
            # Use LinkedIn URL as a stable identifier for dedup
            ident = m.get("LinkedIn URL") or m.get("Name")
            if ident not in seen_sync_ids:
                seen_sync_ids.add(ident)
                # Enrich the sync row with the LinkedIn rating from the good-fit file
                merged = dict(m)
                merged["LinkedIn Rating"] = g.get("Rating", "")
                matched_rows.append(merged)
        else:
            # Multiple ApplicantSync rows have the same name — ambiguous
            ambiguous.append({"name": g.get("Name", ""), "count": len(matches)})

    # Write output CSV — preserve all original ApplicantSync columns + add LinkedIn Rating
    out_path = OUT.format(date=datetime.now().strftime("%Y-%m-%d-%H%M"))
    out_columns = list(sync_rows[0].keys()) + ["LinkedIn Rating"]
    with open(out_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=out_columns)
        writer.writeheader()
        for r in matched_rows:
            writer.writerow({k: r.get(k, "") for k in out_columns})

    # Email coverage check
    with_email = sum(1 for r in matched_rows if r.get("Email"))
    without_email = len(matched_rows) - with_email

    # Report
    print("")
    print(f"=== Match Results ===")
    print(f"Matched & exported:        {len(matched_rows)}")
    print(f"  ↳ with email on file:    {with_email}")
    print(f"  ↳ without email on file: {without_email}")
    print(f"Unmatched (no ApplicantSync row): {len(unmatched_names)}")
    print(f"Ambiguous (multiple matches):     {len(ambiguous)}")
    print(f"")
    print(f"Output: {out_path}")

    if unmatched_names:
        print(f"\n=== Good-fit names NOT found in ApplicantSync ({len(unmatched_names)}) ===")
        for n in unmatched_names:
            print(f"  - {n}")

    if ambiguous:
        print(f"\n=== Ambiguous matches (skipped) ===")
        for a in ambiguous:
            print(f"  - {a['name']} ({a['count']} ApplicantSync rows)")


if __name__ == "__main__":
    main()
