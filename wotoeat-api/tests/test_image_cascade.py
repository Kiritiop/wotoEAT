"""
The header-photo cascade: TheMealDB, then a generated image.

Run from wotoeat-api/:  venv/bin/python tests/test_image_cascade.py
No network, no keys.

There used to be a Pexels stage between the two, with a vision model vetting its
results, and this file is what is left after removing it. Stock search cannot
answer "is this that dish": the caption is one line written by whoever uploaded
the photo, so `pork ribs` matched an American barbecue, `braised pork ribs`
matched pork belly, `chicken tikka masala` matched paneer, and two dishes were
handed two frames of one shoot. Every fix worked and the next miss was a
category the previous fix could not see. The last one was not even a mismatch:
Pexels has no canonical 红烧排骨, so its best honest answer was a Sichuan
chilli-oil braise, correctly matched and still the wrong picture.

Both surviving sources are correct by construction. A MealDB hit is a photograph
of the exact recipe, matched by verified name. A generated image is drawn from
the recipe's own description. What is worth testing is the seam between them and
the two things that cost money: never generating an image twice, and never
generating when a real photo exists.
"""
import asyncio
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("GROQ_API_KEY", "test-dummy-key")
os.environ["CACHE_DB"] = tempfile.mktemp(suffix=".db")
os.environ["GEMINI_API_KEY"] = "test-gemini-key"

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import routers.images as images  # noqa: E402

app = FastAPI()
app.include_router(images.router, prefix="/images")
client = TestClient(app)

checks: list[tuple[str, bool]] = []
generated: list[tuple] = []
uploaded: list[str] = []
EXISTING: set[str] = set()          # objects already in the bucket
MEALDB: dict[str, list[dict] | None] = {}


def check(label: str, cond: bool, detail: str = "") -> None:
    checks.append((label, bool(cond)))
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{detail}]" if detail else ""))


JPEG = b"\xff\xd8\xff" + b"x" * 20_000


class _Resp:
    def __init__(self, payload=None, status=200):
        self.status_code = status
        self._p = payload
    def json(self): return self._p


class _FakeClient:
    def __init__(self, *a, **k): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *a): return False
    async def get(self, url, params=None, headers=None):
        if "themealdb" in url:
            return _Resp({"meals": MEALDB.get(params["s"])})
        return _Resp({})
    async def head(self, url):
        name = url.rsplit("/public/dish-images/", 1)[-1]
        return _Resp(status=200 if name in EXISTING else 404)


async def _fake_generate(dish, cuisine="", description="", image_query=""):
    generated.append((dish, cuisine, description, image_query))
    return JPEG


def _fake_upload(name, data, content_type="image/jpeg"):
    uploaded.append(name)
    EXISTING.add(name)
    return f"https://sb.test/storage/v1/object/public/dish-images/{name}"


images.httpx.AsyncClient = _FakeClient                 # type: ignore[assignment]
images.imagegen.generate_dish_image = _fake_generate   # type: ignore[assignment]
images.imagegen.is_available = lambda: True            # type: ignore[assignment]
images.db.upload_dish_image = _fake_upload             # type: ignore[assignment]
images.db.public_dish_image_url = (
    lambda name: f"https://sb.test/storage/v1/object/public/dish-images/{name}"
)


def get(q, hint=None, cuisine=None, desc=None):
    generated.clear(); uploaded.clear()
    params = {"q": q}
    for k, v in (("hint", hint), ("cuisine", cuisine), ("desc", desc)):
        if v: params[k] = v
    r = client.get("/images/search", params=params)
    assert r.status_code == 200, r.text
    return r.json()["url"]


# ── A real photo of the exact recipe always wins ───────────────────────────
MEALDB["Pad Thai"] = [{"strMeal": "Pad Thai", "strMealThumb": "https://mealdb/pad.jpg"}]
url = get("Pad Thai", hint="pad thai noodles", cuisine="Thai")
check("a verified MealDB match is used", url == "https://mealdb/pad.jpg", str(url))
check("...and nothing is generated for it", generated == [], str(generated))

