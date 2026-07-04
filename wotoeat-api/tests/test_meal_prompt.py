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
