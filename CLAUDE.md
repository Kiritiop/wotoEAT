# wotoEAT — Project Reference
Update this document every time changes happen, adapt accordingly

## Overview

wotoEAT (branded "MealMind") is an AI-powered meal planning mobile app. Users get daily meal suggestions tailored to their dietary profile, pantry contents, and taste preferences. They can confirm meals, which auto-adds missing ingredients to a shopping list, save favourite recipes, and parse recipes from external URLs.

---

## Repository Layout

```
wotoEAT/
├── MealMind/          # Expo React Native frontend (iOS, Android, Web)
└── mealmind-api/      # FastAPI Python backend
```

---

## Backend — `mealmind-api/`

### Stack
- **Python 3.12+**, FastAPI, Uvicorn
- **AI**: Google Gemini API (`gemini-2.5-flash`) via `google-genai` async client
- **Database**: Supabase (Postgres) via `supabase-py` with service-role key
- **Auth**: Supabase JWT — extracted from `Authorization: Bearer <token>` header
- **Cache**: SQLite TTL cache (`ai/sqlite_cache.py`) — reduces AI calls, survives restarts. Default TTL 600s (env `CACHE_TTL_SECONDS`).

### Running
```bash
cd mealmind-api
uvicorn main:app --reload
# or via Procfile: web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Environment Variables (`mealmind-api/.env`)
| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase service-role key |
| `ALLOWED_ORIGINS` | CORS origins, comma-separated |
| `CACHE_TTL_SECONDS` | AI response cache TTL (default 600) |
| `PEXELS_API_KEY` | Pexels image search API key (optional) |

### Router/Endpoint Map

| Prefix | File | Description |
|---|---|---|
| `GET /` | `main.py` | Health check |
| `POST /meals/suggest` | `routers/meals.py` | Legacy 6-meal suggestions (no ingredients/steps) |
| `POST /meals/generate` | `routers/meals.py` | **Primary**: slot-aware rich meal plan (ingredients, steps, macros, tags) |
| `POST /meals/swap` | `routers/meals.py` | Swap one slot in an existing plan |
| `GET /meals/history` | `routers/meals.py` | User's past meal history (requires auth) |
| `POST /recipes/parse` | `routers/recipes.py` | Parse recipe from URL (rate-limited 20/hr per IP) |
| `POST /recipes/generate` | `routers/recipes.py` | Generate full recipe for a named dish (rate-limited 30/hr per user) |
| `POST /recipes/translate` | `routers/recipes.py` | Batch-translate text strings to Chinese |
| `POST /recipes/save` | `routers/recipes.py` | Save recipe to user account |
| `GET /recipes/saved` | `routers/recipes.py` | List user's saved recipes |
| `GET /recipes/{id}` | `routers/recipes.py` | Get single saved recipe |
| `PUT /recipes/{id}` | `routers/recipes.py` | Update saved recipe |
| `DELETE /recipes/{id}` | `routers/recipes.py` | Delete saved recipe |
| `GET /pantry/` | `routers/pantry.py` | Get user pantry |
| `POST /pantry/` | `routers/pantry.py` | Replace entire pantry |
| `DELETE /pantry/{name}` | `routers/pantry.py` | Delete one pantry item |
| `GET /profile/` | `routers/profile.py` | Get health profile |
| `PUT /profile/` | `routers/profile.py` | Upsert health profile |
| `POST /shopping/generate` | `routers/shopping.py` | Generate shopping list from recipes minus pantry |
| `PATCH /recipes/{id}/labels` | `routers/recipes.py` | Update recipe labels (favorite, mine, etc.) |
| `GET /images/search` | `routers/images.py` | Image search — Wikipedia first, Pexels fallback (returns `{url}`) |

### AI Layer (`ai/`)

**`ai/prompts.py`** — All prompt templates:
- `meal_suggestion_prompt(filters, language)` — legacy 6-meal suggestions
- `meal_generate_prompt(filters, language)` — rich slot-based plan; handles `required_ingredients` enforcement (see Tag Filtering section below)
- `generate_recipe_prompt(dish_name, language, servings)` — full recipe by dish name
- `recipe_parse_prompt(html)` — extract recipe from scraped HTML
- `shopping_list_prompt(recipes, pantry, language)` — de-duplicated shopping list with pantry subtraction
- `translate_prompt(texts)` — batch English→Chinese translation

**`_tag_note()`** — Injected into every prompt that returns recipes. Instructs AI to produce **as many English tags as needed** (no upper limit) covering: key ingredients (each as its own tag), dietary labels, flavour profile, cooking style, occasion/lifestyle. Tags are always English; the frontend translates them via `TAG_ZH` lookup table in `constants/filters.ts`.

**`ai/claude.py`** — Async wrappers around the Gemini client:
- `suggest_meals(filters)` → `(list, cached_bool)`
- `generate_meal_plan(filters)` → `(dict, cached_bool)` — raises `ValueError` if AI returns `{"error": "no_match", ...}` (unsatisfiable required tags)
- `parse_recipe(html, language)` → `dict`
- `generate_recipe_by_name(dish_name, language, servings, force_refresh)` → `dict` (cached 7 days; `force_refresh=True` bypasses cache — used by the Regenerate button)
- `generate_shopping_list(recipes, pantry, language)` → `dict`
- `swap_meal(slot, current_plan, filters)` → `dict` (filters include cuisine, flavour, max_prep_time_mins, required_ingredients, meal_style)
- `translate_texts(texts)` → `list[str]`

Internal helpers:
- `_generate(prompt, max_tokens)` — calls Gemini with `response_mime_type="application/json"` enforced; tries primary model then falls back to secondary on quota errors
- `_generate_text(prompt, max_tokens)` — same fallback logic but **no JSON mode**; used only by `translate_texts()` which parses numbered plain-text lines
- `_call(prompt, config)` — shared model-call + fallback implementation
- `GeminiTransientError` — tuple `(ClientError, ServerError)` used by routers to catch transient AI failures and return 503

**`ai/sqlite_cache.py`** — MD5-keyed SQLite TTL cache + rate-limit counters.

### Data Models (`db/models.py`)

Key models:
- `HealthProfile` — age, sex, weight_kg, height_cm, activity_level, health_goals, dietary_restrictions, allergies, calorie_goal, protein_goal_g, use_imperial, cuisine_preferences, flavour_preference, preferred_max_prep_mins
- `MealGenerateRequest` — profile, pantry, cuisine_preference, max_prep_time_mins, language, recent_ratings, servings, slots, flavour_preference, **required_ingredients** (comma-separated tags/ingredients the user requires), meal_style
- `GeneratedMeal` — slot, name, cuisine, description, prep_time_mins, calories_per_serving, difficulty, components (vegetable/protein/staple), uses_pantry_items, tags, ingredients, steps, protein_g, carbs_g, fat_g, fiber_g
- `Recipe` — title, servings, prep_time_mins, calories_per_serving, ingredients (list of `Ingredient`), steps, tags, warnings, source_url, source_name
- `MealFilter` — legacy model for `/meals/suggest`

### Database Tables (Supabase)
| Table | Purpose |
|---|---|
| `pantry` | User's pantry items (user_id, name) |
| `saved_recipes` | Full recipe JSON per user |
| `meal_history` | Daily meal batches (user_id, date, meals JSON) |
| `user_profiles` | Health profile per user |
| `user_preferences` | Legacy preferences (largely superseded by user_profiles) |
| `shopping_lists` | (Saved shopping lists — not actively used by the app) |

---

## Frontend — `MealMind/`

### Stack
- **Expo SDK 54**, React Native 0.81, React 19
- **Routing**: Expo Router (file-based, `app/` directory)
- **State**: Zustand with `persist` (AsyncStorage) — `store/useAppStore.ts`
- **API**: Axios — `services/api.ts`; base URL from `EXPO_PUBLIC_API_URL`
- **Auth**: Supabase JS client (`lib/supabase.ts`); JWT cached in `setAuthToken()`

### Running
```bash
cd MealMind
npx expo start        # Metro dev server
npx expo start --ios  # iOS simulator
npx expo start --web  # browser
```

### Environment Variables (`MealMind/.env`)
| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Backend base URL (e.g. `http://localhost:8000`) |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

