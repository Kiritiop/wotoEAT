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
    daily_plan_prompt,
    recipe_parse_prompt,
    shopping_list_prompt,
    eat_out_ranking_prompt,
    plan_shopping_prompt,
    swap_meal_prompt,
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
# Meal suggestions (legacy 6-meal mode)
# ---------------------------------------------------------------------------

async def suggest_meals(filters: dict) -> tuple[list, bool]:
    key = _cache_key(filters)
    cached = cache_get(key)
    if cached is not None:
        return cached, True

    response = await _client.chat.completions.create(
        model=MODEL,
        max_tokens=2000,
        messages=[{"role": "user", "content": meal_suggestion_prompt(filters)}],
    )
    meals = json.loads(_clean_json(_extract_text(response)))
    cache_set(key, meals, _CACHE_TTL)
    return meals, False


# ---------------------------------------------------------------------------
# Daily meal plan
# ---------------------------------------------------------------------------

async def generate_daily_plan(
    profile: dict,
    pantry: list,
    cuisine_preference: str | None,
    max_prep_time_mins: int | None,
    language: str = "en",
    recent_ratings: dict | None = None,
    servings: int = 2,
    slots: list[str] | None = None,
    flavour_preference: str | None = None,
    ingredient_keyword: str | None = None,
    meal_style: str | None = None,
) -> tuple[dict, bool]:
    cache_data = {
        "profile": profile,
        "pantry": pantry,
        "cuisine": cuisine_preference,
        "max_time": max_prep_time_mins,
        "lang": language,
        "ratings": recent_ratings,
        "servings": servings,
        "slots": slots,
        "flavour": flavour_preference,
        "ingredient": ingredient_keyword,
        "meal_style": meal_style,
    }
    key = _cache_key(cache_data)
    cached = cache_get(key)
    if cached is not None:
        return cached, True

    response = await _client.chat.completions.create(
        model=MODEL,
        max_tokens=5000,
        messages=[{
            "role": "user",
            "content": daily_plan_prompt(
                profile, pantry, cuisine_preference,
                max_prep_time_mins, language, recent_ratings,
                servings=servings, slots=slots,
                flavour_preference=flavour_preference,
                ingredient_keyword=ingredient_keyword,
                meal_style=meal_style,
            ),
        }],
    )
    try:
        plan = json.loads(_clean_json(_extract_text(response)))
    except json.JSONDecodeError:
        if not ingredient_keyword:
            raise
        # The keyword constraint confused the model — retry without it so the
        # user at least gets a valid plan, then raise a descriptive error so
        # the client can tell them the filter was ignored.
        raise ValueError(
            f"Could not generate a plan with the filter \"{ingredient_keyword}\". "
            "Try a different ingredient or tag."
        )
    cache_set(key, plan, _CACHE_TTL)
    return plan, False


# ---------------------------------------------------------------------------
# Recipe parsing
# ---------------------------------------------------------------------------

async def parse_recipe(html: str) -> dict:
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


async def generate_plan_shopping_list(plan: dict, pantry: list, language: str = "en") -> dict:
    """Generate a shopping list directly from a daily meal plan."""
    response = await _client.chat.completions.create(
        model=MODEL,
        max_tokens=2000,
        messages=[{"role": "user", "content": plan_shopping_prompt(plan, pantry, language)}],
    )
    return json.loads(_clean_json(_extract_text(response)))


# ---------------------------------------------------------------------------
# Single meal swap
# ---------------------------------------------------------------------------

async def swap_single_meal(
    slot: str,
    current_plan: dict,
    profile: dict,
    pantry: list,
    language: str = "en",
) -> dict:
    """Generate a replacement meal for one slot, keeping the rest of the plan in context."""
    response = await _client.chat.completions.create(
        model=MODEL,
        max_tokens=2000,
        messages=[{
            "role": "user",
            "content": swap_meal_prompt(slot, current_plan, profile, pantry, language),
        }],
    )
    return json.loads(_clean_json(_extract_text(response)))


# ---------------------------------------------------------------------------
# Recipe generation by dish name
# ---------------------------------------------------------------------------

async def generate_recipe_by_name(dish_name: str, language: str = "en", servings: int = 2) -> dict:
    cache_data = {"dish": dish_name.lower().strip(), "lang": language, "servings": servings}
    key = _cache_key(cache_data)
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


# ---------------------------------------------------------------------------
# Eat Out — restaurant ranking
# ---------------------------------------------------------------------------

async def rank_restaurants(restaurants: list, filters: dict) -> list:
    response = await _client.chat.completions.create(
        model=MODEL,
        max_tokens=1500,
        messages=[{"role": "user", "content": eat_out_ranking_prompt(restaurants, filters)}],
    )
    return json.loads(_clean_json(_extract_text(response)))
