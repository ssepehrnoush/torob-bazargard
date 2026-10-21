"""Build a clean, typed SQLite database (with FTS5 search) from the Torob hackathon CSVs.

Standard library only. Run with an isolated interpreter:

    python -I build_db.py                       # build with default paths, verify, run demo queries
    python -I build_db.py --dataset DIR --db PATH
    python -I build_db.py --search "هندزفری بلوتوث"   # query an existing DB
    python -I build_db.py --demo                # only run the 10 sample queries

The CSVs are treated as untrusted data: they are parsed with csv/json only, never evaluated.
"""
from __future__ import annotations

import argparse
import collections
import csv
import json
import math
import os
import re
import sqlite3
import statistics
import sys
import time
import unicodedata
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))  # ...\agentic-hackathon
DEFAULT_DATASET = os.path.join(ROOT, "_downloads", "torob", "dataset")
DEFAULT_DB = os.path.join(HERE, "torob.db")

csv.field_size_limit(10**9)

# --------------------------------------------------------------------------------------
# Persian normalization
# --------------------------------------------------------------------------------------
_MAP = {
    # Arabic -> Persian letters
    "ي": "ی",  # ي -> ی
    "ى": "ی",  # ى -> ی
    "ئ": "ی",  # ئ -> ی
    "ك": "ک",  # ك -> ک
    "ة": "ه",  # ة -> ه
    "ۀ": "ه",  # ۀ -> ه
    "ہ": "ه",  # ہ -> ه
    "ھ": "ه",  # ھ -> ه
    "ە": "ه",  # ە -> ه
    "أ": "ا",  # أ -> ا
    "إ": "ا",  # إ -> ا
    "ٱ": "ا",  # ٱ -> ا
    "آ": "ا",  # آ -> ا  (users type both آیفون and ایفون)
    "ؤ": "و",  # ؤ -> و
    "ء": "",        # ء dropped (علاءالدین == علاالدین)
    "ـ": "",        # tatweel
    # punctuation
    "،": ",", "؛": ";", "؟": "?", "٫": ".", "٬": ",",
    "«": " ", "»": " ",
    # invisible / spacing characters
    "‌": " ",  # ZWNJ -> space (so می‌شود / می شود / میشود-with-space all agree)
    "‍": "", "‎": "", "‏": "", "​": "", "﻿": "",
    "‪": "", "‫": "", "‬": "", "‭": "", "‮": "",
    "⁦": "", "⁧": "", "⁨": "", "⁩": "",
    " ": " ", " ": " ", " ": " ",
}
for _i in range(10):
    _MAP[chr(0x06F0 + _i)] = str(_i)  # Persian digits
    _MAP[chr(0x0660 + _i)] = str(_i)  # Arabic-Indic digits
_TRANS = str.maketrans(_MAP)
_DIACRITICS = re.compile("[ً-ٰٟۖ-ۭ]")
_NON_DECIMAL_DOT = re.compile(r"(?<!\d)\.|\.(?!\d)")
_LETTER_DIGIT = re.compile(r"(?<=[^\W\d_])(?=\d)|(?<=\d)(?=[^\W\d_])")
_WS = re.compile(r"\s+")


def normalize_fa(text: str | None, split_alnum: bool = True) -> str:
    """Normalize Persian/English text for matching.

    Arabic->Persian letters, diacritics/tatweel removed, ZWNJ and odd spaces -> one space,
    Persian/Arabic digits -> ASCII, Latin lowercased, Arabic presentation forms folded (NFKC),
    dots kept only as decimal points, and (by default) letter/digit boundaries split so that
    "A55", "a55" and "a 55" all become "a 55".
    """
    if not text:
        return ""
    s = unicodedata.normalize("NFKC", text)
    s = s.translate(_TRANS)
    s = _DIACRITICS.sub("", s)
    s = s.lower()
    s = _NON_DECIMAL_DOT.sub(" ", s)
    if split_alnum:
        s = _LETTER_DIGIT.sub(" ", s)
    return _WS.sub(" ", s).strip()


# FTS5 tokenizer: unicode61 splits on anything that is not a letter/number; '.' is kept so
# decimals like 2.5 stay one token (normalize_fa already removed non-decimal dots).
FTS_TOKENIZE = "unicode61 remove_diacritics 2 tokenchars '.'"
_TOKEN = re.compile(r"[^\W_]+(?:\.[^\W_]+)*")

