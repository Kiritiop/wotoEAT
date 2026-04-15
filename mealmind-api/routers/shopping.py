from fastapi import APIRouter, HTTPException, Depends
from db.models import GenerateShoppingListRequest, ShoppingList, PlanShoppingRequest
from ai.claude import generate_shopping_list, generate_plan_shopping_list
from db import supabase_client as db
from .auth import get_optional_user_id

router = APIRouter(tags=["shopping"])


@router.post("/generate", response_model=ShoppingList)
async def generate(
    req: GenerateShoppingListRequest,
    user_id: str | None = Depends(get_optional_user_id),
):
    """
    POST /shopping/generate
    Body: { recipes: [...], pantry: [...] }
    Returns a grouped shopping list with pantry items subtracted.
    Optionally saves the list to Supabase when user is authenticated.
    """
    recipes_dicts = [r.model_dump() for r in req.recipes]
    pantry_dicts = [p.model_dump() for p in req.pantry]

    try:
        result = await generate_shopping_list(recipes_dicts, pantry_dicts, req.language)
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
            pass  # Don't fail the request if save fails

    return shopping_list


@router.post("/from-plan", response_model=ShoppingList)
async def from_plan(
    req: PlanShoppingRequest,
    user_id: str | None = Depends(get_optional_user_id),
):
    """
    POST /shopping/from-plan
    Body: { plan: DailyMealPlan, pantry: [...], language: "en"|"zh" }
    Generates a shopping list directly from a daily meal plan.
    """
    plan_dict = req.plan.model_dump()
    pantry_dicts = req.pantry

    try:
        result = await generate_plan_shopping_list(plan_dict, pantry_dicts, req.language)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI error: {exc}")

    return ShoppingList(**result)


@router.get("/history", response_model=list[dict])
async def history(user_id: str | None = Depends(get_optional_user_id)):
    """GET /shopping/history — returns the user's past shopping lists."""
    if not user_id:
        return []
    try:
        return db.get_shopping_lists(user_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
