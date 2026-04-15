-- MealMind Database Schema
-- Run this in your Supabase project at:
-- https://app.supabase.com → your project → SQL Editor → New query
--
-- The `users` table is managed automatically by Supabase Auth.
-- All other tables reference auth.users(id) via user_id.

-- ─── Pantry ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pantry (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        text NOT NULL,
    amount      float NOT NULL,
    unit        text NOT NULL DEFAULT 'g',
    updated_at  timestamptz DEFAULT now(),
    UNIQUE (user_id, name)  -- enables upsert on conflict
);

-- ─── Saved Recipes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_recipes (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title               text NOT NULL,
    source_url          text,
    source_name         text,
    servings            integer DEFAULT 2,
    prep_time_mins      integer,
    calories_per_serving integer,
    ingredients         jsonb DEFAULT '[]',
    steps               jsonb DEFAULT '[]',
    tags                text[] DEFAULT '{}',
    warnings            text[] DEFAULT '{}',
    created_at          timestamptz DEFAULT now()
);

-- ─── Shopping Lists ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shopping_lists (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        text NOT NULL DEFAULT 'Shopping List',
    items       jsonb DEFAULT '{}',   -- stores the full ShoppingList JSON
    recipe_ids  uuid[] DEFAULT '{}',
    created_at  timestamptz DEFAULT now()
);

-- ─── User Preferences ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    default_filters     jsonb DEFAULT '{}',
    dietary_warnings    text[] DEFAULT '{}',
    serving_size        integer DEFAULT 2,
    updated_at          timestamptz DEFAULT now()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Enable RLS on all tables
ALTER TABLE pantry          ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_recipes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_lists  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Pantry: users can only see their own rows
CREATE POLICY "pantry_own" ON pantry
    USING (auth.uid() = user_id);

-- Saved recipes: users can only see their own rows
CREATE POLICY "recipes_own" ON saved_recipes
    USING (auth.uid() = user_id);

-- Shopping lists: users can only see their own rows
CREATE POLICY "shopping_own" ON shopping_lists
    USING (auth.uid() = user_id);

-- User preferences: users can only see their own row
CREATE POLICY "prefs_own" ON user_preferences
    USING (auth.uid() = user_id);

-- ─── User Health Profiles ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    age                 integer,
    sex                 text,
    weight_kg           float,
    height_cm           float,
    activity_level      text,
    health_goals        text[] DEFAULT '{}',
    dietary_restrictions text[] DEFAULT '{}',
    allergies           text[] DEFAULT '{}',
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_own" ON user_profiles USING (auth.uid() = user_id);

-- ─── Daily Meal Plans (history) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_plans (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date            date NOT NULL,
    plan            jsonb NOT NULL,
    total_calories  integer DEFAULT 0,
    created_at      timestamptz DEFAULT now(),
    UNIQUE (user_id, date)
);

ALTER TABLE daily_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_own" ON daily_plans USING (auth.uid() = user_id);

-- ─── Helpful indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS pantry_user_idx         ON pantry(user_id);
CREATE INDEX IF NOT EXISTS recipes_user_idx        ON saved_recipes(user_id);
CREATE INDEX IF NOT EXISTS shopping_user_idx       ON shopping_lists(user_id);
CREATE INDEX IF NOT EXISTS plans_user_date_idx     ON daily_plans(user_id, date DESC);
