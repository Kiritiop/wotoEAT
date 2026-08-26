import asyncio
import base64
import hashlib
import logging
import os
import re
import unicodedata
import httpx
from fastapi import APIRouter, Query, Request

from ai.claude import verify_dish_photo, UNVERIFIED
from ai import imagegen
from db import supabase_client as db
from ai.sqlite_cache import cache_get, cache_set, rate_limit_check

logger = logging.getLogger(__name__)

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
_CACHE_VERSION = "v9"

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

# Words that are true of thousands of different dishes: how it was cooked, what
# it is served on or with, and the broad family of protein. They belong in the
# search query -- dropping them makes it useless -- but they must not be able to
# outvote the one word that actually identifies the dish.
#
# The case that forced this: "braised pork ribs" scored 0.67 against a photo
# alt-texted "braised pork BELLY with sauce and greens", because `braised` and
# `pork` matched and `ribs` -- the only word that makes it that dish -- counted
# for exactly as much as either. The app duly showed pork belly for 红烧排骨.
_GENERIC = {
    # how it was cooked
    "braised", "grilled", "roasted", "roast", "fried", "stir", "steamed",
    "baked", "seared", "boiled", "sauteed", "smoked", "poached", "glazed",
    "marinated", "stewed", "simmered", "charred", "crispy", "creamy",
    # what it is served on / in / with
    "rice", "noodles", "noodle", "pasta", "bread", "bun", "buns", "potato",
    "potatoes", "salad", "soup", "stew", "broth", "sauce", "gravy",
    "vegetables", "vegetable", "veggies", "greens", "bowl", "plate", "platter",
    "skillet", "pan", "pot", "board", "table",
    # the broad family, not the cut or the species
    "meat", "poultry", "seafood", "fish", "pork", "beef", "chicken", "lamb",
    "protein",
    # where it is from -- helpful in a query, but it does not name the dish
    "chinese", "korean", "japanese", "thai", "vietnamese", "indian", "italian",
    "french", "spanish", "greek", "mexican", "turkish", "asian", "western",
}

# The thing a dish is actually made of. If a photo's own description names one
# of these and it is not the one our dish uses, the photographer has told us
# plainly that this is a different dish, and no amount of shared vocabulary
# ("tikka masala curry") changes that.
#
# This is the cheap half of a two-signal check. Pexels 30858402 and 30858420 are
# both titled "paneer tikka masala"; the vision model read the second as chicken
# with char marks and rated it 10/10. One of them is wrong, and when the caption
# and the pixels disagree about the protein the honest move is to spend the
# shortlist on a photo where they agree. It also saves a vision call.
_MAIN_INGREDIENTS = {
    "chicken", "beef", "pork", "lamb", "mutton", "veal", "turkey", "duck",
    "goose", "venison", "goat", "rabbit",
    "paneer", "tofu", "tempeh", "halloumi", "seitan",
    "shrimp", "prawn", "prawns", "fish", "salmon", "tuna", "cod", "haddock",
    "crab", "lobster", "squid", "octopus", "mussels", "clams", "scallops",
}


def _contradicts(alt_tokens: set[str], wanted: list[str]) -> bool:
    """True when the photo's description names a different main ingredient.

    Only fires when BOTH sides name one: a dish with no protein word in its
    query, or a caption that mentions none, is left to the vision model.
    """
    ours = {w for w in wanted if w in _MAIN_INGREDIENTS}
    theirs = alt_tokens & _MAIN_INGREDIENTS
    return bool(ours) and bool(theirs) and not (ours & theirs)


# A word that identifies the dish is worth this many generic ones. Four means a
# query's defining word cannot be outvoted by three background words, which is
# exactly the pork-belly case above.
_DISTINCT_WEIGHT = 4


def _weight(word: str) -> int:
    """How much this word counts toward believing a photo shows the dish."""
    return 1 if word in _GENERIC else _DISTINCT_WEIGHT


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


# How much better a claimed photo has to be before a dish is allowed to reuse
# it. On the vision model's 0-10 fit scale, 2 is a whole band: "this dish plated
# differently" versus "a close regional variant".
_FIT_TOLERANCE = 2.0


def _rank(dish_key: str, candidates: list[dict]) -> list[dict]:
    """Best first: vision fit, then word overlap, then a stable per-dish shuffle."""
    return sorted(
        candidates,
        key=lambda c: (-c.get("fit", 0.0), -c["score"], _spread(dish_key, c["id"])),
    )


