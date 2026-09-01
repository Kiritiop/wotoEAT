"""
Time the image generation settings against a real GEMINI_API_KEY, and keep the
pictures so the speed numbers can be weighed against what they cost in quality.

Run from wotoeat-api/:
    venv/bin/python scripts/bench_imagegen.py            # shows the plan and the cost
    venv/bin/python scripts/bench_imagegen.py --yes      # runs it
    venv/bin/python scripts/bench_imagegen.py --yes --dishes 1
    venv/bin/python scripts/bench_imagegen.py --yes --only lite,current

This SPENDS MONEY: every row is a real paid generation. It prints the estimated
bill and does nothing until --yes, on purpose.

It drives ai.imagegen itself rather than a copy of the request, so what it
measures is the path production takes, resize included. Images land in
scripts/bench_out/<config>/<dish>.jpg -- open them side by side before changing
anything. A model that is two seconds faster and draws a worse plate of food is
not an improvement, and only you can see which is which.
"""
import argparse
import asyncio
import io
import os
import json
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402
load_dotenv()

import ai.imagegen as imagegen  # noqa: E402

OUT = Path(__file__).resolve().parent / "bench_out"

# Three dishes MealDB does not have, so these are the generations production
# actually pays for. One non-Latin name, because that is the case generation
# exists to serve.
# (dish, cuisine, image_query, description, what to check in the picture)
# The last field is the point. A generated photo can only be judged by looking
# at it, and "looks nice" is not a judgement -- each description makes one
# falsifiable visual claim, so a miss is a fact rather than an opinion.
QUICK = [
    ("红烧排骨", "Chinese", "braised pork ribs",
     "这道红烧排骨色泽红亮，酱香浓郁，肉质软糯，甜咸适中",
     "dark glossy SOY braise. NO chillies, no chilli oil"),
    ("Lion Head Meatballs", "Chinese", "large braised pork meatballs",
     "Oversized pork meatballs braised with cabbage in a clear savoury broth",
     "big meatballs, cabbage, CLEAR broth. Not a red sauce"),
    ("Shakshuka", "Middle Eastern", "shakshuka eggs tomato",
     "Eggs poached in a spiced tomato and pepper sauce, served in the skillet",
     "whole eggs poached IN the sauce, in a pan"),
]

# Weighted to Chinese home cooking, where the failure showed up. Half of these
# must NOT be red and half MUST be, so the suite catches a model that reaches
# for chilli oil by reflex AND one that sands the heat off everything. A suite
# that only punished one direction would be easy to pass by accident.
CHINESE = [
    ("红烧排骨", "Chinese", "braised pork ribs",
     "这道红烧排骨色泽红亮，酱香浓郁，肉质软糯，甜咸适中",
     "MILD: dark glossy soy braise, no chillies"),
    ("红烧肉", "Chinese", "red braised pork belly",
     "五花肉切块红烧，色泽红亮油润，入口即化，甜咸不辣",
     "MILD: glossy cubes of pork belly, no chillies"),
    ("番茄炒蛋", "Chinese", "tomato scrambled egg",
     "番茄炒蛋，蛋块金黄，番茄出汁，家常清淡不辣",
     "MILD: yellow egg and red TOMATO pieces, not a chilli sauce"),
    ("白切鸡", "Chinese", "poached white cut chicken",
     "白切鸡皮色淡黄，肉质雪白，清淡不辣，配姜葱蘸料",
     "MILD: PALE poached chicken, skin not browned or roasted"),
    ("清蒸鲈鱼", "Chinese", "steamed sea bass whole fish",
     "整条鲈鱼清蒸，鱼身雪白，淋豉油，铺葱丝姜丝，清鲜不辣",
     "MILD: whole white fish, scallion and ginger, clear sauce"),
    ("冬瓜排骨汤", "Chinese", "winter melon pork rib soup",
     "冬瓜排骨汤，汤色清澈，冬瓜透明，清淡不辣",
     "MILD: CLEAR soup, translucent melon. Not a red broth"),
    ("上汤娃娃菜", "Chinese", "baby cabbage in broth",
     "上汤娃娃菜，汤色奶白清亮，菜叶青翠，咸鲜不辣",
     "MILD: pale broth, green cabbage. No chilli"),
    ("蒸蛋羹", "Chinese", "steamed egg custard",
     "蒸蛋羹表面光滑如镜，嫩黄色，淋少许酱油和香油，不辣",
     "MILD: smooth pale yellow custard surface, no chilli"),
    ("糖醋里脊", "Chinese", "sweet and sour pork",
     "糖醋里脊外酥里嫩，裹橙红色糖醋芡汁，酸甜不辣",
     "MILD: orange sweet-sour glaze on fried pork, no chillies"),
    ("麻婆豆腐", "Chinese", "mapo tofu",
     "麻婆豆腐红油亮泽，麻辣鲜香，豆腐嫩滑，撒花椒粉和蒜苗",
     "SPICY: it SHOULD be red chilli oil. A pale version is the miss"),
    ("宫保鸡丁", "Chinese", "kung pao chicken",
     "宫保鸡丁有干辣椒和花生，酱色油亮，辣中带甜",
     "SPICY: dried chillies and peanuts must be visible"),
    ("水煮牛肉", "Chinese", "sichuan boiled beef in chilli broth",
     "水煮牛肉浮着一层红油辣椒，麻辣浓烈，牛肉片嫩滑",
     "SPICY: a slick of red chilli oil on top"),
    ("青椒肉丝", "Chinese", "shredded pork green pepper",
     "青椒肉丝，青椒翠绿，肉丝酱色，咸鲜不辣",
     "MILD: GREEN peppers, not red chillies"),
    ("Coq au Vin", "French", "chicken braised in red wine",
     "Chicken braised in red wine with mushrooms, bacon and pearl onions",
     "control: dark wine sauce, mushrooms, no Asian styling"),
    ("Pad Thai", "Thai", "pad thai noodles",
     "Stir-fried rice noodles with peanuts, lime wedge and bean sprouts",
     "control: noodles with peanuts, lime and sprouts"),
]

