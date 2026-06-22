"""
AI API calls via Groq (fast Llama inference).
Uses async so FastAPI endpoints stay non-blocking.
SQLite-backed TTL cache reduces API calls and survives server restarts.
"""
import json
import os
import hashlib
import logging
from groq import AsyncGroq, APIStatusError, APIConnectionError, RateLimitError
from dotenv import load_dotenv

from ai.sqlite_cache import cache_get, cache_set
from ai.prompts import (
    meal_suggestion_prompt,
    meal_generate_prompt,
    recipe_parse_prompt,
    shopping_list_prompt,
    generate_recipe_prompt,
    translate_prompt,
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


def _clean_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[: text.rfind("```")]
    return text.strip()


def _cache_key(data: object) -> str:
    return hashlib.md5(
        json.dumps(data, sort_keys=True, default=str).encode()
    ).hexdigest()


def _extract_text(response) -> str:
    return response.choices[0].message.content


async def _generate(prompt: str, max_tokens: int = 6000) -> str:
    response = await _client.chat.completions.create(
        model=_MODEL,
        max_tokens=max_tokens,
        temperature=0.7,
        messages=[{"role": "user", "content": prompt}],
    )
    return _extract_text(response)


async def _generate_text(prompt: str, max_tokens: int = 1000) -> str:
    response = await _client.chat.completions.create(
        model=_MODEL,
        max_tokens=max_tokens,
        temperature=0.3,
        messages=[{"role": "user", "content": prompt}],
    )
    return _extract_text(response)


async def _generate_vision(prompt: str, image_b64: str, max_tokens: int = 4000) -> str:
    response = await _client.chat.completions.create(
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


# ---------------------------------------------------------------------------
# Meal suggestions
# ---------------------------------------------------------------------------

async def suggest_meals(filters: dict) -> tuple[list, bool]:
    key = _cache_key(filters)
    cached = cache_get(key)
    if cached is not None:
        return cached, True

    language = filters.get("language", "en")
    text = await _generate(meal_suggestion_prompt(filters, language), max_tokens=2000)
    meals = json.loads(_clean_json(text))
    cache_set(key, meals, _CACHE_TTL)
    return meals, False


# ---------------------------------------------------------------------------
# Recipe parsing
# ---------------------------------------------------------------------------

async def parse_recipe(html: str, language: str = "en") -> dict:
    text = await _generate(recipe_parse_prompt(html), max_tokens=4000)
    result = json.loads(_clean_json(text))
    if "error" in result:
        raise ValueError(result["error"])
    return result


# ---------------------------------------------------------------------------
# Shopping list
# ---------------------------------------------------------------------------

async def generate_shopping_list(recipes: list, pantry: list, language: str = "en") -> dict:
    text = await _generate(shopping_list_prompt(recipes, pantry, language), max_tokens=2500)
    return json.loads(_clean_json(text))


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

    text = await _generate(generate_recipe_prompt(dish_name, language, servings), max_tokens=6000)
    result = json.loads(_clean_json(text))
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
    text = await _generate(meal_generate_prompt(filters, language), max_tokens=6000)
    result = json.loads(_clean_json(text))
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
    text = await _generate(meal_generate_prompt(swap_filters, language), max_tokens=6000)
    result = json.loads(_clean_json(text))
    if isinstance(result, dict) and result.get("error") == "no_match":
        raise ValueError(result.get("message", "No dish can satisfy the required tags."))
    meals = result.get("meals", [result])
    return meals[0] if meals else result


# ---------------------------------------------------------------------------
# Batch text translation
# ---------------------------------------------------------------------------

async def translate_texts(texts: list[str]) -> list[str]:
    if not texts:
        return []
    raw = await _generate_text(translate_prompt(texts), max_tokens=1000)
    raw = raw.strip()
    translations = []
    for line in raw.splitlines():
        line = line.strip()
        if line and line[0].isdigit() and ". " in line:
            translations.append(line.split(". ", 1)[1].strip())
    while len(translations) < len(texts):
        translations.append(texts[len(translations)])
    return translations[:len(texts)]


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
