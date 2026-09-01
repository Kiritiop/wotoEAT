"""
Header photos for meal cards: TheMealDB, then a generated image.

Two sources, both correct by construction.

TheMealDB is a real photograph of the exact recipe, matched by verified name.
Everything else is generated from the recipe's own description.

There used to be a Pexels stage between them with a vision model vetting its
results, and removing it is the point of this file's current shape. Stock search
cannot answer "is this that dish": the caption is one line written by whoever
uploaded the photo, so `pork ribs` matched an American barbecue, `braised pork
ribs` matched pork belly, `chicken tikka masala` matched paneer, and two dishes
were handed two frames of one shoot. Each fix worked and the next miss was a
category the previous fix could not see. The last one was not even wrong: Pexels
has no canonical 红烧排骨, so its best honest answer was a Sichuan chilli-oil
braise, correctly matched and still the wrong picture.

Generating from the description ends that whole class of problem, and takes the
10-15 seconds of vetting with it.

What is left is one slow step -- the model drawing the picture -- and the file
is arranged so that nothing else waits on it and nothing pays for it twice. The
two cheap lookups run together rather than in sequence; MealDB is skipped
outright for names it cannot match; the blocking upload runs off the event loop
so concurrent prewarms do not queue behind each other; and a dish already being
resolved is joined, not restarted.
"""
import asyncio
import hashlib
import logging
import os
import re
import unicodedata

import httpx
from fastapi import APIRouter, Query, Request

from ai import imagegen
from ai.sqlite_cache import cache_get, cache_set, rate_limit_check
from db import supabase_client as db

logger = logging.getLogger(__name__)

router = APIRouter()

# A dish name -> image URL mapping is stable, so cache hits for a week. A miss
# is cached only briefly so a transient upstream failure recovers on the next
# request rather than leaving a card blank for days.
_IMG_TTL_HIT = 7 * 24 * 3600
_IMG_TTL_MISS = 6 * 3600

# Bump when the matching logic changes, or a wrong URL is served to every user
# until it expires. v11 dropped the Pexels + vision stage entirely.
_CACHE_VERSION = "v11"

# This endpoint is unauthenticated and a miss can cost an image generation, so
# cap novel lookups per IP. The cache is checked first, so browsing dishes that
# have already been resolved is never limited -- only a flood of distinct ones.
_IMG_MAX = 100
_IMG_WINDOW = 3600

# Generation is the paid part. One per novel dish, and a dish is only ever paid
# for once because the stored object is reused forever after.
_GEN_MAX = 40
_GEN_WINDOW = 3600

# The cascade client only makes two small calls: a MealDB search and a HEAD
# against storage. Neither has any business taking ten seconds, and the old
# 90-second budget was left over from downloading candidate photos to vet them.
# A hanging MealDB used to be able to hold a request open for a minute and a
# half before the generation that was always going to answer it even started.
_HTTP_TIMEOUT = httpx.Timeout(10.0, connect=5.0)

# Grammatical glue only, for comparing a MealDB title against a dish name.
_GLUE = {
    "a", "an", "and", "the", "of", "in", "on", "with", "or", "to", "for",
    "de", "la", "le", "el", "al", "con", "et", "du", "des",
}

# Words that market a dish rather than identify it.
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

    TheMealDB's search.php is a substring LIKE over meal titles, so it answers
    "Beef Stew" with "Lemongrass beef stew with noodles" and "Chicken Curry"
    with "Katsu Chicken curry". Taking meals[0] on faith is what put unrelated
    photos on recipe cards to begin with.

    The test: every content word in the MealDB title must also appear in the
    dish name. Extra words in OUR name are fine ("Classic Beef Bourguignon"
    should still match "Beef Bourguignon"); extra words in THEIRS are not,
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

        score = 1000 if exact else len(title_tokens)
        if best is None or score > best[0]:
            best = (score, thumb)

    return best[1] if best else None


async def _themealdb_image(dish_name: str, client: httpx.AsyncClient) -> str | None:
    """A real photograph of this exact recipe, when TheMealDB knows it.
    Free, no key, and the strongest evidence available: the photo and the
    recipe come from the same entry.

    Only worth calling when `_searchable` says the name can match at all.
    """
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
# Generated
# ---------------------------------------------------------------------------

