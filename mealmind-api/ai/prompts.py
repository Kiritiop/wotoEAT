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
- tags must ALWAYS be in English. Generate 4-7 tags covering: dietary labels, key ingredients, flavour profile, cooking style, and occasion. Examples: "high-protein", "gluten-free", "chicken", "stir-fry", "spicy", "quick", "one-pot", "meal-prep", "kid-friendly"

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
    flavour_preference: str | None = None,
    ingredient_keyword: str | None = None,
    meal_style: str | None = None,
) -> str:
    pantry_str = "\n".join(f"- {n}" for n in pantry) if pantry else "(empty)"
    profile_str = json.dumps(profile, indent=2)
    lang_note = _LANG_INSTRUCTION.get(language, _LANG_INSTRUCTION["en"])

    # ── Safety constraints (allergies, restrictions) ─────────────────────────
    constraints = []
    if profile.get("allergies"):
        constraints.append(
            f"- ⚠️ CRITICAL SAFETY — User is allergic to: {', '.join(profile['allergies'])}. "
            f"Do NOT include these in ANY form — not in main components, sauces, marinades, or garnishes. "
            f"This is a hard safety requirement."
        )
    if profile.get("dietary_restrictions"):
        constraints.append(f"- Dietary restrictions (MUST follow): {', '.join(profile['dietary_restrictions'])}")

    # ── Calorie and nutrition goals ───────────────────────────────────────────
    calorie_goal = profile.get("calorie_goal")
    if calorie_goal:
        b_cal = int(calorie_goal * 0.25)
        l_cal = int(calorie_goal * 0.35)
        d_cal = int(calorie_goal * 0.40)
        constraints.append(
            f"- HARD calorie target: {calorie_goal} kcal/day total. "
            f"Per meal: breakfast ≈{b_cal} kcal, lunch ≈{l_cal} kcal, dinner ≈{d_cal} kcal. "
            f"Stay within 10% of each target."
        )
    if profile.get("protein_goal_g"):
        constraints.append(f"- Daily protein goal: {profile['protein_goal_g']}g — prioritise high-protein options across all meals")

    # ── Health goal → actionable constraints ─────────────────────────────────
    _GOAL_HINTS = {
        "lose weight":        "prefer high-volume, lower-calorie meals (salads, soups, lean proteins, non-starchy veg); avoid fried foods and heavy sauces",
        "build muscle":       "maximise protein in every meal; include a complete protein source (meat, fish, eggs, legumes) and complex carbs for energy",
        "manage diabetes":    "avoid high-glycaemic staples (white rice, white bread, sugary sauces); prefer legumes, whole grains, and non-starchy vegetables",
        "improve gut health": "include fibre-rich foods (legumes, whole grains, vegetables); add fermented or prebiotic ingredients where possible",
        "heart health":       "favour healthy fats (olive oil, avocado, oily fish); limit saturated fat and sodium; include omega-3 sources",
        "eat healthier":      "balance macros, prioritise whole foods, minimise processed ingredients and added sugar",
    }
    for goal in profile.get("health_goals", []):
        hint = _GOAL_HINTS.get(goal.lower().strip())
        if hint:
            constraints.append(f"- Health goal '{goal}': {hint}")
        else:
            constraints.append(f"- Health goal: {goal} — tailor meals to support this goal")

    # ── Practical filters ─────────────────────────────────────────────────────
    if cuisine_preference:
        constraints.append(f"- Preferred cuisine style: {cuisine_preference}")
    if max_prep_time_mins:
        constraints.append(f"- Max prep time per meal: {max_prep_time_mins} minutes")
    constraints.append(
        f"- Servings per meal: {servings} {'person' if servings == 1 else 'people'} — "
        f"ALL ingredient amounts in the ingredients array must be scaled for {servings} serving(s), not for 1 person"
    )
    if flavour_preference:
        constraints.append(f"- Preferred flavour profile: {flavour_preference}")
    if ingredient_keyword:
        constraints.append(f"- Must include: {ingredient_keyword} — incorporate this across the meals")
    if meal_style == "main_dish":
        constraints.append(
            "- Meal style: Main Dish only — focus on protein + vegetables. "
            "Avoid heavy staples (no rice, noodles, or bread as the meal centre). "
            "Set the staple field to a light side (e.g. side salad, roasted veg) or 'none'."
        )

    constraints_str = "\n".join(constraints) if constraints else "None"

    slots_note = ""
    if slots:
        slot_list = ", ".join(slots)
        slots_note = f"\nGENERATE ONLY THESE MEAL SLOTS: {slot_list}. Omit all others. Return exactly {len(slots)} meal(s) in the meals array."

    # ── User taste memory ─────────────────────────────────────────────────────
    ratings_section = ""
    if recent_ratings:
        liked = [k for k, v in recent_ratings.items() if v == "up"]
        disliked = [k for k, v in recent_ratings.items() if v == "down"]
        ratings_section = "\nUSER TASTE MEMORY — use this to personalise suggestions:"
        if liked:
            ratings_section += (
                f"\n- Previously LIKED: {', '.join(liked)}. "
                f"Identify what these have in common (cuisine, protein, cooking style) and favour those patterns."
            )
        if disliked:
            ratings_section += (
                f"\n- Previously DISLIKED: {', '.join(disliked)}. "
                f"Do NOT suggest these dishes again. Avoid similar flavour profiles and cooking methods."
            )

    rule_1 = (
        "Each meal focuses on a protein and vegetable. The staple field should be a light side or 'none' — no rice, noodles, or bread as the main component."
        if meal_style == "main_dish"
        else "Each meal MUST contain three components: a vegetable, a protein, and a staple (carbohydrate)"
    )

    return f"""You are a professional nutritionist and chef. Plan a personalised day of meals for this user.
{lang_note}{slots_note}
{ratings_section}

USER HEALTH PROFILE:
{profile_str}

USER'S PANTRY (items already available):
{pantry_str}

CONSTRAINTS (all are hard requirements):
{constraints_str}

RULES:
1. {rule_1}
2. Distribute calories appropriately across the day: breakfast lightest (~25%), lunch medium (~35%), dinner largest (~40%). If a calorie target is set, stay within 10% of each meal's target.
3. Do NOT repeat the same cuisine, protein source, or cooking method across all three meal slots. Aim for variety in flavour and texture throughout the day.
4. Breakfast can have lighter staples (oats, toast, congee, smoothie bowl, etc.)
5. Use pantry items where possible — list only items the user actually has in uses_pantry_items
6. shopping_reminders lists key ingredients NOT in the pantry that the user needs to buy
7. difficulty must be one of: "easy", "medium", "hard"
8. slot must be exactly: "breakfast", "lunch", or "dinner"
9. nutrition_note should be one sentence explaining how the day's meals meet the user's specific health goals
10. tags must ALWAYS be in English. Generate 4-7 tags per meal: dietary labels, key ingredients, flavour, cooking style, occasion (e.g. "high-protein", "chicken", "stir-fry", "spicy", "quick", "one-pot", "meal-prep")
11. Include estimated macros (protein_g, carbs_g, fat_g, fiber_g) per serving for each meal
12. All ingredient amounts must be scaled for {servings} serving(s) — not for 1 person

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
      "uses_pantry_items": ["string — only items from the user's actual pantry list"],
      "tags": ["string"],
      "ingredients": ["string — amounts scaled for {servings} serving(s), e.g. '{servings*100}g chicken breast'"],
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
    pantry_str = "\n".join(f"- {n}" for n in pantry) if pantry else "(empty)"
    return f"""You are a smart shopping list assistant.
{lang_note}

