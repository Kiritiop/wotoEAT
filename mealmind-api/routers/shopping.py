from fastapi import APIRouter, HTTPException, Depends
from db.models import GenerateShoppingListRequest, ShoppingList
from ai.claude import generate_shopping_list
from db import supabase_client as db
from .auth import get_optional_user_id

router = APIRouter(tags=["shopping"])


@router.post("/generate", response_model=ShoppingList)
async def generate(
    req: GenerateShoppingListRequest,
    user_id: str | None = Depends(get_optional_user_id),
):
    recipes_dicts = [r.model_dump() for r in req.recipes]

    try:
        result = await generate_shopping_list(recipes_dicts, req.pantry, req.language)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI error: {exc}")

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


@router.get("/history", response_model=list[dict])
async def history(user_id: str | None = Depends(get_optional_user_id)):
    """GET /shopping/history — returns the user's past shopping lists."""
    if not user_id:
        return []
    try:
        return db.get_shopping_lists(user_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
