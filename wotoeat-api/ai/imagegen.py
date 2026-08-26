"""
Generate a header photo for a dish no stock library can serve.

Last resort in the /images/search cascade. It runs only when every real
candidate has been rejected, which for a Chinese home dish is common: Pexels is
a Western stock library, and its idea of 红烧排骨 is a Sichuan chilli-oil braise
in a pool of red sauce. A generated image is not a photograph of real food and
should never displace one that is, but it beats a blank hero on a recipe.

Uses the Gemini image API, whose key was already in .env and unused.
"""
import base64
import io
import logging
import os
import re

import httpx

logger = logging.getLogger(__name__)

GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")

# Off unless a key is present. Set IMAGE_GENERATION=0 to keep the key but stop
# generating -- the cascade then returns null and the card shows no hero.
_ENABLED = os.getenv("IMAGE_GENERATION", "1") not in ("0", "false", "False")

_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image")
_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions"

# Generation is the slowest thing in the cascade, and it only ever runs after
# everything else has already failed.
_TIMEOUT = 60

# A JPEG/PNG under this is a placeholder or an error page, not a photo.
_MIN_BYTES = 5_000
_MAX_BYTES = 6_000_000

# What comes back is print-sized: the first real generation was 882KB, which is
# a second of mobile data for a header image that renders 200px tall. Stock
# photos arrive around 80KB, so match that rather than shipping ten times the
# bytes for the same strip of screen.
_MAX_EDGE = 1280
_JPEG_QUALITY = 82


def is_available() -> bool:
    return bool(GEMINI_KEY) and _ENABLED


def build_prompt(dish: str, cuisine: str, description: str, image_query: str) -> str:
    """Describe the finished dish as a food photographer would be briefed.

    The recipe's own description carries the details that separate this dish
    from its regional cousins ("色泽红亮，酱香浓郁" is a dark glossy soy braise,
    not a chilli-oil one), which is exactly what a generic prompt loses.
    """
    lines = [
        f"A realistic, appetising food photograph of {dish}"
        + (f", a {cuisine} dish" if cuisine else "")
        + ".",
    ]
    if image_query:
        lines.append(f"The dish is {image_query}.")
    if description:
        lines.append(f"The recipe describes it as: {description}")
    lines.append(
        "Shot from a slight overhead angle on a plain plate or bowl, natural "
        "soft light, shallow depth of field, the dish filling most of the frame, "
        "styled the way it is actually served at home in its own cuisine. "
        "Photorealistic, as if taken with a real camera. "
        "No text, no watermark, no logo, no hands, no cutlery labels, no collage."
    )
    return " ".join(lines)


def _find_image_bytes(payload) -> bytes | None:
    """Pull the first plausible base64 image out of the response.

    Walks the whole structure rather than indexing a fixed path: the image API's
    response shape has changed before, and a silent None here would be
    indistinguishable from "the model declined", which is the failure mode this
    codebase has already been burned by twice.
    """
    stack = [payload]
    while stack:
        node = stack.pop()
        if isinstance(node, dict):
            for key, value in node.items():
                if key in ("data", "b64_json", "bytesBase64Encoded") and isinstance(value, str):
                    raw = _decode(value)
                    if raw:
                        return raw
                else:
                    stack.append(value)
        elif isinstance(node, list):
            stack.extend(node)
    return None


def _decode(value: str) -> bytes | None:
    value = re.sub(r"^data:image/[a-zA-Z+]+;base64,", "", value.strip())
    if len(value) < 1000:
        return None
    try:
        raw = base64.b64decode(value, validate=True)
    except Exception:
        return None
    if not (_MIN_BYTES <= len(raw) <= _MAX_BYTES):
        return None
    # Magic bytes: a JPEG, PNG or WEBP. Anything else is not an image.
    if raw[:3] == b"\xff\xd8\xff" or raw[:8] == b"\x89PNG\r\n\x1a\n" or raw[8:12] == b"WEBP":
        return raw
    return None


def shrink(raw: bytes) -> bytes:
    """Downscale and re-encode to something sane for a phone header.

    Best-effort: if Pillow is missing the original bytes go through unchanged
    rather than losing the image over a resize.
    """
    try:
        from PIL import Image
    except Exception:
        logger.warning("[imagegen] Pillow missing; storing the image at full size")
        return raw
    try:
        with Image.open(io.BytesIO(raw)) as img:
            img = img.convert("RGB")
            img.thumbnail((_MAX_EDGE, _MAX_EDGE), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=_JPEG_QUALITY, optimize=True)
        out = buf.getvalue()
        if len(out) >= len(raw):
            return raw
        logger.info("[imagegen] %d bytes -> %d after resize", len(raw), len(out))
        return out
    except Exception as exc:
        logger.warning("[imagegen] could not resize (%s); storing as-is", exc)
        return raw


async def generate_dish_image(
    dish: str, cuisine: str = "", description: str = "", image_query: str = ""
) -> bytes | None:
    """Image bytes for the dish, or None. Never raises: a failure here means the
    card shows no hero, which is exactly what would have happened anyway."""
    if not is_available() or not dish.strip():
        return None
    prompt = build_prompt(dish.strip(), cuisine.strip(), description.strip(), image_query.strip())
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                _ENDPOINT,
                headers={"x-goog-api-key": GEMINI_KEY, "Content-Type": "application/json"},
                json={"model": _MODEL, "input": [{"type": "text", "text": prompt}]},
            )
        if resp.status_code != 200:
            logger.warning(
                "[imagegen] %s returned %s for %r: %s",
                _MODEL, resp.status_code, dish, resp.text[:300],
            )
            return None
        raw = _find_image_bytes(resp.json())
        if raw is None:
            logger.warning(
                "[imagegen] no image in the reply for %r; shape was %r",
                dish, str(resp.json())[:300],
            )
            return None
        logger.info("[imagegen] generated %d bytes for %r", len(raw), dish)
        return shrink(raw)
    except Exception as exc:
        logger.warning("[imagegen] failed for %r: %s", dish, exc)
        return None
