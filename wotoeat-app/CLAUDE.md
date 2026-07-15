# wotoeat-app — Frontend Guide

You are working on the Expo React Native frontend of wotoEAT (iOS, Android,
and web from one codebase). This file is the practical guide for day-to-day
work here. The root `../CLAUDE.md` is the full reference (screen map, store
fields, conventions with their reasons); check it before changing anything
non-trivial, and update both files when behaviour changes.

## Setup and run

```bash
cd wotoeat-app
npm install
cp .env.example .env      # EXPO_PUBLIC_API_URL etc; see root CLAUDE.md
npx expo start            # Metro; press w for web, i for iOS simulator
```

For testing against a local backend, `EXPO_PUBLIC_API_URL=http://localhost:8000`
and run uvicorn in `../wotoeat-api`. To view on a physical phone, use the LAN
IP (`ipconfig getifaddr en0`) instead of localhost.

## Verify before you say "done"

```bash
npx tsc --noEmit          # must be clean
npm run lint              # expo lint, must be clean
npm test                  # unit tests for the pure logic (tsx --test, fast)
npm run translate:audit   # only if you added/changed locale strings
```

Unit tests live in `tests/unit/*.test.ts` (node:test via `tsx`, which resolves
the `@/` alias) and cover the pure logic: `utils/pantryMerge.ts` (scan merge,
done-shopping) and `utils/shopping.ts`. Add cases there when you touch those
files. Screens have no test suite — verification means launching the app and
exercising the changed screen, on web at minimum. Web is a first-class target
(the app ships to Vercel), so test web even for "native" features.

## Map

| Path | What lives here |
|---|---|
| `app/` | Screens (Expo Router, file-based). `(tabs)/` are the 4 main tabs plus hidden ones. |
| `app/_layout.tsx` | Root layout: auth listener, date-rollover reset, redirects |
| `components/ui/` | Shared primitives: Button, Chip, Card, SectionLabel, ScreenHeader, PinnedBar. Use these, never re-declare a green pill. |
| `components/` | Feature components (MealCard, PantryTagPicker, ...) |
| `store/useAppStore.ts` | The one Zustand store, persisted to AsyncStorage |
| `services/api.ts` | All HTTP. Auth/401/429 interceptors live here. |
| `hooks/useTheme.ts` | Design tokens: palette, space, radius, fontSize, shadows |
| `hooks/useDynamicTranslation.ts` | AI-content translation + pantry display names |
| `constants/filters.ts` | Cuisines, tags, TAG_ZH translation table, pantry categories |
| `locales/en.ts`, `locales/zh.ts` | Static UI strings. Both files must have identical keys. |

## Rules that are not optional

1. **No emojis anywhere in the app UI.** Icons come from the icon set, not
   emoji characters. This is an explicit product decision.
2. **No gradients.** `expo-linear-gradient` was removed on purpose. Solid
   colours from `useTheme()` only.
3. **Every user-visible string goes through i18n**: add the key to both
   `locales/en.ts` and `locales/zh.ts`, use `useTranslation()`. Never
   hardcode display text.
4. **Web parity.** RN `Alert.alert` is a no-op on web — destructive
   confirmations go through `utils/confirm.ts confirmAction()`, which handles
   the `window.confirm` fallback; don't hand-roll the Platform branch.
   `keyboardType` is ignored on web, so numeric inputs must
   `parseInt(v, 10)` and reject `NaN` before storing.
5. **Styles are memoized**: `const styles = useMemo(() => makeStyles(c), [c])`.
   Design values come from theme tokens, not ad-hoc numbers.
6. **Do not add food images to the Today meal cards.** Images load lazily when
   a detail sheet opens; this is a deliberate performance decision.
7. **Pantry writes must carry `category` through.** Any `replacePantry` payload
   built from the existing list must preserve each item's `category` or user
   categorization is silently wiped.
8. **Sharing goes through `utils/share.ts shareText()`**, never raw
   `Share.share` (desktop browsers lack `navigator.share`).

## Things that look like bugs but are features

- The day's meal stream and `seenMeals` surviving an app restart is intentional
  (prevents same-day repeats). It resets only at date rollover or sign-out.
- Matched receipt-scan rows defaulting to unchecked is intentional (they are
  already in the pantry).
- The landing page not showing for signed-in users is intentional.
- `shopping.tsx` and `history.tsx` are real screens but hidden tabs
  (`href: null`), reached programmatically.

## Common tasks

**Add a screen:** create the file under `app/`, register concerns in
`_layout.tsx` if it needs header/auth handling, use `ScreenHeader` at the top,
add strings to both locale files, add the screen to the root CLAUDE.md map.

**Call a new backend endpoint:** add the function to `services/api.ts` (the
axios instance handles auth and retries), surface errors with
`apiErrorMessage(err, fallback)`.

**Add persisted state:** extend `store/useAppStore.ts`. Think about when it
resets: language change, sign-out, and date rollover each clear specific
fields, and new fields usually need a decision for each.

## Deployment

- **Web:** Vercel auto-deploys from pushes to `main` (`vercel-build` script =
  `expo export --platform web`). A push to main is a production deploy.
- **Vercel env:** only `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_WEB_URL`. All `EXPO_PUBLIC_*`
  values are baked into the public JS bundle, so never put the service-role
  key or any secret there.
- **Native:** EAS builds (`npm run build:ios` / `build:android`). Before any
  store build run `eas env:list` and confirm the Supabase vars and
  `EXPO_PUBLIC_WEB_URL` are present, or the build ships with auth broken.
  Native permission changes in app.json only take effect in a fresh EAS build.
