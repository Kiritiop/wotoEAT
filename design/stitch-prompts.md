# wotoEAT — Google Stitch Prompt Pack

How to use:
1. Paste the **Style Foundation** into Stitch's theme/settings once (set colors,
   font, corner radius), AND prepend it to each screen prompt.
2. On the first generation, **upload `wotoeat-app/assets/logo.png`** as a reference
   image so Stitch pulls the real palette + personality.
3. Generate **one screen per prompt**, in order. Use Experimental/high-quality mode
   for the hero screens (Today, Meal detail). Use Standard for simple ones.
4. Refine with **one small change per follow-up** — don't re-prompt from scratch.

---

## STYLE FOUNDATION (paste at top of every prompt)

```
App: "wotoEAT" — an AI meal-planning mobile app that answers "what should I cook
with what I have?" It generates one meal at a time from the user's health profile,
pantry, and filters, then turns confirmed meals into a shopping list.

Platform: iOS/Android mobile, portrait.

Vibe: warm, friendly, wholesome, approachable — a cheerful home kitchen, NOT a
clinical diet tracker.

Palette:
- Background: warm cream / off-white #FFFBEB
- Cards/surfaces: white, rounded 24px corners, soft subtle shadow
- Primary green #16A34A · Amber #F59E0B · Coral #F87171 · Indigo #6366F1
- Text #1A1A1A dark, #6B7280 muted · Error #EF4444

Type: friendly rounded sans-serif (Nunito / SF Rounded). Semi-bold headings,
generous spacing, clear hierarchy.

Components: rounded pill buttons, soft chips/tags, food photography in cards,
rounded line icons. Personality: playful — a smiley sun with a leaf sprout, a
veggie plate, soft curved "smile" accents, small leaf/dot flourishes.
```

---

## A. First-run & auth

### 1. Splash
```
Screen: app splash / loading. Centered wotoEAT logo on the cream background, with
the tagline "what to eat" in muted text below it. A subtle loading indicator near
the bottom. Minimal, warm, lots of breathing room.
```

### 2. Onboarding — step 1 (about you)
```
Screen: first-run onboarding profile setup as a friendly multi-step wizard (show
step 1 of 4). A progress indicator (dots or thin bar) at top. Title "Tell us about
you". Fields: age, sex (segmented chips), weight + height (with a metric/imperial
unit toggle), activity level (selectable cards). Primary rounded green "Continue"
button pinned at bottom + a "Skip" text link. Encouraging tone, one group per step.
```

### 3. Onboarding — step 2 (goals & diet)
```
Same onboarding wizard, step 3 of 4: "Your goals & diet". Selectable chip groups
for health goals (lose weight, build muscle, eat healthier, save time) and dietary
restrictions (vegetarian, vegan, halal, gluten-free…). Allergies as removable chips
with an "add" field. Optional calorie + protein goal inputs. Back + Continue buttons.
```

### 4. Sign up
```
Screen: account sign-up. Small wotoEAT logo at top. Title "Create your account".
Rounded email, password, and confirm-password fields with soft borders. A primary
green "Sign up" button. Below: "Already have an account? Sign in" link. Minimal,
warm, plenty of breathing room.
```

### 5. Sign in
```
Screen: sign-in. wotoEAT logo at top. Title "Welcome back". Email + password fields,
a "Forgot password?" link aligned right, a primary green "Sign in" button, and a
"New here? Create an account" link below. Warm and simple.
```

### 6. Forgot password
```
Screen: password reset. Title "Reset your password" with a short reassuring subtitle.
One email field, a primary "Send reset link" button, and a "Back to sign in" link.
Calm, minimal, lots of whitespace.
```

---

## B. Core tabs

### 7. Today / Discover (hero — use Experimental mode)
```
Screen: "Today" home/main screen — an AI meal feed where users get one meal at a
time. Top: a friendly greeting + small brand mark. A horizontal row of single-select
meal-type chips: Auto, Breakfast (amber), Lunch (green), Dinner (indigo). A
collapsible "Filters" affordance (cuisine, flavour, prep time, include-tags,
from-pantry). Then a vertically scrolling feed of meal cards, newest first. Each card
(white, rounded, soft shadow): hero food photo, dish name, short description, prep
time, small tag chips, a left color accent bar matching the slot, and an action row
(Confirm, Save, Swap). A floating rounded green "Generate a meal" button pinned
bottom-center.
```

### 8. Meal detail bottom sheet (hero — use Experimental mode)
```
Screen: meal detail bottom sheet (modal over the Today screen). Large hero food
image. Dish title + cuisine + difficulty. A serving-size stepper. A row of soft macro
stat pills (calories, protein, carbs, fat, fiber). A scrollable ingredient list —
each row shows amount + name, with a small green "In pantry" badge on owned items and
a cart toggle. Numbered step-by-step instructions. Tag chips. Footer with a Share
button and a primary green Confirm button.
```

### 9. Pantry
```
Screen: "Pantry". A list of owned food items grouped into labeled category sections
(Vegetables, Proteins, Dairy, Staples, Other) as soft chips/rows; each row has an
inline rename (pencil) and delete. Top toolbar: an "Add items" button, a "Scan
receipt" camera button, and a shopping-cart icon with a badge. A prominent "Generate
Shopping List" button pinned at the bottom. Friendly empty state with a food
illustration when empty.
```

