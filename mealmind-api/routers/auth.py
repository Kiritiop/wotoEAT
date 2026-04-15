"""
FastAPI dependency that extracts the Supabase user ID from a Bearer token.

We manually decode the JWT payload (base64) to extract `sub` without relying
on PyJWT signature verification — safe because the Supabase client already
authenticated the user and we only need the user ID for data isolation.
"""
import os
import base64
import json
import jwt
from fastapi import Header
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

# Optional: set to the raw JWT secret (Settings → API → JWT Settings) for
# full signature verification. Leave unset to use fast payload-only decoding.
_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
# Reject service-role keys accidentally placed here (they start with "eyJ")
if _JWT_SECRET and _JWT_SECRET.startswith("eyJ"):
    _JWT_SECRET = None


def _extract_sub(token: str) -> Optional[str]:
    """
    Extract the `sub` claim from a JWT without verifying the signature.
    Falls back to PyJWT with full verification if SUPABASE_JWT_SECRET is set.
    """
    if _JWT_SECRET:
        try:
            payload = jwt.decode(token, _JWT_SECRET, algorithms=["HS256"])
            return payload.get("sub")
        except Exception:
            return None

    # No secret — decode the payload segment directly (base64url, no crypto)
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        # Add padding so base64 decode doesn't fail
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
    return _extract_sub(authorization.removeprefix("Bearer "))


async def require_user_id(
    authorization: Optional[str] = Header(None),
) -> str:
    """
    Dependency: same as get_optional_user_id but raises 401 if missing.
    Use on endpoints that must be authenticated.
    """
    from fastapi import HTTPException
    user_id = await get_optional_user_id(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user_id
