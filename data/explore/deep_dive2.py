"""Follow-up checks (exploration helper). Usage: python -I -X utf8 deep_dive2.py <dataset_dir>"""
import collections
import csv
import json
import os
import re
import statistics
import sys

csv.field_size_limit(10**9)
D = sys.argv[1]
C = collections.Counter


def rows(name):
    with open(os.path.join(D, name), encoding="utf-8", newline="") as fh:
        yield from csv.DictReader(fh)


def nz(v):
    return v not in ("", "null")


shops = list(rows("shops.csv"))
prods = {p["product_id"]: p for p in rows("products.csv")}
offers = list(rows("offers.csv"))

# 1. hours semantics
allzero_declared = 0
early = C()
late_end = C()
per_shop_open_minutes = []
for s in shops:
    wh = json.loads(s["weekly_hours"]) if nz(s["weekly_hours"]) else {}
    for d, v in wh.items():
        if v["status"] != "declared":
            continue
        real = [sh for sh in v["shifts"] if not (sh["start_time"] == "00:00:00" and sh["end_time"] == "00:00:00")]
        if not real:
            allzero_declared += 1
        for sh in real:
            if sh["start_time"] < "07:00:00":
                early[(sh["start_time"], sh["end_time"])] += 1
            if sh["end_time"] == "00:00:00" or sh["end_time"] > "23:00:00":
                late_end[(sh["start_time"], sh["end_time"])] += 1
print("declared days whose shifts are all 00:00-00:00:", allzero_declared)
print("declared real shifts starting before 07:00:", sum(early.values()), early.most_common(8))
print("declared real shifts ending at 00:00 or >23:00:", sum(late_end.values()), late_end.most_common(8))
real2 = C()
for s in shops:
    wh = json.loads(s["weekly_hours"]) if nz(s["weekly_hours"]) else {}
    for d, v in wh.items():
        if v["status"] == "declared":
            real = [sh for sh in v["shifts"] if not (sh["start_time"] == "00:00:00" and sh["end_time"] == "00:00:00")]
            real2[len(real)] += 1
print("real shifts per declared day:", real2)
for s in shops:
    wh = json.loads(s["weekly_hours"]) if nz(s["weekly_hours"]) else {}
    for d, v in wh.items():
        real = [sh for sh in v["shifts"] if not (sh["start_time"] == "00:00:00" and sh["end_time"] == "00:00:00")]
        if v["status"] == "declared" and len(real) == 2:
            print("split-shift example:", d, real)
            break
    else:
        continue
    break
fri = C()
for s in shops:
    wh = json.loads(s["weekly_hours"]) if nz(s["weekly_hours"]) else {}
    if wh:
        fri[wh["fri"]["status"]] += 1
print("friday status:", fri)
thu = C()
for s in shops:
    wh = json.loads(s["weekly_hours"]) if nz(s["weekly_hours"]) else {}
    if wh and wh["thu"]["status"] == "declared":
        r = [sh for sh in wh["thu"]["shifts"] if sh["end_time"] != "00:00:00"]
        if r:
            thu[r[-1]["end_time"]] += 1
print("thursday closing times:", thu.most_common(6))
sat = C()
for s in shops:
    wh = json.loads(s["weekly_hours"]) if nz(s["weekly_hours"]) else {}
    if wh and wh["sat"]["status"] == "declared":
        r = [sh for sh in wh["sat"]["shifts"] if sh["end_time"] != "00:00:00"]
        if r:
            sat[(r[0]["start_time"], r[-1]["end_time"])] += 1
print("saturday open-close:", sat.most_common(6))
# shops with hours AND offers
offer_shops = {o["shop_id"] for o in offers}
print("shops with hours & offers:", sum(1 for s in shops if nz(s["weekly_hours"]) and s["weekly_hours"] != "{}" and s["shop_id"] in offer_shops))

