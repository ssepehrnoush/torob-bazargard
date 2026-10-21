"""Derive a smaller, read-only copy of data/torob.db for deployment.

Keeps every table the app queries; drops columns/indexes it never uses and rebuilds the FTS index
without prefix tables (prefix queries still work, just via a scan of the term list).

    python -I backend/scripts/make_app_db.py data/torob.db app-data/app.db
"""
from __future__ import annotations

import os
import sqlite3
import sys
import time


def main(src: str, dst: str) -> None:
    t0 = time.time()
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    if os.path.exists(dst):
        os.remove(dst)
    con = sqlite3.connect(f"file:{os.path.abspath(dst)}", uri=True)  # URI mode so src can be attached read-only
    con.executescript("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA page_size=8192;")
    con.execute("ATTACH DATABASE ? AS src", (f"file:{os.path.abspath(src)}?mode=ro",))
    keep_tables = ["meta", "shops", "shop_hours", "shop_categories", "shop_payment_options", "categories",
                   "products", "product_specs", "offers"]
    for t in keep_tables:
        sql = con.execute("SELECT sql FROM src.sqlite_master WHERE type='table' AND name=?", (t,)).fetchone()[0]
        con.execute(sql)
        con.execute(f"INSERT INTO main.{t} SELECT * FROM src.{t}")
    # offers: the free-text description is shown only in the shop sheet; keep it, but drop the copy
    # of the ISO timestamp (the epoch column is what the app reads)
    con.execute("UPDATE offers SET last_price_changed_at = NULL")
    for (sql,) in con.execute("SELECT sql FROM src.sqlite_master WHERE type='index' AND sql IS NOT NULL").fetchall():
        con.execute(sql)
    fts_sql = con.execute("SELECT sql FROM src.sqlite_master WHERE name='products_fts'").fetchone()[0]
    con.execute(fts_sql.replace(", prefix = '2 3'", ""))
    con.execute("INSERT INTO products_fts(rowid, title, brand, extra, category, seller_titles) "
                "SELECT rowid, title, brand, extra, category, seller_titles FROM src.products_fts")
    con.execute("INSERT INTO products_fts(products_fts) VALUES ('optimize')")
    try:
        con.execute("CREATE VIRTUAL TABLE shops_rtree USING rtree(sid, min_lat, max_lat, min_lon, max_lon)")
        con.execute("INSERT INTO shops_rtree SELECT sid, lat, lat, lon, lon FROM shops")
    except sqlite3.OperationalError:
        pass
    view = con.execute("SELECT sql FROM src.sqlite_master WHERE type='view' AND name='best_offers'").fetchone()
    if view:
        con.execute(view[0])
    con.commit()
    con.execute("DETACH DATABASE src")
    con.execute("ANALYZE")
    con.commit()
    con.execute("VACUUM")
    con.close()
    print(f"wrote {dst}: {os.path.getsize(dst) / 1048576:.0f} MB in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
