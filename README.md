# wotoEAT

An AI meal planner built around one question: **what should I cook with what I
have?**


https://github.com/user-attachments/assets/7198cdbf-e2e7-4198-9f31-5f381934a742


Live at **[wotoeat.com](https://wotoeat.com)**. You can try it as a guest
without making an account.

You tell it your health profile and what's in your pantry. It suggests one real
dish at a time, gives you the full recipe, and turns the meals you confirm into
a shopping list with your pantry already subtracted. Photograph a grocery
receipt and the items go straight into the pantry. Everything works in English
and Simplified Chinese.

## What it does

- **One dish at a time.** Each tap generates one meal and adds it to today's
  stream. Nothing repeats within a day. There's no weekly plan to maintain.
- **Pantry first.** Suggestions lean toward what you already own. A "pantry
  only" toggle restricts a dish to your pantry plus salt, pepper, oil and
  water, and says so when nothing real fits.
- **Allergies are hard constraints.** They override every other filter in the
  prompt. A filter combination that would break them returns "no match"
  instead of an unsafe dish, and every recipe screen shows a warning naming
  your allergies, because a prompt is not a guarantee.
- **Receipt scanning.** A photo becomes an editable list of food items that
  merges into the pantry without creating duplicates (scanning 鸡蛋 when you
  already have "eggs" won't add a second entry).
- **The loop closes.** "I cooked this" removes the ingredients a dish used.
  "Done shopping" moves what you bought into the pantry.
- **Real photos where they exist.** TheMealDB when it has that exact dish,
  otherwise an image generated from the recipe's own description.
- **Share links.** Any meal or recipe becomes a public read-only web page.
- **Guest mode.** Everything except pantry, saved recipes and history works
  without an account. Sign up later and your guest data comes with you.

## Stack

| Part | Tech | Hosted on |
|---|---|---|
| App | Expo SDK 54, React Native 0.81, Expo Router, Zustand | Vercel (web), EAS (iOS / Android) |
| API | Python 3.12, FastAPI, Uvicorn | Railway |
| AI | Groq: `openai/gpt-oss-120b` for text, `qwen/qwen3.6-27b` for receipt vision | |
| Images | TheMealDB, then Gemini image generation stored in Supabase Storage | |
| Data and auth | Supabase (Postgres with row level security, email auth) | Supabase |

## How it works

```
profile + pantry + filters
  -> POST /meals/generate      one dish; today's dishes sent as avoid_meals
  -> confirm a meal card       missing ingredients go on the shopping list
  -> POST /shopping/generate   AI subtracts the pantry semantically
  -> shop, tick items off, "Done shopping"  -> pantry
  -> receipt scan              -> pantry
  -> "I cooked this"           -> removes what the dish used from the pantry
```

A few things that aren't obvious from the code:

- **The backend is the security boundary.** It talks to Supabase with the
  service-role key, so it isolates users only by the `sub` claim of a JWT it
  has verified itself (HS256 secret or the project JWKS). Verification fails
  closed.
- **Every AI endpoint is rate limited** (SQLite counters keyed by user, or IP
  for guests) and every field that feeds a prompt has a length cap. An
  unlimited AI endpoint is a way to spend someone else's money.
- **`/recipes/parse` fetches user-supplied URLs**, so it resolves the host and
  refuses private, loopback, link-local and metadata addresses, and re-checks
  every redirect hop.
- **Exception details never reach the client.** Errors are logged server side
  and the client gets a fixed message.
- **Pantry names are stored in canonical English** and translated for display,
  so English and Chinese entries match each other.
- **Generated images are made once, ever.** They're keyed by dish and checked
  in the storage bucket before generating, so a redeploy doesn't pay to redraw
  everything.
- **No analytics, ads or tracking.** That's why there's no cookie banner.

## Repository layout

```
wotoeat-app/        Expo app (iOS, Android, web)
  app/              screens (file-based routing)
  components/       UI, including the shared kit in components/ui
  services/api.ts   every backend call
  store/            Zustand store, persisted to AsyncStorage
  tests/unit/       pure-logic tests
wotoeat-api/        FastAPI backend
  routers/          one file per endpoint group
  ai/               prompts, Groq client, SQLite cache and rate limits
  db/schema.sql     tables and RLS policies
  tests/            plain runnable test scripts
```

## Running it locally

You need Python 3.12+, Node 22+, a [Groq](https://console.groq.com) API key and
a [Supabase](https://supabase.com) project. A Gemini key is optional; without it
dishes TheMealDB doesn't know just have no header image.

**Database.** Run `wotoeat-api/db/schema.sql` in the Supabase SQL editor. It
creates the tables and turns on row level security.

**Backend**

```bash
cd wotoeat-api
python3 -m venv venv && venv/bin/pip install -r requirements.txt
cp .env.example .env
venv/bin/uvicorn main:app --reload
```

**Frontend**

```bash
cd wotoeat-app
npm install
cp .env.example .env
npx expo start          # press w for web, or scan the QR code with Expo Go
```

### Environment variables

Backend (`wotoeat-api/.env`, and Railway in production):

| Variable | What it's for |
|---|---|
| `GROQ_API_KEY` | All text and vision AI calls |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | The **service-role** key. The anon key makes writes fail on RLS |
| `SUPABASE_JWT_SECRET` | Only for projects on legacy HS256 signing. Unset on HS256 means every signed-in request gets a 401 |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `GEMINI_API_KEY` | Optional. Generates header images |
| `GROQ_TEXT_MODEL`, `GROQ_VISION_MODEL` | Optional model overrides. Leave unset unless you mean it; a pin to a retired model makes every AI call fail |

`.env.example` lists the rest, all with working defaults.

Frontend (`wotoeat-app/.env`, Vercel, and EAS):

| Variable | What it's for |
|---|---|
| `EXPO_PUBLIC_API_URL` | Backend URL. Required outside dev, the app throws without it |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | The **anon** key |
| `EXPO_PUBLIC_WEB_URL` | Base URL for share links. Needed on native |

Every `EXPO_PUBLIC_*` value ends up in the public JavaScript bundle. Never put
the service-role key or any other secret there.

## Tests

The backend tests are plain scripts, no pytest. Each exits non-zero on failure
and none of them touch the network or need a real key.

```bash
cd wotoeat-api
for t in test_scraper_ssrf test_clean_json test_models test_profile_constraints \
         test_meal_prompt test_image_match test_image_cascade \
         test_image_prewarm test_imagegen test_guest_endpoints; do
  GROQ_API_KEY=dummy venv/bin/python tests/$t.py
done

cd ../wotoeat-app
npx tsc --noEmit && npm run lint && npm test
```

GitHub Actions runs all of this, plus a scan that fails the build on emojis, on
every push and pull request.

## Timeline

How the project got here, roughly in order. `git log` has the rest.

**April 2026: MealMind.** It started as "MealMind", a blueprint for an app that
suggested 6 to 8 meals from filters and scraped recipes from other sites. The
first version had auth, a language toggle and localized tags within a day,
then recipe generation, macros and a serving scaler that week.

**The first auth mistake.** Supabase tokens wouldn't verify, and the quick fix
on day one was to decode the JWT without checking its signature. Because the
backend uses the service-role key, that meant anyone could forge a token and
read anyone's data. It was replaced in June with real verification against the
shared secret or the project JWKS, and that check is now the one thing I treat
as untouchable.

**May: pantry, allergies, tags.** Pantry tracking, calorie goals and allergy
tracking, tag-based filtering ("must include tofu"), and saved recipes. Groq's
free tier kept rate limiting me, so for a week everything ran on Gemini, then
went back to Groq once I'd cut token usage.

**June: receipt scanning and the meal stream.** Receipt scanning shipped as a
two-step pipeline: a vision model transcribes the receipt word for word, then a
text model turns "ORG BNLS CKN BRST" into "chicken breast". Splitting them made
each step testable and the vision model swappable. The three-meal daily plan
was replaced by a stream of single dishes that never repeats in a day, which
also fixed a lot of rate limiting, since one meal needs far fewer tokens than
three. URL recipe import and share links landed in the same round.

**Late June: wotoEAT.** Renamed from MealMind. The model had a habit of
inventing dishes like "Zesty Harmony Bowl", so the prompt gained an
authenticity rule and a lower temperature and now only suggests dishes that
exist. A UI overhaul replaced the gradients with a flat, warm design.

**July: closing the loop, and hardening.** "Done shopping" and "I cooked this"
made the pantry update itself. A security pass added rate limits and size caps
on every AI endpoint, an SSRF guard on URL import, and removed exception text
from error responses. CI, offline regression tests for the prompts (including
one that fails if allergies ever stop being enforced) and an accessibility
pass came in the same stretch.

**August: the model outage.** On August 17 every AI feature started failing
with 503s. It looked like Groq was over capacity, but Groq had retired the
models the app used, and a retired model's 404 was being reported as "try again
later". The fix was switching models, plus capping reasoning effort after the
new reasoning model burned half its token budget thinking and cut recipes off
mid-JSON.

**August: images.** Header photos went through the longest fight in the
project. Stock photo search kept returning a picture of a *similar* dish:
American BBQ ribs for Chinese braised ribs, paneer tikka for chicken tikka.
Each fix to the matching caught the last miss and let through a new one. In
the end the problem was supply, not matching: stock sites don't have a
canonical photo of most home dishes. Now it's TheMealDB when it has that exact
dish, and otherwise an image generated from the recipe's own description. Guest
mode shipped the same week.

**September: getting ready to go public.** Privacy policy, terms and an
in-app account deletion flow (app stores require one, and the app stores
allergy and body data), dead code removal, and SEO fixes. The homepage had
been exporting as an empty page, because it waited on a session check that
never finishes during the static build, so Google had nothing to index.

## Known limits

- The legal pages are drafts and haven't had a lawyer look at them. Every
  legal page says so.
- Ratings live on the device, and meal history isn't fed back into generation
  yet. Saving a recipe does count as a "like" that nudges future suggestions.
- Chinese translation of AI text uses an unofficial Google endpoint with a
  MyMemory fallback, and could break without warning.
- Rate limits and the AI cache are per process and reset on deploy.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the checks to run and the house rules. Security problems go through
[SECURITY.md](SECURITY.md), not a public issue.

## License

MIT. See [LICENSE](LICENSE).
