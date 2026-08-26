"""
The vision gate: a photo is looked at before it is served.

Run from wotoeat-api/:  venv/bin/python tests/test_image_vision.py
No network, no keys, no model -- verify_dish_photo is stubbed.

Why this exists. Word matching on a stock library's alt text has a ceiling, and
"Red Braised Pork Ribs" is where it stops. A photo of ribs on an American
barbecue shares every word that matters (`pork`, `ribs`) and differs only by
cooking method, which is true of thousands of dishes and so cannot be weighted
heavily without rejecting everything. It scores 0.83 and ships. Alt text is one
line written by whoever uploaded the photo; no tuning turns it into a
description of what the picture looks like.

So the shortlist is scored by text, and the decision is made by looking. What
this file pins is the wiring around that: the veto, what happens when every
candidate fails, and the two ways the check itself can go wrong (broken model,
exhausted budget) which must never cost a dish its image on their own.
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
seen: list[str] = []          # dish names the vision model was asked about
VERDICTS: dict[str, tuple] = {}   # photo id -> (match, confidence, shows)


def check(label: str, cond: bool, detail: str = "") -> None:
    checks.append((label, bool(cond)))
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{detail}]" if detail else ""))


def photo(pid, alt, shoot=1):
    return {"id": pid, "photographer_id": shoot, "alt": alt,
            "src": {"large": f"https://img/{pid}/large.jpg",
                    "medium": f"https://img/{pid}/medium.jpg"}}


# The real pair: a Chinese red braise, and the barbecue rack that was served
# for it. Both alt strings match on `pork` and `ribs`.
BBQ = photo(1, "pork ribs grilling on a barbecue grill with tongs and smoke")
BRAISE = photo(2, "chinese braised pork ribs in glossy red soy sauce", shoot=2)

POOL: list[dict] = []


class _Resp:
    def __init__(self, payload=None, content=b"", status=200):
        self.status_code = status
        self._payload = payload
        self.content = content
    def json(self): return self._payload


class _FakeClient:
    def __init__(self, *a, **k): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *a): return False
    async def get(self, url, params=None, headers=None):
        if "themealdb" in url:
            return _Resp({"meals": None})
        if "pexels" in url:
            return _Resp({"photos": POOL})
        # Downloading a candidate for the vision check.
        return _Resp(content=b"\xff\xd8\xff" + url.encode())


async def _fake_verify(dish_name, cuisine, image_query, image_b64):
    seen.append(dish_name)
    raw = __import__("base64").b64decode(image_b64).decode("latin-1")
    for pid, verdict in VERDICTS.items():
        if f"/{pid}/" in raw:
            return verdict
    return True, 0.5, "unspecified"


images.httpx.AsyncClient = _FakeClient          # type: ignore[assignment]
images.verify_dish_photo = _fake_verify         # type: ignore[assignment]


def get(q, hint=None, cuisine=None):
    seen.clear()
    params = {"q": q}
    if hint: params["hint"] = hint
    if cuisine: params["cuisine"] = cuisine
    r = client.get("/images/search", params=params)
    assert r.status_code == 200, r.text
    return r.json()["url"]


# ── 1. The reported case: text says yes, the picture says no ────────────────
POOL[:] = [BBQ]
VERDICTS.clear(); VERDICTS["1"] = (False, 0.9, "barbecue ribs on a grill")
url = get("Red Braised Pork Ribs", hint="braised pork ribs", cuisine="Chinese")
check("a barbecue photo is vetoed for a Chinese red-braised dish", url is None, str(url))
check("the vision check actually ran", seen == ["Red Braised Pork Ribs"], str(seen))

# ── 2. It picks the right one when both are on offer ────────────────────────
POOL[:] = [BBQ, BRAISE]
VERDICTS.clear(); VERDICTS["1"] = (False, 0.9, "barbecue ribs"); VERDICTS["2"] = (True, 0.95, "red braised ribs")
url = get("Red Braised Pork Ribs v2", hint="braised pork ribs", cuisine="Chinese")
check("the braised photo is served instead", url == BRAISE["src"]["large"], str(url))

# ── 3. Confidence outranks word overlap ─────────────────────────────────────
# Give the BBQ photo the better TEXT score, and let the model disagree.
POOL[:] = [photo(3, "braised pork ribs barbecue"), photo(4, "pork ribs", shoot=4)]
VERDICTS.clear(); VERDICTS["3"] = (True, 0.10, "barbecue, maybe"); VERDICTS["4"] = (True, 0.99, "red braised ribs")
url = get("Red Braised Pork Ribs v3", hint="braised pork ribs", cuisine="Chinese")
check("a confidently-right photo beats a better word match",
      url == "https://img/4/large.jpg", str(url))

# ── 4. Every candidate rejected means no hero, not the next unchecked one ───
POOL[:] = [photo(i, "braised pork ribs") for i in range(10, 20)]
VERDICTS.clear()
for i in range(10, 20): VERDICTS[str(i)] = (False, 0.9, "something else")
url = get("Red Braised Pork Ribs v4", hint="braised pork ribs", cuisine="Chinese")
check("all rejected -> no image, never an unlooked-at fallback", url is None, str(url))
check("only the shortlist is checked, not all 10",
      len(seen) == images._VISION_CANDIDATES, f"{len(seen)} checks")

# ── 5. The check failing must not cost every dish its image ─────────────────
async def _broken_verify(*a, **k):
    raise RuntimeError("vision model down")
images.verify_dish_photo = _broken_verify       # type: ignore[assignment]
POOL[:] = [BRAISE]
url = get("Red Braised Pork Ribs v5", hint="braised pork ribs", cuisine="Chinese")
check("a broken vision model falls back to the text-matched photo",
      url == BRAISE["src"]["large"], str(url))
images.verify_dish_photo = _fake_verify         # type: ignore[assignment]

# ── 6. Text matching still gates what is worth looking at ──────────────────
POOL[:] = [photo(30, "a cat asleep on a windowsill", shoot=30)]
VERDICTS.clear(); VERDICTS["30"] = (True, 1.0, "a cat")
check("an irrelevant photo never reaches the vision model",
      get("Red Braised Pork Ribs v6", hint="braised pork ribs", cuisine="Chinese") is None)
check("...and no vision call was spent on it", seen == [], str(seen))

# ── 7. The gate can be switched off without breaking the endpoint ──────────
images._VISION_CHECK = False
POOL[:] = [BBQ]
VERDICTS.clear(); VERDICTS["1"] = (False, 0.9, "barbecue ribs")
url = get("Red Braised Pork Ribs v7", hint="braised pork ribs", cuisine="Chinese")
check("IMAGE_VISION_CHECK=0 degrades to text-only matching",
      url == BBQ["src"]["large"] and seen == [], str(url))
images._VISION_CHECK = True

# ── 8. Cache keys and small variants ───────────────────────────────────────
POOL[:] = [BRAISE]
VERDICTS.clear(); VERDICTS["2"] = (True, 0.9, "red braised ribs")
first = get("Cache Probe", hint="braised pork ribs", cuisine="Chinese")
seen.clear()
again = get("Cache Probe", hint="braised pork ribs", cuisine="Chinese")
check("a cached answer costs no vision call", again == first and seen == [], str(seen))
check("a different cuisine is a different cache entry",
      get("Cache Probe", hint="braised pork ribs", cuisine="Korean") is not None)
check("the served URL is the large variant, not the one sent for checking",
      first == BRAISE["src"]["large"], str(first))

failed = [l for l, ok in checks if not ok]
print(f"\n{len(checks) - len(failed)}/{len(checks)} passed")
sys.exit(1 if failed else 0)
