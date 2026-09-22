---
name: env-audit
description: Audit wotoEAT environment variables across local .env files, Vercel, Railway, and EAS. Use when auth breaks, deploys misbehave, a new env var is added, when setting up a new machine, or before a store build.
---

Env drift between the four surfaces (local, Railway, Vercel, EAS) is the most
common cause of "it works locally but production is broken" in this project.

## What each surface must have

| Surface | Vars | Notes |
|---|---|---|
| `wotoeat-api/.env` (local) | Everything in `wotoeat-api/.env.example` | `SUPABASE_KEY` = service-role key |
| Railway service settings | Same set as the api .env.example | Service-role key here too; anon key silently breaks pantry writes via RLS |
| `wotoeat-app/.env` (local) | Everything in `wotoeat-app/.env.example` | `EXPO_PUBLIC_API_URL` = localhost:8000 or Railway URL |
| Vercel env | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_WEB_URL` | NEVER any secret: EXPO_PUBLIC_* is baked into the public bundle |
| EAS env | Same four as Vercel | eas.json bakes NOTHING since the open-source prep; ALL four must be set via `eas env:create` or the store build throws on startup or ships with auth broken |

## Steps

1. Diff each local `.env` against its `.env.example`: report vars missing
   from `.env` and vars read in code (`grep -rn "os.getenv" wotoeat-api`,
   `grep -rn "EXPO_PUBLIC_" wotoeat-app --include='*.ts*' -l`) but absent
   from the example.
2. Check remote surfaces with the CLIs where available:
   - `vercel env ls` (run in `wotoeat-app/`)
   - `eas env:list` (run in `wotoeat-app/`)
   - Railway has no reliable CLI listing here; give the user the exact
     checklist of expected vars to eyeball in the Railway dashboard.
3. Sanity checks:
   - No service-role key or GROQ key anywhere in `wotoeat-app` or in Vercel/EAS.
   - `.env` files are git-ignored and not in `git status`.
   - Production `EXPO_PUBLIC_API_URL` points at the Railway URL, not localhost.
4. Report as a table: surface, missing vars, wrong/suspect vars, and the
   exact command or dashboard step to fix each. Do not print secret values;
   refer to keys by name only.
