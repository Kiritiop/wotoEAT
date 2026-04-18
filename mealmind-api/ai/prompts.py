"""
All prompt templates in one place.
"""
import json

_LANG_INSTRUCTION = {
    "en": "Respond in English.",
    "zh": "请用简体中文回答。所有餐名、描述、营养说明均需用中文。",
}


def meal_suggestion_prompt(filters: dict) -> str:
    return f"""You are a world-class culinary expert and nutritionist.
Suggest exactly 6 meal ideas that match ALL of the following user filters.
If a filter value is null or an empty list, treat it as "no restriction".

USER FILTERS:
{json.dumps(filters, indent=2)}

RULES:
- Every meal must satisfy ALL active (non-null) filters
- Be specific with names — not "pasta" but "Cacio e Pepe"
- Include a mix of familiar and slightly adventurous dishes
- difficulty must be one of: "easy", "medium", "hard"
- prep_time_mins is realistic total time including cooking
- tags must ALWAYS be in English regardless of any language setting (e.g. "high-protein", "gluten-free", "vegan", "quick", "one-pot")

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


def daily_plan_prompt(
    profile: dict,
    pantry: list,
    cuisine_preference: str | None,
    max_prep_time_mins: int | None,
    language: str = "en",
    recent_ratings: dict | None = None,
    servings: int = 2,
    slots: list[str] | None = None,
) -> str:
    pantry_str = json.dumps(pantry, indent=2) if pantry else "[]"
    profile_str = json.dumps(profile, indent=2)
    lang_note = _LANG_INSTRUCTION.get(language, _LANG_INSTRUCTION["en"])

    constraints = []
    if cuisine_preference:
        constraints.append(f"- Preferred cuisine: {cuisine_preference}")
    if max_prep_time_mins:
        constraints.append(f"- Max prep time per meal: {max_prep_time_mins} minutes")
    if profile.get("dietary_restrictions"):
        constraints.append(f"- Dietary restrictions: {', '.join(profile['dietary_restrictions'])}")
    if profile.get("allergies"):
        constraints.append(f"- Allergies (MUST avoid): {', '.join(profile['allergies'])}")
    if profile.get("protein_goal_g"):
        constraints.append(f"- Daily protein goal: {profile['protein_goal_g']}g — prioritise high-protein options")
    if servings != 2:
        constraints.append(f"- Servings per meal: {servings} people")
    constraints_str = "\n".join(constraints) if constraints else "None"

    slots_note = ""
    if slots:
        slot_list = ", ".join(slots)
        slots_note = f"\nGENERATE ONLY THESE MEAL SLOTS: {slot_list}. Omit the others entirely."

    ratings_section = ""
    if recent_ratings:
        liked = [k for k, v in recent_ratings.items() if v == "up"]
        disliked = [k for k, v in recent_ratings.items() if v == "down"]
        if liked:
            ratings_section += f"\nUSER LIKED THESE MEALS (suggest similar): {', '.join(liked)}"
        if disliked:
            ratings_section += f"\nUSER DISLIKED THESE (avoid similar): {', '.join(disliked)}"

    return f"""You are a professional nutritionist and chef. Plan a full day of meals (breakfast, lunch, dinner) for this user.
{lang_note}{slots_note}

USER HEALTH PROFILE:
{profile_str}

USER'S PANTRY (items already available):
{pantry_str}

CONSTRAINTS:
{constraints_str}
{ratings_section}

RULES:
1. Each meal MUST contain three components: a vegetable, a protein, and a staple (carbohydrate)
2. Breakfast can have lighter staples (oats, toast, congee, etc.)
3. Use pantry items where possible — list which ones in uses_pantry_items
4. shopping_reminders lists key ingredients NOT in the pantry that the user needs to buy
5. Calories should be appropriate for the user's profile and goals
6. difficulty must be one of: "easy", "medium", "hard"
7. slot must be exactly: "breakfast", "lunch", or "dinner"
8. nutrition_note should be one sentence explaining how the day meets the user's health goals
9. tags must ALWAYS be in English regardless of the response language (e.g. "high-protein", "low-carb", "gluten-free", "quick", "one-pot")
10. Include estimated macros (protein_g, carbs_g, fat_g, fiber_g) per serving for each meal

