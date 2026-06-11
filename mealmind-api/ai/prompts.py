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
        'Generate as many tags as the dish genuinely requires — include every one that applies. '
        'Cover ALL of: '
        '(1) every key ingredient as its own tag — use the SPECIFIC cut, part, or form used in the dish, '
        'not just the base protein/vegetable. '
        'For example: "chicken wings" not "chicken", "chicken breast" not "chicken", '
        '"pork belly" not "pork", "ground beef" not "beef", "salmon fillet" not "fish". '
        'Only use the generic name (e.g. "chicken") when no specific cut is implied. '
        '(2) dietary labels (e.g. "high-protein", "gluten-free", "dairy-free"), '
        '(3) flavour profile (e.g. "spicy", "umami", "savory", "mild"), '
        '(4) cooking style (e.g. "stir-fry", "baked", "steamed", "one-pot"), '
        '(5) occasion/lifestyle (e.g. "quick", "meal-prep", "comfort food", "healthy"). '
        'Be thorough — list every main ingredient separately using its specific form. '
        'Examples: "chicken wings", "broccoli", "soy sauce", "high-protein", "stir-fry", "spicy", "quick", "gluten-free"'
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
    return f"""You are a professional chef and recipe writer who writes with warmth and expertise.
{lang_note}

Generate a complete, detailed recipe for: {dish_name}
This recipe is for {servings} {serving_word} — scale all ingredient amounts accordingly.

RULES:
- intro: 2–3 sentences describing the dish's flavor profile, aroma, and what makes it special — written warmly, as if recommending it to a friend. Mention the defining taste or texture experience.
- ingredients: realistic amounts and units scaled for {servings} serving(s). Each ingredient may have an optional "tip" (1-sentence substitution or quality note, e.g. "chicken thigh stays juicier than breast here"). Only add a tip where it genuinely helps.
- steps: include every step the dish requires — never compress or skip. Write for a beginner cook who has never made this dish before. Each step MUST follow this format exactly: "Step N — [Evocative Title] (≈X min): [Complete instructions with exact quantities repeated where helpful, specific technique cues (e.g. medium-high heat, not just 'heat the pan'), and at least one sensory/visual checkpoint the cook can verify — such as color change, texture, aroma, or sound. Where the reason for a step is non-obvious, explain it briefly.]" Example: "Step 1 — Marinate (≈10 min): Cut chicken thigh into 1.5 cm cubes — thigh stays juicier than breast here. Combine with 1 tbsp rice wine, 1 tbsp soy sauce, and 1 tsp cornstarch; knead with your hands until the meat turns sticky and fully absorbs the liquid (about 1 min). Drizzle ½ tsp oil over the surface and toss to coat — this seals in moisture so the pieces don't dry out when they hit the hot wok. Rest 10 minutes at room temperature."
- chef_tips: 2–4 short tips covering key ratios, common mistakes to avoid, or the "why" behind a critical technique. Be specific, not generic — e.g. "Sugar and vinegar in a 1:1 ratio is the classic lychee-flavour base; add a touch more vinegar for a sharper finish."
- calories_per_serving: realistic per-serving estimate. Only set null for highly unusual dishes where estimation is genuinely impossible — for mainstream dishes always estimate.
- {tag_note}
- warnings: allergen notices in the response language (e.g. "contains eggs")

Respond with ONLY valid JSON, no markdown:
{{
  "title": "string",
  "intro": "string",
  "servings": {servings},
  "prep_time_mins": integer,
  "calories_per_serving": integer or null,
  "ingredients": [
    {{"name": "string", "amount": number, "unit": "string", "calories": number or null, "tip": "string or null"}}
  ],
  "steps": ["string"],
  "chef_tips": ["string"],
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

    # Extract required tags/ingredients for explicit enforcement
    required = (filters.get("required_ingredients") or "").strip()

    _exclude = {"serving_size", "servings", "language", "slots", "recent_ratings",
                "avoid_meals", "slot", "current_plan"}
    display_filters = {k: v for k, v in filters.items() if k not in _exclude}

    # Build the required-tags enforcement block (pre-resolved so outer f-string sees literal braces)
    if required:
        required_block = (
            f'\nCRITICAL — REQUIRED TAGS / INGREDIENTS: "{required}"\n'
            'Every dish you suggest MUST:\n'
            '1. Actually contain those ingredients and/or match those descriptors.\n'
            '2. Include every one of those terms verbatim in the dish\'s "tags" list.\n'
            'If there is NO real, well-known dish that can satisfy ALL of the required tags/ingredients, '
            'you MUST respond with ONLY this JSON and nothing else '
            '(no meals array, no extra keys):\n'
            f'{{"error": "no_match", "message": "No dish can satisfy all required tags: {required}"}}\n'
        )
    else:
        required_block = ""

    # Build the main-dish style enforcement block
    meal_style = filters.get("meal_style", "full")
    if meal_style == "main_dish":
        style_block = (
            '\nCRITICAL — MAIN DISH MODE:\n'
            'Generate a SIDE DISH / MAIN DISH COMPONENT only — NOT a full meal.\n'
            'This is a dish meant to be eaten alongside a separately cooked starch (e.g. steamed rice, noodles).\n'
            'The dish itself must NOT include rice, noodles, pasta, bread, dumplings, or any other '
            'carbohydrate-heavy staple as an ingredient or component.\n'
            'Focus on the protein and/or vegetable elements only.\n'
            'Set components.staple to "" (empty string) — there is no staple in this dish.\n'
            'Macros: carbs_g should be minimal (from sauces/aromatics only, typically under 15g).\n'
        )
    else:
        style_block = ""

    return f"""You are a world-class culinary expert who writes with warmth and expertise.
{lang_note}
Suggest exactly one real, well-known dish for EACH of these slots: {', '.join(slots)}.
For {servings} {serving_word}. Match ALL active (non-null) filters below.
{f"DO NOT suggest any of these (disliked): {', '.join(disliked)}" if disliked else ""}
FILTERS:
{json.dumps(display_filters, indent=2)}
{required_block}{style_block}
RULES:
- Only suggest dishes that genuinely exist in culinary traditions. Do NOT invent dishes.
- Every dish must satisfy ALL active (non-null) filters
- difficulty must be one of: "easy", "medium", "hard"
- prep_time_mins is realistic total time including cooking
- intro: 2–3 sentences describing the dish's flavor profile, aroma, and what makes it special — written warmly. Mention the defining taste or texture experience.
- ingredients: flat list scaled for {servings} serving(s), e.g. ["300g chicken breast", "2 tbsp soy sauce"]
- steps: include every step the dish requires — never compress. Write for a beginner cook who has never made this dish before. Each step MUST follow this format exactly: "Step N — [Evocative Title] (≈X min): [Complete instructions with exact quantities repeated where helpful, specific heat levels and timing, and at least one sensory/visual checkpoint the cook can verify — color, texture, aroma, or sound. Where the reason is non-obvious, explain it briefly.]" Example: "Step 2 — Sear (≈5 min): Heat 1 tbsp oil in a wok over high heat until you see faint wisps of smoke — this is the right temperature for a fast sear. Add the chicken in a single layer and leave untouched for 30 seconds until the underside turns golden and releases easily. Toss and stir-fry a further 1–2 minutes until no pink remains; the pieces should feel firm when pressed, not squishy. Remove and set aside."
- chef_tips: 1–2 short tips covering a key ratio, common mistake to avoid, or the "why" behind a critical technique. Be specific.
- components.vegetable / .protein / .staple: short component names (e.g. "broccoli", "chicken", "rice")
- uses_pantry_items: ingredient names that match items in the pantry filter
- {tag_note}
- calories_per_serving: realistic estimate per serving — only null for genuinely unusual dishes
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
      "intro": "string",
      "description": "1-2 sentence description",
      "prep_time_mins": integer,
      "calories_per_serving": integer,
      "difficulty": "easy|medium|hard",
      "components": {{"vegetable": "string", "protein": "string", "staple": "string"}},
      "uses_pantry_items": ["string"],
      "tags": ["string"],
      "ingredients": ["string"],
      "steps": ["string"],
      "chef_tips": ["string"],
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