# 2. redacted titles
red = [p for p in prods.values() if p["persian_title"] == "عنوان حذف‌شده برای انتشار"]
print("redacted titles:", len(red), "categories:", C(p["category_name"] for p in red).most_common(6))
redids = {p["product_id"] for p in red}
st = [o["seller_title"] for o in offers if o["product_id"] in redids]
print("  redacted products' offers:", len(st), "seller_title examples:", st[:6])
print("  redacted with brand:", sum(nz(p["brand_name"]) for p in red), "with specs:", sum(p["specs"] not in ("[]", "null") for p in red))
for t in ["30", "00", ""]:
    for p in prods.values():
        if p["persian_title"] == t or (t == "" and not nz(p["persian_title"])):
            print("  odd title", repr(p["persian_title"]), p["category_name"], [o["seller_title"] for o in offers if o["product_id"] == p["product_id"]][:2])
            break

# 3. category overlap
pc = set(p["category_name"] for p in prods.values())
sc = C()
for s in shops:
    for c in json.loads(s["category_names"]) if nz(s["category_names"]) else []:
        sc[c] += 1
print("shop cats:", len(sc), "also product cats:", len(set(sc) & pc), "shop-only:", len(set(sc) - pc), list(set(sc) - pc)[:12])
print("product cats with '>' etc:", [c for c in pc if any(ch in c for ch in ">/|")])
# shops with category list but no offers
nooff = [s for s in shops if s["shop_id"] not in offer_shops]
print("no-offer shops:", len(nooff), "of which with category_names:", sum(1 for s in nooff if s["category_names"] not in ("[]", "null")),
      "with hours:", sum(1 for s in nooff if s["weekly_hours"] not in ("{}", "null")))
print("no-offer shops by label:", C(s["location_label"] for s in nooff).most_common(8))
# does shop category list cover its offered product categories?
shopcats = {s["shop_id"]: set(json.loads(s["category_names"])) if nz(s["category_names"]) else set() for s in shops}
cov = C()
for o in offers:
    c = prods[o["product_id"]]["category_name"]
    sid = o["shop_id"]
    cov["in_list" if c in shopcats[sid] else ("list_empty" if not shopcats[sid] else "not_in_list")] += 1
print("offer category vs shop category_names:", cov)

