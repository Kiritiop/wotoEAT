import { saveRecipe } from "@/services/api";
import type { Recipe } from "@/services/api";
import { useAppStore } from "@/store/useAppStore";

/**
 * Save a recipe and record it as an "up" rating.
 *
 * Saving is the app's only positive taste signal: generation's TASTE PROFILE
 * block leans toward dishes similar to the ones the user has saved. That
 * rating used to be wired into the Today card's save only, so the other save
 * flows (recipe search, the Recipes tab, URL import, history, shared meals)
 * taught it nothing (FIX-4). Every save path goes through here now, so a new
 * one gets the behaviour for free.
 *
 * The rating is recorded only after the save succeeds, and it is keyed on the
 * recipe title, which is the same key generation sends back as `recent_ratings`.
 * A successful save also marks the Recipes tab's list stale so the new recipe
 * appears there.
 *
 * Lives in utils rather than services/api.ts because it touches the store, and
 * services must not import the store (the store imports api types).
 */
export async function saveRecipeAndRate(recipe: Recipe) {
  const saved = await saveRecipe(recipe);
  const title = recipe.title?.trim();
  if (title) useAppStore.getState().setRating(title, "up");
  // Tell the Recipes tab its list is out of date. It skips the fetch on every
  // focus (BUG-16), so without this a recipe saved from another screen only
  // appeared after a pull-to-refresh or an app restart.
  useAppStore.getState().markSavedRecipesStale();
  return saved;
}
