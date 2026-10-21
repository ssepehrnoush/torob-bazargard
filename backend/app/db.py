"""Read-only SQLite access. One connection per thread; the DB is never written at runtime."""
from __future__ import annotations

import importlib.util
import sqlite3
import threading
from pathlib import Path

from . import config

_local = threading.local()


def conn() -> sqlite3.Connection:
    c = getattr(_local, "conn", None)
    if c is None:
        path = Path(config.DB_PATH)
        if not path.is_file():
            raise RuntimeError(f"database not found at {path}")
        c = sqlite3.connect(f"file:{path.as_posix()}?mode=ro&immutable=1", uri=True, check_same_thread=False)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA cache_size = -16384")  # 16 MB page cache per connection (one per worker thread)
        c.execute("PRAGMA mmap_size = 134217728")
        _local.conn = c
    return c


def q(sql: str, params: tuple | list = ()) -> list[sqlite3.Row]:
    return conn().execute(sql, params).fetchall()


def q1(sql: str, params: tuple | list = ()) -> sqlite3.Row | None:
    return conn().execute(sql, params).fetchone()


def _load_textnorm():
    """Query-side normalization must match the one used to build the FTS index, so it is
    imported from the dataset build script instead of being copied."""
    candidates = [config.PROJECT_DIR / "data" / "build_db.py", config.BACKEND_DIR / "build_db.py"]
    for path in candidates:
        if path.is_file():
            spec = importlib.util.spec_from_file_location("torob_build_db", path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return mod
    raise RuntimeError("build_db.py not found (needed for Persian text normalization)")


textnorm = _load_textnorm()
normalize_fa = textnorm.normalize_fa
build_match = textnorm.build_match
query_units = textnorm.query_units


def meta() -> dict:
    return {r["key"]: r["value"] for r in q("SELECT key, value FROM meta")}
