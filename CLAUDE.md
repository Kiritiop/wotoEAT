# wotoEAT — Project Reference
Update this document every time changes happen, adapt accordingly

## Overview

wotoEAT is an AI-powered meal-planning app that answers the daily question **"what should I cook with what I have?"** It generates meals one at a time (a growing **meal stream** for the day — there is **no daily plan**) from the user's health profile, pantry contents, and filters, then turns confirmed meals into a shopping list with pantry items semantically subtracted. Meals already shown today are never re-suggested. Users can also save favourite recipes, generate full recipes by dish name, parse recipes from external URLs, and **share meals/recipes via public web links**.

### The core loop (as implemented)

```
health profile (local store; server user_profiles row read once at app startup)
  + pantry names + filters (cuisine, flavour, prep time, required tags, meal style)
  → POST /meals/generate          (avoid_meals = today's seen list, so no repeats;
                                   meal appended to the store `meals` stream;
                                   meal_history persisted iff authed && not cached)
  → user confirms a meal card     [client-only: selectedRecipes; missing ingredients
                                   auto-added to shoppingList store; NO backend call]
  → POST /shopping/generate       (AI subtracts pantry semantically; "current" list
                                   synced via PUT /shopping/current, debounced)
  → user shops, checks items off  [visual only]
  → pantry                        [inputs: manual entry + receipt scanning]

Sharing (orthogonal): meal/recipe → POST /share → public id → /share/<id> web page.
```

**No daily plan.** Each Generate (or per-card swap/"next") appends a meal to the
day's `meals` stream; the meal-type chips (breakfast/lunch/dinner) are just an
optional filter telling the AI what kind of dish to make. The stream and its
`seenMeals` exclusion list reset at the date rollover (store `mealsDate`).
**Default servings is 1** across meal generation, recipe-by-name, and the new-recipe form.

### Where the loop is one-directional today
1. ~~Pantry input is manual-only~~ — **closed by Receipt Scanning** (see section below): photographing a grocery receipt extracts food items and merges them into the pantry additively.
2. **Nothing consumes/decrements the pantry** after cooking — it's a static name list.
3. **Shopping check-offs never write back to the pantry** (toggle flips `checked` only).
4. **meal_history is write-only** — displayed in History/Recipes tabs, never fed back into generation.
5. **Ratings are device-local** (Zustand persist), sent per-request as `recent_ratings`, never persisted server-side.

---

## Repository Layout

```
wotoEAT/
├── wotoeat-app/          # Expo React Native frontend (iOS, Android, Web)
└── wotoeat-api/      # FastAPI Python backend
```

## Deployment

- **Backend → Railway** (`wotoeat-api/`, Procfile: uvicorn). Backend env vars live in the Railway service settings. `SUPABASE_KEY` there must be the **service-role** key — the anon key makes pantry writes fail with RLS errors (silently, in the fire-and-forget paths).
- **Web frontend → Vercel** (`wotoeat-app/`, build = `vercel-build` script → `expo export --platform web`). Vercel needs only `EXPO_PUBLIC_API_URL` (Railway backend URL), `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`. **Never add the service-role key to Vercel** — all `EXPO_PUBLIC_*` values are baked into the public JS bundle.
- **Native builds → EAS** (`build:ios` / `build:android` scripts). Changes to native permissions in app.json (e.g. camera for receipt scanning) only take effect in a fresh EAS build; Expo Go and web are unaffected. **⚠ eas.json only bakes `EXPO_PUBLIC_API_URL`** — `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_WEB_URL` must be provided as EAS environment variables (`eas env:create`, or added to the eas.json `env` blocks) or a store build ships with **auth completely broken** (empty Supabase config) and native share links rendering as relative paths. Verify with `eas env:list` before building.

---

## Backend — `wotoeat-api/`

### Stack
- **Python 3.12+**, FastAPI, Uvicorn
- **AI**: Groq API (`llama-3.3-70b-versatile`) via `groq` async client
- **Database**: Supabase (Postgres) via `supabase-py` with service-role key
- **Auth**: Supabase JWT — extracted from `Authorization: Bearer <token>` header
- **Cache**: SQLite TTL cache (`ai/sqlite_cache.py`) — reduces AI calls, survives restarts. Default TTL 3600s (env `CACHE_TTL_SECONDS`).

### Running
```bash
cd wotoeat-api
uvicorn main:app --reload
# or via Procfile: web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Tests (`wotoeat-api/tests/`)
Plain runnable scripts (no pytest dependency); each exits non-zero on failure.
- **Offline, deterministic** (no network / LLM / key — safe in CI):
  - `venv/bin/python tests/test_scraper_ssrf.py` — locks the SSRF guard (loopback/private/link-local/metadata/bad-scheme blocked, public allowed). **Keep green if you touch `_assert_public_http_url`.**
  - `venv/bin/python tests/test_clean_json.py` — `_clean_json`/`_NUM_EXPR_RE`: resolves bare arithmetic in numeric positions, never mangles digits inside strings (URLs, "1/2 cup").
  - `venv/bin/python tests/test_models.py` — Pydantic validators that sanitize LLM output: `Ingredient.coerce_amount` (fraction parsing, non-positive/unparseable → None) and `ScannedItem.empty_to_none` ("null"/"none"/"" → None).
  - `venv/bin/python tests/test_profile_constraints.py` — `_profile_constraints_block`: allergies/restrictions emit the ABSOLUTE-hard-constraint block + `no_match` override; goals/calorie/protein emit the tailoring block; empty/blank profiles emit nothing; and the block is actually injected into `meal_generate_prompt`. Guards that meal generation can't silently stop honouring allergies.
- **Live-LLM** (needs `GROQ_API_KEY`, mild flake): `venv/bin/python tests/test_receipt_normalize.py` — receipt Stage-2 prompt contract.

### Environment Variables (`wotoeat-api/.env`)
Copy `wotoeat-api/.env.example` → `.env` and fill in (the example lists exactly the
vars the code reads via `os.getenv`). Note: `wotoeat-api/.gitignore` needs the
`!.env.example` negation or the template is silently ignored (it has its own `.env.*`).

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Groq API key (llama-3.3-70b-versatile) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase service-role key |
| `SUPABASE_JWT_SECRET` | **Required for legacy (HS256) Supabase projects** — the shared JWT secret used to verify user access tokens in `routers/auth.py`. Not needed for projects using asymmetric (ES256/RS256) signing keys (those verify against the JWKS at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`). If a project is on HS256 and this is unset, all authenticated requests return 401 (fail-closed). |
| `ALLOWED_ORIGINS` | CORS origins, comma-separated |
| `CACHE_TTL_SECONDS` | AI response cache TTL (default 3600) |
| `PEXELS_API_KEY` | Pexels image search API key (image-cascade fallback; set in Railway) |
| `UNSPLASH_ACCESS_KEY` | Unsplash access key (optional last-resort image fallback) |
| `GROQ_VISION_MODEL` | Optional override of the receipt-scan vision model (default `meta-llama/llama-4-scout-17b-16e-instruct`; swap here if Groq deprecates it) |
| `GROQ_TEXT_MODEL` | Optional override of the main text model (default `llama-3.3-70b-versatile`) — powers all meal/recipe/shopping generation; swap here if Groq deprecates it |