Generate a grouped shopping list for this daily meal plan.
Subtract any ingredients already in the user's pantry.

DAILY MEAL PLAN:
{json.dumps(plan, indent=2)}

USER'S PANTRY (already owned — subtract these):
{pantry_str}

{_MATCHING_RULES}

RULES:
1. List every ingredient needed across all meals
2. Remove anything the user already has in their pantry (semantic match — see rules above)
3. Group items into: Produce, Meat & Fish, Dairy & Eggs, Bakery, Pantry & Dry Goods, Other

Respond with ONLY valid JSON, no markdown:
{{
  "groups": [
    {{
      "category": "string",
      "items": [
        {{"name": "string"}}
      ]
    }}
  ],
  "total_calories": null
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
- tags are ALWAYS in English. Generate 4-7 tags covering: dietary labels, key ingredients, flavour, cooking style, occasion (e.g. "vegan", "gluten-free", "high-protein", "chicken", "stir-fry", "quick", "one-pot")

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
  ],
  "total_calories": null
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
    pantry_str = "\n".join(f"- {n}" for n in pantry) if pantry else "(empty)"
    profile_str = json.dumps(profile, indent=2)

    # Build the same hard-constraint block as daily_plan_prompt
    constraints = []
    if profile.get("allergies"):
        constraints.append(
            f"- ⚠️ CRITICAL SAFETY — User is allergic to: {', '.join(profile['allergies'])}. "
            f"Do NOT include these in ANY form — not in main components, sauces, marinades, or garnishes."
        )
    if profile.get("dietary_restrictions"):
        constraints.append(f"- Dietary restrictions (MUST follow): {', '.join(profile['dietary_restrictions'])}")
    calorie_goal = profile.get("calorie_goal")
    if calorie_goal:
        slot_pct = {"breakfast": 0.25, "lunch": 0.35, "dinner": 0.40}.get(slot, 0.33)
        constraints.append(f"- Target calories for this {slot}: ≈{int(calorie_goal * slot_pct)} kcal (stay within 10%)")
    if profile.get("max_prep_time_mins"):
        constraints.append(f"- Max prep time: {profile['max_prep_time_mins']} minutes")
    constraints_str = "\n".join(constraints) if constraints else "None"

    other_cuisines = {m.get("cuisine", "") for m in other_meals if m.get("cuisine")}
    other_proteins = {m.get("components", {}).get("protein", "") for m in other_meals}

    return f"""You are a professional nutritionist and chef.
{lang_note}

The user wants to SWAP their {slot} meal for something different.
Current {slot}: {current_meal.get("name", "unknown")} — the replacement MUST be clearly different.

HARD CONSTRAINTS (all required):
{constraints_str}

USER PROFILE:
{profile_str}

USER'S PANTRY (use these if possible):
{pantry_str}

OTHER MEALS TODAY (avoid repeating these cuisines and proteins):
Cuisines already in today's plan: {', '.join(other_cuisines) or 'none'}
Proteins already in today's plan: {', '.join(p for p in other_proteins if p) or 'none'}
{json.dumps(other_meals, indent=2)}

RULES:
1. Return exactly ONE meal for the "{slot}" slot
2. Must be meaningfully different from "{current_meal.get('name', 'current meal')}" — different cuisine, protein, and cooking method
3. Must not repeat a cuisine or protein already present in today's other meals
4. Must contain a vegetable, protein, and staple
5. difficulty: "easy", "medium", or "hard"
6. tags must ALWAYS be in English. Generate 4-6 tags: dietary labels, key ingredients, flavour, cooking style
7. Include estimated macros per serving
8. All ingredient amounts must be realistic for a single serving (or match the servings in the user profile)

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
  "uses_pantry_items": ["string — only items from the user's actual pantry"],
  "tags": ["string"],
  "ingredients": ["e.g. '2 eggs', '100g chicken breast'"],
  "steps": ["concise cooking step", "4-6 steps total"],
  "protein_g": integer,
  "carbs_g": integer,
  "fat_g": integer,
  "fiber_g": integer
}}"""


def generate_recipe_prompt(dish_name: str, language: str = "en", servings: int = 2) -> str:
    lang_note = _LANG_INSTRUCTION.get(language, _LANG_INSTRUCTION["en"])
    serving_word = "person" if servings == 1 else "people"
    return f"""You are a professional chef and recipe writer.
{lang_note}

Generate a complete, detailed recipe for: {dish_name}
This recipe is for {servings} {serving_word} — scale all ingredient amounts accordingly.

RULES:
- ingredients must have realistic amounts and units scaled for {servings} serving(s) (e.g. {{"name": "chicken breast", "amount": 300, "unit": "g"}})
- steps should be clear and actionable (4-8 steps)
- calories_per_serving is a realistic estimate per individual serving
- tags are ALWAYS in English. Generate 4-7 tags: dietary labels, key ingredients, flavour, cooking style, occasion (e.g. "high-protein", "chicken", "gluten-free", "baked", "quick", "one-pot")
- warnings are allergen notices in the response language (e.g. "contains eggs")

Respond with ONLY valid JSON, no markdown:
{{
  "title": "string",
  "servings": {servings},
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
