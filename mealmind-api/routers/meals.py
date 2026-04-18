from datetime import date as _date
from fastapi import APIRouter, HTTPException, Depends
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
    user_id: str = Depends(get_optional_user_id),
):
    # Rate limit authenticated users; allow unauthenticated dev calls
    if user_id and not rate_limit_check(user_id, "daily-plan", _PLAN_MAX, _PLAN_WINDOW):
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
        )
        meals = [
            DailyPlanMeal(
                slot=m["slot"],
                name=m["name"],
                cuisine=m["cuisine"],
                description=m["description"],
                prep_time_mins=m["prep_time_mins"],
                calories_per_serving=m["calories_per_serving"],
                difficulty=m["difficulty"],
                components=MealComponent(**m["components"]),
                uses_pantry_items=m.get("uses_pantry_items", []),
                tags=m.get("tags", []),
                ingredients=m.get("ingredients", []),
                steps=m.get("steps", []),
                protein_g=m.get("protein_g"),
                carbs_g=m.get("carbs_g"),
                fat_g=m.get("fat_g"),
                fiber_g=m.get("fiber_g"),
            )
            for m in plan_raw["meals"]
        ]
        reminders = [
            ShoppingReminder(item=r["item"], reason=r["reason"])
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
            except Exception:
                pass  # Never block the response due to a history write failure

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
            slot=meal_raw["slot"],
            name=meal_raw["name"],
            cuisine=meal_raw["cuisine"],
            description=meal_raw["description"],
            prep_time_mins=meal_raw["prep_time_mins"],
            calories_per_serving=meal_raw["calories_per_serving"],
            difficulty=meal_raw["difficulty"],
            components=MealComponent(**meal_raw["components"]),
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
