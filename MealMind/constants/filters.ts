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
