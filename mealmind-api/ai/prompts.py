"""
All prompt templates in one place.
"""
import json

_LANG_INSTRUCTION = {
    "en": "Respond in English.",
    "zh": "请用简体中文回答。所有餐名、描述、营养说明均需用中文。",
}


def _tag_note() -> str:
    # Tags are always stored in English regardless of response language.
    # The UI translates them at render time using a local lookup table.
    return (
        'tags must ALWAYS be in English, regardless of the response language. '
        'Generate 4-7 tags covering: dietary labels, key ingredients, '
        'flavour profile, cooking style, occasion. '
        'Examples: "high-protein", "gluten-free", "chicken", "stir-fry", "spicy", "quick", "one-pot", "meal-prep"'
    )


_MATCHING_RULES = """
SEMANTIC INGREDIENT MATCHING (critical — read carefully):
- Match by ingredient TYPE, not exact name. Examples:
  - Pantry has "巴沙鱼" or "basa fish" → satisfies need for "fish", "white fish", "fish fillet", "鱼肉", "鱼柳"
  - Pantry has "虾" or "对虾" → satisfies "shrimp", "prawns", "虾仁"
  - Pantry has "鸡胸肉" → satisfies "chicken", "chicken breast"
  - Pantry has "生抽" → satisfies "soy sauce", "酱油"
  - Pantry has "食用油" → satisfies "oil", "vegetable oil", "cooking oil"
- If the pantry quantity (converted to grams) is enough for the recipe need, remove from shopping list
- If pantry has some but not enough, reduce the shopping amount accordingly
- When in doubt about a match, prefer to REMOVE from shopping list (avoid duplicate buying)
"""


def meal_suggestion_prompt(filters: dict, language: str = "en") -> str:
    lang_note = _LANG_INSTRUCTION.get(language, _LANG_INSTRUCTION["en"])
    tag_note = _tag_note()
    serving_size = filters.get("serving_size", 2)
    serving_word = "person" if serving_size == 1 else "people"
    display_filters = {k: v for k, v in filters.items() if k not in ("serving_size", "language")}

    return f"""You are a world-class culinary expert.
{lang_note}
Suggest exactly 6 real, well-known dishes that match ALL of the following user filters.
If a filter value is null or an empty list, treat it as "no restriction".
These recipes are intended for {serving_size} {serving_word}.

USER FILTERS:
{json.dumps(display_filters, indent=2)}

RULES:
- Only suggest dishes that genuinely exist in culinary traditions and have established recipes online. Do NOT invent dishes or arbitrarily combine ingredients.
- Include a mix of cuisines and cooking styles — do not default only to Western or globally famous dishes; include regional and local cuisines where relevant
- Every dish must satisfy ALL active (non-null) filters
- difficulty must be one of: "easy", "medium", "hard"
- prep_time_mins is realistic total time including cooking
- {tag_note}

Respond with ONLY a valid JSON array. No explanation, no markdown fences.
Each element must have exactly these keys:
[
  {{
    "name": "string",
    "cuisine": "string",
    "prep_time_mins": integer,
    "calories_per_serving": integer,
    "description": "1-2 sentence description",
    "difficulty": "easy|medium|hard",
    "tags": ["string"]
  }}
]"""


def recipe_parse_prompt(html: str) -> str:
    tag_note = _tag_note()
    return f"""You are a recipe extraction specialist.
Extract the recipe from the webpage HTML below into structured JSON.
If there is no recipe on the page, return {{"error": "no recipe found"}}.

EXTRACTION STRATEGY (follow in order):
1. First look for a <script type="application/ld+json"> block containing a Recipe schema — this is the most reliable source. Parse it directly if present.
2. If no JSON-LD, extract from the visible recipe content in the HTML body.

RULES:
- steps must be complete, actionable instructions (not headings). Include as many steps as the recipe genuinely requires — do not compress or skip steps.
- ingredients must have realistic amounts and units
- amount must ALWAYS be a decimal number — never a fraction string. Convert: "1/4" → 0.25, "1/2" → 0.5, "3/4" → 0.75, "1/3" → 0.333
- calories_per_serving is a realistic estimate — do your best or set to null
- source_name is the website or author name (e.g. "Jamie Oliver", "Serious Eats") — extract from the page or set to null
- warnings are allergen notices e.g. ["contains nuts", "contains dairy"]
- {tag_note}

Respond with ONLY valid JSON, no markdown. Use exactly these keys:
{{
  "title": "string",
  "servings": integer,
  "prep_time_mins": integer,
  "calories_per_serving": integer or null,
  "source_name": "string or null",
  "ingredients": [
    {{"name": "string", "amount": number, "unit": "string", "calories": number or null}}
  ],
  "steps": ["string"],
  "tags": ["string"],
  "warnings": ["string"]
}}

WEBPAGE HTML:
{html}"""