def _object_name(dish_key: str) -> str:
    """Storage path for a dish. Deterministic, so the same dish is generated
    once and then reused for as long as the bucket keeps it."""
    return f"{_CACHE_VERSION}/{hashlib.sha1(dish_key.encode()).hexdigest()[:20]}.jpg"


async def _existing_generated(name: str, client: httpx.AsyncClient) -> str | None:
    """Reuse an image generated earlier, even if the TTL cache has forgotten it.

    The cache lives in /tmp and every deploy wipes it; the bucket does not.
    Without this, a redeploy would pay to generate every dish again.
    """
    url = db.public_dish_image_url(name)
    if not url:
        return None
    try:
        resp = await client.head(url)
        return url if resp.status_code == 200 else None
    except Exception:
        return None


def _searchable(dish: str) -> bool:
    """Whether TheMealDB could match this name at all.

    `_normalize` keeps [a-z0-9], so a Chinese dish name yields no tokens and
    `_mealdb_pick` rejects every result before looking at one. Asking anyway is
    a network round trip spent to be told nothing, on exactly the dishes that
    always end up generated.
    """
    return bool(_tokens(dish))


async def _lookup(
    dish: str, cuisine: str, desc: str, hint: str, dish_key: str, allowed: bool,
) -> str | None:
    """The cascade proper: a real photo of the recipe, else one drawn from it.

    The two lookups run together. They are independent questions -- does MealDB
    have this recipe, and have we already generated this dish -- and asking them
    one after the other put a whole round trip in front of the answer for every
    dish MealDB does not have, which is most of them. MealDB still wins when
    both answer: a photograph of the exact recipe outranks our drawing of it.
    """
    can_generate = imagegen.is_available()
    name = _object_name(dish_key)

    jobs: list[str] = []
    coros = []
    # The client is closed before generation starts: it is wanted for two small
    # calls, and holding a connection pool open for the minute a drawing can
    # take, once per dish in a meal plan, buys nothing.
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, follow_redirects=True) as client:
        if _searchable(dish):
            jobs.append("mealdb")
            coros.append(_themealdb_image(dish, client))
        if can_generate:
            jobs.append("stored")
            coros.append(_existing_generated(name, client))

        found: dict[str, str | None] = {}
        if coros:
            results = await asyncio.gather(*coros, return_exceptions=True)
            for job, result in zip(jobs, results):
                found[job] = None if isinstance(result, BaseException) else result

    if found.get("mealdb"):
        return found["mealdb"]
    if found.get("stored"):
        logger.info("[images] reusing the stored image for %r", dish)
        return found["stored"]

    if not can_generate:
        return None
    if not allowed:
        logger.info("[images] generation budget spent; %r gets no image", dish)
        return None

    raw = await imagegen.generate_dish_image(dish, cuisine, desc, hint)
    if raw is None:
        return None
    # The Supabase client is synchronous, so this upload is a blocking network
    # POST. Left on the event loop it stops the whole process for its duration,
    # and a meal plan uploads several images at once.
    url = await asyncio.to_thread(db.upload_dish_image, name, raw)
    if url:
        logger.info("[images] generated a photo for %r -> %s", dish, url)
    return url


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------

def _cache_key(dish_key: str, hint: str, cuisine: str) -> str:
    return f"img:{_CACHE_VERSION}:{dish_key}|{hint.casefold()}|{cuisine.casefold()}"


# Resolutions currently running, keyed exactly as the cache is. Everything that
# arrives for a dish while one is in flight waits on that one instead of
# starting its own.
_inflight: dict[str, "asyncio.Task[str | None]"] = {}


async def _resolve_once(
    key: str, dish: str, cuisine: str, desc: str, hint: str,
    dish_key: str, gen_allowed: bool,
) -> str | None:
    """One trip through the cascade, with its result written to the cache.

    Owns the caching so that a caller who walks away mid-generation does not
    take the answer with them: the image was paid for either way, and the next
    request for that dish should find it waiting.
    """
    url = await _lookup(dish, cuisine, desc, hint, dish_key, gen_allowed)
    cache_set(key, {"url": url}, _IMG_TTL_HIT if url else _IMG_TTL_MISS)
    return url