# Tiny query-time synonym table: groups of equivalent spellings (Persian <-> Latin brand names,
# joined vs split compounds). Raw text here; normalized once at import into SYNONYMS, which maps a
# token tuple to the list of alternative phrases. Multi-word entries are matched across words.
SYNONYM_GROUPS = [
    ["آیفون", "iphone"], ["اپل", "apple"], ["سامسونگ", "samsung"], ["گلکسی", "galaxy"],
    ["شیائومی", "شیاومی", "xiaomi"], ["ردمی", "redmi"], ["هواوی", "هوآوی", "huawei"],
    ["نوکیا", "nokia"], ["سونی", "sony"], ["کاسیو", "casio"], ["انکر", "anker"],
    ["داهوا", "dahua"], ["هایک ویژن", "هایکویژن", "hikvision"], ["فیلیپس", "philips"],
    ["بوش", "bosch"], ["لنوو", "lenovo"], ["ایسوس", "asus"],
    ["لپ تاپ", "لپتاپ", "laptop"], ["مک بوک", "مکبوک", "macbook"], ["ایرپاد", "ایرپادز", "airpods"],
    ["پاوربانک", "پاور بانک", "power bank"], ["هندزفری", "هندز فری"], ["هدست", "headset"],
    ["بلوتوث", "بلوتوثی", "bluetooth"], ["ال ای دی", "led"], ["وای فای", "وایفای", "wifi"],
    ["مدار بسته", "مداربسته"], ["جارو برقی", "جاروبرقی"], ["کولر گازی", "کولرگازی"],
    ["شارژر", "charger"], ["اسپیکر", "speaker"], ["تلویزیون", "tv"],
]


def _syn_index(groups):
    idx = {}
    for g in groups:
        phrases = [normalize_fa(x) for x in g]
        for p in phrases:
            idx[tuple(p.split())] = [q for q in phrases if q != p]
    return idx


SYNONYMS = _syn_index(SYNONYM_GROUPS)

# --------------------------------------------------------------------------------------
# Address parsing (mall / floor / unit are only present inside the free-text address)
# --------------------------------------------------------------------------------------
_MALL = re.compile(
    r"(?<!\S)(پاساژ|مجتمع تجاری|مجتمع|مرکز خرید|بازار|تیمچه|سرای|برج|ساختمان|مال)\s+"
    r"(.+?)(?=\s*,|\s+طبقه|\s+پلاک|\s+واحد|\s+غرفه|$)"
)
_MALL_KIND = {"پاساژ": "passage", "مجتمع تجاری": "complex", "مجتمع": "complex", "مرکز خرید": "mall",
              "مال": "mall", "بازار": "bazaar", "تیمچه": "bazaar", "سرای": "bazaar", "برج": "tower",
              "ساختمان": "building"}
_FLOOR = re.compile(r"طبقه\s*(.+?)(?=\s*,|\s+پلاک|\s+واحد|\s+غرفه|\s+مغازه|$)")
_UNIT = re.compile(r"(?:واحد|غرفه|مغازه)\s*(.+?)(?=\s*,|\s+طبقه|$)")
_PLAQUE = re.compile(r"پلاک\s*(.+?)(?=\s*,|\s+طبقه|\s+واحد|$)")
_FLOOR_WORDS = [
    ("زیر همکف", -1), ("زیرهمکف", -1), ("زیرزمین", -1), ("منفی یک", -1), ("منفی دو", -2), ("منفی سه", -3),
    ("همکف", 0), ("هم کف", 0), ("اول", 1), ("یکم", 1), ("دوم", 2), ("سوم", 3), ("چهارم", 4), ("پنجم", 5),
    ("ششم", 6), ("هفتم", 7), ("هشتم", 8), ("نهم", 9), ("دهم", 10), ("یازدهم", 11), ("دوازدهم", 12),
]


def parse_floor(raw: str | None) -> int | None:
    if not raw:
        return None
    t = raw.strip()
    m = re.match(r"^منفی\s*(\d+)", t)
    if m:
        return -int(m.group(1))
    m = re.match(r"^(-\s*)?(\d+)\s*(-)?", t)
    if m:
        n = int(m.group(2))
        return -n if (m.group(1) or m.group(3)) else n
    for w, n in _FLOOR_WORDS:
        if t.startswith(w):
            return n
    return None


