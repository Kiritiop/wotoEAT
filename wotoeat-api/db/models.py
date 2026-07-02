from pydantic import BaseModel, Field, field_validator
from typing import Optional, Union


# ---------------------------------------------------------------------------
# Shared primitives
# ---------------------------------------------------------------------------

class Ingredient(BaseModel):
    name: str
    amount: Union[float, None] = None
    unit: str
    calories: Optional[float] = None
    tip: Optional[str] = None

    @field_validator("amount", mode="before")
    @classmethod
    def coerce_amount(cls, v: Union[str, float, int, None]) -> Optional[float]:
        if v is None:
            return None
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
            try:
                if "/" in v:
                    num, den = v.split("/", 1)
                    result = float(num) / float(den)
                    return result if result > 0 else None
                result = float(v)
                return result if result > 0 else None
            except (ValueError, ZeroDivisionError):
                return None
        result = float(v)
        return result if result > 0 else None


# ---------------------------------------------------------------------------
# Health profile
# ---------------------------------------------------------------------------

class HealthProfile(BaseModel):
    age: Optional[int] = None
    sex: Optional[str] = None               # "male" | "female" | "other"
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    activity_level: Optional[str] = None   # "sedentary" | "light" | "moderate" | "active" | "very_active"
    health_goals: list[str] = Field(default_factory=list)  # ["lose weight", "build muscle", ...]
    dietary_restrictions: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    calorie_goal: Optional[int] = None     # daily calorie target
    protein_goal_g: Optional[int] = None   # daily protein target in grams
    use_imperial: Optional[bool] = None    # display weight in lbs, height in inches
    cuisine_preferences: Optional[list[str]] = None
    flavour_preference: Optional[str] = None
    preferred_max_prep_mins: Optional[int] = None


# ---------------------------------------------------------------------------
# Recipes
# ---------------------------------------------------------------------------

class Recipe(BaseModel):
    title: str
    intro: Optional[str] = None
    servings: int
    prep_time_mins: int
    calories_per_serving: Optional[int] = None
    ingredients: list[Ingredient]
    steps: list[str]
    chef_tips: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    source_url: Optional[str] = None
    source_name: Optional[str] = None


class UpdateRecipeRequest(BaseModel):
    recipe: Recipe


class UpdateLabelsRequest(BaseModel):
    labels: list[str] = Field(default_factory=list)


class ParseRecipeRequest(BaseModel):
    url: str = Field(max_length=2000)
    language: str = "en"


class SaveRecipeRequest(BaseModel):
    recipe: Recipe


class GenerateRecipeRequest(BaseModel):
    dish_name: str = Field(max_length=200)
    language: str = "en"
    servings: int = 1
    force_refresh: bool = False


# ---------------------------------------------------------------------------
# Pantry
# ---------------------------------------------------------------------------

class PantryItem(BaseModel):
    name: str
    category: Optional[str] = None  # display category override; null → derived from name


class PantryItemDB(PantryItem):
    id: Optional[str] = None
    user_id: Optional[str] = None


class UpsertPantryRequest(BaseModel):
    items: list[PantryItem]


class ScanReceiptRequest(BaseModel):
    image_base64: str
    language: str = "en"


class ScannedItem(BaseModel):
    name: str  # canonical English (same convention as tags); what gets stored
    name_zh: Optional[str] = None  # Simplified Chinese display name; display-only
    raw_text: str = ""
    is_food: bool = True
    quantity: Optional[str] = None  # display-only, never persisted (pantry is name-only)
    matches_pantry: Optional[str] = None  # existing pantry item this duplicates, verbatim

    @field_validator("quantity", "matches_pantry", "name_zh", mode="before")
    @classmethod
    def empty_to_none(cls, v):
        if isinstance(v, str) and v.strip().lower() in ("", "null", "none"):
            return None
        return v


class ScanReceiptResponse(BaseModel):
    items: list[ScannedItem]


# ---------------------------------------------------------------------------
# Shopping list
# ---------------------------------------------------------------------------

class ShoppingListItem(BaseModel):
    name: str
    checked: bool = False


class ShoppingGroup(BaseModel):
    category: str
    items: list[ShoppingListItem]


class ShoppingList(BaseModel):
    groups: list[ShoppingGroup]
    total_calories: Optional[int] = None


class GenerateShoppingListRequest(BaseModel):
    # Caps bound the AI prompt size; a real day is a handful of confirmed meals.
    recipes: list[Recipe] = Field(max_length=20)
    pantry: list[str] = Field(default_factory=list, max_length=500)
    language: str = "en"


# ---------------------------------------------------------------------------
# Meal generation (generateMeals endpoint)
# ---------------------------------------------------------------------------

class MealComponent(BaseModel):
    vegetable: str = ""
    protein: str = ""
    staple: str = ""


class GeneratedMeal(BaseModel):
    slot: str
    name: str
    cuisine: str
    intro: Optional[str] = None
    description: str
    prep_time_mins: int
    calories_per_serving: int
    difficulty: str
    components: MealComponent = Field(default_factory=MealComponent)
    uses_pantry_items: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    ingredients: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    chef_tips: list[str] = Field(default_factory=list)
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    fiber_g: Optional[float] = None


class ShoppingReminder(BaseModel):
    item: str
    reason: str


class GeneratedPlan(BaseModel):
    meals: list[GeneratedMeal]
    shopping_reminders: list[ShoppingReminder] = Field(default_factory=list)
    total_calories: int
    nutrition_note: str


class MealGenerateResponse(BaseModel):
    plan: GeneratedPlan
    cached: bool = False


class MealGenerateRequest(BaseModel):
    # List caps are anti-abuse bounds (this endpoint builds an AI prompt from
    # them); real clients stay far below — a big pantry is ~100 items and
    # avoid_meals is one day's stream.
    profile: Optional[HealthProfile] = None
    pantry: list[str] = Field(default_factory=list, max_length=500)
    cuisine_preference: Optional[str] = None
    max_prep_time_mins: Optional[int] = None
    language: str = "en"
    recent_ratings: Optional[dict] = None
    servings: int = 1
    slots: list[str] = Field(default_factory=lambda: ["breakfast", "lunch", "dinner"], max_length=3)
    flavour_preference: Optional[str] = None
    required_ingredients: Optional[str] = Field(default=None, max_length=2000)
    meal_style: str = "full"
    # Names of meals already shown today — never re-suggest these.
    avoid_meals: list[str] = Field(default_factory=list, max_length=300)


class SwapMealRequest(BaseModel):
    slot: str
    current_plan: Optional[GeneratedPlan] = None
    profile: Optional[HealthProfile] = None
    pantry: list[str] = Field(default_factory=list, max_length=500)
    language: str = "en"
    cuisine_preference: Optional[str] = None
    flavour_preference: Optional[str] = None
    max_prep_time_mins: Optional[int] = None
    required_ingredients: Optional[str] = Field(default=None, max_length=2000)
    meal_style: str = "full"
    # Names of meals already shown today — never re-suggest these.
    avoid_meals: list[str] = Field(default_factory=list, max_length=300)


# ---------------------------------------------------------------------------
# Sharing (public, browsable links for meals & recipes)
# ---------------------------------------------------------------------------

class CreateShareRequest(BaseModel):
    kind: str  # "recipe" | "meal"
    payload: dict


class CreateShareResponse(BaseModel):
    id: str


class SharedItem(BaseModel):
    kind: str
    payload: dict


# ---------------------------------------------------------------------------