async def resolve_dish_image(
    dish: str, hint: str = "", cuisine: str = "", client_ip: str = "unknown",
    desc: str = "",
) -> str | None:
    """Resolve (and cache) the header photo for one dish.

    Shared by the endpoint and by the prewarm that runs after meal generation,
    so both go through the same caching and rate limits. Returns the cached
    answer without touching anything external when there is one.
    """
    dish = dish.strip()
    hint = hint.strip()
    cuisine = cuisine.strip()
    # Long enough to describe how the dish should look, short enough not to
    # crowd the generation prompt.
    desc = (desc or "").strip()[:300]
    if not dish:
        return None

    # The dish, not the dish+hint pair, owns an image: the same dish generated
    # twice with slightly different wording must resolve to the same picture.
    dish_key = dish.casefold()
    key = _cache_key(dish_key, hint, cuisine)
    cached = cache_get(key)
    if cached is not None:
        return cached.get("url")

    # A resolution already running for this dish is the answer to this one too.
    # The cache is only written at the end, so without this the common case --
    # prewarm starts generating a dish, the user taps that card a second later --
    # missed the cache and paid for a second generation, then waited out its full
    # length instead of joining one already most of the way done.
    running = _inflight.get(key)
    if running is not None:
        return await asyncio.shield(running)

    if not rate_limit_check(client_ip, "image-search", _IMG_MAX, _IMG_WINDOW):
        return None
    # A separate, tighter budget for the paid step. Exhausting it means a card
    # with no hero rather than a failed request, and it never blocks reusing an
    # image that already exists.
    gen_allowed = rate_limit_check(client_ip, "image-gen", _GEN_MAX, _GEN_WINDOW)

    task = asyncio.ensure_future(
        _resolve_once(key, dish, cuisine, desc, hint, dish_key, gen_allowed)
    )
    _inflight[key] = task
    # Shielded, and cleared by the task itself rather than in a finally here:
    # if this caller goes away the generation it started still finishes and
    # still lands in the cache, which is the whole point of prewarming.
    task.add_done_callback(lambda _t, k=key: _inflight.pop(k, None))
    return await asyncio.shield(task)


# Prewarm tasks are held here so the event loop cannot garbage-collect a task
# that nothing is awaiting; they discard themselves on completion.
_prewarm_tasks: set[asyncio.Task] = set()


def prewarm_dish_images(meals: list[dict], client_ip: str = "unknown") -> None:
    """Start resolving header photos for freshly generated meals, in background.

    Generating one takes seconds, and that wait used to sit between the user
    tapping a card and seeing anything. Generation already knows which dishes
    are coming, so the work starts there and is normally finished, and cached,
    before a card is ever opened.

    Fire-and-forget by design: an image is not worth delaying or failing a meal
    response over.
    """
    if not meals:
        return
    for meal in meals:
        name = (meal.get("name") or "").strip()
        if not name:
            continue
        task = asyncio.create_task(
            _prewarm_one(
                name,
                meal.get("image_query") or "",
                meal.get("cuisine") or "",
                client_ip,
                meal.get("description") or "",
            )
        )
        _prewarm_tasks.add(task)
        task.add_done_callback(_prewarm_tasks.discard)


async def _prewarm_one(
    dish: str, hint: str, cuisine: str, client_ip: str, desc: str = ""
) -> None:
    try:
        url = await resolve_dish_image(dish, hint, cuisine, client_ip, desc)
        logger.info("[images] prewarmed %r -> %s", dish, url or "no image")
    except Exception as exc:
        logger.warning("[images] prewarm failed for %r: %s", dish, exc)


@router.get("/search")
async def image_search(
    request: Request,
    q: str = Query(..., description="Meal name to search for"),
    hint: str | None = Query(
        None,
        description=(
            "Optional plain description of the dish, e.g. 'braised pork ribs'. "
            "The meal generator supplies this as image_query."
        ),
    ),
    cuisine: str | None = Query(None, description="Optional cuisine, e.g. 'Chinese'."),
    desc: str | None = Query(
        None,
        description=(
            "Optional: the recipe's own description of the finished dish. This is "
            "what a generated image is drawn from, so it is the difference between "
            "a dark glossy soy braise and a chilli-oil one."
        ),
    ),
):
    """TheMealDB's photo of this exact recipe, else an image generated from the
    recipe's own description. Returns {url} or {url: null}.

    Usually a cache hit: meal generation prewarms the dishes it just produced,
    so the slow part is normally over before a card is opened.
    """
    client_ip = request.client.host if request.client else "unknown"
    url = await resolve_dish_image(q, hint or "", cuisine or "", client_ip, desc or "")
    return {"url": url}
