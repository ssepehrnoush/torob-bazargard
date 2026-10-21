"""Column profiler for the Torob CSVs: type guess, fill rate, examples, JSON shapes.

Usage: python -I -X utf8 profile_cols.py <dataset_dir>
"""
import collections
import csv
import json
import os
import re
import sys

csv.field_size_limit(10**9)
D = sys.argv[1]

NUM = re.compile(r"^-?\d+(\.\d+)?$")
INT = re.compile(r"^-?\d+$")
ISO = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d")


def kind(v):
    if v == "" or v == "null":
        return "missing"
    if INT.match(v):
        return "int"
    if NUM.match(v):
        return "float"
    if v in ("true", "false", "True", "False"):
        return "bool"
    if ISO.match(v):
        return "datetime"
    if v[:1] in "[{":
        try:
            j = json.loads(v)
            if isinstance(j, list):
                return "json-list" if j else "json-list(empty)"
            return "json-obj" if j else "json-obj(empty)"
        except Exception:
            return "text"
    return "text"


for f in ["shops.csv", "products.csv", "offers.csv"]:
    with open(os.path.join(D, f), encoding="utf-8", newline="") as fh:
        r = csv.reader(fh)
        h = next(r)
        n = 0
        kinds = {c: collections.Counter() for c in h}
        ex = {c: [] for c in h}
        exset = {c: set() for c in h}
        lens = {c: 0 for c in h}
        bad = 0
        uniq = {c: set() for c in h if c not in ("specs", "image_urls", "description")}
        for row in r:
            n += 1
            if len(row) != len(h):
                bad += 1
                continue
            for c, v in zip(h, row):
                k = kind(v)
                kinds[c][k] += 1
                if c in uniq:
                    uniq[c].add(v)
                if k not in ("missing",) and len(ex[c]) < 3 and v not in exset[c] and not k.endswith("(empty)"):
                    if n % 997 == 1 or len(ex[c]) == 0 or n > 5000:
                        ex[c].append(v if len(v) <= 160 else v[:157] + "...")
                        exset[c].add(v)
                lens[c] = max(lens[c], len(v))
    print(f"##### {f}: rows={n} badrows={bad}")
    for c in h:
        tot = sum(kinds[c].values())
        miss = kinds[c]["missing"] + kinds[c]["json-list(empty)"] + kinds[c]["json-obj(empty)"]
        fill = 100.0 * (tot - miss) / tot
        u = len(uniq[c]) if c in uniq else "-"
        print(f"- {c}: fill={fill:.1f}% kinds={dict(kinds[c])} uniq={u} maxlen={lens[c]}")
        for e in ex[c]:
            print("     ex:", repr(e))
