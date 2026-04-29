"""
Supabase client + CRUD helpers for all MealMind tables.

The backend uses the service_role key so it can bypass Row Level Security
and filter by user_id in Python instead. This keeps the auth logic in one
place and lets us develop without configuring RLS policies upfront.
"""
import os
from typing import Any, Optional
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

_client: Optional[Client] = None


def get_client() -> Client:
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_KEY must be set in your .env file"
            )
        _client = create_client(url, key)
    return _client


# ---------------------------------------------------------------------------
# Pantry
# ---------------------------------------------------------------------------

def get_pantry(user_id: str) -> list[Any]:
    result = (
        get_client()
        .table("pantry")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    return result.data or []


def upsert_pantry_items(user_id: str, items: list[dict]) -> list[Any]:
    rows = [{"user_id": user_id, "name": item["name"]} for item in items]
    result = (
        get_client()
        .table("pantry")
        .upsert(rows, on_conflict="user_id,name")
        .execute()
    )
    return result.data or []


def delete_pantry_item(user_id: str, item_name: str) -> None:
    (
        get_client()
        .table("pantry")
        .delete()
        .eq("user_id", user_id)
        .eq("name", item_name)
        .execute()
    )


# ---------------------------------------------------------------------------
# Saved recipes
# ---------------------------------------------------------------------------

def save_recipe(user_id: str, recipe: dict) -> Any:
    row = {"user_id": user_id, **recipe}
    result = get_client().table("saved_recipes").insert(row).execute()
    return result.data[0] if result.data else {}


def get_saved_recipes(user_id: str) -> list[Any]:
    result = (
        get_client()
        .table("saved_recipes")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def get_recipe_by_id(recipe_id: str, user_id: str) -> Any:
    result = (
        get_client()
        .table("saved_recipes")
        .select("*")
        .eq("id", recipe_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def update_recipe(recipe_id: str, user_id: str, recipe: dict) -> Any:
    result = (
        get_client()
        .table("saved_recipes")
        .update(recipe)
        .eq("id", recipe_id)
        .eq("user_id", user_id)
        .execute()
    )
    return result.data[0] if result.data else {}


def delete_recipe(recipe_id: str, user_id: str) -> None:
    (
        get_client()
        .table("saved_recipes")
        .delete()
        .eq("id", recipe_id)
        .eq("user_id", user_id)
        .execute()
    )


# ---------------------------------------------------------------------------
# Shopping lists
# ---------------------------------------------------------------------------

def save_shopping_list(user_id: str, name: str, items: dict, recipe_ids: list[str]) -> Any:
    row = {
        "user_id": user_id,
        "name": name,
        "items": items,
        "recipe_ids": recipe_ids,
    }
    result = get_client().table("shopping_lists").insert(row).execute()
    return result.data[0] if result.data else {}


def get_shopping_lists(user_id: str) -> list[Any]:
    result = (
        get_client()
        .table("shopping_lists")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


# ---------------------------------------------------------------------------
# User preferences
# ---------------------------------------------------------------------------

def get_preferences(user_id: str) -> Any:
    result = (
        get_client()
        .table("user_preferences")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else {}


def upsert_preferences(user_id: str, prefs: dict) -> Any:
    row = {"user_id": user_id, **prefs}
    result = (
        get_client()
        .table("user_preferences")
        .upsert(row, on_conflict="user_id")
        .execute()
    )
    return result.data[0] if result.data else {}


# ---------------------------------------------------------------------------
# Health profile
# ---------------------------------------------------------------------------

def get_profile(user_id: str) -> dict:
    result = (
        get_client()
        .table("user_profiles")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if result.data:
        row = dict(result.data[0])
        row.pop("user_id", None)
        row.pop("id", None)
        row.pop("created_at", None)
        row.pop("updated_at", None)
        return row
    return {}


def upsert_profile(user_id: str, profile: dict) -> dict:
    row = {"user_id": user_id, **profile}
    result = (
        get_client()
        .table("user_profiles")
        .upsert(row, on_conflict="user_id")
        .execute()
    )
    if result.data:
        row = dict(result.data[0])
        row.pop("user_id", None)
        row.pop("id", None)
        row.pop("created_at", None)
        row.pop("updated_at", None)
        return row
    return {}


# ---------------------------------------------------------------------------
# Meal plan history
# ---------------------------------------------------------------------------

def save_daily_plan(user_id: str, date: str, plan: dict, total_calories: int) -> dict:
    row = {
        "user_id": user_id,
        "date": date,
        "plan": plan,
        "total_calories": total_calories,
    }
    result = (
        get_client()
        .table("daily_plans")
        .upsert(row, on_conflict="user_id,date")
        .execute()
    )
    return result.data[0] if result.data else {}


def get_plan_history(user_id: str, limit: int = 7) -> list:
    result = (
        get_client()
        .table("daily_plans")
        .select("date, plan, total_calories")
        .eq("user_id", user_id)
        .order("date", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []
