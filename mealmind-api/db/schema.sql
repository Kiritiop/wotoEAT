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
    updated_at  timestamptz DEFAULT now(),
    UNIQUE (user_id, name)
);

-- ─── Saved Recipes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_recipes (
    id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title                text NOT NULL,
    intro                text,
    source_url           text,
    source_name          text,
    servings             integer DEFAULT 2,
    prep_time_mins       integer,
    calories_per_serving integer,
    ingredients          jsonb DEFAULT '[]',
    steps                jsonb DEFAULT '[]',
    chef_tips            text[] DEFAULT '{}',
    tags                 text[] DEFAULT '{}',
    warnings             text[] DEFAULT '{}',
    labels               text[] DEFAULT '{}',
    created_at           timestamptz DEFAULT now()
);

-- ─── Shopping Lists ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shopping_lists (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        text NOT NULL DEFAULT 'Shopping List',
    items       jsonb DEFAULT '{}',
    recipe_ids  uuid[] DEFAULT '{}',
    created_at  timestamptz DEFAULT now()
);

-- ─── User Preferences ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    default_filters  jsonb DEFAULT '{}',
    dietary_warnings text[] DEFAULT '{}',
    serving_size     integer DEFAULT 2,
    updated_at       timestamptz DEFAULT now()
);

-- ─── User Health Profiles ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    age                     integer,
    sex                     text,
    weight_kg               float,
    height_cm               float,
    activity_level          text,
    health_goals            text[] DEFAULT '{}',
    dietary_restrictions    text[] DEFAULT '{}',
    allergies               text[] DEFAULT '{}',
    calorie_goal            integer,
    protein_goal_g          integer,
    use_imperial            boolean,
    cuisine_preferences     text[] DEFAULT '{}',
    flavour_preference      text,
    preferred_max_prep_mins integer,
    created_at              timestamptz DEFAULT now(),
    updated_at              timestamptz DEFAULT now()
);

-- ─── Daily Meal Plans (history) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_plans (
    id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date           date NOT NULL,
    plan           jsonb NOT NULL,
    total_calories integer DEFAULT 0,
    created_at     timestamptz DEFAULT now(),
    UNIQUE (user_id, date)
);

-- ─── Meal History ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meal_history (
    id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date       date NOT NULL,
    meals      jsonb DEFAULT '[]',
    created_at timestamptz DEFAULT now()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE pantry           ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_recipes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_lists   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_history     ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pantry'           AND policyname='pantry_own')      THEN CREATE POLICY "pantry_own"      ON pantry           USING (auth.uid() = user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saved_recipes'    AND policyname='recipes_own')     THEN CREATE POLICY "recipes_own"     ON saved_recipes    USING (auth.uid() = user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='shopping_lists'   AND policyname='shopping_own')    THEN CREATE POLICY "shopping_own"    ON shopping_lists   USING (auth.uid() = user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_preferences' AND policyname='prefs_own')       THEN CREATE POLICY "prefs_own"       ON user_preferences USING (auth.uid() = user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_profiles'    AND policyname='profiles_own')    THEN CREATE POLICY "profiles_own"    ON user_profiles    USING (auth.uid() = user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='daily_plans'      AND policyname='plans_own')       THEN CREATE POLICY "plans_own"       ON daily_plans      USING (auth.uid() = user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meal_history'     AND policyname='history_own')     THEN CREATE POLICY "history_own"     ON meal_history     USING (auth.uid() = user_id); END IF;
END $$;

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS pantry_user_idx        ON pantry(user_id);
CREATE INDEX IF NOT EXISTS recipes_user_idx       ON saved_recipes(user_id);
CREATE INDEX IF NOT EXISTS shopping_user_idx      ON shopping_lists(user_id);
CREATE INDEX IF NOT EXISTS plans_user_date_idx    ON daily_plans(user_id, date DESC);
CREATE INDEX IF NOT EXISTS history_user_date_idx  ON meal_history(user_id, date DESC);
