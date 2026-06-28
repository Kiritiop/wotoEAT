import type { ShoppingList } from "@/services/api";

/** Formats a shopping list into a share-friendly plain-text string. */
export function formatShoppingListText(list: ShoppingList, language = "en"): string {
  const checked = language === "zh" ? "✓" : "✓";
  const unchecked = language === "zh" ? "○" : "○";
  const title = language === "zh" ? "wotoEAT 购物清单" : "wotoEAT Shopping List";
  const lines: string[] = [title];
  for (const group of list.groups) {
    lines.push(`\n${group.category.toUpperCase()}`);
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
