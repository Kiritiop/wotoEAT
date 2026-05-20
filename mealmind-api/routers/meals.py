from datetime import date as _date
import logging
from fastapi import APIRouter, HTTPException, Depends
from db.models import MealFilter, MealSuggestResponse, MealSuggestion
from ai.claude import suggest_meals
from db import supabase_client as db
from .auth import get_optional_user_id, require_user_id

logger = logging.getLogger(__name__)

router = APIRouter(tags=["meals"])

_HISTORY_LIMIT = 200


@router.post("/suggest", response_model=MealSuggestResponse)
async def suggest(
    filters: MealFilter,
    user_id: str | None = Depends(get_optional_user_id),
):
    try:
        meals_raw, cached = await suggest_meals(filters.model_dump(exclude_none=True))
        meals = [MealSuggestion(**m) for m in meals_raw]
        if user_id and not cached:
            try:
                db.save_meal_history(user_id, str(_date.today()), meals_raw)
            except Exception as exc:
                logger.error("[meals] history write failed for user %s: %s", user_id, exc)
        return MealSuggestResponse(meals=meals, cached=cached)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI error: {exc}")


@router.get("/history", response_model=list[dict])
async def meal_history(
    limit: int = 50,
    user_id: str = Depends(require_user_id),
):
    """GET /meals/history — all suggestion batches for this user, newest first."""
    try:
        return db.get_meal_history(user_id, limit=min(limit, _HISTORY_LIMIT))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
