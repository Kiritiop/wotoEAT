import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  Recipe,
  PantryItem,
  ShoppingList,
  ShoppingGroup,
  HealthProfile,
  DailyPlanMeal,
} from "@/services/api";

export type Language = "en" | "zh";
export type Rating = "up" | "down";

/**
 * The day-scoped slice: everything tied to today's meal stream. Four places
 * clear it (language change, manual clear, sign-out, date rollover) and they
 * must agree, so they share this one definition instead of four hand-maintained
 * field lists. A function, not a constant, so no two call sites can ever end up
 * holding the same array instance.
 */
const dayScopedReset = (): Pick<
  AppState,
  "meals" | "mealsDate" | "seenMeals" | "cookedMeals" | "selectedRecipes"
> => ({
  meals: [],
  mealsDate: null,
  seenMeals: [],
  cookedMeals: [],
  selectedRecipes: [],
});

interface AppState {
  // ── Auth ready (getSession has resolved, token is set) ────────────────────
  authReady: boolean;
  setAuthReady: (v: boolean) => void;

  // ── Health profile ────────────────────────────────────────────────────────
  profile: HealthProfile;
  setProfile: (profile: Partial<HealthProfile>) => void;

  // ── Language ──────────────────────────────────────────────────────────────
  language: Language;
  setLanguage: (lang: Language) => void;

  // ── Onboarding ────────────────────────────────────────────────────────────
  hasOnboarded: boolean;
  setHasOnboarded: (v: boolean) => void;

  // ── Meal stream (today's generated meals — a growing list, no daily plan) ──
  meals: DailyPlanMeal[];
  mealsDate: string | null;
  addMeal: (meal: DailyPlanMeal) => void;
  replaceMeal: (oldName: string, meal: DailyPlanMeal) => void;
  removeMeal: (name: string) => void;
  clearMeals: () => void;

  // ── Seen meals today (so generation/swap never repeats a shown dish) ───────
  seenMeals: string[];
  addSeenMeals: (names: string[]) => void;

  // ── Meals cooked today (marks "I cooked this"; resets with the stream) ─────
  cookedMeals: string[];
  addCookedMeal: (name: string) => void;

  // ── Meal ratings ──────────────────────────────────────────────────────────
  ratings: Record<string, Rating>;
  setRating: (mealName: string, rating: Rating) => void;
  clearRatings: () => void;

  // ── Selected meals for shopping list ─────────────────────────────────────
  selectedRecipes: Recipe[];
  addRecipe: (recipe: Recipe) => void;
  removeRecipe: (title: string) => void;
  clearSelectedRecipes: () => void;

  // ── Generation ingredient preferences (persisted — survive restarts) ──────
  // "Include tags" free-text tags + pantry items the user requires in meals.
  requiredIngredients: string[];
  setRequiredIngredients: (v: string[]) => void;
  selectedPantryItems: string[];
  setSelectedPantryItems: (v: string[]) => void;

  // ── Pantry ────────────────────────────────────────────────────────────────
  pantry: PantryItem[];
  setPantry: (items: PantryItem[]) => void;

  // ── Shopping list ─────────────────────────────────────────────────────────
  shoppingList: ShoppingList | null;
  setShoppingList: (list: ShoppingList) => void;
  toggleShoppingItem: (category: string, itemName: string) => void;
  clearShoppingList: () => void;
  addToShoppingList: (category: string, name: string) => void;
  removeFromShoppingList: (category: string, itemName: string) => void;

  // ── Recipe labels (favorite, frequent, done) ──────────────────────────────
  recipeLabels: Record<string, string[]>;
  addRecipeLabel: (recipeId: string, label: string) => void;
  removeRecipeLabel: (recipeId: string, label: string) => void;
  setAllRecipeLabels: (labels: Record<string, string[]>) => void;

  // ── Saved-recipes freshness ───────────────────────────────────────────────
  // Bumped by every successful recipe save (see utils/saveAndRate.ts). The
  // Recipes tab compares it against the version it last fetched, so a recipe
  // saved from another screen shows up when that tab is focused.
  savedRecipesVersion: number;
  markSavedRecipesStale: () => void;

  // ── Servings preference ───────────────────────────────────────────────────
  servings: number;
  setServings: (n: number) => void;

  // ── Servings used when the current meals were generated ───────────────────
  // Tracked so meal cards can compute a correct scale factor after navigation.
  planServings: number;
  setPlanServings: (n: number) => void;