### Screen Map

| File | Route | Description |
|---|---|---|
| `app/index.tsx` | `/` | Splash / root redirect |
| `app/onboarding.tsx` | `/onboarding` | First-run profile setup |
| `app/auth/sign-in.tsx` | `/auth/sign-in` | Email + password sign-in |
| `app/auth/sign-up.tsx` | `/auth/sign-up` | Registration |
| `app/auth/forgot-password.tsx` | `/auth/forgot-password` | Password reset |
| `app/(tabs)/discover.tsx` | `/(tabs)/discover` | **Main screen** — meal plan generation, filters, meal cards |
| `app/(tabs)/recipes.tsx` | `/(tabs)/recipes` | Saved recipes, meal history, AI recipe generation |
| `app/(tabs)/pantry.tsx` | `/(tabs)/pantry` | Pantry management + shopping list generation |
| `app/(tabs)/shopping.tsx` | `/(tabs)/shopping` | Shopping list view |
| `app/(tabs)/history.tsx` | `/(tabs)/history` | Past meal history |
| `app/(tabs)/profile.tsx` | `/(tabs)/profile` | Health profile, dietary preferences, language toggle |
| `app/meal/[id].tsx` | `/meal/[id]` | Deep-link meal detail |
| `app/recipe/upload.tsx` | `/recipe/upload` | Recipe import from URL |

