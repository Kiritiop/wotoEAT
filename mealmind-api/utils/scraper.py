"""
Fetches raw HTML from recipe URLs for Claude to parse.
Keeps a reasonable timeout and fakes a browser User-Agent so sites
don't immediately block the request.
"""
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


async def fetch_page_html(url: str, max_chars: int = 50_000) -> str:
    """
    Fetch the HTML of a webpage and return a truncated slice.

    50,000 chars captures JSON-LD structured data and recipe content that
    typically appear after several KB of <head> boilerplate on recipe sites.
    """
    async with httpx.AsyncClient(
        headers=HEADERS,
        timeout=15,
        follow_redirects=True,
    ) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.text[:max_chars]
