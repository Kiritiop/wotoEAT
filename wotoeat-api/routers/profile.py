from fastapi import APIRouter, Depends
from db.models import HealthProfile
from db import supabase_client as db
from utils.errors import server_error
from .auth import require_user_id

router = APIRouter(tags=["profile"])


@router.get("/", response_model=dict)
async def get_profile(user_id: str = Depends(require_user_id)):
    """GET /profile — load the authenticated user's health profile."""
    try:
        return db.get_profile(user_id)
    except Exception as exc:
        raise server_error("profile.get", exc, "Could not load profile.")


@router.put("/", response_model=dict)
async def upsert_profile(
    profile: HealthProfile,
    user_id: str = Depends(require_user_id),
):
    """PUT /profile — save / update the authenticated user's health profile."""
    try:
        return db.upsert_profile(user_id, profile.model_dump(exclude_none=True))
    except Exception as exc:
        raise server_error("profile.upsert", exc, "Could not save profile.")
