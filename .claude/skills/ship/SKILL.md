---
name: ship
description: Verify, commit, and push wotoEAT changes to main. Use when asked to "commit", "push", "ship it", or "commit and push". Pushing to main deploys production (Railway + Vercel), so this always verifies first.
---

A push to `main` auto-deploys the backend (Railway) and web app (Vercel).
There is no staging. Never skip verification.

## Steps

1. Run the `check` skill (typecheck, lint, backend offline tests, emoji scan).
   If anything fails, stop and report; do not commit broken code unless the
   user explicitly says to.
2. Review `git status` and `git diff` for:
   - secrets or keys (never commit `.env`, tokens, service-role keys)
   - leftover debug code, console.log/print added during this session
   - unrelated files that should not ride along
3. If behaviour changed but `CLAUDE.md` (root or sub-guide) was not updated,
   update it now, in the same commit.
4. Commit. House style: short imperative sentence, optionally prefixed with
   an area like `docs:` or `a11y:` (see `git log --oneline`). No emojis.
   Group unrelated changes into separate commits.
5. Push to `origin main`.
6. After pushing, remind the user in one line what just deployed and, if the
   change involves env vars or `db/schema.sql`, spell out the manual step
   they still need to do (Railway/Vercel/EAS env change, or running the SQL
   in the Supabase SQL editor) since nothing applies those automatically.
