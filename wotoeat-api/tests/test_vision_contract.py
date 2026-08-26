"""
The vision check must parse what the model actually sends back, and it must be
obvious when it cannot.

Run from wotoeat-api/:  venv/bin/python tests/test_vision_contract.py
No network, no keys -- _generate_vision is stubbed with real reply shapes.

This file exists because of a two-release outage that nothing caught. The vision
model is a reasoning model: it emits a <think> block before its answer, and Groq
bills that as completion tokens. max_tokens was set to 400, roughly the size of
the think block alone, so every reply truncated before its JSON, every parse
raised, and the fail-open path returned "approved" every time. The gate was a
no-op while its own logs said `kept`.

Two lessons are pinned here. First, the parse has to survive the shapes a
reasoning model really produces. Second, and more important, a check that cannot
fail visibly is not a check: a failure must be distinguishable from a pass by
the caller, not just buried in a log line that reads like success.
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("GROQ_API_KEY", "test-dummy-key")

import ai.claude as claude  # noqa: E402

checks: list[tuple[str, bool]] = []


def check(label: str, cond: bool, detail: str = "") -> None:
    checks.append((label, bool(cond)))
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{detail}]" if detail else ""))


REPLY = ""
SEEN_MAX_TOKENS: list[int] = []


async def _fake_vision(prompt, image_b64, max_tokens=4000):
    SEEN_MAX_TOKENS.append(max_tokens)
    if isinstance(REPLY, Exception):
        raise REPLY
    return REPLY


claude._generate_vision = _fake_vision  # type: ignore[assignment]


def verify(reply):
    global REPLY
    REPLY = reply
    return asyncio.run(claude.verify_dish_photo("Chicken Tikka Masala", "Indian", "chicken tikka masala", "Zm9v"))


GOOD = '{"shows": "chicken in tomato curry", "same_main_ingredient": true, "same_style": true, "fit": 9}'
PANEER = '{"shows": "paneer cubes in curry", "same_main_ingredient": false, "same_style": true, "fit": 5}'

# ── Reply shapes a reasoning model really produces ──────────────────────────
usable, fit, shows = verify(GOOD)
check("a plain JSON reply parses", usable and fit == 9.0, f"{usable} {fit} {shows}")

usable, fit, _ = verify("<think>The image shows chicken pieces...</think>\n" + GOOD)
check("a <think> block before the JSON is stripped", usable and fit == 9.0, str(fit))

usable, fit, _ = verify("<think>reasoning</think>\n```json\n" + GOOD + "\n```")
check("a fenced reply after reasoning parses", usable and fit == 9.0, str(fit))

# ── The outage itself: truncated inside the reasoning block ────────────────
usable, fit, shows = verify("<think>Let me look at this image carefully. The dish appears to")
check("a reply truncated mid-reasoning is NOT treated as approval",
      shows == claude.UNVERIFIED, f"shows={shows!r}")
check("...and it still fails open, so the dish keeps its photo", usable is True)
check("...with a fit of 0, so it can never outrank a real verdict", fit == 0.0, str(fit))

usable, fit, shows = verify("")
check("an empty reply is unverified, not approval", shows == claude.UNVERIFIED)

usable, fit, shows = verify(None)
check("a null message body is unverified, not approval", shows == claude.UNVERIFIED)

usable, fit, shows = verify("I cannot help with that.")
check("prose instead of JSON is unverified", shows == claude.UNVERIFIED)

usable, fit, shows = verify('["not", "an", "object"]')
check("a JSON array is unverified, not approval", shows == claude.UNVERIFIED)

usable, fit, shows = verify(RuntimeError("groq down"))
check("an exception from the model is unverified", shows == claude.UNVERIFIED)

# ── A real verdict must be distinguishable from a failure ─────────────────
usable, fit, shows = verify(PANEER)
check("paneer for chicken is rejected on same_main_ingredient", usable is False, str(usable))
check("a real rejection is NOT labelled unverified",
      shows != claude.UNVERIFIED, f"shows={shows!r}")
check("a rejection keeps its fit, so callers can rank on it", fit == 5.0, str(fit))

usable, _, _ = verify('{"shows": "x", "same_main_ingredient": true, "same_style": false, "fit": 9}')
check("a style mismatch is rejected even at fit 9", usable is False)

usable, _, _ = verify('{"shows": "x", "same_main_ingredient": true, "same_style": true, "fit": 5}')
check("a fit below _MIN_FIT is rejected even with both booleans", usable is False)

usable, fit, _ = verify('{"shows": "x", "same_main_ingredient": true, "same_style": true, "fit": "lots"}')
check("a non-numeric fit does not crash the parse", usable is False and fit == 0.0)

usable, fit, _ = verify('{"shows": "x", "same_main_ingredient": true, "same_style": true, "fit": 99}')
check("an out-of-range fit is clamped", fit == 10.0, str(fit))

# ── The budget that caused the outage ─────────────────────────────────────
check("the token budget leaves room for the reasoning block",
      claude._VISION_CHECK_MAX_TOKENS >= 2000, str(claude._VISION_CHECK_MAX_TOKENS))
check("that budget is what actually gets sent",
      SEEN_MAX_TOKENS and set(SEEN_MAX_TOKENS) == {claude._VISION_CHECK_MAX_TOKENS},
      str(set(SEEN_MAX_TOKENS)))

failed = [l for l, ok in checks if not ok]
print(f"\n{len(checks) - len(failed)}/{len(checks)} passed")
sys.exit(1 if failed else 0)
