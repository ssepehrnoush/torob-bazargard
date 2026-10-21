"""«مسیر گردش و خرید»: a short walking loop around the shop the user is visiting anyway, past nearby
listings in related categories that are priced well below what other shops ask for the same item.

"Related" is learned from the data: categories that shops selling this product's category also declare.
"Good price" means at least 12% below the median price of the same product across shops (Torob has no
discount data, so the UI calls it "below the usual price", never a discount)."""
from __future__ import annotations

from collections import Counter
from functools import lru_cache

from . import db
from .models import Ctx
from .shops import all_shops, mall_line, nav_links, shop
from .timegeo import fa_digits, haversine_km
from .travel import walk_minutes

RADIUS_KM = 0.7
MAX_STOPS = 4


@lru_cache(maxsize=256)
def related_categories(category: str, k: int = 8) -> tuple[str, ...]:
    shops_in = [r["sid"] for r in db.q("SELECT sid FROM shop_categories WHERE category_name = ?", (category,))]
    if not shops_in:
        return (category,)
    c = Counter()
    for chunk in range(0, len(shops_in), 400):
        part = shops_in[chunk:chunk + 400]
        marks = ",".join("?" * len(part))
        for r in db.q(f"SELECT category_name FROM shop_categories WHERE sid IN ({marks})", part):
            c[r["category_name"]] += 1
    return tuple([category] + [name for name, _ in c.most_common(k + 1) if name != category][:k])


def stroll(pid: int, anchor_sid: int, ctx: Ctx) -> dict:
    prod = db.q1("SELECT title, category_name FROM products WHERE pid = ?", (pid,))
    anchor = shop(anchor_sid)
    if not prod or not anchor:
        return {"stops": [], "note": "فروشگاه یا کالا پیدا نشد"}
    cats = related_categories(prod["category_name"])
    shops = all_shops()
    near = [s for s in shops.values() if s.sid != anchor.sid and haversine_km(anchor.lat, anchor.lon, s.lat, s.lon) <= RADIUS_KM]
    if not near:
        return {"stops": [], "note": "فروشگاه دیگری با کالای مرتبط در چند قدمی نیست"}
    sid_marks = ",".join("?" * len(near))
    cat_marks = ",".join("?" * len(cats))
    rows = db.q(
        f"""SELECT o.sid, o.pid, o.price_toman, p.title, p.category_name, p.median_price_toman, p.n_priced_offers, p.image_url
            FROM offers o JOIN products p ON p.pid = o.pid
            WHERE o.sid IN ({sid_marks}) AND o.price_ok = 1 AND p.category_name IN ({cat_marks})
              AND p.n_priced_offers >= 3 AND p.median_price_toman > 0 AND o.pid != ?""",
        [s.sid for s in near] + list(cats) + [pid])
    deals = []
    for r in rows:
        ratio = r["price_toman"] / r["median_price_toman"]
        if ratio > 0.88 or ratio < 0.55:  # far below the median is more likely a different item than a deal
            continue
        if ctx.budget_max and r["price_toman"] > ctx.budget_max:
            continue
        deals.append({**dict(r), "below_pct": round((1 - ratio) * 100)})
    # best deal per shop, at most one stop per category so the walk stays varied
    best_by_shop: dict[int, dict] = {}
    for d in sorted(deals, key=lambda d: -d["below_pct"]):
        best_by_shop.setdefault(d["sid"], d)
    picked, used_cats = [], set()
    for d in sorted(best_by_shop.values(), key=lambda d: -d["below_pct"]):
        if d["category_name"] in used_cats and len(used_cats) < len(cats):
            continue
        picked.append(d)
        used_cats.add(d["category_name"])
        if len(picked) >= MAX_STOPS:
            break
    if not picked:
        return {"stops": [], "note": "در چند قدمی این فروشگاه کالای مرتبطی با قیمت پایین‌تر از معمول پیدا نشد"}
    # walking order: nearest neighbour from the anchor shop, back to it at the end
    order, cur, total = [], anchor, 0.0
    left = picked[:]
    while left:
        nxt = min(left, key=lambda d: haversine_km(cur.lat, cur.lon, shops[d["sid"]].lat, shops[d["sid"]].lon))
        left.remove(nxt)
        s = shops[nxt["sid"]]
        leg = haversine_km(cur.lat, cur.lon, s.lat, s.lon)
        total += walk_minutes(leg) + 6  # a few minutes in each shop
        order.append({
            "sid": s.sid, "name": s.name, "mall": mall_line(s), "lat": s.lat, "lon": s.lon,
            "walk_minutes": max(1, round(walk_minutes(leg))),
            "item": {"pid": nxt["pid"], "title": nxt["title"], "category": nxt["category_name"], "image": nxt["image_url"],
                     "price": nxt["price_toman"], "usual_price": nxt["median_price_toman"], "below_pct": nxt["below_pct"],
                     "label": f"{fa_digits(nxt['below_pct'])}٪ زیر قیمت معمول در ترب"},
            "nav": nav_links(s.lat, s.lon, s.name),
        })
        cur = s
    total += walk_minutes(haversine_km(cur.lat, cur.lon, anchor.lat, anchor.lon))
    return {
        "anchor": {"sid": anchor.sid, "name": anchor.name, "mall": mall_line(anchor), "lat": anchor.lat, "lon": anchor.lon},
        "stops": order, "total_minutes": round(total),
        "summary": f"گردش حدود {fa_digits(round(total))} دقیقه‌ای پیاده در اطراف {anchor.name}، با {fa_digits(len(order))} توقف",
        "categories": list(cats),
        "note": "«زیر قیمت معمول» یعنی ارزان‌تر از میانهٔ قیمت همین کالا در فروشگاه‌های دیگرِ ترب؛ موجودی تأیید نشده است.",
    }
