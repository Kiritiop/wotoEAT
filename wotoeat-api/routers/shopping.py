from fastapi import APIRouter, HTTPException, Depends, Request
from ai.claude import GroqTransientError
from db.models import GenerateShoppingListRequest, ShoppingList
from ai.claude import generate_shopping_list
from ai.sqlite_cache import rate_limit_check
from db import supabase_client as db
from utils.errors import server_error
from .auth import get_optional_user_id, require_user_id

router = APIRouter(tags=["shopping"])

# Unauthenticated AI endpoint — cap per identity (user_id, else IP). Shopping
# lists are generated occasionally, so a tighter cap than meal generation.
_SHOP_AI_MAX = 40
_SHOP_AI_WINDOW = 3600


@router.post("/generate", response_model=ShoppingList)
async def generate(
    req: GenerateShoppingListRequest,
    request: Request,
    user_id: str | None = Depends(get_optional_user_id),
):
    limit_key = user_id or (request.client.host if request.client else "anon")
    if not rate_limit_check(limit_key, "shopping-ai", _SHOP_AI_MAX, _SHOP_AI_WINDOW):
        raise HTTPException(status_code=429, detail="Too many shopping list requests. Please wait a bit and try again.")

    recipes_dicts = [r.model_dump() for r in req.recipes]

    try:
        result = await generate_shopping_list(recipes_dicts, req.pantry, req.language)
    except GroqTransientError:
        raise HTTPException(status_code=503, detail="AI service is temporarily at capacity. Please try again in a few minutes.")
    except Exception as exc:
        raise server_error("shopping.generate", exc, "Could not generate shopping list. Please try again.")

    shopping_list = ShoppingList(**result)

    if user_id:
        try:
            db.save_shopping_list(
                user_id=user_id,
                name="Shopping List",
                items=result,
                recipe_ids=[],
            )
        except Exception:
            pass

    return shopping_list


@router.get("/current", response_model=dict)
async def get_current(user_id: str = Depends(require_user_id)):
    """GET /shopping/current — returns the user's saved shopping list."""
    try:
        data = db.get_current_shopping_list(user_id)
        return data if data is not None else {"groups": []}
    except Exception as exc:
        raise server_error("shopping.get_current", exc, "Could not load shopping list.")


@router.put("/current", response_model=dict)
async def save_current(
    req: ShoppingList,
    user_id: str = Depends(require_user_id),
):
    """PUT /shopping/current — save/update the user's current shopping list."""
    try:
        db.upsert_current_shopping_list(user_id, req.model_dump())
        return req.model_dump()
    except Exception as exc:
        raise server_error("shopping.save_current", exc, "Could not save shopping list.")


@router.get("/history", response_model=list[dict])
async def history(user_id: str | None = Depends(get_optional_user_id)):
    """GET /shopping/history — returns the user's past shopping lists."""
    if not user_id:
        return []
    try:
        return db.get_shopping_lists(user_id)
    except Exception as exc:
        raise server_error("shopping.history", exc, "Could not load shopping lists.")
