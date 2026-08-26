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
from groq import AsyncGroq, APIStatusError, APIConnectionError, RateLimitError, BadRequestError
from dotenv import load_dotenv

from ai.sqlite_cache import cache_get, cache_set
from ai.prompts import (
    meal_generate_prompt,
    recipe_parse_prompt,
    shopping_list_prompt,
    generate_recipe_prompt,
    receipt_transcribe_prompt,
    receipt_normalize_prompt,
    dish_photo_check_prompt,
)

load_dotenv()

logger = logging.getLogger(__name__)

_api_key = os.getenv("GROQ_API_KEY")
if not _api_key:
    raise RuntimeError("GROQ_API_KEY is not set — check your environment variables")

_client = AsyncGroq(api_key=_api_key)

# Env-overridable like the vision model, so a Groq model deprecation can be
# handled with a config change instead of a deploy (every AI feature uses this).
# Was llama-3.3-70b-versatile until Groq decommissioned it (2026-08); a removed
# model 404s as APIStatusError, which surfaces to users as a blanket 503.
_MODEL = os.getenv("GROQ_TEXT_MODEL", "openai/gpt-oss-120b")

# Only vision-capable model on Groq — overridable so a deprecation can be
# handled with an env change instead of a deploy. Was llama-4-scout, removed in
# the same 2026-08 cull. Emits a <think> block, which _clean_json strips.
_VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "qwen/qwen3.6-27b")

_CACHE_TTL = int(os.getenv("CACHE_TTL_SECONDS", "3600"))

# gpt-oss reasons before answering, and those reasoning tokens are billed and
# counted as completion tokens. At Groq's default effort an elaborate recipe
# spent ~2500 of its 4500-token budget thinking and truncated mid-JSON (which
# surfaces as a 422). "low" cuts that to ~170 tokens with no quality loss on
# these prompts: roughly half the output tokens, half the cost, half the wait.
# Blank disables it. Models that reject the parameter are handled below.
_REASONING_EFFORT = os.getenv("GROQ_REASONING_EFFORT", "low").strip()

# Models that 400 on `reasoning_effort` (qwen, compound, allam all do). Learned
# at runtime and remembered per model, so pointing GROQ_TEXT_MODEL at one of
# them still works — the escape hatch for a decommissioned model must not be
# blocked by this optimisation.
# Seeded with what we already know rejects it, so the first call after every
# deploy doesn't burn a 400 (three of them, concurrently, on the first image
# check) learning it again. Runtime learning below still covers new models.
_no_reasoning_effort: set[str] = {"qwen/qwen3.6-27b"}


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
    # Reasoning models (qwen, and gpt-oss when it inlines its scratchpad) prefix
    # the answer with a <think>…</think> block, which is not JSON. Everything
    # after the LAST close tag is the actual answer; splitting on the close tag
    # rather than matching a pair also survives a swallowed opening tag.
    if "</think>" in text:
        text = text.rsplit("</think>", 1)[-1].strip()
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
    model = kwargs.get("model", "")
    if _REASONING_EFFORT and model not in _no_reasoning_effort:
        kwargs["reasoning_effort"] = _REASONING_EFFORT

    last: RateLimitError | None = None
    for attempt in range(3):
        try:
            return await _client.chat.completions.create(**kwargs)
        except BadRequestError as exc:
            # This model doesn't take reasoning_effort. Drop it, remember, retry
            # once. Without this the parameter would turn a model swap into a
            # hard 400 (BadRequestError subclasses APIStatusError, so it would
            # reach the router as GroqTransientError and 503 every call).
            if "reasoning_effort" not in kwargs or "reasoning_effort" not in str(exc):
                raise
            kwargs.pop("reasoning_effort")
            _no_reasoning_effort.add(model)
            logger.warning("[ai] %s rejects reasoning_effort; continuing without it", model)
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

    # Stays at 4500 (see the token-budget rule): the elaborate dishes that used
    # to run this to 98% were spending it on reasoning, which _REASONING_EFFORT
    # now caps. Cassoulet at 6 servings lands ~2200. If this ever truncates
    # again, check reasoning_effort is still being applied before raising it.
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
# ---------------------------------------------------------------------------
# Dish photo verification
# ---------------------------------------------------------------------------

