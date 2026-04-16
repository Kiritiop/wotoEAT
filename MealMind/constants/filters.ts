export const CUISINES = [
  "Any",
  "Italian",
  "Japanese",
  "Mexican",
  "Chinese",
  "Indian",
  "Thai",
  "French",
  "Mediterranean",
  "American",
  "Korean",
  "Middle Eastern",
  "Greek",
  "Spanish",
  "Vietnamese",
];

export const DIETARY_RESTRICTIONS = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "dairy-free",
  "nut-free",
  "halal",
  "kosher",
  "keto",
  "paleo",
];

export const DIETARY_GOALS = [
  "high-protein",
  "low-carb",
  "low-fat",
  "low-sodium",
  "high-fibre",
  "low-calorie",
];

export const FLAVOUR_PROFILES = [
  "Any",
  "mild",
  "spicy",
  "umami",
  "sweet",
  "sour",
  "smoky",
  "fresh",
];

export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "#4CAF50",
  medium: "#FF9800",
  hard: "#F44336",
};

export const PANTRY_UNITS = [
  "g",
  "kg",
  "ml",
  "L",
  "个",
  "条",
  "块",
  "袋",
  "瓶",
  "盒",
  "cup",
  "tbsp",
  "tsp",
  "piece",
  "bunch",
  "can",
];

// Approximate gram weights for non-standard units — used by the AI
// to understand how much of an ingredient the user actually has.
export const UNIT_GRAM_ESTIMATES: Record<string, string> = {
  "个": "≈60g each (e.g. 1 egg≈60g, 1 medium fruit≈150g)",
  "条": "≈200g each (e.g. 1 fish fillet≈200g, 1 carrot≈80g)",
  "块": "≈150g each (e.g. 1 piece of meat/tofu≈150g)",
  "袋": "≈300g per bag (e.g. 1 bag shrimp≈300g, 1 bag spinach≈200g)",
  "瓶": "≈500ml per bottle",
  "盒": "≈250g per box/carton",
  "piece": "≈150g each",
  "bunch": "≈200g",
  "can": "≈400g",
  "cup": "≈240ml or ≈150g for dry goods",
  "tbsp": "≈15g",
  "tsp": "≈5g",
};
