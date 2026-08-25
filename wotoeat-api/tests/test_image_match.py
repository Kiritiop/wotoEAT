"""
Offline regression test for the /images/search matching logic.

Run from wotoeat-api/:  venv/bin/python tests/test_image_match.py
No network, no keys.

Why this exists: the endpoint used to take TheMealDB's first result on faith,
and TheMealDB's search is a substring LIKE over meal titles. Verified against
the live API, that meant "Beef Stew" returned a photo of "Lemongrass beef stew
with noodles" and "Chicken Curry" returned "Katsu Chicken curry". The Pexels
fallback had the same shape of bug: per_page=1, used unconditionally.

The MealDB rule locked in below: every content word in the MealDB title must
also appear in our dish name. Extra words in OUR name are fine ("Classic Beef
Bourguignon" -> "Beef Bourguignon"); extra words in THEIRS are not, because
those are the words that make it a different dish.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routers.images import (  # noqa: E402
    _mealdb_pick,
    _pexels_score,
    _tokens,
    _PEXELS_FLOOR,
)

checks: list[tuple[str, bool]] = []


def check(label: str, cond: bool) -> None:
    checks.append((label, bool(cond)))


def _meals(*titles: str) -> list[dict]:
    return [{"strMeal": t, "strMealThumb": f"https://img/{t}.jpg"} for t in titles]


def _picked(dish: str, *titles: str) -> str | None:
    url = _mealdb_pick(dish, _meals(*titles))
    return url.split("/")[-1][: -len(".jpg")] if url else None


# ── MealDB: the reported failures must now be rejected ──────────────────────
check(
    "'Beef Stew' rejects 'Lemongrass beef stew with noodles'",
    _picked("Beef Stew", "Lemongrass beef stew with noodles") is None,
)
check(
    "'Chicken Curry' rejects every modifier-carrying curry",
    _picked(
        "Chicken Curry",
        "Katsu Chicken curry",
        "Nutty Chicken Curry",
        "Bengali Chicken Curry with Potatoes",
        "Panang chicken curry (kaeng panang gai)",
    )
    is None,
)
check(
    "bare 'Chicken' rejects 'Chicken Handi'",
    _picked("Chicken", "Chicken Handi", "Chicken Mandi", "Sticky Chicken") is None,
)
check(
    "bare 'Salad' rejects 'Noodle bowl salad'",
    _picked("Salad", "Noodle bowl salad", "Pomegranate salad") is None,
)
check(
    "a one-word title never swallows a more specific dish",
    _picked("Fish Tacos", "Fish") is None,
)

# ── MealDB: real matches must still land ────────────────────────────────────
check(
    "exact match wins over a same-prefix sibling",
    _picked("Katsu Chicken Curry", "Katsu Chicken curry", "Nutty Chicken Curry")
    == "Katsu Chicken curry",
)
check(
    "extra adjectives in OUR name are fine",
    _picked("Classic Beef Bourguignon", "Beef Bourguignon") == "Beef Bourguignon",
)
check(
    "exact match is case- and accent-insensitive",
    _picked("Pad Thai", "Pad Thai") == "Pad Thai",
)
check(
    "single-word dish matches its single-word title exactly",
    _picked("Poutine", "Poutine") == "Poutine",
)
check(
    "a result missing a thumbnail is skipped",
    _mealdb_pick("Poutine", [{"strMeal": "Poutine", "strMealThumb": ""}]) is None,
)

# ── Pexels: relevance floor ─────────────────────────────────────────────────
def _scores(dish: str, alt: str) -> float:
    return _pexels_score(alt, _tokens(dish, drop_filler=True)[:4])


check(
    "a matching photo clears the floor",
    _scores("Beef Stew", "hearty beef stew in a bowl") >= _PEXELS_FLOOR,
)
check(
    "plurals still count (chickpea / chickpeas)",
    _scores("Chickpea Curry", "bowl of chickpeas curry with rice") >= _PEXELS_FLOOR,
)
check(
    "an unrelated photo is rejected",
    _scores("Miso Glazed Cod", "close up of a hamburger and fries") < _PEXELS_FLOOR,
)
check(
    "an empty alt scores zero rather than passing by default",
    _scores("Miso Glazed Cod", "") == 0.0,
)

# ── Query cleaning ──────────────────────────────────────────────────────────
check(
    "marketing filler is stripped from the search query",
    _tokens("Classic Homemade Beef Stew", drop_filler=True) == ["beef", "stew"],
)
check(
    "cooking and flavour words are kept — they are the strongest photo signal",
    _tokens("Creamy Garlic Butter Chicken", drop_filler=True)
    == ["creamy", "garlic", "butter", "chicken"],
)
check(
    "accents and punctuation normalize away",
    _tokens("Crème Brûlée") == ["creme", "brulee"],
)


failed = [label for label, ok in checks if not ok]
for label, ok in checks:
    print(("PASS  " if ok else "FAIL  ") + label)
print(f"\n{len(checks) - len(failed)}/{len(checks)} passed")
sys.exit(1 if failed else 0)
