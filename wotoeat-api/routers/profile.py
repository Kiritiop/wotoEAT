from fastapi import APIRouter, Depends, HTTPException
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


@router.delete("/data", response_model=dict)
async def delete_my_data(user_id: str = Depends(require_user_id)):
    """DELETE /profile/data — erase everything this user stored.

    Health profile, pantry, saved recipes, meal history and shopping lists go;
    shares are anonymised, not deleted, because someone may hold the public
    link. The Supabase auth account itself is NOT touched: deleting it needs
    the admin API and would sign the user out mid-request, so account closure
    stays a support request (see the Privacy document).

    Allergies, dietary restrictions and body measurements are GDPR Article 9
    special-category data, so this endpoint is the app's erasure path and a
    partial failure must be visible rather than swallowed.
    """
    try:
        results = db.delete_user_data(user_id)
    except Exception as exc:
        raise server_error("profile.delete_data", exc, "Could not delete your data.")
    if any(v == "failed" for v in results.values()):
        raise HTTPException(
            status_code=500,
            detail="Some of your data could not be deleted. Please contact support.",
        )
    return {"deleted": True, "tables": results}


@router.delete("/account", response_model=dict)
async def delete_my_account(user_id: str = Depends(require_user_id)):
    """DELETE /profile/account — erase the data, then delete the account.

    Apple 5.1.1(v) and Google Play both require an in-app account deletion
    path; data-only deletion does not satisfy either. Play additionally wants a
    web link for people who already uninstalled, which is /legal/delete-account.

    Data goes first on purpose: once the auth user is gone the id is no longer
    resolvable, so a failure midway would strand orphan rows no one can reach.
    """
    try:
        results = db.delete_user_data(user_id)
    except Exception as exc:
        raise server_error("profile.delete_account", exc, "Could not delete your account.")
    if any(v == "failed" for v in results.values()):
        raise HTTPException(
            status_code=500,
            detail="Some of your data could not be deleted, so the account was kept. Please contact support.",
        )
    try:
        db.delete_auth_user(user_id)
    except Exception as exc:
        raise server_error(
            "profile.delete_account.auth", exc,
            "Your data was deleted but the account could not be removed. Please contact support.",
        )
    return {"deleted": True}
