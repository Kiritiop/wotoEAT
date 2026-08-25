import hashlib
import os
import re
import unicodedata
import httpx
from fastapi import APIRouter, Query, Request

from ai.sqlite_cache import cache_get, cache_set, rate_limit_check

router = APIRouter()

PEXELS_KEY = os.getenv("PEXELS_API_KEY", "")
UNSPLASH_KEY = os.getenv("UNSPLASH_ACCESS_KEY", "")

# A dish name -> image URL mapping is stable, so cache hits for a week. A miss
# (no food-relevant image found) is cached only briefly so a transient upstream
# failure -- a rate-limited Pexels call, say -- can recover on the next request.
_IMG_TTL_HIT = 7 * 24 * 3600
_IMG_TTL_MISS = 6 * 3600

# Bump when the matching logic changes. The old cache held wrong-but-confident
# URLs for a week at a time; a new prefix retires them on deploy instead of
# leaving every user staring at the same bad photo until it expires.
_CACHE_VERSION = "v3"

# This endpoint is unauthenticated and proxies external image APIs that burn
# our Pexels/Unsplash quota. Cap *novel* lookups per IP (cache hits don't count,
# so normal browsing of already-seen dishes is never limited -- only a flood of
# distinct queries is). Generous enough that real users never hit it.
_IMG_MAX = 100
_IMG_WINDOW = 3600

# Grammatical glue only. Cooking methods ("grilled", "roasted") are deliberately
# NOT in here: they are the strongest signal a stock-photo search has.
_GLUE = {
    "a", "an", "and", "the", "of", "in", "on", "with", "or", "to", "for",
    "de", "la", "le", "el", "al", "con", "et", "du", "des",
}

# Words that describe how a dish is marketed rather than what it looks like.
# Stripped from the photo-search query so "Classic Homemade Beef Stew" searches
# as "beef stew".
_FILLER = {
    "classic", "traditional", "authentic", "homemade", "home", "style",
    "easy", "quick", "simple", "best", "perfect", "ultimate", "favorite",
    "favourite", "hearty", "delicious", "tasty", "healthy", "fresh",
    "recipe", "dish", "meal", "serving", "portion", "made",
}


def _normalize(text: str) -> str:
    """Casefold, strip accents and punctuation, collapse whitespace."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.casefold()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()


def _tokens(text: str, drop_filler: bool = False) -> list[str]:
    """Content words of a dish name, in order, deduplicated."""
    drop = _GLUE | _FILLER if drop_filler else _GLUE
    out: list[str] = []
    for word in _normalize(text).split():
        if word in drop or len(word) < 2:
            continue
        if word not in out:
            out.append(word)
    return out


# ---------------------------------------------------------------------------
# TheMealDB
# ---------------------------------------------------------------------------

def _mealdb_pick(dish_name: str, meals: list[dict]) -> str | None:
    """Choose a MealDB result that is actually the dish we asked for.

    TheMealDB's search.php is a substring LIKE over meal titles, so it happily
    answers "Beef Stew" with "Lemongrass beef stew with noodles" and "Chicken
    Curry" with "Katsu Chicken curry". Taking meals[0] on faith is what put
    unrelated photos on recipe cards.

    The test: every content word in the MealDB title must also appear in the
    dish name. Extra words in OUR name are fine ("Classic Beef Bourguignon"
    should still match "Beef Bourguignon") -- extra words in THEIRS are not,
    because those are exactly the words that make it a different dish.
    """
    query_norm = _normalize(dish_name)
    query_tokens = set(_tokens(dish_name))
    if not query_tokens:
        return None

    best: tuple[int, str] | None = None
    for meal in meals:
        title = (meal.get("strMeal") or "").strip()
        thumb = (meal.get("strMealThumb") or "").strip()
        if not title or not thumb:
            continue

        title_tokens = _tokens(title)
        if not title_tokens:
            continue

        exact = _normalize(title) == query_norm
        if not exact:
            # A one-word title ("Fish") is too weak a claim to trust on a
            # subset match alone -- it would swallow "Fish Tacos".
            if len(title_tokens) < 2:
                continue
            if not set(title_tokens).issubset(query_tokens):
                continue

        # Prefer the most specific title that still qualifies; an exact hit wins
        # outright.
        score = 1000 if exact else len(title_tokens)
        if best is None or score > best[0]:
            best = (score, thumb)

    return best[1] if best else None


async def _themealdb_image(dish_name: str, client: httpx.AsyncClient) -> str | None:
    """TheMealDB -- a real, photographed dish when the name genuinely matches.
    Free, no key. Best source because it's food-specific (not stock/encyclopedia)."""
    try:
        resp = await client.get(
            "https://www.themealdb.com/api/json/v1/1/search.php",
            params={"s": dish_name},
        )
        if resp.status_code != 200:
            return None
        meals = resp.json().get("meals") or []
        return _mealdb_pick(dish_name, meals)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Photo distinctness
