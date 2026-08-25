const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

// Calls our own backend proxy so ad blockers never see a direct Pexels request.
//
// `hint` is the generator's image_query — a plain description of what the dish
// looks like ("braised chicken red wine"), which stock libraries match far
// better than a display name ("Coq au Vin"). The backend still searches
// TheMealDB by the real name; the hint only steers the stock-photo fallback.
export async function searchMealImage(
  mealName: string,
  hint?: string | null,
): Promise<string | null> {
  if (!API_URL) return null;
  try {
    const params = new URLSearchParams({ q: mealName });
    if (hint) params.set("hint", hint);
    const res = await fetch(`${API_URL}/images/search?${params.toString()}`);
    if (!res.ok) return null;
    const json = await res.json();
    return (json.url as string) ?? null;
  } catch {
    return null;
  }
}
