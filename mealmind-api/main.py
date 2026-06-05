import warnings
# Suppress a diagnostic warning from pyparsing that fires inside supabase's
# pyiceberg dependency. It's a third-party library issue, not our code.
warnings.filterwarnings("ignore", category=UserWarning, module="pyparsing")

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import meals, recipes, shopping, pantry, profile, images

app = FastAPI(
    title="MealMind API",
    version="1.0",
    description="AI-powered meal discovery, recipe parsing, and shopping list engine.",
)

_origins_env = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:8081,http://localhost:19006,https://wotoeat.com,https://wotoeat.vercel.app",
)
_allowed_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(meals.router,    prefix="/meals")
app.include_router(recipes.router,  prefix="/recipes")
app.include_router(shopping.router, prefix="/shopping")
app.include_router(pantry.router,   prefix="/pantry")
app.include_router(profile.router,  prefix="/profile")
app.include_router(images.router,   prefix="/images")


@app.get("/")
def root():
    return {"status": "MealMind API is running", "docs": "/docs"}
