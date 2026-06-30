import os
import httpx
from fastapi import APIRouter, Query, Request

from ai.sqlite_cache import cache_get, cache_set, rate_limit_check

router = APIRouter()

PEXELS_KEY = os.getenv("PEXELS_API_KEY", "")
UNSPLASH_KEY = os.getenv("UNSPLASH_ACCESS_KEY", "")

# A dish name → image URL mapping is stable, so cache hits for a week. A miss
# (no food-relevant image found) is cached only briefly so a transient upstream
# failure — a rate-limited Pexels call, say — can recover on the next request.
_IMG_TTL_HIT = 7 * 24 * 3600
_IMG_TTL_MISS = 6 * 3600

# This endpoint is unauthenticated and proxies external image APIs that burn
# our Pexels/Unsplash quota. Cap *novel* lookups per IP (cache hits don't count,
# so normal browsing of already-seen dishes is never limited — only a flood of
# distinct queries is). Generous enough that real users never hit it.
_IMG_MAX = 100
_IMG_WINDOW = 3600


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
async def image_search(
    request: Request,
    q: str = Query(..., description="Meal name to search for"),
):
    """Food-specific image cascade: TheMealDB (real dish photo) → Pexels → Unsplash.
    Returns {url: null} rather than an unrelated image when nothing food-relevant matches.
    Results are cached so the same dish never re-hits the external APIs."""
    cache_key = f"img:{q.strip().lower()}"
    cached = cache_get(cache_key)
    if cached is not None:
        return {"url": cached.get("url")}

    # Cache miss → about to hit external APIs. Rate-limit novel lookups per IP.
    # On limit, degrade to a placeholder (don't cache it — the cap is transient).
    client_ip = request.client.host if request.client else "unknown"
    if not rate_limit_check(client_ip, "image-search", _IMG_MAX, _IMG_WINDOW):
        return {"url": None}

    async with httpx.AsyncClient(timeout=5) as client:
        url = (
            await _themealdb_image(q, client)
            or await _pexels_image(q, client)
            or await _unsplash_image(q, client)
        )
    cache_set(cache_key, {"url": url}, _IMG_TTL_HIT if url else _IMG_TTL_MISS)
    return {"url": url}
