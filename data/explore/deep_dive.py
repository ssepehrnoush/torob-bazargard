"""Deep-dive stats for DATASET-NOTES.md (exploration helper).

Usage: python -I -X utf8 deep_dive.py <dataset_dir>
"""
import collections
import csv
import json
import os
import re
import statistics
import sys
from datetime import datetime

csv.field_size_limit(10**9)
D = sys.argv[1]
C = collections.Counter


def rows(name):
    with open(os.path.join(D, name), encoding="utf-8", newline="") as fh:
        yield from csv.DictReader(fh)


def nz(v):
    return v not in ("", "null")


def top(counter, n=15):
    return ", ".join(f"{k!r}:{v}" for k, v in counter.most_common(n))


ARABIC_YK = re.compile("[يكى]")  # ي ك ى
ZWNJ = "‌"
DIAC = re.compile("[ً-ٰٟ]")
FA_DIG = re.compile("[۰-۹]")
AR_DIG = re.compile("[٠-٩]")
HTML = re.compile(r"<\s*/?\s*[a-zA-Z][^>]*>|&[a-z]+;|&#\d+;")
LATIN = re.compile("[A-Za-z]")
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")


def quirks(label, values):
    n = len(values)
    q = C()
    for v in values:
        if ARABIC_YK.search(v):
            q["arabic_yk"] += 1
        if ZWNJ in v:
            q["zwnj"] += 1
        if DIAC.search(v):
            q["diacritics"] += 1
        if FA_DIG.search(v):
            q["persian_digits"] += 1
        if AR_DIG.search(v):
            q["arabic_digits"] += 1
        if re.search(r"\d", v):
            q["ascii_digits"] += 1
        if HTML.search(v):
            q["html"] += 1
        if LATIN.search(v):
            q["latin"] += 1
        if EMOJI.search(v):
            q["emoji"] += 1
        if "\n" in v:
            q["newline"] += 1
        if "  " in v or v != v.strip():
            q["extra_space"] += 1
        if "‏" in v or "‎" in v or "‫" in v or "‬" in v:
            q["bidi_marks"] += 1
        if "ـ" in v:
            q["tatweel"] += 1
    print(f"[quirks] {label} (n={n}): " + ", ".join(f"{k}={v} ({100*v/max(n,1):.1f}%)" for k, v in sorted(q.items())))


# ---------------- SHOPS ----------------
shops = list(rows("shops.csv"))
print("=== SHOPS", len(shops))
status = C()
shiftsn = C()
days_declared = C()
start_t = C()
end_t = C()
shops_with_declared = 0
shops_with_any_hours = 0
overnight = 0
dayset = C()
for s in shops:
    wh = json.loads(s["weekly_hours"]) if nz(s["weekly_hours"]) else {}
    if wh:
        shops_with_any_hours += 1
    dayset[tuple(sorted(wh.keys()))] += 1
    anyd = False
    nd = 0
    for day, v in wh.items():
        status[v.get("status")] += 1
        shiftsn[len(v.get("shifts") or [])] += 1
        if v.get("status") == "declared":
            anyd = True
            nd += 1
            for sh in v["shifts"]:
                start_t[sh["start_time"]] += 1
                end_t[sh["end_time"]] += 1
                if sh["end_time"] <= sh["start_time"] and sh["end_time"] != "00:00:00":
                    overnight += 1
    if wh:
        days_declared[nd] += 1
    if anyd:
        shops_with_declared += 1
print("weekly_hours non-empty:", shops_with_any_hours, "with >=1 declared day:", shops_with_declared)
print("day-key sets:", top(dayset, 5))
print("status per day:", top(status))
print("#shifts per day:", top(shiftsn))
print("#declared days per shop (among shops with hours):", sorted(days_declared.items()))
print("declared start times:", top(start_t, 12))
print("declared end times:", top(end_t, 12))
print("declared shifts with end<=start (overnight/odd):", overnight)
# example of a 2-shift declared day
for s in shops:
    wh = json.loads(s["weekly_hours"]) if nz(s["weekly_hours"]) else {}
    two = [d for d, v in wh.items() if v.get("status") == "declared" and len(v["shifts"]) == 2]
    if two:
        print("two-shift example:", s["shop_id"], two[0], wh[two[0]])
        break
