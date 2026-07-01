"""
AI API calls via Groq (fast Llama inference).
Uses async so FastAPI endpoints stay non-blocking.
SQLite-backed TTL cache reduces API calls and survives server restarts.
"""
import asyncio
import json
import os
import re
import hashlib
import logging
from groq import AsyncGroq, APIStatusError, APIConnectionError, RateLimitError
from dotenv import load_dotenv

from ai.sqlite_cache import cache_get, cache_set
from ai.prompts import (
    meal_generate_prompt,
    recipe_parse_prompt,
    shopping_list_prompt,
    generate_recipe_prompt,
    receipt_transcribe_prompt,
    receipt_normalize_prompt,
)

load_dotenv()

logger = logging.getLogger(__name__)

_api_key = os.getenv("GROQ_API_KEY")
if not _api_key:
    raise RuntimeError("GROQ_API_KEY is not set — check your environment variables")

_client = AsyncGroq(api_key=_api_key)

_MODEL = "llama-3.3-70b-versatile"

# Only vision-capable model on Groq (preview status) — overridable so a
# deprecation can be handled with an env change instead of a deploy.
_VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")

_CACHE_TTL = int(os.getenv("CACHE_TTL_SECONDS", "3600"))


# Matches a bare arithmetic expression sitting in a JSON *value* position, e.g.
# `: 523 / 14,` — two numbers joined by * or /. Anchored to a colon/comma/bracket
# on the left and a comma/brace/newline on the right, with no quotes, so it can
# never touch a string value like a URL ("https://…") or a unit ("1/2").
_NUM_EXPR_RE = re.compile(
    r'([:\[,]\s*)(\d+(?:\.\d+)?)\s*([*/])\s*(\d+(?:\.\d+)?)(\s*[,}\]\n])'
)


def _resolve_num_expr(m: "re.Match") -> str:
    a, op, b = float(m.group(2)), m.group(3), float(m.group(4))
    val = a / b if op == "/" else a * b
    # Round to a clean integer — these expressions are almost always the
    # per-serving calorie estimate (an int field), and an int is valid for
    # any numeric field, whereas a fractional float would fail an int field.
    return f"{m.group(1)}{round(val)}{m.group(5)}"


def _clean_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[: text.rfind("```")]
    text = text.strip()
    # Safety net: models occasionally emit a formula (e.g. "523 / 14") instead of
    # the computed value, which is invalid JSON. Resolve such expressions so the
    # parse never 422s on an otherwise-good recipe.
    text = _NUM_EXPR_RE.sub(_resolve_num_expr, text)
    return text


def _parse_ai_json(text: str) -> dict:
    """Parse an AI JSON response (fence-cleaned). A truncated/garbled reply raises
    a JSONDecodeError, which is a ValueError subclass and would otherwise surface to
    the client as a raw '422: Expecting value: line 1 column 900'. Convert it to a
    clean, user-safe message the caller can show and the user can retry on."""
    try:
        return json.loads(_clean_json(text))
    except json.JSONDecodeError:
        raise ValueError("The AI response was incomplete. Please try again.")


def _cache_key(data: object) -> str:
    return hashlib.md5(
        json.dumps(data, sort_keys=True, default=str).encode()
    ).hexdigest()


def _extract_text(response) -> str:
    return response.choices[0].message.content


def _retry_after_seconds(exc: RateLimitError, fallback: float) -> float:
    """Best-effort parse of Groq's Retry-After header (seconds); fallback otherwise."""
    try:
        hdr = exc.response.headers.get("retry-after")
        if hdr:
            return float(hdr)
    except Exception:
        pass
    return fallback


async def _create_with_retry(**kwargs):
    """
    Wrap the Groq completion call with a bounded retry on transient rate limits.
    Groq counts the *reserved* max_tokens against the per-minute token budget, so
    bursts of requests momentarily 429; a short backoff usually clears it well
    within the client's 45s timeout. Non-rate-limit errors propagate immediately.
    """
    last: RateLimitError | None = None
    for attempt in range(3):
        try:
            return await _client.chat.completions.create(**kwargs)
        except RateLimitError as exc:
            last = exc
            wait = _retry_after_seconds(exc, fallback=1.5 * (attempt + 1))
            # Don't sit on the request past the client timeout — give up and let
            # the router surface a 503 the user can retry.
            if attempt == 2 or wait > 8:
                raise
            logger.warning("[ai] Groq rate-limited; retrying in %.1fs (attempt %d)", wait, attempt + 1)
            await asyncio.sleep(wait)
    raise last  # pragma: no cover — loop always returns or raises


async def _generate(prompt: str, max_tokens: int = 4000, temperature: float = 0.7) -> str:
    response = await _create_with_retry(
        model=_MODEL,
        max_tokens=max_tokens,
        temperature=temperature,
        messages=[{"role": "user", "content": prompt}],
    )
    return _extract_text(response)


async def _generate_text(prompt: str, max_tokens: int = 1000) -> str:
    response = await _create_with_retry(
        model=_MODEL,
        max_tokens=max_tokens,
        temperature=0.3,
        messages=[{"role": "user", "content": prompt}],
    )
    return _extract_text(response)


async def _generate_vision(prompt: str, image_b64: str, max_tokens: int = 4000) -> str:
    response = await _create_with_retry(
        model=_VISION_MODEL,
        max_tokens=max_tokens,
        temperature=0.2,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
            ],
        }],
    )
    return _extract_text(response)


# A single rich meal's JSON (intro, verbose steps, macros, tags) runs ~1.5–2k
# output tokens. Budget per slot + overhead, capped — far below the old flat
# 6000 so Groq's TPM reservation isn't blown on every call.
def _meal_max_tokens(n_slots: int) -> int:
    return min(6000, 1200 + 2400 * max(1, n_slots))


