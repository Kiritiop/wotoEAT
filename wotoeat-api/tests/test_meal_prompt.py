"""
Offline regression test for meal_generate_prompt's behavioural blocks
(beyond the profile-safety ones covered by test_profile_constraints.py).

Run from wotoeat-api/:  venv/bin/python tests/test_meal_prompt.py
No network, no LLM, no key. Locks the prompt features users rely on:
authenticity (real dishes only), the prep-time hard cap, the required-tags
no_match contract, pantry priority, and main-dish mode.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai.prompts import meal_generate_prompt  # noqa: E402

checks = []


def check(label, cond):
    checks.append((label, bool(cond)))


BASE = {"slots": ["lunch"], "servings": 1}

# Authenticity block is unconditional — the model must never invent dishes.
p = meal_generate_prompt(dict(BASE), "en")
check("authenticity block always present", "AUTHENTICITY" in p)
check("bans invented/filler names", "NEVER invent dishes" in p)
check("bans generic non-dishes", "Grilled Chicken with Vegetables" in p)

# Prep-time hard cap only meaningful when the filter is set — but the rule
# line itself must always be present so a set filter is enforced.
check("prep-time cap rule present", "max_prep_time_mins is set" in p and "MUST be at or under" in p)

# Required tags: enforcement + no_match contract appear iff set.
p_req = meal_generate_prompt(dict(BASE, required_ingredients="tofu, spicy"), "en")
check("required block present when set", "REQUIRED TAGS / INGREDIENTS" in p_req)
check("no_match contract present", '"error": "no_match"' in p_req)
check("required terms echoed", "tofu, spicy" in p_req)
check("no required block when unset", "REQUIRED TAGS / INGREDIENTS" not in p)

# Pantry priority appears iff pantry given, and lists the items.
p_pan = meal_generate_prompt(dict(BASE, pantry=["eggs", "tomato"]), "en")
check("pantry block present when given", "PANTRY PRIORITY" in p_pan)
check("pantry items listed", "eggs, tomato" in p_pan)
check("no pantry block when empty", "PANTRY PRIORITY" not in p)

# Main-dish mode forbids staples; absent in full-meal mode.
p_main = meal_generate_prompt(dict(BASE, meal_style="main_dish"), "en")
check("main-dish block present", "MAIN DISH MODE" in p_main)
check("staple must be empty", 'components.staple to ""' in p_main)
check("no main-dish block for full meals", "MAIN DISH MODE" not in p)

# avoid_meals fold into the disliked list.
p_avoid = meal_generate_prompt(dict(BASE, avoid_meals=["Shakshuka", "Pad Thai"]), "en")
check("avoided meals in disliked line", "Shakshuka" in p_avoid and "Pad Thai" in p_avoid)

# Taste profile: "up" ratings (recorded on save) appear as the weakest-tier
# preference block; "down" ratings and empty ratings must not produce it.
p_liked = meal_generate_prompt(dict(BASE, recent_ratings={"Bibimbap": "up", "Pho Bo": "up"}), "en")
check("taste profile block present for ups", "TASTE PROFILE" in p_liked)
check("liked dishes listed", "Bibimbap" in p_liked and "Pho Bo" in p_liked)
check("taste profile is lowest priority", "lowest priority" in p_liked)
check("no exact repeats instruction", "NOT simply repeat" in p_liked)
p_downs = meal_generate_prompt(dict(BASE, recent_ratings={"Shakshuka": "down"}), "en")
check("no taste profile for downs only", "TASTE PROFILE" not in p_downs)
check("no taste profile without ratings", "TASTE PROFILE" not in p)
# A dish shown today (avoid list) must not simultaneously appear as liked.
p_flip = meal_generate_prompt(dict(BASE, recent_ratings={"Pad Thai": "up"}, avoid_meals=["Pad Thai"]), "en")
check("avoid/disliked wins over liked", "TASTE PROFILE" not in p_flip)


# ── image_query (photo search term) ─────────────────────────────────────────
# Display names are marketing copy and search badly against stock-photo APIs
# ("Coq au Vin" matches nothing that looks like braised chicken). The generator
# supplies a plain-English visual description alongside the name; /images/search
# passes it through as the `hint`. Both the field rule and the JSON key must
# survive prompt edits, or the field silently stops arriving and every hero
# image quietly regresses to guessing from the display name.
_img = meal_generate_prompt(BASE, "en")
check("image_query field rule is present", "- image_query:" in _img)
check("image_query is in the response schema", '"image_query": "string"' in _img)
check(
    "image_query is pinned to English regardless of response language",
    "Always in English" in meal_generate_prompt(BASE, "zh"),
)
check(
    "image_query survives main-dish mode",
    '"image_query"' in meal_generate_prompt(dict(BASE, meal_style="main_dish"), "en"),
)

def main() -> int:
    passed = sum(1 for _, ok in checks if ok)
    failed = len(checks) - passed
    for label, ok in checks:
        if not ok:
            print(f"FAIL  {label}")
    print(f"\n{passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