SUITES = {"quick": QUICK, "chinese": CHINESE}
DISHES = QUICK

# model, image_size, aspect, thinking, and the per-image list price at that size.
# Prices are Google's published standard-tier figures and go stale; they are here
# to keep the bill in view, not to be authoritative.
CONFIGS = {
    "current":  ("gemini-3.1-flash-image",      None,  None,     None,      0.067),
    "tuned":    ("gemini-3.1-flash-image",      "1K",  "16:9",   "minimal", 0.067),
    "thinking": ("gemini-3.1-flash-image",      "1K",  "16:9",   "high",    0.067),
    "lite":     ("gemini-3.1-flash-lite-image", "1K",  "16:9",   "minimal", 0.034),
    "pro":      ("gemini-3-pro-image",          "1K",  "16:9",   "minimal", 0.134),
    "flash2k":  ("gemini-3.1-flash-image",      "2K",  "16:9",   "minimal", 0.101),
}

# "current" is what production sends today: no response_format, no
# generation_config, whatever the API defaults to. Its size is unknown, so its
# price is a guess -- which is itself part of the argument for pinning one.
BARE = {"current"}


def _stub() -> None:
    """--dry: answer every request locally with a plausible image.

    Exists so a typo in this file costs nothing to find. It replaces only the
    HTTP call, so the payload building, the fallback detection, the resize, the
    timing and the reporting are all the real ones.
    """
    import base64
    from PIL import Image

    class _R:
        status_code, text = 200, ""
        def __init__(s, b): s._b = b
        def json(s): return {"data": base64.b64encode(s._b).decode()}

    async def fake_post(client, prompt, tuned):
        w, h = (1024, 576) if imagegen._ASPECT == "16:9" else (1024, 1024)
        if imagegen._IMAGE_SIZE == "2K":
            w, h = w * 2, h * 2
        buf = io.BytesIO()
        Image.new("RGB", (w, h), (180, 90, 60)).save(buf, "JPEG", quality=90)
        await asyncio.sleep(0.2)
        return _R(buf.getvalue())

    imagegen._post = fake_post


def apply(name: str) -> None:
    model, size, aspect, thinking, _ = CONFIGS[name]
    imagegen._MODEL = model
    imagegen._IMAGE_SIZE = size or ""
    imagegen._ASPECT = aspect or ""
    imagegen._THINKING = thinking or ""
    imagegen._tuning_rejected = name in BARE


def dims(raw: bytes) -> str:
    try:
        from PIL import Image
        with Image.open(io.BytesIO(raw)) as im:
            return f"{im.size[0]}x{im.size[1]}"
    except Exception:
        return "?"


async def run_config(name: str, dishes: list, repeat: int, dry: bool = False) -> dict:
    apply(name)
    # A dry run's pictures are flat orange rectangles. They go somewhere else,
    # so they can never be mistaken for a real generation's output.
    folder = (OUT / "_dryrun_stubs" / name) if dry else (OUT / name)
    folder.mkdir(parents=True, exist_ok=True)
    times, sizes, shapes, fails = [], [], [], 0
    tuned_config = name not in BARE

    for dish, cuisine, hint, desc, *_check in dishes:
        for r in range(repeat):
            t = time.perf_counter()
            raw = await imagegen.generate_dish_image(dish, cuisine, desc, hint)
            took = time.perf_counter() - t
            if raw is None:
                fails += 1
                print(f"   {name:9} {dish[:22]:24} FAILED after {took:5.1f}s "
                      f"(see the WARNING above)")
                continue
            times.append(took); sizes.append(len(raw)); shapes.append(dims(raw))
            suffix = f"-{r}" if repeat > 1 else ""
            safe = "".join(c if c.isalnum() else "_" for c in dish)[:30]
            (folder / f"{safe}{suffix}.jpg").write_bytes(raw)
            print(f"   {name:9} {dish[:22]:24} {took:5.1f}s  "
                  f"{len(raw)/1024:5.0f}KB  {dims(raw)}")
    # If the API rejected the tuned body, imagegen fell back to the bare one and
    # every number below describes the bare request instead. Silently that would
    # make several configs look identical and the whole run look like a null
    # result, which is the most expensive way to learn nothing.
    fellback = tuned_config and imagegen._tuning_rejected
    return {"times": times, "sizes": sizes, "shapes": shapes,
            "fails": fails, "fellback": fellback}


