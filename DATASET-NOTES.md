# Torob hackathon dataset: notes

Source: `_downloads/torob/dataset.zip` (60 MB) unzipped to `_downloads/torob/dataset/`.
Export header in `README.txt`: "Starcoach v16 cap300 CSV export". UTF-8 CSV with a header row; nested
values are compact JSON strings; missing values are the literal string `null`.
Snapshot: newest price-change timestamp is **2026-10-13 00:02 UTC**.

Built artifacts:

- `torob/data/build_db.py`: standard-library builder + search helper (`python -I build_db.py`, about 35 s).
- `torob/data/torob.db`: SQLite, 426 MB. All row counts verified against the CSVs and the README.
- `torob/data/explore/*.py`: the profiling scripts that produced the numbers below (`python -I -X utf8 <script> <dataset_dir>`).

## 1. What the export actually contains vs. what the organizer described

| Organizer said | Reality in this export |
|---|---|
| Product English title | **No column.** Latin text is mixed into `persian_title` (58.8% of titles contain Latin letters; 1,851 have no Persian at all). A `model` column exists (1.8% filled). |
| Product description | **No column.** Offers have a `description` (11.6% filled). |
| Shop business type, description, images, Torob history, licenses | **Absent** (README: "Shop descriptions and catalogue coverage are omitted"). |
| Short address + location notes (mall, floor, unit) | `location_label` is a **neighbourhood** label (30 values). Mall/floor/unit exist **only inside the free-text `address`**; `build_db.py` parses them. |
| Contacts: phone, WhatsApp, Bale | **Only one phone per shop**, channel always `phone`, Persian digits, all fake. |
| Torob Pay, installments, kalabarg | One `payment_options` JSON list (266 shops). Torob Pay and BNPL providers are there. **No kalabarg field, and the word کالابرگ appears nowhere in the data.** |
| Instant delivery | `supports_fast_delivery` true/false/null. |
| Price unit | Only `price_toman`. Values check out as **toman** (see 5.2). |
| Weekly hours for some shops | Yes, 4,473 shops (69%). |

## 2. Files, columns, fill rates

Fill rate = share of rows that are not empty, not `null`, and not an empty JSON `[]`/`{}`.

### shops.csv: 6,476 rows, 13 columns, key `shop_id`

| Column | Type | Fill | Examples / notes |
|---|---|---|---|
| shop_id | text `shop_` + 24 hex | 100% (unique) | `shop_3f93a30a9e66c6dece07cdff` |
| name | text | 100% (unique) | `فرورا رویس`, `موبایل تخت جمشید`. 6,364 are fake; no Latin letters in any name. |
| address | text | 99.98% (1 blank) | `خیابان جمهوری، نبش شیخ هادی، پاساژ علالدین 2، طبقه 6، واحد 622`; median 66 chars |
| location_label | text, 30 distinct | 99.98% (1 blank) | `فردوسی`, `شیخ هادی`, `بهارستان` |
| lat / lon | float | 100% | `35.694991526310005` / `51.407137248405895` |
| category_names | JSON list of category names | 72.3% | `["گوشی موبایل","لوازم جانبی موبایل و تبلت"]`; median 2, max 363 per shop; 3,988 distinct |
| contacts | JSON list `[{channel, display_number}]` | 100% | always exactly 1 entry, `{"channel":"phone","display_number":"۰۲۱۲۶۴۶۷۱۸۰"}` (fake) |
| instagram | JSON `{handle, profile_url}` | 0.3% (22) | `{"handle":"Ariya__co","profile_url":"https://www.instagram.com/Ariya__co/"}` |
| website_url | text URL | 1.4% (90) | `https://takhtjamshidmobile.com/`; no shop has both IG and website, so 22 + 90 = the 112 real-named shops |
| payment_options | JSON list `[{provider_name, channel, category_names, min_price_toman, max_price_toman}]` | 4.1% (266 shops, 385 entries) | `[{"category_names":[],"channel":"in_person","max_price_toman":null,"min_price_toman":null,"provider_name":"دیجی پی"}]` |
| supports_fast_delivery | bool text | 24.7% known | `true` 1,168, `false` 433, `null` 4,875 |
| weekly_hours | JSON object (see 4.1) | 69.1% (4,473) | rest are `{}` |

