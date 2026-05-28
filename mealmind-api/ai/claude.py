"""
AI API calls via Google Gemini. Uses the async client so FastAPI
endpoints stay non-blocking. SQLite-backed TTL cache reduces API calls
and survives server restarts.
"""
import json
import os
import hashlib
import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable, DeadlineExceeded, InternalServerError
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

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
MODEL = "gemini-2.0-flash"
_CACHE_TTL = int(os.getenv("CACHE_TTL_SECONDS", "600"))


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


async def _generate(prompt: str, max_tokens: int = 4000) -> str:
    model = genai.GenerativeModel(
        MODEL,
        generation_config=genai.types.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=0.7,
        ),
    )
    response = await model.generate_content_async(prompt)
    return response.text


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
    text = await _generate(recipe_parse_prompt(html), max_tokens=2500)
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

async def generate_recipe_by_name(dish_name: str, language: str = "en", servings: int = 2, force_refresh: bool = False) -> dict:
    cache_data = {"dish": dish_name.lower().strip(), "lang": language, "servings": servings}
    key = _cache_key(cache_data)
    if not force_refresh:
        cached = cache_get(key)
        if cached is not None:
            return cached

    text = await _generate(generate_recipe_prompt(dish_name, language, servings), max_tokens=2500)
    result = json.loads(_clean_json(text))
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
    text = await _generate(meal_generate_prompt(filters, language), max_tokens=4000)
    result = json.loads(_clean_json(text))
    if isinstance(result, dict) and result.get("error") == "no_match":
        raise ValueError(result.get("message", "No dish can satisfy the required tags."))
    cache_set(key, result, _CACHE_TTL)
    return result, False


async def swap_meal(slot: str, current_plan: dict, filters: dict) -> dict:
    language = filters.get("language", "en")
    avoid = [m["name"] for m in current_plan.get("meals", [])]
    merged_ratings = {name: "down" for name in avoid}
    merged_ratings.update(filters.get("recent_ratings") or {})
    swap_filters = {**filters, "slots": [slot], "recent_ratings": merged_ratings}
    text = await _generate(meal_generate_prompt(swap_filters, language), max_tokens=1500)
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
    raw = await _generate(translate_prompt(texts), max_tokens=1000)
    raw = raw.strip()
    translations = []
    for line in raw.splitlines():
        line = line.strip()
        if line and line[0].isdigit() and ". " in line:
            translations.append(line.split(". ", 1)[1].strip())
    while len(translations) < len(texts):
        translations.append(texts[len(translations)])
    return translations[:len(texts)]


# Re-export the exception types routers need to catch
GeminiTransientError = (ResourceExhausted, ServiceUnavailable, DeadlineExceeded, InternalServerError)