# Like _MATCHING_RULES but for receipt→pantry matching: same semantic examples,
# without the shopping-list actions (which would confuse this task).
_RECEIPT_MATCHING_RULES = """
SEMANTIC PANTRY MATCHING (critical — read carefully):
- Match by ingredient TYPE, not exact name, across languages. Examples:
  - Pantry has "巴沙鱼" or "basa fish" → matches a scanned "white fish", "fish fillet", "swai"
  - Pantry has "虾" or "对虾" → matches "shrimp", "prawns", "虾仁"
  - Pantry has "鸡胸肉" → matches "chicken breast", "chicken"
  - Pantry has "生抽" → matches "soy sauce", "酱油"
  - Pantry has "食用油" → matches "vegetable oil", "cooking oil"
- matches_pantry must be the EXACT pantry item string copied verbatim from the pantry list, or null.
- Only match when it is clearly the same ingredient type; if genuinely unsure, use null.
- NEVER put a value in matches_pantry that is not in the pantry list.
"""


def receipt_transcribe_prompt() -> str:
    """Stage 1 of receipt scanning: vision model transcribes the photo verbatim."""
    return """You are a receipt transcription machine.
Transcribe EVERY printed line of the grocery receipt in this image, top to bottom, exactly as printed.
- Copy lines VERBATIM: keep abbreviations, item codes, prices, weights, and quantities exactly as they appear.
- Do NOT interpret, expand, translate, reorder, or omit anything. Include the store header, every item line, discounts, tax, totals, and footer lines.
- If part of a line is unreadable, transcribe the readable part and write ??? for the unreadable part.
- One receipt line = one array element.
If the image is not a receipt, or is too blurry to read any lines at all, respond with ONLY:
{"error": "no_receipt"}
Otherwise respond with ONLY valid JSON, no markdown, no explanation:
{"lines": ["string"]}"""