# example status values with their shifts
seen = set()
for s in shops:
    wh = json.loads(s["weekly_hours"]) if nz(s["weekly_hours"]) else {}
    for d, v in wh.items():
        if v.get("status") not in seen:
            seen.add(v.get("status"))
            print("status example:", v.get("status"), d, v)

chan = C()
ncontacts = C()
contact_keys = C()
for s in shops:
    cs = json.loads(s["contacts"])
    ncontacts[len(cs)] += 1
    for c in cs:
        chan[c.get("channel")] += 1
        contact_keys[tuple(sorted(c.keys()))] += 1
print("contacts channels:", top(chan), "| per shop:", sorted(ncontacts.items()), "| key sets:", top(contact_keys, 5))
for s in shops:
    cs = json.loads(s["contacts"])
    if any(c.get("channel") != "phone" for c in cs):
        print("non-phone contact example:", cs)
        break

prov = C()
pchan = C()
prov_chan = C()
pay_shops = C()
pcat = 0
pminmax = 0
for s in shops:
    po = json.loads(s["payment_options"]) if nz(s["payment_options"]) else []
    provs = set()
    for p in po:
        prov[p.get("provider_name")] += 1
        pchan[p.get("channel")] += 1
        prov_chan[(p.get("provider_name"), p.get("channel"))] += 1
        provs.add(p.get("provider_name"))
        if p.get("category_names"):
            pcat += 1
        if p.get("min_price_toman") is not None or p.get("max_price_toman") is not None:
            pminmax += 1
    for pv in provs:
        pay_shops[pv] += 1
print("payment providers (entries):", top(prov, 30))
print("payment shops per provider:", top(pay_shops, 30))
print("payment channels:", top(pchan))
print("provider x channel:", top(prov_chan, 40))
print("payment entries with category restriction:", pcat, "with min/max price:", pminmax)
for s in shops:
    po = json.loads(s["payment_options"]) if nz(s["payment_options"]) else []
    if any(p.get("category_names") or p.get("min_price_toman") for p in po):
        print("payment example w/ restriction:", json.dumps(po, ensure_ascii=False)[:600])
        break
print("supports_fast_delivery:", C(s["supports_fast_delivery"] for s in shops))
print("instagram:", sum(nz(s["instagram"]) for s in shops), "website:", sum(nz(s["website_url"]) for s in shops),
      "both:", sum(nz(s["instagram"]) and nz(s["website_url"]) for s in shops))

loc = C(s["location_label"] for s in shops)
print("location_label (all):", top(loc, 40))
lats = [float(s["lat"]) for s in shops]
lons = [float(s["lon"]) for s in shops]
print("lat range", min(lats), max(lats), "lon range", min(lons), max(lons))
print("lat median", statistics.median(lats), "lon median", statistics.median(lons))
# outliers: outside greater Tehran box
out = [(s["shop_id"], s["lat"], s["lon"], s["location_label"]) for s in shops
       if not (35.55 <= float(s["lat"]) <= 35.85 and 51.1 <= float(s["lon"]) <= 51.65)]
print("outside Tehran box:", len(out), out[:5])
# percentiles
for p in (0.01, 0.05, 0.5, 0.95, 0.99):
    sl = sorted(lats)
    so = sorted(lons)
    print(f"  p{int(p*100)} lat={sl[int(p*(len(sl)-1))]:.4f} lon={so[int(p*(len(so)-1))]:.4f}")
coord = C((round(float(s["lat"]), 4), round(float(s["lon"]), 4)) for s in shops)
print("shops sharing a ~11m coordinate (top):", coord.most_common(8))
print("distinct exact coords:", len(set((s["lat"], s["lon"]) for s in shops)))
# grid clusters ~ 1km
grid = C((round(float(s["lat"]) * 100) / 100, round(float(s["lon"]) * 100) / 100) for s in shops)
print("1km grid cells top:", grid.most_common(12))
# per-label centroid
by = collections.defaultdict(list)
for s in shops:
    by[s["location_label"]].append((float(s["lat"]), float(s["lon"])))
print("label centroids:")
for k, v in sorted(by.items(), key=lambda kv: -len(kv[1])):
    print(f"   {k!r}: n={len(v)} lat={statistics.mean(a for a,_ in v):.4f} lon={statistics.mean(b for _,b in v):.4f}")

