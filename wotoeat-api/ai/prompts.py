"""
All prompt templates in one place.
"""
import json

_LANG_INSTRUCTION = {
    "en": "Respond in English.",
    "zh": "请用简体中文回答。所有餐名、描述、营养说明均需用中文。",
}


def _lang(language: str) -> str:
    """Language instruction line for the given language code."""
    return _LANG_INSTRUCTION.get(language, _LANG_INSTRUCTION["en"])


def _serving_word(n: int) -> str:
    return "person" if n == 1 else "people"


def _tag_note() -> str:
    # Tags are always stored in English regardless of response language.
    # The UI translates them at render time using a local lookup table.
    return (
        'tags must ALWAYS be in English ASCII words, regardless of the response language — '
        'NEVER use Chinese characters in tags even when every other field is Chinese. '
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
- EVERY numeric value must be a single resolved number — NEVER a formula or expression. Do the arithmetic yourself: write "37", not "523 / 14". JSON does not allow math.
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
    lang_note = _lang(language)
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


def generate_recipe_prompt(dish_name: str, language: str = "en", servings: int = 1) -> str:
    lang_note = _lang(language)
    tag_note = _tag_note()
    serving_word = _serving_word(servings)
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


def _profile_constraints_block(profile: dict) -> str:
    """Surface the safety-critical and goal-shaping profile fields as explicit,
    prioritized constraints instead of leaving them buried in the filters JSON.

    A real user fills in allergies / dietary restrictions / health goals expecting
    suggestions to honour them — an allergen or "vegetarian" violation is a trust-
    breaking failure, so these are stated as hard constraints that override every
    taste/pantry preference. Built outside the prompt f-string so its literal
    braces (the no_match JSON) pass through untouched.
    """
    if not profile:
        return ""
    allergies = [str(a).strip() for a in (profile.get("allergies") or []) if str(a).strip()]
    restrictions = [str(r).strip() for r in (profile.get("dietary_restrictions") or []) if str(r).strip()]
    goals = [str(g).strip() for g in (profile.get("health_goals") or []) if str(g).strip()]
    calorie_goal = profile.get("calorie_goal")
    protein_goal = profile.get("protein_goal_g")

    parts: list[str] = []

    if allergies or restrictions:
        safety = ["\nDIETARY SAFETY — ABSOLUTE HARD CONSTRAINTS (override cuisine, flavour, pantry, and required tags):"]
        if allergies:
            safety.append(
                f'- ALLERGIES: {", ".join(allergies)}. The dish and EVERY ingredient must be completely free of these '
                'AND their derivatives (e.g. "peanuts" also rules out peanut oil and satay sauce; "shellfish" rules out '
                'shrimp, crab and lobster; "dairy" rules out milk, butter, cheese, cream and yoghurt). If you are unsure '
                'whether an ingredient contains the allergen, leave it out.'
            )
        if restrictions:
            safety.append(
                f'- DIETARY RESTRICTIONS: {", ".join(restrictions)}. Every dish must fully comply (vegetarian = no meat, '
                'poultry, fish or seafood; vegan = no animal products at all, including eggs, dairy and honey; halal = no '
                'pork or alcohol; gluten-free = no wheat, barley, rye or regular soy sauce; keto/low-carb = minimal starches '
                'and sugar). Choose or adapt a real dish that complies — NEVER suggest one that violates a restriction.'
            )
        safety.append(
            'Safety wins over every preference: if a required tag or pantry item conflicts with an allergy or restriction, '
            'do NOT compromise — return the {"error": "no_match", ...} response instead.'
        )
        parts.append("\n".join(safety))

    if goals or calorie_goal or protein_goal:
        goal_lines = ["\nHEALTH GOALS — tailor every suggestion to these:"]
        if goals:
            goal_lines.append(
                f'- Goals: {", ".join(goals)}. For weight loss, favour lower-calorie, high-protein, high-fibre, '
                'vegetable-forward dishes and avoid deep-fried or heavy-cream ones; for building or gaining muscle, favour '
                'protein-rich dishes (aim for 30g+ protein per serving); otherwise keep meals balanced.'
            )
        if calorie_goal:
            goal_lines.append(
                f'- Daily calorie target ~{calorie_goal} kcal: keep each meal\'s calories_per_serving a sensible share of '
                'this (around a third for a main meal, less for breakfast or a lighter slot); never suggest a single meal '
                'that alone exceeds the daily target.'
            )
        if protein_goal:
            goal_lines.append(f'- Daily protein target ~{protein_goal} g: prefer dishes that help reach it.')
        parts.append("\n".join(goal_lines))

    return ("\n".join(parts) + "\n") if parts else ""


def meal_generate_prompt(filters: dict, language: str = "en") -> str:
    """One rich meal per requested slot (ingredients, steps, macros)."""
    lang_note = _lang(language)
    tag_note = _tag_note()
    servings = filters.get("servings", filters.get("serving_size", 1))
    serving_word = _serving_word(servings)
    slots = filters.get("slots", ["breakfast", "lunch", "dinner"])

    # Extract disliked meals explicitly so the AI knows to avoid them.
    # avoid_meals = every dish already shown today; merged so nothing repeats.
    recent_ratings = filters.get("recent_ratings") or {}
    disliked = [name for name, rating in recent_ratings.items() if rating == "down"]
    for name in filters.get("avoid_meals") or []:
        if name not in disliked:
            disliked.append(name)

    # Extract required tags/ingredients for explicit enforcement
    required = (filters.get("required_ingredients") or "").strip()

    _exclude = {"serving_size", "servings", "language", "slots", "recent_ratings",
                "avoid_meals", "slot", "current_plan", "pantry"}
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

    # Build the dietary-safety + health-goal block from the user's profile.
    safety_block = _profile_constraints_block(filters.get("profile") or {})

    # Build the pantry-priority block — prefer dishes that reuse what the user has.
    pantry_items = filters.get("pantry") or []
    if pantry_items:
        pantry_block = (
            "\nPANTRY PRIORITY:\n"
            f"The user already has these ingredients: {', '.join(pantry_items)}.\n"
            "Strongly PREFER dishes whose core ingredients are already in this pantry — "
            "maximize overlap so the user buys as little as possible, WITHOUT violating any "
            "active filter or required tag. List every matching ingredient in uses_pantry_items.\n"
        )
    else:
        pantry_block = ""

    # Liked meals ("up" ratings — recorded when the user saves a meal) shape
    # taste as the WEAKEST tier: safety > active filters > pantry > this.
    # Most-recent 15 only; ratings dicts are insertion-ordered and capped at
    # 100 client-side, so the tail is the freshest signal.
    liked = [n for n, r in recent_ratings.items() if r == "up" and n not in disliked][-15:]
    if liked:
        liked_block = (
            "\nTASTE PROFILE (lowest priority — never override safety, filters, or required tags):\n"
            f"The user has saved these dishes before: {', '.join(liked)}.\n"
            "Lean toward similar cuisines, flavour profiles, or core ingredients when choosing "
            "among dishes that satisfy everything above. Do NOT simply repeat these exact dishes.\n"
        )
    else:
        liked_block = ""

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
{safety_block}{required_block}{pantry_block}{liked_block}{style_block}
AUTHENTICITY — THIS IS THE MOST IMPORTANT RULE:
- Every dish MUST be a REAL, established dish that people actually cook — something you would
  find on a restaurant menu or in a published cookbook, with many recipes findable online.
- Use the dish's REAL, conventional name, e.g. "Chicken Tikka Masala", "Pad Thai",
  "Beef Bourguignon", "Shakshuka", "Bibimbap", "Margherita Pizza", "Pho Bo", "Coq au Vin".
- NEVER invent dishes, fusion mash-ups, or made-up names. NEVER use filler/marketing words
  like "Surprise", "Delight", "Medley", "Supreme", "Fusion", "Power Bowl", "Zest", "Explosion".
- A generic description is NOT a dish name. "Grilled Chicken with Vegetables", "Protein Bowl",
  "Chicken and Rice", "Veggie Stir-Fry" are NOT acceptable — name the actual, specific dish.
- Strongly prefer classic, iconic dishes of the requested cuisine.
- If the pantry / required filters cannot be satisfied by a real dish, pick the CLOSEST real,
  authentic dish — do NOT invent one to force-fit the constraints.
RULES:
- Only suggest dishes that genuinely exist in culinary traditions. Do NOT invent dishes.
- Every dish must satisfy ALL active (non-null) filters
- difficulty must be one of: "easy", "medium", "hard"
- prep_time_mins is realistic total time including cooking
- If max_prep_time_mins is set in the filters, prep_time_mins MUST be at or under it — pick a faster real dish rather than exceed the user's time limit
- description: 1–2 sentences capturing the dish's flavor profile and what makes it special — written warmly.
- ingredients: flat list scaled for {servings} serving(s), e.g. ["300g chicken breast", "2 tbsp soy sauce"]
- components.vegetable / .protein / .staple: short component names (e.g. "broccoli", "chicken", "rice")
- image_query: 2-4 plain English words for finding a PHOTO OF THIS DISH in a stock library.
  It MUST keep the word that makes the dish identifiable: the cut, the form, or the dish's own
  name where English speakers use it. NEVER swap that word for a broader one ("ribs" must not
  become "pork"), and never describe a side or staple instead of the dish itself.
  Lowercase, no taste adjectives, no flourishes.
  Examples: "红烧排骨" -> "braised pork ribs"; "Coq au Vin" -> "braised chicken wine";
  "Shakshuka" -> "shakshuka eggs tomato"; "Bibimbap" -> "bibimbap rice bowl";
  "Pad Thai" -> "pad thai noodles"; "Beef Bulgogi" -> "bulgogi grilled beef".
  Always in English even when the response language is not.
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
      "description": "1-2 sentence description",
      "prep_time_mins": integer,
      "calories_per_serving": integer,
      "difficulty": "easy|medium|hard",
      "components": {{"vegetable": "string", "protein": "string", "staple": "string"}},
      "image_query": "string",
      "uses_pantry_items": ["string"],
      "tags": ["string"],
      "ingredients": ["string"],
      "protein_g": number, "carbs_g": number, "fat_g": number, "fiber_g": number
    }}
  ],
  "shopping_reminders": [{{"item": "string", "reason": "string"}}],
  "total_calories": integer,
  "nutrition_note": "string"
}}"""


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


def dish_photo_check_prompt(dish_name: str, cuisine: str, image_query: str) -> str:
    """Ask a vision model how well a candidate photo represents the dish.

    Deliberately NOT a yes/no question. The first version of this asked "would a
    person accept this photo", and a 27B model said yes to everything: a
    Colombian rib roast for a Chinese red braise, PANEER tikka masala for
    CHICKEN tikka masala, a bibimbap bowl for bulgogi. All three were listed in
    that prompt as reject conditions. A lenient binary with a confidence field
    just produces a confident yes.

    So it now has to describe the photo before judging it, answer the two
    discriminating questions separately, and give a comparative 0-10 fit that
    ranks candidates against each other instead of rubber-stamping each one
    alone.
    """
    cuisine_line = f"Cuisine: {cuisine}\n" if cuisine else ""
    query_line = f"Expected to look like: {image_query}\n" if image_query else ""
    return f"""Rate how well this photo represents a specific dish. Be strict. Most stock
