"""
Offline regression test for the Pydantic validators in db/models.py.

Run from wotoeat-api/:  venv/bin/python tests/test_models.py
No network, no LLM, no API key. These validators sanitize untrusted LLM output:
- Ingredient.coerce_amount: parses fraction strings ("1/2" → 0.5), rejects
  non-positive / unparseable / divide-by-zero amounts to None (never crashes).
- ScannedItem.empty_to_none: maps "", "null", "none" (any case) → None so a model
  that echoes the literal string "null" doesn't poison the field.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from db.models import Ingredient, ScannedItem  # noqa: E402


def _amount(v):
    return Ingredient(name="x", unit="g", amount=v).amount


# (input, expected amount)
AMOUNT_CASES = [
    ("1/2", 0.5),
    ("3/4", 0.75),
    ("2", 2.0),
    (5, 5.0),
    (1.5, 1.5),
    ("0", None),      # not > 0
    (0, None),
    ("-3", None),     # negative
    (-1, None),
    ("abc", None),    # unparseable
    ("1/0", None),    # divide by zero
    ("", None),       # empty
    ("  ", None),     # whitespace only
    (None, None),
]

# (input, expected matches_pantry)
EMPTY_CASES = [
    ("null", None),
    ("NULL", None),
    ("none", None),
    ("None", None),
    ("", None),
    ("  ", None),
    (None, None),
    ("eggs", "eggs"),  # a real value passes through
]


def main() -> int:
    passed = failed = 0

    for v, expected in AMOUNT_CASES:
        got = _amount(v)
        if got == expected:
            passed += 1
        else:
            failed += 1
            print(f"FAIL  coerce_amount({v!r}) -> {got!r}, expected {expected!r}")

    for v, expected in EMPTY_CASES:
        got = ScannedItem(name="x", matches_pantry=v).matches_pantry
        if got == expected:
            passed += 1
        else:
            failed += 1
            print(f"FAIL  empty_to_none({v!r}) -> {got!r}, expected {expected!r}")

    print(f"\n{passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
