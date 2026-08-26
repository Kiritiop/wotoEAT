"""
The image generator itself: its prompt, its decoder, and its sizing.

Run from wotoeat-api/:  venv/bin/python tests/test_imagegen.py
No network, no keys.

Where it sits in the cascade is covered by tests/test_image_cascade.py. This
file is about the three things that can go wrong inside ai/imagegen.py without
anything upstream noticing: a prompt that loses what makes the dish itself, a
decoder that accepts an error page as a photograph, and an 882KB header image.
"""
import base64
import io
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("GROQ_API_KEY", "test-dummy-key")
os.environ["GEMINI_API_KEY"] = "test-gemini-key"

import ai.imagegen as imagegen  # noqa: E402

checks: list[tuple[str, bool]] = []
JPEG = b"\xff\xd8\xff" + b"x" * 20_000


def check(label: str, cond: bool, detail: str = "") -> None:
    checks.append((label, bool(cond)))
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{detail}]" if detail else ""))


# ── The generation prompt itself ───────────────────────────────────────────
prompt = imagegen.build_prompt("红烧排骨", "Chinese", "色泽红亮，酱香浓郁", "braised pork ribs")
check("the prompt names the dish", "红烧排骨" in prompt)
check("the prompt carries the recipe's description", "色泽红亮" in prompt)
check("the prompt asks for a photograph, not an illustration", "hotorealistic" in prompt)
check("the prompt bans text and watermarks", "No text" in prompt and "watermark" in prompt)

# ── The decoder must not accept junk as an image ───────────────────────────
check("a short base64 blob is not an image", imagegen._decode(base64.b64encode(b"tiny").decode()) is None)
check("valid base64 that is not an image is rejected",
      imagegen._decode(base64.b64encode(b"<html>" + b"x" * 20000).decode()) is None)
check("a real JPEG is accepted", imagegen._decode(base64.b64encode(JPEG).decode()) == JPEG)
check("a data: URI prefix is tolerated",
      imagegen._decode("data:image/jpeg;base64," + base64.b64encode(JPEG).decode()) == JPEG)
check("the image is found wherever the API nests it",
      imagegen._find_image_bytes(
          {"output": [{"content": {"parts": [{"inline_data": {"data": base64.b64encode(JPEG).decode()}}]}}]}
      ) == JPEG)
check("a reply with no image at all returns None",
      imagegen._find_image_bytes({"output": [{"type": "text", "text": "I cannot"}]}) is None)

# ── Generated images are sized for a phone header, not for print ───────────
# The first real generation came back at 882KB, which is a second of mobile data
# for a strip that renders 200px tall. Stock photos arrive around 80KB.
try:
    from PIL import Image  # noqa: F401
    _HAVE_PIL = True
except Exception:
    _HAVE_PIL = False

if _HAVE_PIL:
    from PIL import Image as _I
    buf = io.BytesIO()
    _I.new("RGB", (3000, 2000), (180, 60, 30)).save(buf, format="PNG")
    big = buf.getvalue()
    small = imagegen.shrink(big)
    check("an oversized generation is shrunk", len(small) < len(big), f"{len(big)} -> {len(small)}")
    with _I.open(io.BytesIO(small)) as im:
        check("it is capped on the long edge", max(im.size) <= imagegen._MAX_EDGE, str(im.size))
        check("aspect ratio is preserved", abs(im.size[0] / im.size[1] - 1.5) < 0.02, str(im.size))
        check("it is re-encoded as JPEG", im.format == "JPEG", str(im.format))
    import random
    rnd = random.Random(0)
    noisy = _I.new("RGB", (400, 300))
    noisy.putdata([(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256))
                   for _ in range(400 * 300)])
    tbuf = io.BytesIO(); noisy.save(tbuf, format="JPEG", quality=30)
    check("an already-small image is left alone rather than re-encoded bigger",
          imagegen.shrink(tbuf.getvalue()) == tbuf.getvalue(),
          f"{len(tbuf.getvalue())} -> {len(imagegen.shrink(tbuf.getvalue()))}")
    check("shrink never returns more bytes than it was given",
          len(imagegen.shrink(big)) <= len(big) and
          len(imagegen.shrink(tbuf.getvalue())) <= len(tbuf.getvalue()))
else:
    print("SKIP  Pillow not importable here; shrink() falls back to passthrough")

check("junk in means the same junk out, never an exception",
      imagegen.shrink(b"not an image at all") == b"not an image at all")

failed = [l for l, ok in checks if not ok]
print(f"\n{len(checks) - len(failed)}/{len(checks)} passed")
sys.exit(1 if failed else 0)