def report(results: dict, _dishes_run: list, dry: bool = False) -> None:
    # Also written to disk. Whoever runs this may not be whoever reads it, and a
    # results file in the repo is easier to hand over than scrollback.
    summary = {
        name: {
            "config": dict(zip(("model", "image_size", "aspect", "thinking", "usd"),
                               CONFIGS[name])),
            "seconds": [round(t, 2) for t in r["times"]],
            "median_seconds": round(statistics.median(r["times"]), 2) if r["times"] else None,
            "median_kb": round(statistics.median(r["sizes"])/1024) if r["sizes"] else None,
            "shapes": r["shapes"],
            "failures": r["fails"],
            "fell_back_to_untuned": r.get("fellback", False),
        }
        for name, r in results.items()
    }
    summary["_checklist"] = {d[0]: (d[4] if len(d) > 4 else "") for d in _dishes_run}
    path = OUT / ("results-dry.json" if dry else "results.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"\n{'config':10} {'median':>8} {'min':>7} {'max':>7} {'KB':>7} "
          f"{'shape':>10}  fails")
    base = None
    for name, r in results.items():
        if not r["times"]:
            print(f"{name:10} {'no successful generations':>40}   {r['fails']}")
            continue
        med = statistics.median(r["times"])
        base = base if base is not None else med
        shape = max(set(r["shapes"]), key=r["shapes"].count)
        flag = "  <- FELL BACK to the bare request; this row is not what it says" \
            if r.get("fellback") else ""
        print(f"{name:10} {med:7.1f}s {min(r['times']):6.1f}s {max(r['times']):6.1f}s "
              f"{statistics.median(r['sizes'])/1024:6.0f}K {shape:>10}   {r['fails']}{flag}")
    if base:
        first = list(results)[0]
        note = " (what production sends today)" if first == "current" else ""
        print(f"\nvs '{first}'{note}:")
        for name, r in list(results.items())[1:]:
            if not r["times"]:
                continue
            med = statistics.median(r["times"])
            print(f"   {name:10} {base - med:+5.1f}s   "
                  f"{(1 - med/base)*100:+5.0f}%")
    if any(r.get("fellback") for r in results.values()):
        print("\nAt least one config fell back: the API refused response_format or\n"
              "generation_config. Those rows measured the untuned request, so ignore\n"
              "them and fix the field names before drawing any conclusion.")
    print(f"\nImages are in {OUT}, numbers in {path.name}. The timings are one\n"
          "thing and the pictures another; open them before changing the default.")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--yes", action="store_true", help="actually spend the money")
    ap.add_argument("--suite", default="quick", choices=sorted(SUITES),
                    help="quick = 3 dishes; chinese = 15 weighted to the case that failed")
    ap.add_argument("--dishes", type=int, default=0, help="0 = the whole suite")
    ap.add_argument("--repeat", type=int, default=1,
                    help="runs per dish; >1 if generation times look noisy")
    ap.add_argument("--only", default="", help="comma-separated config names")
    ap.add_argument("--dry", action="store_true",
                    help="stub the API and spend nothing; proves the script runs")
    args = ap.parse_args()

    if args.dry:
        _stub()
    elif not os.getenv("GEMINI_API_KEY"):
        print("GEMINI_API_KEY is not set; this script needs a real one.")
        raise SystemExit(1)

    names = [n.strip() for n in args.only.split(",") if n.strip()] or list(CONFIGS)
    unknown = [n for n in names if n not in CONFIGS]
    if unknown:
        print(f"unknown config(s): {unknown}. Known: {list(CONFIGS)}")
        raise SystemExit(1)
    suite = SUITES[args.suite]
    dishes = suite[:args.dishes] if args.dishes else suite
    calls = len(names) * len(dishes) * args.repeat
    cost = sum(CONFIGS[n][4] for n in names) * len(dishes) * args.repeat

    print(f"{calls} generations across {len(names)} configs "
          f"({', '.join(names)}) x {len(dishes)} dishes x {args.repeat}")
    print(f"estimated cost ~${cost:.2f} at list price"
          + ("   [--dry: nothing is sent, nothing is charged]" if args.dry else "") + "\n")
    if args.dry:
        args.yes = True
    if not args.yes:
        print("Nothing has been generated. Re-run with --yes to go ahead.")
        return

    results = {}
    for name in names:
        model, size, aspect, thinking, _ = CONFIGS[name]
        print(f"\n{name}: {model}  size={size or 'default'}  "
              f"aspect={aspect or 'default'}  thinking={thinking or 'default'}")
        results[name] = await run_config(name, dishes, args.repeat, args.dry)
    report(results, dishes, args.dry)


if __name__ == "__main__":
    asyncio.run(main())
