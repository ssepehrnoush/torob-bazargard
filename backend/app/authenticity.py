"""Is this listing likely the original product? Evidence only from the data we have:
the seller's own title and description, the price against other shops for the same product, and
whether a warranty is given. The dataset has no user reviews, so they are never claimed as evidence.
The verdict is an estimate with a confidence, never presented as fact; only the shop's own answer to
an inquiry can confirm a copy ("confirmed_copy")."""
from __future__ import annotations

import re

from . import db
from .timegeo import fa_digits

_COPY = re.compile(r"(?<![\w])(کپی|مستر کپی|های ?کپی|طرح اصلی|طرح اورجینال|فیک|رپلیکا|replica|copy|aaa|غیر ?اصل)(?![\w])")
_ORIGINAL = re.compile(r"(?<![\w])(اورجینال|original|اصل|پلمپ|اکبند|گارانتی شرکتی|رجیستر|ریجستر)(?![\w])")

LABELS = {
    "declared_copy": "فروشنده خودش نوشته غیراصل است",
    "suspicious": "مشکوک به غیراصل",
    "likely_original": "به احتمال زیاد اصل",
    "unknown": "اصالت نامعلوم",
}


def assess(o: dict, median: int | None, n_priced: int) -> dict:
    text = db.normalize_fa(" ".join(x for x in (o.get("seller_title"), o.get("description")) if x), split_alnum=False)
    copy = _COPY.search(text)
    orig = _ORIGINAL.search(text.replace(copy.group(0), "") if copy else text)
    price = o.get("price_toman") if o.get("price_ok") else None
    ratio = price / median if price and median and n_priced >= 3 else None
    warranty = bool(o.get("warranty_desc") or o.get("warranty_months") or o.get("warranty_provider"))
    reasons: list[str] = []
    if copy:
        status, conf = "declared_copy", 90
        reasons.append(f"در عنوان یا توضیح فروشنده آمده «{copy.group(0)}»")
    elif ratio is not None and ratio < 0.6:
        status, conf = "suspicious", 70
        reasons.append(f"قیمتش {fa_digits(round((1 - ratio) * 100))}٪ پایین‌تر از میانهٔ فروشگاه‌های دیگر است")
    elif ratio is not None and ratio < 0.78 and not orig and not warranty:
        status, conf = "suspicious", 55
        reasons.append(f"قیمتش {fa_digits(round((1 - ratio) * 100))}٪ زیر میانه است و نشانه‌ای از اصالت یا گارانتی ندارد")
    elif orig or warranty:
        status, conf = "likely_original", 70 if (orig and warranty) else 60
        if orig:
            reasons.append(f"فروشنده نوشته «{orig.group(0)}»")
        if warranty:
            reasons.append("گارانتی ثبت کرده")
    else:
        status, conf = "unknown", 0
        reasons.append("نشانهٔ روشنی در دادهٔ ترب نیست")
    return {"status": status, "confidence": conf, "label": LABELS[status], "reasons": reasons}