def shopping_list_prompt(recipes: list, pantry: list, language: str = "en") -> str:
    lang_note = _LANG_INSTRUCTION.get(language, _LANG_INSTRUCTION["en"])
    pantry_str = "\n".join(f"- {n}" for n in pantry) if pantry else "(empty)"
    return f"""You are a smart shopping list assistant.
{lang_note}
Generate a de-duplicated, grouped shopping list from the selected recipes,
subtracting ingredients the user already has in their pantry.

SELECTED RECIPES:
{json.dumps(recipes, indent=2)}

USER'S PANTRY (already owned — subtract these):
{pantry_str}

{_MATCHING_RULES}

RULES:
1. De-duplicate identical ingredients across recipes
2. Remove anything the user already owns (semantic match — see matching rules above)
3. Group items into: Produce, Meat & Fish, Dairy & Eggs, Bakery, Pantry & Dry Goods, Frozen, Beverages, Other
4. Translate all item names and category names to the response language

Respond with ONLY valid JSON, no markdown:
{{
  "groups": [
    {{
      "category": "string",
      "items": [
        {{"name": "string"}}
      ]
    }}
  ]
}}"""


def generate_recipe_prompt(dish_name: str, language: str = "en", servings: int = 2) -> str:
    lang_note = _LANG_INSTRUCTION.get(language, _LANG_INSTRUCTION["en"])
    tag_note = _tag_note()
    serving_word = "person" if servings == 1 else "people"
    return f"""You are a professional chef and recipe writer.
{lang_note}

Generate a complete, detailed recipe for: {dish_name}
This recipe is for {servings} {serving_word} — scale all ingredient amounts accordingly.

RULES:
- ingredients must have realistic amounts and units scaled for {servings} serving(s) (e.g. {{"name": "chicken breast", "amount": 300, "unit": "g"}})
- steps should be clear and actionable — include as many steps as the dish genuinely requires; do not compress or skip steps
- calories_per_serving is a realistic estimate per individual serving, or null if uncertain
- {tag_note}
- warnings are allergen notices in the response language (e.g. "contains eggs")

Respond with ONLY valid JSON, no markdown:
{{
  "title": "string",
  "servings": {servings},
  "prep_time_mins": integer,
  "calories_per_serving": integer or null,
  "ingredients": [
    {{"name": "string", "amount": number, "unit": "string", "calories": number or null}}
  ],
  "steps": ["string"],
  "tags": ["string"],
  "warnings": ["string"]
}}"""


def meal_generate_prompt(filters: dict, language: str = "en") -> str:
    """One rich meal per requested slot (ingredients, steps, macros)."""
    lang_note = _LANG_INSTRUCTION.get(language, _LANG_INSTRUCTION["en"])
    tag_note = _tag_note()
    servings = filters.get("servings", filters.get("serving_size", 2))
    serving_word = "person" if servings == 1 else "people"
    slots = filters.get("slots", ["breakfast", "lunch", "dinner"])

    # Extract disliked meals explicitly so the AI knows to avoid them
    recent_ratings = filters.get("recent_ratings") or {}
    disliked = [name for name, rating in recent_ratings.items() if rating == "down"]

    _exclude = {"serving_size", "servings", "language", "slots", "recent_ratings",
                "avoid_meals", "slot", "current_plan"}
    display_filters = {k: v for k, v in filters.items() if k not in _exclude}

    return f"""You are a world-class culinary expert.
{lang_note}
Suggest exactly one real, well-known dish for EACH of these slots: {', '.join(slots)}.
For {servings} {serving_word}. Match ALL active (non-null) filters below.
{f"DO NOT suggest any of these (disliked): {', '.join(disliked)}" if disliked else ""}
FILTERS:
{json.dumps(display_filters, indent=2)}

RULES:
- Only suggest dishes that genuinely exist in culinary traditions. Do NOT invent dishes.
- Every dish must satisfy ALL active (non-null) filters
- difficulty must be one of: "easy", "medium", "hard"
- prep_time_mins is realistic total time including cooking
- ingredients: flat list scaled for {servings} serving(s), e.g. ["300g chicken breast", "2 tbsp soy sauce"]
- steps: 3-6 clear, actionable cooking steps
- components.vegetable / .protein / .staple: short component names (e.g. "broccoli", "chicken", "rice")
- uses_pantry_items: ingredient names that match items in the pantry filter
- {tag_note}
- protein_g / carbs_g / fat_g / fiber_g: realistic per-serving estimates
- shopping_reminders: 1-3 key items NOT in pantry that are needed
- nutrition_note: 1-2 sentence nutritional summary of the full set
- total_calories: sum of calories_per_serving across all meals

Respond with ONLY valid JSON, no markdown:
{{
  "meals": [
    {{
      "slot": "breakfast|lunch|dinner",
      "name": "string",
      "cuisine": "string",
      "description": "1-2 sentence description",
      "prep_time_mins": integer,
      "calories_per_serving": integer,
      "difficulty": "easy|medium|hard",
      "components": {{"vegetable": "string", "protein": "string", "staple": "string"}},
      "uses_pantry_items": ["string"],
      "tags": ["string"],
      "ingredients": ["string"],
      "steps": ["string"],
      "protein_g": number, "carbs_g": number, "fat_g": number, "fiber_g": number
    }}
  ],
  "shopping_reminders": [{{"item": "string", "reason": "string"}}],
  "total_calories": integer,
  "nutrition_note": "string"
}}"""


def translate_prompt(texts: list[str]) -> str:
    numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(texts))
    return f"""You are a Chinese food and cooking translation specialist for a meal planning app.

Translate each numbered item below into natural Simplified Chinese.
Use authentic food vocabulary: 食材 (ingredients), 菜系 (cuisine), 份量 (servings), 备餐时间 (prep time).
Keep translations concise — this is a mobile UI.

{numbered}

Respond with ONLY the numbered translations in the same format. No explanation."""