def receipt_normalize_prompt(lines: list[str], pantry: list[str], language: str = "en") -> str:
    """Stage 2 of receipt scanning: turn raw receipt lines into normalized pantry items."""
    lang_note = _LANG_INSTRUCTION.get(language, _LANG_INSTRUCTION["en"])
    lines_str = "\n".join(lines)
    pantry_str = "\n".join(f"- {n}" for n in pantry) if pantry else "(empty)"
    return f"""You are a grocery receipt analyst for a meal planning app.
{lang_note}
Below are the raw transcribed lines of a grocery receipt, followed by the user's current pantry.
Extract every PURCHASED PRODUCT into a structured item list.

RECEIPT LINES:
{lines_str}

USER'S CURRENT PANTRY:
{pantry_str}

{_RECEIPT_MATCHING_RULES}

RULES:
1. Expand store abbreviations into real product names: "ORG BNLS CKN BRST" → "chicken breast", "GV 2% RDCD FAT MILK" → "milk", "WHP CRM" → "whipping cream".
2. name: the specific food in the response language, 1-4 words, using the culinarily meaningful cut/form ("chicken breast" not "chicken"). Strip brand names and marketing words (GREAT VALUE, KIRKLAND, ORGANIC, FRESH).
3. is_food: true for human food and drink; false for non-edible products (paper towels, detergent, shopping bags, batteries, pet food, cosmetics).
4. OMIT ENTIRELY — do not output as items: subtotal/tax/total/change/payment/card lines, coupons, discounts, bottle deposits (CRV), loyalty/membership lines, store name/address/phone, dates, cashier and barcode lines.
5. Weight/price detail lines that belong to the previous item (e.g. "2.14 lb @ 5.88/lb") must be folded into that item, never emitted as their own item.
6. Deduplicate: the same product on multiple lines becomes ONE item (combine the quantity, join the raw lines).
7. raw_text: the verbatim receipt line(s) the item came from.
8. quantity: short human-readable string for display only ("2.14 lb", "x3", "1 gal") or null. It will not be stored.
9. matches_pantry: per the SEMANTIC PANTRY MATCHING rules above.
If the receipt contains no food items at all, respond with ONLY: {{"error": "no_food_items"}}

Respond with ONLY valid JSON, no markdown:
{{
  "items": [
    {{"name": "string", "raw_text": "string", "is_food": true, "quantity": "string or null", "matches_pantry": "string or null"}}
  ]
}}"""