### Key Components
- `MealSlotCard` (in `discover.tsx`) — breakfast/lunch/dinner card with recipe detail modal, ingredient cart toggle, confirm/save/swap actions, macro display, serving scaler
- `MealCard` (`components/MealCard.tsx`) — compact card used in history/recipes tabs
- `FindRecipeModal` (`components/FindRecipeModal.tsx`) — search modal for recipe discovery
- `PantryTagPicker` (`components/PantryTagPicker.tsx`) — pantry item multi-select
- `IngredientRow` (`components/IngredientRow.tsx`) — ingredient list item with cart toggle
- `NetworkBanner` — offline indicator
- `ErrorBanner`, `EmptyState` — common UI utilities

### State (`store/useAppStore.ts`)
Persisted to AsyncStorage under key `wotoeat-store`. Fields:
- `profile` — HealthProfile
- `language` — `"en" | "zh"`
- `hasOnboarded` — boolean
- `dailyPlan` / `planDate` — today's generated meal plan + date (stale detection)
- `ratings` — `Record<mealName, "up"|"down">` (used to avoid re-suggesting disliked meals)
- `selectedRecipes` — recipes confirmed for shopping list generation
- `pantry` — local cache of pantry items
- `shoppingList` — current shopping list (grouped)
- `recipeLabels` — `Record<recipeId, label[]>` for favoriting/tagging saved recipes
- `servings` / `planServings` — user preferred servings + the servings count the current plan was generated for
- `confirmedSlots` — which meal slots have been confirmed today

### Services (`services/api.ts`)
All HTTP via Axios instance with:
- Auth interceptor: injects `Authorization: Bearer <token>` from `_authToken` cache or `supabase.auth.getSession()`
- 401 retry: refreshes session once and retries
- 429 retry: exponential backoff up to 3 attempts

Key functions: `generateMeals`, `swapMeal`, `suggestMeals`, `getMealHistory`, `parseRecipe`, `generateRecipeByName`, `saveRecipe`, `getSavedRecipes`, `updateRecipe`, `deleteRecipe`, `updateRecipeLabels`, `generateShoppingList`, `getPantry`, `replacePantry`, `deletePantryItem`, `translateBatch`, `getProfile`, `saveProfile`.

---

## Tag System

### How Tags Work End-to-End

1. **Generation**: Every AI call that returns a meal/recipe includes `_tag_note()` in the prompt, which instructs the model to produce 8–12 English tags covering key ingredients, dietary labels, flavour, cooking style, and occasion.

2. **Display**: Tags appear on the meal detail modal. Tapping a tag auto-adds it to the "Include tags" filter and opens the filter panel.

3. **Tag-based Filtering**: In the Discover screen filter panel, users can type tags/ingredients into the "Include tags" field. These are stored in `requiredIngredients` (local state). When generating a plan, they are joined with any selected pantry items into a comma-separated string and sent to the backend as `required_ingredients`.

4. **Enforcement (backend)**: `meal_generate_prompt` has a CRITICAL block when `required_ingredients` is set. The prompt explicitly instructs the AI that:
   - Every dish MUST contain those ingredients and have those exact terms in its `tags` list.
   - If NO real dish can satisfy ALL required tags, the AI must return `{"error": "no_match", "message": "..."}` instead of a meals array.
   - `generate_meal_plan` in `claude.py` detects the `no_match` error and raises `ValueError`.
   - The router returns HTTP 422 with the error message.
   - The frontend shows: "No dish can satisfy all selected tags. Try removing one or more filters."

5. **Translation**: Tags are always English in the DB and AI responses. The frontend translates them for Chinese users using the `TAG_ZH` dictionary in `constants/filters.ts`. The `translateTag(tag, language)` function handles this.

