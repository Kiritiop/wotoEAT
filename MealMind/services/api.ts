/**
 * All calls to the wotoEAT FastAPI backend live here.
 */
import axios from "axios";
import { supabase } from "@/lib/supabase";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

const api = axios.create({ baseURL: BASE_URL, timeout: 45_000 });

// Kept in sync by setAuthToken() — avoids async getSession() race on web
// where onAuthStateChange fires before getSession() reflects the new session.
let _authToken: string | null = null;

export function setAuthToken(token: string | null) {
  _authToken = token;
}

api.interceptors.request.use(async (config) => {
  // Use the cached token first; fall back to getSession() for cold starts
  const token =
    _authToken ??
    (await supabase.auth.getSession()).data.session?.access_token ??
    null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, refresh the session once and retry — handles the startup race where
// getSession() hasn't resolved yet when the first request fires.
// On 429, retry with exponential backoff (up to 3 attempts: 1.5s, 3s, 6s).
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retried) {
      originalRequest._retried = true;
      const { data } = await supabase.auth.getSession();
      const freshToken = data.session?.access_token ?? null;
      if (freshToken) {
        setAuthToken(freshToken);
        originalRequest.headers.Authorization = `Bearer ${freshToken}`;
        return api(originalRequest);
      }
    }
    if (error.response?.status === 429) {
      const retryCount = originalRequest._retryCount ?? 0;
      if (retryCount < 3) {
        originalRequest._retryCount = retryCount + 1;
        const retryAfter = error.response.headers?.["retry-after"];
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.pow(2, retryCount) * 1500;
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
        return api(originalRequest);
      }
    }
    return Promise.reject(error);
  }
);

// ─── Health Profile ─────────────────────────────────────────────────────────

export interface HealthProfile {
  age?: number;
  sex?: "male" | "female" | "other";
  weight_kg?: number;
  height_cm?: number;
  activity_level?: "sedentary" | "light" | "moderate" | "active" | "very_active";
  health_goals?: string[];
  dietary_restrictions?: string[];
  allergies?: string[];
  calorie_goal?: number;
  protein_goal_g?: number;
  use_imperial?: boolean;
  // ── Meal generation preferences ─────────────────────────────────────────────
  cuisine_preferences?: string[];
  flavour_preference?: string | null;
  preferred_max_prep_mins?: number | null;
}

export async function getProfile(): Promise<HealthProfile> {
  const res = await api.get("/profile/");
  return res.data;
}

export async function saveProfile(profile: HealthProfile): Promise<HealthProfile> {
  const res = await api.put("/profile/", profile);
  return res.data;
}

// ─── Meal Filters (legacy) ───────────────────────────────────────────────────

export interface MealFilter {
  cuisine?: string;
  max_prep_time_mins?: number;
  max_calories?: number;
  dietary_goals?: string[];
  dietary_restrictions?: string[];
  flavour_profile?: string;
  serving_size?: number;
}

// ─── Meal Suggestions ───────────────────────────────────────────────────────

export interface MealSuggestion {
  name: string;
  cuisine: string;
  prep_time_mins: number;
  calories_per_serving: number;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
}

// ─── Meal History ────────────────────────────────────────────────────────────

export interface MealHistoryEntry {
  date: string;
  meals: MealSuggestion[];
  created_at?: string;
}

// ─── Legacy daily-plan types (kept for type-compatibility during discover.tsx rewrite) ─

export interface MealComponent {
  vegetable: string;
  protein: string;
  staple: string;
}

export interface DailyPlanMeal {
  slot: "breakfast" | "lunch" | "dinner";
  name: string;
  cuisine: string;
  description: string;
  prep_time_mins: number;
  calories_per_serving: number;
  difficulty: "easy" | "medium" | "hard";
  components: MealComponent;
  uses_pantry_items: string[];
  tags: string[];
  ingredients: string[];
  steps: string[];
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
}

export interface ShoppingReminder {
  item: string;
  reason: string;
}

export interface DailyMealPlan {
  meals: DailyPlanMeal[];
  shopping_reminders: ShoppingReminder[];
  total_calories: number;
  nutrition_note: string;
}

export interface PlanHistoryEntry {
  date: string;
  plan: DailyMealPlan;
  total_calories: number;
}

// ─── Recipes ─────────────────────────────────────────────────────────────────

export interface Ingredient {
  name: string;
  amount: number | string;
  unit: string;
  calories?: number;
}

export interface Recipe {
  title: string;
  servings: number;
  prep_time_mins: number;
  calories_per_serving?: number;
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
  warnings: string[];
  source_url?: string;
  source_name?: string;
}

export interface SavedRecipe {
  id: string;
  title: string;
  source_name?: string;
  source_url?: string;
  servings?: number;
  prep_time_mins?: number;
  calories_per_serving?: number;
  ingredients?: Ingredient[];
  steps?: string[];
  tags?: string[];
  warnings?: string[];
  labels?: string[];
  created_at?: string;
}

// ─── Pantry ──────────────────────────────────────────────────────────────────

export interface PantryItem {
  name: string;
}

// ─── Shopping List ───────────────────────────────────────────────────────────

export interface ShoppingItem {
  name: string;
  checked?: boolean;
}

export interface ShoppingGroup {
  category: string;
  items: ShoppingItem[];
}

export interface ShoppingList {
  groups: ShoppingGroup[];
  total_calories?: number;
}


// ─── API functions ────────────────────────────────────────────────────────────

