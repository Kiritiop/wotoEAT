"""
End-to-end test for GET /images/search, with TheMealDB and Pexels mocked using
their real payload shapes (captured from the live APIs).

Run from wotoeat-api/:  venv/bin/python tests/test_image_endpoint.py
No network, no keys. Complements tests/test_image_match.py, which unit-tests the
matching helpers; this one exercises the router: cascade order, the hint
parameter, caching, and the never-return-a-wrong-image contract.
"""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("GROQ_API_KEY", "test-dummy-key")
os.environ["CACHE_DB"] = tempfile.mktemp(suffix=".db")
os.environ["PEXELS_API_KEY"] = "test-pexels-key"

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import routers.images as images  # noqa: E402

app = FastAPI()
app.include_router(images.router, prefix="/images")
client = TestClient(app)

checks: list[tuple[str, bool]] = []
calls: list[str] = []


def check(label: str, cond: bool) -> None:
    checks.append((label, bool(cond)))


# ── Fake upstreams ──────────────────────────────────────────────────────────
# Real response shapes: TheMealDB returns {"meals": [...] | None}; Pexels
# returns {"photos": [{"alt": ..., "src": {"large": ...}}]}.
MEALDB: dict[str, list[dict] | None] = {}
PEXELS: dict[str, list[dict]] = {}


class _Resp:
    def __init__(self, payload):
        self.status_code = 200
        self._payload = payload

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url, params=None, headers=None):
        params = params or {}
        if "themealdb" in url:
            q = params["s"]
            calls.append(f"mealdb:{q}")
            return _Resp({"meals": MEALDB.get(q)})
        if "pexels" in url:
            q = params["query"]
            calls.append(f"pexels:{q}")
            return _Resp({"photos": PEXELS.get(q, [])})
        raise AssertionError("unexpected upstream: " + url)


images.httpx.AsyncClient = _FakeClient  # type: ignore[assignment]


def photo(alt: str, url: str) -> dict:
    return {"alt": alt, "src": {"large": url}}


def get(q: str, hint: str | None = None):
    calls.clear()
    params = {"q": q}
    if hint:
        params["hint"] = hint
    r = client.get("/images/search", params=params)
    assert r.status_code == 200, r.text
    return r.json()["url"]


# ── 1. The reported bug: MealDB substring hit on a different dish ───────────
MEALDB["Beef Stew"] = [
    {"strMeal": "Lemongrass beef stew with noodles",
     "strMealThumb": "https://themealdb/lemongrass.jpg"}
]
PEXELS["beef stew food"] = [photo("hearty beef stew in a cast iron pot",
                                  "https://pexels/beefstew.jpg")]
url = get("Beef Stew")
check("'Beef Stew' does not return the lemongrass noodle photo",
      url != "https://themealdb/lemongrass.jpg")
check("'Beef Stew' falls through to a matching Pexels photo",
      url == "https://pexels/beefstew.jpg")

# ── 2. A genuine MealDB match short-circuits the cascade ────────────────────
MEALDB["Pad Thai"] = [{"strMeal": "Pad Thai", "strMealThumb": "https://themealdb/padthai.jpg"}]
url = get("Pad Thai")
check("an exact MealDB match is used", url == "https://themealdb/padthai.jpg")
check("a MealDB hit never reaches Pexels",
      not any(c.startswith("pexels:") for c in calls))

# ── 3. The hint steers Pexels; MealDB still sees the real dish name ─────────
MEALDB["Coq au Vin"] = None
PEXELS["braised chicken red wine food"] = [
    photo("braised chicken thighs in red wine sauce", "https://pexels/coq.jpg")
]
url = get("Coq au Vin", hint="braised chicken red wine")
check("the hint is used as the Pexels query", url == "https://pexels/coq.jpg")
check("MealDB is still searched by the real dish name", "mealdb:Coq au Vin" in calls)

# ── 4. Nothing relevant anywhere → null, never a wrong photo ────────────────
MEALDB["Miso Glazed Cod"] = None
PEXELS["miso glazed cod food"] = [photo("a plate of spaghetti bolognese",
                                        "https://pexels/spaghetti.jpg")]
PEXELS["miso glazed food"] = [photo("close up of a cheeseburger",
                                    "https://pexels/burger.jpg")]
check("an irrelevant Pexels top result is rejected", get("Miso Glazed Cod") is None)

# ── 5. Narrowed retry when the full query finds nothing good ────────────────
MEALDB["Lemon Herb Salmon with Asparagus"] = None
PEXELS["lemon herb salmon asparagus food"] = [photo("a bowl of lemons",
                                                    "https://pexels/lemons.jpg")]
PEXELS["lemon herb food"] = [photo("lemon and herb sprigs", "https://pexels/herb.jpg")]
url = get("Lemon Herb Salmon with Asparagus")
check("a weak full-query result is not accepted", url != "https://pexels/lemons.jpg")
check("the narrowed retry fires", "pexels:lemon herb food" in calls)

# ── 6. Caching ──────────────────────────────────────────────────────────────
get("Pad Thai")
calls.clear()
url = get("Pad Thai")
check("a cached hit is served without touching any upstream", calls == [])
check("the cached value is the same URL", url == "https://themealdb/padthai.jpg")

# A different hint must be a different cache entry, not a stale reuse.
calls.clear()
get("Pad Thai", hint="thai stir fried noodles")
check("the hint is part of the cache key",
      any(c.startswith("mealdb:") for c in calls))

# A null result is cached too (short TTL), so a miss does not hammer upstreams.
get("Miso Glazed Cod")
calls.clear()
check("a null result is cached", get("Miso Glazed Cod") is None and calls == [])

# ── 7. Contract ─────────────────────────────────────────────────────────────
r = client.get("/images/search", params={"q": "Pad Thai"})
check("response is always {url: ...}", set(r.json().keys()) == {"url"})
check("q is required", client.get("/images/search").status_code == 422)
check("hint is optional", client.get("/images/search", params={"q": "x"}).status_code == 200)

failed = [label for label, ok in checks if not ok]
for label, ok in checks:
    print(("PASS  " if ok else "FAIL  ") + label)
print(f"\n{len(checks) - len(failed)}/{len(checks)} passed")
sys.exit(1 if failed else 0)