### products.csv: 225,903 rows, 7 columns, key `product_id`

| Column | Type | Fill | Examples / notes |
|---|---|---|---|
| product_id | text `product_` + 24 hex | 100% (unique) | `product_47796232454501a5e8179e26` |
| persian_title | text | ~100% | `لنز دوربین سونی مدل E 70-350mm f/4.5-6.3 G OSS`; median 38 chars, max 499; 219,509 distinct |
| category_name | text (leaf category) | 100% | `لنز دوربین`, `لاک ژل`, `سوکت و کانکتور`; 3,428 distinct |
| brand_name | text | 25.5% (57,634) | `سونی`, `لنوو`, `یاکسون`; 2,249 distinct, Persian transliterations (only `WANBO`, `ORO` are Latin; `90` is a brand) |
| model | text | 1.8% (4,056) | `a 34`, `iphone 13 pro max`, `loq`: lowercased, spaces between letters and digits |
| image_urls | JSON list of URLs | 99.5% | `["https://image.torob.com/base/images/Ih/rU/IhrUr41_4rIdS9M9.jpg", ...]`; 0/1/2 images = 1,219 / 100,250 / 124,434; all on image.torob.com; jpg 78%, webp 22% |
| specs | JSON list `[{key, section, value}]` | 64.0% | `{"key":"وزن","section":"مشخصات کلی","value":"625 گرم"}`; up to 258 entries, 1,227,511 total; section is `مشخصات کلی` 99.99% of the time; top keys برند, رنگ, وزن, ابعاد, جنس بدنه, کشور سازنده |

### offers.csv: 331,506 rows, 8 columns, key `offer_id`