### Tag Translation Table
`TAG_ZH` in `constants/filters.ts` covers: nutrition labels, dietary labels, flavour descriptors, cooking styles, occasion/lifestyle tags, main ingredient names, and cuisine names.

---

## Discover Screen — Meal Generation Flow

1. User taps the generate button (or modifies filters then generates).
2. `handleGenerate()` in `discover.tsx`:
   - Resolves target slot (always exactly **one**): "Auto" → infers from current hour (5–11 → breakfast, 11–15 → lunch, else dinner); otherwise uses the single selected slot.
   - Calls `generateMeals(profile, pantry, cuisines, maxTime, language, ratings, servings, [slot], flavour, requiredIngredients+pantryItems, mealStyle)`.
3. Backend `POST /meals/generate` → `generate_meal_plan(filters)` → Gemini (`gemini-2.5-flash`, 6000 token limit).
4. Response merges the new meal into `dailyPlan` in the store (replaces that slot if it already existed).
5. Meal cards render with slot colour coding (breakfast=amber, lunch=green, dinner=indigo).

**One meal per generation.** The meal type selector is single-select — tapping a slot deselects any previous choice. Multiple slots in one request are not supported.

### Meal Card Actions
- **Swap** (thumbs-down): calls `swapMeal` with current plan + all current meal names marked as disliked.
- **Save** (bookmark): calls `saveRecipe` → stores in Supabase `saved_recipes`.
- **Confirm** (checkmark): adds meal to `selectedRecipes` in store; auto-adds missing ingredients to shopping list.
- **Tag tap**: adds tag to required filters, opens filter panel.
- **Detail modal**: tap card body → bottom sheet with macros, full ingredients (scalable by serving stepper), steps, image from Pexels.

### Filter Options
- **Meal type**: Auto (inferred), Breakfast, Lunch, Dinner — **single-select**, one meal generated per tap
- **Meal style**: Full Meal vs Main Dish (Main Dish enforces no carbohydrate staples — protein/veg only, suitable to eat alongside rice)
- **Include tags**: text input accumulator (chip-based); combined with pantry selections → `required_ingredients`
- **From pantry**: tap pantry items to require them in the meal
- **Cuisine**: multi-select from `CUISINES` list
- **Flavour**: single-select from `FLAVOUR_OPTIONS` (spicy, sweet, savory, mild, sour)
- **Prep time**: preset caps (any, ≤15min, ≤30min, ≤1hr)

---

## Localisation (i18n)

- Language toggle: English / 简体中文
- `language` state in store; changing it clears the daily plan.
- Static strings: `locales/en.ts` and `locales/zh.ts` — accessed via `useTranslation()` hook.
- Dynamic strings (AI-generated meal names, descriptions, ingredients, steps): translated on-demand by `useDynamicTranslation.ts` → calls `POST /recipes/translate` → Gemini (plain-text mode via `_generate_text`).
- Tags: always English from AI; translated client-side via `TAG_ZH` lookup.
- AI prompts: `_LANG_INSTRUCTION` in `prompts.py` switches the AI's output language for meal names/descriptions when `language === "zh"`.

---

## Recipes Tab Features

- **Saved**: lists user's saved recipes (from `saved_recipes` table); supports search, edit (title, prep time, calories, servings, ingredients, steps, tags), delete.
- **Liked**: saved recipes labelled "favorite".
- **Mine**: saved recipes labelled "mine".
- **History**: past meal batches from `meal_history` table; grouped by day, deduplicated by name. Meals can be expanded to view tags/difficulty, and a full recipe can be generated on demand.
- Recipe detail modal: full ingredient list with serving scaler, step-by-step instructions, tags, macros.

---

## Pantry & Shopping

### Pantry Tab
- Add items (name + unit + quantity).
- Items sync to Supabase `pantry` table on save.
- Local cache in `useAppStore.pantry`.
- "Generate Shopping List" button: takes `selectedRecipes` from store → calls `POST /shopping/generate` → backend subtracts pantry items semantically (via `_MATCHING_RULES` prompt) → grouped shopping list.

### Shopping Tab
- Displays `shoppingList` from store (grouped by category).
- Items can be checked off (`toggleShoppingItem`).
- Share as text, clear list.
- Also lets you regenerate from confirmed meals.

