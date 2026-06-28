import os
import httpx
from fastapi import APIRouter, Query

router = APIRouter()

PEXELS_KEY = os.getenv("PEXELS_API_KEY", "")


async def _wikipedia_image(dish_name: str, client: httpx.AsyncClient) -> str | None:
    """Try to get a dish image from Wikipedia's MediaWiki API."""
    try:
        resp = await client.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "query",
                "titles": dish_name,
                "prop": "pageimages",
                "format": "json",
                "pithumbsize": 500,
                "redirects": 1,
            },
        )
        if resp.status_code != 200:
            return None
        pages = resp.json().get("query", {}).get("pages", {})
        for page in pages.values():
            thumb = page.get("thumbnail", {}).get("source")
            if thumb:
                return thumb
    except Exception:
        pass
    return None


async def _pexels_image(dish_name: str, client: httpx.AsyncClient) -> str | None:
    """Fall back to Pexels stock photo search."""
    if not PEXELS_KEY:
        return None
    try:
        resp = await client.get(
            "https://api.pexels.com/v1/search",
            params={"query": f"{dish_name} food dish", "per_page": 1, "orientation": "landscape"},
            headers={"Authorization": PEXELS_KEY},
        )
        if resp.status_code != 200:
            return None
        photos = resp.json().get("photos", [])
        return photos[0]["src"]["medium"] if photos else None
    except Exception:
        return None


@router.get("/search")
async def image_search(q: str = Query(..., description="Meal name to search for")):
    """Proxy image search: tries Wikipedia first (accurate dish images), falls back to Pexels."""
    async with httpx.AsyncClient(timeout=5) as client:
        url = await _wikipedia_image(q, client)
        if not url:
            url = await _pexels_image(q, client)
    return {"url": url}
