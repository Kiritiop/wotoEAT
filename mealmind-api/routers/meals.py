from datetime import date as _date
import logging
from fastapi import APIRouter, HTTPException, Depends, Request

logger = logging.getLogger(__name__)
from db.models import (
    MealFilter, MealSuggestResponse, MealSuggestion,
    DailyPlanRequest, DailyPlanResponse, DailyMealPlan,
    DailyPlanMeal, MealComponent, ShoppingReminder, SwapMealRequest,
)
from ai.claude import suggest_meals, generate_daily_plan, swap_single_meal
from ai.sqlite_cache import rate_limit_check
from db import supabase_client as db
from .auth import get_optional_user_id, require_user_id

router = APIRouter(tags=["meals"])

# Per-user limits for AI plan generation (max 10 per hour)
_PLAN_MAX = int(__import__("os").getenv("PLAN_RATE_LIMIT", "10"))
_PLAN_WINDOW = 3600


@router.post("/suggest", response_model=MealSuggestResponse)
async def suggest(filters: MealFilter):
    try:
        meals_raw, cached = await suggest_meals(filters.model_dump(exclude_none=True))
        meals = [MealSuggestion(**m) for m in meals_raw]
        return MealSuggestResponse(meals=meals, cached=cached)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI error: {exc}")


@router.post("/daily-plan", response_model=DailyPlanResponse)
async def daily_plan(
    req: DailyPlanRequest,
    request: Request,
    user_id: str = Depends(get_optional_user_id),
):
    rate_key = user_id or f"ip:{(request.client.host if request.client else 'unknown')}"
    if not rate_limit_check(rate_key, "daily-plan", _PLAN_MAX, _PLAN_WINDOW):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit: max {_PLAN_MAX} plan generations per hour.",
        )

    try:
        plan_raw, cached = await generate_daily_plan(
            profile=req.profile.model_dump(exclude_none=True),
            pantry=req.pantry,
            cuisine_preference=req.cuisine_preference,
            max_prep_time_mins=req.max_prep_time_mins,
            language=req.language,
            recent_ratings=req.recent_ratings,
            servings=req.servings,
            slots=req.slots,
            flavour_preference=req.flavour_preference,
            ingredient_keyword=req.ingredient_keyword,
            meal_style=req.meal_style,
        )
        meals = [
            DailyPlanMeal(
                slot=m.get("slot", "breakfast"),
                name=m.get("name", ""),
                cuisine=m.get("cuisine", ""),
                description=m.get("description", ""),
                prep_time_mins=m.get("prep_time_mins", 0),
                calories_per_serving=m.get("calories_per_serving", 0),
                difficulty=m.get("difficulty", "medium"),
                components=MealComponent(**m.get("components", {"vegetable": "", "protein": "", "staple": ""})),
                uses_pantry_items=m.get("uses_pantry_items", []),
                tags=m.get("tags", []),
                ingredients=m.get("ingredients", []),
                steps=m.get("steps", []),
                protein_g=m.get("protein_g"),
                carbs_g=m.get("carbs_g"),
                fat_g=m.get("fat_g"),
                fiber_g=m.get("fiber_g"),
            )
            for m in plan_raw.get("meals", [])
        ]
        reminders = [
            ShoppingReminder(item=r.get("item", ""), reason=r.get("reason", ""))
            for r in plan_raw.get("shopping_reminders", [])
        ]
        plan = DailyMealPlan(
            meals=meals,
            shopping_reminders=reminders,
            total_calories=plan_raw.get("total_calories", 0),
            nutrition_note=plan_raw.get("nutrition_note", ""),
        )

        # Persist to history for authenticated users (non-cached plans only)
        if user_id and not cached:
            try:
                db.save_daily_plan(
                    user_id,
                    str(_date.today()),
                    plan_raw,
                    plan.total_calories,
                )
            except Exception as exc:
                logger.error("[meals] history write failed for user %s: %s", user_id, exc)

        return DailyPlanResponse(plan=plan, cached=cached)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI error: {exc}")


@router.post("/swap", response_model=dict)
async def swap_meal(
    req: SwapMealRequest,
    user_id: str = Depends(get_optional_user_id),
):
    """POST /meals/swap — replace a single meal slot with an AI-generated alternative."""
    if user_id and not rate_limit_check(user_id, "swap-meal", _PLAN_MAX * 3, _PLAN_WINDOW):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit: max {_PLAN_MAX * 3} meal swaps per hour.",
        )
    try:
        plan_dict = req.current_plan.model_dump()
        meal_raw = await swap_single_meal(
            slot=req.slot,
            current_plan=plan_dict,
            profile=req.profile.model_dump(exclude_none=True),
            pantry=req.pantry,
            language=req.language,
        )
        meal = DailyPlanMeal(
            slot=meal_raw.get("slot", req.slot),
            name=meal_raw.get("name", ""),
            cuisine=meal_raw.get("cuisine", ""),
            description=meal_raw.get("description", ""),
            prep_time_mins=meal_raw.get("prep_time_mins", 0),
            calories_per_serving=meal_raw.get("calories_per_serving", 0),
            difficulty=meal_raw.get("difficulty", "medium"),
            components=MealComponent(**meal_raw.get("components", {"vegetable": "", "protein": "", "staple": ""})),
            uses_pantry_items=meal_raw.get("uses_pantry_items", []),
            tags=meal_raw.get("tags", []),
            ingredients=meal_raw.get("ingredients", []),
            steps=meal_raw.get("steps", []),
            protein_g=meal_raw.get("protein_g"),
            carbs_g=meal_raw.get("carbs_g"),
            fat_g=meal_raw.get("fat_g"),
            fiber_g=meal_raw.get("fiber_g"),
        )
        return meal.model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI error: {exc}")


@router.get("/history", response_model=list[dict])
async def plan_history(
    limit: int = 7,
    user_id: str = Depends(require_user_id),
):
    """GET /meals/history — returns the last N daily plans for this user."""
    try:
        return db.get_plan_history(user_id, limit=min(limit, 30))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
