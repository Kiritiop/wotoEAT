# Contributing to wotoEAT

Thanks for taking a look. Issues and pull requests are both welcome.

## Before you start

Read the "Known Patterns / Conventions" section of [CLAUDE.md](CLAUDE.md).
A fair amount of this codebase looks odd until you know why, and most of those
decisions have a specific failure behind them that is written down. If
something seems wrong but is documented, open an issue and ask before changing
it.

## Setup

See [Running it locally](README.md#running-it-locally). You need Python 3.12+,
Node 22+, a Groq API key and a Supabase project.

## Before you open a pull request

Run all of it. CI runs the same things and it is faster to find out locally.

```bash
cd wotoeat-app
npx tsc --noEmit
npm run lint
npm test

cd ../wotoeat-api
for t in test_scraper_ssrf test_clean_json test_models test_profile_constraints \
         test_meal_prompt test_image_match test_image_cascade \
         test_image_prewarm test_imagegen test_guest_endpoints; do
  venv/bin/python tests/$t.py
done
```

Then actually open the app and click through whatever you changed, on web at
minimum. The tests do not cover rendering.

## House rules

- **No emojis.** Not in the UI, not in code, not in commit messages, not in
  docs. CI fails the build on this.
- **No gradient colours in the UI.** Flat theme colours from `useTheme()`.
  `expo-linear-gradient` was removed on purpose; do not add it back.
- **Make the smallest change that solves the problem.** Do not reformat,
  rename or restyle code you were not asked to touch. A diff that is mostly
  noise is hard to review and hard to revert.
- **Update the docs in the same commit.** If you change behaviour, change
  `CLAUDE.md` (and the relevant sub-guide) with it. Those files being accurate
  is a feature of this repo, not an afterthought.
- Commit messages are short imperative sentences. Look at `git log` for the
  style.

## Things that need extra care

Five invariants are worth stating outright, because breaking one is worse than
a normal bug:

1. **JWT verification in `wotoeat-api/routers/auth.py` is the security
   boundary.** The backend uses the service-role key and isolates users solely
   by the verified `sub` claim. Never weaken it back to an unverified decode.
2. **Allergy and dietary constraints in the prompts are absolute.** People with
   real allergies use this. `tests/test_profile_constraints.py` exists to stop
   that silently regressing.
3. **Every AI endpoint is rate-limited and every prompt-feeding field is
   bounded.** An unlimited AI endpoint is an unauthenticated cost and abuse
   vector.
4. **Exception details never reach client responses.** Route generic failures
   through `utils/errors.server_error`.
5. **The SSRF guard on `/recipes/parse` stays intact.**
   `tests/test_scraper_ssrf.py` locks it.

## Reporting bugs

Open an issue with what you did, what happened, what you expected, and the
platform (web, iOS, Android). If it is a security issue, do not open a public
issue: see [SECURITY.md](SECURITY.md).
