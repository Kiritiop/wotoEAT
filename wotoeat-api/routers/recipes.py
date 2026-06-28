from fastapi import APIRouter, HTTPException, Depends, Request
from ai.claude import GroqTransientError
from db.models import ParseRecipeRequest, Recipe, SaveRecipeRequest, GenerateRecipeRequest, TranslateRequest, UpdateRecipeRequest, UpdateLabelsRequest
from ai.claude import parse_recipe, generate_recipe_by_name, translate_texts
from ai.sqlite_cache import rate_limit_check
from utils.scraper import fetch_page_html
from db import supabase_client as db
from .auth import require_user_id

router = APIRouter(tags=["recipes"])


_PARSE_MAX = 20
_GENERATE_MAX = 30
_PARSE_WINDOW = 3600


@router.post("/parse", response_model=Recipe)
async def parse(req: ParseRecipeRequest, request: Request):
    """
    POST /recipes/parse  { "url": "https://..." }
    Fetches the page HTML and asks Claude to extract a structured recipe.
    Rate-limited by IP to prevent API credit abuse.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not rate_limit_check(f"parse:{client_ip}", "recipe-parse", _PARSE_MAX, _PARSE_WINDOW):
        raise HTTPException(status_code=429, detail=f"Rate limit: max {_PARSE_MAX} recipe parses per hour.")
    try:
        html = await fetch_page_html(req.url)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not fetch URL: {exc}")

    try:
        recipe_dict = await parse_recipe(html, req.language)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI parsing error: {exc}")

    recipe_dict.setdefault("source_url", req.url)
    return Recipe(**recipe_dict)


@router.post("/generate", response_model=Recipe)
async def generate(
    req: GenerateRecipeRequest,
    request: Request,
    user_id: str = Depends(require_user_id),
):
    """
    POST /recipes/generate  { "dish_name": "Kung Pao Chicken", "language": "en" }
    Asks the AI to generate a full recipe for any named dish.
    """
    if not rate_limit_check(f"gen:{user_id}", "recipe-generate", _GENERATE_MAX, _PARSE_WINDOW):
        raise HTTPException(status_code=429, detail=f"Rate limit: max {_GENERATE_MAX} recipe generations per hour.")
    try:
        recipe_dict = await generate_recipe_by_name(req.dish_name, req.language, req.servings, req.force_refresh)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except GroqTransientError:
        raise HTTPException(status_code=503, detail="AI service is temporarily at capacity. Please try again in a few minutes.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI generation error: {exc}")
    return Recipe(**recipe_dict)


@router.post("/translate", response_model=dict)
async def translate(req: TranslateRequest):
    """
    POST /recipes/translate  { "texts": ["Ingredients", "Steps"], "target": "zh" }
    Translates a batch of strings using the AI — used by the app for dynamic content.
    """
    if req.target != "zh" or not req.texts:
        return {"translations": req.texts}
    try:
        translated = await translate_texts(req.texts)
        return {"translations": translated}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Translation error: {exc}")


@router.post("/save", response_model=dict)
async def save(
    req: SaveRecipeRequest,
    user_id: str = Depends(require_user_id),
):
    """
    POST /recipes/save  { "recipe": { ... } }
    Saves a parsed recipe to the user's Supabase account.
    Requires authentication.
    """
    try:
        saved = db.save_recipe(user_id, req.recipe.model_dump())
        return saved
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")


@router.get("/saved", response_model=list[dict])
async def list_saved(user_id: str = Depends(require_user_id)):
    """GET /recipes/saved — returns all recipes saved by the user."""
    try:
        return db.get_saved_recipes(user_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{recipe_id}", response_model=dict)
async def get_one(
    recipe_id: str,
    user_id: str = Depends(require_user_id),
):
    """GET /recipes/{id} — returns a single saved recipe."""
    recipe = db.get_recipe_by_id(recipe_id, user_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


@router.put("/{recipe_id}", response_model=dict)
async def update(
    recipe_id: str,
    req: UpdateRecipeRequest,
    user_id: str = Depends(require_user_id),
):
    """PUT /recipes/{id} — updates an existing saved recipe."""
    try:
        updated = db.update_recipe(recipe_id, user_id, req.recipe.model_dump(exclude_none=True))
        if not updated:
            raise HTTPException(status_code=404, detail="Recipe not found")
        return updated
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")


@router.patch("/{recipe_id}/labels", response_model=dict)
async def update_labels(
    recipe_id: str,
    req: UpdateLabelsRequest,
    user_id: str = Depends(require_user_id),
):
    """PATCH /recipes/{id}/labels — update the label tags (favorite, mine, etc.) for a saved recipe."""
    try:
        updated = db.update_recipe_labels(recipe_id, user_id, req.labels)
        if not updated:
            raise HTTPException(status_code=404, detail="Recipe not found")
        return updated
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")


@router.delete("/{recipe_id}")
async def delete(
    recipe_id: str,
    user_id: str = Depends(require_user_id),
):
    """DELETE /recipes/{id} — removes a saved recipe."""
    try:
        db.delete_recipe(recipe_id, user_id)
        return {"deleted": recipe_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
