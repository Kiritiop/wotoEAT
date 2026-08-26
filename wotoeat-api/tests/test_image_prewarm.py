"""
Meal generation starts resolving its dishes' photos immediately.

Run from wotoeat-api/:  venv/bin/python tests/test_image_prewarm.py
No network, no keys.

Vetting a photo means downloading candidates and having a vision model look at
each one, which measured 10-15 seconds. On the old flow that whole wait sat
between the user tapping a card and anything appearing, because the lookup only
started on modal-open. Generation already knows which dishes are coming, so the
work starts there and is normally finished, and cached, before a card is opened.

What matters here is that it is genuinely fire-and-forget: an image is never
worth delaying or failing a meal response over.
"""
import asyncio
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("GROQ_API_KEY", "test-dummy-key")
os.environ["CACHE_DB"] = tempfile.mktemp(suffix=".db")

import routers.images as images  # noqa: E402

checks: list[tuple[str, bool]] = []
resolved: list[tuple] = []


def check(label: str, cond: bool, detail: str = "") -> None:
    checks.append((label, bool(cond)))
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{detail}]" if detail else ""))


# Must mirror images.resolve_dish_image exactly. A stub that has drifted from the
# real signature raises TypeError, which _prewarm_one swallows by design, so the
# prewarm would look like it ran and did nothing.
async def _fake_resolve(dish, hint="", cuisine="", client_ip="unknown", desc=""):
    resolved.append((dish, hint, cuisine, client_ip, desc))
    return f"https://img/{dish}.jpg"


MEALS = [
    {"name": "Red Braised Pork Ribs", "cuisine": "Chinese", "image_query": "braised pork ribs",
     "description": "这道红烧排骨色泽红亮，酱香浓郁"},
    {"name": "Pad Thai", "cuisine": "Thai", "image_query": "pad thai noodles"},
]


async def run(meals, resolver=_fake_resolve):
    real, images.resolve_dish_image = images.resolve_dish_image, resolver
    try:
        resolved.clear()
        images.prewarm_dish_images(meals, "1.2.3.4")
        # Let the background tasks run; they are not awaited by the caller.
        await asyncio.sleep(0)
        await asyncio.gather(*list(images._prewarm_tasks), return_exceptions=True)
    finally:
        images.resolve_dish_image = real


asyncio.run(run(MEALS))
check("every generated dish is prewarmed", len(resolved) == 2, str(len(resolved)))
check("the dish name is passed through", {r[0] for r in resolved} ==
      {"Red Braised Pork Ribs", "Pad Thai"}, str([r[0] for r in resolved]))
check("image_query is passed as the hint", resolved[0][1] == "braised pork ribs", str(resolved[0][1]))
check("cuisine is passed through for the vision check", resolved[0][2] == "Chinese", str(resolved[0][2]))
check("the caller's rate-limit identity is carried, not 'unknown'",
      all(r[3] == "1.2.3.4" for r in resolved), str(resolved[0][3]))
check("the recipe's own description is carried for the vision check",
      any("色泽红亮" in r[4] for r in resolved), str([r[4][:14] for r in resolved]))

# ── It must never be able to break meal generation ─────────────────────────
async def _boom(dish, hint="", cuisine="", client_ip="unknown", desc=""):
    resolved.append((dish, hint, cuisine, client_ip, desc))
    raise RuntimeError("pexels down")

asyncio.run(run(MEALS, _boom))
check("a failing prewarm is swallowed, not raised at the caller", len(resolved) == 2)

asyncio.run(run([]))
check("no meals means no work", resolved == [])

asyncio.run(run([{"cuisine": "Thai"}, {"name": "   "}]))
check("a nameless meal is skipped rather than searched for", resolved == [], str(resolved))

asyncio.run(run([{"name": "Poutine"}]))
check("a meal with no image_query or cuisine still prewarms",
      resolved and resolved[0] == ("Poutine", "", "", "1.2.3.4", ""), str(resolved))

# ── Tasks must not leak ────────────────────────────────────────────────────
check("finished tasks are released from the keepalive set",
      images._prewarm_tasks == set(), str(len(images._prewarm_tasks)))

# ── The point of it all: the endpoint then answers from cache ──────────────
from ai.sqlite_cache import cache_get, cache_set  # noqa: E402

key = images._cache_key("red braised pork ribs", "braised pork ribs", "chinese")
cache_set(key, {"url": "https://img/prewarmed.jpg"}, 60)
got = asyncio.run(images.resolve_dish_image(
    "Red Braised Pork Ribs", "braised pork ribs", "Chinese", "1.2.3.4"))
check("a prewarmed dish is served straight from cache",
      got == "https://img/prewarmed.jpg", str(got))
check("the endpoint and the prewarm agree on the cache key",
      cache_get(key) is not None)

failed = [l for l, ok in checks if not ok]
print(f"\n{len(checks) - len(failed)}/{len(checks)} passed")
sys.exit(1 if failed else 0)
