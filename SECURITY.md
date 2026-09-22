# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository, or by email to wzirui102348@gmail.com.

Please include what you found, how to reproduce it, and what an attacker could
do with it. I will acknowledge within a few days. This is a personal project
with no security team behind it, so please be patient, and please give me a
chance to fix it before publishing.

## Scope

This project runs a FastAPI backend with a Supabase service-role key, which
bypasses row-level security. That makes a few areas especially worth your
attention:

- **Authentication** (`wotoeat-api/routers/auth.py`). JWTs are verified against
  either the shared secret or the project JWKS, and the verified `sub` claim is
  the *only* thing isolating one user's data from another's. Anything that
  lets a request be attributed to the wrong user id is critical.
- **The SSRF guard** (`wotoeat-api/utils/scraper.py`). `/recipes/parse` fetches
  a user-supplied URL. The guard resolves the host and rejects private,
  loopback, link-local and reserved ranges, and revalidates every redirect hop.
- **Rate limits on AI endpoints.** These cost real money per call. A bypass is
  a denial-of-wallet issue, not just an abuse one.
- **Prompt injection** into meal or recipe generation, particularly anything
  that could make generated output ignore a user's stated allergies.
- **Shared items** (`/share/{id}`). These are public by design, but they should
  only ever expose the snapshot that was shared, never anything else.

## Out of scope

- Missing security headers on preview deployments.
- Rate limits being per-process rather than global (the cache is SQLite in
  `/tmp` and resets on deploy). Known, documented.
- Reports from automated scanners with no demonstrated impact.
- Social engineering, physical attacks, or anything requiring access to a
  user's unlocked device.

## Secrets

If you ever find a live credential in this repository or its history, report it
immediately by email rather than opening an issue.
