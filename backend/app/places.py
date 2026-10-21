"""Preset Tehran locations for the location picker (approximate square/landmark coordinates)."""
from __future__ import annotations

PLACES = [
    {"id": "ferdowsi", "label": "میدان فردوسی", "lat": 35.6998, "lon": 51.4197},
    {"id": "jomhouri", "label": "خیابان جمهوری (پاساژ علاءالدین)", "lat": 35.6956, "lon": 51.4105},
    {"id": "baharestan", "label": "میدان بهارستان", "lat": 35.6921, "lon": 51.4323},
    {"id": "imam", "label": "میدان امام خمینی", "lat": 35.6862, "lon": 51.4219},
    {"id": "enghelab", "label": "میدان انقلاب", "lat": 35.7009, "lon": 51.3913},
    {"id": "valiasr_cross", "label": "چهارراه ولیعصر", "lat": 35.7008, "lon": 51.4057},
    {"id": "haft_tir", "label": "میدان هفت تیر", "lat": 35.7157, "lon": 51.4254},
    {"id": "valiasr_sq", "label": "میدان ولیعصر", "lat": 35.7123, "lon": 51.4069},
    {"id": "vanak", "label": "میدان ونک", "lat": 35.7575, "lon": 51.4097},
    {"id": "tajrish", "label": "میدان تجریش", "lat": 35.8046, "lon": 51.4339},
    {"id": "azadi", "label": "میدان آزادی", "lat": 35.6997, "lon": 51.3380},
    {"id": "sadeghieh", "label": "میدان صادقیه", "lat": 35.7182, "lon": 51.3328},
    {"id": "tehranpars", "label": "تهرانپارس", "lat": 35.7339, "lon": 51.5292},
]

BY_ID = {p["id"]: p for p in PLACES}


def find_place(text: str | None) -> dict | None:
    if not text:
        return None
    t = text.strip()
    if t in BY_ID:
        return BY_ID[t]
    for p in PLACES:
        if t in p["label"] or p["label"].split(" (")[0] in t:
            return p
    return None
