import warnings
# Suppress a diagnostic warning from pyparsing that fires inside supabase's
# pyiceberg dependency. It's a third-party library issue, not our code.
warnings.filterwarnings("ignore", category=UserWarning, module="pyparsing")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import meals, recipes, shopping, pantry, eatout, profile

app = FastAPI(
    title="MealMind API",
    version="1.0",
    description="AI-powered meal discovery, recipe parsing, and shopping list engine.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Tighten to your domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meals.router,    prefix="/meals")
app.include_router(recipes.router,  prefix="/recipes")
app.include_router(shopping.router, prefix="/shopping")
app.include_router(pantry.router,   prefix="/pantry")
app.include_router(eatout.router,   prefix="/eatout")
app.include_router(profile.router,  prefix="/profile")


@app.get("/")
def root():
    return {"status": "MealMind API is running", "docs": "/docs"}
