"""
Fetches recipe content from URLs for the AI to parse.

Sites embed recipes as JSON-LD structured data (`<script type="application/ld+json">`)
on virtually every modern recipe page. We extract just that block when present — it is
tiny and exactly what the parse prompt wants — and otherwise fall back to the page's
visible text with HTML tags stripped. Either way the payload is capped well below the
model's per-minute token limit (raw HTML routinely blew past 12k TPM on the free tier).
"""
import asyncio
import ipaddress
import re
import socket
from urllib.parse import urljoin, urlparse

import httpx

_MAX_REDIRECTS = 5


class UnsafeURLError(ValueError):
    """Raised when a URL targets a non-public address or unsupported scheme (SSRF guard)."""


async def _assert_public_http_url(url: str) -> None:
    """
    Reject anything that isn't a plain http(s) URL resolving to a public address.

    Blocks SSRF into loopback / private / link-local / reserved ranges (cloud
    metadata at 169.254.169.254, internal services, localhost, etc.). All DNS
    answers must be public — a host that resolves to even one internal IP is rejected.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnsafeURLError("Only http(s) URLs are supported.")
    host = parsed.hostname
    if not host:
        raise UnsafeURLError("URL has no host.")

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        infos = await asyncio.to_thread(
            socket.getaddrinfo, host, port, 0, socket.SOCK_STREAM
        )
    except socket.gaierror:
        raise UnsafeURLError("Could not resolve host.")

    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        # Unwrap IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) before classifying.
        mapped = getattr(ip, "ipv4_mapped", None)
        if mapped is not None:
            ip = mapped
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise UnsafeURLError("URL resolves to a non-public address.")


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

    Redirects are followed manually so the SSRF guard re-validates every hop — a
    public URL that 30x-redirects to an internal address is rejected.
    """
    # follow_redirects=False: each hop is validated by _assert_public_http_url first.
    async with httpx.AsyncClient(
        headers=HEADERS,
        timeout=15,
        follow_redirects=False,
    ) as client:
        current = url
        for _ in range(_MAX_REDIRECTS + 1):
            await _assert_public_http_url(current)
            response = await client.get(current)
            if response.is_redirect:
                location = response.headers.get("location")
                if not location:
                    break
                current = urljoin(current, location)
                continue
            # Some big sites (AllRecipes, NYT…) block automated fetches with 402/403/429.
            # Surface a clear, actionable message instead of a raw HTTP status.
            if response.status_code in (401, 402, 403, 429):
                raise ValueError(
                    "This site blocks automated access. Try a different recipe URL "
                    "(most recipe blogs work), or add the recipe manually."
                )
            response.raise_for_status()
            return extract_recipe_content(response.text, max_chars)
        raise ValueError("Too many redirects.")
