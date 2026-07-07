# Design: Closing the Pantry Loop

Status: proposed, not started. Written 2026-07-06.

## Problem

The product loop is one-directional. The pantry feeds generation and the
shopping list, but nothing ever flows back:

1. Shopping check-offs never write back to the pantry (bought food does not
   become pantry food).
2. Nothing consumes the pantry after cooking (cooked food does not leave).
3. meal_history is write-only and ratings are device-local, so generation
   never learns what the user actually cooked or liked.

Each of these is a separate, independently shippable phase below, ordered by
value divided by risk.

## Foundational decision: the pantry stays name-only

No quantities, no units, anywhere. Adding quantities would touch every layer
(schema, receipt scan, semantic matching, shopping subtraction, every pantry
UI) and users will not maintain gram counts by hand. Consumption is therefore
modelled as review-and-remove: the app proposes which items were used up and
the user confirms. Wrong guesses cost one tap. This also means "partially
used" does not exist; an item is either still worth cooking with or it is not,
and the user decides.

## Phase 1 — Shopping check-offs flow into the pantry

Smallest change, immediate value, no backend or schema work.

### UX

The Shopping tab gets one new primary action in a `PinnedBar`: **"Done
shopping"**, enabled when at least one item is checked. Tapping it confirms
(cross-platform confirm pattern: `window.confirm` on web, `Alert.alert`
native): "Add N checked items to your pantry and remove them from the list?"
On confirm, checked items move to the pantry and disappear from the list;
unchecked items stay. Show the existing toast pattern on success.

Check-off itself stays a visual in-store gesture; nothing happens until the
user says shopping is done. No automatic writes on toggle.

### Mechanics

- Collect checked `ShoppingItem`s across all `ShoppingGroup`s
  (`store.shoppingList.groups`).
- Normalize each name with `toCanonicalEnglish` (constants/filters.ts), the
  same convention scan and tags use.
- Merge into the pantry by reusing `computeScanMerge`. Move it from
  `app/pantry/scan.tsx` to `utils/pantryMerge.ts` (pure, exported; scan.tsx
  re-exports so nothing else moves). Shopping items are "unedited rows that
  matched nothing or matched existing", which the merge already handles:
  ci-dedupe, never removes, preserves each surviving item's `category`
  (critical, see Known Patterns in CLAUDE.md).
- Persist: authed users `await replacePantry(merged)` exactly like
  scan-confirm (not fire-and-forget); on failure stay on the screen, show
  `apiErrorMessage`, change nothing locally. Anonymous users get the local
  store update only, consistent with the rest of the pantry.
- Only after persistence succeeds: rewrite `shoppingList` with checked items
  removed, dropping groups that become empty (same shape logic as
  `removeShoppingCategory`).

### i18n

Stored names are canonical English; display already goes through
`usePantryDisplay`. Two new locale keys in both `locales/en.ts` and
`locales/zh.ts`: the button label and the confirm sentence.

### Tests / verification

Extract the "checked items + pantry -> merged pantry + remaining list" logic
as one pure exported function next to `computeScanMerge` so a future test
runner can cover it. Manual verification: web + one native surface, with a
pantry containing a category override and a case-variant duplicate.

## Phase 2 — "I cooked this" and pantry consumption

Client-only again; the pantry write is still just `replacePantry`.

### UX

The confirmed meal card (detail modal footer, next to Share) gets an **"I
cooked this"** action. It opens a review sheet, mirroring the receipt-scan
review screen pattern:

- Lists the meal's ingredients that match pantry items, using the same
  matcher that renders the "In pantry" badge. Extract `pantryNameMatches`
  from `app/(tabs)/discover.tsx` into `utils/pantryMatch.ts` (it is currently
  a private function; the badge, the shopping auto-add, and this sheet must
  share one matcher or they will disagree).
- Each row is the matched pantry item, pre-checked if it is a perishable
  category, pre-unchecked if it is a staple category. Use the existing
  `categoryForItem` derivation: produce, protein, dairy default checked;
  condiments, spices, grains, oils default unchecked. Nobody finishes the
  soy sauce making one dish.
