"""
Offline regression test for _clean_json / _NUM_EXPR_RE in ai/claude.py.

Run from wotoeat-api/:  venv/bin/python tests/test_clean_json.py
No network, no LLM, no API key. Locks in two behaviours the recipe/meal parse
relies on: (1) a bare arithmetic expression in a numeric value position is
resolved so the JSON parses (models sometimes emit "523 / 14" instead of 37);
(2) the resolver never touches digits inside string values (URLs, "1/2 cup"),
markdown fences are stripped, and plain JSON is left untouched.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai.claude import _clean_json  # noqa: E402

# (raw, expected_parsed_dict)
CASES = [
    # division expression in a numeric value → resolved (round(523/14) == 37)
    ('{"calories": 523 / 14, "x": 2}', {"calories": 37, "x": 2}),
    # multiplication expression
    ('{"total": 12 * 4}', {"total": 48}),
    # markdown fence stripped
    ("```json\n{\"a\": 1}\n```", {"a": 1}),
    # URL inside a string is NOT mangled by the arithmetic resolver
    ('{"url": "https://ex.com/a/b"}', {"url": "https://ex.com/a/b"}),
    # a fraction inside a string value is preserved verbatim
    ('{"amount": "1/2 cup"}', {"amount": "1/2 cup"}),
    # plain numeric value untouched
    ('{"calories": 100}', {"calories": 100}),
    # expression in an array element position
    ('{"vals": [10 / 4, 3]}', {"vals": [2, 3]}),  # round(2.5) == 2 (banker's rounding)
]


def main() -> int:
    passed = failed = 0
    for raw, expected in CASES:
        try:
            got = json.loads(_clean_json(raw))
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL  {raw!r} did not parse: {exc}")
            continue
        if got == expected:
            passed += 1
        else:
            failed += 1
            print(f"FAIL  {raw!r}\n        got      {got}\n        expected {expected}")
    print(f"\n{passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