# ---------------------------------------------------------------------------
#
# Scoring alone is not enough, because "correct" and "distinct" are different
# things. Real case: Pexels photos 5774004 and 5774005 are consecutive frames
# from one Luis Becerra shoot, and their alt text reads "Korean bibimbap topped
# with marinated bulgogi beef" and "Authentic Korean Bibimbap ... and beef".
# Both score ~1.0 for "beef bulgogi" AND for "beef bibimbap" -- correctly, since
# bulgogi is a standard bibimbap topping. Taking the top scorer for each dish
# therefore handed two dishes in the same meal stream two frames of one photo
# shoot, which reads as broken however well-matched each one is on its own.
#
# So a chosen photo is *claimed* for its dish. A later dish skips photos, and
# whole shoots, already claimed by a different dish, and falls back to the best
# scorer only if every candidate is taken -- a slightly worse photo beats a
# duplicate, but no image at all would be worse than either.
_CLAIM_TTL = _IMG_TTL_HIT


def _claim_key(kind: str, value: str) -> str:
    return f"imgclaim:{_CACHE_VERSION}:{kind}:{value}"


def _claimed_by(kind: str, value: str | None) -> str | None:
    """Which dish already owns this photo / shoot, if any."""
    if not value:
        return None
    row = cache_get(_claim_key(kind, str(value)))
    return row.get("dish") if row else None


def _claim(kind: str, value: str | None, dish_key: str) -> None:
    if value:
        cache_set(_claim_key(kind, str(value)), {"dish": dish_key}, _CLAIM_TTL)


def _spread(dish_key: str, photo_id: str) -> str:
    """A stable per-dish shuffle key.

    Equally-scored photos would otherwise be ranked identically for every dish,
    so two dishes with overlapping result sets keep colliding on the same frame
    even before claims come into play. Hashing the pair spreads them while
    staying deterministic, so a dish always resolves to the same photo.
    """
    return hashlib.sha1(f"{dish_key}|{photo_id}".encode()).hexdigest()


def _choose(dish_key: str, candidates: list[dict]) -> str | None:
    """Best-scoring candidate that no *other* dish has already claimed."""
    if not candidates:
        return None
    ranked = sorted(candidates, key=lambda c: (-c["score"], _spread(dish_key, c["id"])))
    for cand in ranked:
        if _claimed_by("photo", cand["id"]) not in (None, dish_key):
            continue
        if _claimed_by("shoot", cand["shoot"]) not in (None, dish_key):
            continue
        _claim("photo", cand["id"], dish_key)
        _claim("shoot", cand["shoot"], dish_key)
        return cand["url"]
    # Everything is spoken for. A repeat beats a blank hero.
    return ranked[0]["url"]


# ---------------------------------------------------------------------------
# Pexels
# ---------------------------------------------------------------------------

# A photo has to look like the thing we asked for. Below this share of the
# query's words appearing in the photo's own description, we would rather show
# no image than a confidently wrong one.
_PEXELS_FLOOR = 0.5
_PEXELS_PER_PAGE = 30


def _pexels_score(alt: str, wanted: list[str]) -> float:
    """Share of the query's content words that appear in the photo's alt text."""
    if not alt or not wanted:
        return 0.0
    alt_tokens = set(_tokens(alt))
    if not alt_tokens:
        return 0.0
    hits = 0
    for word in wanted:
        # Substring covers singular/plural and compounds ("noodle"/"noodles",
        # "chickpea"/"chickpeas") without dragging in a stemmer.
        if any(word in token or token in word for token in alt_tokens):
            hits += 1
    return hits / len(wanted)


async def _pexels_try(terms: list[str], client: httpx.AsyncClient) -> list[dict]:
    """One Pexels search, scored. Returns every candidate above the floor."""
    if not terms:
        return []
    try:
        resp = await client.get(
            "https://api.pexels.com/v1/search",
            params={
                "query": " ".join(terms) + " food",
                "per_page": _PEXELS_PER_PAGE,
                "orientation": "landscape",
            },
            headers={"Authorization": PEXELS_KEY},
        )
        if resp.status_code != 200:
            return []
        photos = resp.json().get("photos", []) or []
    except Exception:
        return []

    out: list[dict] = []
    for photo in photos:
        url = (photo.get("src") or {}).get("large")
        if not url:
            continue
        score = _pexels_score(photo.get("alt") or "", terms)
        if score < _PEXELS_FLOOR:
            continue
        out.append({
            "url": url,
            "score": score,
            "id": str(photo.get("id") or url),
            # Photographer stands in for "shoot": the duplicate frames that
            # started all this shared one.
            "shoot": str(photo.get("photographer_id") or ""),
        })
    return out


