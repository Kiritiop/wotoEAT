"""
Generated images: the last rung of the cascade, and only ever that.

Run from wotoeat-api/:  venv/bin/python tests/test_imagegen.py
No network, no keys.

Pexels is a Western stock library and its idea of 红烧排骨 is a Sichuan
chilli-oil braise in a pool of red sauce. Some dishes simply are not in there,
and for those a generated photo beats a blank hero. It must never do more than
that: a picture that was made up cannot be allowed to displace a photograph of
real food, so it runs only after every real candidate has been rejected.
"""
import asyncio
import base64
import io
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("GROQ_API_KEY", "test-dummy-key")
os.environ["CACHE_DB"] = tempfile.mktemp(suffix=".db")
os.environ["PEXELS_API_KEY"] = "test-pexels-key"
os.environ["GEMINI_API_KEY"] = "test-gemini-key"

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import ai.imagegen as imagegen  # noqa: E402
import routers.images as images  # noqa: E402

app = FastAPI()
app.include_router(images.router, prefix="/images")
client = TestClient(app)

checks: list[tuple[str, bool]] = []
generated: list[tuple] = []
uploaded: list[tuple] = []


def check(label: str, cond: bool, detail: str = "") -> None:
    checks.append((label, bool(cond)))
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{detail}]" if detail else ""))


JPEG = b"\xff\xd8\xff" + b"x" * 20_000
POOL: list[dict] = []
VERDICTS: dict[str, tuple] = {}


class _Resp:
    def __init__(self, payload=None, content=b"", status=200):
        self.status_code = status
        self._p = payload
        self.content = content
    def json(self): return self._p


class _FakeClient:
    def __init__(self, *a, **k): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *a): return False
    async def get(self, url, params=None, headers=None):
        if "themealdb" in url:
            return _Resp({"meals": None})
        if "pexels" in url:
            _FakeClient.last_params = params or {}
            return _Resp({"photos": POOL})
        return _Resp(content=JPEG)


async def _fake_verify(dish_name, cuisine, image_query, image_b64, description=""):
    raw = base64.b64decode(image_b64)
    return VERDICTS.get(len(raw), (True, 9.0, "fine"))


async def _fake_generate(dish, cuisine="", description="", image_query=""):
    generated.append((dish, cuisine, description, image_query))
    return JPEG


def _fake_upload(name, data, content_type="image/jpeg"):
    uploaded.append((name, len(data), content_type))
    return f"https://supabase.test/storage/{name}"


images.httpx.AsyncClient = _FakeClient          # type: ignore[assignment]
images.verify_dish_photo = _fake_verify         # type: ignore[assignment]
images.imagegen.generate_dish_image = _fake_generate  # type: ignore[assignment]
images.imagegen.is_available = lambda: True     # type: ignore[assignment]
images.db.upload_dish_image = _fake_upload      # type: ignore[assignment]


def photo(pid, alt):
    return {"id": pid, "photographer_id": pid, "alt": alt,
            "src": {"large": f"https://img/{pid}.jpg", "medium": f"https://img/{pid}m.jpg"}}


def get(q, hint=None, cuisine=None, desc=None):
    generated.clear(); uploaded.clear()
    params = {"q": q}
    for k, v in (("hint", hint), ("cuisine", cuisine), ("desc", desc)):
        if v: params[k] = v
    r = client.get("/images/search", params=params)
    assert r.status_code == 200, r.text
    return r.json()["url"]


# ── A real photo always wins ───────────────────────────────────────────────
POOL[:] = [photo(1, "braised pork ribs in dark soy sauce")]
VERDICTS.clear()
url = get("Hongshao Paigu A", hint="braised pork ribs", cuisine="Chinese")
check("an approved stock photo is used, not a generated one",
      url == "https://img/1.jpg", str(url))
check("...and nothing was generated", generated == [], str(generated))

# ── Nothing survives vetting: generate ─────────────────────────────────────
POOL[:] = [photo(2, "braised pork ribs chilli oil")]
VERDICTS.clear(); VERDICTS[len(JPEG)] = (False, 3.0, "sichuan chilli braise")
url = get("Hongshao Paigu B", hint="braised pork ribs", cuisine="Chinese",
          desc="色泽红亮，酱香浓郁")
check("a rejected shortlist falls through to generation",
      uploaded and url == f"https://supabase.test/storage/{uploaded[0][0]}", str(url))
check("the dish, cuisine and description all reach the generator",
      generated and generated[0][0] == "Hongshao Paigu B"
      and generated[0][1] == "Chinese" and "色泽红亮" in generated[0][2],
      str(generated[:1]))
check("the image is stored, not returned inline", uploaded and uploaded[0][1] == len(JPEG),
      str(uploaded[:1]))
check("the stored name is deterministic for the dish", uploaded[0][0].endswith(".jpg"))

# ── No candidates at all: still generate ───────────────────────────────────
POOL[:] = []
url = get("Obscure Regional Dish", hint="something nobody photographed", cuisine="Chinese")
check("a dish with no candidates at all still gets an image", url is not None, str(url))

