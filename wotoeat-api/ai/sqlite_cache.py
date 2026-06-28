"""
SQLite-backed cache and rate limiter.
Replaces the in-process dict so cache survives uvicorn --reload restarts.
"""
import json
import os
import sqlite3
import time
import threading

_DB_PATH = os.getenv("CACHE_DB", "/tmp/wotoeat_cache.db")
_local = threading.local()


def _conn() -> sqlite3.Connection:
    """Return a per-thread connection, creating tables on first use."""
    if not hasattr(_local, "db"):
        conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cache (
                key     TEXT PRIMARY KEY,
                data    TEXT NOT NULL,
                expires REAL NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS rate_limits (
                user_action  TEXT PRIMARY KEY,
                count        INTEGER NOT NULL DEFAULT 0,
                window_start REAL    NOT NULL
            )
        """)
        conn.commit()
        _local.db = conn
    return _local.db


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def cache_get(key: str):
    """Return cached object or None if missing / expired."""
    row = _conn().execute(
        "SELECT data FROM cache WHERE key=? AND expires>?",
        (key, time.time()),
    ).fetchone()
    return json.loads(row[0]) if row else None


def cache_set(key: str, data, ttl: int) -> None:
    _conn().execute(
        "INSERT OR REPLACE INTO cache (key, data, expires) VALUES (?,?,?)",
        (key, json.dumps(data, default=str), time.time() + ttl),
    )
    _conn().commit()


def cache_purge_expired() -> None:
    _conn().execute("DELETE FROM cache WHERE expires<?", (time.time(),))
    _conn().commit()


# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------

def rate_limit_check(user_id: str, action: str, max_calls: int, window_secs: int) -> bool:
    """
    Returns True if the call is allowed, False if the user is rate-limited.
    Uses a sliding-window approach: resets count when the window expires.
    """
    key = f"{user_id}:{action}"
    now = time.time()
    db = _conn()

    row = db.execute(
        "SELECT count, window_start FROM rate_limits WHERE user_action=?", (key,)
    ).fetchone()

    if row:
        count, window_start = row
        if now - window_start > window_secs:
            # Window expired — reset
            db.execute(
                "INSERT OR REPLACE INTO rate_limits VALUES (?,1,?)", (key, now)
            )
            db.commit()
            return True
        if count >= max_calls:
            return False
        db.execute(
            "UPDATE rate_limits SET count=count+1 WHERE user_action=?", (key,)
        )
        db.commit()
        return True

    db.execute("INSERT INTO rate_limits VALUES (?,1,?)", (key, now))
    db.commit()
    return True
