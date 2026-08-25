"""
Two different dishes must never be given the same photo, or two frames of the
same photo shoot.

Run from wotoeat-api/:  venv/bin/python tests/test_image_distinct.py
No network, no keys.

The real case this locks: Pexels photos 5774004 and 5774005 are consecutive
frames from one Luis Becerra shoot. Their alt text is "Korean bibimbap topped
with marinated bulgogi beef ..." and "Authentic Korean Bibimbap with fresh
vegetables and beef ...". Both score ~1.0 for BOTH "beef bulgogi" and "beef
bibimbap" -- correctly, since bulgogi is a standard bibimbap topping. Picking
the top scorer per dish therefore served two dishes in one meal stream two
near-identical photos, which reads as broken no matter how well each matched.

Scoring cannot fix this, because neither photo is wrong. Distinctness has to be
enforced separately, which is what _choose does.
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


def check(label: str, cond: bool, detail: str = "") -> None:
    checks.append((label, bool(cond)))
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{detail}]" if detail else ""))


# ── Real Pexels payloads, trimmed to the fields the router reads ────────────
# Photographer 1841216 is Luis Becerra; 5774004/5774005 are his two frames.
SHOOT = [
    {"id": 5774004, "photographer_id": 1841216,
     "alt": "Deliciously vibrant Korean bibimbap topped with marinated bulgogi beef and fresh vegetables",
     "src": {"large": "https://images.pexels.com/photos/5774004/x.jpeg"}},
    {"id": 5774005, "photographer_id": 1841216,
     "alt": "Authentic Korean Bibimbap with fresh vegetables and beef served in a rustic bowl",
     "src": {"large": "https://images.pexels.com/photos/5774005/x.jpeg"}},
]
# Unrelated photographers, so a real alternative exists.
OTHERS = [
    {"id": 18426525, "photographer_id": 999001,
     "alt": "Korean beef bulgogi grilled over charcoal",
     "src": {"large": "https://images.pexels.com/photos/18426525/x.jpeg"}},
    {"id": 20001, "photographer_id": 999002,
     "alt": "bibimbap rice bowl with beef and egg",
     "src": {"large": "https://images.pexels.com/photos/20001/x.jpeg"}},
]
POOL = SHOOT + OTHERS


class _Resp:
    status_code = 200
    def __init__(self, p): self._p = p
    def json(self): return self._p


class _FakeClient:
    def __init__(self, *a, **k): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *a): return False
    async def get(self, url, params=None, headers=None):
        if "themealdb" in url:
            return _Resp({"meals": None})
        if "pexels" in url:
            return _Resp({"photos": POOL})
        return _Resp({})


images.httpx.AsyncClient = _FakeClient  # type: ignore[assignment]


def get(q, hint=None):
    params = {"q": q}
    if hint:
        params["hint"] = hint
    r = client.get("/images/search", params=params)
    assert r.status_code == 200, r.text
    return r.json()["url"]


def pid(url):
    return url.rsplit("/x.jpeg", 1)[0].rsplit("/", 1)[-1] if url else None


# ── The reported bug ────────────────────────────────────────────────────────
bulgogi = get("Beef Bulgogi")
bibimbap = get("Beef Bibimbap")
check("Beef Bulgogi gets a photo", bulgogi is not None, str(pid(bulgogi)))
check("Beef Bibimbap gets a photo", bibimbap is not None, str(pid(bibimbap)))
check("the two dishes do not share a photo", bulgogi != bibimbap,
      f"{pid(bulgogi)} vs {pid(bibimbap)}")
check("the two dishes do not share a photo SHOOT either",
      not (pid(bulgogi) in {"5774004", "5774005"} and pid(bibimbap) in {"5774004", "5774005"}),
      f"{pid(bulgogi)} vs {pid(bibimbap)}")

# ── Stability: a dish must keep its photo, or heroes flicker between reloads ─
check("a dish resolves to the same photo when asked again", get("Beef Bulgogi") == bulgogi)
# Same dish, different wording of the hint: still its own photo, not a rival's.
again = get("Beef Bulgogi", hint="korean grilled marinated beef")
check("the same dish does not compete with itself across hints",
      again != bibimbap, f"{pid(again)} vs {pid(bibimbap)}")

# ── A third Korean beef dish still gets something rather than nothing ───────
third = get("Korean Beef Rice Bowl")
check("a third overlapping dish still gets an image (fallback beats a blank hero)",
      third is not None, str(pid(third)))

# ── Distinctness must never override relevance ──────────────────────────────
os.environ["CACHE_DB"] = tempfile.mktemp(suffix=".db")
irrelevant = [{"id": 77, "photographer_id": 5,
               "alt": "a cat asleep on a windowsill",
               "src": {"large": "https://images.pexels.com/photos/77/x.jpeg"}}]
POOL[:] = irrelevant
check("an irrelevant pool still yields no image, claims or not",
      get("Miso Glazed Cod") is None)

failed = [l for l, ok in checks if not ok]
print(f"\n{len(checks) - len(failed)}/{len(checks)} passed")
sys.exit(1 if failed else 0)
