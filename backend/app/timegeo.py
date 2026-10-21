"""Tehran time, opening-hours evaluation, distances and rough travel estimates."""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from . import config

TEHRAN = timezone(timedelta(hours=3, minutes=30), "Asia/Tehran")  # no DST since 2022
DAY_FA = ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه"]  # index = weekday()
WEEK_ORDER = [5, 6, 0, 1, 2, 3, 4]  # Persian week starts on Saturday


def now_tehran() -> datetime:
    if config.FIXED_NOW:
        return datetime.fromisoformat(config.FIXED_NOW).replace(tzinfo=TEHRAN)
    return datetime.now(TEHRAN)


def fa_digits(s: object) -> str:
    return str(s).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


_NUM = re.compile(r"(?<![\w.])\d[\d,]*(?:\.\d+)?(?![\w.])")


def fa_text(text: str | None) -> str:
    """Model output -> UI text: Persian digits, thousands separators on big numbers, no em dashes."""
    if not text:
        return ""

    def num(m: re.Match) -> str:
        raw = m.group().replace(",", "")
        if "." not in raw and len(raw) >= 5:
            raw = f"{int(raw):,}".replace(",", "٫")
        return fa_digits(raw.replace(".", "٫"))

    return _NUM.sub(num, text).replace(" — ", "، ").replace("—", "، ")


def hhmm(minutes: int) -> str:
    minutes = minutes % 1440 if minutes != 1440 else 1440
    if minutes == 1440:
        return "۲۴:۰۰"
    return fa_digits(f"{minutes // 60:02d}:{minutes % 60:02d}")


# ---------------------------------------------------------------------------------------
# Visit time
# ---------------------------------------------------------------------------------------
VISIT_PRESETS = {
    "now": "همین الان",
    "evening": "امروز عصر",
    "tomorrow_morning": "فردا صبح",
    "tomorrow_evening": "فردا عصر",
}


def resolve_visit_time(visit: str | None, base: datetime | None = None) -> datetime:
    base = base or now_tehran()
    v = (visit or "now").strip()
    if v == "now":
        return base
    if v == "evening":
        t = base.replace(hour=18, minute=0, second=0, microsecond=0)
        return t if t > base else base
    if v == "tomorrow_morning":
        return (base + timedelta(days=1)).replace(hour=11, minute=0, second=0, microsecond=0)
    if v == "tomorrow_evening":
        return (base + timedelta(days=1)).replace(hour=18, minute=0, second=0, microsecond=0)
    try:
        t = datetime.fromisoformat(v)
        return t if t.tzinfo else t.replace(tzinfo=TEHRAN)
    except ValueError:
        return base


# ---------------------------------------------------------------------------------------
# Opening hours
# ---------------------------------------------------------------------------------------
@dataclass
class Shift:
    dow: int
    open_min: int
    close_min: int


def _intervals(shifts: list[Shift]) -> list[tuple[int, int]]:
    """Weekly minute intervals [start, end) measured from Monday 00:00; overnight shifts wrap."""
    out = []
    for s in shifts:
        start = s.dow * 1440 + s.open_min
        close = s.close_min if s.close_min > s.open_min else s.close_min + 1440
        out.append((start, s.dow * 1440 + close))
    return out


def open_status(shifts: list[Shift] | None, has_hours: bool, at: datetime) -> dict:
    """Status of a shop at a moment. Returns a dict that the UI can render directly."""
    if not has_hours or shifts is None:
        return {"state": "unknown", "label": "ساعت کاری ثبت نشده", "closes_in_min": None}
    week = 7 * 1440
    t = at.weekday() * 1440 + at.hour * 60 + at.minute
    ivs = _intervals(shifts)
    for start, end in ivs:
        for shift in (0, week, -week):
            if start + shift <= t < end + shift:
                left = end + shift - t
                close_label = hhmm(end % 1440 if end % 1440 else 1440)
                return {"state": "open", "label": f"باز است تا {close_label}", "closes_in_min": left,
                        "closes_at": close_label}
    if not ivs:
        return {"state": "closed", "label": "طبق ساعت ثبت‌شده همهٔ روزها بسته", "closes_in_min": None}
    # next opening
    best = None
    for start, _ in ivs:
        for shift in (0, week):
            d = start + shift - t
            if d > 0 and (best is None or d < best[0]):
                best = (d, start % week)
    delta, start = best
    dow, minute = divmod(start, 1440)
    if delta < 1440 and dow == at.weekday():
        when = f"امروز {hhmm(minute)}"
    elif delta < 2880 and dow == (at.weekday() + 1) % 7:
        when = f"فردا {hhmm(minute)}"
    else:
        when = f"{DAY_FA[dow]} {hhmm(minute)}"
    return {"state": "closed", "label": f"بسته است، باز می‌شود {when}", "closes_in_min": None,
            "opens_in_min": delta, "opens_at": when}


def week_table(shifts: list[Shift] | None, has_hours: bool, statuses: dict[int, str]) -> list[dict]:
    """Seven rows (Saturday first) for the shop detail sheet."""
    rows = []
    for dow in WEEK_ORDER:
        day_shifts = [s for s in (shifts or []) if s.dow == dow]
        if not has_hours:
            text = "نامشخص"
        elif day_shifts:
            text = " و ".join(f"{hhmm(s.open_min)} تا {hhmm(s.close_min)}" for s in day_shifts)
        elif statuses.get(dow) == "closed":
            text = "تعطیل"
        else:
            text = "نامشخص"
        rows.append({"dow": dow, "day": DAY_FA[dow], "text": text, "today": dow == now_tehran().weekday()})
    return rows


# ---------------------------------------------------------------------------------------
# Distance and travel
# ---------------------------------------------------------------------------------------
def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def travel_estimate(km: float) -> dict:
    """Very rough Tehran estimate: walk when close, otherwise car/taxi in city traffic."""
    road_km = km * 1.35  # street network detour factor
    if road_km <= 1.3:
        minutes = max(2, round(road_km / 4.8 * 60))
        return {"mode": "walk", "minutes": minutes, "label": f"حدود {fa_digits(minutes)} دقیقه پیاده"}
    minutes = round(road_km / 17 * 60 + 6)
    return {"mode": "car", "minutes": minutes, "label": f"حدود {fa_digits(minutes)} دقیقه با خودرو"}


def fmt_km(km: float) -> str:
    if km < 1:
        return f"{fa_digits(int(round(km * 1000, -1)))} متر"
    return f"{fa_digits(f'{km:.1f}'.rstrip('0').rstrip('.')).replace('.', '٫')} کیلومتر"
