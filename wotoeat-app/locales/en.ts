const en = {
  // ── Tabs ──────────────────────────────────────────────────────────────────
  tab_today: "woto",
  tab_shopping: "Shopping",
  tab_pantry: "Pantry",
  tab_recipes: "Recipes",

  tab_profile: "Me",
  tab_history: "History",

  // ── Common ────────────────────────────────────────────────────────────────
  save: "Save",
  cancel: "Cancel",
  delete: "Delete",
  confirm: "Confirm",
  loading: "Loading…",
  error: "Error",
  retry: "Try again",
  validation_positive: "Must be greater than 0.",
  done: "Done",
  next: "Next",
  back: "Back",
  skip: "Skip",
  add: "Add",
  edit: "Edit",
  share: "Share",
  filters: "Filters",
  clear: "Clear",
  nutrition_info: "Nutrition info",
  could_not_generate: "Couldn't generate a meal. Please try again.",
  could_not_swap: "Couldn't swap the meal. Please try again.",
  no_meals_for_filter: "No meals match this filter yet. Tap Generate to add one.",
  clear_meals_title: "Clear today's meals?",
  clear_meals_confirm: "This removes all generated meals and confirmations for today. You can generate new ones anytime.",
  generate: "Generate",
  regenerate: "Regenerate",
  saved: "Saved",
  empty: "No data",

  // ── Auth ──────────────────────────────────────────────────────────────────
  forgot_password: "Forgot password?",
  reset_password: "Reset Password",
  send_reset_link: "Send Reset Link",
  reset_link_sent: "Check your email for a password reset link.",
  enter_email: "Please enter your email.",
  sign_in: "Sign In",
  sign_up: "Sign Up",
  sign_out: "Sign out",
  email: "Email",
  password: "Password",
  confirm_password: "Confirm password",
  signing_in: "Signing in…",
  creating_account: "Creating account…",
  no_account: "Don't have an account?",
  have_account: "Already have an account?",
  sign_in_link: "Sign in",
  sign_up_link: "Sign up",
  app_tagline: "Smart meals, less stress.",
  welcome_back: "Welcome back",
  made_with_wotoeat: "Made with wotoEAT",
  link_copied: "Copied to clipboard",
  try_wotoeat: "Try wotoEAT",
  create_account: "Create Account",
  start_discovering: "Start discovering better meals",
  account_created: "Account created! Check your email for a confirmation link, then",
  sign_in_here: "sign in here.",
  enter_email_password: "Please enter your email and password.",
  passwords_no_match: "Passwords don't match.",
  password_too_short: "Password must be at least 6 characters.",

  // ── Today / Daily Plan ────────────────────────────────────────────────────
  todays_plan: "Today's Meal Plan",
  plan_subtitle: "AI-generated breakfast, lunch & dinner tailored to your profile and pantry.",
  cuisine_pref: "Cuisine preference",
  cuisine_placeholder: "e.g. Japanese, Italian",
  max_prep: "Max prep time (min)",
  generate_plan: "Generate Today's Plan",
  regenerate_plan: "Regenerate Plan",
  total_calories: "kcal total",
  nutrition_note_label: "Nutrition note",
  shopping_reminders: "Shopping Reminders",
  shop_for_plan: "Shop for this plan",
  share_plan: "Share Plan",
  swap_meal: "Swap",
  per_serving: "per serving",
  prep_time_label: "prep",
  generate_cta: "What to eat?",
  nutrition_estimated: "Estimated · per serving",
  macro_protein: "Protein",
  macro_carbs: "Carbs",
  macro_fat: "Fat",
  macro_fiber: "Fiber",
  ingredients_breakdown: "Ingredients",
  add_all_to_cart: "Add all to shopping list",
  added_to_cart: "Added",
  remove_all_from_cart: "Remove all from cart",
  swapping: "Finding alternative…",
  more_details: "More details",
  less: "Less",
  no_plan_title: "What should you cook today?",
  no_plan_body: "wotoEAT turns your pantry, tastes, and health goals into real dishes worth cooking",
  welcome_step1: "Add your pantry & pick a few filters",
  welcome_step2: "Tap “What to eat?” for a real, cookable dish",
  welcome_step3: "Confirm a dish to build your shopping list",
  using_from_pantry: "Using from pantry:",
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",

  // ── Profile ───────────────────────────────────────────────────────────────
  your_profile: "Your Profile",
  profile_subtitle: "Used to personalise your daily meal plan",
  body_metrics: "Body Metrics",
  age: "Age",
  sex: "Sex",
  weight_kg: "Weight (kg)",
  height_cm: "Height (cm)",
  male: "Male",
  female: "Female",
  other: "Other",
  activity_level: "Activity Level",
  health_goals: "Health Goals",
  dietary_restrictions: "Dietary Restrictions",
  allergies: "Allergies",
  allergies_hint: "Comma-separated, e.g. peanuts, shellfish",
  allergies_placeholder: "e.g. peanuts, shellfish",
  save_profile: "Save profile",
  profile_saved: "Profile saved",
  language: "Language",
  language_en: "English",
  language_zh: "中文",
  use_imperial: "Use Imperial (lbs / in)",
  calorie_goal: "Daily Calorie Goal",
  calorie_goal_placeholder: "e.g. 2000",
  protein_goal: "Daily Protein Goal (g)",
  protein_goal_placeholder: "e.g. 120",
  protein_today: "Protein today",
  protein_of_goal: "of goal",
  weight_lbs: "Weight (lbs)",
  height_in: "Height (in)",

  // ── Pantry ────────────────────────────────────────────────────────────────
  pantry_intro: "Items here are subtracted from your shopping list automatically.",
  add_ingredient: "Add ingredient",
  ingredient_name: "Ingredient name",
  ingredient_name_placeholder: "e.g. olive oil",
  amount: "Amount",
  amount_placeholder: "e.g. 500",
  unit: "Unit",
  add_to_pantry: "Add to pantry",
  pantry_empty_title: "Pantry is empty",
  pantry_empty_body: "Add ingredients you already own and we'll skip them in your shopping list.",
  pantry_count: (n: number) => `${n} item${n !== 1 ? "s" : ""} in pantry`,
  pantry_name_exists: "You already have this item.",
  missing_fields: "Enter an ingredient name and amount.",
  missing_name: "Please enter an ingredient name.",
  missing_amount: "Please enter an amount.",
  invalid_amount: "Amount must be a number greater than 0.",
  edit_ingredient: "Edit Ingredient",
  saving: "Saving…",

  // ── Receipt scanning ──────────────────────────────────────────────────────
  scan_receipt: "Scan receipt",
  scan_intro: "Photograph a grocery receipt and we'll add the food items to your pantry.",
  scan_take_photo: "Take photo",
  scan_pick_photo: "Choose from library",
  scan_processing: "Reading your receipt…",
  scan_processing_hint: "This usually takes a few seconds.",
  scan_found: (n: number) => `${n} food item${n !== 1 ? "s" : ""} found`,
  scan_breakdown: (matched: number, nonFood: number) => {
    const parts: string[] = [];
    if (matched > 0) parts.push(`${matched} already in pantry`);
    if (nonFood > 0) parts.push(`${nonFood} not food`);
    return parts.join(" · ");
  },
  scan_edit_hint: "Tap a name to edit it. Uncheck anything you don't want.",
  scan_already_have: "Already in pantry",
  scan_not_food: "Not food",
  scan_add_items: (n: number) => `Add ${n} item${n !== 1 ? "s" : ""} to pantry`,
  scan_rescan: "Scan again",
  scan_no_items_checked: "Select at least one item to add.",
  scan_err_no_receipt: "We couldn't find a readable receipt in that photo. Try a closer, sharper shot.",
  scan_err_no_food: "No food items were found on this receipt.",
  scan_err_generic: "Couldn't scan the receipt. Please try again.",
  scan_rate_limited: "You've reached the scan limit. Try again in an hour.",
  scan_camera_denied: "Camera access is needed to scan receipts. Enable it in Settings.",

  // ── Shopping ──────────────────────────────────────────────────────────────
  generate_list: "Generate List",
  shopping_empty_title: "Your list is empty",
  shopping_empty_body: "Confirm meals in Discover or add recipes from the Recipes tab, then tap Generate List.",
  no_recipes_selected: "Go to Recipes → add recipes to your list first.",
  shopping_gen_error: "Couldn't generate the shopping list. Please try again.",
  items_progress: (checked: number, total: number) => `${checked} / ${total} items`,

  // ── Network ───────────────────────────────────────────────────────────────
  no_internet: "No internet connection",
  offline_note: "Some features may be unavailable",

  // ── Recipes ───────────────────────────────────────────────────────────────
  find_recipe: "Find Recipe",
  find_recipe_hint: "Type any dish name — AI generates the full recipe instantly.",
  dish_name_placeholder: "e.g. Kung Pao Chicken, Carbonara, Miso Soup…",
  no_dish_name: "Please enter a dish name.",
  generating_recipe: "Generating recipe…",
  recipe_preview: "Recipe Preview",
  generate_another: "Try another dish",
  add_recipe_url: "Add recipe from URL",
  import_from_url: "Import from URL",
  no_recipes_title: "No saved recipes",
  no_recipes_body: "Paste any recipe URL and we'll parse and save it for you.",
  recipe_count: (n: number) => `${n} saved recipe${n !== 1 ? "s" : ""}`,
  parse_url_hint: "Paste any recipe URL below. The AI will extract the title, ingredients, and steps.",
  parse: "Parse",
  save_to_recipes: "Save to my recipes",
  parse_url_placeholder: "https://www.bbcgoodfood.com/recipes/...",
  parse_invalid_url: "Enter a full URL starting with https://",

  // ── Expanded meal card ────────────────────────────────────────────────────
  in_pantry: "In pantry",
  ingredients_label: "Ingredients",
  steps_label: "Steps",
  chef_tips_label: "Chef's Tips",
  find_recipes_online: "Find recipes online",
  min_label: "min",
  difficulty_easy: "Easy",
  difficulty_medium: "Medium",
  difficulty_hard: "Hard",

  // ── History ───────────────────────────────────────────────────────────────
  history_heading: "Meal History",
  history_subtitle: "Your past daily plans.",
  history_empty_title: "No history yet",
  history_empty_body: "Generate your first daily plan and it will appear here.",
  calories_label: "kcal",
  search_history: "Search history…",
  load_more: "Load more",
  weekly_cal_chart: "Weekly Calories",

  // ── My Recipes ────────────────────────────────────────────────────────────
  tab_my_recipes: "My Recipes",
  saved_tab: "Saved",
  liked_tab: "Liked",
  mine_tab: "Mine",
  mark_favorite: "Favorite",
  mark_frequent: "Frequent",
  mark_done: "Mark as Made",
  done_reduces_pantry: "Pantry inventory will be reduced for matching ingredients.",
  remove_label: "Remove",
  new_recipe: "New Recipe",
  my_recipe: "My Recipe",
  add_tag: "Add tag",
  recipe_title_placeholder: "Recipe title…",
  unconfirm: "Unplan",
  edit_field_prep: "Prep time (min)",
  edit_field_calories: "Calories / serving",
  edit_field_servings: "Servings",
  edit_field_ingredients: "Ingredients",
  edit_field_steps: "Steps",
  tags_label: "Tags",
  more_tags: (n: number) => `+${n} more`,

  // ── Servings ──────────────────────────────────────────────────────────────
  servings: "Servings",
  servings_people: (n: number) => `${n} ${n === 1 ? "person" : "people"}`,

  // ── Plan settings ─────────────────────────────────────────────────────────
  plan_settings: "Settings",
  all_meals: "All",
  snack: "Snack",
  show_settings: "Filters & Options",

  // ── Profile complete ───────────────────────────────────────────────────────
  complete_profile: "Complete Your Profile",
  complete_profile_sub: "Add your health details for smarter meal recommendations.",
  complete_profile_btn: "Set Up Now",

  // ── Shopping (in pantry) ──────────────────────────────────────────────────
  shopping_list: "Shopping List",
  cart_empty: "Your cart is empty",
  cart_empty_sub: "Add recipes from My Recipes, then generate a shopping list.",

  // ── Onboarding ────────────────────────────────────────────────────────────
  onboarding_welcome: "Welcome to wotoEAT",
  onboarding_welcome_sub: "Smart meals, less stress. Let's get started.",
  onboarding_step1: "Your Body",
  onboarding_step2: "Your Goals",
  onboarding_step3: "Your Pantry",
  onboarding_step1_sub: "Help us understand your baseline.",
  onboarding_step2_sub: "What are you trying to achieve?",
  onboarding_step3_sub: "Add what you already have at home.",
  onboarding_finish: "Start Planning",
  onboarding_get_started: "Get Started",
  onboarding_age_placeholder: "e.g. 28",
  onboarding_weight_placeholder: "e.g. 70",
  onboarding_height_placeholder: "e.g. 170",

  // ── Find Recipe modal ─────────────────────────────────────────────────────
  popular_dishes: "Popular dishes",

  // ── Meal preferences (profile) ────────────────────────────────────────────
  meal_preferences: "Meal Preferences",
  preferred_cuisines: "Cuisine",
  preferred_cuisines_hint: "Auto-selected when you generate your daily plan.",
  flavour_pref: "Flavor",
  prep_time_pref: "Prep time",

  // ── Filters (discover) ────────────────────────────────────────────────────
  meal_type: "Meal type",
  search_recipes: "Search recipes…",
  from_pantry: "From your pantry",

  // ── Allergies ─────────────────────────────────────────────────────────────
  allergy_other: "Other",
  allergy_other_placeholder: "e.g. latex, mustard",
  restriction_other_placeholder: "e.g. low-FODMAP, raw food",

  // ── Serving size (meal card) ──────────────────────────────────────────────
  serving_size: "Serving size",
  for_n_people: "for",

  // ── Discover / meal card ──────────────────────────────────────────────────
  meal_saved_toast: "Saved — tap Recipes to edit",

  // ── Profile restrictions ──────────────────────────────────────────────────
  ai_custom_note: "Note: AI may not always respect custom entries — double-check your plan.",

  // ── Forgot password ───────────────────────────────────────────────────────
  reset_password_hint: "Enter your email and we'll send you a reset link.",
  sending: "Sending…",

  // ── About the creator ─────────────────────────────────────────────────────
  about_creator: "About the Creator",
  about_support: "Support this project",
  about_copyright: "© 2026 Jerry Wang · wotoEAT",

  // ── Meal style filter ─────────────────────────────────────────────────────
  meal_style_label: "Meal Style",

  // ── Recipe edit mode ─────────────────────────────────────────────────────
  edit_title_required: "Title is required.",
  edit_placeholder_prep: "e.g. 30",
  edit_placeholder_calories: "e.g. 450",
  edit_placeholder_servings: "e.g. 2",
  edit_placeholder_ingredient: "Ingredient",
  edit_placeholder_amount: "Amt",
  edit_placeholder_unit: "Unit",
  edit_add_ingredient: "Add ingredient…",
  edit_add_step: "Add step…",
  step_placeholder: (n: number) => `Step ${n}`,
  save_to_mine: "Save to Mine",

  // ── Discover screen ───────────────────────────────────────────────────────
  tap_for_details: "Tap for details",
  include_tags_label: "Include tags",
  add_tag_or_ingredient: "Add ingredient or tag…",
  cached_label: "cached",
  clear_filters: "Clear filters",

  // ── History tab ───────────────────────────────────────────────────────────
  history_generate_save: "Generate & Save Recipe",
  history_saved_banner: "Saved to Recipes",
  history_failed_banner: "Failed — please try again",

  // ── Find recipe modal ─────────────────────────────────────────────────────
  more_ingredients: (n: number) => `+${n} more ingredients`,

  // ── Onboarding bullets ───────────────────────────────────────────────────
  onboarding_bullet_1: "AI meal plans tailored to you",
  onboarding_bullet_2: "Track pantry & reduce waste",
  onboarding_bullet_3: "Smart shopping lists",
  onboarding_save_error: "Could not save your profile. Please check your connection and try again.",

  // ── Landing page ──────────────────────────────────────────────────────────
  landing_hero_title: "Every meal, figured out.",
  landing_hero_sub: "AI-personalised meal plans. Generate today's recipes in one tap — from your health goals, the ingredients you have, and your taste.",
  landing_f1_title: "Meal plans, decided for you",
  landing_f1_sub: "End the \"what's for dinner?\" dilemma — AI tailors your breakfast, lunch, and dinner.",
  landing_f2_title: "Rescue your leftovers",
  landing_f2_sub: "Cook with whatever's in the fridge — AI turns odds and ends into something delicious, saving money and waste.",
  landing_f3_title: "Build your private cookbook",
  landing_f3_sub: "Customise and save with one tap, so every dish you love is easy to recreate.",
  landing_cta_start: "Start your free meal plan",
  landing_cta_signin: "Already have an account?",
  landing_fine_print: "No credit card required · Free to use",
  landing_learn_more: "Learn more",
} as const;

export type TranslationKey = keyof typeof en;
export default en;
