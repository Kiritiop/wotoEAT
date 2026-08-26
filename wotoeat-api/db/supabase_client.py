"""
Supabase client + CRUD helpers for all wotoEAT tables.

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
    rows = [
        {"user_id": user_id, "name": item["name"], "category": item.get("category")}
        for item in items
    ]
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

# The "current" row has no UNIQUE(user_id, name) constraint, so two debounced
# saves racing can leave duplicate rows. Both the reader and the updater order
# by created_at (oldest first) so they always agree on the same canonical row —
# without ordering, unordered limit(1) could flip between duplicates and the
# list would appear to randomly revert.

def get_current_shopping_list(user_id: str) -> dict | None:
    result = (
        get_client()
        .table("shopping_lists")
        .select("items")
        .eq("user_id", user_id)
        .eq("name", "current")
        .order("created_at", desc=False)
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
        .order("created_at", desc=False)
        .limit(1)
        .execute()
    )
    if existing.data:
        client.table("shopping_lists").update({"items": items}).eq("id", existing.data[0]["id"]).execute()
    else:
        try:
            client.table("shopping_lists").insert({"user_id": user_id, "name": "current", "items": items, "recipe_ids": []}).execute()
        except Exception:
            # Lost an insert race under the partial unique index — the row now
            # exists, so apply this save as an update instead of surfacing a 500.
            client.table("shopping_lists").update({"items": items}).eq("user_id", user_id).eq("name", "current").execute()


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


# ---------------------------------------------------------------------------
# Generated dish images
# ---------------------------------------------------------------------------

# Public bucket for header photos we generated because no stock library had the
# dish. Public because the app renders them by URL like any other hero image.
_DISH_IMAGE_BUCKET = os.getenv("DISH_IMAGE_BUCKET", "dish-images")
_bucket_ready = False


def _ensure_dish_bucket(client: Client) -> None:
    """Create the bucket once per process if it is missing.

    Deploying should not require a manual console step, and 'already exists' is
    the normal answer, so any error here is swallowed: the upload that follows
    is what actually reports failure.
    """
    global _bucket_ready
    if _bucket_ready:
        return
    try:
        client.storage.create_bucket(_DISH_IMAGE_BUCKET, options={"public": True})
    except Exception:
        pass
    _bucket_ready = True


def upload_dish_image(name: str, data: bytes, content_type: str = "image/jpeg") -> str | None:
    """Store a generated dish image and return its public URL, or None.

    Generated images are worth keeping: they cost a model call each, and the
    same dish recurs across users. Storage outlives the TTL cache, which lives
    in /tmp and is wiped by every deploy.
    """
    try:
        client = get_client()
        _ensure_dish_bucket(client)
        bucket = client.storage.from_(_DISH_IMAGE_BUCKET)
        bucket.upload(
            path=name,
            file=data,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        return bucket.get_public_url(name)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "[storage] could not store generated image %r: %s", name, exc
        )
        return None
