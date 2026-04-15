from fastapi import APIRouter, HTTPException
from db.models import EatOutRequest, EatOutResponse, RestaurantResult
from utils.maps import get_nearby_restaurants, build_maps_url
from ai.claude import rank_restaurants

router = APIRouter(tags=["eatout"])


@router.post("/nearby", response_model=EatOutResponse)
async def nearby(req: EatOutRequest):
    """
    POST /eatout/nearby
    Body: { lat, lng, filters, radius_m }
    1. Fetches nearby restaurants from Google Places
    2. Sends them + user filters to Claude for ranking & explanation
    Returns up to 5 ranked restaurants with reasons.
    """
    try:
        raw_places = await get_nearby_restaurants(req.lat, req.lng, req.radius_m)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Google Places error: {exc}")

    if not raw_places:
        return EatOutResponse(restaurants=[])

    # Attach maps URLs before sending to Claude so it can include them
    for place in raw_places:
        place["maps_url"] = build_maps_url(place["name"], place["address"])

    try:
        ranked = await rank_restaurants(
            raw_places,
            req.filters.model_dump(exclude_none=True),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI ranking error: {exc}")

    restaurants = [RestaurantResult(**r) for r in ranked]
    return EatOutResponse(restaurants=restaurants)
