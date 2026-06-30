import base64

from fastapi import APIRouter, HTTPException, Depends
from db.models import UpsertPantryRequest, ScanReceiptRequest, ScanReceiptResponse
from db import supabase_client as db
from ai.claude import scan_receipt, GroqTransientError
from ai.sqlite_cache import rate_limit_check
from utils.errors import server_error
from .auth import require_user_id

router = APIRouter(tags=["pantry"])

_SCAN_MAX = 10
_SCAN_WINDOW = 3600
_MAX_IMAGE_B64_CHARS = 5_600_000  # ~4.2MB decoded — Groq's base64 image limit is 4MB
_MAX_IMAGE_BYTES = 4_000_000
_IMAGE_TOO_LARGE = (
    "Image is too large (max 4MB) — retake the photo from a bit further away "
    "or choose a smaller image."
)


@router.get("/", response_model=list[dict])
async def get_pantry(user_id: str = Depends(require_user_id)):
    """GET /pantry — returns all pantry items for the authenticated user."""
    try:
        return db.get_pantry(user_id)
    except Exception as exc:
        raise server_error("pantry.get", exc, "Could not load pantry.")


@router.post("/", response_model=list[dict])
async def upsert_pantry(
    req: UpsertPantryRequest,
    user_id: str = Depends(require_user_id),
):
    """
    POST /pantry — replaces the user's entire pantry with the submitted list.
    Body: { "items": [{ "name": "chicken" }, ...] }
    """
    try:
        items = [item.model_dump() for item in req.items]
        return db.replace_pantry(user_id, items)
    except Exception as exc:
        raise server_error("pantry.upsert", exc, "Could not save pantry.")



@router.delete("/{item_name}")
async def delete_pantry_item(
    item_name: str,
    user_id: str = Depends(require_user_id),
):
    """DELETE /pantry/{item_name} — removes one pantry item by name."""
    try:
        db.delete_pantry_item(user_id, item_name)
        return {"deleted": item_name}
    except Exception as exc:
        raise server_error("pantry.delete", exc, "Could not delete pantry item.")


@router.post("/scan-receipt", response_model=ScanReceiptResponse)
async def scan(
    req: ScanReceiptRequest,
    user_id: str = Depends(require_user_id),
):
    """
    POST /pantry/scan-receipt — extract food items from a photographed grocery receipt.
    Body: { "image_base64": "<jpeg base64>", "language": "en" }
    Annotate-only: nothing is written; the client merges via POST /pantry/.
    """
    if not rate_limit_check(f"scan:{user_id}", "receipt-scan", _SCAN_MAX, _SCAN_WINDOW):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit: max {_SCAN_MAX} receipt scans per hour.",
        )

    image_b64 = req.image_base64.strip()
    if image_b64.startswith("data:"):
        # Defense-in-depth: the app strips data-URL prefixes too.
        image_b64 = image_b64.split(",", 1)[-1]
    if not image_b64 or len(image_b64) > _MAX_IMAGE_B64_CHARS:
        raise HTTPException(status_code=422, detail=_IMAGE_TOO_LARGE)
    try:
        raw = base64.b64decode(image_b64, validate=True)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid image data.")
    if len(raw) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=422, detail=_IMAGE_TOO_LARGE)

    pantry_names = [row["name"] for row in db.get_pantry(user_id)]

    try:
        result = await scan_receipt(image_b64, pantry_names, req.language)
    except ValueError as exc:
        # "no_receipt" | "no_food_items" | "unreadable_receipt" — client localizes
        raise HTTPException(status_code=422, detail=str(exc))
    except GroqTransientError:
        raise HTTPException(
            status_code=503,
            detail="AI service is temporarily at capacity. Please try again in a few minutes.",
        )
    except Exception as exc:
        raise server_error("pantry.scan", exc, "Could not scan receipt. Please try again.")
    return ScanReceiptResponse(**result)