# ---------------------------------------------------------------------------
# Recipe parsing
# ---------------------------------------------------------------------------

async def parse_recipe(html: str) -> dict:
    # No `language` arg: the recipe is parsed in its source language and the
    # frontend's dynamic-translation layer localizes it for display. Passing a
    # language here would only add AI cost for no benefit.
    text = await _generate(recipe_parse_prompt(html), max_tokens=4000)
    result = _parse_ai_json(text)
    if "error" in result:
        raise ValueError(result["error"])
    return result


# ---------------------------------------------------------------------------
# Shopping list
# ---------------------------------------------------------------------------

async def generate_shopping_list(recipes: list, pantry: list, language: str = "en") -> dict:
    text = await _generate(shopping_list_prompt(recipes, pantry, language), max_tokens=2500)
    return _parse_ai_json(text)


# ---------------------------------------------------------------------------
# Recipe generation by dish name
# ---------------------------------------------------------------------------

async def generate_recipe_by_name(dish_name: str, language: str = "en", servings: int = 1, force_refresh: bool = False) -> dict:
    cache_data = {"dish": dish_name.lower().strip(), "lang": language, "servings": servings}
    key = _cache_key(cache_data)
    if not force_refresh:
        cached = cache_get(key)
        if cached is not None:
            return cached

    text = await _generate(generate_recipe_prompt(dish_name, language, servings), max_tokens=4500)
    result = _parse_ai_json(text)
    if "error" in result:
        raise ValueError(result["error"])
    cache_set(key, result, 604800)  # 7 days
    return result


# ---------------------------------------------------------------------------
# Meal generation (slot-aware, rich format)
# ---------------------------------------------------------------------------

async def generate_meal_plan(filters: dict) -> tuple[dict, bool]:
    # Note: avoid_meals IS part of the cache key (unlike recent_ratings) so a
    # growing exclusion list always forces a fresh, non-repeating result.
    key = _cache_key({k: v for k, v in filters.items() if k != "recent_ratings"})
    cached = cache_get(key)
    if cached is not None:
        return cached, True

    language = filters.get("language", "en")
    n_slots = len(filters.get("slots") or ["breakfast", "lunch", "dinner"])
    # Lower temperature than the 0.7 default — meal generation should return
    # conventional, real dishes, not "creative" invented ones.
    text = await _generate(meal_generate_prompt(filters, language), max_tokens=_meal_max_tokens(n_slots), temperature=0.5)
    result = _parse_ai_json(text)
    if isinstance(result, dict) and result.get("error") == "no_match":
        raise ValueError(result.get("message", "No dish can satisfy the required tags."))
    cache_set(key, result, _CACHE_TTL)
    return result, False


async def swap_meal(slot: str, current_plan: dict | None, filters: dict) -> dict:
    language = filters.get("language", "en")
    # Avoid every meal shown today (avoid_meals) plus anything still on the plan.
    avoid = list(filters.get("avoid_meals") or [])
    for m in (current_plan or {}).get("meals", []):
        if m.get("name") and m["name"] not in avoid:
            avoid.append(m["name"])
    merged_ratings = {name: "down" for name in avoid}
    merged_ratings.update(filters.get("recent_ratings") or {})
    swap_filters = {**filters, "slots": [slot], "recent_ratings": merged_ratings}
    text = await _generate(meal_generate_prompt(swap_filters, language), max_tokens=_meal_max_tokens(1), temperature=0.5)
    result = _parse_ai_json(text)
    if isinstance(result, dict) and result.get("error") == "no_match":
        raise ValueError(result.get("message", "No dish can satisfy the required tags."))
    meals = result.get("meals", [result])
    return meals[0] if meals else result


# ---------------------------------------------------------------------------
# Receipt scanning (two-stage: vision transcription → text normalization)
# ---------------------------------------------------------------------------

async def transcribe_receipt(image_b64: str) -> list[str]:
    text = await _generate_vision(receipt_transcribe_prompt(), image_b64, max_tokens=4000)
    try:
        result = json.loads(_clean_json(text))
    except json.JSONDecodeError:
        raise ValueError("unreadable_receipt")
    if isinstance(result, dict) and "error" in result:
        raise ValueError(result["error"])
    lines = result.get("lines") if isinstance(result, dict) else None
    if not lines:
        raise ValueError("no_receipt")
    return [str(line) for line in lines]


async def normalize_receipt_items(lines: list[str], pantry_names: list[str], language: str = "en") -> list[dict]:
    text = await _generate_text(receipt_normalize_prompt(lines, pantry_names, language), max_tokens=4000)
    try:
        result = json.loads(_clean_json(text))
    except json.JSONDecodeError:
        raise ValueError("unreadable_receipt")
    if isinstance(result, dict) and "error" in result:
        raise ValueError(result["error"])
    items = result.get("items", []) if isinstance(result, dict) else []
    items = [item for item in items if isinstance(item, dict)]
    pantry_set = set(pantry_names)
    for item in items:
        # The model sometimes invents matches; only exact pantry strings count.
        if item.get("matches_pantry") not in pantry_set:
            item["matches_pantry"] = None
        # If the model disobeyed and put Chinese in name, keep display usable.
        name = str(item.get("name", ""))
        if not item.get("name_zh") and any("一" <= ch <= "鿿" for ch in name):
            item["name_zh"] = name
    return items


async def scan_receipt(image_b64: str, pantry_names: list[str], language: str = "en") -> dict:
    # No result caching — every receipt is unique.
    lines = await transcribe_receipt(image_b64)
    items = await normalize_receipt_items(lines, pantry_names, language)
    return {"items": items}


# Exception types routers should catch for transient AI failures.
GroqTransientError = (RateLimitError, APIConnectionError, APIStatusError)
