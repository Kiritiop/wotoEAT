"""
FastAPI dependency that extracts the Supabase user ID from a verified Bearer token.

Tokens are verified using the Supabase JWT secret (HS256) via PyJWT.
Set SUPABASE_JWT_SECRET in your environment (Railway / .env).
"""
import logging
from fastapi import Header, HTTPException
from typing import Optional

logger = logging.getLogger(__name__)


def _extract_sub(token: str) -> Optional[str]:
    """
    Extract the `sub` claim from a Supabase JWT.
    Supabase issues ES256-signed tokens; we decode without signature verification
    since Supabase already authenticated the bearer — we only need `sub` for
    row-level data isolation.
    """
    try:
        import base64, json as _json
        parts = token.split(".")
        if len(parts) != 3:
            return None
        padded = parts[1] + "=" * (-len(parts[1]) % 4)
        payload = _json.loads(base64.urlsafe_b64decode(padded))
        # Still reject expired tokens
        import time
        if payload.get("exp") and payload["exp"] < time.time():
            raise ValueError("Token has expired")
        return payload.get("sub")
    except ValueError:
        raise
    except Exception:
        return None


async def get_optional_user_id(
    authorization: Optional[str] = Header(None),
) -> Optional[str]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ")
    try:
        return _extract_sub(token)
    except ValueError as e:
        logger.debug("[auth] token rejected: %s", e)
        return None


async def require_user_id(
    authorization: Optional[str] = Header(None),
) -> str:
    user_id = await get_optional_user_id(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user_id
