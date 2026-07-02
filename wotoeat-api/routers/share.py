import json
from uuid import UUID

from fastapi import APIRouter, HTTPException, Depends, Request

from db.models import CreateShareRequest, CreateShareResponse, SharedItem
from db import supabase_client as db
from ai.sqlite_cache import rate_limit_check
from utils.errors import server_error
from .auth import get_optional_user_id

router = APIRouter(tags=["share"])

_SHARE_MAX = 30
_SHARE_WINDOW = 3600  # 30 shares / hour / client
# A real meal/recipe payload serializes to a few KB; 100KB is a generous cap
# that stops the public endpoint being used to stuff megabytes into the DB.
_MAX_PAYLOAD_BYTES = 100_000


@router.post("/", response_model=CreateShareResponse)
async def create_share(
    body: CreateShareRequest,
    request: Request,
    user_id: str | None = Depends(get_optional_user_id),
):
    """POST /share — store a meal/recipe payload and return its public id."""
    if body.kind not in ("recipe", "meal"):
        raise HTTPException(status_code=422, detail="kind must be 'recipe' or 'meal'.")
    if not body.payload:
        raise HTTPException(status_code=422, detail="payload is empty.")
    if len(json.dumps(body.payload, default=str)) > _MAX_PAYLOAD_BYTES:
        raise HTTPException(status_code=422, detail="Share payload is too large.")

    limit_key = user_id or (request.client.host if request.client else "anon")
    if not rate_limit_check(limit_key, "share-create", _SHARE_MAX, _SHARE_WINDOW):
        raise HTTPException(status_code=429, detail="Too many shares. Try again later.")

    try:
        share_id = db.create_share(body.kind, body.payload, user_id)
        if not share_id:
            raise RuntimeError("insert returned no id")
        return {"id": share_id}
    except Exception as exc:
        raise server_error("share.create", exc, "Could not create share.")


@router.get("/{share_id}", response_model=SharedItem)
async def get_share(share_id: str):
    """GET /share/{id} — public, no auth. Returns the shared payload."""
    # A malformed (non-UUID) id is simply "not found", not a server error —
    # Postgres would otherwise raise on the uuid cast and surface as a 500.
    try:
        UUID(share_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Shared item not found.")
    try:
        row = db.get_share(share_id)
    except Exception as exc:
        raise server_error("share.get", exc, "Could not load shared item.")
    if not row:
        raise HTTPException(status_code=404, detail="Shared item not found.")
    return row