async def _pexels_image(
    dish_name: str, hint: str | None, client: httpx.AsyncClient, dish_key: str
) -> str | None:
    """Pexels stock photo search, ranked by how well each photo's own
    description matches the dish -- not by whatever Pexels puts first.

    The old code asked for per_page=1 and used it unconditionally, so a long
    name like "Lemon Herb Salmon with Asparagus" got whatever single photo
    Pexels's loose token matching surfaced first, with no way to reject it.
    """
    if not PEXELS_KEY:
        return None

    terms = _tokens(hint, drop_filler=True) if hint else []
    if not terms:
        terms = _tokens(dish_name, drop_filler=True)
    terms = terms[:4]

    candidates = await _pexels_try(terms, client)
    if not candidates and len(terms) > 2:
        # Nothing cleared the floor. Narrow to the two words that carry the dish
        # -- a broad "salmon asparagus" photo beats a precise-but-wrong one.
        candidates = await _pexels_try(terms[:2], client)

    return _choose(dish_key, candidates)


# ---------------------------------------------------------------------------
# Unsplash
# ---------------------------------------------------------------------------

async def _unsplash_image(
    dish_name: str, hint: str | None, client: httpx.AsyncClient, dish_key: str
) -> str | None:
    """Unsplash stock photo search (optional -- needs UNSPLASH_ACCESS_KEY).
    Scored and de-duplicated the same way as Pexels."""
    if not UNSPLASH_KEY:
        return None

    terms = _tokens(hint, drop_filler=True) if hint else []
    if not terms:
        terms = _tokens(dish_name, drop_filler=True)
    terms = terms[:4]
    if not terms:
        return None

    try:
        resp = await client.get(
            "https://api.unsplash.com/search/photos",
            params={
                "query": " ".join(terms) + " food",
                "per_page": _PEXELS_PER_PAGE,
                "orientation": "landscape",
            },
            headers={"Authorization": f"Client-ID {UNSPLASH_KEY}"},
        )
        if resp.status_code != 200:
            return None
        results = resp.json().get("results", []) or []
    except Exception:
        return None

    candidates: list[dict] = []
    for photo in results:
        url = (photo.get("urls") or {}).get("regular")
        if not url:
            continue
        alt = " ".join(
            filter(None, [photo.get("alt_description"), photo.get("description")])
        )
        score = _pexels_score(alt, terms)
        if score < _PEXELS_FLOOR:
            continue
        candidates.append({
            "url": url,
            "score": score,
            "id": str(photo.get("id") or url),
            "shoot": str(((photo.get("user") or {}).get("id")) or ""),
        })
    return _choose(dish_key, candidates)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("/search")
async def image_search(
    request: Request,
    q: str = Query(..., description="Meal name to search for"),
    hint: str | None = Query(
        None,
        description=(
            "Optional plain search term for the dish, e.g. 'garlic butter chicken'. "
            "The meal generator supplies this as image_query; it searches far "
            "better than a display name."
        ),
    ),
):
    """Food-specific image cascade: TheMealDB (real dish photo) -> Pexels -> Unsplash.
    Every candidate is checked against the dish before it is returned; the endpoint
    returns {url: null} rather than an unrelated image when nothing matches.
    Results are cached so the same dish never re-hits the external APIs."""
    dish = q.strip()
    hint_clean = (hint or "").strip()
    # The dish, not the dish+hint pair, owns a photo: the same dish generated
    # twice with slightly different wording must not fight itself for a claim.
    dish_key = dish.casefold()
    cache_key = f"img:{_CACHE_VERSION}:{dish_key}|{hint_clean.casefold()}"
    cached = cache_get(cache_key)
    if cached is not None:
        return {"url": cached.get("url")}

    # Cache miss -> about to hit external APIs. Rate-limit novel lookups per IP.
    # On limit, degrade to a placeholder (don't cache it -- the cap is transient).
    client_ip = request.client.host if request.client else "unknown"
    if not rate_limit_check(client_ip, "image-search", _IMG_MAX, _IMG_WINDOW):
        return {"url": None}

    async with httpx.AsyncClient(timeout=5) as client:
        url = (
            await _themealdb_image(dish, client)
            or await _pexels_image(dish, hint_clean or None, client, dish_key)
            or await _unsplash_image(dish, hint_clean or None, client, dish_key)
        )
    cache_set(cache_key, {"url": url}, _IMG_TTL_HIT if url else _IMG_TTL_MISS)
    return {"url": url}
