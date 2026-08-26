# wotoeat-api — Backend Guide

You are working on the FastAPI backend of wotoEAT. This file is the practical
guide for day-to-day work in this directory. The root `../CLAUDE.md` is the
full reference (every endpoint, model, and convention); read the relevant
section there before changing anything non-trivial. Update both files when
behaviour changes.

## Setup and run

```bash
cd wotoeat-api
python3 -m venv venv                # first time only
venv/bin/pip install -r requirements.txt
cp .env.example .env                # fill in keys (see root CLAUDE.md env table)
venv/bin/uvicorn main:app --reload  # http://localhost:8000
```

Always use `venv/bin/python` and `venv/bin/uvicorn`, never bare `python`
(this Mac has no `python` on PATH, and system python3 lacks the deps).

## Verify before you say "done"

Run the offline test suite (no network, no API key needed, each script exits
non-zero on failure):

```bash
venv/bin/python tests/test_scraper_ssrf.py
venv/bin/python tests/test_clean_json.py
venv/bin/python tests/test_models.py
venv/bin/python tests/test_profile_constraints.py
venv/bin/python tests/test_meal_prompt.py
venv/bin/python tests/test_image_match.py
venv/bin/python tests/test_image_endpoint.py
venv/bin/python tests/test_image_distinct.py
venv/bin/python tests/test_image_specificity.py
venv/bin/python tests/test_image_vision.py
venv/bin/python tests/test_guest_endpoints.py
```

`test_guest_endpoints.py` is the one to watch when adding auth: it pins which
endpoints must stay anonymous (the app's guest mode runs on them) and which must
keep returning 401.

`tests/test_receipt_normalize.py` needs a live `GROQ_API_KEY` and can flake;
only run it when you changed the receipt prompts.

## Map

| Path | What lives here |
|---|---|
| `main.py` | App setup, CORS, health check |
| `routers/` | One file per URL prefix (meals, recipes, pantry, profile, shopping, images, share, auth) |
| `routers/auth.py` | JWT verification. This is the security boundary. Do not weaken it. |
| `ai/prompts.py` | Every prompt template. Most product behaviour lives here, not in code. |
| `ai/claude.py` | Groq client wrappers, retries, token budgets, JSON parsing |
| `ai/sqlite_cache.py` | TTL cache + rate-limit counters (SQLite) |
| `db/models.py` | Pydantic request/response models, with field bounds |
| `db/supabase_client.py` | All Supabase reads/writes |
| `db/schema.sql` | Table definitions. Changes here must be run manually in the Supabase SQL editor; nothing applies them automatically. |
| `utils/scraper.py` | URL fetching with the SSRF guard |
| `utils/errors.py` | `server_error()` helper, keeps exception detail out of client responses |

## Rules that are not optional

These exist because of real incidents. The root CLAUDE.md explains each in full.

1. **Never weaken JWT verification** in `routers/auth.py`. The backend uses the
   service-role key (bypasses RLS); the verified `sub` is the only thing
   isolating users from each other.
2. **Every AI or external-API endpoint gets a rate limit** via
   `rate_limit_check`, and every request field that feeds a prompt gets a
   `Field(max_length=...)` bound. Unlimited endpoints are a cost-abuse vector.
3. **Never return `{exc}` to the client.** Route generic exceptions through
   `utils/errors.server_error`. Keep 422 and 503 bodies verbatim; the frontend
   string-matches them (`no_receipt`, `no dish`, etc).
4. **Do not raise `max_tokens` budgets back toward 6000.** Groq reserves the
   requested budget against the per-minute token limit, so oversized budgets
   cause 429/503 storms. If one response truncates, bump that one call by
   ~1000.
5. **Keep the SSRF guard intact** in `utils/scraper.py` and keep
   `test_scraper_ssrf.py` green if you touch it.
6. **Allergies and dietary restrictions are absolute.** The
   `_profile_constraints_block` hierarchy is safety > filters > preferences.
   Never let a prompt edit bury or soften it, and keep
   `test_profile_constraints.py` green.

## Common tasks

**Change how meals/recipes are generated:** edit the prompt in `ai/prompts.py`,
not the router. Then run `test_meal_prompt.py` and `test_profile_constraints.py`.
Remember both generate and swap use `meal_generate_prompt`.

**Add an endpoint:** router function → Pydantic models with bounded fields in
`db/models.py` → rate limit if it touches AI or external APIs → error handling
per rule 3 → add it to the endpoint table in the root CLAUDE.md.

**Add an env var:** read it via `os.getenv`, add it to `.env.example`, add it
to the env table in the root CLAUDE.md, and remind the user to set it in
Railway (backend vars live there in production, not in the repo).

**Change the model:** Groq models are env-overridable (`GROQ_TEXT_MODEL`,
`GROQ_VISION_MODEL`). Prefer changing the env default over hardcoding.
Current defaults: `openai/gpt-oss-120b` (text) and `qwen/qwen3.6-27b` (vision,
the only image-input model Groq offers). Groq decommissions models without
notice, and a removed model 404s into a blanket 503 on every AI endpoint, so
when everything 503s at once list the models first:
`curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"`.
After any model swap, re-run `test_clean_json.py` and the live
`test_receipt_normalize.py`, and check the new model's output actually parses:
both current models are reasoning models whose `<think>` preamble `_clean_json`
strips.

## Deployment

Railway auto-deploys from pushes to `main` (Procfile runs uvicorn). There is
no staging environment: a push to main is a production deploy. CI
(`.github/workflows/ci.yml`) runs these same offline tests on push, but it
does not block the deploy, so run the tests and typecheck the frontend
before pushing anything shared.

Production base URL is the Railway service URL; the frontend reads it from
`EXPO_PUBLIC_API_URL`. Backend secrets (GROQ, Supabase service-role key, JWT
secret, Pexels) live only in Railway service settings, never in the repo.
