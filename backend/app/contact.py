"""Step 4: contacting shops to confirm price, stock and hours.

The dataset's phone numbers are fake, so the shop side is SIMULATED (clearly labelled in the UI):
each shop's answer is drawn from a seeded scenario whose odds depend on real data (how old the
registered price is, whether the shop is open right now per its declared hours). The agent side is
real: it drafts the message, runs the inquiries in parallel, reads the answers, keeps confirmed
facts separate from registered ones, and immediately proposes alternatives for failed shops.
"""
from __future__ import annotations

import asyncio
import hashlib
import random
from typing import AsyncIterator

from . import catalog, llm, shops
from .models import Ctx
from .timegeo import fa_digits, fa_text, now_tehran

OUTCOMES = ("confirmed", "price_changed", "out_of_stock", "no_answer")
ODDS = {  # by price freshness tier
    "fresh": (0.58, 0.18, 0.10, 0.14),
    "aging": (0.42, 0.30, 0.14, 0.14),
    "stale": (0.25, 0.42, 0.19, 0.14),
    "unknown": (0.30, 0.32, 0.18, 0.20),
}


def toman_fa(v: int) -> str:
    return fa_digits(f"{v:,}").replace(",", "٬")


def draft_message(product_title: str, price: int | None, ctx: Ctx, shop_name: str) -> str:
    lines = [f"سلام، وقت بخیر. «{product_title}» را در ترب دیدم"
             + (f" با قیمت {toman_fa(price)} تومان." if price else ".")]
    asks = ["الان موجود است؟", "قیمت امروزش چند است؟", "امروز تا چه ساعتی باز هستید؟"]
    if ctx.installments_only:
        asks.append("امکان خرید قسطی یا اعتباری دارید؟")
    asks.append("اگر موجود است، تا چند ساعت برایم نگه می‌دارید؟")
    lines += [f"{fa_digits(i + 1)}. {a}" for i, a in enumerate(asks)]
    lines.append("ممنون از راهنمایی‌تان.")
    return "\n".join(lines)


def call_script(product_title: str, price: int | None) -> list[str]:
    return [
        "سلام، وقت بخیر. از طریق ترب با فروشگاه شما آشنا شدم.",
        f"«{product_title}» را موجود دارید؟",
        f"قیمت ثبت‌شده {toman_fa(price)} تومان است؛ قیمت امروز چقدر است؟" if price else "قیمت امروزش چقدر است؟",
        "امروز تا چه ساعتی باز هستید و اگر بیایم برایم نگه می‌دارید؟",
    ]


def _rng(shop_id: str, pid: int) -> random.Random:
    day = now_tehran().strftime("%Y-%m-%d")
    seed = hashlib.sha256(f"{shop_id}|{pid}|{day}".encode()).hexdigest()[:12]
    return random.Random(int(seed, 16))


