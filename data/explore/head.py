"""Print the first N rows of each Torob CSV (exploration helper)."""
import csv
import os
import sys

csv.field_size_limit(10**9)
D = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 3
CUT = int(sys.argv[3]) if len(sys.argv) > 3 else 400
for f in ["shops.csv", "products.csv", "offers.csv"]:
    print("=====", f)
    with open(os.path.join(D, f), encoding="utf-8", newline="") as fh:
        r = csv.reader(fh)
        h = next(r)
        print(h)
        for i, row in enumerate(r):
            if i >= N:
                break
            for k, v in zip(h, row):
                print("  ", k, "=", repr(v[:CUT]))
            print("  --")