def parse_address(addr: str | None) -> dict:
    a = normalize_fa(addr, split_alnum=False)
    out = {"mall_kind": None, "mall_name": None, "floor_raw": None, "floor_num": None, "unit": None}
    if not a:
        return out
    m = _MALL.search(a)
    if m:
        out["mall_kind"] = _MALL_KIND[m.group(1)]
        out["mall_name"] = (m.group(1) + " " + m.group(2)).strip()
    f = _FLOOR.search(a)
    if f:
        out["floor_raw"] = f.group(1).strip()
        out["floor_num"] = parse_floor(out["floor_raw"])
    u = _UNIT.search(a)
    if u:
        out["unit"] = u.group(1).strip()
    elif m:
        p = _PLAQUE.search(a, m.end())
        if p:
            out["unit"] = p.group(1).strip()
    return out


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]  # index == Python datetime.weekday()
PRICE_MIN_TOMAN = 1_000           # below this: placeholder ("1", "100") or per-unit junk
PRICE_MAX_TOMAN = 50_000_000_000  # above this: corrupted / concatenated numbers (e.g. 7.3e17)
OUTLIER_RATIO = 10.0              # vs median of the same product's in-range prices (>=3 offers)


def nz(v: str | None) -> bool:
    return v is not None and v != "" and v != "null"


def jload(v, default):
    if not nz(v):
        return default
    try:
        return json.loads(v)
    except ValueError:
        return default


def to_min(hms: str) -> int:
    h, m, s = (int(x) for x in hms.split(":"))
    return h * 60 + m + (1 if s >= 30 else 0)


def read_csv(path: str):
    with open(path, encoding="utf-8-sig", newline="") as fh:
        yield from csv.DictReader(fh)


SCHEMA = """
PRAGMA foreign_keys = OFF;
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE shops (
  sid INTEGER PRIMARY KEY,               -- stable integer id (also R-Tree id)
  shop_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,                    -- fake for 6,364 shops
  name_norm TEXT,
  address TEXT,
  area TEXT,                             -- CSV location_label: neighbourhood (31 values)
  lat REAL NOT NULL, lon REAL NOT NULL,
  mall_kind TEXT, mall_name TEXT,        -- parsed from address (normalized text)
  floor_raw TEXT, floor_num INTEGER,     -- 0 = ground (همکف), negative = basement
  unit TEXT,                             -- واحد/غرفه/مغازه, or پلاک after the mall name
  phone TEXT,                            -- ASCII digits; ALL phone numbers are fake
  instagram_handle TEXT, instagram_url TEXT, website_url TEXT,
  is_real_name INTEGER NOT NULL,         -- 1 when instagram or website is present (112 shops)
  supports_fast_delivery INTEGER,        -- 1 / 0 / NULL (unknown)
  has_hours INTEGER NOT NULL,            -- weekly_hours present
  accepts_torob_pay INTEGER NOT NULL,    -- any ترب‌پی payment option
  torob_pay_in_person INTEGER NOT NULL,  -- ترب‌پی with channel in_person
  has_installments INTEGER NOT NULL,     -- any BNPL/installment provider listed
  payment_providers TEXT,                -- comma list
  n_declared_categories INTEGER NOT NULL,
  n_offers INTEGER NOT NULL DEFAULT 0,
  n_products INTEGER NOT NULL DEFAULT 0,
  weekly_hours_json TEXT
);

CREATE TABLE shop_hours (               -- one row per real shift; closed/unsupported days have NULL times
  sid INTEGER NOT NULL, shop_id TEXT NOT NULL,
  dow INTEGER NOT NULL,                 -- 0=Mon ... 4=Fri, 5=Sat, 6=Sun (Python weekday)
  day TEXT NOT NULL,                    -- mon..sun as in CSV
  status TEXT NOT NULL,                 -- declared | closed | unsupported
  shift_no INTEGER,
  open_min INTEGER, close_min INTEGER   -- minutes after local (Tehran) midnight; 1440 = midnight
);

CREATE TABLE shop_categories (           -- categories a shop DECLARES (not evidence of stock!)
  sid INTEGER NOT NULL, shop_id TEXT NOT NULL, category_name TEXT NOT NULL
);

CREATE TABLE shop_payment_options (
  sid INTEGER NOT NULL, shop_id TEXT NOT NULL,
  provider_name TEXT NOT NULL, channel TEXT,
  min_price_toman INTEGER, max_price_toman INTEGER, category_names_json TEXT
);

CREATE TABLE categories (                -- flat: the export only has leaf category names
  category_name TEXT PRIMARY KEY,
  n_products INTEGER NOT NULL DEFAULT 0,
  n_offers INTEGER NOT NULL DEFAULT 0,
  n_shops_offering INTEGER NOT NULL DEFAULT 0,
  n_shops_declaring INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE products (
  pid INTEGER PRIMARY KEY,               -- stable integer id (== products_fts.rowid)
  product_id TEXT NOT NULL UNIQUE,
  title TEXT,                            -- persian_title as given
  title_norm TEXT,
  is_redacted INTEGER NOT NULL,          -- title == 'عنوان حذف‌شده برای انتشار' (849)
  brand TEXT, brand_norm TEXT,
  model TEXT,
  category_name TEXT NOT NULL,
  image_url TEXT,                        -- first image
  image_urls_json TEXT, n_images INTEGER NOT NULL,
  n_specs INTEGER NOT NULL,              -- rows in product_specs (specs are stored only there)
  n_offers INTEGER NOT NULL DEFAULT 0,
  n_shops INTEGER NOT NULL DEFAULT 0,
  n_priced_offers INTEGER NOT NULL DEFAULT 0,   -- offers with price_ok = 1
  min_price_toman INTEGER, median_price_toman INTEGER, max_price_toman INTEGER
);

CREATE TABLE product_specs (             -- the CSV specs JSON array, one row per entry, in order
  pid INTEGER NOT NULL, ord INTEGER NOT NULL,
  section TEXT, key TEXT, value TEXT
);

CREATE TABLE offers (
  oid INTEGER PRIMARY KEY,
  offer_id TEXT NOT NULL UNIQUE,
  shop_id TEXT NOT NULL, sid INTEGER NOT NULL,
  product_id TEXT NOT NULL, pid INTEGER NOT NULL,
  price_toman INTEGER,                   -- as given (toman); may be NULL / junk, see price_flag
  price_flag TEXT NOT NULL,              -- ok | missing | too_low | too_high | outlier
  price_ok INTEGER NOT NULL,             -- 1 when price_flag = 'ok'
  last_price_changed_at TEXT,            -- ISO-8601 UTC as given
  last_price_changed_ts INTEGER,         -- unix epoch seconds
  price_age_days REAL,                   -- vs dataset snapshot (max timestamp in file)
  seller_title TEXT,
  description TEXT,
  warranty_provider TEXT, warranty_months INTEGER, warranty_desc TEXT,
  is_pair_duplicate INTEGER NOT NULL     -- 1 if another offer from this shop maps to the same product
);
"""

INDEXES = """
CREATE INDEX ix_shops_latlon ON shops(lat, lon);
CREATE INDEX ix_shops_area ON shops(area);
CREATE INDEX ix_shops_mall ON shops(mall_name);
CREATE INDEX ix_hours_dow ON shop_hours(dow, open_min, close_min);
CREATE INDEX ix_hours_sid ON shop_hours(sid);
CREATE INDEX ix_shopcat_cat ON shop_categories(category_name);
CREATE INDEX ix_shopcat_sid ON shop_categories(sid);
CREATE INDEX ix_pay_sid ON shop_payment_options(sid);
CREATE INDEX ix_pay_provider ON shop_payment_options(provider_name, channel);
CREATE INDEX ix_products_cat ON products(category_name);
CREATE INDEX ix_products_brand ON products(brand_norm);
CREATE INDEX ix_specs_pid ON product_specs(pid, ord);
CREATE INDEX ix_offers_pid ON offers(pid, price_ok, price_toman);
CREATE INDEX ix_offers_sid ON offers(sid, pid);

-- cheapest sane offer per (shop, product): collapses the ~9.5k duplicated shop/product pairs
CREATE VIEW best_offers AS
SELECT o.sid, o.shop_id, o.pid, o.product_id, MIN(o.price_toman) AS price_toman,
       MAX(o.last_price_changed_ts) AS last_price_changed_ts, COUNT(*) AS n_listings
FROM offers o WHERE o.price_ok = 1 GROUP BY o.sid, o.pid;
"""