photos are of a DIFFERENT dish that merely shares a word with this one, and
serving one of those under the recipe is worse than serving no photo at all.

Dish: {dish_name}
{cuisine_line}{query_line}
Work in this order.

1. Describe what is actually in the photo. Name the main ingredient you can see
   and how it was cooked. Do not read the dish name back to me.

2. same_main_ingredient: is the main thing in the photo the same ingredient the
   dish is made of? A different protein or a substitute is false. Chicken is not
   paneer, beef is not pork, pork belly is not pork ribs, prawns are not fish.
   If the dish is the meat itself and the photo is a rice or noodle bowl, false.

3. same_style: is it the same cuisine AND the same cooking method? A Chinese
   red braise is dark, glossy and saucy; Colombian or American roasted and
   grilled ribs are not it. Japanese katsu curry is not Indian curry. Grilled is
   not braised, raw is not cooked, deep-fried is not steamed.

4. fit, 0 to 10:
   10  unmistakably this dish
   8   this dish, plated differently than usual
   6   a close regional variant
   4   the right family, clearly not this dish
   2   shares one ingredient and nothing else
   0   not this dish, or not prepared food at all

Presentation, garnish and crockery may differ freely; do not lower the fit for
those. Do lower it if the dish is small, blurred, or in the background.

Respond with ONLY valid JSON, no markdown:
{{"shows": "what you see, at most 10 words", "same_main_ingredient": true or false, "same_style": true or false, "fit": 0}}"""


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
    """Stage 2 of receipt scanning: turn raw receipt lines into normalized pantry items.

    `language` is intentionally unused: names are canonical English plus a
    name_zh display name, mirroring the app-wide tags convention.
    """
    lines_str = "\n".join(lines)
    pantry_str = "\n".join(f"- {n}" for n in pantry) if pantry else "(empty)"
    return f"""You are a grocery receipt analyst for a meal planning app.
