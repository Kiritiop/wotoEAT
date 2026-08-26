const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

// Calls our own backend proxy so ad blockers never see a direct Pexels request.
//
// `hint` is the generator's image_query, a plain description of what the dish
// looks like ("braised pork ribs"), which stock libraries match far better than
// a display name. `cuisine` is only used by the backend's vision check, where it
// is the difference between a Chinese red braise and a rack of American BBQ ribs
// for a dish whose name contains "pork ribs" either way.
//
// Usually instant: meal generation prewarms the dishes it just produced, so by
// the time a card is opened the answer is already cached. On a genuine miss the
// backend looks at the candidate photos before returning one, which takes a few
// seconds; callers render the hero only once this resolves, so the cost is a
// late fade-in rather than a blocked screen.
export async function searchMealImage(
  mealName: string,
  hint?: string | null,
  cuisine?: string | null,
  desc?: string | null,
): Promise<string | null> {
  if (!API_URL) return null;
  try {
    const params = new URLSearchParams({ q: mealName });
    if (hint) params.set("hint", hint);
    if (cuisine) params.set("cuisine", cuisine);
    // The recipe's own description of the finished dish. Only the backend's
    // vision check reads it, and only to compare a candidate photo against what
    // THIS recipe says it looks like ("dark, glossy, soy-braised") rather than a
    // generic idea of the dish name.
    if (desc) params.set("desc", desc.slice(0, 300));
    const res = await fetch(`${API_URL}/images/search?${params.toString()}`);
    if (!res.ok) return null;
    const json = await res.json();
    return (json.url as string) ?? null;
  } catch {
    return null;
  }
}
