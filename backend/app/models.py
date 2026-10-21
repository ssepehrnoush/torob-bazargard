"""Request context shared by the REST endpoints and the agent."""
from __future__ import annotations

from pydantic import BaseModel, Field

DEFAULT_LAT, DEFAULT_LON = 35.6998, 51.4197  # میدان فردوسی: centre of the dataset's densest area


class Ctx(BaseModel):
    lat: float = DEFAULT_LAT
    lon: float = DEFAULT_LON
    place: str = "میدان فردوسی"
    # how far the user is willing to go: by arrival time (default) or by straight-line km
    range_mode: str = "km"  # "time" | "km"
    range_minutes: int = Field(20, ge=5, le=120)
    radius_km: float = Field(5.0, ge=0.3, le=40)
    travel_mode: str = "car"  # walk | car | transit
    budget_min: int | None = None
    budget_max: int | None = None
    visit: str = "now"  # now | evening | tomorrow_morning | tomorrow_evening | ISO datetime
    installments_only: bool = False
    torob_pay_only: bool = False
    open_only: bool = False
    originality: str = "any"  # any | original_only


def range_label(ctx: Ctx) -> str:
    from .timegeo import fa_digits
    from .travel import MODES
    if ctx.range_mode == "time":
        return f"تا {fa_digits(ctx.range_minutes)} دقیقه {MODES.get(ctx.travel_mode, 'با ماشین')}"
    return f"تا {fa_digits(ctx.radius_km)} کیلومتر"