# address parsing
addr = [s["address"] for s in shops if nz(s["address"])]
mall_re = re.compile(r"(پاساژ|مجتمع(?: تجاری)?|مرکز خرید|بازار|تیمچه|سرای|سرا |برج|ساختمان|مال)\s+([^،,]+)")
floor_re = re.compile(r"طبقه\s*([^،,]+)")
unit_re = re.compile(r"(واحد|پلاک|غرفه|مغازه)\s*([^،,]+)")
mk = C()
malls = C()
fl = C()
un = C()
for a in addr:
    m = mall_re.search(a)
    if m:
        mk[m.group(1)] += 1
        malls[(m.group(1) + " " + m.group(2).strip())] += 1
    f = floor_re.search(a)
    if f:
        fl[f.group(1).strip()] += 1
    u = unit_re.search(a)
    if u:
        un[u.group(1)] += 1
print("address has mall-ish keyword:", sum(mk.values()), top(mk))
print("address has 'طبقه':", sum(fl.values()), "floor values:", top(fl, 25))
print("address has unit keyword:", sum(un.values()), top(un))
print("top mall strings:", top(malls, 40))
print("address separators: '،'", sum("،" in a for a in addr), "',' ", sum("," in a for a in addr), "'-'", sum(" - " in a for a in addr))
print("address length median", statistics.median(len(a) for a in addr))
quirks("shops.address", addr)
quirks("shops.name", [s["name"] for s in shops])
dup_addr = C(addr)
print("duplicate addresses:", sum(1 for v in dup_addr.values() if v > 1), dup_addr.most_common(3))

shopcat = C()
ncat = []
for s in shops:
    cs = json.loads(s["category_names"]) if nz(s["category_names"]) else []
    ncat.append(len(cs))
    for c in cs:
        shopcat[c] += 1
print("shop category_names distinct:", len(shopcat), "per shop median", statistics.median(ncat), "max", max(ncat))
print("shop category top:", top(shopcat, 25))

# ---------------- PRODUCTS ----------------
print("\n=== PRODUCTS")
prods = {}
cat = C()
brand = C()
nimg = C()
img_dom = C()
img_ext = C()
spec_keys = C()
spec_sections = C()
nspecs = []
titles = []
brand_int = []
model_ex = C()
for p in rows("products.csv"):
    prods[p["product_id"]] = (p["persian_title"], p["category_name"], p["brand_name"])
    cat[p["category_name"]] += 1
    if nz(p["brand_name"]):
        brand[p["brand_name"]] += 1
        if p["brand_name"].isdigit():
            brand_int.append(p["brand_name"])
    if nz(p["model"]):
        model_ex[p["model"]] += 1
    imgs = json.loads(p["image_urls"]) if nz(p["image_urls"]) else []
    nimg[len(imgs)] += 1
    for u in imgs:
        img_dom[u.split("/")[2]] += 1
        img_ext[u.rsplit(".", 1)[-1].lower()] += 1
    sp = json.loads(p["specs"]) if nz(p["specs"]) else []
    nspecs.append(len(sp))
    for x in sp:
        spec_keys[x.get("key")] += 1
        spec_sections[x.get("section")] += 1
    titles.append(p["persian_title"])
print("distinct categories:", len(cat), "| products per cat median", statistics.median(cat.values()))
print("category names containing '>' or '/' or '|':", sum(1 for c in cat if any(ch in c for ch in ">/|")))
print("top categories by product count:", top(cat, 15))
print("brands distinct:", len(brand), "top:", top(brand, 30))
print("numeric brand names:", brand_int)
print("model top:", top(model_ex, 20))
print("images per product:", sorted(nimg.items())[:12], "domains:", top(img_dom), "ext:", top(img_ext))
print("specs per product median", statistics.median(nspecs), "max", max(nspecs))
print("spec sections:", top(spec_sections, 10))
print("spec keys top:", top(spec_keys, 30))
quirks("products.persian_title", [t for t in titles if nz(t)])
tdup = C(titles)
print("duplicate titles: distinct dup titles", sum(1 for v in tdup.values() if v > 1), "rows in dups", sum(v for v in tdup.values() if v > 1), tdup.most_common(5))
print("empty/null titles:", [t for t in titles if not nz(t) or t.isdigit()][:10])
lat_only = sum(1 for t in titles if t and not re.search("[؀-ۿ]", t))
print("titles with no Persian letters:", lat_only)
print("title length median", statistics.median(len(t) for t in titles))
# brand appears in title?
bin_t = sum(1 for t, c, b in prods.values() if nz(b) and b in t)
print("brand string appears in title:", bin_t, "of", sum(1 for _, _, b in prods.values() if nz(b)))

