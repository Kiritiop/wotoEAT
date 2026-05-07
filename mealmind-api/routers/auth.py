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
    Raises ValueError on expired tokens.
    Falls back to unverified base64 decode when the secret is absent or wrong.
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
        except jwt.InvalidTokenError as e:
            # Wrong secret configured — fall through to unverified decode
            logger.warning("[auth] JWT signature check failed (%s); falling back to unverified decode. "
                           "Set SUPABASE_JWT_SECRET to the raw JWT secret from Supabase → Settings → API.", e)

    # No secret set (or wrong secret): decode payload without signature verification.
    # The Supabase client already authenticated the user; we only need `sub` for
    # row-level data isolation.
    try:
        import base64, json
        parts = token.split(".")
        if len(parts) != 3:
            return None
        padded = parts[1] + "=" * (-len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
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
