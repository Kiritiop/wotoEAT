# wotoEAT — Project Reference
Update this document every time changes happen, adapt accordingly

## Handoff — read this first

This section is the senior-to-junior handoff. It tells you the state of the
project and how to work on it safely. The rest of this file is the detailed
reference; `wotoeat-app/CLAUDE.md` and `wotoeat-api/CLAUDE.md` are the
per-half working guides with the non-negotiable rules.

**Status: live in production.** Backend on Railway, web app on Vercel,
database and auth on Supabase, AI on Groq. A push to `main` deploys both
halves automatically. There is no staging environment. GitHub Actions CI
(`.github/workflows/ci.yml`) runs the backend offline tests, frontend
typecheck + lint, and an emoji scan on every push and PR, but it does not
block the auto-deploys, so local verification is still the release gate.
Never push unverified changes.

**How to work here:**
1. Before claiming anything is done: `npx tsc --noEmit` + `npm run lint` in
   `wotoeat-app`, and the five offline test scripts in `wotoeat-api/tests`
   (commands in `wotoeat-api/CLAUDE.md`). Then actually launch and click
   through the changed screen, on web at minimum.
2. Make the smallest change that solves the problem. Do not reformat, rename,
   or restyle things you were not asked to touch. Many current behaviours are
   deliberate decisions with history behind them; the "Known Patterns /
   Conventions" section and the sub-guides record which ones. If something
   looks wrong but is documented, ask before "fixing" it.
3. Update this file (and the sub-guide) in the same commit as any behaviour
   change. The docs being trustworthy is a core feature of this repo.
4. No emojis anywhere: UI, code, commits, docs. No gradient colours in the UI.
5. Commit messages are short imperative sentences describing the change
   (see `git log` for the house style).

**The five safety-critical invariants** (each has a fuller writeup below or in
the sub-guides; breaking any of these is the worst mistake you can make here):
JWT verification in `routers/auth.py` is the security boundary; allergy and
dietary-restriction constraints in prompts are absolute; every AI endpoint is
rate-limited and its request fields bounded; exception details never reach
client responses; the SSRF guard on `/recipes/parse` stays intact.

**Known gaps / natural next work** (nothing here is broken, these are the
open ends of the product loop):
- The generation feedback loop is partially open: `meal_history` is write-only
  and ratings are device-local. A thin taste loop DOES exist now — saving a
  meal records an "up" rating and generation's TASTE PROFILE block leans
  toward similar dishes. The full server-side version (`design/pantry-loop.md`
  Phase 3) was reviewed and deliberately deferred as mostly-dead-code; the
  design doc records the revisit triggers.
- `meal_history` is write-only; it is never fed back into generation
  (per-device `ratings` are the only feedback signal, capped at 100).
- Ratings are device-local, never persisted server-side.
- `user_preferences` and `daily_plans` are dead tables in schema.sql, kept
  for reference; zero code references.
- The landing logo PNG has a baked-in cream background; a transparent export
  would be the ideal polish.
- Pexels attribution is not shown anywhere. Their API terms ask for it; worth
  adding under the hero image before the app is promoted publicly.
- Guests are device-local by design: their meals, list and profile live only in
  AsyncStorage until they create an account. Nothing on the server knows they
  exist, so there is no funnel data on how many try it.

**Operational notes:** Groq free/dev tiers have daily token limits; when
generation starts 503ing check the Groq console before debugging code.
**A blanket 503 across every AI feature usually means a decommissioned model,
not capacity**. Groq removed `llama-3.3-70b-versatile` and Llama 4 Scout in
Aug 2026, and a removed model returns 404 `model_not_found`, which arrives as
`APIStatusError`, which is inside `GroqTransientError`, which every router maps
to 503. Diagnose with
`curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"`
and check the current default is still listed; the fix is an env/default swap,
not code. Check Railway's `GROQ_TEXT_MODEL`/`GROQ_VISION_MODEL` too: an
override there wins over the code default and can be stale.
Backend secrets live only in Railway; Vercel gets only `EXPO_PUBLIC_*` vars
(they are public); EAS needs its env vars set separately or store builds ship
broken (see Deployment below).

**Known open issues:** `todo.txt` has the authoritative queue. The 2026-07-08
review's FIX-1 through FIX-10, plus A-2 and A-4, all shipped on 2026-08-18;
recipe-image matching and guest mode shipped on 2026-08-25. What remains is the
larger architectural work (A-1 event-loop blocking, A-3 translation scraping,
A-5 splitting the two monolith screens) and the product roadmap. Nothing in the
queue is a known live defect right now.
When any item ships, update todo.txt and this section together.

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
2. ~~Nothing consumes/decrements the pantry after cooking~~ — **closed by "I cooked this"** (meal detail modal → `CookedSheet`): a review sheet proposes the pantry items the dish used (perishables pre-checked, staples pre-unchecked) and removes the confirmed ones. The pantry is name-only, so consumption = review-and-remove.
3. ~~Shopping check-offs never write back to the pantry~~ — **closed by "Done shopping"** (Shopping tab): checked (= bought) items merge into the pantry (via `computeShoppingDone` in `utils/pantryMerge.ts`) and leave the list. The toggle itself is still visual-only; nothing moves until the user confirms Done shopping.
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
- **AI**: Groq API (`openai/gpt-oss-120b` text, `qwen/qwen3.6-27b` vision) via `groq` async client
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
  - `venv/bin/python tests/test_meal_prompt.py` — `meal_generate_prompt`'s other behavioural blocks: AUTHENTICITY (always present, bans invented/generic dishes), the prep-time hard-cap rule, required-tags enforcement + `no_match` contract (iff set), PANTRY PRIORITY (iff pantry given), MAIN DISH mode (no staples), and avoid_meals folding into the disliked list.
  - `venv/bin/python tests/test_image_match.py` — `/images/search` matching helpers: the MealDB subset rule (rejects the real "Beef Stew" → "Lemongrass beef stew with noodles" hit), the Pexels relevance floor, and query cleaning. **Keep green if you touch the cascade** — the failure mode is silent and user-visible.
  - `venv/bin/python tests/test_image_endpoint.py` — the images router end to end with TheMealDB/Pexels mocked: cascade order, the `hint` parameter, cache keying, and the never-return-a-wrong-image contract.
  - `venv/bin/python tests/test_guest_endpoints.py` — the anonymous-access contract guest mode depends on: which endpoints must work without a session (generate/swap/recipe-steps/shopping/images) and which must keep 401ing (pantry, profile, saved recipes, history, shopping sync). Adding `require_user_id` to one of the first group breaks guest mode silently.
