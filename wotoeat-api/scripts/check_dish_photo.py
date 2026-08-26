"""
Live check for the image pipeline. Needs a real GROQ_API_KEY and PEXELS_API_KEY.

Run from wotoeat-api/:
    venv/bin/python scripts/check_dish_photo.py
    venv/bin/python scripts/check_dish_photo.py --debug
    venv/bin/python scripts/check_dish_photo.py "Red Braised Pork Ribs" Chinese "braised pork ribs"

Prints, for each dish, the photo the pipeline would serve and what the vision
model said about the candidates it rejected. This is the only way to see the
vision gate actually working: the offline tests stub the model, so they prove
the wiring, not its judgment.

The default list is the cases that have gone wrong so far, so a regression shows
up as a familiar name.
"""
import asyncio
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402
load_dotenv()

# A fresh cache per run, before routers.images is imported. Otherwise the second
# run answers from the first one's cache and never calls the vision model, and
# the photo claims from the first run push dishes onto their second choice.
import tempfile  # noqa: E402
os.environ["CACHE_DB"] = tempfile.mktemp(suffix=".db")

# The router logs every verdict at INFO, and anything that went wrong at
# WARNING. --debug additionally prints the vision model's raw reply, which is
# the only way to see a malformed or truncated one: the checker fails open by
# design, so a broken gate otherwise reports every photo as kept.
DEBUG = "--debug" in sys.argv
logging.basicConfig(level=logging.INFO, format="    %(message)s")

import httpx  # noqa: E402
import ai.claude as claude  # noqa: E402
import routers.images as images  # noqa: E402

if DEBUG:
    _real_vision = claude._generate_vision

    async def _loud_vision(prompt, image_b64, max_tokens=4000):
        text = await _real_vision(prompt, image_b64, max_tokens)
        print(f"\n    --- raw vision reply ({len(text or '')} chars) ---")
        print("    " + (text or "<empty>").replace("\n", "\n    ")[:1500])
        print("    --- end ---\n")
        return text

    claude._generate_vision = _loud_vision

# dish, cuisine, image_query
CASES = [
    ("Red Braised Pork Ribs", "Chinese", "braised pork ribs"),
    ("红烧排骨", "Chinese", "braised pork ribs"),
    ("Chicken Tikka Masala", "Indian", "chicken tikka masala curry"),
    ("Beef Bulgogi", "Korean", "bulgogi grilled beef"),
    ("Beef Bibimbap", "Korean", "bibimbap rice bowl"),
    ("Shakshuka", "Middle Eastern", "shakshuka eggs tomato"),
    ("Pad Thai", "Thai", "pad thai noodles"),
    ("Coq au Vin", "French", "braised chicken wine"),
]


async def one(dish: str, cuisine: str, hint: str) -> None:
    print(f"\n{dish}  ({cuisine})   hint: {hint!r}")
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        url = await images._themealdb_image(dish, client)
        source = "themealdb"
        if not url:
            source = "pexels"
            url = await images._pexels_image(
                dish, hint, client, dish.casefold(), cuisine, True
            )
    print(f"    -> {source}: {url or 'NO IMAGE (every candidate rejected)'}")


async def main() -> None:
    for key in ("GROQ_API_KEY", "PEXELS_API_KEY"):
        if not os.getenv(key):
            print(f"{key} is not set; this script needs it.")
            raise SystemExit(1)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    cases = [tuple(args[:3])] if len(args) >= 3 else CASES
    for dish, cuisine, hint in cases:
        await one(dish, cuisine, hint)
    print(
        "\nEach 'kept'/'REJECTED' line above is the vision model's own verdict:\n"
        "its fit out of 10 and what it says the photo shows. A 'was NOT checked'\n"
        "line means the check itself failed and the photo went out unverified;\n"
        "rerun with --debug to see the model's raw reply. Open the URLs and check\n"
        "it was telling the truth."
    )


if __name__ == "__main__":
    asyncio.run(main())
