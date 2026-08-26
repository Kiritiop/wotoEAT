"""
Live check for the image pipeline. Needs a real GROQ_API_KEY and PEXELS_API_KEY.

Run from wotoeat-api/:
    venv/bin/python scripts/check_dish_photo.py
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

# The router logs every rejection at INFO with what the photo actually showed.
logging.basicConfig(level=logging.INFO, format="    %(message)s")

import httpx  # noqa: E402
import routers.images as images  # noqa: E402

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
    cases = [tuple(sys.argv[1:4])] if len(sys.argv) >= 4 else CASES
    # Fresh cache, or every answer comes back instantly from the last run.
    os.environ.setdefault("CACHE_DB", "/tmp/wotoeat_photo_check.db")
    for dish, cuisine, hint in cases:
        await one(dish, cuisine, hint)
    print("\nOpen the URLs and see whether each one is actually that dish.")


if __name__ == "__main__":
    asyncio.run(main())