- Confirm removes the checked pantry items (`replacePantry` with them
  filtered out, categories preserved on survivors), awaited, with the same
  failure behaviour as scan-confirm.
- Below the list, one toggle, default off: "Add removed items to my shopping
  list" (re-buy convenience; reuses `addShoppingItem`).

Record the cook client-side: `cookedMeals: string[]` alongside `meals` /
`seenMeals` in the store, reset on the same date rollover, cleared on
sign-out. The card shows a subtle cooked state so the action is not repeated.

### Explicitly not in this phase

No automatic "did you cook this?" prompts, no server persistence of the
cooked event (that moves to Phase 3 where it earns its schema change), no
decrementing (name-only decision above).

## Phase 3 — Feedback into generation

The only phase with backend and schema work. Do it last; Phases 1 and 2 make
its input signals (cooked events) exist.

### Schema (run manually in the Supabase SQL editor, like all schema changes)

One new table:

```sql
create table meal_feedback (
  user_id uuid not null references auth.users(id),
  meal_name text not null,
  rating text check (rating in ('up','down')),
  cooked_count int not null default 0,
  last_cooked date,
  updated_at timestamptz not null default now(),
  primary key (user_id, meal_name)
);
```

Replaces nothing; device-local `ratings` keeps working for anonymous users
and stays the instant-UI source of truth.

### Backend

- `PUT /feedback` (authed, `require_user_id`): upsert rating for a meal name.
  `POST /feedback/cooked`: increment `cooked_count`, set `last_cooked`.
  Both cheap (no AI), still rate-limited (120/hr) and field-bounded
  (`meal_name` max_length 200) per the house rules.
- `POST /meals/generate` and swap: when authed, read the user's feedback
  server-side (one indexed query) and fold it into the prompt filters:
  - `down` ratings join the existing disliked/avoid handling.
  - `up` ratings and high `cooked_count` names go into a new PREFERENCE
    SIGNALS prompt block: "the user has enjoyed: X, Y, Z; favour similar
    styles and ingredients, do not just repeat these exact dishes".
  - `last_cooked` within 3 days joins avoid_meals for variety.
- Cache key policy: follow the existing precedent, `recent_ratings` is
  already excluded from the plan cache key to avoid thrash; server-side
  feedback is excluded the same way. Eventual consistency is accepted.
- Prompt safety hierarchy is unchanged: safety > active filters > preference
  signals. The new block sits below filters and must say so.

### Frontend

- `setRating` also fires the feedback endpoint when authed, fire-and-forget
  (a lost rating write is harmless; it re-sends on next rate).
- Phase 2's "I cooked this" confirm also calls `/feedback/cooked` when
  authed.
- On sign-in, hydrate local `ratings` from the server once so a new device
  inherits taste (server wins on conflict; both are capped at 100).

### Tests

- Offline prompt test in the `test_meal_prompt.py` style: PREFERENCE SIGNALS
  block present iff feedback given, absent otherwise, and positioned below
  the safety block.
- The feedback router is plain CRUD; cover the upsert path in a small
  offline test with the Supabase client faked, same pattern as existing
  tests.

## Rollout and effort

| Phase | Touches | Schema | Rough size |
|---|---|---|---|
| 1 Shopping -> pantry | shopping.tsx, store, utils, locales | none | small (one sitting) |
| 2 Cooked + consumption | discover.tsx, new sheet, store, utils, locales | none | medium |
| 3 Feedback loop | schema, new router, prompts.py, claude.py, api.ts, store | one table | medium-large |

Each phase ships independently and is verified with /check plus manual
web + phone passes before /ship.

## Open questions (decide before Phase 2/3, Phase 1 has none)

1. Staple-vs-perishable default check state: is the category heuristic good
   enough, or should there be a small curated staples list?
2. Should "I cooked this" exist for meals that were never confirmed for
   shopping (generated and cooked straight away)? Proposed: yes, same action
   on any of today's meal cards.
3. Anonymous users in Phase 3 get no feedback persistence. Acceptable, or
   should ratings ride the existing request payload harder (e.g. raise the
   100 cap)? Proposed: acceptable as is.
