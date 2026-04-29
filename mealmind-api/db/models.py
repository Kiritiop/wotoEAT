from pydantic import BaseModel, Field
from typing import Optional


# ---------------------------------------------------------------------------
# Shared primitives
# ---------------------------------------------------------------------------

class Ingredient(BaseModel):
    name: str
    amount: float
    unit: str
    calories: Optional[float] = None


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
# Daily meal plan
# ---------------------------------------------------------------------------

class MealComponent(BaseModel):
    vegetable: str       # e.g. "Steamed broccoli"
    protein: str         # e.g. "Grilled chicken breast"
    staple: str          # e.g. "Brown rice"


class DailyPlanMeal(BaseModel):
    slot: str            # "breakfast" | "lunch" | "dinner"
    name: str
    cuisine: str
    description: str
    prep_time_mins: int
    calories_per_serving: int
    difficulty: str
    components: MealComponent
    uses_pantry_items: list[str] = Field(default_factory=list)  # pantry items used
    tags: list[str] = Field(default_factory=list)
    ingredients: list[str] = Field(default_factory=list)  # e.g. ["2 eggs", "100g chicken"]
    steps: list[str] = Field(default_factory=list)        # cooking steps
    protein_g: Optional[int] = None
    carbs_g: Optional[int] = None
    fat_g: Optional[int] = None
    fiber_g: Optional[int] = None


class ShoppingReminder(BaseModel):
    item: str
    reason: str          # which meal needs it


class DailyMealPlan(BaseModel):
    meals: list[DailyPlanMeal]           # always 3: breakfast, lunch, dinner
    shopping_reminders: list[ShoppingReminder] = Field(default_factory=list)
    total_calories: int
    nutrition_note: str  # brief note e.g. "Meets your high-protein goal"


class DailyPlanRequest(BaseModel):
    profile: HealthProfile = Field(default_factory=HealthProfile)
    pantry: list[str] = Field(default_factory=list)
    cuisine_preference: Optional[str] = None
    max_prep_time_mins: Optional[int] = None
    language: str = "en"
    recent_ratings: Optional[dict] = None  # {"meal name": "up"|"down"}
    servings: int = 2
    slots: Optional[list[str]] = None      # e.g. ["lunch"] — generate only these slots


class PlanShoppingRequest(BaseModel):
    plan: DailyMealPlan
    pantry: list[str] = Field(default_factory=list)
    language: str = "en"


class SwapMealRequest(BaseModel):
    slot: str  # "breakfast" | "lunch" | "dinner"
    current_plan: DailyMealPlan
    profile: HealthProfile = Field(default_factory=HealthProfile)
    pantry: list[str] = Field(default_factory=list)
    language: str = "en"


class DailyPlanResponse(BaseModel):
    plan: DailyMealPlan
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
# Eat Out
# ---------------------------------------------------------------------------

class EatOutRequest(BaseModel):
    lat: float
    lng: float
    filters: MealFilter
    radius_m: int = 1500


class RestaurantResult(BaseModel):
    name: str
    address: str
    rating: Optional[float] = None
    reason: str
    maps_url: str


class EatOutResponse(BaseModel):
    restaurants: list[RestaurantResult]
