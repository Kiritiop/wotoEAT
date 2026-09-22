---
name: check
description: Run the full wotoEAT verification suite (frontend typecheck + lint + unit tests, backend offline tests, emoji scan). Use before any commit, after any multi-file change, or when asked "did anything break" or "test everything".
---

Run every step even if an earlier one fails, then report all failures together.
All paths are relative to the repo root.

## Steps

1. Frontend typecheck:
   `cd wotoeat-app && npx tsc --noEmit`
2. Frontend lint:
   `cd wotoeat-app && npm run lint`
3. Frontend unit tests (pure logic, no RN runtime):
   `cd wotoeat-app && npm test`
4. Backend offline tests (no network or API key needed; each exits non-zero on
   failure). **This list must stay identical to the one in
   `.github/workflows/ci.yml`.** It drifted once, down to the first five, which
   meant a green /check said nothing about the image cascade or guest mode:
   ```
   cd wotoeat-api
   for t in test_scraper_ssrf test_clean_json test_models test_profile_constraints \
            test_meal_prompt test_image_match test_image_cascade \
            test_image_prewarm test_imagegen test_guest_endpoints; do
     venv/bin/python tests/$t.py || echo "FAILED: $t"
   done
   ```
5. Emoji scan (product rule: no emojis in app source or locales):
   ```
   grep -rnP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{FE0F}]' \
     wotoeat-app/app wotoeat-app/components wotoeat-app/locales wotoeat-app/constants wotoeat-api/ai \
     --include='*.ts' --include='*.tsx' --include='*.py' || true
   ```
   Any hit is a failure unless it is a documented exception.
6. If locale files were touched in the working diff:
   `cd wotoeat-app && npm run translate:audit`

## Reporting

- All green: say so in one line, listing what ran.
- Failures: quote the actual error output, say which step, and whether it
  looks caused by the current working-tree changes or pre-existing (check
  `git stash` only if the user asks; normally just reason from the diff).
- Do not fix failures silently; report first, fix when asked or when the fix
  is unambiguous and within the current task's scope.