# The lowest fit worth showing. 6 is "a close regional variant" on the scale in
# dish_photo_check_prompt; 4 is "right family, clearly not this dish".
_MIN_FIT = 6.0

# Returned as `shows` when the check could not be completed, so callers can tell
# "the model said this is fine" apart from "the model never answered".
_UNVERIFIED = "unverified"
UNVERIFIED = _UNVERIFIED  # public alias for routers that must detect it

# The vision model reasons before it answers, and Groq bills that reasoning as
# completion tokens. This was 400, which is roughly the size of the <think>
# block alone: every reply truncated before reaching its JSON, so every parse
# failed and every photo was kept unverified.
#
# 4000 was still not enough. Live replies run 1.8k to 13.7k characters, because
# the model second-guesses itself hardest on exactly the ambiguous photos the
# check exists for ("Wait, let me re-evaluate the meat..."), and one of those
# truncated again. The reply itself is ~40 tokens; everything else here is
# headroom for thinking, and an unused cap costs nothing since billing is on
# tokens generated.
_VISION_CHECK_MAX_TOKENS = 8000


async def verify_dish_photo(
    dish_name: str, cuisine: str, image_query: str, image_b64: str,
    description: str = "",
) -> tuple[bool, float, str]:
    """Look at a candidate header photo and rate how well it shows the dish.

    Returns (usable, fit_0_to_10, what_it_shows). A photo is usable only if the
    model agrees the main ingredient AND the cuisine/cooking style both match and
    scores it at or above _MIN_FIT. The fit doubles as the ranking key, so
    candidates compete on how well they show the dish rather than each being
    waved through on its own.

    On failure it returns (True, 0.0, _UNVERIFIED): the caller has already
    established a decent text match, and a flaky vision call must not strip every
    recipe of its image. This is a veto on mismatches, never the thing that
    grants approval.

    That fallback is deliberately LOUD. It was silent once, and the whole gate
    ran as a no-op for two full releases while looking like it was working: the
    vision model is a reasoning model whose <think> block ate the entire token
    budget, every reply truncated before its JSON, every parse failed, and every
    photo sailed through "approved". A check that cannot fail visibly is not a
    check. Anything unexpected here is logged at WARNING with the raw reply.
    """
    text = ""
    try:
        text = await _generate_vision(
            dish_photo_check_prompt(dish_name, cuisine, image_query, description),
            image_b64,
            max_tokens=_VISION_CHECK_MAX_TOKENS,
        )
        if not text:
            raise ValueError("empty reply (no message content)")
        if "<think>" in text and "</think>" not in text:
            raise ValueError(
                f"reply truncated inside the reasoning block; "
                f"raise _VISION_CHECK_MAX_TOKENS (now {_VISION_CHECK_MAX_TOKENS})"
            )
        result = json.loads(_clean_json(text))
    except Exception as exc:
        logger.warning(
            "[ai] dish photo check FAILED for %r (%s); the photo is being kept on "
            "its text match alone. Raw reply: %r",
            dish_name, exc, (text or "")[:300],
        )
        return True, 0.0, _UNVERIFIED

    if not isinstance(result, dict):
        logger.warning(
            "[ai] dish photo check for %r returned %s, not an object: %r",
            dish_name, type(result).__name__, text[:300],
        )
        return True, 0.0, _UNVERIFIED
    try:
        fit = float(result.get("fit", 0))
    except (TypeError, ValueError):
        fit = 0.0
    fit = max(0.0, min(10.0, fit))
    usable = (
        bool(result.get("same_main_ingredient", False))
        and bool(result.get("same_style", False))
        and fit >= _MIN_FIT
    )
    return usable, fit, str(result.get("shows", ""))[:80]


GroqTransientError = (RateLimitError, APIConnectionError, APIStatusError)
