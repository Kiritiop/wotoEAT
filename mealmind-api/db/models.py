from pydantic import BaseModel, Field, field_validator
from typing import Optional, Union


# ---------------------------------------------------------------------------
# Shared primitives
# ---------------------------------------------------------------------------

class Ingredient(BaseModel):
    name: str
    amount: float
    unit: str
    calories: Optional[float] = None

    @field_validator("amount", mode="before")
    @classmethod
    def coerce_amount(cls, v: Union[str, float, int]) -> float:
        if isinstance(v, str):
            v = v.strip()
            try:
                if "/" in v:
                    num, den = v.split("/", 1)
                    return float(num) / float(den)
                return float(v)
            except (ValueError, ZeroDivisionError):
                return 0.0
        return float(v)


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


# ---------------------------------------------------------------------------
# Meal suggestions (legacy 6-meal mode)
# ---------------------------------------------------------------------------

class MealFilter(BaseModel):
    cuisine: Optional[str] = None
    max_prep_time_mins: Optional[int] = None
    max_calories: Optional[int] = None
    dietary_goals: list[str] = Field(default_factory=list)
    dietary_restrictions: list[str] = Field(default_factory=list)
    flavour_profile: Optional[str] = None
    serving_size: int = 2
    language: str = "en"


class MealSuggestion(BaseModel):
    name: str
    cuisine: str
    prep_time_mins: int
    calories_per_serving: int
    description: str
    difficulty: str
    tags: list[str] = Field(default_factory=list)


class MealSuggestResponse(BaseModel):
    meals: list[MealSuggestion]
    cached: bool = False


# ---------------------------------------------------------------------------
# Recipes
# ---------------------------------------------------------------------------

class Recipe(BaseModel):
    title: str
    servings: int
    prep_time_mins: int
    calories_per_serving: Optional[int] = None
    ingredients: list[Ingredient]
    steps: list[str]
    tags: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    source_url: Optional[str] = None
    source_name: Optional[str] = None


class UpdateRecipeRequest(BaseModel):
    recipe: Recipe


class ParseRecipeRequest(BaseModel):
    url: str
    language: str = "en"


class SaveRecipeRequest(BaseModel):
    recipe: Recipe


class GenerateRecipeRequest(BaseModel):
    dish_name: str
    language: str = "en"
    servings: int = 2


class TranslateRequest(BaseModel):
    texts: list[str]
    target: str = "zh"


# ---------------------------------------------------------------------------
# Pantry
# ---------------------------------------------------------------------------

class PantryItem(BaseModel):
    name: str


class PantryItemDB(PantryItem):
    id: Optional[str] = None
    user_id: Optional[str] = None


class UpsertPantryRequest(BaseModel):
    items: list[PantryItem]


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
    recipes: list[Recipe]
    pantry: list[str] = Field(default_factory=list)
    language: str = "en"


# ---------------------------------------------------------------------------