# ── Storage failure must not invent a URL ──────────────────────────────────
images.db.upload_dish_image = lambda *a, **k: None  # type: ignore[assignment]
POOL[:] = []
check("a failed upload yields no hero rather than a broken link",
      get("Storage Down Dish", hint="x y z", cuisine="Chinese") is None)
images.db.upload_dish_image = _fake_upload  # type: ignore[assignment]

# ── Switched off ───────────────────────────────────────────────────────────
images.imagegen.is_available = lambda: False  # type: ignore[assignment]
POOL[:] = []
check("with generation unavailable the cascade ends at null",
      get("No Gemini Dish", hint="x y z", cuisine="Chinese") is None)
check("...and no generation was attempted", generated == [])
images.imagegen.is_available = lambda: True  # type: ignore[assignment]

# ── No locale on the search ────────────────────────────────────────────────
# Asking Pexels in the dish's own language returns its captions in that language
# too, and _normalize keeps only [a-z0-9], so they score 0.00 and the entire
# shortlist is dropped before any vision call. Scoring and the search have to
# speak the same language.
POOL[:] = [photo(9, "braised pork ribs")]
VERDICTS.clear()
get("Locale Probe CN", hint="braised pork ribs", cuisine="Chinese")
check("a Chinese dish is still searched in the scoreable index",
      "locale" not in _FakeClient.last_params, str(_FakeClient.last_params.get("locale")))
get("Locale Probe KR", hint="bulgogi grilled beef", cuisine="Korean")
check("...and so is a Korean one", "locale" not in _FakeClient.last_params)

# ── The generation prompt itself ───────────────────────────────────────────
prompt = imagegen.build_prompt("红烧排骨", "Chinese", "色泽红亮，酱香浓郁", "braised pork ribs")
check("the prompt names the dish", "红烧排骨" in prompt)
check("the prompt carries the recipe's description", "色泽红亮" in prompt)
check("the prompt asks for a photograph, not an illustration", "hotorealistic" in prompt)
check("the prompt bans text and watermarks", "No text" in prompt and "watermark" in prompt)

# ── The decoder must not accept junk as an image ───────────────────────────
check("a short base64 blob is not an image", imagegen._decode(base64.b64encode(b"tiny").decode()) is None)
check("valid base64 that is not an image is rejected",
      imagegen._decode(base64.b64encode(b"<html>" + b"x" * 20000).decode()) is None)
check("a real JPEG is accepted", imagegen._decode(base64.b64encode(JPEG).decode()) == JPEG)
check("a data: URI prefix is tolerated",
      imagegen._decode("data:image/jpeg;base64," + base64.b64encode(JPEG).decode()) == JPEG)
check("the image is found wherever the API nests it",
      imagegen._find_image_bytes(
          {"output": [{"content": {"parts": [{"inline_data": {"data": base64.b64encode(JPEG).decode()}}]}}]}
      ) == JPEG)
check("a reply with no image at all returns None",
      imagegen._find_image_bytes({"output": [{"type": "text", "text": "I cannot"}]}) is None)

# ── Generated images are sized for a phone header, not for print ───────────
# The first real generation came back at 882KB, which is a second of mobile data
# for a strip that renders 200px tall. Stock photos arrive around 80KB.
try:
    from PIL import Image  # noqa: F401
    _HAVE_PIL = True
except Exception:
    _HAVE_PIL = False

if _HAVE_PIL:
    from PIL import Image as _I
    buf = io.BytesIO()
    _I.new("RGB", (3000, 2000), (180, 60, 30)).save(buf, format="PNG")
    big = buf.getvalue()
    small = imagegen.shrink(big)
    check("an oversized generation is shrunk", len(small) < len(big), f"{len(big)} -> {len(small)}")
    with _I.open(io.BytesIO(small)) as im:
        check("it is capped on the long edge", max(im.size) <= imagegen._MAX_EDGE, str(im.size))
        check("aspect ratio is preserved", abs(im.size[0] / im.size[1] - 1.5) < 0.02, str(im.size))
        check("it is re-encoded as JPEG", im.format == "JPEG", str(im.format))
    import random
    rnd = random.Random(0)
    noisy = _I.new("RGB", (400, 300))
    noisy.putdata([(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256))
                   for _ in range(400 * 300)])
    tbuf = io.BytesIO(); noisy.save(tbuf, format="JPEG", quality=30)
    check("an already-small image is left alone rather than re-encoded bigger",
          imagegen.shrink(tbuf.getvalue()) == tbuf.getvalue(),
          f"{len(tbuf.getvalue())} -> {len(imagegen.shrink(tbuf.getvalue()))}")
    check("shrink never returns more bytes than it was given",
          len(imagegen.shrink(big)) <= len(big) and
          len(imagegen.shrink(tbuf.getvalue())) <= len(tbuf.getvalue()))
else:
    print("SKIP  Pillow not importable here; shrink() falls back to passthrough")

check("junk in means the same junk out, never an exception",
      imagegen.shrink(b"not an image at all") == b"not an image at all")

failed = [l for l, ok in checks if not ok]
print(f"\n{len(checks) - len(failed)}/{len(checks)} passed")
sys.exit(1 if failed else 0)