def _choose(dish_key: str, candidates: list[dict]) -> str | None:
    """Pick a photo, preferring one no other dish has taken.

    Distinctness breaks ties; it does not outrank being the right photo. The
    first version skipped every claimed candidate outright, and a live run
    showed what that costs: "Red Braised Pork Ribs" and "红烧排骨" are the same
    dish under two names, so the second one was pushed off the good photo and
    onto a worse one purely because the first had claimed it. A dish may now
    reuse a claimed photo when the best free alternative is materially worse.
    """
    if not candidates:
        return None
    ranked = _rank(dish_key, candidates)
    best = ranked[0]

    for cand in ranked:
        if _claimed_by("photo", cand["id"]) not in (None, dish_key):
            continue
        if _claimed_by("shoot", cand["shoot"]) not in (None, dish_key):
            continue
        # Only settle for a free photo if it is nearly as good as the best one.
        if cand.get("fit", 0.0) < best.get("fit", 0.0) - _FIT_TOLERANCE:
            break
        _claim("photo", cand["id"], dish_key)
        _claim("shoot", cand["shoot"], dish_key)
        return cand["url"]

    # Everything good is spoken for. Showing the right photo twice beats showing
    # the wrong one once, so the best candidate wins without taking a claim off
    # the dish that owns it.
    return best["url"]


# ---------------------------------------------------------------------------
# Pexels
# ---------------------------------------------------------------------------

# A photo has to look like the thing we asked for. Below this share of the
# query's words appearing in the photo's own description, we would rather show
# no image than a confidently wrong one.
_PEXELS_FLOOR = 0.5
_PEXELS_PER_PAGE = 30


def _pexels_score(alt: str, wanted: list[str]) -> float:
    """How well a photo's own description matches the query, weighted so the
    word that identifies the dish carries the decision.

    An unweighted share of matched words lets background terms carry a photo
    over the line on their own: "braised pork ribs" scored 0.67 against a
    braised-pork-BELLY photo, because two of its three words were true of both
    dishes. Weighting makes the missing `ribs` decisive (0.33, rejected) while
    a real ribs photo scores 1.0 and outranks every near miss.

    A query with no distinctive word (say "thai stir fried noodles") weights
    everything equally, so this degrades to the old plain fraction.
    """
    if not alt or not wanted:
        return 0.0
    alt_tokens = set(_tokens(alt))
    if not alt_tokens:
        return 0.0
    matched = 0
    total = 0
    for word in wanted:
        weight = _weight(word)
        total += weight
        # Substring covers singular/plural and compounds ("noodle"/"noodles",
        # "chickpea"/"chickpeas") without dragging in a stemmer.
        if any(word in token or token in word for token in alt_tokens):
            matched += weight
    return matched / total if total else 0.0


# Pexels indexes contributor keywords per language, so asking in the dish's own
# language surfaces photos its own cuisine's photographers tagged. Worth trying
# for the cuisines whose home cooking a Western stock library covers worst.
_CUISINE_LOCALE = {
    "chinese": "zh-CN", "taiwanese": "zh-TW", "cantonese": "zh-CN",
    "sichuan": "zh-CN", "szechuan": "zh-CN", "japanese": "ja-JP",
    "korean": "ko-KR", "thai": "th-TH", "vietnamese": "vi-VN",
    "indonesian": "id-ID", "turkish": "tr-TR", "russian": "ru-RU",
    "brazilian": "pt-BR", "portuguese": "pt-PT", "spanish": "es-ES",
    "mexican": "es-MX", "italian": "it-IT", "french": "fr-FR",
    "german": "de-DE", "polish": "pl-PL",
}


def _locale_for(cuisine: str) -> str:
    return _CUISINE_LOCALE.get(cuisine.strip().casefold(), "")


