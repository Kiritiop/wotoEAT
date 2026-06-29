from datetime import date as _date
import logging
from fastapi import APIRouter, HTTPException, Depends
from ai.claude import GroqTransientError
from db.models import (
    MealGenerateRequest, MealGenerateResponse, GeneratedPlan, SwapMealRequest,
)
from ai.claude import generate_meal_plan, swap_meal as ai_swap_meal
from db import supabase_client as db
from .auth import get_optional_user_id, require_user_id

logger = logging.getLogger(__name__)

router = APIRouter(tags=["meals"])

_HISTORY_LIMIT = 200


@router.post("/generate", response_model=MealGenerateResponse)
async def generate_meals(
    body: MealGenerateRequest,
    user_id: str | None = Depends(get_optional_user_id),
):
    try:
        filters = body.model_dump(exclude_none=True)
        if body.profile:
            filters["profile"] = body.profile.model_dump(exclude_none=True)
        result, cached = await generate_meal_plan(filters)
        plan = GeneratedPlan(**result)
        if user_id and not cached:
            try:
                db.save_meal_history(user_id, str(_date.today()), result.get("meals", []))
            except Exception as exc:
                logger.error("[meals] generate history write failed for user %s: %s", user_id, exc)
        return MealGenerateResponse(plan=plan, cached=cached)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except GroqTransientError:
        raise HTTPException(status_code=503, detail="AI service is temporarily at capacity. Please try again in a few minutes.")
    except Exception as exc:
        logger.exception("[meals] generate_meals unhandled error")
        raise HTTPException(status_code=500, detail=f"AI error: {exc}")


@router.post("/swap")
async def swap_meal(
    body: SwapMealRequest,
    user_id: str | None = Depends(get_optional_user_id),
):
    try:
        filters = body.model_dump(exclude_none=True)
        if body.profile:
            filters["profile"] = body.profile.model_dump(exclude_none=True)
        current_plan = body.current_plan.model_dump() if body.current_plan else None
        meal = await ai_swap_meal(body.slot, current_plan, filters)
        if user_id:
            try:
                db.save_meal_history(user_id, str(_date.today()), [meal])
            except Exception as exc:
                logger.error("[meals] swap history write failed for user %s: %s", user_id, exc)
        return meal
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except GroqTransientError:
        raise HTTPException(status_code=503, detail="AI service is temporarily at capacity. Please try again in a few minutes.")
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
