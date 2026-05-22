"""
AI API calls via Groq (free tier). Uses the async client so FastAPI
endpoints stay non-blocking. SQLite-backed TTL cache reduces API calls
and survives server restarts.
"""
import json
import os
import hashlib
from groq import AsyncGroq
from dotenv import load_dotenv

from ai.sqlite_cache import cache_get, cache_set
from ai.prompts import (
    meal_suggestion_prompt,
    meal_generate_prompt,
    recipe_parse_prompt,
    shopping_list_prompt,
    generate_recipe_prompt,
    translate_prompt,
)

load_dotenv()

_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = "llama-3.3-70b-versatile"
_CACHE_TTL = int(os.getenv("CACHE_TTL_SECONDS", "600"))


def _extract_text(response) -> str:
    return response.choices[0].message.content


def _clean_json(text: str) -> str:
    """Strip markdown fences if the model wraps output in them."""
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


# ---------------------------------------------------------------------------
# Meal suggestions
# ---------------------------------------------------------------------------

async def suggest_meals(filters: dict) -> tuple[list, bool]:
    key = _cache_key(filters)
    cached = cache_get(key)
    if cached is not None:
        return cached, True

    language = filters.get("language", "en")
    response = await _client.chat.completions.create(
        model=MODEL,
        max_tokens=2000,
        messages=[{"role": "user", "content": meal_suggestion_prompt(filters, language)}],
    )
    meals = json.loads(_clean_json(_extract_text(response)))
    cache_set(key, meals, _CACHE_TTL)
    return meals, False


# ---------------------------------------------------------------------------
# Recipe parsing
# ---------------------------------------------------------------------------

async def parse_recipe(html: str, language: str = "en") -> dict:
    response = await _client.chat.completions.create(
        model=MODEL,
        max_tokens=2500,
        messages=[{"role": "user", "content": recipe_parse_prompt(html)}],
    )
    result = json.loads(_clean_json(_extract_text(response)))
    if "error" in result:
        raise ValueError(result["error"])
    return result


# ---------------------------------------------------------------------------
# Shopping list
# ---------------------------------------------------------------------------

async def generate_shopping_list(recipes: list, pantry: list, language: str = "en") -> dict:
    response = await _client.chat.completions.create(
        model=MODEL,
        max_tokens=2500,
        messages=[{"role": "user", "content": shopping_list_prompt(recipes, pantry, language)}],
    )
    return json.loads(_clean_json(_extract_text(response)))


# ---------------------------------------------------------------------------
# Recipe generation by dish name
# ---------------------------------------------------------------------------

async def generate_recipe_by_name(dish_name: str, language: str = "en", servings: int = 2, force_refresh: bool = False) -> dict:
    cache_data = {"dish": dish_name.lower().strip(), "lang": language, "servings": servings}
    key = _cache_key(cache_data)
    if not force_refresh:
        cached = cache_get(key)
        if cached is not None:
            return cached

    response = await _client.chat.completions.create(
        model=MODEL,
        max_tokens=2500,
        messages=[{"role": "user", "content": generate_recipe_prompt(dish_name, language, servings)}],
    )
    result = json.loads(_clean_json(_extract_text(response)))
    if "error" in result:
        raise ValueError(result["error"])
    cache_set(key, result, 604800)  # cache for 7 days
    return result


# ---------------------------------------------------------------------------
# Meal generation (slot-aware, rich format)
# ---------------------------------------------------------------------------

async def generate_meal_plan(filters: dict) -> tuple[dict, bool]:
    key = _cache_key({k: v for k, v in filters.items() if k != "recent_ratings"})
    cached = cache_get(key)
    if cached is not None:
        return cached, True

    language = filters.get("language", "en")
    response = await _client.chat.completions.create(
        model=MODEL,
        max_tokens=4000,
        messages=[{"role": "user", "content": meal_generate_prompt(filters, language)}],
    )
    result = json.loads(_clean_json(_extract_text(response)))
    if isinstance(result, dict) and result.get("error") == "no_match":
        raise ValueError(result.get("message", "No dish can satisfy the required tags."))
    cache_set(key, result, _CACHE_TTL)
    return result, False


async def swap_meal(slot: str, current_plan: dict, filters: dict) -> dict:
    language = filters.get("language", "en")
    avoid = [m["name"] for m in current_plan.get("meals", [])]
    # Merge existing ratings with all current-plan meals marked "down" so the prompt avoids them
    merged_ratings = {name: "down" for name in avoid}
    merged_ratings.update(filters.get("recent_ratings") or {})
    swap_filters = {**filters, "slots": [slot], "recent_ratings": merged_ratings}
    response = await _client.chat.completions.create(
        model=MODEL,
        max_tokens=1500,
        messages=[{"role": "user", "content": meal_generate_prompt(swap_filters, language)}],
    )
    result = json.loads(_clean_json(_extract_text(response)))
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
    response = await _client.chat.completions.create(
        model=MODEL,
        max_tokens=1000,
        messages=[{"role": "user", "content": translate_prompt(texts)}],
    )
    raw = _extract_text(response).strip()
    # Parse numbered list: "1. 食材\n2. 配料\n..."
    translations = []
    for line in raw.splitlines():
        line = line.strip()
        if line and line[0].isdigit() and ". " in line:
            translations.append(line.split(". ", 1)[1].strip())
    # Fall back to originals for any missing entries
    while len(translations) < len(texts):
        translations.append(texts[len(translations)])
    return translations[:len(texts)]