# ---------------- OFFERS ----------------
print("\n=== OFFERS")
offers = list(rows("offers.csv"))
shop_ids = {s["shop_id"] for s in shops}
miss_p = sum(1 for o in offers if o["product_id"] not in prods)
miss_s = sum(1 for o in offers if o["shop_id"] not in shop_ids)
print("offers with unknown product:", miss_p, "unknown shop:", miss_s)
prod_in_offers = {o["product_id"] for o in offers}
print("products never offered:", len(set(prods) - prod_in_offers))
shops_w_offers = C(o["shop_id"] for o in offers)
print("shops with offers:", len(shops_w_offers), "shops with none:", len(shop_ids - set(shops_w_offers)))
print("offers per shop: max", max(shops_w_offers.values()), "median", statistics.median(shops_w_offers.values()))
dps = collections.defaultdict(set)
for o in offers:
    dps[o["shop_id"]].add(o["product_id"])
print("distinct products per shop max", max(len(v) for v in dps.values()),
      "shops at 300:", sum(1 for v in dps.values() if len(v) >= 300))
pair = C((o["shop_id"], o["product_id"]) for o in offers)
dups = {k: v for k, v in pair.items() if v > 1}
print("duplicate (shop,product) pairs:", len(dups), "extra rows:", sum(v - 1 for v in dups.values()))
if dups:
    k = next(iter(dups))
    for o in offers:
        if (o["shop_id"], o["product_id"]) == k:
            print("   dup example:", o["offer_id"], o["price_toman"], o["seller_title"][:80], o["last_price_changed_at"])
shops_per_prod = C(len(v) for v in (lambda m: m)(collections.defaultdict(set)).values())
pp = collections.defaultdict(set)
for o in offers:
    pp[o["product_id"]].add(o["shop_id"])
spp = C(len(v) for v in pp.values())
print("shops per product distribution:", sorted(spp.items())[:15], "max", max(spp))
print("products offered by >=2 shops:", sum(v for k, v in spp.items() if k >= 2), ">=5:", sum(v for k, v in spp.items() if k >= 5))
print("most-offered products:")
for pid, ss in sorted(pp.items(), key=lambda kv: -len(kv[1]))[:8]:
    print("   ", len(ss), prods[pid][0][:80], "|", prods[pid][1])

prices = [int(o["price_toman"]) for o in offers if nz(o["price_toman"])]
sp = sorted(prices)
print("price_toman n", len(sp), "min", sp[0], "max", sp[-1], "median", statistics.median(sp))
for p in (0.001, 0.01, 0.05, 0.25, 0.75, 0.95, 0.99, 0.999):
    print(f"   p{p*100:g} = {sp[int(p*(len(sp)-1))]:,}")
print("price==0:", sum(1 for x in sp if x == 0), "<1000:", sum(1 for x in sp if x < 1000),
      "<10000:", sum(1 for x in sp if x < 10000), ">1e9:", sum(1 for x in sp if x > 1e9), ">1e10:", sum(1 for x in sp if x > 1e10))
print("prices ending in 0 (last digit):", sum(1 for x in sp if x % 10 == 0), "ending 000:", sum(1 for x in sp if x % 1000 == 0))
print("top price values:", C(prices).most_common(10))
hi = sorted((o for o in offers if nz(o["price_toman"])), key=lambda o: -int(o["price_toman"]))[:8]
for o in hi:
    print("   HIGH", f"{int(o['price_toman']):,}", prods[o["product_id"]][0][:60], "|", prods[o["product_id"]][1])
lo = [o for o in offers if nz(o["price_toman"]) and int(o["price_toman"]) < 1000][:8]
for o in lo:
    print("   LOW", o["price_toman"], prods[o["product_id"]][0][:60], "|", prods[o["product_id"]][1])
