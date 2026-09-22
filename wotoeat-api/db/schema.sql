-- wotoEAT Database Schema
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
    category    text,
    updated_at  timestamptz DEFAULT now(),
    UNIQUE (user_id, name)
);
-- Migration for existing deployments (CREATE TABLE IF NOT EXISTS won't add a column):
ALTER TABLE pantry ADD COLUMN IF NOT EXISTS category text;

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
-- The app keeps exactly one "current" list per user (GET/PUT /shopping/current),
-- but racing debounced saves can insert duplicates. Deduplicate (keep the oldest
-- row — matches the API's read order), then enforce uniqueness going forward.
DELETE FROM shopping_lists a USING shopping_lists b
  WHERE a.name = 'current' AND b.name = 'current' AND a.user_id = b.user_id
    AND (a.created_at > b.created_at OR (a.created_at = b.created_at AND a.ctid > b.ctid));
CREATE UNIQUE INDEX IF NOT EXISTS shopping_current_unique
  ON shopping_lists(user_id, name) WHERE name = 'current';

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

-- ─── Meal History ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meal_history (
    id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date       date NOT NULL,
    meals      jsonb DEFAULT '[]',
    created_at timestamptz DEFAULT now()
);

-- ─── Shared Items (public, browsable meal/recipe links) ──────────────────────
CREATE TABLE IF NOT EXISTS shared_items (
    id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    kind       text NOT NULL,                 -- 'recipe' | 'meal'
    payload    jsonb NOT NULL,
    user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- nullable: anon shares allowed
    created_at timestamptz DEFAULT now()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE pantry           ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_recipes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_lists   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_history     ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_items     ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pantry'           AND policyname='pantry_own')      THEN CREATE POLICY "pantry_own"      ON pantry           USING (auth.uid() = user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saved_recipes'    AND policyname='recipes_own')     THEN CREATE POLICY "recipes_own"     ON saved_recipes    USING (auth.uid() = user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='shopping_lists'   AND policyname='shopping_own')    THEN CREATE POLICY "shopping_own"    ON shopping_lists   USING (auth.uid() = user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_profiles'    AND policyname='profiles_own')    THEN CREATE POLICY "profiles_own"    ON user_profiles    USING (auth.uid() = user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meal_history'     AND policyname='history_own')     THEN CREATE POLICY "history_own"     ON meal_history     USING (auth.uid() = user_id); END IF;
  -- Shared items are public-read (writes happen via the service-role backend, which bypasses RLS).
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='shared_items'     AND policyname='shared_public')   THEN CREATE POLICY "shared_public"   ON shared_items     FOR SELECT USING (true); END IF;
END $$;

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS pantry_user_idx        ON pantry(user_id);
CREATE INDEX IF NOT EXISTS recipes_user_idx       ON saved_recipes(user_id);
CREATE INDEX IF NOT EXISTS shopping_user_idx      ON shopping_lists(user_id);
CREATE INDEX IF NOT EXISTS history_user_date_idx  ON meal_history(user_id, date DESC);