  // ── Sign-out reset ────────────────────────────────────────────────────────
  resetAll: () => void;
}

const DEFAULT_PROFILE: HealthProfile = {};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // ── Auth ready ───────────────────────────────────────────────────────
      authReady: false,
      setAuthReady: (v) => set({ authReady: v }),

      // ── Health profile ──────────────────────────────────────────────────
      profile: DEFAULT_PROFILE,
      setProfile: (partial) =>
        set((state) => ({ profile: { ...state.profile, ...partial } })),

      // ── Language ────────────────────────────────────────────────────────
      language: "en",
      // Clear meals, seen-history, and shopping selections when language changes —
      // everything was generated in the old language so none of it is reusable.
      setLanguage: (lang) => set({ language: lang, ...dayScopedReset(), shoppingList: null, requiredIngredients: [] }),

      // ── Onboarding ──────────────────────────────────────────────────────
      hasOnboarded: false,
      setHasOnboarded: (v) => set({ hasOnboarded: v }),

      // ── Meal stream ──────────────────────────────────────────────────────
      meals: [],
      mealsDate: null,
      addMeal: (meal) =>
        set((state) => ({
          meals: [...state.meals, meal],
          mealsDate: new Date().toISOString().slice(0, 10),
        })),
      replaceMeal: (oldName, meal) =>
        set((state) => ({
          meals: state.meals.map((m) => (m.name === oldName ? meal : m)),
          mealsDate: new Date().toISOString().slice(0, 10),
        })),
      removeMeal: (name) =>
        set((state) => ({ meals: state.meals.filter((m) => m.name !== name) })),
      clearMeals: () => set(dayScopedReset()),

      // ── Seen meals ───────────────────────────────────────────────────────
      seenMeals: [],
      addSeenMeals: (names) =>
        set((state) => ({
          seenMeals: [...state.seenMeals, ...names.filter((n) => !state.seenMeals.includes(n))],
        })),

      // ── Cooked meals ─────────────────────────────────────────────────────
      cookedMeals: [],
      addCookedMeal: (name) =>
        set((state) => ({
          cookedMeals: state.cookedMeals.includes(name) ? state.cookedMeals : [...state.cookedMeals, name],
        })),

      // ── Ratings ──────────────────────────────────────────────────────────
      ratings: {},
      setRating: (mealName, rating) =>
        set((state) => {
          // Cap at the 100 most recent — this map is persisted forever and
          // sent with every generation request, so unbounded growth slowly
          // bloats both the payload and the AI prompt's dislike list.
          // JS objects preserve insertion order; re-inserting moves a repeat
          // rating to the newest slot before trimming from the oldest end.
          const { [mealName]: _prev, ...rest } = state.ratings;
          const entries = [...Object.entries(rest), [mealName, rating] as const];
          return { ratings: Object.fromEntries(entries.slice(-100)) };
        }),
      clearRatings: () => set({ ratings: {} }),

      // ── Selected recipes ──────────────────────────────────────────────────
      selectedRecipes: [],
      addRecipe: (recipe) =>
        set((state) => {
          const exists = state.selectedRecipes.some((r) => r.title === recipe.title);
          if (exists) return state;
          return { selectedRecipes: [...state.selectedRecipes, recipe] };
        }),
      removeRecipe: (title) =>
        set((state) => ({
          selectedRecipes: state.selectedRecipes.filter((r) => r.title !== title),
        })),
      clearSelectedRecipes: () => set({ selectedRecipes: [] }),

      // ── Generation ingredient preferences ────────────────────────────────
      requiredIngredients: [],
      setRequiredIngredients: (v) => set({ requiredIngredients: v }),
      selectedPantryItems: [],
      setSelectedPantryItems: (v) => set({ selectedPantryItems: v }),

      // ── Pantry ────────────────────────────────────────────────────────────
      pantry: [],
      setPantry: (items) => set({ pantry: items }),

      // ── Shopping list ─────────────────────────────────────────────────────
      shoppingList: null,
      setShoppingList: (list) => set({ shoppingList: list }),
      toggleShoppingItem: (category, itemName) =>
        set((state) => {
          if (!state.shoppingList) return state;
          const groups: ShoppingGroup[] = state.shoppingList.groups.map((g) => {
            if (g.category !== category) return g;
            return {
              ...g,
              items: g.items.map((item) =>
                item.name === itemName ? { ...item, checked: !item.checked } : item
              ),
            };
          });
          return { shoppingList: { ...state.shoppingList, groups } };
        }),
      clearShoppingList: () => set({ shoppingList: null }),
      addToShoppingList: (category, name) =>
        set((state) => {
          const base = state.shoppingList ?? { groups: [] };
          const idx = base.groups.findIndex((g) => g.category === category);
          if (idx >= 0) {
            if (base.groups[idx].items.some((i) => i.name === name)) return state;
            const newGroups = base.groups.map((g, i) =>
              i === idx ? { ...g, items: [...g.items, { name, checked: false }] } : g
            );
            return { shoppingList: { ...base, groups: newGroups } };
          }
          return { shoppingList: { ...base, groups: [...base.groups, { category, items: [{ name, checked: false }] }] } };
        }),
      removeFromShoppingList: (category, itemName) =>
        set((state) => {
          if (!state.shoppingList) return state;
          const newGroups = state.shoppingList.groups
            .map((g) => g.category !== category ? g : { ...g, items: g.items.filter((i) => i.name !== itemName) })
            .filter((g) => g.items.length > 0);
          return { shoppingList: { ...state.shoppingList, groups: newGroups } };
        }),

      // ── Recipe labels ─────────────────────────────────────────────────────
      recipeLabels: {},
      addRecipeLabel: (recipeId, label) =>
        set((state) => {
          const existing = state.recipeLabels[recipeId] ?? [];
          if (existing.includes(label)) return state;
          return { recipeLabels: { ...state.recipeLabels, [recipeId]: [...existing, label] } };
        }),
      removeRecipeLabel: (recipeId, label) =>
        set((state) => {
          const existing = state.recipeLabels[recipeId] ?? [];
          return { recipeLabels: { ...state.recipeLabels, [recipeId]: existing.filter((l) => l !== label) } };
        }),
      setAllRecipeLabels: (labels) => set({ recipeLabels: labels }),

      // ── Saved-recipes freshness ───────────────────────────────────────────
      // Ephemeral (never persisted) — same as authReady.
      savedRecipesVersion: 0,
      markSavedRecipesStale: () =>
        set((state) => ({ savedRecipesVersion: state.savedRecipesVersion + 1 })),

      // ── Servings ──────────────────────────────────────────────────────────
      servings: 1,
      setServings: (n) => set({ servings: n }),

      // ── Plan servings ─────────────────────────────────────────────────────
      planServings: 1,
      setPlanServings: (n) => set({ planServings: n }),

      // ── Sign-out reset ────────────────────────────────────────────────────
      // Only clear session-specific data. Preserve device preferences
      // (language, servings, hasOnboarded, recipeLabels) so they survive
      // logout and are ready immediately on next sign-in.
      resetAll: () =>
        set({
          ...dayScopedReset(),
          ratings: {},
          pantry: [],
          shoppingList: null,
          requiredIngredients: [],
          selectedPantryItems: [],
        }),
    }),
    {
      name: "wotoeat-store",
      storage: createJSONStorage(() => AsyncStorage),
      // v1: default servings dropped 2 → 1. Existing devices persisted servings:2,
      // and a changed default never overrides saved state — so force it here.
      // (setServings has no UI caller, so this can't clobber a user choice.)
      version: 1,
      migrate: (persisted: any, version) => {
        if (!persisted) return persisted;
        if (version < 1) {
          persisted.servings = 1;
          persisted.planServings = 1;
        }
        return persisted;
      },
      // Clear stale meals (and the day's seen-history) from a previous day as soon
      // as the store rehydrates. Runs before React renders — works on web and native.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const today = new Date().toISOString().slice(0, 10);
        if (state.meals.length > 0 && state.mealsDate !== today) {
          Object.assign(state, dayScopedReset());
        }
      },
      // Only persist user-generated data; authReady is ephemeral (never persisted)
      partialize: (state) => ({
        profile: state.profile,
        language: state.language,
        hasOnboarded: state.hasOnboarded,
        meals: state.meals,
        mealsDate: state.mealsDate,
        seenMeals: state.seenMeals,
        cookedMeals: state.cookedMeals,
        pantry: state.pantry,
        ratings: state.ratings,
        selectedRecipes: state.selectedRecipes,
        shoppingList: state.shoppingList,
        recipeLabels: state.recipeLabels,
        servings: state.servings,
        planServings: state.planServings,
        requiredIngredients: state.requiredIngredients,
        selectedPantryItems: state.selectedPantryItems,
      }),
    }
  )
);
