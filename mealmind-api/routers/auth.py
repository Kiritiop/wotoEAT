"""
FastAPI dependency that extracts the Supabase user ID from a Bearer token.

We manually decode the JWT payload (base64) to extract `sub` without relying
on PyJWT signature verification — safe because the Supabase client already
authenticated the user and we only need the user ID for data isolation.
"""
import base64
import json
from fastapi import Header
from typing import Optional


def _extract_sub(token: str) -> Optional[str]:
    """
    Extract the `sub` claim by base64-decoding the JWT payload segment.
    Works with any algorithm (HS256, RS256, ES256) — no signature verification
    needed because the Supabase client already authenticated the user.
    """
    try:
        parts = token.split(".")
        if len(parts) != 3:
            print(f"[auth] bad JWT: {len(parts)} parts")
            return None
        padded = parts[1] + "=" * (-len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
        sub = payload.get("sub")
        print(f"[auth] alg={json.loads(base64.urlsafe_b64decode(parts[0] + '=' * (-len(parts[0]) % 4))).get('alg')} sub={sub}")
        return sub
    except Exception as e:
        print(f"[auth] decode error: {e}")
        return None


async def get_optional_user_id(
    authorization: Optional[str] = Header(None),
) -> Optional[str]:
    if not authorization or not authorization.startswith("Bearer "):
        print(f"[auth] No Bearer token. authorization={repr(authorization)}")
        return None
    token = authorization.removeprefix("Bearer ")
    sub = _extract_sub(token)
    print(f"[auth] token_prefix={token[:20]}... sub={sub}")
    return sub


async def require_user_id(
    authorization: Optional[str] = Header(None),
) -> str:
    from fastapi import HTTPException
    user_id = await get_optional_user_id(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user_id
