import os
import httpx
from fastapi import APIRouter, Query

router = APIRouter()

PEXELS_KEY = os.getenv("PEXELS_API_KEY", "")


@router.get("/search")
async def image_search(q: str = Query(..., description="Meal name to search for")):
    """Proxy image search to Pexels so the browser never calls Pexels directly."""
    if not PEXELS_KEY:
        return {"url": None}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                "https://api.pexels.com/v1/search",
                params={"query": f"{q} food dish", "per_page": 1, "orientation": "landscape"},
                headers={"Authorization": PEXELS_KEY},
            )
        if resp.status_code != 200:
            return {"url": None}
        photos = resp.json().get("photos", [])
        url = photos[0]["src"]["medium"] if photos else None
        return {"url": url}
    except Exception:
        return {"url": None}
