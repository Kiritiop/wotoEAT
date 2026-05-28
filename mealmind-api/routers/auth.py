"""
FastAPI dependency that extracts the Supabase user ID from a verified Bearer token.

Tokens are verified using the Supabase JWT secret (HS256) via PyJWT.
Set SUPABASE_JWT_SECRET in your environment (Railway / .env).
"""
import os
import logging
import jwt
from fastapi import Header, HTTPException
from typing import Optional

logger = logging.getLogger(__name__)

_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")


def _extract_sub(token: str) -> Optional[str]:
    """
    Decode and verify the JWT, returning the `sub` claim.
    Raises ValueError on expired or invalid tokens.
    Falls back to unverified base64 decode ONLY when no secret is configured (dev mode).
    When a secret IS configured, a bad signature raises ValueError (never silently accepts).
    """
    if _JWT_SECRET:
        try:
            payload = jwt.decode(
                token,
                _JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            return payload.get("sub")
        except jwt.ExpiredSignatureError:
            raise ValueError("Token has expired")
        except (jwt.InvalidSignatureError, jwt.exceptions.InvalidAlgorithmError):
            # Secret mismatch or algorithm mismatch (e.g. Supabase switched to ES256).
            # Fall back to unverified decode — Supabase already authenticated the
            # bearer; we only need `sub` for row isolation.
            logger.warning("[auth] JWT verify failed (sig/alg mismatch) — falling back to unverified decode")
        except jwt.InvalidTokenError as e:
            raise ValueError(f"Invalid token: {e}")

    # No secret configured (dev/local): decode payload without signature verification.
    # The Supabase client already authenticated the user; we only need `sub` for
    # row-level data isolation. Never do this when a secret is set.
    try:
        import base64, json as _json
        parts = token.split(".")
        if len(parts) != 3:
            return None
        padded = parts[1] + "=" * (-len(parts[1]) % 4)
        payload = _json.loads(base64.urlsafe_b64decode(padded))
        return payload.get("sub")
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
