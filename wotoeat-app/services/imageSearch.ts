const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

// Calls our own backend proxy so ad blockers never see a direct Pexels request.
//
// `hint` is the generator's image_query, a plain description of what the dish
// looks like ("braised pork ribs"), which stock libraries match far better than
// a display name. `cuisine` is only used by the backend's vision check, where it
// is the difference between a Chinese red braise and a rack of American BBQ ribs
// for a dish whose name contains "pork ribs" either way.
//
// The backend may take a few seconds on a cache miss because it looks at the
// candidate photos before returning one. Callers render the hero only once this
// resolves, so a slow answer costs nothing but a late fade-in.
export async function searchMealImage(
  mealName: string,
  hint?: string | null,
  cuisine?: string | null,
): Promise<string | null> {
  if (!API_URL) return null;
  try {
    const params = new URLSearchParams({ q: mealName });
    if (hint) params.set("hint", hint);
    if (cuisine) params.set("cuisine", cuisine);
    const res = await fetch(`${API_URL}/images/search?${params.toString()}`);
    if (!res.ok) return null;
    const json = await res.json();
    return (json.url as string) ?? null;
  } catch {
    return null;
  }
}
