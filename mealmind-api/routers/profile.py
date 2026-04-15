from fastapi import APIRouter, HTTPException, Depends
from db.models import HealthProfile
from db import supabase_client as db
from .auth import require_user_id

router = APIRouter(tags=["profile"])


@router.get("/", response_model=dict)
async def get_profile(user_id: str = Depends(require_user_id)):
    """GET /profile — load the authenticated user's health profile."""
    try:
        return db.get_profile(user_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/", response_model=dict)
async def upsert_profile(
    profile: HealthProfile,
    user_id: str = Depends(require_user_id),
):
    """PUT /profile — save / update the authenticated user's health profile."""
    try:
        return db.upsert_profile(user_id, profile.model_dump(exclude_none=True))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
