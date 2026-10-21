"""Core behaviour tests. Run from backend/:  python -m pytest -q"""
from datetime import datetime

import pytest

from app import agent, catalog, config, shops
from app.models import Ctx
from app.timegeo import TEHRAN, Shift, fa_text, open_status, travel_estimate

needs_db = pytest.mark.skipif(not config.DB_PATH.is_file(), reason="database not built")

MON = datetime(2026, 10, 19, 12, 0, tzinfo=TEHRAN)  # a Monday


def at(hour: int, minute: int = 0, day: int = 0) -> datetime:
    return MON.replace(day=19 + day, hour=hour, minute=minute)


def test_open_status_inside_and_after_shift():
    shifts = [Shift(0, 600, 1140), Shift(1, 600, 1140)]  # Mon/Tue 10:00-19:00
    assert open_status(shifts, True, at(12))["state"] == "open"
    assert open_status(shifts, True, at(18, 30))["closes_in_min"] == 30
    closed = open_status(shifts, True, at(20))
    assert closed["state"] == "closed" and "فردا" in closed["label"]


def test_open_status_unknown_and_overnight():
    assert open_status(None, False, at(12))["state"] == "unknown"
    night = [Shift(0, 1200, 120)]  # Mon 20:00 -> Tue 02:00
    assert open_status(night, True, at(1, 0, day=1))["state"] == "open"


def test_fa_text_formats_numbers_but_keeps_model_names():
    out = fa_text("قیمت 5190000 تومان — گوشی A55 و 2.5 کیلو")
    assert "۵٬۱۹۰٬۰۰۰" in out and "A55" in out and "۲٫۵" in out and "—" not in out


def test_travel_estimate_walk_vs_car():
    assert travel_estimate(0.5)["mode"] == "walk"
    assert travel_estimate(5)["mode"] == "car"


@needs_db
def test_search_finds_phones_with_category_filter():
    res = catalog.search_products("گوشی سامسونگ", Ctx(), category="گوشی موبایل", limit=5)
    assert res["items"] and all(i["category"] == "گوشی موبایل" for i in res["items"])


@needs_db
def test_duplicate_catalogue_entries_are_pooled():
    pid = catalog.search_products("شارژر اپل ۲۰ وات سه پین", Ctx(), limit=3)["items"][0]["pid"]
    assert len(shops.siblings(pid)) >= 1
    ranked = shops.rank_shops_for_product(pid, Ctx())
    assert ranked["stats"]["total"] >= 1
    for i in ranked["items"]:
        assert i["stock"]["state"] == "unconfirmed"  # registered price is never presented as confirmed
        assert "alt_open" in i and "price_warning" in i


@needs_db
def test_installment_filter_hides_and_counts():
    pid = catalog.search_products("شارژر اپل ۲۰ وات سه پین", Ctx(), limit=1)["items"][0]["pid"]
    allr = shops.rank_shops_for_product(pid, Ctx())
    inst = shops.rank_shops_for_product(pid, Ctx(installments_only=True))
    assert all(i["installments"] for i in inst["items"])
    assert inst["stats"]["hidden"]["installments"] == allr["stats"]["total"] - inst["stats"]["total"]


@needs_db
def test_agent_drops_hallucinated_products():
    _, sess = agent.session(None)
    ev = agent.terminal_event("show_products", {"message": "x", "picks": [{"pid": 999999999, "why": "?"}]}, Ctx(), sess)
    assert ev is None