# within-product spread
spread = []
for pid, ss in pp.items():
    ps = [int(o) for o in []]
byp = collections.defaultdict(list)
for o in offers:
    if nz(o["price_toman"]) and int(o["price_toman"]) > 0:
        byp[o["product_id"]].append(int(o["price_toman"]))
ratios = []
for pid, ps in byp.items():
    if len(ps) >= 3:
        med = statistics.median(ps)
        for x in ps:
            ratios.append((x / med, pid, x, med))
print("offers in products with >=3 priced offers:", len(ratios))
print("   >=10x median:", sum(1 for r in ratios if r[0] >= 10), "<=0.1x median:", sum(1 for r in ratios if r[0] <= 0.1))
for r in sorted(ratios, key=lambda r: -r[0])[:5]:
    print("   OUTLIER hi", f"{r[0]:.0f}x", r[2], "median", r[3], prods[r[1]][0][:60])
for r in sorted(ratios, key=lambda r: r[0])[:5]:
    print("   OUTLIER lo", f"{r[0]:.4f}x", r[2], "median", r[3], prods[r[1]][0][:60])
# rial suspicion: ratio ~10x
print("   ratio in [9,11]:", sum(1 for r in ratios if 9 <= r[0] <= 11), "in [0.09,0.11]:", sum(1 for r in ratios if 0.09 <= r[0] <= 0.11))

dts = []
fmt = C()
for o in offers:
    v = o["last_price_changed_at"]
    if nz(v):
        fmt[re.sub(r"\d", "9", v)] += 1
        dts.append(datetime.fromisoformat(v))
print("datetime formats:", top(fmt, 5))
dts.sort()
print("last_price_changed_at min", dts[0], "max", dts[-1], "median", dts[len(dts) // 2])
for p in (0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9):
    print(f"   p{int(p*100)} {dts[int(p*(len(dts)-1))]}")
mon = C(d.strftime("%Y-%m") for d in dts)
print("by month:", sorted(mon.items()))
day = C(d.strftime("%Y-%m-%d") for d in dts if d.year == 2026 and d.month >= 9)
print("by day (2026-09+):", sorted(day.items())[-25:])

wprov = C()
wper = C()
wdesc = 0
for o in offers:
    if nz(o["warranty"]):
        w = json.loads(o["warranty"])
        wprov[w.get("provider")] += 1
        wper[w.get("period_months")] += 1
        if w.get("description"):
            wdesc += 1
print("warranty providers top:", top(wprov, 20))
print("warranty period_months:", top(wper, 15), "with description:", wdesc)
for o in offers:
    if nz(o["warranty"]) and json.loads(o["warranty"]).get("description"):
        print("   warranty w/ desc example:", o["warranty"][:300])
        break
descs = [o["description"] for o in offers if nz(o["description"])]
quirks("offers.description", descs)
for d in descs:
    if HTML.search(d):
        print("   html example:", repr(d[:200]))
        break
quirks("offers.seller_title", [o["seller_title"] for o in offers])
same = sum(1 for o in offers if o["seller_title"] == prods[o["product_id"]][0])
print("seller_title == persian_title:", same)
noprice = [o for o in offers if not nz(o["price_toman"])]
print("null-price offers:", len(noprice), "have date:", sum(nz(o["last_price_changed_at"]) for o in noprice))
print("null-date offers with price:", sum(1 for o in offers if not nz(o["last_price_changed_at"]) and nz(o["price_toman"])))

# top 30 categories by offer count
oc = C(prods[o["product_id"]][1] for o in offers)
print("\nTOP30 categories by offers:")
ocs = C()
for o in offers:
    ocs[prods[o["product_id"]][1]] += 0
shop_by_cat = collections.defaultdict(set)
for o in offers:
    shop_by_cat[prods[o["product_id"]][1]].add(o["shop_id"])
for k, v in oc.most_common(30):
    print(f"   {k}\t{v}\t{cat[k]}\t{len(shop_by_cat[k])}")
print("categories with offers:", len(oc))

# offers per location label
lab = {s["shop_id"]: s["location_label"] for s in shops}
print("offers by location_label:", top(C(lab[o["shop_id"]] for o in offers), 31))
