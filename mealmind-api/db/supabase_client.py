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


def replace_pantry(user_id: str, items: list[dict]) -> list[Any]:
    """Replace the user's entire pantry atomically: delete all then insert new set."""
    client = get_client()
    # Delete all existing items for this user
    client.table("pantry").delete().eq("user_id", user_id).execute()
    if not items:
        return []
    rows = [{"user_id": user_id, "name": item["name"]} for item in items]
    result = client.table("pantry").insert(rows).execute()
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


def update_recipe_labels(recipe_id: str, user_id: str, labels: list) -> dict:
    result = (
        get_client()
        .table("saved_recipes")
        .update({"labels": labels})
        .eq("id", recipe_id)
        .eq("user_id", user_id)
        .execute()
    )
    return result.data[0] if result.data else {}


# ---------------------------------------------------------------------------
# Shopping lists
# ---------------------------------------------------------------------------

def get_current_shopping_list(user_id: str) -> dict | None:
    result = (
        get_client()
        .table("shopping_lists")
        .select("items")
        .eq("user_id", user_id)
        .eq("name", "current")
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0].get("items")
    return None


def upsert_current_shopping_list(user_id: str, items: dict) -> None:
    client = get_client()
    existing = (
        client.table("shopping_lists")
        .select("id")
        .eq("user_id", user_id)
        .eq("name", "current")
        .limit(1)
        .execute()
    )
    if existing.data:
        client.table("shopping_lists").update({"items": items}).eq("id", existing.data[0]["id"]).execute()
    else:
        client.table("shopping_lists").insert({"user_id": user_id, "name": "current", "items": items, "recipe_ids": []}).execute()


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
# Meal suggestion history
# ---------------------------------------------------------------------------

def save_meal_history(user_id: str, date: str, meals: list) -> None:
    get_client().table("meal_history").insert({
        "user_id": user_id,
        "date": date,
        "meals": meals,
    }).execute()


def get_meal_history(user_id: str, limit: int = 50) -> list:
    result = (
        get_client()
        .table("meal_history")
        .select("date, meals, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


# ---------------------------------------------------------------------------
# Sharing (public, browsable links for meals & recipes)
# ---------------------------------------------------------------------------

def create_share(kind: str, payload: dict, user_id: str | None = None) -> str:
    row = {"kind": kind, "payload": payload}
    if user_id:
        row["user_id"] = user_id
    result = get_client().table("shared_items").insert(row).execute()
    return str(result.data[0]["id"]) if result.data else ""


def get_share(share_id: str) -> dict | None:
    result = (
        get_client()
        .table("shared_items")
        .select("kind, payload")
        .eq("id", share_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None
