const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

// Calls our own backend proxy so ad blockers never see a direct Pexels request.
export async function searchMealImage(mealName: string): Promise<string | null> {
  if (!API_URL) return null;
  try {
    const res = await fetch(
      `${API_URL}/images/search?q=${encodeURIComponent(mealName)}`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    return (json.url as string) ?? null;
  } catch {
    return null;
  }
}
