"""
Offline regression test for the SSRF guard in utils/scraper.py.

Run from wotoeat-api/:  venv/bin/python tests/test_scraper_ssrf.py
No network, no LLM, no API key — uses IP literals / localhost so getaddrinfo
never needs real DNS. This locks in the security boundary that stops
/recipes/parse from fetching internal addresses (cloud metadata, localhost,
private ranges). If you ever loosen _assert_public_http_url, this must stay green.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from utils.scraper import _assert_public_http_url, UnsafeURLError  # noqa: E402

# (url, should_be_blocked)
CASES = [
    # Blocked: non-public targets
    ("http://127.0.0.1/", True),                 # loopback
    ("http://localhost/", True),                 # loopback via name
    ("http://169.254.169.254/latest/meta-data/", True),  # cloud metadata (link-local)
    ("http://10.0.0.5/", True),                  # private
    ("http://192.168.1.1/", True),               # private
    ("http://172.16.0.1/", True),                # private
    ("https://[::1]/", True),                    # IPv6 loopback
    ("http://0.0.0.0/", True),                   # unspecified
    # Blocked: unsupported scheme
    ("ftp://8.8.8.8/", True),
    ("file:///etc/passwd", True),
    ("gopher://8.8.8.8/", True),
    # Allowed: genuine public addresses
    ("http://8.8.8.8/", False),
    ("http://1.1.1.1/recipe", False),
    ("https://93.184.216.34/", False),           # example.com's IP literal
]


async def _is_blocked(url: str) -> bool:
    try:
        await _assert_public_http_url(url)
        return False
    except UnsafeURLError:
        return True


def main() -> int:
    passed = failed = 0
    for url, expect_blocked in CASES:
        blocked = asyncio.run(_is_blocked(url))
        if blocked == expect_blocked:
            passed += 1
        else:
            failed += 1
            verb = "allowed" if not blocked else "blocked"
            want = "blocked" if expect_blocked else "allowed"
            print(f"FAIL  {url}  was {verb}, expected {want}")
    print(f"\n{passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