# --------------------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------------------
def build(dataset: str, db_path: str) -> dict:
    t0 = time.time()
    tmp = db_path + ".tmp"
    if os.path.exists(tmp):
        os.remove(tmp)
    con = sqlite3.connect(tmp)
    con.executescript("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=MEMORY;")
    con.executescript(SCHEMA)
    csv_counts = {}

    # ---------------- shops ----------------
    shop_rows, hour_rows, cat_rows, pay_rows = [], [], [], []
    sid_of = {}
    for i, r in enumerate(read_csv(os.path.join(dataset, "shops.csv")), start=1):
        sid_of[r["shop_id"]] = i
        addr = r["address"] if nz(r["address"]) else None
        pa = parse_address(addr)
        contacts = jload(r["contacts"], [])
        phone = None
        for c in contacts:
            if c.get("channel") == "phone" and c.get("display_number"):
                phone = normalize_fa(c["display_number"], split_alnum=False).replace(" ", "")
                break
        ig = jload(r["instagram"], None) or {}
        web = r["website_url"] if nz(r["website_url"]) else None
        cats = jload(r["category_names"], [])
        for c in cats:
            cat_rows.append((i, r["shop_id"], c))
        pays = jload(r["payment_options"], [])
        providers = []
        for p in pays:
            pay_rows.append((i, r["shop_id"], p.get("provider_name") or "", p.get("channel"),
                             p.get("min_price_toman"), p.get("max_price_toman"),
                             json.dumps(p.get("category_names") or [], ensure_ascii=False)))
            if p.get("provider_name") and p["provider_name"] not in providers:
                providers.append(p["provider_name"])
        torob = [p for p in pays if p.get("provider_name") == "ترب‌پی"]
        wh = jload(r["weekly_hours"], {})
        for day, v in wh.items():
            dow = DAYS.index(day)
            status = v.get("status") or "unknown"
            real = [sh for sh in (v.get("shifts") or [])
                    if not (sh.get("start_time") == "00:00:00" and sh.get("end_time") == "00:00:00")]
            if status == "declared" and real:
                for n, sh in enumerate(real, start=1):
                    o_m, c_m = to_min(sh["start_time"]), to_min(sh["end_time"])
                    if c_m == 0 and o_m > 0:
                        c_m = 1440
                    if sh["end_time"] in ("23:59:00", "23:59:59"):
                        c_m = 1440
                    hour_rows.append((i, r["shop_id"], dow, day, status, n, o_m, c_m))
            else:
                hour_rows.append((i, r["shop_id"], dow, day, status, None, None, None))
        sfd = r["supports_fast_delivery"]
        shop_rows.append((
            i, r["shop_id"], r["name"], normalize_fa(r["name"]), addr,
            r["location_label"] if nz(r["location_label"]) else None,
            float(r["lat"]), float(r["lon"]),
            pa["mall_kind"], pa["mall_name"], pa["floor_raw"], pa["floor_num"], pa["unit"],
            phone, ig.get("handle"), ig.get("profile_url"), web,
            1 if (ig or web) else 0,
            1 if sfd == "true" else (0 if sfd == "false" else None),
            1 if wh else 0,
            1 if torob else 0,
            1 if any(p.get("channel") == "in_person" for p in torob) else 0,
            1 if pays else 0,
            ", ".join(providers) or None,
            len(cats),
            r["weekly_hours"] if wh else None,
        ))
    csv_counts["shops"] = len(shop_rows)
    con.executemany(
        "INSERT INTO shops (sid, shop_id, name, name_norm, address, area, lat, lon, mall_kind, mall_name,"
        " floor_raw, floor_num, unit, phone, instagram_handle, instagram_url, website_url, is_real_name,"
        " supports_fast_delivery, has_hours, accepts_torob_pay, torob_pay_in_person, has_installments,"
        " payment_providers, n_declared_categories, weekly_hours_json)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", shop_rows)
    con.executemany("INSERT INTO shop_hours VALUES (?,?,?,?,?,?,?,?)", hour_rows)
    con.executemany("INSERT INTO shop_categories VALUES (?,?,?)", cat_rows)
    con.executemany("INSERT INTO shop_payment_options VALUES (?,?,?,?,?,?,?)", pay_rows)

    # ---------------- products ----------------
    REDACTED = "عنوان حذف‌شده برای انتشار"
    prod_rows, spec_rows = [], []
    pid_of = {}
    english_name = {}
    for i, r in enumerate(read_csv(os.path.join(dataset, "products.csv")), start=1):
        pid_of[r["product_id"]] = i
        title = r["persian_title"] if nz(r["persian_title"]) else None
        red = 1 if title == REDACTED else 0
        imgs = jload(r["image_urls"], [])
        specs = jload(r["specs"], [])
        for n, sp in enumerate(specs):
            spec_rows.append((i, n, sp.get("section"), sp.get("key"),
                              None if sp.get("value") is None else str(sp.get("value"))))
            if sp.get("key") in ("نام محصول", "نام انگلیسی", "مدل") and sp.get("value"):
                english_name.setdefault(i, []).append(str(sp["value"])[:120])
        brand = r["brand_name"] if nz(r["brand_name"]) else None
        prod_rows.append((
            i, r["product_id"], title, "" if red else normalize_fa(title), red,
            brand, normalize_fa(brand) or None, r["model"] if nz(r["model"]) else None,
            r["category_name"], imgs[0] if imgs else None,
            json.dumps(imgs, ensure_ascii=False) if imgs else None, len(imgs),
            len(specs),
        ))
    csv_counts["products"] = len(prod_rows)
    con.executemany(
        "INSERT INTO products (pid, product_id, title, title_norm, is_redacted, brand, brand_norm, model,"
        " category_name, image_url, image_urls_json, n_images, n_specs)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", prod_rows)
    con.executemany("INSERT INTO product_specs VALUES (?,?,?,?,?)", spec_rows)
    csv_counts["product_specs_entries"] = len(spec_rows)
    del spec_rows

    # ---------------- offers ----------------
    raw = list(read_csv(os.path.join(dataset, "offers.csv")))
    csv_counts["offers"] = len(raw)
    in_range = collections.defaultdict(list)
    for o in raw:
        if nz(o["price_toman"]):
            p = int(o["price_toman"])
            if PRICE_MIN_TOMAN <= p <= PRICE_MAX_TOMAN:
                in_range[o["product_id"]].append(p)
    med = {k: statistics.median(v) for k, v in in_range.items() if len(v) >= 3}
    ts_all = [datetime.fromisoformat(o["last_price_changed_at"]).timestamp()
              for o in raw if nz(o["last_price_changed_at"])]
    snapshot_ts = max(ts_all)
    pair_n = collections.Counter((o["shop_id"], o["product_id"]) for o in raw)
    offer_rows = []
    flags = collections.Counter()
    for i, o in enumerate(raw, start=1):
        price = int(o["price_toman"]) if nz(o["price_toman"]) else None
        if price is None:
            flag = "missing"
        elif price < PRICE_MIN_TOMAN:
            flag = "too_low"
        elif price > PRICE_MAX_TOMAN:
            flag = "too_high"
        else:
            m = med.get(o["product_id"])
            flag = "outlier" if m and (price >= OUTLIER_RATIO * m or price <= m / OUTLIER_RATIO) else "ok"
        flags[flag] += 1
        ts = None
        iso = o["last_price_changed_at"] if nz(o["last_price_changed_at"]) else None
        if iso:
            ts = datetime.fromisoformat(iso).timestamp()
        w = jload(o["warranty"], None) or {}
        offer_rows.append((
            i, o["offer_id"], o["shop_id"], sid_of[o["shop_id"]], o["product_id"], pid_of[o["product_id"]],
            price, flag, 1 if flag == "ok" else 0, iso, int(ts) if ts else None,
            round((snapshot_ts - ts) / 86400, 2) if ts else None,
            o["seller_title"], o["description"] if nz(o["description"]) else None,
            w.get("provider"), w.get("period_months"), w.get("description"),
            1 if pair_n[(o["shop_id"], o["product_id"])] > 1 else 0,
        ))
    con.executemany("INSERT INTO offers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", offer_rows)

    # ---------------- indexes first (the aggregate UPDATEs below rely on them) ----------------
    con.executescript(INDEXES)

    # ---------------- aggregates ----------------
    con.executescript("""
    UPDATE shops SET
      n_offers = (SELECT COUNT(*) FROM offers o WHERE o.sid = shops.sid),
      n_products = (SELECT COUNT(DISTINCT pid) FROM offers o WHERE o.sid = shops.sid);
    UPDATE products SET
      n_offers = (SELECT COUNT(*) FROM offers o WHERE o.pid = products.pid),
      n_shops = (SELECT COUNT(DISTINCT sid) FROM offers o WHERE o.pid = products.pid),
      n_priced_offers = (SELECT COUNT(*) FROM offers o WHERE o.pid = products.pid AND o.price_ok = 1),
      min_price_toman = (SELECT MIN(price_toman) FROM offers o WHERE o.pid = products.pid AND o.price_ok = 1),
      max_price_toman = (SELECT MAX(price_toman) FROM offers o WHERE o.pid = products.pid AND o.price_ok = 1);
    INSERT INTO categories (category_name, n_products)
      SELECT category_name, COUNT(*) FROM products GROUP BY category_name;
    INSERT OR IGNORE INTO categories (category_name) SELECT DISTINCT category_name FROM shop_categories;
    UPDATE categories SET
      n_offers = (SELECT COUNT(*) FROM products p JOIN offers o ON o.pid = p.pid
                  WHERE p.category_name = categories.category_name),
      n_shops_offering = (SELECT COUNT(DISTINCT o.sid) FROM products p JOIN offers o ON o.pid = p.pid
                          WHERE p.category_name = categories.category_name),
      n_shops_declaring = (SELECT COUNT(DISTINCT sid) FROM shop_categories sc
                           WHERE sc.category_name = categories.category_name);
    """)
    medians = {}
    for pid, price in con.execute("SELECT pid, price_toman FROM offers WHERE price_ok = 1"):
        medians.setdefault(pid, []).append(price)
    con.executemany("UPDATE products SET median_price_toman = ? WHERE pid = ?",
                    [(int(statistics.median(v)), k) for k, v in medians.items()])

    # ---------------- full-text search ----------------
    con.execute(f"""CREATE VIRTUAL TABLE products_fts USING fts5(
        title, brand, extra, category, seller_titles,
        tokenize = "{FTS_TOKENIZE}", prefix = '2 3')""")
    sellers = collections.defaultdict(list)
    for o in raw:
        sellers[pid_of[o["product_id"]]].append(o["seller_title"])
    fts_rows = []
    for (pid, _pidtxt, title, title_norm, red, brand, brand_norm, model, cat, *_rest) in prod_rows:
        seen = {title_norm}
        st = []
        for s in sellers.get(pid, []):
            n = normalize_fa(s)
            if n and n not in seen and "عنوان حذف شده برای انتشار" not in n:
                seen.add(n)
                st.append(n)
        extra = " | ".join(normalize_fa(x) for x in ([model] if model else []) + english_name.get(pid, []))
        fts_rows.append((pid, title_norm, brand_norm or "", extra, normalize_fa(cat), " | ".join(st)[:2000]))
    con.executemany("INSERT INTO products_fts (rowid, title, brand, extra, category, seller_titles)"
                    " VALUES (?,?,?,?,?,?)", fts_rows)
    con.execute("INSERT INTO products_fts(products_fts) VALUES ('optimize')")

    # ---------------- spatial + indexes + meta ----------------
    try:
        con.execute("CREATE VIRTUAL TABLE shops_rtree USING rtree(sid, min_lat, max_lat, min_lon, max_lon)")
        con.execute("INSERT INTO shops_rtree SELECT sid, lat, lat, lon, lon FROM shops")
    except sqlite3.OperationalError as e:  # R-Tree not compiled in: (lat, lon) index still exists
        print("R-Tree unavailable:", e)
    meta = {
        "built_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_dir": os.path.abspath(dataset),
        "snapshot_max_price_change_utc": datetime.fromtimestamp(snapshot_ts, timezone.utc).isoformat(),
        "price_unit": "toman",
        "hours_timezone": "Asia/Tehran (local wall-clock, UTC+03:30)",
        "price_rules": f"ok if {PRICE_MIN_TOMAN} <= price <= {PRICE_MAX_TOMAN} and within {OUTLIER_RATIO}x of product median (when >=3 offers)",
        "price_flags": json.dumps(flags),
        "csv_counts": json.dumps(csv_counts),
    }
    con.executemany("INSERT INTO meta VALUES (?,?)", list(meta.items()))
    con.commit()
    con.execute("ANALYZE")
    con.commit()
    con.execute("VACUUM")  # the aggregate UPDATEs leave free pages behind
    con.close()
    os.replace(tmp, db_path)
    print(f"built {db_path} ({os.path.getsize(db_path) / 1048576:.0f} MB) in {time.time() - t0:.1f}s")
    return csv_counts