- **Live-LLM** (needs `GROQ_API_KEY`, mild flake): `venv/bin/python tests/test_receipt_normalize.py` — receipt Stage-2 prompt contract.

### Environment Variables (`wotoeat-api/.env`)
Copy `wotoeat-api/.env.example` → `.env` and fill in (the example lists exactly the
vars the code reads via `os.getenv`). Note: `wotoeat-api/.gitignore` needs the
`!.env.example` negation or the template is silently ignored (it has its own `.env.*`).

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Groq API key (powers all text + vision calls) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase service-role key |
| `SUPABASE_JWT_SECRET` | **Required for legacy (HS256) Supabase projects** — the shared JWT secret used to verify user access tokens in `routers/auth.py`. Not needed for projects using asymmetric (ES256/RS256) signing keys (those verify against the JWKS at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`). If a project is on HS256 and this is unset, all authenticated requests return 401 (fail-closed). |
| `ALLOWED_ORIGINS` | CORS origins, comma-separated |
| `CACHE_TTL_SECONDS` | AI response cache TTL (default 3600) |
| `PEXELS_API_KEY` | Pexels image search API key (image-cascade fallback; set in Railway) |
| `UNSPLASH_ACCESS_KEY` | Unsplash access key (optional last-resort image fallback) |
| `GROQ_VISION_MODEL` | Optional override of the receipt-scan vision model (default `qwen/qwen3.6-27b`; swap here if Groq deprecates it). **Leave unset unless deliberately pinning**: a stale pin at a removed model 503s every AI call |
| `GROQ_TEXT_MODEL` | Optional override of the main text model (default `openai/gpt-oss-120b`) — powers all meal/recipe/shopping generation; swap here if Groq deprecates it. **Leave unset unless deliberately pinning** (same reason as above) |
| `GROQ_REASONING_EFFORT` | Reasoning budget for models that support it (default `low`). gpt-oss bills reasoning as completion tokens; at Groq's default effort an elaborate recipe spent ~2500 of its 4500-token budget thinking and truncated mid-JSON (a 422). `low` roughly halves cost and latency with no measured quality loss. Blank disables; models that reject the param self-heal at runtime |

### Router/Endpoint Map

| Prefix | File | Description |
|---|---|---|
| `GET /` | `main.py` | Health check |
| `POST /meals/generate` | `routers/meals.py` | **Primary**: slot-aware rich meal plan (ingredients, steps, macros, tags). Optional auth; rate-limited 150/hr per identity (shared `meal-ai` budget with swap) |
| `POST /meals/swap` | `routers/meals.py` | Swap one slot in an existing plan. Optional auth; shares the 150/hr `meal-ai` budget |
| `GET /meals/history` | `routers/meals.py` | User's past meal history (requires auth) |
| `POST /recipes/parse` | `routers/recipes.py` | Parse recipe from URL (rate-limited 20/hr per IP) |
| `POST /recipes/generate` | `routers/recipes.py` | Generate full recipe for a named dish. **Optional auth** — this is the "show me the steps" call behind every meal card, so gating it would dead-end guests; it writes nothing. Rate-limited 30/hr per user, else per IP |
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
| `GET /images/search` | `routers/images.py` | Food image cascade — TheMealDB → Pexels → Unsplash. Takes `q` (dish name) + optional `hint` (the generator's `image_query`). Every candidate is verified against the dish; returns `{url: null}` rather than a wrong photo. SQLite-cached; rate-limited 100 novel lookups/hr per IP |
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

**`ai/claude.py`** — Async wrappers around the Groq client (`openai/gpt-oss-120b`):
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
- `_generate_vision(prompt, image_b64, max_tokens)` — calls `_VISION_MODEL` (env `GROQ_VISION_MODEL`, default `qwen/qwen3.6-27b`) with temperature 0.2 and a base64 JPEG data-URL content part
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
| `app/index.tsx` | `/` | Landing page for signed-out visitors; "Look around first" enters guest mode |
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
  - `FadeSlideIn` (`components/ui/FadeSlideIn.tsx`) — fades and slides children up on mount (new/swapped meal cards, keyed by name so a swap replays it). Mount-only, driven by a shared value rather than reanimated's entering API so web/iOS/Android match.
  - `Collapsible` (`components/ui/Collapsible.tsx`) — animates open **and** closed (the Today filter panel). Measures its own content height, keeps children mounted while closed (that is what allows the close animation, and it preserves the tag draft), and disables pointer events when closed.
  - `WebShell` (`components/ui/WebShell.tsx`) — desktop-web frame: on web ≥768px the whole app renders as a centered 520px column on a `surfaceAlt` backdrop (wrapped around the Stack in `app/_layout.tsx`); native and narrow web pass through untouched. RN Modals portal to the document body on web, so full-screen overlays intentionally cover the whole window.
- `SkeletonMealCard` (`components/SkeletonMealCard.tsx`) — pulsing placeholder card + rotating status copy (`gen_status_1..3` locale keys) rendered on Today while `loading` (just above the meal stream). Opacity pulse only — no gradients.

### State (`store/useAppStore.ts`)
Persisted to AsyncStorage under key `wotoeat-store`. Fields:
- `profile` — HealthProfile
- `language` — `"en" | "zh"`
- `hasOnboarded` — boolean
- `meals` / `mealsDate` — today's **meal stream** (growing list of generated meals) + its date; survives same-day restarts, cleared at date rollover (cold start via `onRehydrateStorage`, warm reopen via an AppState listener, auth events date-aware — see Meal Stream Reset) and unconditionally on sign-out
- `seenMeals` — names of every meal shown today; sent as `avoid_meals` so generation/swap never repeats; reset with `meals`
- `cookedMeals` — names of today's meals marked "I cooked this" (drives the Cooked button state); reset with `meals` (clearMeals/setLanguage/resetAll/rehydrate rollover)
- `ratings` — `Record<mealName, "up"|"down">` (used to avoid re-suggesting disliked meals)
- `selectedRecipes` — recipes confirmed for shopping list generation (confirmation derives from this — no `confirmedSlots`)
- `requiredIngredients` / `selectedPantryItems` — **persisted generation preferences**: the "Include tags" free-text tags and required from-pantry items survive app restarts (they are user preferences, not per-session filter state). Cleared on language change (`requiredIngredients` only — they're language-specific text) and on sign-out. At generate/swap time, stale pantry selections (item since deleted) are filtered out via `livePantryItems` in `discover.tsx`.
- `pantry` — local cache of pantry items
- `shoppingList` — current shopping list (grouped)
- `recipeLabels` — `Record<recipeId, label[]>` for favoriting/tagging saved recipes
- `servings` / `planServings` — user preferred servings (**default 1**) + the servings count the current stream was generated for
- Store actions: `addMeal`, `replaceMeal` (swap, by name), `removeMeal`, `clearMeals`, `addSeenMeals`
- **One day-scoped reset**: `meals`/`mealsDate`/`seenMeals`/`cookedMeals`/`selectedRecipes` are cleared by four places (language change, `clearMeals`, `resetAll`, date-rollover rehydrate). They share the `dayScopedReset()` helper at the top of the store instead of four hand-maintained field lists. Add any new day-scoped field there and all four sites pick it up. It is a function, not a constant, so no two call sites share an array instance.

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
3. Backend `POST /meals/generate` → `generate_meal_plan(filters)` → Groq (`openai/gpt-oss-120b`, `_meal_max_tokens(n_slots)` ≈ 3600 for the usual single slot). `avoid_meals` (=`seenMeals`) is in the cache key, so a growing list forces a fresh, non-repeating result.
4. Each returned meal is **appended** to the `meals` stream (`addMeal`) and its name added to `seenMeals` (`addSeenMeals`) — old cards stay visible.
5. Meal cards render newest-first; the meal-type chips filter the visible list. Slot colour coding (breakfast=amber, lunch=green, dinner=indigo) still styles each card.

**One meal per generation.** The meal type selector is single-select — tapping a slot deselects any previous choice. Repeated generation/swap accumulates a stream that never repeats a dish within the day.

### Meal Card Actions
- **Swap** (thumbs-down / "next"): downvotes + calls `swapMeal` with `avoid_meals = seenMeals`, then `replaceMeal`s that card in-place with a never-before-seen dish (old name stays in `seenMeals`).
- **Save** (bookmark): calls `saveRecipe` → stores in Supabase `saved_recipes`.
- **Confirm** (checkmark): adds meal to `selectedRecipes` in store; auto-adds missing ingredients to shopping list.
- **Tag tap**: adds tag to required filters, opens filter panel.
- **I cooked this** (full-width button at the end of the detail modal's scroll content — the footer already holds four actions): opens `CookedSheet` (`components/CookedSheet.tsx`), which lists the pantry items the dish matched (`pantryItemsUsedBy`), pre-checked unless their category is a staple (one dish rarely finishes the soy sauce). The staple set is `STAPLE_CATEGORY_KEYS` in `constants/filters.ts`, derived from a `staple` flag on `PANTRY_CATEGORIES` so it cannot drift from the category list; `tests/unit/filters.test.ts` pins it. Confirm **awaits** `replacePantry` with the checked items removed (scan-confirm pattern: failure changes nothing, sheet stays open), optionally re-adds them to the shopping list (toggle, default off), and records the meal in `cookedMeals`. With no checked items it just marks the meal cooked. The button then shows a disabled "Cooked" state.
- **Detail modal**: tap card body → bottom sheet with macros, full ingredients (scalable by serving stepper), steps, image from Pexels. Ingredients already in the pantry show a green **"In pantry"** marker (per-ingredient, via `ingInPantry` → `pantryNameMatches` — in `utils/pantryMatch.ts`, shared with the CookedSheet so the badge and consumption review can never disagree — a **word-aware** matcher: both names are first normalized to canonical English via `toCanonicalEnglish` (exact-match curated reverse map — so an English pantry item matches a Chinese ingredient string in zh mode, e.g. "chicken breast"↔"鸡胸肉", and it can never invent a match); then every word of the shorter name must match a word of the longer one, where a word matches if equal or a ≥4-char prefix — so plurals/morphology still match (tomato↔tomatoes) but loose substrings no longer false-positive (egg≠eggplant, oil≠"boiling water", "soy sauce"≠"fish sauce"); CJK that isn't in the curated map falls back to containment. `missingIngredients` is `!ingInPantry` — the shopping-list auto-add and the badge share one matcher). Footer has a **Share** action (`createShare("meal", …)` → share sheet with a `/share/<id>` link).

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
- **Manual add** (input row under the action bar): type any item (paper towels, batteries) and it lands in a group keyed `MANUAL_CATEGORY` (`"other"`, exported from `utils/shopping.ts`). Displayed via the `other_items` locale key on-screen and mapped by language in `formatShoppingListText`; `addToShoppingList` creates the list if none exists and no-ops on exact duplicates.
- Share as text, clear list.
- Also lets you regenerate from confirmed meals.
- **"Done shopping"** (PinnedBar, visible when ≥1 item is checked): confirms cross-platform, then moves every checked item into the pantry and off the list. Names are normalized via `toCanonicalEnglish` and merged with `computeShoppingDone` (`utils/pantryMerge.ts`, reuses `computeScanMerge` — ci-dedupe, never removes, preserves `category` overrides). The `replacePantry` call is **awaited** (scan-confirm pattern): on failure nothing changes locally and the error banner shows. If the whole list was checked it just calls `clearShoppingList()`: the debounced auto-save persists a cleared list as `{groups: []}`, so the old special-case save is gone. The move re-reads `shoppingList` from the store **inside** the confirm callback, since on native a foreground refetch can land while the dialog is open.

### Shopping List Flow
- Auto-population: confirming a meal card in Discover auto-adds missing ingredients to the shopping list (category key is `meal-{meal.name}` — meal names are unique within a day via the seen-meals exclusion).
- AI generation: pantry tab generates a de-duplicated, category-grouped list from all confirmed recipes, semantically subtracting pantry contents.

---

## Receipt Scanning

Closes the input side of the pantry loop: photograph a grocery receipt → AI extracts the purchased food items → user reviews/edits → items merge into the pantry.

### Pipeline (two-stage, both on Groq)
1. **Stage 1 — vision transcription** (`transcribe_receipt`, model `_VISION_MODEL` = `qwen/qwen3.6-27b`, temp 0.2): the photo is transcribed verbatim into raw text lines. No interpretation. Isolated and swappable — Groq has already killed Maverick (Feb 2026) and Scout (Aug 2026), and qwen3.6 is currently the ONLY image-input model they offer, so assume this one will go too: set env `GROQ_VISION_MODEL` or replace this one function (e.g. with AWS Textract).
2. **Stage 2 — text normalization** (`normalize_receipt_items`, the main text model, temp 0.3): raw lines + the user's current pantry (fetched server-side) → items with `name` (**always canonical English** regardless of receipt/user language — same convention as tags; abbreviations expanded: "ORG BNLS CKN BRST" → "chicken breast"; brands stripped; foreign lines translated), `name_zh` (Simplified Chinese display name, always provided), `raw_text`, `is_food` (paper towels/detergent → false), display-only `quantity`, and `matches_pantry` (semantic cross-language match against an existing pantry item, e.g. scanned 鸡蛋 ↔ existing "eggs"; guarded server-side against hallucinated values). The `language` request param is intentionally unused by this prompt. Tax/totals/coupons/deposits/payment lines are omitted entirely. Contract test: `wotoeat-api/tests/test_receipt_normalize.py` (live-LLM, crossed-language fixtures — run from `wotoeat-api/` with `venv/bin/python tests/test_receipt_normalize.py`).

### Endpoint
`POST /pantry/scan-receipt` — body `{image_base64, language}`; `require_user_id`; rate-limited 10/hr per user (`receipt-scan`); **no caching**; **annotate-only** (writes nothing). Errors: oversized/invalid image and AI error tokens (`no_receipt`, `no_food_items`, `unreadable_receipt`) → 422 (client localizes the tokens); `GroqTransientError` → 503; generic → 500.

### Frontend flow (`app/pantry/scan.tsx`)
`pick → processing → review → saving`. Camera or library via `expo-image-picker` (camera hidden on web); the photo is resized to ≤1600px longest edge and re-encoded JPEG 0.7 via `expo-image-manipulator` (converts HEIC, bakes EXIF rotation, strips GPS), then sent as base64 JSON (~250–600KB; data-URL prefix stripped client-side AND server-side, intentionally duplicated).

**Review screen**: shows ALL returned rows — nothing silently dropped. Food rows first (checked); matched rows default **unchecked** with an "Already in pantry" badge; non-food rows last, unchecked, with a "Not food" badge. Header counts food rows (`scan_found`); a breakdown subtitle ("3 already in pantry · 1 not food") explains why the Add button's count (checked rows) differs. Names are editable inline (pencil affordance); rows display `name_zh` when the app is in Chinese until edited — once edited, the user's literal text wins and is what gets stored. For edited rows the pantry match is re-derived live (exact case-insensitive), falling back to the server's semantic match so a pending rename stays visible. `raw_text` + quantity show as the subtitle.

**Merge = combine / rename / add — never removes** (`computeScanMerge` in `utils/pantryMerge.ts`, pure + exported; re-exported from `app/pantry/scan.tsx` for compatibility — shared with the Shopping tab's "Done shopping" via `computeShoppingDone`): a checked **unedited** row that matched an existing entry is skipped (combines — checking 鸡蛋 with "eggs" in the pantry must NOT create a second entry); a checked **edited** row whose name ci-equals an existing entry combines; a checked **edited** row that semantically matched **renames** the existing entry to the user's text (collision-guarded); everything else adds with ci-dedupe. Renames run before adds against a live ci-name set, so the `replacePantry` payload can never contain duplicates (its delete-then-bulk-insert would 500 on `UNIQUE(user_id, name)`). The confirm handler **awaits** `replacePantry` before writing the store or navigating (a deliberate departure from the pantry tab's fire-and-forget) — on failure it stays on the review screen with row state intact and shows the error.

### New packages / permissions
`expo-image-picker` + `expo-image-manipulator` (both in Expo Go SDK 54 — no dev build needed). `app.json`: expo-image-picker plugin with camera/photos strings, `NSCameraUsageDescription` + `NSPhotoLibraryUsageDescription`, Android `CAMERA` permission.

---

## Image Search

Hero photos are **searched, not generated**. Nothing in this stack makes an image;
`/images/search` matches a dish name to an existing photo.

- `services/imageSearch.ts` → `GET /images/search?q=<meal name>&hint=<image_query>`.
- Backend runs a **food-specific cascade** (`routers/images.py`): **TheMealDB** (real photographed dish when the name genuinely matches — free, no key) → **Pexels** (scored stock search; needs `PEXELS_API_KEY`) → **Unsplash** (optional, needs `UNSPLASH_ACCESS_KEY`). Returns `{url}` or `{url: null}`.
- **Every candidate is verified before it is returned.** This is the whole point of the module, and it was the bug: the old code took TheMealDB's `meals[0]` on faith, but `search.php?s=` is a substring LIKE over meal titles — verified live, `s=Beef Stew` returns only "Lemongrass beef stew with noodles" and `s=Chicken Curry` returns "Katsu Chicken curry" first. Pexels had the same shape of bug (`per_page=1`, used unconditionally). Users saw unrelated photos on most cards.
  - **MealDB rule**: every content word in the MealDB title must also appear in our dish name. Extra words in OUR name are fine ("Classic Beef Bourguignon" still matches "Beef Bourguignon"); extra words in THEIRS are not — those are what make it a different dish. An exact normalized match wins outright; a one-word title only ever matches exactly (so "Fish" can't swallow "Fish Tacos").
  - **Pexels rule**: request `per_page=15`, score each photo's own `alt` text against the query's content words, and require `_PEXELS_FLOOR` (0.5). If nothing clears it, retry narrowed to the two leading words, then give up. **Returning `{url: null}` (→ placeholder) is always preferred over a confidently wrong image** — same principle that got Wikipedia removed earlier.
- **Correct and distinct are different problems.** Scoring stops a wrong photo; it does not stop two dishes getting the *same* photo. Real case: Pexels 5774004 and 5774005 are consecutive frames of one Luis Becerra shoot, alt-texted "Korean bibimbap topped with marinated bulgogi beef" and "Authentic Korean Bibimbap ... and beef". Both score ~1.0 for **both** "Beef Bulgogi" and "Beef Bibimbap" — correctly, since bulgogi is a standard bibimbap topping — so taking the top scorer per dish handed one meal stream two near-identical heroes. Neither photo was wrong; the pair was.
  - A chosen photo is **claimed** for its dish in the TTL cache (`imgclaim:<version>:photo|shoot:<id>`). A later dish skips photos, and whole shoots (keyed on `photographer_id`), already claimed by a different dish. Ties are broken by a stable `sha1(dish|photo_id)` shuffle, so equally-scored photos rank differently per dish instead of colliding.
  - If every candidate is claimed it **falls back to the best scorer without claiming** — a repeated photo beats a blank hero, and the fallback must not steal a claim from the dish that owns it.
  - Claims are per-server and reset with the cache (`/tmp` on Railway), so which of two adjacent dishes wins a shoot is stable within a deploy, not across deploys. That is fine: both are correct matches.
  - `per_page` is 30 (was 15) so the pool is deep enough to actually find an unclaimed alternative.
- **The word that names the dish carries the decision.** Matching is weighted, not a plain share of words: anything in `_GENERIC` (how it was cooked, what it sits on or with, the broad protein family, the cuisine) counts 1, everything else counts `_DISTINCT_WEIGHT` (4). Unweighted, "braised pork ribs" scored 0.67 against a photo alt-texted "braised pork **belly** with sauce and greens" and the app showed pork belly for 红烧排骨; live production likewise served a **biryani** photo for chicken tikka masala. Weighted those are 0.33 and 0.38, both rejected, while the correct photo scores 1.0 and outranks every near miss. A query with no distinctive word ("thai stir fried noodles") weights everything equally and behaves exactly as before.
- **A retry may broaden the query, never the acceptance test.** `_pexels_try` takes `query_terms` and `score_terms` separately for this reason. When the first pass finds nothing, `_broaden` re-queries on the distinctive words alone (`braised pork ribs` → `ribs food`) but still scores against the **full** term list. Scoring a retry against its own narrowed list re-accepted the exact pork-belly photo the first pass had just rejected, the fix defeating itself.
- **Non-Latin dish names have no tokens.** `_normalize` keeps `[a-z0-9]`, so a zh user's `q` ("红烧排骨") yields nothing and `{url: null}` is returned rather than a guess. `image_query` is therefore **required to be English** and is the only search signal those users have. A meal generated before `image_query` existed gets no hero; the stream resets daily, so it self-heals.
- **A vision model looks at the photo before it ships.** Word matching has a ceiling and "Red Braised Pork Ribs" is where it stops: a photo of ribs on an American barbecue shares every word that matters (`pork`, `ribs`) and differs only by cooking method, which is true of thousands of dishes and so cannot be weighted heavily without rejecting everything. It scores 0.83 and ships. Alt text is one line written by whoever uploaded the photo; no tuning turns it into a description of what the picture looks like.
  - Text scoring decides **which** candidates are worth checking; `verify_dish_photo` (`ai/claude.py`, prompt in `dish_photo_check_prompt`) decides **which one ships**.
  - **It is not a yes/no question, and that matters.** The first version asked "would a person accept this photo" with a confidence field, and a live run showed a 27B model saying yes to everything: Colombian rib roast for a Chinese red braise, **paneer** tikka masala for **chicken** tikka masala, a bibimbap bowl for bulgogi. All three were listed in that prompt as reject conditions. A lenient binary just produces a confident yes. The model now has to describe the photo first, answer `same_main_ingredient` and `same_style` separately, and give a comparative **0-10 fit**. A photo is usable only if both booleans hold and fit >= `_MIN_FIT` (6, "a close regional variant"), and fit is the primary ranking key so candidates compete instead of each being waved through alone.
  - The top `_VISION_CANDIDATES` (3) are checked **concurrently**, so it costs one round-trip of latency but three vision calls. Only on a cache miss. `_VISION_MAX` (60/hr/IP) is a separate budget on top of the lookup cap; exhausting it degrades to text-only rather than failing the request.
  - **Distinctness breaks ties; it does not outrank being the right photo.** `_choose` used to skip every claimed candidate outright, and the same live run showed the cost: "Red Braised Pork Ribs" and "红烧排骨" are the same dish under two names, so the second was pushed off the good photo onto a worse one purely because the first had claimed it. A dish may now reuse a claimed photo when the best free alternative is worse by more than `_FIT_TOLERANCE` (2, a whole band on the fit scale).
  - **The fail-open path must be loud.** It was silent once and the whole gate ran as a no-op for two releases while its logs said `kept`: the vision model reasons before answering, Groq bills that as completion tokens, and `max_tokens` was 400 (about the size of the `<think>` block alone). Every reply truncated before its JSON, every parse raised, and every photo was "approved". `_VISION_CHECK_MAX_TOKENS` is now 4000, truncation is detected by name, and any failure logs at WARNING with the raw reply. `verify_dish_photo` returns `shows == UNVERIFIED` so a caller can tell "the model said fine" from "the model never answered". **A check that cannot fail visibly is not a check**, which `tests/test_vision_contract.py` pins.
  - **Two signals, not one.** Before a photo reaches the vision model, `_contradicts` drops any whose own caption names a **different main ingredient** (`_MAIN_INGREDIENTS`): lamb chops are not pork ribs, paneer tikka masala is not chicken tikka masala. It fires only when both the dish query and the caption name a protein, so a caption naming none is left to the model. This is the cheap half of the check and it also saves a vision call. It exists because Pexels 30858420 is titled "paneer tikka masala" while the model read it as chicken and rated it 10/10; when the caption and the pixels disagree about the protein, spend the shortlist on a photo where they agree.
  - **The budget has to fit the reasoning, not the answer.** Live replies run 1.8k to 13.7k characters, because the model second-guesses itself hardest on exactly the ambiguous photos the check exists for. 400 truncated everything; 4000 still truncated one; it is 8000 now, and the prompt tells it to reach a verdict without re-examining. The answer itself is ~40 tokens. Billing is on tokens generated, so an unused cap is free.
  - It is a **veto, never an approval**. A broken or unreachable model returns `(True, 0.0, "unverified")` and the text-matched choice stands, because a flaky vision call must not strip every recipe of its image. `IMAGE_VISION_CHECK=0` disables it entirely.
  - If all three are rejected the endpoint returns `{url: null}` and **does not fall through to unchecked candidates**: they rank lower, so they are worse, and shipping an unlooked-at photo is how the wrong image got out to begin with.
  - A verified TheMealDB name match **skips the gate**: it is a photograph of that exact recipe, which is stronger evidence than a vision model's opinion of a stock photo.
  - The check downloads a small variant (`src.medium`), not the one displayed, to keep image tokens down. The endpoint takes `cuisine` for this reason alone.
  - Judgment is only testable against a live model: `scripts/check_dish_photo.py` runs the real pipeline over the dishes that have gone wrong so far. `tests/test_image_vision.py` stubs the model and pins the wiring.
- **Generation prewarms its own dishes.** Vetting a photo measured 10-15 seconds, and on the old flow that whole wait sat between the tap and anything appearing, because the lookup only started on modal-open. `/meals/generate` and `/meals/swap` now call `prewarm_dish_images` (fire-and-forget, exceptions swallowed) so the work overlaps with the user reading the card, and `/images/search` is normally a cache hit. Both paths go through `resolve_dish_image`, so they share caching, rate limits and vetting. An image is never worth delaying or failing a meal response over.
- **The vision check reads the recipe's own description.** `desc` carries the generator's text ("色泽红亮，酱香浓郁") into the prompt, so a candidate is compared against what THIS recipe says it looks like rather than the model's generic idea of the name. That is the difference between a dark glossy soy braise and a chilli-oil Sichuan one, which are both honestly "red braised pork ribs". It is read only by the check, so it stays out of the cache key: rewording a description must not orphan a resolved photo.
- **Last rung: a generated photo, and only ever last.** Some dishes are not in a Western stock library at all. Pexels's 红烧排骨 is a Sichuan chilli-oil braise in a pool of red sauce, correctly matched and still the wrong dish. When every real candidate has been rejected, `ai/imagegen.py` generates one with the Gemini image API (the `GEMINI_API_KEY` that was already in `.env`, unused), stores it in a public Supabase bucket under a deterministic name, and serves that URL. `IMAGE_GENERATION=0` disables it; with no key the cascade just ends at null as before. **A generated image is not a photograph of real food, so it must never displace one that is** — hence it runs after everything, never as a ranking option.
  - This is coupled to the vision check: generation only fires when the gate rejects everything, so a photo the gate wrongly *accepts* is never replaced. That is why `desc` matters, and why the two shipped together.
  - Generated images are **downscaled before storage** (`shrink`, 1280px long edge, JPEG q82). The first real generation was 882KB for a header that renders 200px tall; stock photos arrive around 80KB. Pillow is a hard requirement for this and a soft one for the app: if it is missing the bytes go through unchanged rather than losing the image.
  - `_vision_slots` caps vision calls **in flight across the process** at `_VISION_CONCURRENCY` (4). Three per dish is fine on its own, but prewarm means several dishes resolve at once, and a live run already drew 429s from Groq. Queueing costs a moment; a 429 costs two seconds of backoff.
- **Do NOT add `locale` to the Pexels search.** It was tried and reverted the same day. Asking in the dish's own language does surface photos that cuisine's photographers tagged, and it also returns their captions in that language; `_normalize` keeps only `[a-z0-9]`, so every caption tokenised to nothing, scored 0.00, and four dishes went from a working shortlist to no image at all with nothing in the logs but two 200s from Pexels. Scoring and the search have to speak the same language. Pinned by `tests/test_image_specificity.py`.
- **`image_query` is the real fix.** AI dish names are marketing copy and search badly, so `meal_generate_prompt` asks for a plain visual description alongside the name ("Coq au Vin" → "braised chicken red wine"), carried on `GeneratedMeal.image_query` and passed as `hint`. MealDB is still searched by the **real dish name**; the hint only steers the stock-photo fallback. Old cached meals have no `image_query` and fall back to the name.
- **Results are cached** in the SQLite TTL cache (key `img:<version>:<query>|<hint>`): a found URL for 7 days, a miss for 6 hours (so a transient upstream failure — e.g. a rate-limited Pexels call — recovers on the next request). The same dish never re-hits the external APIs within the TTL. **Bump `_CACHE_VERSION` whenever the matching logic changes** — a wrong URL is otherwise served to every user for a week, which is what made the original bug so visible.
- **Rate-limited** 100 novel lookups/hour per IP (`image-search`). The cache is checked **before** the limiter, so cache hits/misses don't count — only genuine new external lookups do; normal browsing is never limited, but a flood of distinct queries (key-burning abuse) is capped. On limit it degrades to `{url: null}` and does **not** cache that, since the cap is transient. The endpoint is unauthenticated, so the limit is per-IP via `request.client.host`.
- Images shown as hero in the meal detail modal, rendered via **`expo-image`** (`contentFit="cover"`, `cachePolicy="memory-disk"`, 200ms fade) for memory+disk caching.
- **Fetched lazily**: each `MealSlotCard` only calls `searchMealImage` once its detail modal is first opened (guarded by a `fetchedImageFor` ref keyed on `meal.name`), not on card mount — so the growing meal stream no longer fires an image search per card up-front.
- Tests: `tests/test_image_match.py` (matching helpers, using real MealDB responses), `tests/test_image_endpoint.py` (the router end to end, upstreams mocked), `tests/test_image_distinct.py` (the Bulgogi/Bibimbap duplicate), `tests/test_image_specificity.py` (pork belly for pork ribs, plus the retry hole), `tests/test_image_vision.py` (the gate, model stubbed), `tests/test_vision_contract.py` (reasoning-model reply shapes, and failures staying distinguishable from passes), and `tests/test_image_prewarm.py`. All offline.
- **Pexels attribution** is requested by their API terms and the app does not currently show it. Open item if the app goes properly public.

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

### Guest mode (try before signing up)

"Look around first" on the landing page sets `isGuest` in the store (persisted;
cleared by `resetAll`, so signing out never leaves someone in it). A guest is
unauthenticated but is treated as admitted by the root layout's redirect, so
they reach the tabs.

- **Works anonymously**: generate, swap, recipe steps, confirm, shopping list,
  sharing, images. All of those endpoints already took `get_optional_user_id`;
  only `/recipes/generate` had to change (it was `require_user_id` purely for
  its rate-limit key). Locked by `tests/test_guest_endpoints.py`.
- **Gated** (`components/GuestGate.tsx`): pantry, saved recipes, history. Each
  screen exports a thin wrapper that renders the gate for guests — **the wrapper
  is the default export so the real screen's hooks never run for a guest**; do
  not turn this into an early return inside the screen.
- **The Pantry gate keeps its cart button.** Shopping is `href: null` and only
  reachable from the Pantry header, so dropping the cart would strand a guest
  with a list they built and cannot open. `GuestGate` takes `headerRight` for
  exactly this.
- **Profile stays fully usable** — it is local state sent inline with every
  generate call, so it really does shape suggestions. `handleSave` skips the
  server round trip for guests, and the sign-out button becomes account CTAs.
- Any new account-bound write reachable from Today or Shopping needs an
  `isGuest` guard (see `handleSaveMeal`, `handleDoneShopping`, the shopping
  auto-save and AppState sync).
- **Guest → account handoff** (`app/_layout.tsx`): on the first session after
  guest mode, each store is checked on the server before being touched —
  **server empty → push the local copy up; server has data → adopt it.** Never
  push blindly (that overwrites a real account with a throwaway guest session)
  and never pull blindly (that wipes what convinced them to sign up). `isGuest`
  clears only after profile, shopping list and pantry all settle, and the
  redirect effect holds while `migrating` is true so a new account is not
  bounced through onboarding and straight back out.

---

## Serving Size Scaler

- `servings` in the store is the user's default preference (**default 1**).
- `planServings` tracks the servings count used when the current stream was generated.
- Meal card detail modal has a stepper (`displayServings`) that scales ingredient amounts relative to `planServings`.
- `scaleIngredientStr()` parses leading numbers in ingredient strings (e.g. "100g chicken") and applies the scale factor; non-numeric quantities get a `~` prefix.

---

## Meal Ratings / Dislike

- Rating a meal "down" and swapping calls `swapMeal`, which passes `avoid_meals` (today's `seenMeals`) + prior disliked meals to the prompt so none are re-suggested.
- **Saving a recipe records an "up" rating**: the app's only positive taste signal. Every save path goes through `saveRecipeAndRate` (`utils/saveAndRate.ts`) rather than `saveRecipe` directly, so Today, recipe search, the Recipes tab, URL import, history, and shared meals all feed it; wire any new save flow through that helper. It also bumps the store's ephemeral `savedRecipesVersion`; the Recipes tab skips its focus refetch unless that version moved (or the user pulls to refresh), so a recipe saved from another screen — recipe search, URL import, history — only appears in the list because of that bump. `meal_generate_prompt` builds a TASTE PROFILE block from the most recent 15 "up" names (weakest priority tier: safety > filters > pantry > taste; never suggests the exact dishes again, leans toward similar cuisine/flavour). Locked by `tests/test_meal_prompt.py`.
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
- **Rate limiting (every AI / external-cost endpoint)**: all paid-AI and external-API endpoints go through `ai.sqlite_cache.rate_limit_check(key, action, max, window)`. Key = `user_id` for authed-only endpoints, else `user_id or request.client.host` for optional-auth ones (anon falls back to IP). The Procfile runs uvicorn with `--proxy-headers --forwarded-allow-ips="*"`, so behind Railway's proxy `request.client.host` is the real client rather than the 100.64.0.x internal address; **keep those flags** or every anonymous user silently shares one bucket again. Current caps: meals generate+swap share **150/hr** (`meal-ai`); shopping generate **40/hr** (`shopping-ai`); recipe parse **20/hr per IP**; recipe generate **30/hr**; receipt scan **10/hr**; share create **30/hr**; image search **100 novel lookups/hr per IP** (cache hits exempt). Don't leave a new AI endpoint unlimited — it's an unauthenticated cost/abuse vector. **Request models also bound their prompt-feeding fields** (`db/models.py`: meal/swap pantry ≤500, avoid_meals ≤300, slots ≤3, required_ingredients ≤2000 chars; shopping recipes ≤20; parse url ≤2000; dish_name ≤200; share payload ≤100KB in the router) so a single request can't stuff megabytes into a paid completion — give any new AI-bound field a sane `Field(max_length=…)`.
- **Backend error handling**: `ValueError` → HTTP 422; `GroqTransientError` (RateLimitError/APIConnectionError/APIStatusError) → HTTP 503; uncaught exceptions → HTTP 500. **Never leak `{exc}` in client responses** — routers route their generic `except Exception` through `utils/errors.server_error(context, exc, message)`, which logs the full exception with traceback server-side (logger `wotoeat`) and returns a fixed, user-safe `detail`. The 422 (`ValueError`) and 503 (`GroqTransientError`) bodies are kept verbatim because the frontend keys off them (`no_receipt`/`no_food_items`/`unreadable_receipt` in `scan.tsx`; `no dish`/`required tags` in `discover.tsx`); the user-facing `/recipes/parse` fetch-failure 422 is also kept (it surfaces the user's own bad/blocked URL).
- **AI JSON parsing**: all AI-returning helpers in `ai/claude.py` parse via `_parse_ai_json(text)`, which wraps `json.loads(_clean_json(...))` and converts a truncated/garbled reply's `JSONDecodeError` (a `ValueError` subclass) into a clean `ValueError("The AI response was incomplete. Please try again.")` — otherwise the router would surface a raw `422: Expecting value: line 1 column N`. The receipt transcribe/normalize helpers keep their own try/except that maps parse failures to `unreadable_receipt`.
- **`EXPO_PUBLIC_API_URL` is required in production builds**: `services/api.ts` falls back to `http://localhost:8000` only when `__DEV__`, and throws otherwise. A Vercel or EAS build missing the var used to look like a total backend outage ("network error" everywhere) instead of a misconfigured build.
- **Client-facing error text**: the frontend shows the backend's `detail` via `apiErrorMessage(err, fallback)` (`services/api.ts`) — prefers `err.response.data.detail` (the friendly 503/429/validation messages) over Axios's raw "Request failed with status code N", falling back to a localized message for network errors. Used by every API-backed screen; **auth screens keep Supabase's own messages** (they're already meaningful).
- **Sharing goes through `utils/share.ts shareText()`** (never raw `Share.share`): react-native-web's `Share.share` needs `navigator.share`, which desktop browsers mostly lack, so the util falls back to copying to the clipboard and returns `"shared" | "copied" | "failed"` — callers show "copied" feedback (Today reuses its toast; Recipes/Shopping morph the share icon into a checkmark for 2.5s; i18n key `link_copied`).
- **Destructive actions confirm cross-platform** via `confirmAction()` (`utils/confirm.ts`). RN's `Alert` is a no-op on react-native-web, so web needs a `window.confirm` branch. Used by Today's clear (wipes the day's meal stream + confirmations), Profile's sign-out, and Shopping's "Done shopping". Call that helper for any new destructive control rather than re-adding a `Platform.OS === "web"` branch. Sign-out also runs `resetAll()` in a `finally` so a failed network sign-out can't leave stale local data.
- **Pantry writes must preserve `category`**: any code path that rebuilds the pantry list for `replacePantry` (picker save, scan merge) must carry each surviving item's `category` override through — bare `{name}` rows silently wipe user-assigned categories locally AND server-side. `PantryTagPicker` selection is case-insensitive (ci name → exact stored name) so an existing "Chicken Breast" lights up the built-in "chicken breast" chip instead of saving a case-variant duplicate.
- **SSRF guard on URL fetch**: `utils/scraper.py` (`/recipes/parse`) accepts a user-supplied URL, so `_assert_public_http_url()` enforces an http(s)-only scheme allowlist and resolves the host, rejecting any answer in loopback/private/link-local/reserved/multicast ranges (blocks cloud metadata `169.254.169.254`, `localhost`, internal hosts). Redirects are followed **manually** (`follow_redirects=False`, max 5 hops) so every hop is re-validated — a public URL can't 30x-redirect into an internal address.
- **Cache key**: MD5 of sorted JSON of the filters dict (excluding `recent_ratings` for plan cache keys to avoid thrashing). **`avoid_meals` is NOT excluded** — it must stay in the key so a growing exclusion list forces fresh, non-repeating results.
- **Reasoning tokens count as output**: both current Groq models reason before answering, and those tokens are billed as completion tokens AND spend the `max_tokens` budget. `_create_with_retry` applies `reasoning_effort` (env `GROQ_REASONING_EFFORT`, default `low`) to every call; models that 400 on the parameter are remembered in `_no_reasoning_effort` and retried without it, so pointing `GROQ_TEXT_MODEL` at a non-reasoning model still works. If recipe generation starts 422ing with "response was incomplete", check this is still being applied **before** raising any `max_tokens` — at default effort the elaborate dishes truncate, at `low` they use ~40% of budget.
- **Token limits**: budgets are right-sized to the response so Groq's per-minute token (TPM) reservation — which counts the *requested* `max_tokens`, not just what's generated — isn't blown on every call (the old flat 6000 was a 3-meal-era leftover and caused 429→503 rate-limit storms now that generation is one meal per call). `generate_meal_plan`/`swap_meal` use `_meal_max_tokens(n_slots)` (≈3600 for one slot); `generate_recipe_by_name` uses 4500; `parse_recipe` uses 4000. A single rich meal/recipe response is ~1.5–2k output tokens, so these are comfortably above the truncation threshold. Don't raise them back toward 6000 — that reintroduces the rate-limit storms. If a response ever truncates (→ 422 on JSON parse), bump that one call's budget by ~1000, don't blanket-raise.
- **CORS**: `main.py` allows `GET, POST, PUT, PATCH, DELETE, OPTIONS`. `PATCH` is required for `/recipes/{id}/labels`.
- **Pantry replace**: frontend calls `POST /pantry/` (not `/pantry/replace`) with body `{ items: [...] }`.
- **AI JSON cleaning**: `_clean_json()` strips markdown fences that some models prepend, **and any `<think>…</think>` reasoning preamble** (it keeps everything after the last `</think>`, which also survives a swallowed opening tag). Both current Groq models are reasoning models; qwen always emits a think block before the JSON, and without the strip every receipt scan fails as `unreadable_receipt` and every recipe/shopping call 422s as "response was incomplete". Locked by `tests/test_clean_json.py`.
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
