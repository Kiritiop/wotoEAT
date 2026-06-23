"""
Fetches recipe content from URLs for the AI to parse.

Sites embed recipes as JSON-LD structured data (`<script type="application/ld+json">`)
on virtually every modern recipe page. We extract just that block when present — it is
tiny and exactly what the parse prompt wants — and otherwise fall back to the page's
visible text with HTML tags stripped. Either way the payload is capped well below the
model's per-minute token limit (raw HTML routinely blew past 12k TPM on the free tier).
"""
import re
import httpx

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

_JSONLD_RE = re.compile(
    r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)
_SCRIPT_STYLE_RE = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.DOTALL | re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def extract_recipe_content(html: str, budget: int) -> str:
    """
    Reduce a full HTML page to a compact, recipe-relevant slice under `budget` chars.

    1. Prefer JSON-LD blocks that look like a Recipe (the prompt's primary path).
    2. Otherwise strip scripts/styles/tags and collapse whitespace to visible text.
    """
    recipe_blocks = [
        b.strip()
        for b in _JSONLD_RE.findall(html)
        if '"Recipe"' in b or "recipeIngredient" in b or "recipeInstructions" in b
    ]
    if recipe_blocks:
        return "\n".join(recipe_blocks)[:budget]

    text = _SCRIPT_STYLE_RE.sub(" ", html)
    text = _TAG_RE.sub(" ", text)
    text = _WS_RE.sub(" ", text)
    return text.strip()[:budget]


async def fetch_page_html(url: str, max_chars: int = 16_000) -> str:
    """
    Fetch a recipe page and return a compact, token-budget-safe slice of its content.

    16,000 chars of JSON-LD/stripped text keeps the AI request comfortably under the
    free-tier 12k tokens-per-minute limit while preserving full ingredients and steps.
    """
    async with httpx.AsyncClient(
        headers=HEADERS,
        timeout=15,
        follow_redirects=True,
    ) as client:
        response = await client.get(url)
        response.raise_for_status()
        return extract_recipe_content(response.text, max_chars)
