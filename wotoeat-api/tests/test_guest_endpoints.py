"""
Locks the anonymous-access contract that guest mode depends on.

Run from wotoeat-api/:  venv/bin/python tests/test_guest_endpoints.py
No network, no keys, no LLM — the AI layer is stubbed.

The app lets people try wotoEAT without an account ("Look around first" on the
landing page). That only works because the discover -> swap -> recipe steps ->
shopping loop is optional-auth end to end. Bolting require_user_id onto any of
those endpoints would break guest mode silently: the frontend would just start
showing errors on the main screen, with nothing to point at the cause.

The second half is the mirror image: the endpoints that MUST stay authenticated.
GuestGate swaps those screens for a sign-up prompt precisely because these 401.
If one of them ever became anonymous, the gate would be hiding a screen that
actually works.
"""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("GROQ_API_KEY", "test-dummy-key")
os.environ["CACHE_DB"] = tempfile.mktemp(suffix=".db")

from fastapi.testclient import TestClient  # noqa: E402

import routers.meals as meals_router  # noqa: E402
import routers.recipes as recipes_router  # noqa: E402
import routers.shopping as shopping_router  # noqa: E402
import main  # noqa: E402

# ── Stub the AI layer: these tests are about auth, not generation ───────────
_MEAL = {
    "slot": "dinner", "name": "Pad Thai", "cuisine": "Thai",
    "description": "d", "prep_time_mins": 30, "calories_per_serving": 500,
    "difficulty": "easy", "image_query": "thai stir fried noodles",
}
_PLAN = {"meals": [_MEAL], "shopping_reminders": [], "total_calories": 500,
         "nutrition_note": "n"}
_RECIPE = {"title": "Pad Thai", "servings": 1, "prep_time_mins": 30,
           "calories_per_serving": 500, "ingredients": [], "steps": ["s"], "tags": []}


async def _fake_plan(filters):
    return _PLAN, False


async def _fake_swap(slot, current_plan, filters):
    return _MEAL


async def _fake_recipe(dish_name, language, servings, force_refresh=False):
    return _RECIPE


async def _fake_shopping(recipes, pantry, language):
    return {"groups": []}


meals_router.generate_meal_plan = _fake_plan
meals_router.ai_swap_meal = _fake_swap
recipes_router.generate_recipe_by_name = _fake_recipe
shopping_router.generate_shopping_list = _fake_shopping

client = TestClient(main.app)
checks: list[tuple[str, bool]] = []


def check(label: str, cond: bool) -> None:
    checks.append((label, bool(cond)))


# ── Anonymous must work: the whole guest loop ───────────────────────────────
r = client.post("/meals/generate", json={"slots": ["dinner"], "servings": 1})
check("POST /meals/generate is anonymous (guest can generate)", r.status_code == 200)
check("generated meal carries image_query through the response model",
      r.json()["plan"]["meals"][0].get("image_query") == "thai stir fried noodles")

r = client.post("/meals/swap", json={"slot": "dinner"})
check("POST /meals/swap is anonymous (guest can swap)", r.status_code == 200)

r = client.post("/recipes/generate", json={"dish_name": "Pad Thai", "language": "en"})
check("POST /recipes/generate is anonymous (guest can open a recipe's steps)",
      r.status_code == 200)

r = client.post("/shopping/generate", json={"recipes": [], "pantry": [], "language": "en"})
check("POST /shopping/generate is anonymous (guest can build a list)",
      r.status_code == 200)

r = client.get("/images/search", params={"q": "Pad Thai"})
check("GET /images/search is anonymous", r.status_code == 200)

# A bad token must be treated as no token, not as an error, or a guest whose
# stale session lingers in storage would be locked out of the public loop.
r = client.post("/meals/generate", json={"slots": ["dinner"], "servings": 1},
                headers={"Authorization": "Bearer not-a-real-jwt"})
check("an unverifiable token degrades to anonymous, not 401", r.status_code == 200)

# ── Anonymous must NOT work: the screens GuestGate stands in for ────────────
GATED = [
    ("GET", "/pantry/", None, "pantry list"),
    ("POST", "/pantry/", {"items": []}, "pantry write"),
    ("GET", "/profile/", None, "profile read"),
    ("PUT", "/profile/", {}, "profile write"),
    ("GET", "/recipes/saved", None, "saved recipes"),
    ("GET", "/meals/history", None, "meal history"),
    ("GET", "/shopping/current", None, "shopping list sync"),
]
for method, path, body, label in GATED:
    r = client.request(method, path, json=body)
    check(f"{label} still requires an account ({method} {path})", r.status_code == 401)

# /recipes/save is the one action the Today card blocks for guests.
r = client.post("/recipes/save", json={"recipe": _RECIPE})
check("saving a recipe still requires an account", r.status_code == 401)

failed = [label for label, ok in checks if not ok]
for label, ok in checks:
    print(("PASS  " if ok else "FAIL  ") + label)
print(f"\n{len(checks) - len(failed)}/{len(checks)} passed")
sys.exit(1 if failed else 0)
