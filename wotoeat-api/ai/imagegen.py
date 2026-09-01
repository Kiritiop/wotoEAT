"""
Generate a header photo for a dish no stock library can serve.

Last resort in the /images/search cascade. It runs only when every real
candidate has been rejected, which for a Chinese home dish is common: Pexels is
a Western stock library, and its idea of 红烧排骨 is a Sichuan chilli-oil braise
in a pool of red sauce. A generated image is not a photograph of real food and
should never displace one that is, but it beats a blank hero on a recipe.

Uses the Gemini image API, whose key was already in .env and unused.
"""
import asyncio
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

# Measured 2026-09-01 over 15 dishes weighted to Chinese home cooking, which is
# where a stereotyping model shows itself: lite 3.7s against flash 10.0s, at
# half the price, and it got all 15 right against a written per-dish check
# (10 dishes that must not be red, 3 that must be, 2 non-Chinese controls).
# An earlier 3-dish run had lite drawing 红烧排骨 as a chilli braise; the 15-dish
# run drew it correctly, so that was variance, not a trait. Neither model is
# perfect and the sample is one image per dish -- what the suite establishes is
# that lite is not detectably worse here, not that it never misses.
# Revert by setting GEMINI_IMAGE_MODEL=gemini-3.1-flash-image; no deploy needed.
_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-lite-image")
_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions"

# How the picture is asked for. All three were unset: the request was just
# {model, input}. Numbers below are medians over 3 dishes from
# scripts/bench_imagegen.py, run against the live API on 2026-09-01. Re-measure
# rather than trusting them. Every value is an env var, so Railway can change
# it without a deploy.
#
# Size: pinned so it cannot drift, not for speed. Measured, 1K took 9.4s against
# 10.0s for the default, so the default was already about 1K -- worth knowing,
# because the obvious guess was that we were generating 2K and discarding it.
# 2K genuinely is discarded (`shrink` caps at 1280px on the long edge) and costs
# 15.2s, so what this setting buys is never accidentally paying that.
_IMAGE_SIZE = os.getenv("GEMINI_IMAGE_SIZE", "1K")

# Aspect: the hero is 100% wide by 200pt with contentFit "cover", about 2:1. The
# default turned out to be 1.83:1 already, so this is nearly a no-op; 16:9 is
# 1.78 and the closest ratio the API offers. Both come back wider than 1280 and
# get resized. Pinned for determinism.
_ASPECT = os.getenv("GEMINI_IMAGE_ASPECT", "16:9")

# Thinking: cannot be disabled for Gemini 3 image models, only lowered.
# "minimal" measured the same as the default (9.4s vs 10.0s), so this is
# insurance rather than a win. "high" costs 16.9s, near double, for a prompt
# that is a filled-in template describing one plate of food. Pinning it is what
# stops that ever becoming the default under us.
_THINKING = os.getenv("GEMINI_IMAGE_THINKING", "minimal")

# Set once if the API rejects the tuning block above, so a field it does not
# know about costs one failed request in the life of the process rather than
# every image. Generation is the one thing here that must not break quietly.
_tuning_rejected = False

# Generation is the slowest thing in the cascade, and it only ever runs after
# everything else has already failed. The connect timeout is separate and short:
# a dead socket should fail in seconds rather than hold a prewarm slot for a
# minute, while a model that is genuinely drawing gets the full budget.
_TIMEOUT = httpx.Timeout(60.0, connect=10.0)

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


def build_payload(prompt: str, tuned: bool = True) -> dict:
    """The request body. `tuned=False` is the bare form the API accepted before
    any of the size/aspect/thinking settings existed, kept as the fallback."""
    body: dict = {"model": _MODEL, "input": [{"type": "text", "text": prompt}]}
    if not tuned:
        return body
    fmt: dict = {"type": "image", "mime_type": "image/jpeg"}
    if _ASPECT:
        fmt["aspect_ratio"] = _ASPECT
    if _IMAGE_SIZE:
        fmt["image_size"] = _IMAGE_SIZE
    body["response_format"] = fmt
    if _THINKING:
        body["generation_config"] = {"thinking_level": _THINKING}
    return body


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
            # draft() lets libjpeg decode a JPEG straight to roughly the size
            # we want instead of decoding every pixel and throwing most away.
            # It only scales by halves, so it does nothing unless the model
            # returns at least 2x _MAX_EDGE: measured, 2048px in is unchanged
            # and 2560px or more is about twice as fast. Free either way, and
            # insurance against a model that starts returning print sizes.
            img.draft("RGB", (_MAX_EDGE, _MAX_EDGE))
            img = img.convert("RGB")
            img.thumbnail((_MAX_EDGE, _MAX_EDGE), Image.LANCZOS, reducing_gap=2.0)
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


async def _post(client: httpx.AsyncClient, prompt: str, tuned: bool):
    return await client.post(
        _ENDPOINT,
        headers={"x-goog-api-key": GEMINI_KEY, "Content-Type": "application/json"},
        json=build_payload(prompt, tuned),
    )


async def generate_dish_image(
    dish: str, cuisine: str = "", description: str = "", image_query: str = ""
) -> bytes | None:
    """Image bytes for the dish, or None. Never raises: a failure here means the
    card shows no hero, which is exactly what would have happened anyway."""
    if not is_available() or not dish.strip():
        return None
    global _tuning_rejected
    prompt = build_prompt(dish.strip(), cuisine.strip(), description.strip(), image_query.strip())
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await _post(client, prompt, tuned=not _tuning_rejected)
            # A 400 on the tuned body means the API does not know one of the
            # size/aspect/thinking fields. Fall back to the bare request rather
            # than serve blank heroes, and say so loudly enough to be found in
            # the logs, because from then on the settings are doing nothing.
            if resp.status_code == 400 and not _tuning_rejected:
                logger.error(
                    "[imagegen] %s rejected the tuned request (%s); falling back to "
                    "the bare one for the life of this process. The size, aspect and "
                    "thinking settings are now inert: %s",
                    _MODEL, resp.status_code, resp.text[:300],
                )
                _tuning_rejected = True
                resp = await _post(client, prompt, tuned=False)
        if resp.status_code != 200:
            logger.warning(
                "[imagegen] %s returned %s for %r: %s",
                _MODEL, resp.status_code, dish, resp.text[:300],
            )
            return None
        payload = resp.json()
        raw = _find_image_bytes(payload)
        if raw is None:
            logger.warning(
                "[imagegen] no image in the reply for %r; shape was %r",
                dish, str(payload)[:300],
            )
            return None
        logger.info("[imagegen] generated %d bytes for %r", len(raw), dish)
        # Decoding and re-encoding is CPU work: about 50ms for a 2048px image,
        # more above that. Small next to the upload it sits beside, but it is
        # the same kind of debt -- on the event loop it stalls every other
        # request in the process, and a meal plan resizes several images at
        # once, so each would wait for the last. In a thread they do not.
        return await asyncio.to_thread(shrink, raw)
    except Exception as exc:
        logger.warning("[imagegen] failed for %r: %s", dish, exc)
        return None
