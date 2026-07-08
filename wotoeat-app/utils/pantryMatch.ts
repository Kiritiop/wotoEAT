import { toCanonicalEnglish } from "@/constants/filters";

/**
 * The one ingredient-vs-pantry matcher. The "In pantry" badge, the
 * shopping-list auto-add (both via discover.tsx) and the cooked-consumption
 * sheet all share it — if they used different matchers they would disagree
 * about what the user has.
 */
const _CJK_RE = /[一-鿿]/;
function _wordsOf(s: string): string[] {
  return s.split(/[^a-z0-9一-鿿]+/i).filter(Boolean);
}
function _wordMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.startsWith(a)) return true;
  if (b.length >= 4 && a.startsWith(b)) return true;
  return false;
}
export function pantryNameMatches(pantryName: string, ingredientName: string): boolean {
  // Normalize both to canonical English first (exact-match curated lookup, so it
  // never invents a match): lets an English pantry item match a Chinese ingredient
  // string in zh mode, e.g. pantry "chicken breast" ↔ ingredient "鸡胸肉".
  const a = toCanonicalEnglish(pantryName.trim()).trim().toLowerCase();
  const b = toCanonicalEnglish(ingredientName.trim()).trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (_CJK_RE.test(a) || _CJK_RE.test(b)) return a.includes(b) || b.includes(a);
  const wa = _wordsOf(a), wb = _wordsOf(b);
  if (!wa.length || !wb.length) return false;
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  return short.every((w) => long.some((lw) => _wordMatch(w, lw)));
}

// N-01: extract name from ingredient string — handles "100g chicken breast", "2 eggs", bare strings
export function ingredientNameFrom(s: string): string {
  const withUnit = s.match(/^[\d./]+\s*[a-zA-Z一-鿿]+\s+(.+)$/);
  let name = withUnit ? withUnit[1] : s.match(/^[\d./]+\s+(.+)$/) ? s.match(/^[\d./]+\s+(.+)$/)![1] : s;
  // Strip preparation notes after comma or opening parenthesis
  name = name.split(/[,(]/)[0];
  return name.trim().toLowerCase();
}

/**
 * Pantry items a meal's ingredient list plausibly used, for the cooked-
 * consumption sheet. Returns the exact stored pantry entries (so the caller
 * can rebuild a replacePantry payload by name identity).
 */
export function pantryItemsUsedBy(
  pantry: { name: string; category?: string }[],
  ingredients: string[],
): { name: string; category?: string }[] {
  const names = ingredients.map(ingredientNameFrom);
  return pantry.filter((p) => names.some((n) => pantryNameMatches(p.name, n)));
}
