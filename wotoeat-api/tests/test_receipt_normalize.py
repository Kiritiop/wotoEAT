"""
Live-LLM fixture test for receipt-scan Stage 2 (normalize_receipt_items).

Run from wotoeat-api/:  venv/bin/python tests/test_receipt_normalize.py
Needs GROQ_API_KEY (loaded from .env via ai.claude).

Proves the prompt contract: `name` is canonical English regardless of the
receipt's or the user's language, `name_zh` is always Simplified Chinese,
junk lines are omitted, and matches_pantry only ever echoes pantry strings.
Scenario asserts have mild LLM flake risk — rerun once before treating a
failure as a regression.
"""
import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai.claude import normalize_receipt_items  # noqa: E402
from db.models import ScannedItem  # noqa: E402

CJK = re.compile(r"[一-鿿]")

FIXTURE_EN = [
    "WALMART SUPERCENTER",
    "ST# 02882 OP# 009044 TE# 44",
    "GV LG EGGS 12CT 3.48 F",
    "ORG BNLS CKN BRST 8.97 F",
    "2.14 lb @ 4.19/lb",
    "BOUNTY PPR TWL 12.99 X",
    "COUPON -1.00",
    "SUBTOTAL 25.44",
    "TAX 1 6.75% 1.99",
    "TOTAL 27.43",
    "VISA TEND 27.43",
]

FIXTURE_ZH = [
    "永辉超市",
    "鸡蛋 30枚 12.50",
    "西红柿 1.2kg 6.80",
    "纸巾 8.99",
    "合计 28.29",
    "微信支付 28.29",
]

PANTRY = ["eggs", "鸡胸肉"]

JUNK = ("subtotal", "tax", "total", "visa", "coupon", "walmart", "合计", "微信", "永辉")


def check_common(items: list[dict], label: str) -> None:
    assert items, f"[{label}] no items returned"
    for raw in items:
        item = ScannedItem(**raw)  # pydantic path must accept every item
        assert item.name and item.name.isascii() and not CJK.search(item.name), (
            f"[{label}] name not canonical English: {item.name!r}"
        )
        assert item.name_zh and CJK.search(item.name_zh), (
            f"[{label}] name_zh missing/not Chinese for {item.name!r}: {item.name_zh!r}"
        )
        assert item.matches_pantry in (None, "eggs", "鸡胸肉"), (
            f"[{label}] hallucinated matches_pantry: {item.matches_pantry!r}"
        )
    names = [i["name"].lower() for i in items]
    assert not any(j in n for n in names for j in JUNK), f"[{label}] junk row leaked: {names}"


def main() -> None:
    # Crossed languages on purpose: EN receipt with zh request, ZH receipt with
    # en request — names must come back English either way.
    en_items = asyncio.run(normalize_receipt_items(FIXTURE_EN, PANTRY, "zh"))
    print(f"[en-fixture] {json.dumps(en_items, ensure_ascii=False, indent=2)}")
    check_common(en_items, "en-fixture")

    eggs = [i for i in en_items if "egg" in i["name"].lower()]
    assert eggs and eggs[0]["matches_pantry"] == "eggs", f"eggs not matched: {eggs}"
    chicken = [i for i in en_items if "chicken breast" in i["name"].lower()]
    assert chicken and chicken[0]["matches_pantry"] == "鸡胸肉", f"chicken not matched: {chicken}"
    towels = [i for i in en_items if not i["is_food"]]
    assert towels, "expected a non-food row (Bounty paper towels)"

    zh_items = asyncio.run(normalize_receipt_items(FIXTURE_ZH, PANTRY, "en"))
    print(f"[zh-fixture] {json.dumps(zh_items, ensure_ascii=False, indent=2)}")
    check_common(zh_items, "zh-fixture")

    # The exact user repro at prompt level: a 鸡蛋 receipt line must come back
    # as English "eggs" AND match the existing pantry "eggs" entry.
    zh_eggs = [i for i in zh_items if "egg" in i["name"].lower()]
    assert zh_eggs and zh_eggs[0]["matches_pantry"] == "eggs", f"鸡蛋 repro failed: {zh_eggs}"

    print("\nALL ASSERTIONS PASSED")


if __name__ == "__main__":
    main()
