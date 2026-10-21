"""How the user gets to a shop: walk, own car, or public transport (Tehran metro + walk/taxi legs).

Times are estimates and are always labelled as such. Metro lines and stations come from OpenStreetMap
(`geo/tehran_metro.json`, built from the subway route relations); interchanges are stations of
different lines within 250 m of each other.
"""
from __future__ import annotations

import json
import math
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from .timegeo import fa_digits, haversine_km

MODES = {"walk": "پیاده", "car": "با ماشین", "transit": "با مترو و اتوبوس"}
WALK_KMH, TAXI_KMH, METRO_KMH = 4.8, 17.0, 32.0
DETOUR = 1.33  # street network vs straight line
METRO_WAIT_MIN, TRANSFER_MIN, DWELL_MIN = 4.0, 5.0, 0.5
# Approximate box of Tehran's central "طرح ترافیک" zone (camera-enforced; private cars need a permit).
TRAFFIC_ZONE = (35.660, 35.716, 51.385, 51.455)


def _fa_min(m: float) -> str:
    return fa_digits(max(1, round(m)))


def walk_minutes(km: float) -> float:
    return km * DETOUR / WALK_KMH * 60


def car_minutes(km: float, at: datetime | None = None) -> float:
    """Door to door by car or taxi in Tehran traffic, including finding a place to stop."""
    speed = 17.0
    if at is not None:
        h, dow = at.hour, at.weekday()  # Mon=0 ... Thu=3, Fri=4
        if dow == 4:
            speed = 26.0
        elif dow == 3:
            speed = 20.0 if 9 <= h < 20 else 24.0
        elif 7 <= h < 10 or 16 <= h < 20:
            speed = 12.5
    speed *= 1 + min(km, 15) / 15 * 0.6  # longer trips use highways and go faster on average
    return km * 1.35 / speed * 60 + 6


def in_traffic_zone(lat: float, lon: float) -> bool:
    a, b, c, d = TRAFFIC_ZONE
    return a <= lat <= b and c <= lon <= d


# ---------------------------------------------------------------------------------------
# Metro network
# ---------------------------------------------------------------------------------------
@lru_cache(maxsize=1)
def network() -> dict:
    raw = json.loads((Path(__file__).parent / "geo" / "tehran_metro.json").read_text(encoding="utf-8"))
    lines = {}
    for ref, stops in raw.items():
        seq = [{"name": s["name"].removeprefix("مترو ").strip(), "lat": s["lat"], "lon": s["lon"]} for s in stops]
        lines[ref] = seq
    stations = []  # (line, index, station)
    for ref, seq in lines.items():
        for i, s in enumerate(seq):
            stations.append((ref, i, s))
    return {"lines": lines, "stations": stations}


def line_label(ref: str) -> str:
    return f"خط {fa_digits(ref.rstrip('b'))}"


def _ride_minutes(ref: str, i: int, j: int) -> float:
    seq = network()["lines"][ref]
    lo, hi = sorted((i, j))
    km = sum(haversine_km(seq[k]["lat"], seq[k]["lon"], seq[k + 1]["lat"], seq[k + 1]["lon"]) for k in range(lo, hi))
    return km / METRO_KMH * 60 + (hi - lo) * DWELL_MIN


@lru_cache(maxsize=None)
def _interchanges(r1: str, r2: str) -> tuple[tuple[int, int], ...]:
    lines = network()["lines"]
    return tuple((k1, k2) for k1, t1 in enumerate(lines[r1]) for k2, t2 in enumerate(lines[r2])
                 if haversine_km(t1["lat"], t1["lon"], t2["lat"], t2["lon"]) <= 0.25)


def quick_minutes(km: float, mode: str, at: datetime | None = None) -> float:
    """Cheap estimate used when ranking many shops at once (no route search)."""
    if mode == "walk" or km <= 0.4:
        return walk_minutes(km)
    if mode == "transit":
        return walk_minutes(km) if km <= 1.2 else 10 + km * DETOUR / 24 * 60
    return car_minutes(km, at)


def _near(lat: float, lon: float, k: int = 6, max_km: float = 3.0):
    out = []
    for ref, i, s in network()["stations"]:
        d = haversine_km(lat, lon, s["lat"], s["lon"])
        if d <= max_km:
            out.append((d, ref, i, s))
    out.sort(key=lambda x: x[0])
    return out[:k]


def _access(km: float) -> tuple[str, float]:
    if km <= 1.2:
        return "walk", walk_minutes(km)
    return "taxi", km * 1.35 / TAXI_KMH * 60 + 4


