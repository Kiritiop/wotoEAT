"""
Google Places API wrapper — fetches nearby restaurants for Eat Out mode.
"""
import os
import httpx
from dotenv import load_dotenv

load_dotenv()

PLACES_NEARBY_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"


async def get_nearby_restaurants(
    lat: float,
    lng: float,
    radius_m: int = 1500,
    max_results: int = 20,
) -> list[dict]:
    """
    Query Google Places for restaurants near the given coordinates.
    Returns a list of raw Place objects (name, vicinity, rating, etc.).
    Claude in eatout.py will then rank and explain them.
    """
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_MAPS_API_KEY is not set in your .env file")

    params = {
        "location": f"{lat},{lng}",
        "radius": radius_m,
        "type": "restaurant",
        "key": api_key,
    }

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(PLACES_NEARBY_URL, params=params)
        response.raise_for_status()
        data = response.json()

    results = data.get("results", [])[:max_results]

    # Slim down the payload — only send Claude what it needs
    restaurants = []
    for place in results:
        restaurants.append({
            "name": place.get("name", ""),
            "address": place.get("vicinity", ""),
            "rating": place.get("rating"),
            "user_ratings_total": place.get("user_ratings_total", 0),
            "price_level": place.get("price_level"),
            "types": place.get("types", []),
            "open_now": place.get("opening_hours", {}).get("open_now"),
            "place_id": place.get("place_id", ""),
        })

    return restaurants


def build_maps_url(name: str, address: str) -> str:
    """Build a Google Maps search URL for a restaurant."""
    query = f"{name} {address}".replace(" ", "+")
    return f"https://maps.google.com/?q={query}"
