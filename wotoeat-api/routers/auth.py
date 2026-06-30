"""
FastAPI dependency that extracts the Supabase user ID from a *verified* Bearer token.

Supabase access tokens are cryptographically verified before any claim is trusted:
  - Legacy projects (HS256): verified with the shared secret in SUPABASE_JWT_SECRET.
  - Asymmetric projects (ES256/RS256): verified against the project JWKS, fetched
    from {SUPABASE_URL}/auth/v1/.well-known/jwks.json.

The user id (`sub`) is only returned when the signature, expiry, and audience all
check out. Anything that fails verification is treated as unauthenticated.
"""
import logging
import os
from typing import Optional

import jwt
from jwt import PyJWKClient
from fastapi import Header, HTTPException

logger = logging.getLogger(__name__)

_JWT_SECRET = (os.getenv("SUPABASE_JWT_SECRET", "") or "").strip()
_SUPABASE_URL = (os.getenv("SUPABASE_URL", "") or "").strip().rstrip("/")
_AUDIENCE = "authenticated"
_SYMMETRIC_ALGS = ["HS256"]
_ASYMMETRIC_ALGS = ["ES256", "RS256"]
_DECODE_OPTIONS = {"require": ["exp", "sub"]}

_jwks_client: Optional[PyJWKClient] = None


def _get_jwks_client() -> Optional[PyJWKClient]:
    """Lazily build (and cache) a JWKS client for asymmetric token verification."""
    global _jwks_client
    if _jwks_client is None and _SUPABASE_URL:
        jwks_url = f"{_SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        # PyJWKClient caches fetched keys in-process (default 5 min lifespan).
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True)
    return _jwks_client


def _verify_and_extract_sub(token: str) -> Optional[str]:
    """
    Verify the JWT signature, expiry and audience, then return the `sub` claim.
    Returns None for any token that is missing, malformed, or fails verification.
    Fails closed: an unverifiable token is never trusted.
    """
    try:
        alg = jwt.get_unverified_header(token).get("alg")
    except Exception:
        return None

    try:
        if alg in _SYMMETRIC_ALGS:
            if not _JWT_SECRET:
                logger.warning(
                    "[auth] HS256 token received but SUPABASE_JWT_SECRET is not configured"
                )
                return None
            payload = jwt.decode(
                token,
                _JWT_SECRET,
                algorithms=_SYMMETRIC_ALGS,
                audience=_AUDIENCE,
                options=_DECODE_OPTIONS,
            )
        elif alg in _ASYMMETRIC_ALGS:
            client = _get_jwks_client()
            if client is None:
                logger.warning(
                    "[auth] asymmetric token received but SUPABASE_URL is not configured"
                )
                return None
            signing_key = client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=_ASYMMETRIC_ALGS,
                audience=_AUDIENCE,
                options=_DECODE_OPTIONS,
            )
        else:
            logger.debug("[auth] unsupported token alg: %s", alg)
            return None
    except jwt.PyJWTError as exc:
        logger.debug("[auth] token rejected: %s", exc)
        return None
    except Exception as exc:
        # JWKS fetch failures, etc. — fail closed rather than trusting the token.
        logger.warning("[auth] token verification error: %s", exc)
        return None

    return payload.get("sub")


async def get_optional_user_id(
    authorization: Optional[str] = Header(None),
) -> Optional[str]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        return None
    return _verify_and_extract_sub(token)


async def require_user_id(
    authorization: Optional[str] = Header(None),
) -> str:
    user_id = await get_optional_user_id(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user_id
