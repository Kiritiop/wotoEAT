"""
Offline regression test for _profile_constraints_block in ai/prompts.py.

Run from wotoeat-api/:  venv/bin/python tests/test_profile_constraints.py
No network, no LLM, no API key. This guards the safety-critical behaviour that
allergies + dietary restrictions are emitted as ABSOLUTE hard constraints (with
the no_match override) and that health goals / calorie / protein targets shape
the suggestion. If a refactor drops this block, meal generation would silently
stop honouring allergies — so this must stay green.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai.prompts import _profile_constraints_block, meal_generate_prompt  # noqa: E402

checks = []  # (label, condition)


def check(label, cond):
    checks.append((label, bool(cond)))


# Empty / no safety-relevant fields → empty block (no noise for blank profiles).
check("empty profile → ''", _profile_constraints_block({}) == "")
check("profile with only age → ''", _profile_constraints_block({"age": 30}) == "")

# Allergies → hard-constraint block + no_match override.
alg = _profile_constraints_block({"allergies": ["peanuts", "shellfish"]})
check("allergies → SAFETY header", "DIETARY SAFETY — ABSOLUTE HARD CONSTRAINTS" in alg)
check("allergies → lists allergens", "peanuts, shellfish" in alg)
check("allergies → no_match override present", '{"error": "no_match"' in alg)
check("allergies alone → no HEALTH GOALS section", "HEALTH GOALS" not in alg)

# Restrictions → compliance block.
res = _profile_constraints_block({"dietary_restrictions": ["vegan"]})
check("restrictions → DIETARY RESTRICTIONS line", "DIETARY RESTRICTIONS: vegan" in res)
check("restrictions → no_match override present", '{"error": "no_match"' in res)

# Goals / targets → tailoring block, but NOT a safety block (no allergens/restrictions).
goals = _profile_constraints_block({"health_goals": ["lose weight"], "calorie_goal": 1800, "protein_goal_g": 110})
check("goals → HEALTH GOALS header", "HEALTH GOALS" in goals)
check("goals → calorie target rendered", "~1800" in goals)
check("goals → protein target rendered", "~110" in goals)
check("goals only → no SAFETY block", "DIETARY SAFETY" not in goals)
check("goals only → no no_match override", '{"error": "no_match"' not in goals)

# Empty lists must behave like absent (exclude_none keeps [] in the dump).
check("empty allergy list → ''", _profile_constraints_block({"allergies": [], "dietary_restrictions": []}) == "")

# End-to-end: the block is actually injected into the meal prompt.
prompt = meal_generate_prompt(
    {"profile": {"allergies": ["peanuts"]}, "slots": ["lunch"], "servings": 1}, "en"
)
check("prompt embeds allergy constraint", "ALLERGIES: peanuts" in prompt)
check("prompt keeps authenticity rule", "AUTHENTICITY" in prompt)


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
