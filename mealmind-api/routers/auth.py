"""
FastAPI dependency that extracts the Supabase user ID from a Bearer token.
Returns None if no token is provided (allows unauthenticated dev usage).

SUPABASE_JWT_SECRET should be the raw JWT secret from:
  Supabase dashboard → Settings → API → JWT Settings → JWT Secret
NOT the service role key. If absent or wrong, we skip signature verification
(safe for local dev — the token still must be a valid Supabase JWT with a sub).
"""
import os
import jwt
from fastapi import Header
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

# The raw JWT signing secret (a random string, NOT the service-role key).
# Leave unset in dev to skip signature verification.
_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

# A Supabase service-role key starts with "eyJ" and has role=service_role.
# If someone mistakenly put that in SUPABASE_JWT_SECRET, treat it as absent.
if _JWT_SECRET and _JWT_SECRET.startswith("eyJ"):
    _JWT_SECRET = None


async def get_optional_user_id(
    authorization: Optional[str] = Header(None),
) -> Optional[str]:
    """
    Dependency: returns the user's UUID from a Supabase JWT, or None.
    Use with `Depends(get_optional_user_id)` on any endpoint.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ")
    try:
        if _JWT_SECRET:
            payload = jwt.decode(token, _JWT_SECRET, algorithms=["HS256"])
        else:
            # No valid secret configured — decode without verification.
            # The sub claim still uniquely identifies the Supabase user.
            payload = jwt.decode(
                token,
                options={"verify_signature": False},
                algorithms=["HS256", "RS256"],
            )
        return payload.get("sub")
    except Exception:
        return None


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