def simulate_reply(item: dict, s: shops.Shop, pid: int, forced: str | None = None) -> dict:
    """Decide what the (simulated) shop answers. Facts come from the scenario, not from an LLM."""
    rng = _rng(s.shop_id, pid)
    now_state = item["open_now"]["state"]
    tier = item["freshness"]["tier"]
    outcome = forced if forced in OUTCOMES + ("closed",) else None
    if outcome is None:
        if now_state == "closed":
            outcome = "closed"
        else:
            r, acc = rng.random(), 0.0
            for name, p in zip(OUTCOMES, ODDS[tier]):
                acc += p
                if r <= acc:
                    outcome = name
                    break
            outcome = outcome or "confirmed"
    price = item.get("price")
    res = {"sid": s.sid, "outcome": outcome, "delay_s": round(1.2 + rng.random() * 3.2, 1),
           "confirmed_price": None, "in_stock": None, "hold_until": None, "hours_today": None, "text": None,
           "installments": None}
    close = item["open_now"].get("closes_at")
    if outcome == "closed":
        res["delay_s"] = 2.0
        res["text"] = None
        res["note"] = f"تماس بی‌پاسخ ماند؛ طبق ساعت ثبت‌شده فروشگاه الان بسته است ({item['open_now']['label']})."
        return res
    if outcome == "no_answer":
        res["delay_s"] = 6.0
        res["note"] = "پیام خوانده نشد و تلفن هم جواب نداد."
        return res
    hours_txt = f"تا ساعت {close} باز هستیم" if close else "امروز تا ۹ شب هستیم"
    res["hours_today"] = close or "۲۱:۰۰ (طبق گفتهٔ فروشنده)"
    if outcome == "out_of_stock":
        res["in_stock"] = False
        restock = rng.random() < 0.5
        res["text"] = "سلام، وقتتون بخیر. متأسفانه فعلاً تموم کردیم." + (
            " اگه بخواید تا فردا ظهر براتون جور می‌کنیم." if restock else " فعلاً هم معلوم نیست کی بیاد.")
        res["restock"] = "تا فردا ظهر" if restock else None
        return res
    res["in_stock"] = True
    if outcome == "price_changed" and price:
        pct = rng.choice([0.03, 0.05, 0.07, 0.09, 0.12, -0.04])
        new = int(round(price * (1 + pct), -4)) or price
        res["confirmed_price"] = new
        res["price_delta"] = new - price
        verb = "بالا رفته" if new > price else "یه کم پایین اومده"
        res["text"] = f"سلام، بله موجوده. ولی قیمتش {verb}، امروز {toman_fa(new)} تومنه. {hours_txt}."
    else:
        res["outcome"] = "confirmed"
        res["confirmed_price"] = price
        res["price_delta"] = 0
        res["text"] = (f"سلام، بله موجوده و قیمت همونه، {toman_fa(price)} تومن." if price
                       else "سلام، بله موجوده. قیمت رو حضوری می‌گیم.") + f" {hours_txt}."
    hold_h = rng.choice([2, 3, 4])
    res["hold_until"] = f"{fa_digits(hold_h)} ساعت"
    res["text"] += f" اگه تا {fa_digits(hold_h)} ساعت دیگه بیاید براتون نگه می‌داریم."
    if s.installments:
        res["installments"] = "، ".join(s.installments)
        res["text"] += f" قسطی هم با {s.installments[0]} داریم."
    return res


def _rank_confirmed(replies: list[dict], items: dict[int, dict]) -> list[dict]:
    ok = [r for r in replies if r["in_stock"]]
    ok.sort(key=lambda r: (r["confirmed_price"] is None, r["confirmed_price"] or 0, items[r["sid"]]["km"]))
    return ok


async def _summary_text(product: dict, replies: list[dict], items: dict[int, dict], best: dict | None,
                        n_alt: int) -> str:
    facts = []
    for r in replies:
        i = items[r["sid"]]
        facts.append(f"{i['name']}: {r['outcome']}, قیمت ثبت‌شده {i.get('price')}, قیمت تأییدشده {r['confirmed_price']}, "
                     f"فاصله {i['distance_label']}, {i['open_now']['label']}")
    fallback = _template_summary(replies, items, best, n_alt)
    if not llm.available():
        return fallback
    try:
        data = await asyncio.wait_for(llm.complete_json(
            "تو دستیار خرید حضوری هستی. نتیجهٔ استعلام (شبیه‌سازی‌شده) از فروشگاه‌ها را در حداکثر دو جملهٔ کوتاه فارسی "
            "جمع‌بندی کن: بهترین انتخاب تأییدشده و دلیلش، و اگر فروشگاهی ناموفق بود بگو جایگزین آماده است. "
            "عدد قیمت را با «تومان» بنویس. خط تیره بلند و ایموجی نگذار. خروجی JSON: {\"text\": \"...\"}",
            f"کالا: {product.get('title')}\nبهترین: {items[best['sid']]['name'] if best else 'هیچ'}\n"
            f"تعداد جایگزین آماده: {n_alt}\n" + "\n".join(facts), max_tokens=300), timeout=8)
        text = fa_text((data.get("text") or "").strip())
        return text or fallback
    except Exception:
        return fallback