Respond with ONLY valid JSON, no markdown fences:
{{
  "meals": [
    {{
      "slot": "breakfast",
      "name": "string",
      "cuisine": "string",
      "description": "1-2 sentences",
      "prep_time_mins": integer,
      "calories_per_serving": integer,
      "difficulty": "easy|medium|hard",
      "components": {{
        "vegetable": "string",
        "protein": "string",
        "staple": "string"
      }},
      "uses_pantry_items": ["string"],
      "tags": ["string"],
      "ingredients": ["string — e.g. '2 eggs', '100g chicken breast'"],
      "steps": ["string — concise cooking step, 4-6 steps total"],
      "protein_g": integer,
      "carbs_g": integer,
      "fat_g": integer,
      "fiber_g": integer
    }},
    {{ "slot": "lunch", "...": "same fields" }},
    {{ "slot": "dinner", "...": "same fields" }}
  ],
  "shopping_reminders": [
    {{ "item": "string", "reason": "string" }}
  ],
  "total_calories": integer,
  "nutrition_note": "string"
}}"""


_UNIT_WEIGHTS = """
UNIT WEIGHT GUIDE (use these to convert pantry quantities to grams for comparison):
- 个 (gè/piece): eggs≈60g, medium fruit≈150g, onion≈120g, tomato≈100g, potato≈150g
- 条 (tiáo/strip): fish fillet≈200g (basa/巴沙鱼/tilapia/鲈鱼 all count), carrot≈80g, cucumber≈200g
- 块 (kuài/chunk): meat/tofu piece≈150g
- 袋 (dài/bag): shrimp≈300g, leafy greens≈200g, frozen veg≈500g
- 瓶 (píng/bottle): ≈500ml liquid
- 盒 (hé/box): ≈250g
- piece: ≈150g, bunch: ≈200g, can: ≈400g, cup: ≈240ml or 150g dry
"""

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


def plan_shopping_prompt(plan: dict, pantry: list, language: str = "en") -> str:
    lang_note = _LANG_INSTRUCTION.get(language, _LANG_INSTRUCTION["en"])
    return f"""You are a smart shopping list assistant.
{lang_note}

Generate a detailed, grouped shopping list for this daily meal plan.
Subtract any ingredients already in the user's pantry.

DAILY MEAL PLAN:
{json.dumps(plan, indent=2)}

USER'S PANTRY (already owned — subtract these):
{json.dumps(pantry, indent=2)}

{_UNIT_WEIGHTS}
{_MATCHING_RULES}

RULES:
1. List every ingredient needed across all 3 meals with realistic amounts
2. Remove anything the user already has in their pantry (semantic match, not just exact name)
3. Group items into: Produce, Meat & Fish, Dairy & Eggs, Bakery, Pantry & Dry Goods, Other
4. Use sensible units: grams/kg for weight, ml/L for liquid, pieces for countables
5. Include estimated calories where possible

Respond with ONLY valid JSON, no markdown:
{{
  "groups": [
    {{
      "category": "string",
      "items": [
        {{"name": "string", "amount": number, "unit": "string", "calories": number or null}}
      ]
    }}
  ],
  "total_calories": integer or null
}}"""


def recipe_parse_prompt(html: str) -> str:
    return f"""You are a recipe extraction specialist.
Extract the recipe from the webpage HTML below into structured JSON.
If there is no recipe on the page, return {{"error": "no recipe found"}}.

RULES:
- steps must be complete, actionable instructions (not headings)
- ingredients must have realistic amounts and units
- calories_per_serving is an estimate — do your best or set to null
- warnings are allergen notices e.g. ["contains nuts", "contains dairy"]
- tags are dietary labels e.g. ["vegan", "gluten-free", "high-protein"]

Respond with ONLY valid JSON, no markdown. Use exactly these keys:
{{
  "title": "string",
  "servings": integer,
  "prep_time_mins": integer,
  "calories_per_serving": integer or null,
  "ingredients": [
    {{"name": "string", "amount": number, "unit": "string", "calories": number or null}}
  ],
  "steps": ["string"],
  "tags": ["string"],
  "warnings": ["string"]
}}

WEBPAGE HTML (truncated):
{html}"""


def shopping_list_prompt(recipes: list, pantry: list, language: str = "en") -> str:
    lang_note = _LANG_INSTRUCTION.get(language, _LANG_INSTRUCTION["en"])
    return f"""You are a smart shopping list assistant.
{lang_note}
Generate a de-duplicated, grouped shopping list from the selected recipes,
subtracting ingredients the user already has in their pantry.

SELECTED RECIPES:
{json.dumps(recipes, indent=2)}

USER'S PANTRY (already owned — subtract these):
{json.dumps(pantry, indent=2)}

{_UNIT_WEIGHTS}
{_MATCHING_RULES}

RULES:
1. Combine identical ingredients across recipes (sum their quantities)
2. Remove anything the user already owns (semantic match — see matching rules above)
3. Group items into these categories: Produce, Meat & Fish, Dairy & Eggs,
   Bakery, Pantry & Dry Goods, Frozen, Beverages, Other
