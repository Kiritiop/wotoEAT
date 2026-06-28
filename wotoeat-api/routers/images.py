import os
import httpx
from fastapi import APIRouter, Query

router = APIRouter()

PEXELS_KEY = os.getenv("PEXELS_API_KEY", "")
UNSPLASH_KEY = os.getenv("UNSPLASH_ACCESS_KEY", "")


async def _themealdb_image(dish_name: str, client: httpx.AsyncClient) -> str | None:
    """TheMealDB — a real, photographed dish when the name matches a known recipe.
    Free, no key. Best source because it's food-specific (not stock/encyclopedia)."""
    try:
        resp = await client.get(
            "https://www.themealdb.com/api/json/v1/1/search.php",
            params={"s": dish_name},
        )
        if resp.status_code != 200:
            return None
        meals = resp.json().get("meals") or []
        if meals:
            return meals[0].get("strMealThumb") or None
    except Exception:
        pass
    return None


async def _pexels_image(dish_name: str, client: httpx.AsyncClient) -> str | None:
    """Pexels stock photo search — food-tuned query."""
    if not PEXELS_KEY:
        return None
    try:
        resp = await client.get(
            "https://api.pexels.com/v1/search",
            params={"query": f"{dish_name} food", "per_page": 1, "orientation": "landscape"},
            headers={"Authorization": PEXELS_KEY},
        )
        if resp.status_code != 200:
            return None
        photos = resp.json().get("photos", [])
        return photos[0]["src"]["large"] if photos else None
    except Exception:
        return None


async def _unsplash_image(dish_name: str, client: httpx.AsyncClient) -> str | None:
    """Unsplash stock photo search (optional — needs UNSPLASH_ACCESS_KEY)."""
    if not UNSPLASH_KEY:
        return None
    try:
        resp = await client.get(
            "https://api.unsplash.com/search/photos",
            params={"query": f"{dish_name} food", "per_page": 1, "orientation": "landscape"},
            headers={"Authorization": f"Client-ID {UNSPLASH_KEY}"},
        )
        if resp.status_code != 200:
            return None
        results = resp.json().get("results", [])
        return results[0]["urls"]["regular"] if results else None
    except Exception:
        return None


@router.get("/search")
async def image_search(q: str = Query(..., description="Meal name to search for")):
    """Food-specific image cascade: TheMealDB (real dish photo) → Pexels → Unsplash.
    Returns {url: null} rather than an unrelated image when nothing food-relevant matches."""
    async with httpx.AsyncClient(timeout=5) as client:
        url = (
            await _themealdb_image(q, client)
            or await _pexels_image(q, client)
            or await _unsplash_image(q, client)
        )
    return {"url": url}