def _template_summary(replies, items, best, n_alt) -> str:
    ok = sum(1 for r in replies if r["in_stock"])
    failed = len(replies) - ok
    if best:
        i = items[best["sid"]]
        price = f" با قیمت تأییدشدهٔ {toman_fa(best['confirmed_price'])} تومان" if best["confirmed_price"] else ""
        txt = f"{fa_digits(ok)} فروشگاه موجودی را تأیید کردند و بهترین گزینه {i['name']}{price} در {i['distance_label']} است."
    else:
        txt = "هیچ‌کدام از فروشگاه‌ها موجودی را تأیید نکردند."
    if failed and n_alt:
        txt += f" برای {fa_digits(failed)} فروشگاه ناموفق، {fa_digits(n_alt)} جایگزین آماده کردم."
    return txt


def prepare(pid: int, sids: list[int], ctx: Ctx) -> tuple[dict | None, dict, list[dict], dict]:
    """Drafts for each shop (shown to the user before anything is sent)."""
    product = catalog.product_details(pid, 0)
    if not product:
        return None, {}, [], {"type": "error", "text": "کالا پیدا نشد"}
    loose = Ctx(**{**ctx.model_dump(), "installments_only": False, "torob_pay_only": False, "open_only": False})
    ranked = shops.rank_shops_for_product(pid, loose)
    by_sid = {i["sid"]: i for i in ranked["items"]}
    targets = [by_sid[s] for s in sids if s in by_sid][:5]
    if not targets:
        return None, {}, [], {"type": "error", "text": "این فروشگاه‌ها این کالا را ثبت نکرده‌اند"}
    start = {"type": "inquiry_start", "product": {k: product[k] for k in ("pid", "title", "image", "price_min")},
             "shops": [{"sid": t["sid"], "name": t["name"], "price": t["price"], "phone": t["phone"],
                        "freshness": t["freshness"], "open_now": t["open_now"], "distance_label": t["distance_label"],
                        "draft": draft_message(product["title"], t["price"], ctx, t["name"])} for t in targets],
             "call_script": call_script(product["title"], targets[0]["price"]),
             "simulated": True,
             "notice": "شماره‌های دادهٔ هکاتون ساختگی‌اند؛ پاسخ فروشگاه‌ها شبیه‌سازی می‌شود. در نسخهٔ واقعی همین پیام از واتس‌اپ/بله یا تماس خودکار ارسال می‌شود."}
    return product, by_sid, targets, start


async def run_inquiry(pid: int, sids: list[int], ctx: Ctx, forced: dict[int, str] | None = None
                      ) -> AsyncIterator[dict]:
    product, by_sid, targets, start = await asyncio.to_thread(prepare, pid, sids, ctx)
    yield start
    if not product:
        return
    replies: list[dict] = []
    plans = []
    for t in targets:
        s = shops.shop(t["sid"])
        plans.append(simulate_reply(t, s, pid, (forced or {}).get(t["sid"])))
    queue: asyncio.Queue = asyncio.Queue()

    async def deliver(rep: dict):
        await asyncio.sleep(rep["delay_s"])
        await queue.put(rep)

    tasks = [asyncio.create_task(deliver(p)) for p in plans]
    for _ in plans:
        rep = await queue.get()
        replies.append(rep)
        yield {"type": "reply", **rep}
    await asyncio.gather(*tasks)

    confirmed = _rank_confirmed(replies, by_sid)
    best = confirmed[0] if confirmed else None
    failed = [r["sid"] for r in replies if not r["in_stock"]]
    alternatives, similar, leads = [], [], []
    if failed or not best:
        alt = await asyncio.to_thread(shops.rank_shops_for_product, pid, ctx, "best", set(sids))
        alternatives = [i for i in alt["items"] if i["open_at_visit"]["state"] != "closed"][:3]
        if len(alternatives) < 2:
            similar = await asyncio.to_thread(catalog.similar_products, pid, ctx, 3)
            leads = await asyncio.to_thread(shops.category_only_shops, product["category"], ctx,
                                            set(sids) | {a["sid"] for a in alternatives}, 3)
    yield {"type": "status", "text": "در حال جمع‌بندی پاسخ‌ها…"}
    text = await _summary_text(product, replies, by_sid, best, len(alternatives) + len(similar))
    yield {"type": "summary", "text": text, "best_sid": best["sid"] if best else None,
           "confirmed_sids": [r["sid"] for r in confirmed], "failed_sids": failed,
           "alternatives": alternatives, "similar": similar, "leads": leads}
    yield {"type": "done"}