### Router/Endpoint Map

| Prefix | File | Description |
|---|---|---|
| `GET /` | `main.py` | Health check |
| `POST /meals/generate` | `routers/meals.py` | **Primary**: slot-aware rich meal plan (ingredients, steps, macros, tags). Optional auth; rate-limited 150/hr per identity (shared `meal-ai` budget with swap) |
| `POST /meals/swap` | `routers/meals.py` | Swap one slot in an existing plan. Optional auth; shares the 150/hr `meal-ai` budget |
| `GET /meals/history` | `routers/meals.py` | User's past meal history (requires auth) |
| `POST /recipes/parse` | `routers/recipes.py` | Parse recipe from URL (rate-limited 20/hr per IP) |
| `POST /recipes/generate` | `routers/recipes.py` | Generate full recipe for a named dish (rate-limited 30/hr per user) |
| `POST /recipes/save` | `routers/recipes.py` | Save recipe to user account |
| `GET /recipes/saved` | `routers/recipes.py` | List user's saved recipes |
| `GET /recipes/{id}` | `routers/recipes.py` | Get single saved recipe |
| `PUT /recipes/{id}` | `routers/recipes.py` | Update saved recipe |
| `DELETE /recipes/{id}` | `routers/recipes.py` | Delete saved recipe |
| `GET /pantry/` | `routers/pantry.py` | Get user pantry |
| `POST /pantry/` | `routers/pantry.py` | Replace entire pantry |
| `DELETE /pantry/{name}` | `routers/pantry.py` | Delete one pantry item |
| `POST /pantry/scan-receipt` | `routers/pantry.py` | Extract food items from a receipt photo (requires auth; rate-limited 10/hr per user; annotate-only — writes nothing) |
| `GET /profile/` | `routers/profile.py` | Get health profile |
| `PUT /profile/` | `routers/profile.py` | Upsert health profile |
| `POST /shopping/generate` | `routers/shopping.py` | Generate shopping list from recipes minus pantry (also best-effort inserts a `shopping_lists` history row if authed — never read back). Optional auth; rate-limited 40/hr per identity (`shopping-ai`) |
| `GET /shopping/current` | `routers/shopping.py` | Get the persisted "current" shopping list (requires auth; read on app startup) |
| `PUT /shopping/current` | `routers/shopping.py` | Upsert the "current" shopping list (requires auth; debounced 2s save from the Shopping tab). Cross-device sync via AppState in `shopping.tsx`: going to background **flushes** a pending debounced save (JS timers don't run backgrounded); returning to foreground **drops any stale pending save and re-fetches** the server's latest so another device's check-offs aren't clobbered. |
| `GET /shopping/history` | `routers/shopping.py` | List saved shopping lists (optional auth; **no frontend caller**) |
| `PATCH /recipes/{id}/labels` | `routers/recipes.py` | Update recipe labels (favorite, mine, etc.) |
| `GET /images/search` | `routers/images.py` | Food image cascade — TheMealDB → Pexels → Unsplash (returns `{url}`; SQLite-cached; rate-limited 100 novel lookups/hr per IP) |
| `POST /share` | `routers/share.py` | Create a public share (`{kind:"recipe"\|"meal", payload}`) → `{id}`; optional auth; rate-limited 30/hr per client |
| `GET /share/{id}` | `routers/share.py` | **Public, no auth** — fetch a shared meal/recipe payload (404 if missing) |

### AI Layer (`ai/`)

**`ai/prompts.py`** — All prompt templates:
- `meal_generate_prompt(filters, language)` — rich slot-based plan; handles `required_ingredients` enforcement (see Tag Filtering section below). Calls `_profile_constraints_block(profile)` to surface the user's **allergies + dietary restrictions as ABSOLUTE hard constraints** (override cuisine/flavour/pantry/required-tags; a required tag that conflicts with safety returns `no_match`) and their **health goals / calorie / protein targets** as dish-shaping guidance — placed right after the FILTERS JSON so the model doesn't treat them as just another buried field. Also enforces `max_prep_time_mins` as a hard cap on `prep_time_mins`. Both generate and swap go through this prompt, so both honour the constraints.
- `generate_recipe_prompt(dish_name, language, servings)` — full recipe by dish name
- `recipe_parse_prompt(html)` — extract recipe from scraped HTML
- `shopping_list_prompt(recipes, pantry, language)` — de-duplicated shopping list with pantry subtraction
- `receipt_transcribe_prompt()` — receipt scan stage 1: vision model transcribes the photo verbatim into `{"lines": [...]}`
- `receipt_normalize_prompt(lines, pantry, language)` — receipt scan stage 2: raw lines → normalized food items (`name` always canonical English + `name_zh` Chinese display name; `language` param intentionally unused); uses `_RECEIPT_MATCHING_RULES` (semantic cross-language matching examples adapted from `_MATCHING_RULES`, without its shopping-list action bullets)

**`_tag_note()`** — Injected into every prompt that returns recipes. Instructs AI to produce **as many English tags as needed** (no upper limit) covering: key ingredients (each as its own tag), dietary labels, flavour profile, cooking style, occasion/lifestyle. Tags are always English; the frontend translates them via `TAG_ZH` lookup table in `constants/filters.ts`.

**`ai/claude.py`** — Async wrappers around the Groq client (`llama-3.3-70b-versatile`):
- `generate_meal_plan(filters)` → `(dict, cached_bool)` — raises `ValueError` if AI returns `{"error": "no_match", ...}` (unsatisfiable required tags)
- `parse_recipe(html)` → `dict` (no `language` arg — recipes are parsed in their source language and localized client-side by the dynamic-translation layer; `ParseRecipeRequest.language` is still accepted for API-contract compatibility but unused)
- `generate_recipe_by_name(dish_name, language, servings, force_refresh)` → `dict` (cached 7 days; `force_refresh=True` bypasses cache — used by the Regenerate button)
- `generate_shopping_list(recipes, pantry, language)` → `dict`
- `swap_meal(slot, current_plan, filters)` → `dict` (`current_plan` optional; exclusion is driven by `filters["avoid_meals"]` = today's seen list; filters also include cuisine, flavour, max_prep_time_mins, required_ingredients, meal_style)
- `transcribe_receipt(image_b64)` → `list[str]` — receipt scan stage 1 on `_VISION_MODEL`; raises `ValueError("no_receipt"|"unreadable_receipt")`
- `normalize_receipt_items(lines, pantry_names, language)` → `list[dict]` — receipt scan stage 2 on the text model; nulls any hallucinated `matches_pantry` not exactly in `pantry_names`; raises `ValueError("no_food_items"|"unreadable_receipt")`
- `scan_receipt(image_b64, pantry_names, language)` → `{"items": [...]}` — orchestrates both stages; **never cached** (receipts are unique)

Internal helpers:
- `_generate(prompt, max_tokens, temperature=0.7)` — calls Groq; used for all JSON-returning functions. **Meal generation + swap pass `temperature=0.5`** (lower than the 0.7 default) so the model returns conventional, real dishes instead of inventing "creative" ones. `meal_generate_prompt` also has an **AUTHENTICITY block** forbidding invented/fusion/filler-named dishes and generic non-dishes ("Grilled Chicken with Vegetables").
- `_create_with_retry(**kwargs)` — wraps the Groq completion call with a bounded retry (up to 3 attempts) on `RateLimitError`, honouring the `Retry-After` header (skips the wait if >8s so it never outlives the client's 45s timeout). All three `_generate*` helpers route through it. Recovers the bursty 429→503 failures Groq throws when several meal/recipe calls land in the same minute.
- `_meal_max_tokens(n_slots)` — `min(6000, 1200 + 2400*n_slots)`. Right-sizes the meal generation/swap completion budget so Groq's TPM reservation isn't blown (a single meal needs ~1.5–2k output tokens, not 6000). See Token limits below.
- `_generate_text(prompt, max_tokens)` — calls Groq with temperature 0.3; used by receipt normalization
- `_generate_vision(prompt, image_b64, max_tokens)` — calls `_VISION_MODEL` (env `GROQ_VISION_MODEL`, default Llama 4 Scout) with temperature 0.2 and a base64 JPEG data-URL content part
- `GroqTransientError` — tuple `(RateLimitError, APIConnectionError, APIStatusError)` used by routers to catch transient AI failures and return 503

**`ai/sqlite_cache.py`** — MD5-keyed SQLite TTL cache + rate-limit counters.

### Data Models (`db/models.py`)

Key models:
- `HealthProfile` — age, sex, weight_kg, height_cm, activity_level, health_goals, dietary_restrictions, allergies, calorie_goal, protein_goal_g, use_imperial, cuisine_preferences, flavour_preference, preferred_max_prep_mins
- `MealGenerateRequest` — profile, pantry, cuisine_preference, max_prep_time_mins, language, recent_ratings, servings (default **1**), slots, flavour_preference, **required_ingredients** (comma-separated tags/ingredients the user requires), meal_style, **avoid_meals** (names already shown today — never re-suggested; IS part of the meal-plan cache key)
- `SwapMealRequest` — same swap filters; `current_plan` now **optional** (exclusion is driven by `avoid_meals`)
- `CreateShareRequest` / `CreateShareResponse` / `SharedItem` — sharing: `{kind:"recipe"|"meal", payload}` in, `{id}` out; `SharedItem` = `{kind, payload}`
- `GeneratedMeal` — slot, name, cuisine, description, prep_time_mins, calories_per_serving, difficulty, components (vegetable/protein/staple), uses_pantry_items, tags, ingredients, steps, protein_g, carbs_g, fat_g, fiber_g
- `Recipe` — title, servings, prep_time_mins, calories_per_serving, ingredients (list of `Ingredient`), steps, tags, warnings, source_url, source_name
- `ScanReceiptRequest` / `ScannedItem` / `ScanReceiptResponse` — receipt scanning. `ScannedItem.name` is canonical English (what gets stored); `name_zh` is the Simplified Chinese display name (display-only); `quantity` is display-only (never persisted — pantry is name-only); `matches_pantry` is the verbatim existing pantry item the scanned item duplicates, or null.

### Database Tables (Supabase)
| Table | Purpose |
|---|---|
| `pantry` | User's pantry items: `(id, user_id, name, category, updated_at)`, `UNIQUE(user_id, name)`. `category` is an optional display-grouping override (null → derived from name by the frontend); `replace_pantry` persists it. **No quantity/unit columns** exist anywhere in the stack. |
| `saved_recipes` | Full recipe JSON per user |
| `meal_history` | Daily meal batches (user_id, date, meals JSON). Written by suggest/generate/swap **iff authed && response not cached**; read by History/Recipes tabs; never fed back into generation. |
| `user_profiles` | Health profile per user (read once at app startup; generation uses the locally-cached profile sent in the request body) |
| `user_preferences` | **Dead table** — defined in schema.sql only; zero code references. The *feature* (a user's preferred include-ingredients for generation) lives device-local instead: `requiredIngredients`/`selectedPantryItems` persisted in the Zustand store. |
| `daily_plans` | **Dead** — legacy daily-plan era; defined in schema.sql only, zero code references |
| `shopping_lists` | **Partially live**: the `name="current"` row is actively read/written via `GET/PUT /shopping/current`; `POST /shopping/generate` also best-effort inserts history rows that are never read. A partial unique index (`shopping_current_unique`, in schema.sql — **run it in Supabase to apply**) enforces one "current" row per user; the upsert falls back to update on a lost insert race, and reader/updater order by `created_at` asc so they agree on the canonical row. |
| `shared_items` | Public meal/recipe shares: `(id, kind, payload jsonb, user_id nullable, created_at)`. Written by `POST /share` (service-role); read by `GET /share/{id}` (public; RLS policy `shared_public` allows SELECT). `user_id` nullable — anon shares allowed. |

---

## Frontend — `wotoeat-app/`

### Stack
- **Expo SDK 54**, React Native 0.81, React 19
- **Routing**: Expo Router (file-based, `app/` directory)
- **State**: Zustand with `persist` (AsyncStorage) — `store/useAppStore.ts`
- **API**: Axios — `services/api.ts`; base URL from `EXPO_PUBLIC_API_URL`
- **Auth**: Supabase JS client (`lib/supabase.ts`); JWT cached in `setAuthToken()`

### Running
```bash
cd wotoeat-app
npx expo start        # Metro dev server
npx expo start --ios  # iOS simulator
npx expo start --web  # browser
```

### Environment Variables (`wotoeat-app/.env`)
| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Backend base URL (e.g. `http://localhost:8000`) |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `EXPO_PUBLIC_WEB_URL` | Public web base for `/share/<id>` links (Vercel URL). Optional on web (falls back to `window.location.origin`); required for native shares. **Add to Vercel too.** |

### Screen Map

| File | Route | Description |
|---|---|---|
| `app/index.tsx` | `/` | Splash / root redirect |
| `app/onboarding.tsx` | `/onboarding` | First-run profile setup |
| `app/auth/sign-in.tsx` | `/auth/sign-in` | Email + password sign-in |
| `app/auth/sign-up.tsx` | `/auth/sign-up` | Registration |
| `app/auth/forgot-password.tsx` | `/auth/forgot-password` | Password reset |
| `app/(tabs)/discover.tsx` | `/(tabs)/discover` | **Main screen** — meal generation (growing stream, no daily plan), filters, meal cards (tab: "Today") |
| `app/(tabs)/recipes.tsx` | `/(tabs)/recipes` | Saved recipes, meal history, AI recipe generation (tab: "My Recipes") |
| `app/(tabs)/pantry.tsx` | `/(tabs)/pantry` | Pantry management + shopping list generation (tab: "Pantry") |
| `app/(tabs)/profile.tsx` | `/(tabs)/profile` | Health profile, dietary preferences, language toggle (tab: "Profile") |
| `app/(tabs)/shopping.tsx` | `/(tabs)/shopping` | Shopping list view — **hidden tab** (`href: null`), opened via the cart icon on Pantry |
| `app/(tabs)/history.tsx` | `/(tabs)/history` | Past meal history — **hidden tab** (`href: null`), navigated programmatically |
| `app/meal/[id].tsx` | `/meal/[id]` | Meal detail — registered, but **no internal navigation path** (deep-link/URL only) |
| `app/recipe/upload.tsx` | `/recipe/upload` | Recipe import from URL — **reachable via the "Import from URL" button on the Recipes tab** (paste URL → AI parses → save) |
| `app/pantry/scan.tsx` | `/pantry/scan` | Receipt scanning — capture/pick photo → editable review → merge into pantry (opened from the Pantry tab) |
| `app/share/[id].tsx` | `/share/<id>` | **Public read-only** shared meal/recipe view (`GET /share/{id}`); opened from a shared link (web primary, native deep link) |

Only 4 tabs are visible in the tab bar: Today, Pantry, My Recipes, Profile.

### Key Components
- `MealSlotCard` (in `discover.tsx`) — breakfast/lunch/dinner card with recipe detail modal, ingredient cart toggle, confirm/save/swap actions, macro display, serving scaler
- `MealCard` (`components/MealCard.tsx`) — compact card used in history/recipes tabs
- `FindRecipeModal` (`components/FindRecipeModal.tsx`) — search modal for recipe discovery
- `PantryTagPicker` (`components/PantryTagPicker.tsx`) — pantry item multi-select
- `IngredientRow` (`components/IngredientRow.tsx`) — ingredient list item with cart toggle
- `NetworkBanner` — offline indicator
- `ErrorBanner`, `EmptyState` — common UI utilities
- `ScreenHeader` (`components/ui/ScreenHeader.tsx`) — **the shared in-app header**. Render inside a screen's existing `SafeAreaView` (adds no top inset). `variant`-free props: `title` (Pantry/Recipes/Profile/Shopping…) OR `greeting`+`subtitle` (Today), an optional `right` action slot, and `onBack` (shows a back chevron instead of the logo brand mark). Used by every in-app tab/screen so the shell is consistent; the tab screens that use it set `headerShown: false` in `app/(tabs)/_layout.tsx`.
- `PinnedBar` (`components/ui/PinnedBar.tsx`) — bottom-anchored container for a screen's single primary action so it stays in the thumb zone and never scrolls away. Render as the last child of the `SafeAreaView`, after a `flex: 1` ScrollView/List. Used by Today (the Generate FAB).
- **Shared UI kit** (`components/ui/`) — the single source of truth for repeated primitives, so spacing/radius/weight/state can't drift across screens:
  - `Button` — variants `primary` (solid green) / `secondary` (outline) / `ghost` (muted); props `label, icon?, iconRight?, loading?, disabled?, fullWidth?, onPress`. Built-in loading spinner + disabled colour. **Haptics stay with callers** (they fire their own in `onPress`) so it never double-buzzes. Replaced the ~8 ad-hoc "green pill" button styles (landing/onboarding/auth/pantry/shopping so far).
  - `Chip` — selectable pill (`label, active, onPress, onClose?`); one source for meal-type/cuisine/filter/category chips.
  - `SectionLabel` — the uppercase muted label above grouped content (pantry categories, shopping groups, filter sections).
  - `Card` — soft rounded surface (`c.surface` + `radius.md` + `shadows.soft`), optional `onPress`; for list rows / recipe cards / settings sections.

### State (`store/useAppStore.ts`)
Persisted to AsyncStorage under key `wotoeat-store`. Fields:
- `profile` — HealthProfile
- `language` — `"en" | "zh"`
- `hasOnboarded` — boolean
- `meals` / `mealsDate` — today's **meal stream** (growing list of generated meals) + its date; survives same-day restarts, cleared at date rollover (cold start via `onRehydrateStorage`, warm reopen via an AppState listener, auth events date-aware — see Meal Stream Reset) and unconditionally on sign-out
- `seenMeals` — names of every meal shown today; sent as `avoid_meals` so generation/swap never repeats; reset with `meals`
- `ratings` — `Record<mealName, "up"|"down">` (used to avoid re-suggesting disliked meals)
- `selectedRecipes` — recipes confirmed for shopping list generation (confirmation derives from this — no `confirmedSlots`)
- `requiredIngredients` / `selectedPantryItems` — **persisted generation preferences**: the "Include tags" free-text tags and required from-pantry items survive app restarts (they are user preferences, not per-session filter state). Cleared on language change (`requiredIngredients` only — they're language-specific text) and on sign-out. At generate/swap time, stale pantry selections (item since deleted) are filtered out via `livePantryItems` in `discover.tsx`.
- `pantry` — local cache of pantry items
- `shoppingList` — current shopping list (grouped)
- `recipeLabels` — `Record<recipeId, label[]>` for favoriting/tagging saved recipes
- `servings` / `planServings` — user preferred servings (**default 1**) + the servings count the current stream was generated for
- Store actions: `addMeal`, `replaceMeal` (swap, by name), `removeMeal`, `clearMeals`, `addSeenMeals`

### Services (`services/api.ts`)
All HTTP via Axios instance with:
- Auth interceptor: injects `Authorization: Bearer <token>` from `_authToken` cache or `supabase.auth.getSession()`
- 401 retry: refreshes session once and retries
- 429 retry: exponential backoff up to 3 attempts

Key functions: `generateMeals` (now takes `avoid_meals`), `swapMeal` (no `current_plan`; takes `avoid_meals`), `getMealHistory`, `parseRecipe`, `generateRecipeByName`, `saveRecipe`, `getSavedRecipes`, `updateRecipe`, `deleteRecipe`, `updateRecipeLabels`, `generateShoppingList`, `getCurrentShoppingList`, `saveCurrentShoppingList`, `getPantry`, `replacePantry`, `deletePantryItem`, `getProfile`, `saveProfile`, `createShare`, `getShared`, `shareWebUrl`.

---

## Tag System

### How Tags Work End-to-End

1. **Generation**: Every AI call that returns a meal/recipe includes `_tag_note()` in the prompt, which instructs the model to produce as many English tags as the dish requires (no upper limit) covering key ingredients (specific cut/form), dietary labels, flavour, cooking style, and occasion.

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
   - Calls `generateMeals(profile, pantry, cuisines, maxTime, language, ratings, servings, [slot], flavour, requiredIngredients+pantryItems, mealStyle, seenMeals)`.
3. Backend `POST /meals/generate` → `generate_meal_plan(filters)` → Groq (`llama-3.3-70b-versatile`, `_meal_max_tokens(n_slots)` ≈ 3600 for the usual single slot). `avoid_meals` (=`seenMeals`) is in the cache key, so a growing list forces a fresh, non-repeating result.
4. Each returned meal is **appended** to the `meals` stream (`addMeal`) and its name added to `seenMeals` (`addSeenMeals`) — old cards stay visible.
5. Meal cards render newest-first; the meal-type chips filter the visible list. Slot colour coding (breakfast=amber, lunch=green, dinner=indigo) still styles each card.

**One meal per generation.** The meal type selector is single-select — tapping a slot deselects any previous choice. Repeated generation/swap accumulates a stream that never repeats a dish within the day.

### Meal Card Actions
- **Swap** (thumbs-down / "next"): downvotes + calls `swapMeal` with `avoid_meals = seenMeals`, then `replaceMeal`s that card in-place with a never-before-seen dish (old name stays in `seenMeals`).
- **Save** (bookmark): calls `saveRecipe` → stores in Supabase `saved_recipes`.
- **Confirm** (checkmark): adds meal to `selectedRecipes` in store; auto-adds missing ingredients to shopping list.
- **Tag tap**: adds tag to required filters, opens filter panel.
- **Detail modal**: tap card body → bottom sheet with macros, full ingredients (scalable by serving stepper), steps, image from Pexels. Ingredients already in the pantry show a green **"In pantry"** marker (per-ingredient, via `ingInPantry` → `pantryNameMatches`, a **word-aware** matcher: both names are first normalized to canonical English via `toCanonicalEnglish` (exact-match curated reverse map — so an English pantry item matches a Chinese ingredient string in zh mode, e.g. "chicken breast"↔"鸡胸肉", and it can never invent a match); then every word of the shorter name must match a word of the longer one, where a word matches if equal or a ≥4-char prefix — so plurals/morphology still match (tomato↔tomatoes) but loose substrings no longer false-positive (egg≠eggplant, oil≠"boiling water", "soy sauce"≠"fish sauce"); CJK that isn't in the curated map falls back to containment. `missingIngredients` is `!ingInPantry` — the shopping-list auto-add and the badge share one matcher). Footer has a **Share** action (`createShare("meal", …)` → share sheet with a `/share/<id>` link).

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
- `language` state in store; changing it clears the meal stream + `seenMeals` + shopping selections.
- Static strings: `locales/en.ts` and `locales/zh.ts` — accessed via `useTranslation()` hook.
- Dynamic strings (AI-generated meal names, descriptions, ingredients, steps): translated **client-side** by `useDynamicTranslation.ts` → `services/translate.ts` (Google Translate unofficial endpoint → MyMemory free API fallback → silent passthrough), with in-memory + AsyncStorage caching.
- Tags: always English from AI; translated client-side via `TAG_ZH` lookup.
- AI prompts: `_LANG_INSTRUCTION` in `prompts.py` switches the AI's output language for meal names/descriptions when `language === "zh"`.
- Pantry item names: stored canonical English; displayed per-language via `usePantryDisplay` in `hooks/useDynamicTranslation.ts`. **Language is unified**: names are first normalized to canonical English via the reverse map `TAG_EN`/`toCanonicalEnglish` (`constants/filters.ts`) — so legacy Chinese-stored names show in English under EN mode — then EN passes through / ZH resolves curated `TAG_ZH` hit → cached dynamic translation → raw. Used by the Pantry tab list, Discover "From pantry" chips, and scan-review badges.

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
- The saved list is a **`SectionList` grouped by category** (`categoryForItem` → `PANTRY_CATEGORIES` keys, "Other"/其他 bucket last). Categories live in `constants/filters.ts` (`PANTRY_CATEGORIES`, `ITEM_CATEGORY`, `CATEGORY_LABELS`); `PantryTagPicker` imports `PANTRY_CATEGORIES` from there (single source of truth). Display names resolve via a `name → display` map (`displayByName`) since `SectionList` indices are per-section.
- Add items by **name only** (via `PantryTagPicker` category multi-select with custom entries) — there is no quantity/unit anywhere in the pantry stack.
- Add + "Scan receipt" render via the shared `Button` primitive (primary + secondary); Scan pushes `/pantry/scan` (see Receipt Scanning section).
- **Shopping is a single surface** (the `shopping.tsx` tab). The Pantry header **cart button navigates there** (`router.push("/(tabs)/shopping")`) — it no longer opens a duplicated in-Pantry modal. The cart badge still shows `selectedRecipes.length`.
- Item names display per-language (`usePantryDisplay`); each row has inline **rename** (pencil → TextInput prefilled with the **raw stored name**, not the translated display; ci-collision against other items shows `pantry_name_exists`; commit = optimistic store write + awaited `replacePantry`, with `loadPantry()` restoring server truth on failure) plus delete.
- Items sync to Supabase `pantry` table on save (`replacePantry` = full replace, fire-and-forget on picker save; awaited on rename and scan-confirm).
- Local cache in `useAppStore.pantry`.
- Shopping-list generation lives on the **Shopping tab** (reached via the cart), which takes `selectedRecipes` from store → `POST /shopping/generate` → backend subtracts pantry items semantically (via `_MATCHING_RULES` prompt) → grouped shopping list.

### Shopping Tab
- The **one** shopping-list surface (reached via the Pantry cart; `ScreenHeader` back → Pantry). Displays `shoppingList` from store (grouped by category).
- Items can be checked off (`toggleShoppingItem`).
- Share as text, clear list.
- Also lets you regenerate from confirmed meals.

### Shopping List Flow
- Auto-population: confirming a meal card in Discover auto-adds missing ingredients to the shopping list (category key is `meal-{meal.name}` — meal names are unique within a day via the seen-meals exclusion).
- AI generation: pantry tab generates a de-duplicated, category-grouped list from all confirmed recipes, semantically subtracting pantry contents.

---

## Receipt Scanning

Closes the input side of the pantry loop: photograph a grocery receipt → AI extracts the purchased food items → user reviews/edits → items merge into the pantry.

### Pipeline (two-stage, both on Groq)
1. **Stage 1 — vision transcription** (`transcribe_receipt`, model `_VISION_MODEL` = Llama 4 Scout, temp 0.2): the photo is transcribed verbatim into raw text lines. No interpretation. Isolated and swappable — if Groq deprecates Scout (it's preview; Maverick was killed Feb 2026), set env `GROQ_VISION_MODEL` or replace this one function (e.g. with AWS Textract).
2. **Stage 2 — text normalization** (`normalize_receipt_items`, existing `llama-3.3-70b-versatile`, temp 0.3): raw lines + the user's current pantry (fetched server-side) → items with `name` (**always canonical English** regardless of receipt/user language — same convention as tags; abbreviations expanded: "ORG BNLS CKN BRST" → "chicken breast"; brands stripped; foreign lines translated), `name_zh` (Simplified Chinese display name, always provided), `raw_text`, `is_food` (paper towels/detergent → false), display-only `quantity`, and `matches_pantry` (semantic cross-language match against an existing pantry item, e.g. scanned 鸡蛋 ↔ existing "eggs"; guarded server-side against hallucinated values). The `language` request param is intentionally unused by this prompt. Tax/totals/coupons/deposits/payment lines are omitted entirely. Contract test: `wotoeat-api/tests/test_receipt_normalize.py` (live-LLM, crossed-language fixtures — run from `wotoeat-api/` with `venv/bin/python tests/test_receipt_normalize.py`).

### Endpoint
`POST /pantry/scan-receipt` — body `{image_base64, language}`; `require_user_id`; rate-limited 10/hr per user (`receipt-scan`); **no caching**; **annotate-only** (writes nothing). Errors: oversized/invalid image and AI error tokens (`no_receipt`, `no_food_items`, `unreadable_receipt`) → 422 (client localizes the tokens); `GroqTransientError` → 503; generic → 500.

### Frontend flow (`app/pantry/scan.tsx`)
`pick → processing → review → saving`. Camera or library via `expo-image-picker` (camera hidden on web); the photo is resized to ≤1600px longest edge and re-encoded JPEG 0.7 via `expo-image-manipulator` (converts HEIC, bakes EXIF rotation, strips GPS), then sent as base64 JSON (~250–600KB; data-URL prefix stripped client-side AND server-side, intentionally duplicated).

**Review screen**: shows ALL returned rows — nothing silently dropped. Food rows first (checked); matched rows default **unchecked** with an "Already in pantry" badge; non-food rows last, unchecked, with a "Not food" badge. Header counts food rows (`scan_found`); a breakdown subtitle ("3 already in pantry · 1 not food") explains why the Add button's count (checked rows) differs. Names are editable inline (pencil affordance); rows display `name_zh` when the app is in Chinese until edited — once edited, the user's literal text wins and is what gets stored. For edited rows the pantry match is re-derived live (exact case-insensitive), falling back to the server's semantic match so a pending rename stays visible. `raw_text` + quantity show as the subtitle.

**Merge = combine / rename / add — never removes** (`computeScanMerge` in `app/pantry/scan.tsx`, pure + exported): a checked **unedited** row that matched an existing entry is skipped (combines — checking 鸡蛋 with "eggs" in the pantry must NOT create a second entry); a checked **edited** row whose name ci-equals an existing entry combines; a checked **edited** row that semantically matched **renames** the existing entry to the user's text (collision-guarded); everything else adds with ci-dedupe. Renames run before adds against a live ci-name set, so the `replacePantry` payload can never contain duplicates (its delete-then-bulk-insert would 500 on `UNIQUE(user_id, name)`). The confirm handler **awaits** `replacePantry` before writing the store or navigating (a deliberate departure from the pantry tab's fire-and-forget) — on failure it stays on the review screen with row state intact and shows the error.

### New packages / permissions
`expo-image-picker` + `expo-image-manipulator` (both in Expo Go SDK 54 — no dev build needed). `app.json`: expo-image-picker plugin with camera/photos strings, `NSCameraUsageDescription` + `NSPhotoLibraryUsageDescription`, Android `CAMERA` permission.

---

## Image Search

- `services/imageSearch.ts` → calls `GET /images/search?q=<meal name>`.
- Backend runs a **food-specific cascade** (`routers/images.py`): **TheMealDB** (real photographed dish when the name matches a known recipe — free, no key) → **Pexels** (food-tuned stock query; needs `PEXELS_API_KEY`) → **Unsplash** (optional, needs `UNSPLASH_ACCESS_KEY`). Returns `{url}` or `{url: null}`.
- **Results are cached** in the SQLite TTL cache (key `img:<lowercased query>`): a found URL for 7 days, a miss for 6 hours (so a transient upstream failure — e.g. a rate-limited Pexels call — recovers on the next request). The same dish name never re-hits the external APIs within the TTL.
- **Rate-limited** 100 novel lookups/hour per IP (`image-search`). The cache is checked **before** the limiter, so cache hits/misses don't count — only genuine new external lookups do; normal browsing is never limited, but a flood of distinct queries (key-burning abuse) is capped. On limit it degrades to `{url: null}` (placeholder) and does **not** cache that, since the cap is transient. The endpoint is unauthenticated, so the limit is per-IP via `request.client.host`.
- **Wikipedia was removed** — its loose title-matching returned unrelated images ("random stuff"). Returning `{url: null}` (→ placeholder) is preferred over a wrong image.
- Images shown as hero in the meal detail modal, rendered via **`expo-image`** (`contentFit="cover"`, `cachePolicy="memory-disk"`, 200ms fade) for memory+disk caching.
- **Fetched lazily**: each `MealSlotCard` only calls `searchMealImage` once its detail modal is first opened (guarded by a `fetchedImageFor` ref keyed on `meal.name`), not on card mount — so the growing meal stream no longer fires an image search per card up-front.

---

## Sharing (public web links)

Meals and recipes can be shared as browsable links anyone can open.

- **Create**: a Share action (meal detail modal footer in `discover.tsx`; recipe detail modal header in `recipes.tsx`) builds a payload and calls `createShare(kind, payload)` → `POST /share` (`routers/share.py`, optional auth, rate-limited 30/hr per client) → `{id}`. The client then opens the OS share sheet with `shareWebUrl(id)` (= `${EXPO_PUBLIC_WEB_URL || window.location.origin}/share/<id>`).
- **View**: `app/share/[id].tsx` (registered in `_layout.tsx`) calls `getShared(id)` → `GET /share/{id}` (**public, no auth**) and renders a read-only recipe/meal view (ingredients normalized: structured `Ingredient[]` or raw `string[]`). Web is primary; works as a native deep link too. `vercel.json`'s SPA catch-all makes `/share/<id>` load directly.
- **Storage**: Supabase `shared_items` table (`id, kind, payload jsonb, user_id nullable, created_at`). Backend writes via service-role; public SELECT via RLS policy `shared_public`. Run the updated `db/schema.sql` to create it. Payloads are immutable snapshots — editing the original recipe does not change a previously-created share.
- **Models**: `CreateShareRequest` / `CreateShareResponse` / `SharedItem` (`db/models.py`); db helpers `create_share` / `get_share` (`db/supabase_client.py`).

---

## Auth Flow

- Supabase email+password auth.
- `app/_layout.tsx` listens to `supabase.auth.onAuthStateChange`; calls `setAuthToken(token)` to cache the JWT.
- **Backend verifies the JWT signature before trusting `sub`** (`routers/auth.py`): HS256 tokens are verified against `SUPABASE_JWT_SECRET`; ES256/RS256 tokens against the project JWKS (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`). Expiry + audience (`authenticated`) are checked; verification **fails closed** (unverifiable token → unauthenticated). The backend uses the service-role key (RLS-bypassing) and isolates users solely by this verified `sub`, so signature verification is the security boundary — never weaken it back to an unverified decode.
- Unauthenticated users can still generate meals and parse recipes (endpoints with `get_optional_user_id`).
- Authenticated-only: saving recipes, history, pantry, profile (`require_user_id`).
- Onboarding: first-run screen (`hasOnboarded` flag in store) prompts profile setup before sending to the main tabs.
- **Landing is for signed-out users only**: a returning user with a persisted session auto-logs-in and goes straight to Discover. `app/index.tsx` holds rendering (blank cream screen) until `supabase.auth.getSession()` resolves, then `<Redirect>`s to `/(tabs)/discover` if a session exists (no landing flash); the root layout's redirect effect also sends `session && atLanding` → discover/onboarding as a backstop.
- Sign-out calls `supabase.auth.signOut()` then `resetAll()` to clear store.

---

## Serving Size Scaler

- `servings` in the store is the user's default preference (**default 1**).
- `planServings` tracks the servings count used when the current stream was generated.
- Meal card detail modal has a stepper (`displayServings`) that scales ingredient amounts relative to `planServings`.
- `scaleIngredientStr()` parses leading numbers in ingredient strings (e.g. "100g chicken") and applies the scale factor; non-numeric quantities get a `~` prefix.

---

## Meal Ratings / Dislike

- Rating a meal "down" and swapping calls `swapMeal`, which passes `avoid_meals` (today's `seenMeals`) + prior disliked meals to the prompt so none are re-suggested.
- Ratings stored in `useAppStore.ratings`; sent as `recent_ratings: Record<name, "up"|"down">` on next generation. **Capped at the 100 most recent** (insertion-order trim in `setRating`) — the map is persisted forever and rides on every request, so unbounded growth would slowly bloat payloads and the prompt's dislike list.

---

## Meal Stream Reset (replaces Stale Plan Detection)

- `mealsDate` is stored alongside the `meals` stream.
- **Same-day persistence is a feature**: the stream (and `seenMeals`) survives app restarts within the same day — losing `seenMeals` would let the AI re-suggest dishes already shown today. Clearing is date-aware everywhere:
  - Cold start: `onRehydrateStorage` (runs before React renders) clears iff `mealsDate !== today`.
  - Warm reopen: an `AppState` "active" listener in `_layout.tsx` does the same date check — iOS/Android keep the app in memory for days, so rehydrate alone missed the overnight-background case.
  - Auth: `SIGNED_IN`/`INITIAL_SESSION` also clear only on a date mismatch (on web, `SIGNED_IN` can re-fire on tab refocus — an unconditional clear wiped live streams). Only `SIGNED_OUT` clears unconditionally; a user switch is always bracketed by it (sign-out also runs `resetAll`).

---

## Known Patterns / Conventions

- **Numeric text inputs**: parse with an explicit radix (`parseInt(v, 10)`) and reject `NaN` before storing — `keyboardType` is ignored on web (this app ships to Vercel), so a user can type/paste non-numeric text. The profile fields (age/calorie/protein) and the recipe-edit calories field guard `Number.isNaN(n)`; don't store a raw `parseInt` result, or `NaN` leaks into state and renders as the literal "NaN" (and serializes to `null` on save).
- **Rate limiting (every AI / external-cost endpoint)**: all paid-AI and external-API endpoints go through `ai.sqlite_cache.rate_limit_check(key, action, max, window)`. Key = `user_id` for authed-only endpoints, else `user_id or request.client.host` for optional-auth ones (anon falls back to IP). Current caps: meals generate+swap share **150/hr** (`meal-ai`); shopping generate **40/hr** (`shopping-ai`); recipe parse **20/hr per IP**; recipe generate **30/hr**; receipt scan **10/hr**; share create **30/hr**; image search **100 novel lookups/hr per IP** (cache hits exempt). Don't leave a new AI endpoint unlimited — it's an unauthenticated cost/abuse vector. **Request models also bound their prompt-feeding fields** (`db/models.py`: meal/swap pantry ≤500, avoid_meals ≤300, slots ≤3, required_ingredients ≤2000 chars; shopping recipes ≤20; parse url ≤2000; dish_name ≤200; share payload ≤100KB in the router) so a single request can't stuff megabytes into a paid completion — give any new AI-bound field a sane `Field(max_length=…)`.
- **Backend error handling**: `ValueError` → HTTP 422; `GroqTransientError` (RateLimitError/APIConnectionError/APIStatusError) → HTTP 503; uncaught exceptions → HTTP 500. **Never leak `{exc}` in client responses** — routers route their generic `except Exception` through `utils/errors.server_error(context, exc, message)`, which logs the full exception with traceback server-side (logger `wotoeat`) and returns a fixed, user-safe `detail`. The 422 (`ValueError`) and 503 (`GroqTransientError`) bodies are kept verbatim because the frontend keys off them (`no_receipt`/`no_food_items`/`unreadable_receipt` in `scan.tsx`; `no dish`/`required tags` in `discover.tsx`); the user-facing `/recipes/parse` fetch-failure 422 is also kept (it surfaces the user's own bad/blocked URL).
- **AI JSON parsing**: all AI-returning helpers in `ai/claude.py` parse via `_parse_ai_json(text)`, which wraps `json.loads(_clean_json(...))` and converts a truncated/garbled reply's `JSONDecodeError` (a `ValueError` subclass) into a clean `ValueError("The AI response was incomplete. Please try again.")` — otherwise the router would surface a raw `422: Expecting value: line 1 column N`. The receipt transcribe/normalize helpers keep their own try/except that maps parse failures to `unreadable_receipt`.
- **Client-facing error text**: the frontend shows the backend's `detail` via `apiErrorMessage(err, fallback)` (`services/api.ts`) — prefers `err.response.data.detail` (the friendly 503/429/validation messages) over Axios's raw "Request failed with status code N", falling back to a localized message for network errors. Used by every API-backed screen; **auth screens keep Supabase's own messages** (they're already meaningful).
- **Sharing goes through `utils/share.ts shareText()`** (never raw `Share.share`): react-native-web's `Share.share` needs `navigator.share`, which desktop browsers mostly lack, so the util falls back to copying to the clipboard and returns `"shared" | "copied" | "failed"` — callers show "copied" feedback (Today reuses its toast; Recipes/Shopping morph the share icon into a checkmark for 2.5s; i18n key `link_copied`).
- **Destructive actions confirm cross-platform**: Today's clear/refresh (wipes the day's meal stream + confirmations) and Profile's sign-out confirm via `window.confirm` on web and `Alert.alert` on native before acting — RN's `Alert` is a no-op on react-native-web, so web needs the `window.confirm` branch. Sign-out also runs `resetAll()` in a `finally` so a failed network sign-out can't leave stale local data. Reuse this pattern for any new destructive control.
- **Pantry writes must preserve `category`**: any code path that rebuilds the pantry list for `replacePantry` (picker save, scan merge) must carry each surviving item's `category` override through — bare `{name}` rows silently wipe user-assigned categories locally AND server-side. `PantryTagPicker` selection is case-insensitive (ci name → exact stored name) so an existing "Chicken Breast" lights up the built-in "chicken breast" chip instead of saving a case-variant duplicate.
- **SSRF guard on URL fetch**: `utils/scraper.py` (`/recipes/parse`) accepts a user-supplied URL, so `_assert_public_http_url()` enforces an http(s)-only scheme allowlist and resolves the host, rejecting any answer in loopback/private/link-local/reserved/multicast ranges (blocks cloud metadata `169.254.169.254`, `localhost`, internal hosts). Redirects are followed **manually** (`follow_redirects=False`, max 5 hops) so every hop is re-validated — a public URL can't 30x-redirect into an internal address.
- **Cache key**: MD5 of sorted JSON of the filters dict (excluding `recent_ratings` for plan cache keys to avoid thrashing). **`avoid_meals` is NOT excluded** — it must stay in the key so a growing exclusion list forces fresh, non-repeating results.
- **Token limits**: budgets are right-sized to the response so Groq's per-minute token (TPM) reservation — which counts the *requested* `max_tokens`, not just what's generated — isn't blown on every call (the old flat 6000 was a 3-meal-era leftover and caused 429→503 rate-limit storms now that generation is one meal per call). `generate_meal_plan`/`swap_meal` use `_meal_max_tokens(n_slots)` (≈3600 for one slot); `generate_recipe_by_name` uses 4500; `parse_recipe` uses 4000. A single rich meal/recipe response is ~1.5–2k output tokens, so these are comfortably above the truncation threshold. Don't raise them back toward 6000 — that reintroduces the rate-limit storms. If a response ever truncates (→ 422 on JSON parse), bump that one call's budget by ~1000, don't blanket-raise.
- **CORS**: `main.py` allows `GET, POST, PUT, PATCH, DELETE, OPTIONS`. `PATCH` is required for `/recipes/{id}/labels`.
- **Pantry replace**: frontend calls `POST /pantry/` (not `/pantry/replace`) with body `{ items: [...] }`.
- **AI JSON cleaning**: `_clean_json()` strips markdown fences that some models prepend.
- **Semantic pantry matching**: `_MATCHING_RULES` in `prompts.py` teaches the AI to match ingredient types (e.g. "巴沙鱼" satisfies "white fish").
- **Shopping list category**: meals use `meal-{meal.name}` as the shopping list category key (names are unique within a day via seen-meals exclusion).
- **Pantry priority**: `meal_generate_prompt` has a `PANTRY PRIORITY` block instructing the AI to prefer dishes that reuse pantry ingredients and to fill `uses_pantry_items` (without violating other filters). The pantry list is surfaced explicitly (no longer buried in `display_filters`).
- **Dietary safety + goal tailoring** (`_profile_constraints_block`): the profile's `allergies` and `dietary_restrictions` are stated as ABSOLUTE hard constraints that override every taste/pantry/required-tag preference (allergen derivatives spelled out — "peanuts" also rules out peanut oil/satay; "shellfish" rules out shrimp/crab/lobster); a required tag conflicting with a safety constraint must return `no_match` rather than suggest a violating dish. `health_goals`/`calorie_goal`/`protein_goal_g` shape dish choice (weight-loss → lower-cal/high-fibre/veg-forward; build-muscle → 30g+ protein). The hierarchy is **safety > active filters > pantry/goal preference**. This is the highest-trust behaviour: a user fills in allergies/restrictions expecting them honoured, so they are emphasised, not left buried in the filters JSON. Applies to both generate and swap (swap reuses the same prompt). Don't weaken the safety override.
- **Tags always English**: the AI is instructed to return tags in English regardless of response language. Frontend translates via `TAG_ZH` at render time.
- **Pantry names are canonical English** (same convention as tags): receipt scan returns `name` always-English plus `name_zh` for display; `PantryTagPicker` built-ins already store English (its zh labels are display-only). All pantry-name display goes through `usePantryDisplay`, which **first normalizes to canonical English** via `TAG_EN`/`toCanonicalEnglish` (reverse map built from `TAG_ZH` + `PANTRY_CATEGORIES` itemsZh) so the library is single-language — then EN passes through / ZH resolves curated `TAG_ZH` → dynamic translation → raw. User-typed names (picker custom items, scan edits, renames) are stored literally; if not in the reverse map they display as typed.
- **No calories displayed on card header**: calorie/kcal display is only visible inside the info panel (tap ℹ️ icon). Prep time is still shown in the header.
- **Solid button colours (no gradients)**: buttons/badges/avatars use flat theme colours (`c.primary` green for actions, `SLOT_COLOUR[slot]` for meal-card headers) instead of `LinearGradient`. `expo-linear-gradient` has been **removed** from dependencies — do not reintroduce it; use solid `backgroundColor` from the `useTheme()` palette.
- **Memoized styles**: every screen builds its stylesheet via `const styles = useMemo(() => makeStyles(c), [c])` (not a bare `makeStyles(c)` per render). `useTheme()` returns a stable module-level palette object, so the memo only recomputes on light/dark switch.
- **UI / design system**: warm cream + green brand; design tokens in `hooks/useTheme.ts` (`space`, `radius`, `fontSize`, `shadows`, light/dark palettes) — prefer these over ad-hoc numbers. Conventions: every in-app screen renders a `ScreenHeader` at the top (consistent brand mark + title/greeting; tab screens set `headerShown: false`); the **single primary action sits in the thumb zone** (Today's Generate is a `PinnedBar` FAB that doesn't scroll away — don't move it back in-flow); titles/non-interactive elements at the top, destructive actions less prominent; touch targets ≥44pt; use `useSafeAreaInsets()`/`SafeAreaView` for insets (no hardcoded `paddingTop`). On Today, the meal-type chips (Auto/Breakfast/Lunch/Dinner) are surfaced **above** the collapsible filter panel (most-used filter, one tap). The active tab shows a soft `primaryLight` pill behind its icon (`TabIcon` in `_layout.tsx`; the tab bar uses `useSafeAreaInsets` for its bottom padding). Repeated primitives come from the **shared UI kit** (`Button`/`Chip`/`SectionLabel`/`Card` — see Key Components) — reach for those instead of re-declaring a green pill or chip. **Landing** (`app/index.tsx`) is logo-led: the illustrated logo (which already contains the "what to eat" wordmark) is the centered hero anchor at ~108px on the cream `bg` (no redundant "wotoEAT" text; a transparent-background logo export would be the ideal future polish since the PNG has a baked-in cream fill). **Auth**: sign-in/up/forgot use a **purpose title** ("Welcome back"/"Create Account"/"Reset Password"), not the brand wordmark. **Guardrail: do NOT add food images to the Today meal cards** — images are lazy-loaded only when a detail sheet opens (perf); imagery lives in detail/recipe/share sheets.
- **Swap respects filters**: `handleSwap` passes cuisine, flavour, maxTime, requiredIngredients, and mealStyle to the backend swap endpoint.
- **Regenerate bypasses cache**: `generateRecipeByName` accepts `force_refresh=True`; the Regenerate button (FindRecipeModal) and history Generate button both pass this flag.
- **Web SPA routing**: `wotoeat-app/vercel.json` includes a catch-all rewrite to `index.html` so direct URL loads (e.g. `/discover`) work without a 404.
- **useTranslation type cast**: `locales` map is cast `as any` because `zh` has different string literals than `typeof en`; both files have identical keys.
