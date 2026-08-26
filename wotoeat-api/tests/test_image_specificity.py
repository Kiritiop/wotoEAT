"""
A photo has to show the dish, not merely something adjacent to it.

Run from wotoeat-api/:  venv/bin/python tests/test_image_specificity.py
No network, no keys. Alt strings are the real ones Pexels serves.

Reported case: 红烧排骨 (braised pork RIBS) was given Pexels 8256988, alt-texted
"Close-up of braised pork BELLY with sauce and greens on a ceramic plate".
Unweighted that scored 0.67 and passed, because `braised` and `pork` matched and
`ribs` -- the only word that makes it that dish -- counted for no more than
either. The words that describe how a thing was cooked and what it sits on are
true of thousands of dishes; the cut is not, and it has to carry the decision.

The second half guards the subtler trap: the retry may broaden the QUERY, never
the acceptance test. Scoring a retry against its own narrowed term list re-
accepted the exact photo the first pass had just rejected.
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
queries: list[str] = []


def check(label: str, cond: bool, detail: str = "") -> None:
    checks.append((label, bool(cond)))
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{detail}]" if detail else ""))


BELLY = {
    "id": 8256988, "photographer_id": 300,
    "alt": "Close-up of braised pork belly with sauce and greens on a ceramic plate",
    "src": {"large": "https://images.pexels.com/photos/8256988/x.jpeg"},
}
RIBS = {
    "id": 9001, "photographer_id": 301,
    "alt": "braised pork ribs glazed with soy sauce and sesame seeds",
    "src": {"large": "https://images.pexels.com/photos/9001/x.jpeg"},
}

POOL: dict[str, list[dict]] = {}


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
            q = params["query"]
            queries.append(q)
            return _Resp({"photos": POOL.get(q, POOL.get("*", []))})
        return _Resp({})


images.httpx.AsyncClient = _FakeClient  # type: ignore[assignment]

# This file exercises the TEXT layer: which candidates a query surfaces and how
# they are ranked and de-duplicated. The vision gate that runs after it is
# covered by tests/test_image_vision.py, and is switched off here so a stubbed
# model cannot mask a scoring regression.
images._VISION_CHECK = False


def get(q, hint=None):
    queries.clear()
    params = {"q": q}
    if hint:
        params["hint"] = hint
    r = client.get("/images/search", params=params)
    assert r.status_code == 200, r.text
    return r.json()["url"]


# ── 1. Only pork belly is on offer: show nothing rather than the wrong cut ──
POOL.clear(); POOL["*"] = [BELLY]
url = get("红烧排骨", hint="braised pork ribs")
check("a pork belly photo is not served for a pork ribs dish", url is None, str(url))
check("the retry did broaden the search before giving up", len(queries) == 2, str(queries))
check("the retry query drops the background words, keeping the cut",
      queries[-1] == "ribs food", str(queries[-1]))

# ── 2. The retry must not re-accept what the first pass rejected ────────────
# The broadened query returns the same belly photo. Judged against the FULL
# term list it still fails; judged against the narrowed one it would score 1.00.
POOL.clear(); POOL["*"] = [BELLY]
check("broadening the query does not lower the bar", get("ZZ Ribs", hint="braised pork ribs") is None)

# ── 3. When the right photo exists, it wins ─────────────────────────────────
POOL.clear(); POOL["*"] = [BELLY, RIBS]
url = get("红烧排骨 v2", hint="braised pork ribs")
check("the actual ribs photo is chosen over the near miss",
      url == RIBS["src"]["large"], str(url))

# ── 4. A dish whose words are all background still works ───────────────────
POOL.clear()
POOL["*"] = [{"id": 77, "photographer_id": 9,
              "alt": "thai stir fried rice noodles with peanuts and lime",
              "src": {"large": "https://images.pexels.com/photos/77/x.jpeg"}}]
check("an all-background query still matches (no distinctive word to demand)",
      get("Pad Thai", hint="thai stir fried noodles") is not None)

# ── 5. A Chinese name with no hint has nothing to search on ────────────────
POOL.clear(); POOL["*"] = [BELLY]
check("a non-Latin dish name with no hint returns null, not a guess",
      get("回锅肉") is None)
check("...and it never even calls Pexels", queries == [], str(queries))

failed = [l for l, ok in checks if not ok]
print(f"\n{len(checks) - len(failed)}/{len(checks)} passed")
sys.exit(1 if failed else 0)
