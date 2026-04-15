from fastapi import APIRouter, HTTPException, Depends
from db.models import UpsertPantryRequest
from db import supabase_client as db
from .auth import require_user_id

router = APIRouter(tags=["pantry"])


@router.get("/", response_model=list[dict])
async def get_pantry(user_id: str = Depends(require_user_id)):
    """GET /pantry — returns all pantry items for the authenticated user."""
    try:
        return db.get_pantry(user_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/", response_model=list[dict])
async def upsert_pantry(
    req: UpsertPantryRequest,
    user_id: str = Depends(require_user_id),
):
    """
    POST /pantry
    Body: { "items": [{ "name": "...", "amount": 1, "unit": "kg" }] }
    Upserts (insert or update) pantry items. Matches on user_id + name.
    """
    try:
        items = [item.model_dump() for item in req.items]
        return db.upsert_pantry_items(user_id, items)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/{item_name}")
async def delete_pantry_item(
    item_name: str,
    user_id: str = Depends(require_user_id),
):
    """DELETE /pantry/{item_name} — removes one pantry item by name."""
    try:
        db.delete_pantry_item(user_id, item_name)
        return {"deleted": item_name}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
