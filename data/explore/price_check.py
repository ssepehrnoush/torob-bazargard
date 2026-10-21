"""Price sanity checks (exploration helper). Usage: python -I -X utf8 price_check.py <dataset_dir>"""
import collections, csv, os, statistics, sys
csv.field_size_limit(10**9)
D = sys.argv[1]
def rows(n):
    with open(os.path.join(D, n), encoding="utf-8", newline="") as fh:
        yield from csv.DictReader(fh)
prods = {p["product_id"]: p for p in rows("products.csv")}
offers = [o for o in rows("offers.csv") if o["price_toman"] not in ("", "null")]
C = collections.Counter
for lo, hi in [(1e10, 1e11), (1e11, 1e12), (1e12, 1e15), (1e15, 1e19)]:
    xs = [o for o in offers if lo <= int(o["price_toman"]) < hi]
    print(f"[{lo:.0e},{hi:.0e}): {len(xs)}", C(prods[o["product_id"]]["category_name"] for o in xs).most_common(4))
    for o in xs[:3]:
        print("     ", f"{int(o['price_toman']):,}", prods[o["product_id"]]["persian_title"][:70])
print("cats for price<1000:", C(prods[o["product_id"]]["category_name"] for o in offers if int(o["price_toman"]) < 1000).most_common(10))
print("cats for price==1:", C(prods[o["product_id"]]["category_name"] for o in offers if int(o["price_toman"]) == 1).most_common(6))
print("shops for price==1:", len({o["shop_id"] for o in offers if int(o["price_toman"]) == 1}))
ph = [(int(o["price_toman"]), prods[o["product_id"]]["persian_title"][:70]) for o in offers if prods[o["product_id"]]["category_name"] == "گوشی موبایل"]
ph.sort()
print("mobile phones n", len(ph), "median", statistics.median(x for x, _ in ph))
for x in ph[:: len(ph) // 10]:
    print(f"     {x[0]:,}  {x[1]}")
