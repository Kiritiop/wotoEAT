# wotoEAT

An AI meal planner built around one question: **what should I cook with what I
have?**

You tell it your health profile and what is in your pantry. It suggests one
real dish at a time, gives you the full recipe, and turns the meals you confirm
into a shopping list with your pantry already subtracted. Photograph a grocery
receipt and the items go straight into the pantry. Everything works in English
and Simplified Chinese.

Expo (iOS, Android, web) on the front, FastAPI on the back, Groq for the AI,
Supabase for auth and data.

## What it does

- **Meal stream, not a meal plan.** Each tap generates one dish, appended to
  today's stream. Nothing repeats within a day.
- **Pantry first.** Suggestions lean toward what you already own, and a
  "pantry only" filter restricts a dish to your pantry plus salt, pepper, oil
  and water.
- **Allergies are hard constraints.** Allergies and dietary restrictions
  override every other filter in the prompt, and a filter combination that
  would violate them returns "no match" rather than an unsafe dish.
- **Receipt scanning.** A photo becomes a reviewed, editable list of food
  items that merge into the pantry without creating duplicates.
- **The loop closes.** "I cooked this" removes the ingredients a dish used,
  and "Done shopping" moves what you bought into the pantry.
- **Real photos where they exist.** TheMealDB when it has the actual dish,
  otherwise an image generated from the recipe's own description.
- **Share links.** Any meal or recipe becomes a public read-only web page.

## Repository layout

```
wotoeat-app/    Expo React Native frontend (iOS, Android, web)
wotoeat-api/    FastAPI backend
design/         Design notes for in-flight work
CLAUDE.md       Full architecture reference (start here to work on the code)
```

`CLAUDE.md` at the root is the real documentation: architecture, every
endpoint, the prompt design, and the conventions that have history behind
them. `wotoeat-app/CLAUDE.md` and `wotoeat-api/CLAUDE.md` cover each half.

## Running it locally

You need Python 3.12+, Node 22+, a [Groq](https://console.groq.com) API key
and a [Supabase](https://supabase.com) project.

**Backend**

```bash
cd wotoeat-api
python3 -m venv venv && venv/bin/pip install -r requirements.txt
cp .env.example .env          # fill in GROQ_API_KEY, SUPABASE_URL, SUPABASE_KEY
venv/bin/uvicorn main:app --reload
```

`SUPABASE_KEY` must be the **service-role** key. Run `db/schema.sql` in the
Supabase SQL editor to create the tables.

**Frontend**

```bash
cd wotoeat-app
npm install
cp .env.example .env          # fill in EXPO_PUBLIC_API_URL and the Supabase anon key
npx expo start
```

Never put the service-role key in the frontend. Every `EXPO_PUBLIC_*` value is
baked into the public JavaScript bundle.

## Tests

The backend tests are plain scripts, no pytest. Each exits non-zero on failure
and none of them touch the network.

```bash
cd wotoeat-api
for t in test_scraper_ssrf test_clean_json test_models test_profile_constraints \
         test_meal_prompt test_image_match test_image_cascade \
         test_image_prewarm test_imagegen test_guest_endpoints; do
  venv/bin/python tests/$t.py
done

cd ../wotoeat-app
npx tsc --noEmit && npm run lint && npm test
```

CI runs all of the above on every push and pull request.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md)
for setup, the checks to run, and the house rules. Security issues go through
[SECURITY.md](SECURITY.md), not a public issue.

## License

MIT. See [LICENSE](LICENSE).