| Column | Type | Fill | Examples / notes |
|---|---|---|---|
| offer_id | text `offer_` + 24 hex | 100% (unique) | `offer_98512b2127469a2d20a64b3b` |
| shop_id | FK to shops | 100% | only **3,792** distinct shops have offers |
| product_id | FK to products | 100% | all 225,903 products have at least 1 offer |
| price_toman | integer | 95.5% (15,083 null) | `610000`, `28500000`; see 5.2 for junk values |
| last_price_changed_at | ISO-8601 UTC with microseconds | 99.8% (769 null) | `2026-09-14T08:57:27.401253+00:00` |
| seller_title | text (the shop's own listing title) | 100% | `کارت صدا پریسونوس Presonus AudioBox 96 USB Sound Card`; equals the product title in 54% of offers |
| description | text, up to 1,000 chars | 11.6% | `محصول اصلی (اورجینال)`; 39% multi-line, 6% contain emoji, no HTML |
| warranty | JSON `{provider, period_months, description}` | 17.8% (58,943) | `{"description":null,"period_months":24,"provider":"شرکتی"}`; three shapes: description only (44,539), provider + months (8,805), provider only (5,599) |

### How the tables join

```
shops.shop_id 1 ── N offers.shop_id
products.product_id 1 ── N offers.product_id
products.category_name  ~  shops.category_names[]   (same leaf vocabulary, text match)
```

- No orphans in either direction of the offer foreign keys.
- Each shop has at most 300 distinct products (461 shops sit exactly at the cap). One shop can still have up to 1,346 offer rows, because several offers can map to the same product.
- A shop's `category_names` always contains the category of every product it offers: 100% of offers pass this check. It also lists extra categories (560 names exist only on shops). Per the organizer, a declared category is **not** evidence that the shop stocks a product.
- 2,684 shops (41%) have **no offers at all**. 887 of them carry only declared categories, and 1,462 have hours.
- 190,649 products (84%) are sold by exactly one shop. 35,254 are sold by 2 or more shops, and the maximum is 59 (`شارژر اپل توان 20 وات سه پین`).

## 3. Categories

- **Hierarchy depth = 1 (flat leaf names only).** No parent/child structure is exported. Torob does have a top level internally: the only place it surfaces is a payment-option restriction (`موبایل و کالای دیجیتال`, `لپ‌تاپ، کامپیوتر، اداری`). Eight leaf names contain `/` or `|` (e.g. `مودم LTE/3G/4G/5G`), but those are not separators.
- All 3,428 product categories have offers. The DB `categories` table adds the 560 shop-only names, which gives 3,988 rows.

Top 30 categories by offer count (offers / products / shops offering):

| # | Category | Gloss | Offers | Products | Shops |
|---|---|---|---|---|---|
| 1 | سیم و کابل برق ساختمان | building wire & cable | 7,837 | 5,274 | 274 |
| 2 | دوربین مدار بسته | CCTV cameras | 5,903 | 3,467 | 259 |
| 3 | ژنراتور و موتور برق | generators | 3,496 | 1,790 | 133 |
| 4 | تاچ و ال سی دی گوشی و تبلت | phone/tablet screens | 3,285 | 1,418 | 43 |
| 5 | چراغ پنلی و سقفی | panel/ceiling lights | 3,220 | 2,370 | 218 |
| 6 | پمپ خانگی و صنعتی | pumps | 3,093 | 1,732 | 151 |
| 7 | ساعت مچی عقربه‌ ای و دیجیتالی | wristwatches | 2,903 | 2,510 | 37 |
| 8 | سوکت و کانکتور | sockets & connectors | 2,671 | 2,077 | 269 |
| 9 | کلید و فیوز مینیاتوری | miniature breakers | 2,659 | 1,507 | 206 |
| 10 | هدفون، هدست و هندزفری | headphones/earbuds | 2,602 | 1,339 | 251 |
| 11 | کیف و کاور گوشی | phone cases | 2,396 | 2,176 | 88 |
| 12 | رله و بیمتال | relays | 2,385 | 1,684 | 182 |
| 13 | کنتاکتور | contactors | 2,318 | 1,244 | 165 |
| 14 | درایو و اینورتر | drives/inverters | 2,254 | 1,505 | 117 |
| 15 | باتری گوشی موبایل | phone batteries | 2,181 | 795 | 50 |
| 16 | اتوماسیون صنعتی | industrial automation | 2,177 | 1,221 | 92 |
| 17 | گوشی موبایل | mobile phones | 2,122 | 814 | 134 |
| 18 | کف‌کش و لجن‌کش | sump/sludge pumps | 2,095 | 1,151 | 83 |
| 19 | کلید و پریز | switches & outlets | 2,083 | 1,242 | 186 |
| 20 | اسپیکر و سیستم صوتی | speakers | 2,006 | 1,063 | 220 |
| 21 | پروژکتور و وال واشر | floodlights | 1,987 | 1,394 | 178 |
| 22 | کابلشو و سرسیم | cable lugs | 1,943 | 1,233 | 73 |
| 23 | کلید اتوماتیک | MCCBs | 1,874 | 1,155 | 139 |
| 24 | ریسه و شلنگ نوری | LED strips | 1,804 | 1,209 | 184 |
| 25 | پیراهن مردانه | men's shirts | 1,795 | 787 | 37 |
| 26 | سایر الکتروموتور و لوازم جانبی | other electromotors | 1,735 | 1,293 | 79 |
| 27 | عینک آفتابی | sunglasses | 1,722 | 1,043 | 27 |
| 28 | لوازم یدکی جارو برقی، جاروشارژی و بخارشوی | vacuum spare parts | 1,721 | 1,265 | 52 |
| 29 | ضبط کننده ویدیویی دوربین‌های نظارتی و امنیتی | DVR/NVR | 1,634 | 870 | 137 |
| 30 | سایر تجهیزات پنوماتیک | other pneumatics | 1,604 | 1,438 | 72 |

The catalogue leans heavily toward electrical, lighting, CCTV, and mobile goods, which matches the downtown
Lalehzar / Jomhouri bazaars where most shops are.

## 4. Formats

### 4.1 Working hours (`weekly_hours`)

```json
{"mon":{"shifts":[{"start_time":"10:00:00","end_time":"19:00:00"},{"start_time":"00:00:00","end_time":"00:00:00"}],"status":"declared"},
 "fri":{"shifts":[{"start_time":"00:00:00","end_time":"00:00:00"}],"status":"closed"}, ...}
```

- The keys are always the full set `mon tue wed thu fri sat sun` (English), or the object is `{}`.
- `status` values per day: `declared` 27,270, `closed` 4,006, `unsupported` 35. `unsupported` has dummy times such as 08:00-08:00; treat it as unknown.
- **The second shift is usually a `00:00:00-00:00:00` placeholder** and must be dropped. After dropping it, only 467 day entries have a real split shift (e.g. 10:00-16:00 plus 18:00-21:00).
- Times are `HH:MM:SS` **local Tehran wall-clock** time. Typical days run 09:00/10:00 to 18:00-21:00, and no shift crosses midnight. `00:00:00-23:59:00` means 24h (236 shifts). `00:00:00-00:00:01` appears 61 times and is ambiguous.
- Friday is closed at 3,473 of the 4,473 shops that have hours. Thursday is a half day (most common closing times are 14:00 and 13:00).
- 4,447 shops declare at least one open day, and 3,011 shops have both hours and offers.
- In the DB, `shop_hours` holds one row per real shift with `open_min`/`close_min` as minutes after midnight (1440 = midnight) and `dow` = Python `weekday()` (0 = Mon ... 4 = Fri, 5 = Sat, 6 = Sun). Days that are closed or unsupported get a single row with NULL times.
- Shops open at sample times: Sat 11:00 = 4,199; Thu 17:00 = 2,138; Fri 11:00 = 783; Sun 21:30 = 219.

### 4.2 Prices

- `price_toman` is the only unit, an integer with no decimals. 84% of values end in `000`, and the most common values are 3.5M, 1.5M, and 2.5M.
- The toman unit holds up against real prices: Galaxy A26 128 GB is 70.6M; the median mobile phone is about 70.8M; the Apple 20 W charger has a median of 4.08M across 59 shops. Rial would be 10x larger.
- At most about 166 offers sit around 10x or 0.1x their product's median, so a rial/toman mix-up is rare.

### 4.3 Dates

- The only timestamp is `last_price_changed_at`, in ISO-8601 UTC with microseconds (`2026-10-12T11:30:57.593478+00:00`). It parses with `datetime.fromisoformat`.
- Range: 2020-12-03 to 2026-10-13; median 2026-09-21.
- This is the **last price change, not "last seen"**, so an old date does not prove the listing is stale.
- Age at the snapshot: within 7 days 22.6%, 8-30 days 34.7%, 31-90 days 20.1%, 91-365 days 20.9%, over 1 year 1.6%, missing 0.2%. "Data is from last week" really describes the snapshot, not every price.

### 4.4 Addresses: mall / floor / unit

- The address is free Persian text, comma (`،`) separated, ordered from street to alley to building to floor to unit. Example: `خیابان جمهوری اسلامی، پاساژ چارسو، طبقه اول، پلاک ۳۴`.
- A building keyword appears in 4,169 addresses: پاساژ 3,104, ساختمان 354, مجتمع تجاری 262, مجتمع 182, بازار 127, مرکز خرید 40, مال 24, برج 14, سرای 8.
- `طبقه` (floor) appears in 4,225 addresses, and unit keywords in 6,021 (پلاک 4,936, واحد 1,072, غرفه 10, مغازه 3). پلاک is sometimes the street number rather than the shop's unit.
- Floor values mix every style: همکف (ground), اول/دوم (first/second), ۱ / 2, منفی یک / منفی ۱ / -۱ / ۱- (basement 1), زیر همکف, زیرزمین.
- What the parser gets: `mall_name` for 4,074 shops (778 distinct), `floor_num` for 4,144 (it fails on about 80 odd forms such as زیر زمین and بالای همکف), and `unit` for 4,776. 3,243 shops have all three.
- The same mall is spelled several ways: علاالدین / علاءالدین / علائدین / علادین, and چارسو / چهارسو. Normalization merges the hamza form; the rest stay apart. Coordinates are more reliable for grouping, since shops in the same mall sit within about 10 m of each other.

## 5. Coverage counts and geography

### 5.1 Shop feature coverage

| Feature | Shops (of 6,476) | Of which have offers |
|---|---|---|
| Coordinates | 6,476 (100%) | 3,792 |
| Weekly hours present / at least 1 declared day | 4,473 / 4,447 | 3,011 |
| Torob Pay (ترب‌پی), any channel | 190 | 172 |
| Torob Pay, `channel = in_person` (the other 140 are `unknown`) | 50 | 47 |
| Installments / BNPL (any payment option) | 266 | n/a |
| Kalabarg | **0 (no field, no mention)** | 0 |
| Fast/instant delivery = true (false 433, unknown 4,875) | 1,168 | 1,090 |
| Real name (Instagram 22 + website 90) | 112 | 46 (6,863 offers) |
| Mall parsed from address | 4,074 | 2,479 |

Payment providers by number of shops: ترب‌پی 190, اسنپ‌پی 89, دیجی پی 61, تارا 37, ازکی‌وام 5. Three more providers are store names (دکان ابزار, تجهیزات آشپزخانه حلما, جیتکس مارکت), probably in-house credit. Price limits are set on 35 entries, and some of those are 0/0. One entry restricts by top-level category.

### 5.2 Geography

- **Bounding box:** lat 35.6403 to 35.8126, lon 51.3053 to 51.5093. Nothing falls outside Tehran, and no point is at (0, 0).
- The median point (35.6948, 51.4209) is the Jomhouri / Lalehzar / Ferdowsi bazaar district.
- **Density:** 85% of shops (5,485) and 88% of offers sit in 3 adjacent downtown labels: `فردوسی` 3,282 shops / 175k offers, `شیخ هادی` 1,587 / 84k, `بهارستان` 616 / 32k. A box of about 1 km around Alaeddin holds 1,809 shops.
- **Smaller clusters:** آسمان 151 (35.78, 51.35), باغ فیض 107, ایرانشهر 99, سنائی 96, سهروردی 82, تجریش 76 (north), جنت آباد جنوبی 68, امجدیه 54, آذربایجان 51. The other 18 labels have fewer than 40 shops each.
- **Top malls by shop count (offers):** پاساژ علاالدین 239 (8.1k), پاساژ بوشهری 147 (10.1k), پاساژ چارسو 135 (3.6k), پاساژ اتحادیه 96 (8.1k), پاساژ علاالدین 2 87, پاساژ کیان 80 (7.5k), پاساژ امجد 75, ساختمان آلومینیوم 70, پاساژ فراز 59, پاساژ یگانه 54, بازار موبایل ایران 53, پاساژ صدقی نژاد 51.

## 6. Data quirks

**Arabic vs Persian letters.** ي/ك/ى appear in 1.3% of titles (2,920), 1.2% of seller titles, and 1.1% of addresses. Shop names are clean.

**ZWNJ.** Present in 4.0% of titles, 3.5% of seller titles, 4.0% of addresses, and 8.8% of descriptions. Usage is inconsistent: the same word appears as `مداربسته`, `مدار بسته`, and `مدار‌بسته`, and the category name `ساعت مچی عقربه‌ ای` has a ZWNJ followed by a space.

**Digits.**
- Titles: Persian digits in 17.6%, ASCII digits in 80.7%, and Arabic-Indic digits in 223, often mixed in one string (`سطح مقطع 2.۵`).
- Addresses: Persian digits in 78% of them.
- Phones: all Persian digits.
- `٫` and `/` are both used as decimal marks (`۲/۵`), which conflicts with `3/2` valve notation, so `/` is left alone.

**Diacritics, tatweel, and invisible characters.**
- Diacritics: 435 titles. Tatweel: 59 titles.
- LRM/RLM bidi marks: 85 titles and 316 seller titles.
- Newlines: 1,013 titles and 39% of descriptions. Emoji: 6% of descriptions.

**HTML.** Descriptions contain no HTML tags. 32 titles carry undecoded entities (`&amp;` 31, `&#8211;` 1).

**Redacted and junk titles.**
- 849 products are titled `عنوان حذف‌شده برای انتشار` ("title removed for publication"), and their seller titles are redacted too. Most are relays (211) and watches (92). They are flagged `is_redacted` and left out of FTS titles.
- Junk titles: 2 empty, plus `30` and `00`. The real names are in `seller_title`.

**Duplicates.**
- 4,136 distinct titles are shared by 9,681 products, not counting the redacted ones.
- 9,557 (shop, product) pairs have more than one offer (20,315 extra rows). In 8,639 of those pairs the seller titles differ, because Torob's matcher merged variants (e.g. contactors LC1D95 and LC1D50 under one product).
- 1,818 offer rows are exact duplicates (same shop, product, title, and price).
- The `best_offers` view collapses each pair to its cheapest sane price (295,425 rows).

**Junk prices** (`offers.price_flag` in the DB):
- `missing`: 15,083 null prices.
- `too_low`: 1,645 offers under 1,000 toman. 635 of them are exactly 1 toman: placeholders, mostly cables and pneumatics from 16 shops. Some resistors and SMD LEDs are listed at a few hundred toman, plausibly per piece.
- `too_high`: 147 offers over 50B toman, from 16 shops. Some are absurd, e.g. 733,518,940,747,298,944 for a MacBook, which looks like two prices glued together. Real generators and transformers do reach 10-30B toman.
- `outlier`: 730 offers at 10x or more, or 0.1x or less, of their product's median (only computed when the product has at least 3 offers).
- `ok`: 313,901. Only `price_ok = 1` prices feed the min/median aggregates.

**Shop IDs and names.** Names are unique and look realistic but are fake, so do not present them as real businesses. Phones are fake 11-digit numbers. 7 exact coordinates are shared by 2 or more shops. One shop has a blank address and one has a blank label.

**Warranty.** The text is messy: `شرکتی` ("company"), `تست و تحویل در حضور مشتری` ("tested on delivery"), `بدون گارانتی` ("no warranty"), or a description only, such as `گارانتی اصالت و سلامت فیزیکی کالا`. `period_months` takes the values 6 / 12 / 18 / 24 / 36 / 48 / 60 / 120.

## 7. The SQLite database (`torob/data/torob.db`)

| Table | Rows | Notes |
|---|---|---|
| shops | 6,476 | `sid` INTEGER PK + `shop_id`; area, lat/lon, parsed `mall_kind/mall_name/floor_raw/floor_num/unit`, ASCII `phone`, `is_real_name`, `supports_fast_delivery` (1/0/NULL), `has_hours`, `accepts_torob_pay`, `torob_pay_in_person`, `has_installments`, `payment_providers`, `n_offers`, `n_products` |
| shop_hours | 31,778 | `sid, dow, day, status, shift_no, open_min, close_min` |
| shop_categories | 64,659 | declared categories per shop |
| shop_payment_options | 385 | provider, channel, min/max price, category restriction |
| categories | 3,988 | `n_products, n_offers, n_shops_offering, n_shops_declaring` |
| products | 225,903 | `pid` INTEGER PK + `product_id`; `title`, `title_norm`, `is_redacted`, `brand`, `brand_norm`, `model`, `category_name`, `image_url`, `image_urls_json`, `n_shops`, `n_offers`, `n_priced_offers`, `min/median/max_price_toman` |
| product_specs | 1,227,511 | `pid, ord, section, key, value` |
| offers | 331,506 | `oid` PK, `sid`, `pid` (plus the text ids), `price_toman`, `price_flag`, `price_ok`, `last_price_changed_at`, `last_price_changed_ts` (epoch), `price_age_days` (vs snapshot), `seller_title`, `description`, `warranty_provider/months/desc`, `is_pair_duplicate` |
| products_fts | 225,903 | FTS5 table with columns `title, brand, extra (model + spec English name), category, seller_titles`. All columns are normalized, `rowid = products.pid`, tokenizer `unicode61` with `tokenchars '.'` (keeps 2.5 as one token), prefix indexes 2 and 3 |
| shops_rtree | 6,476 | R-Tree on lat/lon, keyed by `sid` |
| best_offers (view) | 295,425 | cheapest `price_ok` offer per (shop, product) |
| meta | 8 | snapshot time, price rules, flag counts, CSV counts |

Indexes:
- shops: (lat, lon), area, mall_name
- shop_hours: (dow, open_min, close_min), sid
- shop_categories: category_name, sid
- shop_payment_options: (provider, channel)
- products: category_name, brand_norm
- product_specs: (pid, ord)
- offers: (pid, price_ok, price_toman), (sid, pid)
- unique indexes on all text ids

`normalize_fa()` does the following:
- Applies NFKC, which folds Arabic presentation forms.
- Maps ي/ى/ئ to ی and ك to ک; maps ة/ۀ/ہ/ھ to ه; maps أ/إ/ٱ/آ to ا and ؤ to و; drops ء.
- Removes diacritics and tatweel.
- Turns ZWNJ, NBSP, and thin spaces into a space, and deletes bidi marks.
- Converts Persian and Arabic digits (and `٫`) to ASCII.
- Lowercases Latin text and keeps a dot only as a decimal point.
- Splits letter/digit boundaries, so `A55` becomes `a 55`, which matches the `model` style.

Search (`build_db.search`) works as follows:
- Each query word becomes one FTS phrase. The words are ANDed, with an OR fallback.
- A small synonym table covers Persian/Latin brands and joined/split spellings (`آیفون`/iphone, `لپتاپ`/`لپ تاپ`, `مداربسته`/`مدار بسته`, ...).
- Results are ranked by bm25 (title 10, brand 4, extra 2, category 1.5, seller titles 1).
- Two re-rank boosts apply: the title starts with the query's first word (Persian titles lead with the product type), and more shops stock the product.

Handy SQL:

```sql
-- open now (Saturday 11:00 local => dow 5, minute 660)
SELECT DISTINCT sid FROM shop_hours WHERE dow = 5 AND open_min <= 660 AND close_min > 660;
-- shops in a ~1 km box (R-Tree), then exact haversine in Python
SELECT sid FROM shops_rtree WHERE min_lat >= :lat0-0.009 AND max_lat <= :lat0+0.009
                              AND min_lon >= :lon0-0.011 AND max_lon <= :lon0+0.011;
-- where can I buy product X, cheapest first, with mall/floor/unit
SELECT s.name, s.mall_name, s.floor_num, s.unit, b.price_toman, b.last_price_changed_ts
FROM best_offers b JOIN shops s ON s.sid = b.sid WHERE b.pid = :pid ORDER BY b.price_toman;
```

## 8. Ideas the data supports

| Feature | Feasible? | Basis |
|---|---|---|
| Product search in Persian/English | Yes | FTS over 225k titles + seller titles; see the samples below |
| "Where can I buy it nearby" + distance ranking | Yes | 100% of shops have real coordinates; R-Tree + haversine |
| Open-now / open-at-time filter | Mostly | 69% of shops have hours (3,011 of the 3,792 shops with offers). Label the rest "hours unknown". Account for Friday and Thursday afternoons. |
| Mall grouping and in-mall directions ("Alaeddin, floor 2, unit 24") | Yes | Mall parsed for 4,074 shops; coordinate clustering for the rest |
| Walking route across shops in one bazaar | Yes | Very dense downtown: 1,809 shops in about 1 km² |
| Price comparison across shops | For popular items | 33,126 products have 2 or more shops with sane prices; 84% of products are single-shop |
| Price freshness labels ("updated 3 days ago") | Yes | `price_age_days`; 57% of offers changed within 30 days |
| Junk-price suppression | Yes | `price_flag` / `price_ok` |
| Alternatives (same category + brand, similar price band, specs) | Yes, roughly | Flat categories; brand only 25% filled; specs on 64% of products but mostly a few keys |
| Payment filters: Torob Pay in person, installments, fast delivery | Small but real | 50 / 266 / 1,168 shops; show only "confirmed yes" |
| Warranty filter | Partial | 17.8% of offers, messy text |
| Spotlight real shops (website / Instagram) | Yes | 112 shops, 46 with offers |
| Kalabarg, WhatsApp/Bale contact, shop photos/descriptions/licences, category tree, stock levels | **No** | Not in the export |

## 9. Sample Persian queries (FTS, top 3)

Run with `python -I build_db.py --demo`, or `--search "..."` for a single query. Each title is followed by its category, the number of shops offering it, and the minimum sane price in toman.

1. **آیفون ۱۳ پرو مکس** (Persian digits; matches آیفون or iphone)
   - آیفون 13 پرو مکس 256 گیگابایت \| iPhone 13 Pro Max 256GB ZA/A \| کارکرده (گوشی موبایل, 1 shop, 165,000,000)
   - درب پشت آیفون ۱۳ پرو مکس رنگ سبز (قاب، شاسی و درب گوشی, 8, 330,000)
   - گلس شفاف ارتوریز ایفون 13 پرو مکس GLAS Artoriz IPHONE 13 PRO Max (محافظ صفحه نمایش گوشی, 1, 1,000,000)
2. **گوشی سامسونگ A55** (A55 is turned into the phrase "a 55")
   - گوشی سامسونگ (استوک) A55 5G \| حافظه 256 رم 8 گیگابایت (گوشی موبایل, 2, 85,000,000)
   - گوشی سامسونگ (ویتنام) A55 5G \| حافظه 256 رم 8 گیگابایت (گوشی موبایل, 4, 108,000,000)
   - گوشی سامسونگ (ویتنام) A55 5G \| حافظه 128 رم 8 گیگابایت (گوشی موبایل, 1, 98,000,000)
3. **هندزفری بلوتوثی شیائومی**
   - هندزفری بلوتوثی شیائومی هایلو مدل Mori Plus (هدفون، هدست و هندزفری, 9, 3,335,000)
   - هندزفری گردنی شیائومی کیو سی وای مدل C2 (9, 2,690,000)
   - هندزفری بی سیم شیائومی مدل Buds 6 (2, 26,280,000)
4. **شارژر اپل ۲۰ وات**
   - شارژر دیواری 20 وات اپل Apple 20 Watt Wall Charger Eu MD3J4ZM/A (شارژر گوشی, 1, 4,270,000)
   - شارژر 20 وات اصلی اپل آیفون Apple 20W 2pin Power Adapter آمریکایی مدل A2305 (1, 6,000,000)
   - شارژر 20 وات اپل (عمده پک ۱۰ عددی) دو شاخه ... (1, 32,889,000; a 10-pack)
5. **دوربین مدار بسته داهوا** (matches the joined مداربسته via synonym)
   - دوربین مداربسته داهوا Dahua HFW-1400TP (دوربین مدار بسته, 1, 2,350,000)
   - دوربین مداربسته بیسیم داهوا Dahua H3A (1, 6,320,000)
   - دوربین مداربسته بیسیم داهوا Dahua H2A (1, 6,050,000)
6. **پاوربانک انکر**
   - پاوربانک 165 وات انکر مدل A1695 ظرفیت 25000 میلی آمپر ساعت (پاوربانک و شارژر همراه, 9, 16,400,000)
   - پاوربانک انکر مدل A1384 ظرفیت ۲۰۰۰۰ میلی آمپر ساعت فست شارژ ۳۰ وات (5, 8,880,000)
   - پاوربانک 30 وات انکر مدل Zolo A1685 ظرفیت 10000 میلی آمپر ساعت (2, 9,850,000)
7. **كابل افشان ۲.۵** (typed with Arabic ك and Persian digits)
   - کابل برق افشان ۲ در ۲.۵ مدل KB225 (سیم و کابل برق ساختمان, 7, 45,000)
   - کابل برق افشان 2.5*2 زرتافته کرمان 1 متری (5, 115,000)
   - کابل برق افشان زر کابل ۲ در ۲.۵ تمام مس (5, 130,000)
8. **ساعت کاسیو مردانه**
   - ساعت مچی مردانه کاسیو مدل CASIO DBC-32-1A (ساعت مچی عقربه‌ ای و دیجیتالی, 1, 15,972,000)
   - ساعت مردانه کاسیو مدل CASIO-MTP-VT01L-1B (1, 10,800,000)
   - ساعت مچی مردانه کاسیو مدل CASIO AQ-800ECGG-4A (1, 27,346,000)
9. **لپتاپ لنوو** (joined spelling, also matches لپ تاپ / laptop)
   - لپتاپ استوک لنوو مدل Lenovo ThinkPad P52 (لپ تاپ و نوت بوک, 1, 117,900,000)
   - لپتاپ لنو مدل LENOVO THINKPAD L490 (1, 59,900,000)
   - لپ تاپ لنوو ThinkBook 16 - Lenovo ThinkBook 16 Ultra 9 185H ... (1, 421,878,940)
10. **محافظ برق یخچال**
    - محافظ برق دوخانه یخچال پارت الکتریک (کلید و پریز, 1, 2,640,000)
    - محافظ برق یخچال و فریزر پارت الکتریک (سیم سیار و چندراهی برق, 1, 1,250,000)
    - محافظ برق یخچال و فریزر دیواری ارت دار کاوه (کنترل بار و فاز, 1, 700,000)

Known search limits:
- Accessories can outrank the device itself when the query has no type word (query 1 ranks the phone first only because of the head-word boost).
- The synonym table is hand-made and small.
- There is no stemming, so the plural forms ها/های are not merged.