README_COUNTS = {"shops": 6476, "products": 225903, "offers": 331506}  # README.txt + organizer


def count_csv_records(path: str) -> int:
    """Independent recount (fresh csv pass, records not lines: fields contain newlines)."""
    with open(path, encoding="utf-8-sig", newline="") as fh:
        r = csv.reader(fh)
        next(r)
        return sum(1 for _ in r)


def verify(db_path: str, csv_counts: dict, dataset: str) -> bool:
    con = sqlite3.connect(db_path)
    recount = {t: count_csv_records(os.path.join(dataset, t + ".csv")) for t in README_COUNTS}
    checks = []
    for t, want in README_COUNTS.items():
        checks.append((f"{t}.csv records vs README", f"SELECT {recount[t]}", want))
    checks += [
        ("shops", "SELECT COUNT(*) FROM shops", recount["shops"]),
        ("products", "SELECT COUNT(*) FROM products", recount["products"]),
        ("offers", "SELECT COUNT(*) FROM offers", recount["offers"]),
        ("products_fts", "SELECT COUNT(*) FROM products_fts", csv_counts["products"]),
        ("product_specs", "SELECT COUNT(*) FROM product_specs", csv_counts["product_specs_entries"]),
        ("offers->products orphans", "SELECT COUNT(*) FROM offers o LEFT JOIN products p USING(pid) WHERE p.pid IS NULL", 0),
        ("offers->shops orphans", "SELECT COUNT(*) FROM offers o LEFT JOIN shops s USING(sid) WHERE s.sid IS NULL", 0),
    ]
    ok = True
    for name, sql, want in checks:
        got = con.execute(sql).fetchone()[0]
        flag = "OK " if got == want else "BAD"
        ok &= got == want
        print(f"  [{flag}] {name}: db={got:,} expected={want:,}")
    for sql in ["SELECT price_flag, COUNT(*) FROM offers GROUP BY 1 ORDER BY 2 DESC",
                "SELECT COUNT(*) FROM shop_hours", "SELECT COUNT(*) FROM shop_categories",
                "SELECT COUNT(*) FROM shop_payment_options", "SELECT COUNT(*) FROM categories"]:
        print("  ", sql.split("FROM")[1].split()[0], con.execute(sql).fetchall())
    con.close()
    return ok


