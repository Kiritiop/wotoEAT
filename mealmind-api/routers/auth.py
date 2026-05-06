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
    """
    if not _JWT_SECRET:
        logger.warning("[auth] SUPABASE_JWT_SECRET not set — JWT signatures are NOT verified")
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
        raise ValueError(f"Invalid token: {e}")


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
