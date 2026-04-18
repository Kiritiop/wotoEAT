import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  Recipe,
  PantryItem,
  ShoppingList,
  ShoppingGroup,
  HealthProfile,
  DailyMealPlan,
} from "@/services/api";

export type Language = "en" | "zh";
export type Rating = "up" | "down";

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

  // ── Daily meal plan ───────────────────────────────────────────────────────
  dailyPlan: DailyMealPlan | null;
  setDailyPlan: (plan: DailyMealPlan) => void;
  clearDailyPlan: () => void;

  // ── Meal ratings ──────────────────────────────────────────────────────────
  ratings: Record<string, Rating>;
  setRating: (mealName: string, rating: Rating) => void;
  clearRatings: () => void;

  // ── Selected meals for shopping list ─────────────────────────────────────
  selectedRecipes: Recipe[];
  addRecipe: (recipe: Recipe) => void;
  removeRecipe: (title: string) => void;
  clearSelectedRecipes: () => void;

  // ── Pantry ────────────────────────────────────────────────────────────────
  pantry: PantryItem[];
  setPantry: (items: PantryItem[]) => void;

  // ── Shopping list ─────────────────────────────────────────────────────────
  shoppingList: ShoppingList | null;
  setShoppingList: (list: ShoppingList) => void;
  toggleShoppingItem: (category: string, itemName: string) => void;
  clearShoppingList: () => void;
  addToShoppingList: (category: string, itemName: string) => void;
  removeFromShoppingList: (category: string, itemName: string) => void;

  // ── Recipe labels (favorite, frequent, done) ──────────────────────────────
  recipeLabels: Record<string, string[]>;
  addRecipeLabel: (recipeId: string, label: string) => void;
  removeRecipeLabel: (recipeId: string, label: string) => void;

  // ── Servings preference ───────────────────────────────────────────────────
  servings: number;
  setServings: (n: number) => void;
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
      // Clear the daily plan when language changes — it was generated in the old language
      setLanguage: (lang) => set({ language: lang, dailyPlan: null }),

      // ── Onboarding ──────────────────────────────────────────────────────
      hasOnboarded: false,
      setHasOnboarded: (v) => set({ hasOnboarded: v }),

      // ── Daily plan ───────────────────────────────────────────────────────
      dailyPlan: null,
      setDailyPlan: (plan) => set({ dailyPlan: plan }),
      clearDailyPlan: () => set({ dailyPlan: null }),

      // ── Ratings ──────────────────────────────────────────────────────────
      ratings: {},
      setRating: (mealName, rating) =>
        set((state) => ({ ratings: { ...state.ratings, [mealName]: rating } })),
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
      addToShoppingList: (category, itemName) =>
        set((state) => {
          const base = state.shoppingList ?? { groups: [] };
          const idx = base.groups.findIndex((g) => g.category === category);
          if (idx >= 0) {
            if (base.groups[idx].items.some((i) => i.name === itemName)) return state;
            const newGroups = base.groups.map((g, i) =>
              i === idx ? { ...g, items: [...g.items, { name: itemName, amount: 1, unit: "" }] } : g
            );
            return { shoppingList: { ...base, groups: newGroups } };
          }
          return { shoppingList: { ...base, groups: [...base.groups, { category, items: [{ name: itemName, amount: 1, unit: "" }] }] } };
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

      // ── Servings ──────────────────────────────────────────────────────────
      servings: 2,
      setServings: (n) => set({ servings: n }),
    }),
    {
      name: "mealmind-store",
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist user-generated data; authReady is ephemeral (never persisted)
      partialize: (state) => ({
        profile: state.profile,
        language: state.language,
        hasOnboarded: state.hasOnboarded,
        dailyPlan: state.dailyPlan,
        pantry: state.pantry,
        ratings: state.ratings,
        selectedRecipes: state.selectedRecipes,
        recipeLabels: state.recipeLabels,
        servings: state.servings,
      }),
    }
  )
);
