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
    _weight,
    _contradicts,
    _PEXELS_FLOOR,
    _DISTINCT_WEIGHT,
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


# ── The word that names the dish has to carry the decision ──────────────────
# Reported case: 红烧排骨 (braised pork RIBS) was shown a photo alt-texted
# "Close-up of braised pork BELLY with sauce and greens on a ceramic plate".
# Unweighted, that scored 0.67 and was accepted: `braised` and `pork` matched,
# and `ribs` -- the only word that makes it that dish -- counted for no more
# than either of them. Both alt strings below are exactly what Pexels serves.
_RIBS = _tokens("braised pork ribs", drop_filler=True)
check(
    "a pork BELLY photo is rejected for a pork RIBS dish",
    _pexels_score(
        "Close-up of braised pork belly with sauce and greens on a ceramic plate", _RIBS
    ) < _PEXELS_FLOOR,
)
check(
    "an actual pork ribs photo still scores top",
    _pexels_score("braised pork ribs glazed with soy sauce and sesame seeds", _RIBS) == 1.0,
)
check(
    "a rice bowl is rejected when the dish is the ribs, not the staple",
    _pexels_score(
        "braised pork over steamed rice with pickled vegetables",
        _tokens("braised pork ribs rice", drop_filler=True),
    ) < _PEXELS_FLOOR,
)
check(
    "cooking method, staple and broad protein are all background words",
    _weight("braised") == 1 and _weight("rice") == 1 and _weight("pork") == 1,
)
check(
    "a cut, a dish name and an ingredient identify a dish",
    _weight("ribs") == _DISTINCT_WEIGHT
    and _weight("bulgogi") == _DISTINCT_WEIGHT
    and _weight("chickpea") == _DISTINCT_WEIGHT,
)
check(
    "a query of only background words degrades to the plain fraction",
    _pexels_score(
        "thai stir fried rice noodles with peanuts",
        _tokens("thai stir fried noodles", drop_filler=True),
    ) == 1.0,
)
check(
    "weighting never rescues an irrelevant photo",
    _pexels_score("a cat asleep on a windowsill", _RIBS) == 0.0,
)

# ── Non-Latin dish names ────────────────────────────────────────────────────
# The app sends the dish name in the user's language, so a zh user's `q` is
# "红烧排骨". Nothing tokenizes out of it, which is why image_query is required
# to be English: it is the ONLY search signal those users have.
check(
    "a Chinese dish name yields no search tokens on its own",
    _tokens("红烧排骨", drop_filler=True) == [],
)
check(
    "the English hint is what actually searches for a zh user",
    _tokens("braised pork ribs", drop_filler=True) == ["braised", "pork", "ribs"],
)

# ── When the caption names a different protein, believe it ─────────────────
# All captions below are the real ones Pexels serves. A shared vocabulary
# ("tikka masala curry") is not evidence when the photographer has said outright
# that the dish is made of something else.
def _clash(dish_hint: str, alt: str) -> bool:
    return _contradicts(set(_tokens(alt)), _tokens(dish_hint, drop_filler=True)[:4])


check(
    "paneer tikka masala is not a chicken tikka masala photo",
    _clash("chicken tikka masala curry",
           "Flavorful paneer tikka masala with fresh ingredients, captured in Bengaluru"),
)
check(
    "a chicken curry photo survives the same test",
    not _clash("chicken tikka masala curry",
               "Red curry with chicken, naan, rice and spices"),
)
check(
    "lamb chops are not pork ribs",
    _clash("braised pork ribs", "lamb chops with foil wrapped bones and steak fries"),
)
check(
    "an actual pork ribs photo survives",
    not _clash("braised pork ribs",
               "savory sesame glazed pork ribs with corn on a serving plate"),
)
check(
    "a caption naming no protein is left to the vision model",
    not _clash("bibimbap rice bowl",
               "colorful Korean bibimbap bowl with mixed vegetables and mushrooms"),
)
check(
    "a dish naming no protein never triggers the guard",
    not _clash("shakshuka eggs tomato", "a plate of grilled chicken"),
)
check(
    "a caption listing several proteins passes if one of them is ours",
    not _clash("braised pork ribs", "a platter of pork ribs and beef brisket"),
)

failed = [label for label, ok in checks if not ok]
for label, ok in checks:
    print(("PASS  " if ok else "FAIL  ") + label)
print(f"\n{len(checks) - len(failed)}/{len(checks)} passed")
sys.exit(1 if failed else 0)