### 10. Shopping list
```
Screen: "Shopping list". Items grouped by category in soft cards; each item a
checkable row with a round checkbox that strikes through when checked. A small
progress indicator (checked vs total). Top actions: Share (text) and Clear. A
secondary "Regenerate from meals" button. Warm, tidy, easy to scan while shopping.
```

### 11. My Recipes
```
Screen: "My Recipes" with a segmented control: Saved, Liked, Mine, History. A search
bar below it. A scrollable list/grid of compact recipe cards (food photo, title, prep
time, small tag chips). Top-right actions for "Import from URL" and "Generate recipe".
The History segment groups meals by day with date headers. Friendly empty state.
```

### 12. Recipe detail
```
Screen: recipe detail (full screen or large sheet). Hero food photo, recipe title,
servings + prep time + calories as stat pills, a serving-size scaler. Full ingredient
list, numbered steps, tag chips, optional source link. Header with a Share action and
a bookmark/favorite toggle. Warm and readable.
```

### 13. Profile
```
Screen: "Profile" / health settings as grouped cards. Sections: personal stats (age,
sex, weight, height, activity), goals (calorie + protein, health-goal chips), dietary
restrictions + allergies as removable chips, cuisine & flavour preferences, a
metric/imperial toggle, and a language toggle (English / 简体中文). A sign-out button
at the bottom. Clean, calm, rounded section headers.
```

---

## C. Secondary flows

### 14. Receipt scan — capture
```
Screen: receipt scanning capture. A camera viewfinder framing a grocery receipt with
corner guides and a hint "Line up your receipt". A large round shutter button at the
bottom, a "Choose from library" option beside it, and a close button top-left. Clean,
focused, minimal chrome.
```

### 15. Receipt scan — review
```
Screen: receipt scan review. A header counting found items with a small breakdown
subtitle ("3 already in pantry · 1 not food"). An editable list of extracted food
items: each row has a checkbox, the food name (inline-editable, pencil affordance),
and a subtitle with raw receipt text + quantity. Rows already owned show an "Already
in pantry" badge (unchecked); non-food rows show a grey "Not food" badge and sit last.
A primary "Add N items to pantry" button pinned at bottom.
```

### 16. Generate recipe by name (modal)
```
Screen: "Find a recipe" modal. A title and a single prominent search field "Enter a
dish name…" with a primary green "Generate" button. A few example chips (e.g. "Pad
Thai", "Shakshuka", "Mapo Tofu"). A servings stepper. A friendly loading state while
generating. Warm and inviting.
```

### 17. Import recipe from URL
```
Screen: "Import from URL". Title "Paste a recipe link", a URL input field, and a
primary "Parse recipe" button, with a short helper line about supported sites. After
parsing, a preview of the extracted recipe (title, ingredients, steps) with a "Save"
button. Clean and simple.
```

### 18. Public share view
```
Screen: public read-only shared meal/recipe page (mobile + desktop friendly). Hero
food image, dish/recipe title, macros as stat pills, ingredient list, numbered steps,
tag chips. A subtle "Made with wotoEAT" footer and a soft call-to-action button to
open the app. No edit controls. Warm, shareable, polished.
```

---

## D. System / shared

### 19. Bottom tab bar
```
Component: a rounded floating bottom navigation bar with 4 tabs — Today (home),
Pantry (basket), Recipes (book), Profile (person). Active tab in primary green with a
soft pill highlight + label; inactive tabs muted grey. Soft shadow, sits on cream.
```

### 20. Empty / loading / error states
```
Generate matching empty, loading, and error states: a friendly empty state (food/leaf
illustration + short message + action button), a warm loading state (soft skeleton
cards or a cooking-themed spinner), and a gentle error/offline banner (soft
coral/amber, rounded, non-alarming). All consistent with the wotoEAT cream + rounded
style.
```

---

## Screen → existing file map (for implementation)

| # | Screen | Existing file to restyle |
|---|---|---|
| 1 | Splash | `wotoeat-app/app/index.tsx` |
| 2-3 | Onboarding | `wotoeat-app/app/onboarding.tsx` |
| 4 | Sign up | `wotoeat-app/app/auth/sign-up.tsx` |
| 5 | Sign in | `wotoeat-app/app/auth/sign-in.tsx` |
| 6 | Forgot password | `wotoeat-app/app/auth/forgot-password.tsx` |
| 7 | Today | `wotoeat-app/app/(tabs)/discover.tsx` |
| 8 | Meal detail | `MealSlotCard` modal in `discover.tsx` |
| 9 | Pantry | `wotoeat-app/app/(tabs)/pantry.tsx` |
| 10 | Shopping list | `wotoeat-app/app/(tabs)/shopping.tsx` |
| 11 | My Recipes | `wotoeat-app/app/(tabs)/recipes.tsx` |
| 12 | Recipe detail | recipe modal in `recipes.tsx` |
| 13 | Profile | `wotoeat-app/app/(tabs)/profile.tsx` |
| 14-15 | Receipt scan | `wotoeat-app/app/pantry/scan.tsx` |
| 16 | Generate recipe | `components/FindRecipeModal.tsx` |
| 17 | Import from URL | `wotoeat-app/app/recipe/upload.tsx` |
| 18 | Share view | `wotoeat-app/app/share/[id].tsx` |
| 19 | Tab bar | `wotoeat-app/app/(tabs)/_layout.tsx` |

Drop exported screenshots next to this file (e.g. `design/today.png`) and ask me to
implement them against the mapped file.
