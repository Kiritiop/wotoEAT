import type { ShoppingList } from "@/services/api";

/** Internal group key for items the user types in by hand on the shopping screen. */
export const MANUAL_CATEGORY = "other";

/**
 * Display label for a shopping-group category. Ingredients auto-added when a meal
 * is confirmed are bucketed under the internal key `meal-<dish name>`; strip that
 * prefix so the heading reads as the dish name instead of "meal-Kung Pao Chicken".
 * The manual-add group's localized label lives in the locale files (`other_items`);
 * callers with a translator should special-case MANUAL_CATEGORY themselves.
 */
export function displayCategory(category: string): string {
  return category.startsWith("meal-") ? category.slice("meal-".length) : category;
}

/** Formats a shopping list into a share-friendly plain-text string. */
export function formatShoppingListText(list: ShoppingList, language = "en"): string {
  const checked = "[x]";
  const unchecked = "[ ]";
  const title = language === "zh" ? "wotoEAT 购物清单" : "wotoEAT Shopping List";
  const lines: string[] = [title];
  for (const group of list.groups) {
    const label =
      group.category === MANUAL_CATEGORY
        ? language === "zh" ? "其他商品" : "Other items"
        : displayCategory(group.category);
    lines.push(`\n${label.toUpperCase()}`);
    for (const item of group.items) {
      lines.push(`${item.checked ? checked : unchecked} ${item.name}`);
    }
  }
  return lines.join("\n");
}

/** Counts total and checked items across all groups. */
export function countShoppingItems(list: ShoppingList): { total: number; checked: number } {
  let total = 0;
  let checked = 0;
  for (const group of list.groups) {
    total += group.items.length;
    checked += group.items.filter((i) => i.checked).length;
  }
  return { total, checked };
}
