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

export const FLAVOUR_OPTIONS: Array<{ value: string; en: string; zh: string }> = [
  { value: "spicy",  en: "Spicy",  zh: "辣" },
  { value: "sweet",  en: "Sweet",  zh: "甜" },
  { value: "savory", en: "Savory", zh: "酱香" },
  { value: "mild",   en: "Mild",   zh: "清淡" },
  { value: "sour",   en: "Sour",   zh: "酸" },
];

export const PREP_TIME_PRESETS: Array<{ value: number | null; en: string; zh: string }> = [
  { value: null, en: "Any time",  zh: "不限" },
  { value: 15,   en: "≤15 min",   zh: "15分钟以下" },
  { value: 30,   en: "≤30 min",   zh: "30分钟以下" },
  { value: 60,   en: "≤1 hour",   zh: "1小时以下" },
];

export const SLOT_COLOUR: Record<string, string> = {
  breakfast: "#F59E0B",
  lunch: "#2E7D32",
  dinner: "#6366F1",
};

export const SLOT_ICON: Record<string, string> = {
  breakfast: "sunny",
  lunch: "partly-sunny",
  dinner: "moon",
};

export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "#16A34A",
  medium: "#D97706",
  hard: "#DC2626",
};

export const PANTRY_UNITS = [
  "g", "kg", "ml", "L", "个", "条", "块", "袋", "瓶", "盒",
  "cup", "tbsp", "tsp", "piece", "bunch", "can",
];

const PANTRY_UNITS_EN = ["g", "kg", "ml", "L", "cup", "tbsp", "tsp", "piece", "bunch", "can"];

/** Returns the unit list appropriate for the current language. */
export function getPantryUnits(language: string): string[] {
  return language === "zh" ? PANTRY_UNITS : PANTRY_UNITS_EN;
}

// Chinese translations for AI-generated tags (tags are always returned in English)
export const TAG_ZH: Record<string, string> = {
  "high-protein": "高蛋白",
  "high protein": "高蛋白",
  "low-carb": "低碳水",
  "low carb": "低碳水",
  "low-fat": "低脂",
  "low fat": "低脂",
  "low-calorie": "低卡",
  "low calorie": "低卡",
  "high-fibre": "高纤维",
  "high fibre": "高纤维",
  "high-fiber": "高纤维",
  "high fiber": "高纤维",
  "low-sodium": "低钠",
  "low sodium": "低钠",
  "gluten-free": "无麸质",
  "dairy-free": "无乳制品",
  "nut-free": "无坚果",
  "vegan": "纯素",
  "vegetarian": "素食",
  "keto": "生酮",
  "paleo": "原始饮食",
  "halal": "清真",
  "kosher": "犹太洁食",
  "spicy": "辣",
  "mild": "清淡",
  "umami": "鲜味",
  "sweet": "甜",
  "sour": "酸",
  "smoky": "烟熏",
  "fresh": "清爽",
  "quick": "快手",
  "easy": "简单",
  "one-pot": "一锅",
  "one pot": "一锅",
  "meal prep": "备餐",
  "comfort food": "家常菜",
  "healthy": "健康",
  "balanced": "均衡",
  "heart-healthy": "护心",
  "anti-inflammatory": "抗炎",
  "high-energy": "高能量",
  "light": "清淡",
  "hearty": "丰盛",
  "breakfast": "早餐",
  "lunch": "午餐",
  "dinner": "晚餐",
};

export function translateTag(tag: string, language: string): string {
  if (language !== "zh") return tag;
  return TAG_ZH[tag.toLowerCase()] ?? tag;
}

export const CUISINE_ZH: Record<string, string> = {
  "Any": "不限",
  "Chinese": "中式",
  "Japanese": "日式",
  "Korean": "韩式",
  "Italian": "意式",
  "Mexican": "墨西哥菜",
  "Indian": "印度菜",
  "Thai": "泰式",
  "Mediterranean": "地中海菜",
  "American": "美式",
  "French": "法式",
  "Middle Eastern": "中东菜",
  "Greek": "希腊菜",
  "Spanish": "西班牙菜",
  "Vietnamese": "越南菜",
};

export function translateCuisine(cuisine: string, language: string): string {
  if (language !== "zh") return cuisine;
  return CUISINE_ZH[cuisine] ?? cuisine;
}

export function translateDifficulty(difficulty: string, language: string): string {
  if (language !== "zh") return difficulty;
  const map: Record<string, string> = { easy: "简单", medium: "中等", hard: "困难" };
  return map[difficulty.toLowerCase()] ?? difficulty;
}

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