### Shopping List Flow
- Auto-population: confirming a meal card in Discover auto-adds missing ingredients to the shopping list (by slot-namespaced category so items from different slots don't collide).
- AI generation: pantry tab generates a de-duplicated, category-grouped list from all confirmed recipes, semantically subtracting pantry contents.

---

## Image Search

- `services/imageSearch.ts` → calls `GET /images/search?q=<meal name>`.
- Backend proxies to Pexels API; returns `{url}` or `{url: null}`.
- Images shown as hero in the meal detail modal.

---

## Auth Flow

- Supabase email+password auth.
- `app/_layout.tsx` listens to `supabase.auth.onAuthStateChange`; calls `setAuthToken(token)` to cache the JWT.
- Unauthenticated users can still generate meals and parse recipes (endpoints with `get_optional_user_id`).
- Authenticated-only: saving recipes, history, pantry, profile (`require_user_id`).
- Onboarding: first-run screen (`hasOnboarded` flag in store) prompts profile setup before sending to the main tabs.
- Sign-out calls `supabase.auth.signOut()` then `resetAll()` to clear store.

---

## Serving Size Scaler

- `servings` in the store is the user's default preference.
- `planServings` tracks the servings count used when the current plan was generated.
- Meal card detail modal has a stepper (`displayServings`) that scales ingredient amounts relative to `planServings`.
- `scaleIngredientStr()` parses leading numbers in ingredient strings (e.g. "100g chicken") and applies the scale factor; non-numeric quantities get a `~` prefix.

---

## Meal Ratings / Dislike

- Rating a meal "down" and swapping calls `swapMeal`, which passes all current plan meals + prior disliked meals to the prompt so none are re-suggested.
- Ratings stored in `useAppStore.ratings`; sent as `recent_ratings: Record<name, "up"|"down">` on next generation.

---

## Stale Plan Detection

- `planDate` stored in the store alongside `dailyPlan`.
- On every app launch, `_layout.tsx` auto-clears the plan if `planDate !== today` (no banner — just cleared immediately).
- The discover tab also showed a stale-plan banner (still visible within a session if date flips mid-session).

---

## Known Patterns / Conventions

- **Backend error handling**: `ValueError` → HTTP 422; `GeminiTransientError` (ClientError/ServerError) → HTTP 503; uncaught exceptions → HTTP 500.
- **Cache key**: MD5 of sorted JSON of the filters dict (excluding `recent_ratings` for plan cache keys to avoid thrashing).
- **AI JSON mode**: `_generate()` always sets `response_mime_type="application/json"` on the Gemini config — this is required for reliable JSON output. `_generate_text()` omits it and is used only for translation.
- **Gemini models**: primary `gemini-2.5-flash`, fallback `gemini-2.5-flash-lite`. Both `gemini-2.0-flash` and `gemini-2.0-flash-lite` are deprecated and return 404. Do not revert to 2.0 models.
- **Token limits**: `generate_meal_plan` and `swap_meal` use 6000 tokens; `generate_recipe_by_name` and `parse_recipe` use 6000 tokens. A single rich meal response is ~5–6k chars — lower limits cause truncated JSON and 422 errors.
- **CORS**: `main.py` allows `GET, POST, PUT, PATCH, DELETE, OPTIONS`. `PATCH` is required for `/recipes/{id}/labels`.
- **Pantry replace**: frontend calls `POST /pantry/` (not `/pantry/replace`) with body `{ items: [...] }`.
- **AI JSON cleaning**: `_clean_json()` strips markdown fences that some models prepend.
- **Semantic pantry matching**: `_MATCHING_RULES` in `prompts.py` teaches the AI to match ingredient types (e.g. "巴沙鱼" satisfies "white fish").
- **Shopping list category**: meals use `{slot}-{meal.name}` as the shopping list category key to avoid name collisions between slots.
- **Tags always English**: the AI is instructed to return tags in English regardless of response language. Frontend translates via `TAG_ZH` at render time.
- **No calories displayed on card header**: calorie/kcal display is only visible inside the info panel (tap ℹ️ icon). Prep time is still shown in the header.
- **Swap respects filters**: `handleSwap` passes cuisine, flavour, maxTime, requiredIngredients, and mealStyle to the backend swap endpoint.
- **Regenerate bypasses cache**: `generateRecipeByName` accepts `force_refresh=True`; the Regenerate button (FindRecipeModal) and history Generate button both pass this flag.
- **Web SPA routing**: `MealMind/vercel.json` includes a catch-all rewrite to `index.html` so direct URL loads (e.g. `/discover`) work without a 404.
- **useTranslation type cast**: `locales` map is cast `as any` because `zh` has different string literals than `typeof en`; both files have identical keys.