# --------------------------------------------------------------------------------------
# Search (used by the demo; the app can import normalize_fa / build_match / search)
# --------------------------------------------------------------------------------------
def _phrase(text: str) -> str | None:
    toks = _TOKEN.findall(text)
    return " ".join(toks) if toks else None


def query_units(query: str) -> list[list[str]]:
    """Split a raw query into units; each unit is a list of alternative normalized phrases.

    A raw word stays one phrase even if normalization splits it ("A55" -> "a 55"), and up to three
    consecutive words are merged when they form a known synonym ("مدار بسته" -> + "مداربسته").
    """
    words = [_phrase(normalize_fa(w)) for w in query.split()]
    words = [w for w in words if w]
    units, i = [], 0
    while i < len(words):
        for n in (3, 2, 1):
            if i + n > len(words):
                continue
            joined = " ".join(words[i:i + n])
            key = tuple(joined.split())
            if n == 1 or key in SYNONYMS:
                alts = [joined] + [a for a in SYNONYMS.get(key, []) if a != joined]
                units.append(alts)
                i += n
                break
    return units


def build_match(query: str, op: str = "AND") -> str:
    units = query_units(query)
    groups = []
    for idx, alts in enumerate(units):
        last = idx == len(units) - 1
        terms = []
        for p in alts:
            tail = p.split()[-1]
            star = "*" if last and len(tail) >= 2 and not tail.replace(".", "").isdigit() else ""
            terms.append(f'"{p}"{star}')
        groups.append("(" + " OR ".join(terms) + ")" if len(terms) > 1 else terms[0])
    return f" {op} ".join(groups)