# 4. price checks for known products
def show(q, n=8):
    rx = re.compile(q)
    xs = [(int(o["price_toman"]), prods[o["product_id"]]["persian_title"][:70]) for o in offers
          if nz(o["price_toman"]) and rx.search(prods[o["product_id"]]["persian_title"])]
    xs.sort()
    print(f"price check /{q}/ n={len(xs)} median={(statistics.median([x for x,_ in xs]) if xs else 0):,}")
    for x in xs[:: max(1, len(xs) // n)][:n]:
        print(f"     {x[0]:,}  {x[1]}")


show(r"آیفون ۱۵ پرو مکس|iPhone 15 Pro Max")
show(r"^گوشی موبایل سامسونگ.*A55")
show(r"^گوشی موبایل اپل.*15 Pro Max")
show(r"شارژر اپل توان 20 وات سه پین")
hi = C(o["shop_id"] for o in offers if nz(o["price_toman"]) and int(o["price_toman"]) > 1e10)
print("price >1e10 by shop:", hi.most_common(5), "n shops", len(hi))
xs = [int(o["price_toman"]) for o in offers if nz(o["price_toman"]) and int(o["price_toman"]) > 1e10]
print("  examples >1e10:", sorted(xs)[:5], sorted(xs)[-3:])
hi_cats = C(prods[o["product_id"]]["category_name"] for o in offers if nz(o["price_toman"]) and int(o["price_toman"]) > 1e10)
print("  >1e10 categories:", hi_cats.most_common(8))
mid = [(int(o["price_toman"]), prods[o["product_id"]]["persian_title"][:60]) for o in offers
       if nz(o["price_toman"]) and 1e10 < int(o["price_toman"]) < 1e12]
print("  1e10..1e12 sample:", sorted(mid)[:6])
low = C(int(o["price_toman"]) for o in offers if nz(o["price_toman"]) and int(o["price_toman"]) < 1000)
print("price <1000 values:", low.most_common(10))

# 5. html in titles
H = re.compile(r"<\s*/?\s*[a-zA-Z][^>]*>|&[a-z]+;|&#\d+;")
hs = [m.group(0) for p in prods.values() for m in [H.search(p["persian_title"])] if m]
print("html-ish in titles:", C(hs).most_common(10))
hs2 = [m.group(0) for o in offers for m in [H.search(o["description"])] if m]
print("html-ish in offer descriptions:", C(hs2).most_common(10))
print("kalabarg mentions: shops", sum("کالابرگ" in json.dumps(s, ensure_ascii=False) for s in shops),
      "offers desc", sum("کالابرگ" in o["description"] for o in offers),
      "titles", sum("کالابرگ" in p["persian_title"] for p in prods.values()))
print("'قسط'/'اقساط' in offer desc:", sum(("قسط" in o["description"]) or ("اقساط" in o["description"]) for o in offers))

# 6. shop w/o address
for s in shops:
    if not nz(s["address"]) or not s["location_label"]:
        print("shop with blank address/label:", s["shop_id"], repr(s["address"]), repr(s["location_label"]), s["lat"], s["lon"])

# 7. address structure
addr = [s["address"] for s in shops if nz(s["address"])]
mall = re.compile(r"(پاساژ|مجتمع|مرکز خرید|بازار|تیمچه|سرای|برج|ساختمان|\bمال\b)")
fl = re.compile(r"طبقه")
un = re.compile(r"(واحد|پلاک|غرفه|مغازه)")
print("mall+floor+unit:", sum(1 for a in addr if mall.search(a) and fl.search(a) and un.search(a)),
      "mall only:", sum(1 for a in addr if mall.search(a)), "street-only (no mall/floor):", sum(1 for a in addr if not mall.search(a) and not fl.search(a)))
for a in addr[100:4000:400]:
    print("   addr:", a)
# location_label vs address mention
print("label appears in address:", sum(1 for s in shops if s["location_label"] and s["location_label"] in s["address"]))

# 8. specs / model / brand 90
for p in prods.values():
    if p["brand_name"] == "90":
        print("brand 90:", p["persian_title"][:60], p["category_name"])
        break
mods = [(p["model"], p["persian_title"][:60]) for p in prods.values() if nz(p["model"])][:5]
print("model examples:", mods)
# english name in specs?
en = sum(1 for p in prods.values() if '"نام محصول"' in p["specs"] or '"نام انگلیسی"' in p["specs"])
print("products with spec 'نام محصول'/'نام انگلیسی':", en)
# warranty description vs provider
w = C()
for o in offers:
    if nz(o["warranty"]):
        j = json.loads(o["warranty"])
        w[(j["provider"] is None, j["description"] is None, j["period_months"] is None)] += 1
print("warranty (provider None, desc None, months None):", w)
print("warranty desc top:", C(json.loads(o["warranty"])["description"] for o in offers if nz(o["warranty"]) and json.loads(o["warranty"])["description"]).most_common(10))
# dup offers: same shop & product: identical seller_title?
pp = collections.defaultdict(list)
for o in offers:
    pp[(o["shop_id"], o["product_id"])].append(o)
same_t = diff_t = same_p = 0
for k, v in pp.items():
    if len(v) > 1:
        if len({o["seller_title"] for o in v}) == 1:
            same_t += 1
        else:
            diff_t += 1
        if len({o["price_toman"] for o in v}) == 1:
            same_p += 1
print("dup pairs: identical seller_title", same_t, "different", diff_t, "identical price", same_p)
# exact full-duplicate offer rows except id
full = C((o["shop_id"], o["product_id"], o["seller_title"], o["price_toman"]) for o in offers)
print("offers fully duplicated (shop,product,title,price):", sum(v - 1 for v in full.values() if v > 1))
# phone digits
ph = C(re.sub(r"[۰-۹]", "9", json.loads(s["contacts"])[0]["display_number"]) for s in shops)
print("phone shapes:", ph.most_common(5))
# brand variants
b = C(p["brand_name"] for p in prods.values() if nz(p["brand_name"]))
print("brands with latin chars:", sum(1 for k in b if re.search("[A-Za-z]", k)), [k for k in b if re.search("[A-Za-z]", k)][:10])