# ── MealDB's substring search must still not be trusted blindly ────────────
# search.php is a LIKE over titles: "Beef Stew" really does return only
# "Lemongrass beef stew with noodles".
MEALDB["Beef Stew"] = [{"strMeal": "Lemongrass beef stew with noodles",
                        "strMealThumb": "https://mealdb/lemongrass.jpg"}]
url = get("Beef Stew", hint="beef stew", cuisine="British")
check("a substring hit on a different dish is rejected", url != "https://mealdb/lemongrass.jpg")
check("...and the dish is generated instead", generated and url.startswith("https://sb.test/"))

MEALDB["Classic Beef Bourguignon"] = [{"strMeal": "Beef Bourguignon",
                                       "strMealThumb": "https://mealdb/bourg.jpg"}]
check("extra words in OUR name still match",
      get("Classic Beef Bourguignon", hint="braised beef wine") == "https://mealdb/bourg.jpg")

# ── No MealDB entry: generate from the recipe's own words ──────────────────
MEALDB["红烧排骨"] = None
url = get("红烧排骨", hint="braised pork ribs", cuisine="Chinese", desc="色泽红亮，酱香浓郁")
check("a dish MealDB does not have is generated", url.startswith("https://sb.test/"), str(url))
check("the recipe's description is what it is drawn from",
      generated and "色泽红亮" in generated[0][2], str(generated[:1]))
check("cuisine reaches the generator too", generated[0][1] == "Chinese")
check("a non-Latin dish name is no obstacle", generated[0][0] == "红烧排骨")

# ── Never pay for the same image twice ─────────────────────────────────────
name = images._object_name("红烧排骨".casefold())
check("the storage path is deterministic for a dish", name in EXISTING, name)
check("a cached dish costs nothing at all",
      get("红烧排骨", hint="braised pork ribs", cuisine="Chinese", desc="色泽红亮，酱香浓郁")
      is not None and generated == [])

# A deploy wipes the /tmp cache but not the bucket.
os.environ["CACHE_DB"] = tempfile.mktemp(suffix=".db")
import ai.sqlite_cache as sqlite_cache  # noqa: E402
sqlite_cache._local = type(sqlite_cache._local)()
url = get("红烧排骨", hint="braised pork ribs", cuisine="Chinese", desc="色泽红亮，酱香浓郁")
check("after a cache wipe the stored image is reused, not regenerated",
      url is not None and generated == [], str(generated))

# ── Failure modes leave a blank hero, never a broken one ───────────────────
images.imagegen.is_available = lambda: False  # type: ignore[assignment]
MEALDB["Obscure Dish"] = None
check("with generation unavailable the cascade ends at null",
      get("Obscure Dish", hint="nobody photographed this") is None)
images.imagegen.is_available = lambda: True  # type: ignore[assignment]

images.db.upload_dish_image = lambda *a, **k: None  # type: ignore[assignment]
MEALDB["Storage Down Dish"] = None
check("a failed upload yields no hero rather than a broken link",
      get("Storage Down Dish", hint="x y z") is None)
images.db.upload_dish_image = _fake_upload  # type: ignore[assignment]

async def _no_image(*a, **k):
    return None
images.imagegen.generate_dish_image = _no_image  # type: ignore[assignment]
MEALDB["Refused Dish"] = None
check("a model that declines yields no hero", get("Refused Dish", hint="x y z") is None)
images.imagegen.generate_dish_image = _fake_generate  # type: ignore[assignment]

# ── Contract ───────────────────────────────────────────────────────────────
MEALDB["Pad Thai"] = [{"strMeal": "Pad Thai", "strMealThumb": "https://mealdb/pad.jpg"}]
r = client.get("/images/search", params={"q": "Pad Thai"})
check("the response is always {url: ...}", set(r.json().keys()) == {"url"})
check("q is required", client.get("/images/search").status_code == 422)
check("an empty q is answered, not crashed",
      client.get("/images/search", params={"q": "   "}).json()["url"] is None)

failed = [l for l, ok in checks if not ok]
print(f"\n{len(checks) - len(failed)}/{len(checks)} passed")
sys.exit(1 if failed else 0)