def _leg(kind: str, minutes: float, **kw) -> dict:
    labels = {"walk": "پیاده", "taxi": "تاکسی یا اتوبوس", "metro": "مترو", "transfer": "تعویض خط"}
    return {"mode": kind, "label": labels[kind], "minutes": max(1, round(minutes)), **kw}


@lru_cache(maxsize=4096)
def _transit(o_lat: float, o_lon: float, d_lat: float, d_lon: float) -> dict:
    direct_km = haversine_km(o_lat, o_lon, d_lat, d_lon)
    if direct_km <= 1.2:
        m = walk_minutes(direct_km)
        return {"minutes": round(m), "legs": [_leg("walk", m, to="فروشگاه")], "summary": f"حدود {_fa_min(m)} دقیقه پیاده"}
    best = None
    lines = network()["lines"]
    for d1, r1, i1, s1 in _near(o_lat, o_lon):
        for d2, r2, i2, s2 in _near(d_lat, d_lon):
            a_kind, a_min = _access(d1)
            e_kind, e_min = _access(d2)
            if r1.rstrip("b") == r2.rstrip("b") and r1 == r2:
                ride = _ride_minutes(r1, i1, i2)
                total = a_min + METRO_WAIT_MIN + ride + e_min
                legs = [_leg(a_kind, a_min, to=s1["name"]),
                        _leg("metro", METRO_WAIT_MIN + ride, line=line_label(r1), board=s1["name"], alight=s2["name"],
                             stops=abs(i2 - i1)),
                        _leg(e_kind, e_min, to="فروشگاه")]
            else:
                # one transfer: an r1 station within 250 m of an r2 station
                choice = None
                for k1, k2 in _interchanges(r1, r2):
                    m = _ride_minutes(r1, i1, k1) + _ride_minutes(r2, k2, i2)
                    if choice is None or m < choice[0]:
                        choice = (m, k1, k2, lines[r1][k1])
                if not choice:
                    continue
                ride, k1, k2, t1 = choice
                total = a_min + METRO_WAIT_MIN + ride + TRANSFER_MIN + e_min
                legs = [_leg(a_kind, a_min, to=s1["name"]),
                        _leg("metro", METRO_WAIT_MIN + _ride_minutes(r1, i1, k1), line=line_label(r1), board=s1["name"],
                             alight=t1["name"], stops=abs(k1 - i1)),
                        _leg("transfer", TRANSFER_MIN, at=t1["name"]),
                        _leg("metro", _ride_minutes(r2, k2, i2), line=line_label(r2), board=t1["name"],
                             alight=s2["name"], stops=abs(i2 - k2)),
                        _leg(e_kind, e_min, to="فروشگاه")]
            if best is None or total < best[0]:
                best = (total, legs)
    taxi = direct_km * 1.35 / TAXI_KMH * 60 + 4
    if best is None or best[0] > taxi * 1.15:
        return {"minutes": round(taxi), "legs": [_leg("taxi", taxi, to="فروشگاه")],
                "summary": f"حدود {_fa_min(taxi)} دقیقه با تاکسی یا اتوبوس (مترو این مسیر سریع‌تر نیست)"}
    total, legs = best
    metro_legs = [l for l in legs if l["mode"] == "metro"]
    via = " و ".join(l["line"] for l in metro_legs)
    return {"minutes": round(total), "legs": legs,
            "summary": f"حدود {_fa_min(total)} دقیقه با {via}، پیاده شدن در {metro_legs[-1]['alight']}"}


def transit_route(o_lat: float, o_lon: float, d_lat: float, d_lon: float) -> dict:
    return _transit(round(o_lat, 4), round(o_lon, 4), round(d_lat, 4), round(d_lon, 4))


def estimate(km: float, mode: str, at: datetime | None = None,
             origin: tuple[float, float] | None = None, dest: tuple[float, float] | None = None) -> dict:
    """{mode, minutes, label, legs?, warning?} for one trip."""
    if mode == "walk" or km <= 0.4:
        m = walk_minutes(km)
        return {"mode": "walk", "minutes": round(max(1, m)), "label": f"حدود {_fa_min(m)} دقیقه پیاده"}
    if mode == "transit" and origin and dest:
        r = transit_route(*origin, *dest)
        return {"mode": "transit", "minutes": r["minutes"], "label": r["summary"], "legs": r["legs"]}
    m = car_minutes(km, at)
    out = {"mode": "car", "minutes": round(m), "label": f"حدود {_fa_min(m)} دقیقه با ماشین"}
    if km <= 1.0:
        out["label"] += f"؛ پیاده هم حدود {_fa_min(walk_minutes(km))} دقیقه است"
    if dest and in_traffic_zone(*dest):
        out["warning"] = "مقصد داخل محدودهٔ طرح ترافیک است؛ ماشین شخصی مجوز می‌خواهد"
    return out