async def _pexels_try(
    query_terms: list[str], score_terms: list[str], client: httpx.AsyncClient,
    locale: str = "",
) -> list[dict]:
    """One Pexels search, scored. Returns every candidate above the floor.

    The two term lists are deliberately separate. `query_terms` is what we ask
    Pexels for and may be broadened to surface more candidates; `score_terms` is
    what a photo has to satisfy and is ALWAYS the dish's full term list.
    Collapsing them lets a retry re-accept what the first pass just rejected:
    narrowing "braised pork ribs" to "braised pork" scored the pork-belly photo
    1.00 on a query that no longer contained the word `ribs`.
    """
    if not query_terms or not score_terms:
        return []
    try:
        resp = await client.get(
            "https://api.pexels.com/v1/search",
            params={
                "query": " ".join(query_terms) + " food",
                "per_page": _PEXELS_PER_PAGE,
                "orientation": "landscape",
                **({"locale": locale} if locale else {}),
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
        alt = photo.get("alt") or ""
        if _contradicts(set(_tokens(alt)), score_terms):
            continue
        score = _pexels_score(alt, score_terms)
        if score < _PEXELS_FLOOR:
            continue
        src = photo.get("src") or {}
        out.append({
            "url": url,
            # A smaller variant is plenty to judge the dish by, and keeps the
            # image token cost of the vision check down.
            "check_url": next((src[k] for k in _CHECK_SIZE_KEYS if src.get(k)), url),
            "score": score,
            "id": str(photo.get("id") or url),
            # Photographer stands in for "shoot": the duplicate frames that
            # started all this shared one.
            "shoot": str(photo.get("photographer_id") or ""),
        })
    return out


def _broaden(terms: list[str]) -> list[str]:
    """A second query for when the first surfaced nothing good enough.

    Prefer keeping only the words that identify the dish, so the search stops
    being crowded out by how it was cooked and what it sits on. If every word is
    already distinctive (nothing to drop), fall back to the leading pair.
    """
    distinctive = [t for t in terms if _weight(t) > 1]
    if distinctive and distinctive != terms:
        return distinctive
    return terms[:2]


async def _pexels_image(
    dish_name: str, hint: str | None, client: httpx.AsyncClient, dish_key: str,
    cuisine: str = "", vision_allowed: bool = True, desc: str = "",
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

    candidates = await _pexels_try(terms, terms, client, _locale_for(cuisine))
    if not candidates and len(terms) > 2:
        # Nothing cleared the floor. Ask Pexels a broader question, but judge the
        # answers by the same full term list -- a wider net, not a lower bar.
        candidates = await _pexels_try(_broaden(terms), terms, client, _locale_for(cuisine))

    candidates.sort(key=lambda c: -c["score"])  # best text matches get looked at
    candidates = await _vision_filter(
        candidates, dish_name, cuisine, " ".join(terms), client, vision_allowed, desc
    )
    return _choose(dish_key, candidates)


# ---------------------------------------------------------------------------
# Unsplash
# ---------------------------------------------------------------------------

async def _unsplash_image(
    dish_name: str, hint: str | None, client: httpx.AsyncClient, dish_key: str,
    cuisine: str = "", vision_allowed: bool = True, desc: str = "",
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
        if _contradicts(set(_tokens(alt)), terms):
            continue
        score = _pexels_score(alt, terms)
        if score < _PEXELS_FLOOR:
            continue
        urls = photo.get("urls") or {}
        candidates.append({
            "url": url,
            "check_url": urls.get("small") or urls.get("thumb") or url,
            "score": score,
            "id": str(photo.get("id") or url),
            "shoot": str(((photo.get("user") or {}).get("id")) or ""),
        })
    candidates.sort(key=lambda c: -c["score"])  # best text matches get looked at
    candidates = await _vision_filter(
        candidates, dish_name, cuisine, " ".join(terms), client, vision_allowed, desc
    )
    return _choose(dish_key, candidates)


# ---------------------------------------------------------------------------
# Vision gate
# ---------------------------------------------------------------------------
#
# Word matching has a ceiling, and "Red Braised Pork Ribs" is where it stops.
# A photo of ribs on an American barbecue shares every word that matters --
# `pork`, `ribs` -- and differs only by cooking method, which is true of
# thousands of dishes and so cannot be weighted heavily without rejecting
# everything. Alt text is one short line written by whoever uploaded the photo;
# no amount of tuning turns it into a description of what the picture looks like.
#
# So the last step is to actually look. The scored candidates decide WHICH
# photos are worth checking; the vision model decides which one ships. It is a
# veto on obvious mismatches, never the thing that grants approval: if it fails
# or is disabled, the text-matched choice stands rather than every dish losing
# its image.
_VISION_CHECK = os.getenv("IMAGE_VISION_CHECK", "1") not in ("0", "false", "False")

# How many candidates get looked at. Checked concurrently, so this costs one
# round-trip of latency, not three -- but it is three vision calls, billed.
_VISION_CANDIDATES = 3

# Vision is the expensive part of this endpoint, so it gets its own budget on
# top of the lookup cap. Counted in individual model calls, and one dish costs
# up to _VISION_CANDIDATES of them, so 180 is roughly 60 novel dishes an hour.
# A dish is only ever paid for once: prewarm and the endpoint share the cache.
_VISION_MAX = 180
_VISION_WINDOW = 3600

# Enough pixels to tell a braise from a barbecue, small enough to keep the
# image token cost down. Falls back through the size ladder each source offers.
_CHECK_SIZE_KEYS = ("medium", "small", "large")


async def _fetch_b64(url: str, client: httpx.AsyncClient) -> str | None:
    """Download a candidate small enough to hand to the vision model."""
    try:
        resp = await client.get(url)
        if resp.status_code != 200 or len(resp.content) > 4_000_000:
            return None
        return base64.b64encode(resp.content).decode()
    except Exception:
        return None


async def _looks_right(
    cand: dict, dish_name: str, cuisine: str, hint: str, client: httpx.AsyncClient,
    desc: str = "",
) -> tuple[bool, float]:
    """(usable, fit) for one candidate."""
    b64 = await _fetch_b64(cand.get("check_url") or cand["url"], client)
    if b64 is None:
        return False, 0.0
    usable, fit, shows = await verify_dish_photo(dish_name, cuisine, hint, b64, desc)
    if shows == UNVERIFIED:
        # Not a verdict. ai.claude has already logged why at WARNING; say plainly
        # here that this photo is going out unchecked, so a broken gate can never
        # again look like a working one in the logs.
        logger.warning(
            "[images] %s for %r was NOT checked (vision unavailable); "
            "keeping it on its text match alone",
            cand["id"], dish_name,
        )
    else:
        logger.info(
            "[images] %s %s for %r: fit %.0f/10, photo shows %r",
            "kept" if usable else "REJECTED", cand["id"], dish_name, fit, shows,
        )
    return usable, fit


async def _vision_filter(
    candidates: list[dict], dish_name: str, cuisine: str, hint: str,
    client: httpx.AsyncClient, allowed: bool, desc: str = "",
) -> list[dict]:
    """Keep only the candidates a vision model agrees show the dish.

    Only the top few are checked, so this narrows the shortlist rather than
    re-ranking the whole result set. If every one is rejected the caller gets an
    empty list and shows no image, which is the right answer: a hero that
    contradicts the recipe is worse than no hero.
    """
    if not _VISION_CHECK or not allowed or not candidates:
        return candidates
    head, tail = candidates[:_VISION_CANDIDATES], candidates[_VISION_CANDIDATES:]
    verdicts = await asyncio.gather(
        *(_looks_right(c, dish_name, cuisine, hint, client, desc) for c in head),
        return_exceptions=True,
    )
    kept: list[dict] = []
    for cand, verdict in zip(head, verdicts):
        if isinstance(verdict, BaseException):
            kept.append(cand)  # the check broke, not the photo
            continue
        passes, fit = verdict
        if passes:
            # fit becomes the primary ranking key, so candidates compete on how
            # well they show the dish rather than on word overlap alone.
            kept.append({**cand, "fit": fit})
    # Deliberately NOT falling through to `tail`. Candidates arrive best-first,
    # so if the three strongest were all rejected the rest are worse, and
    # shipping an unlooked-at photo is how the wrong image got out in the first
    # place. An empty list means no hero, which beats a hero that contradicts
    # the recipe sitting underneath it.
    return kept


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

async def _generated_image(
    dish: str, cuisine: str, desc: str, hint: str, dish_key: str
) -> str | None:
    """Make a photo when no real one survived vetting.

    Deliberately last. A generated image is not a photograph of real food, so it
    must never displace one that is, and it only runs once every real candidate
    has been rejected. For a Chinese home dish that is common: Pexels is a
    Western library, and its 红烧排骨 is a Sichuan chilli-oil braise.
    """
    if not imagegen.is_available():
        return None
    raw = await imagegen.generate_dish_image(dish, cuisine, desc, hint)
    if raw is None:
        return None
    # Deterministic name so regenerating the same dish overwrites rather than
    # littering the bucket, and so the URL is stable across deploys.
    name = f"{_CACHE_VERSION}/{hashlib.sha1(dish_key.encode()).hexdigest()[:20]}.jpg"
    url = db.upload_dish_image(name, raw)
    if url:
        logger.info("[images] generated a photo for %r -> %s", dish, url)
    return url


def _cache_key(dish_key: str, hint: str, cuisine: str) -> str:
    return f"img:{_CACHE_VERSION}:{dish_key}|{hint.casefold()}|{cuisine.casefold()}"


async def resolve_dish_image(
    dish: str, hint: str = "", cuisine: str = "", client_ip: str = "unknown",
    desc: str = "",
) -> str | None:
    """Resolve (and cache) the header photo for one dish.

    Shared by the endpoint and by the prewarm that runs after meal generation,
    so both go through the same caching, rate limits and vetting. Returns the
    cached answer without touching anything external when there is one.
    """
    dish = dish.strip()
    hint = hint.strip()
    cuisine = cuisine.strip()
    # Long enough to convey how the dish should look, short enough not to crowd
    # the prompt. The check reads it; nothing else does, so it stays out of the
    # cache key -- a reworded description must not orphan a resolved photo.
    desc = (desc or "").strip()[:300]
    # The dish, not the dish+hint pair, owns a photo: the same dish generated
    # twice with slightly different wording must not fight itself for a claim.
    dish_key = dish.casefold()
    key = _cache_key(dish_key, hint, cuisine)
    cached = cache_get(key)
    if cached is not None:
        return cached.get("url")

    # Cache miss -> about to hit external APIs. Rate-limit novel lookups per IP.
    # On limit, degrade to a placeholder (don't cache it -- the cap is transient).
    if not rate_limit_check(client_ip, "image-search", _IMG_MAX, _IMG_WINDOW):
        return None

    # Vision has its own, tighter budget. Exhausting it degrades this request to
    # text-only matching rather than failing it: a decently matched photo beats
    # none, and the cap is transient.
    vision_allowed = rate_limit_check(
        client_ip, "image-vision", _VISION_MAX, _VISION_WINDOW
    )

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        url = (
            # A verified MealDB name match is a photograph of that exact recipe,
            # which is stronger evidence than a vision model's opinion of a stock
            # photo, so it skips the gate.
            await _themealdb_image(dish, client)
            or await _pexels_image(
                dish, hint or None, client, dish_key, cuisine, vision_allowed, desc
            )
            or await _unsplash_image(
                dish, hint or None, client, dish_key, cuisine, vision_allowed, desc
            )
        )
    if url is None:
        url = await _generated_image(dish, cuisine, desc, hint, dish_key)
    cache_set(key, {"url": url}, _IMG_TTL_HIT if url else _IMG_TTL_MISS)
    return url


# Prewarm tasks are held here so the event loop cannot garbage-collect a task
# that nothing is awaiting; they discard themselves on completion.
_prewarm_tasks: set[asyncio.Task] = set()


def prewarm_dish_images(meals: list[dict], client_ip: str = "unknown") -> None:
    """Start resolving header photos for freshly generated meals, in background.

    Vetting a photo means downloading candidates and having a vision model look
    at them, which took 10-15 seconds when it ran on modal-open. That whole wait
    sat between the user tapping a card and seeing anything. Generation already
    knows which dishes are coming, so the work starts there instead and is
    normally finished, and cached, before a card is ever opened.

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
            "Optional plain search term for the dish, e.g. 'garlic butter chicken'. "
            "The meal generator supplies this as image_query; it searches far "
            "better than a display name."
        ),
    ),
    cuisine: str | None = Query(
        None,
        description=(
            "Optional cuisine, e.g. 'Chinese'. Used only by the vision check, where "
            "it is the difference between a red braise and a rack of BBQ ribs."
        ),
    ),
    desc: str | None = Query(
        None,
        description=(
            "Optional: the recipe's own description of the finished dish. Read only "
            "by the vision check, so it compares a photo against what THIS recipe "
            "says it should look like rather than a generic idea of the name."
        ),
    ),
):
    """Food-specific image cascade: TheMealDB (real dish photo) -> Pexels -> Unsplash.

    Candidates are shortlisted by how well a photo's own description matches the
    dish, then the best few are shown to a vision model which vetoes the ones
    that do not actually depict it. The endpoint returns {url: null} rather than
    an image that contradicts the recipe.

    Usually a cache hit: meal generation prewarms the dishes it just produced, so
    the slow part is normally over before a card is opened.
    """
    client_ip = request.client.host if request.client else "unknown"
    url = await resolve_dish_image(q, hint or "", cuisine or "", client_ip, desc or "")
    return {"url": url}
