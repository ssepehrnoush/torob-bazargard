"""Request context shared by the REST endpoints and the agent."""
from __future__ import annotations

from pydantic import BaseModel, Field

DEFAULT_LAT, DEFAULT_LON = 35.6998, 51.4197  # میدان فردوسی: centre of the dataset's densest area


class Ctx(BaseModel):
    lat: float = DEFAULT_LAT
    lon: float = DEFAULT_LON
    place: str = "میدان فردوسی"
    radius_km: float = Field(5.0, ge=0.3, le=40)
    budget_min: int | None = None
    budget_max: int | None = None
    visit: str = "now"  # now | evening | tomorrow_morning | tomorrow_evening | ISO datetime
    installments_only: bool = False
    torob_pay_only: bool = False
    open_only: bool = False