def search(con: sqlite3.Connection, query: str, limit: int = 10):
    """Rank = bm25 over title(10) brand(4) extra(2) category(1.5) seller_titles(1), then two light
    re-rank boosts: (a) the title starts with the query's first word (Persian titles lead with the
    product type, so "گوشی سامسونگ A55" prefers phones over 'گلس ... A55'), (b) more shops stock it."""
    sql = """
      SELECT p.pid, p.title, p.brand, p.category_name, p.n_shops, p.min_price_toman,
             bm25(products_fts, 10.0, 4.0, 2.0, 1.5, 1.0) AS score, p.title_norm
      FROM products_fts JOIN products p ON p.pid = products_fts.rowid
      WHERE products_fts MATCH ? ORDER BY score LIMIT 300"""
    rows, m = [], ""
    units = query_units(query)
    if not units:
        return [], m
    for op in ("AND", "OR"):
        m = build_match(query, op)
        rows = con.execute(sql, (m,)).fetchall()
        if len(rows) >= 3 or len(units) == 1:
            break
    heads = tuple(units[0])

    def key(r):
        boost = 1 + 0.15 * math.log1p(r[4])
        if r[7] and r[7].startswith(heads):
            boost *= 1.6
        return r[6] * boost  # bm25 is negative: larger boost => better

    rows.sort(key=key)
    return [r[:7] for r in rows[:limit]], m


DEMO_QUERIES = [
    "آیفون ۱۳ پرو مکس",
    "گوشی سامسونگ A55",
    "هندزفری بلوتوثی شیائومی",
    "شارژر اپل ۲۰ وات",
    "دوربین مدار بسته داهوا",
    "پاوربانک انکر",
    "كابل افشان ۲.۵",          # Arabic kaf on purpose
    "ساعت کاسیو مردانه",
    "لپتاپ لنوو",               # joined spelling
    "محافظ برق یخچال",
]


def demo(db_path: str, queries=DEMO_QUERIES, k: int = 3):
    con = sqlite3.connect(db_path)
    for q in queries:
        rows, m = search(con, q, k)
        print(f"\nQ: {q}\n   MATCH {m}")
        for r in rows:
            price = f"{r[5]:,}" if r[5] else "-"
            print(f"   - {r[1]}  [{r[3]} | shops={r[4]} | min={price} toman]")
    con.close()


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dataset", default=DEFAULT_DATASET)
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--search")
    ap.add_argument("--demo", action="store_true")
    a = ap.parse_args()
    if a.search:
        demo(a.db, [a.search], 10)
        return
    if a.demo:
        demo(a.db)
        return
    counts = build(a.dataset, a.db)
    ok = verify(a.db, counts, a.dataset)
    demo(a.db)
    if not ok:
        sys.exit("count verification FAILED")


if __name__ == "__main__":
    main()