4. Use sensible units: grams/kg for weight, ml/L for liquid, pieces for countables
5. Include estimated calories where possible
6. Translate all item names and category names to the response language

Respond with ONLY valid JSON, no markdown:
{{
  "groups": [
    {{
      "category": "string",
      "items": [
        {{"name": "string", "amount": number, "unit": "string", "calories": number or null}}
      ]
    }}
  ],
  "total_calories": integer or null
}}"""


def swap_meal_prompt(
    slot: str,
    current_plan: dict,
    profile: dict,
    pantry: list,
    language: str = "en",
) -> str:
    lang_note = _LANG_INSTRUCTION.get(language, _LANG_INSTRUCTION["en"])
    other_meals = [m for m in current_plan.get("meals", []) if m.get("slot") != slot]
    current_meal = next((m for m in current_plan.get("meals", []) if m.get("slot") == slot), {})
    pantry_str = json.dumps(pantry, indent=2) if pantry else "[]"
    profile_str = json.dumps(profile, indent=2)

    return f"""You are a professional nutritionist and chef.
{lang_note}

The user wants to SWAP their {slot} meal for something different.
Current {slot}: {current_meal.get("name", "unknown")} — suggest something clearly different.

USER PROFILE:
{profile_str}

USER'S PANTRY (use these if possible):
{pantry_str}

OTHER MEALS TODAY (avoid repeating similar flavours or proteins):
{json.dumps(other_meals, indent=2)}

RULES:
1. Return exactly ONE meal for the "{slot}" slot
2. Must be meaningfully different from the current {slot} meal
3. Must contain a vegetable, protein, and staple
4. difficulty: "easy", "medium", or "hard"
5. tags must ALWAYS be in English (e.g. "high-protein", "quick", "one-pot")

Respond with ONLY a single valid JSON object, no markdown:
{{
  "slot": "{slot}",
  "name": "string",
  "cuisine": "string",
  "description": "1-2 sentences",
  "prep_time_mins": integer,
  "calories_per_serving": integer,
  "difficulty": "easy|medium|hard",
  "components": {{"vegetable": "string", "protein": "string", "staple": "string"}},
  "uses_pantry_items": ["string"],
  "tags": ["string"],
  "ingredients": ["e.g. '2 eggs', '100g chicken breast'"],
  "steps": ["concise cooking step", "4-6 steps total"]
}}"""


def generate_recipe_prompt(dish_name: str, language: str = "en") -> str:
    lang_note = _LANG_INSTRUCTION.get(language, _LANG_INSTRUCTION["en"])
    return f"""You are a professional chef and recipe writer.
{lang_note}

Generate a complete, detailed recipe for: {dish_name}

RULES:
- ingredients must have realistic amounts and units (e.g. {{"name": "chicken breast", "amount": 300, "unit": "g"}})
- steps should be clear and actionable (4-8 steps)
- calories_per_serving is a realistic estimate
- tags are dietary labels in English (e.g. "high-protein", "gluten-free", "quick")
- warnings are allergen notices in the response language (e.g. "contains eggs")
- servings defaults to 2

Respond with ONLY valid JSON, no markdown:
{{
  "title": "string",
  "servings": integer,
  "prep_time_mins": integer,
  "calories_per_serving": integer,
  "ingredients": [
    {{"name": "string", "amount": number, "unit": "string", "calories": number or null}}
  ],
  "steps": ["string"],
  "tags": ["string"],
  "warnings": ["string"]
}}"""


def translate_prompt(texts: list[str]) -> str:
    numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(texts))
    return f"""You are a Chinese food and cooking translation specialist for a meal planning app.

Translate each numbered item below into natural Simplified Chinese.
Use authentic food vocabulary: 食材 (ingredients), 菜系 (cuisine), 份量 (servings), 备餐时间 (prep time).
Keep translations concise — this is a mobile UI.

{numbered}

Respond with ONLY the numbered translations in the same format. No explanation."""


def eat_out_ranking_prompt(restaurants: list, filters: dict) -> str:
    return f"""You are a restaurant recommendation expert.
Rank the top 5 most suitable restaurants from the list below based on the user's preferences.

USER PREFERENCES:
{json.dumps(filters, indent=2)}

NEARBY RESTAURANTS (from Google Maps):
{json.dumps(restaurants, indent=2)}

RULES:
- Only include restaurants that are a reasonable match
- If fewer than 5 are suitable, return fewer
- reason must be 1 concise sentence explaining the match
- maps_url must follow the format: https://maps.google.com/?q=NAME+ADDRESS

Respond with ONLY a valid JSON array, no markdown:
[
  {{
    "name": "string",
    "address": "string",
    "rating": number or null,
    "reason": "string",
    "maps_url": "string"
  }}
]"""