Below are the raw transcribed lines of a grocery receipt, followed by the user's current pantry.
Extract every PURCHASED PRODUCT into a structured item list.

RECEIPT LINES:
{lines_str}

USER'S CURRENT PANTRY:
{pantry_str}

{_RECEIPT_MATCHING_RULES}

RULES:
1. Expand store abbreviations into real product names: "ORG BNLS CKN BRST" → "chicken breast", "GV 2% RDCD FAT MILK" → "milk", "WHP CRM" → "whipping cream".
2. name: ALWAYS in English, regardless of the receipt's language and regardless of the user's language — the same convention as tags everywhere in this app. Lowercase, 1-4 words, the specific culinarily meaningful cut/form ("chicken breast" not "chicken"). Strip brand names and marketing words (GREAT VALUE, KIRKLAND, ORGANIC, FRESH). If a receipt line is in another language (e.g. Chinese), translate the food to its common English name.
3. name_zh: the Simplified Chinese display name for the same food ("chicken breast" → "鸡胸肉", "eggs" → "鸡蛋"). ALWAYS provide it for every item — never null, never empty, never English.
4. is_food: true for human food and drink; false for non-edible products (paper towels, detergent, shopping bags, batteries, pet food, cosmetics).
5. OMIT ENTIRELY — do not output as items: subtotal/tax/total/change/payment/card lines, coupons, discounts, bottle deposits (CRV), loyalty/membership lines, store name/address/phone, dates, cashier and barcode lines.
6. Weight/price detail lines that belong to the previous item (e.g. "2.14 lb @ 5.88/lb") must be folded into that item, never emitted as their own item.
7. Deduplicate: the same product on multiple lines becomes ONE item (combine the quantity, join the raw lines).
8. raw_text: the verbatim receipt line(s) the item came from.
9. quantity: short human-readable string for display only ("2.14 lb", "x3", "1 gal") or null. It will not be stored.
10. matches_pantry: per the SEMANTIC PANTRY MATCHING rules above.
If the receipt contains no food items at all, respond with ONLY: {{"error": "no_food_items"}}

Respond with ONLY valid JSON, no markdown:
{{
  "items": [
    {{"name": "string", "name_zh": "string", "raw_text": "string", "is_food": true, "quantity": "string or null", "matches_pantry": "string or null"}}
  ]
}}"""
