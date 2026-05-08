const PEXELS_KEY = process.env.EXPO_PUBLIC_PEXELS_API_KEY ?? "";

// Returns a medium-size photo URL for the given meal name, or null if not found / key missing.
export async function searchMealImage(mealName: string): Promise<string | null> {
  if (!PEXELS_KEY) return null;
  try {
    const query = encodeURIComponent(`${mealName} food dish`);
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${query}&per_page=1&orientation=landscape`,
      { headers: { Authorization: PEXELS_KEY } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return (json.photos?.[0]?.src?.medium as string) ?? null;
  } catch {
    return null;
  }
}