export async function generateMeals(
  profile: HealthProfile,
  pantry: PantryItem[],
  cuisine_preference?: string,
  max_prep_time_mins?: number,
  language = "en",
  recent_ratings?: Record<string, "up" | "down">,
  servings = 2,
  slots?: ("breakfast" | "lunch" | "dinner")[],
  flavour_preference?: string,
  required_ingredients?: string,
  meal_style?: string,
): Promise<{ plan: DailyMealPlan; cached: boolean }> {
  const res = await api.post("/meals/generate", {
    profile,
    pantry: pantry.map((p) => p.name),
    cuisine_preference,
    max_prep_time_mins,
    language,
    recent_ratings,
    servings,
    slots,
    flavour_preference,
    required_ingredients,
    meal_style,
  });
  return res.data;
}

export async function swapMeal(
  slot: "breakfast" | "lunch" | "dinner",
  current_plan: DailyMealPlan,
  profile: HealthProfile,
  pantry: PantryItem[],
  language = "en",
  cuisine_preference?: string,
  flavour_preference?: string,
  max_prep_time_mins?: number,
  required_ingredients?: string,
  meal_style?: string,
): Promise<DailyPlanMeal> {
  const res = await api.post("/meals/swap", {
    slot,
    current_plan,
    profile,
    pantry: pantry.map((p) => p.name),
    language,
    cuisine_preference,
    flavour_preference,
    max_prep_time_mins,
    required_ingredients,
    meal_style,
  });
  return res.data;
}

export async function suggestMeals(
  filters: MealFilter
): Promise<{ meals: MealSuggestion[]; cached: boolean }> {
  const res = await api.post("/meals/suggest", filters);
  return res.data;
}

export async function getMealHistory(limit = 50): Promise<MealHistoryEntry[]> {
  const res = await api.get(`/meals/history?limit=${limit}`);
  return res.data;
}

export async function parseRecipe(url: string): Promise<Recipe> {
  const res = await api.post("/recipes/parse", { url });
  return res.data;
}

// Backend endpoint to add (FastAPI):
//   @app.post("/recipes/generate")
//   async def generate_recipe(body: dict, user = Depends(get_current_user)):
//       dish_name = body.get("dish_name", "")
//       language  = body.get("language", "en")
//       # Call AI (same model as daily-plan) to generate a full Recipe JSON
//       # matching the Recipe interface: title, servings, prep_time_mins,
//       # calories_per_serving, ingredients, steps, tags, warnings
//       recipe = await ai_generate_recipe(dish_name, language)
//       return recipe
export async function generateRecipeByName(
  dishName: string,
  language = "en",
  servings = 2,
  forceRefresh = false,
): Promise<Recipe> {
  const res = await api.post("/recipes/generate", { dish_name: dishName, language, servings, force_refresh: forceRefresh });
  return res.data as Recipe;
}

export async function saveRecipe(recipe: Recipe): Promise<SavedRecipe> {
  const res = await api.post("/recipes/save", { recipe });
  return res.data as SavedRecipe;
}

export async function getSavedRecipes(): Promise<SavedRecipe[]> {
  const res = await api.get("/recipes/saved");
  return res.data as SavedRecipe[];
}

export async function updateRecipe(id: string, recipe: Recipe): Promise<SavedRecipe> {
  const res = await api.put(`/recipes/${id}`, { recipe });
  return res.data as SavedRecipe;
}

export async function deleteRecipe(id: string): Promise<void> {
  await api.delete(`/recipes/${id}`);
}

export async function updateRecipeLabels(id: string, labels: string[]): Promise<void> {
  await api.patch(`/recipes/${id}/labels`, { labels });
}

export async function getCurrentShoppingList(): Promise<ShoppingList | null> {
  try {
    const res = await api.get("/shopping/current");
    const data = res.data as ShoppingList;
    return data?.groups?.length ? data : null;
  } catch {
    return null;
  }
}

export async function saveCurrentShoppingList(list: ShoppingList): Promise<void> {
  try {
    await api.put("/shopping/current", list);
  } catch {
    // best-effort — local state is still updated
  }
}

export async function generateShoppingList(
  recipes: Recipe[],
  pantry: PantryItem[],
  language = "en"
): Promise<ShoppingList> {
  const res = await api.post("/shopping/generate", { recipes, pantry: pantry.map((p) => p.name), language });
  return res.data;
}


export async function getPantry(): Promise<PantryItem[]> {
  const res = await api.get("/pantry/");
  return res.data;
}

export async function upsertPantry(items: PantryItem[]): Promise<PantryItem[]> {
  const res = await api.post("/pantry/", { items });
  return res.data;
}

export async function replacePantry(items: PantryItem[]): Promise<PantryItem[]> {
  const res = await api.post("/pantry/replace", { items });
  return res.data;
}

export async function deletePantryItem(name: string): Promise<void> {
  await api.delete(`/pantry/${encodeURIComponent(name)}`);
}

// ─── Dynamic content translation ─────────────────────────────────────────────
//
// Backend endpoint to add (FastAPI, calls the local Ollama mealmind-translator):
//
//   @app.post("/translate")
//   async def translate_texts(body: dict):
//       texts = body.get("texts", [])
//       translations = []
//       for text in texts:
//           r = requests.post("http://localhost:11434/api/chat", json={
//               "model": "mealmind-translator",
//               "stream": False,
//               "messages": [{"role": "user", "content": f"Translate: {text}"}]
//           })
//           translations.append(r.json()["message"]["content"].strip())
//       return {"translations": translations}
//
export async function translateBatch(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];
  try {
    const res = await api.post("/recipes/translate", { texts, target: "zh" });
    return res.data.translations ?? texts;
  } catch {
    return texts; // Graceful fallback — show original if backend unavailable
  }
}


