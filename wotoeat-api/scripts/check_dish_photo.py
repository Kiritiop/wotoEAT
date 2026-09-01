"""
Live check for the image pipeline. Needs a real GEMINI_API_KEY.

Run from wotoeat-api/:
    venv/bin/python scripts/check_dish_photo.py
    venv/bin/python scripts/check_dish_photo.py --debug
    venv/bin/python scripts/check_dish_photo.py --serial
    venv/bin/python scripts/check_dish_photo.py "Red Braised Pork Ribs" Chinese "braised pork ribs"

Prints, for each dish, the image the pipeline would serve and which source
answered: themealdb or GENERATED. The offline tests stub the model, so they
prove the wiring; only this shows what a real generation actually looks like.
Open the URLs.

The default list is the cases that have gone wrong so far, so a regression shows
up as a familiar name.

The cases run concurrently, because they are independent and each one spends its
time waiting on a model drawing a picture. Run serially this script took as long
as all eight generations added together; the wall clock now is roughly the
slowest single case. Output is buffered per case and printed whole, so parallel
cases do not interleave their lines, which also means nothing appears for a case
until it finishes. --serial restores the old one-at-a-time order when a live log
matters more than the wait, and is the right mode to pair with --debug.
"""
import asyncio
import io
import logging
import os
import sys
import time
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402
load_dotenv()

# A fresh cache per run, before routers.images is imported. Otherwise the second
# run answers from the first one's cache and never generates anything.
import tempfile  # noqa: E402
os.environ["CACHE_DB"] = tempfile.mktemp(suffix=".db")

# The router logs every source at INFO and anything that went wrong at WARNING.
# --debug additionally prints the prompt each generation was given, which is the
# only way to see what the model was actually asked for when a picture comes
# back wrong.
DEBUG = "--debug" in sys.argv
SERIAL = "--serial" in sys.argv or DEBUG
logging.basicConfig(level=logging.INFO, format="    %(message)s")

import ai.imagegen as imagegen  # noqa: E402
import routers.images as images  # noqa: E402

if DEBUG:
    _real_gen = imagegen.generate_dish_image

    async def _loud_gen(dish, cuisine="", description="", image_query=""):
        print(f"\n    --- generation prompt for {dish!r} ---")
        print("    " + imagegen.build_prompt(dish, cuisine, description, image_query)
              .replace("\n", "\n    "))
        raw = await _real_gen(dish, cuisine, description, image_query)
        print(f"    --- got {len(raw or b'')} bytes ---\n")
        return raw

    imagegen.generate_dish_image = _loud_gen


# dish, cuisine, image_query, and the recipe's own description of the finished
# dish. The description is what separates a dish from its regional cousins and
# is what the image is drawn from, so leaving it out here would not be a fair
# test of what production produces.
CASES = [
    ("Red Braised Pork Ribs", "Chinese", "braised pork ribs",
     "Dark, glossy soy-braised ribs, sweet and savoury, no chilli heat"),
    ("红烧排骨", "Chinese", "braised pork ribs",
     "这道红烧排骨色泽红亮，酱香浓郁，肉质软糯，甜咸适中"),
    ("Chicken Tikka Masala", "Indian", "chicken tikka masala curry",
     "Charred chicken pieces in a creamy orange tomato sauce"),
    ("Beef Bulgogi", "Korean", "bulgogi grilled beef",
     "Thin marinated beef, grilled, served as the meat itself"),
    ("Beef Bibimbap", "Korean", "bibimbap rice bowl",
     "Rice bowl topped with seasoned vegetables, beef and an egg"),
    ("Shakshuka", "Middle Eastern", "shakshuka eggs tomato",
     "Eggs poached in a spiced tomato and pepper sauce, in a skillet"),
    ("Pad Thai", "Thai", "pad thai noodles",
     "Stir-fried rice noodles with peanuts, lime and bean sprouts"),
    ("Coq au Vin", "French", "braised chicken wine",
     "Chicken braised in red wine with mushrooms and bacon"),
]


def _source_of(url: str) -> str:
    if "themealdb" in url:
        return "themealdb"
    if "supabase" in url:
        return "GENERATED"
    return "other   "


async def one(dish: str, cuisine: str, hint: str, desc: str = "") -> float:
    """Resolve one dish and report it. Returns how long it took.

    Goes through resolve_dish_image, the same entry point the endpoint and the
    prewarm use, so this exercises the whole cascade. Reaching past it into a
    single stage, as this once did, skipped generation entirely and reported
    "no image" for dishes that would have got one in production.
    """
    started = time.perf_counter()
    # Each case gets its own rate-limit identity. Sharing one meant the whole
    # run counted against a single bucket, which is a limit on how long the
    # case list can grow rather than anything this script is trying to test.
    ip = f"check-script:{dish}"
    try:
        url = await images.resolve_dish_image(dish, hint, cuisine, ip, desc)
    except Exception as exc:  # a live run should say what broke, not vanish
        url, note = None, f"    !! raised {type(exc).__name__}: {exc}"
    else:
        note = ""
    took = time.perf_counter() - started

    print(f"\n{dish}  ({cuisine})   hint: {hint!r}   [{took:.1f}s]")
    if note:
        print(note)
    elif url:
        print(f"    -> {_source_of(url)}: {url}")
    else:
        print("    -> NO IMAGE (generation is off, or the model or upload failed)")
    return took


async def _buffered(case: tuple) -> tuple[float, str]:
    """Run a case with its output captured, so parallel cases stay readable."""
    buf = io.StringIO()
    with redirect_stdout(buf):
        took = await one(*case)
    return took, buf.getvalue()


async def main() -> None:
    for key in ("GEMINI_API_KEY",):
        if not os.getenv(key):
            print(f"{key} is not set; this script needs it.")
            raise SystemExit(1)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    cases = [tuple(args[:3]) + ("",)] if len(args) >= 3 else CASES
    if not imagegen.is_available():
        print("NOTE: IMAGE_GENERATION=0, so any dish TheMealDB does not have will\n"
              "report NO IMAGE instead of being generated.\n")

    wall = time.perf_counter()
    if SERIAL or len(cases) == 1:
        times = [await one(*case) for case in cases]
    else:
        times = []
        for took, out in await asyncio.gather(*(_buffered(c) for c in cases)):
            times.append(took)
            sys.stdout.write(out)
    wall = time.perf_counter() - wall

    slowest = max(times) if times else 0.0
    print(
        f"\n{len(cases)} dishes in {wall:.1f}s"
        f"   (slowest single case {slowest:.1f}s, sum of all {sum(times):.1f}s)"
    )
    print(
        "Each line above is what the app would put on the card. A GENERATED URL\n"
        "is a picture the model drew from the description printed beside it, so\n"
        "open them: the only thing that can tell you a drawing is wrong is\n"
        "looking at it. NO IMAGE means the cascade found nothing and the card\n"
        "would show a blank hero; the WARNING lines above say why.\n"
        "Sum-of-all far above the wall clock is the concurrency working. If the\n"
        "two are close, something is serializing the generations again."
    )


if __name__ == "__main__":
    asyncio.run(main())
