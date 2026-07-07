import { toCanonicalEnglish } from "@/constants/filters";
import type { ShoppingGroup } from "@/services/api";

export const ci = (s: string) => s.trim().toLowerCase();

export interface MergeRow {
  name: string;
  matchesPantry: string | null;
  edited: boolean;
  checked: boolean;
}

interface PantryEntry {
  name: string;
  category?: string;
}

/**
 * Merge checked scan rows into the existing pantry. Never removes entries.
 * - unedited row that semantically matched an existing entry → skip (combine)
 * - edited row whose name ci-equals an existing entry → skip (combine)
 * - edited row that semantically matched → RENAME the existing entry
 * - otherwise → ADD, ci-deduped
 * Renames run before adds against a live ci-name set, so the payload can never
 * contain duplicates (replacePantry bulk-inserts under UNIQUE(user_id, name)).
 */
export function computeScanMerge(
  pantry: PantryEntry[],
  rows: MergeRow[],
): { merged: PantryEntry[]; added: number; renamed: number } {
  // Copy category overrides through — replacePantry persists them, so dropping
  // the field here would wipe the user's custom categories on every scan merge.
  const merged = pantry.map((p) => (p.category ? { name: p.name, category: p.category } : { name: p.name }));
  const namesCi = new Set(merged.map((e) => ci(e.name)));
  const actionable = rows.filter((r) => r.checked && r.name.trim().length > 0);
  let added = 0;
  let renamed = 0;

  for (const r of actionable) {
    if (!(r.edited && r.matchesPantry)) continue;
    const target = r.name.trim();
    if (namesCi.has(ci(target))) continue; // collision → combine instead
    const idx = merged.findIndex((e) => e.name === r.matchesPantry);
    if (idx === -1) continue; // source already renamed by an earlier row
    namesCi.delete(ci(merged[idx].name));
    // A rename is the same physical item — keep its category override.
    merged[idx] = merged[idx].category ? { name: target, category: merged[idx].category } : { name: target };
    namesCi.add(ci(target));
    renamed++;
  }

  for (const r of actionable) {
    if (!r.edited && r.matchesPantry) continue; // combine with existing entry
    const name = r.name.trim();
    if (namesCi.has(ci(name))) continue; // covers pass-1 targets + intra-scan dupes
    namesCi.add(ci(name));
    merged.push({ name });
    added++;
  }
  return { merged, added, renamed };
}

/**
 * "Done shopping": move every checked shopping-list item into the pantry and
 * off the list. Bought items become pantry items (closing the shopping half
 * of the pantry loop); unchecked items stay on the list.
 * - names are normalized to canonical English (same convention as scan/tags)
 * - the pantry merge reuses computeScanMerge, so items already in the pantry
 *   combine silently and category overrides survive
 * - groups whose items were all moved are dropped from the remaining list
 */
export function computeShoppingDone(
  pantry: PantryEntry[],
  groups: ShoppingGroup[],
): { merged: PantryEntry[]; remaining: ShoppingGroup[]; moved: number } {
  const checkedNames = groups.flatMap((g) => g.items.filter((i) => i.checked).map((i) => i.name));
  const rows: MergeRow[] = checkedNames.map((name) => ({
    name: toCanonicalEnglish(name),
    matchesPantry: null,
    edited: false,
    checked: true,
  }));
  const { merged } = computeScanMerge(pantry, rows);
  const remaining = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.checked) }))
    .filter((g) => g.items.length > 0);
  return { merged, remaining, moved: checkedNames.length };
}
