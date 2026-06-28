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
  lunch: "#16A34A",
  dinner: "#6366F1",
};

/** Two-stop gradient per meal slot — used for the bold card header band. */
export const SLOT_GRADIENT: Record<string, [string, string]> = {
  breakfast: ["#FBBF24", "#F59E0B"],
  lunch: ["#22C55E", "#16A34A"],
  dinner: ["#818CF8", "#6366F1"],
};

export const SLOT_ICON: Record<string, string> = {
  breakfast: "sunny",
  lunch: "partly-sunny",
  dinner: "moon",
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
  // Nutrition
  "high-protein": "高蛋白", "high protein": "高蛋白",
  "low-carb": "低碳水", "low carb": "低碳水",
  "low-fat": "低脂", "low fat": "低脂",
  "low-calorie": "低卡", "low calorie": "低卡",
  "high-fibre": "高纤维", "high fibre": "高纤维",
  "high-fiber": "高纤维", "high fiber": "高纤维",
  "low-sodium": "低钠", "low sodium": "低钠",
  "high-calcium": "高钙", "iron-rich": "富铁",
  "omega-3": "Omega-3", "antioxidant": "抗氧化",
  "protein-rich": "高蛋白", "fiber-rich": "高纤维",
  // Dietary labels
  "gluten-free": "无麸质", "dairy-free": "无乳制品",
  "nut-free": "无坚果", "egg-free": "无鸡蛋",
  "soy-free": "无大豆", "sugar-free": "无糖",
  "vegan": "纯素", "vegetarian": "素食",
  "pescatarian": "弹性素食", "keto": "生酮",
  "paleo": "原始饮食", "halal": "清真",
  "kosher": "犹太洁食", "whole30": "全食物30天",
  // Flavour
  "spicy": "辣", "mild": "清淡", "umami": "鲜味",
  "sweet": "甜", "sour": "酸", "salty": "咸",
  "smoky": "烟熏", "fresh": "清爽", "savory": "鲜咸",
  "savoury": "鲜咸", "rich": "浓郁", "tangy": "酸爽",
  "bitter": "苦", "aromatic": "香",
  // Cooking style
  "quick": "快手", "easy": "简单", "beginner-friendly": "新手友好",
  "one-pot": "一锅", "one pot": "一锅", "one-pan": "一锅",
  "no-cook": "免烹饪", "raw": "生食", "grilled": "烧烤",
  "baked": "烤", "steamed": "蒸", "stir-fry": "炒",
  "stir fry": "炒", "deep-fried": "炸", "slow-cooked": "慢炖",
  "air-fryer": "空气炸锅", "pressure-cooker": "压力锅",
  "meal prep": "备餐", "batch cooking": "批量备餐",
  "30-minute": "30分钟", "15-minute": "15分钟",
  "under 30 minutes": "30分钟内", "under 15 minutes": "15分钟内",
  // Occasion / lifestyle
  "comfort food": "家常菜", "healthy": "健康",
  "balanced": "均衡", "heart-healthy": "护心",
  "anti-inflammatory": "抗炎", "high-energy": "高能量",
  "light": "轻食", "hearty": "丰盛", "festive": "节日",
  "kid-friendly": "儿童友好", "family-friendly": "家庭友好",
  "budget-friendly": "经济实惠", "meal-prep": "备餐",
  "lunch box": "便当", "lunchbox": "便当",
  // Main ingredients — generic
  "chicken": "鸡肉", "beef": "牛肉", "pork": "猪肉",
  "lamb": "羊肉", "fish": "鱼", "seafood": "海鲜",
  "shrimp": "虾", "tofu": "豆腐", "eggs": "鸡蛋",
  "rice": "米饭", "noodles": "面条", "pasta": "意面",
  "bread": "面包", "potato": "土豆", "mushroom": "蘑菇",
  // Specific cuts / forms
  "chicken wings": "鸡翅", "chicken wing": "鸡翅",
  "chicken breast": "鸡胸肉", "chicken thighs": "鸡腿",
  "chicken thigh": "鸡腿", "chicken drumsticks": "鸡棒腿",
  "chicken legs": "鸡腿", "whole chicken": "整鸡",
  "pork belly": "五花肉", "pork ribs": "排骨",
  "pork shoulder": "猪肩肉", "ground pork": "猪肉末",
  "minced pork": "猪肉末", "pork chop": "猪排",
  "ground beef": "牛肉末", "minced beef": "牛肉末",
  "beef steak": "牛排", "beef ribs": "牛肋骨",
  "beef brisket": "牛腩", "beef tenderloin": "牛里脊",
  "lamb chops": "羊排", "lamb shoulder": "羊肩肉",
  "salmon": "三文鱼", "salmon fillet": "三文鱼柳",
  "cod": "鳕鱼", "tuna": "金枪鱼", "tilapia": "罗非鱼",
  "sea bass": "鲈鱼", "mackerel": "鲭鱼", "sardines": "沙丁鱼",
  "prawns": "大虾", "scallops": "扇贝", "clams": "蛤蜊",
  "squid": "鱿鱼", "octopus": "章鱼", "crab": "螃蟹",
  "duck breast": "鸭胸", "duck legs": "鸭腿",
  "egg yolk": "蛋黄", "egg white": "蛋白",
  // Cuisine
  "chinese": "中式", "japanese": "日式", "korean": "韩式",
  "italian": "意式", "mexican": "墨西哥", "indian": "印度",
  "thai": "泰式", "mediterranean": "地中海", "american": "美式",
  "french": "法式", "middle eastern": "中东", "fusion": "融合",
  // Meal slot
  "breakfast": "早餐", "lunch": "午餐", "dinner": "晚餐",
  "snack": "零食", "dessert": "甜点", "brunch": "早午餐",
};

export function translateTag(tag: string, language: string): string {
  // Tags are meant to be stored English, but the model occasionally returns
  // Chinese tags in zh mode. In EN mode, normalize any stray Chinese tag back
  // to canonical English (via TAG_EN) so an English viewer never sees Chinese.
  if (language !== "zh") return TAG_EN[tag.trim()] ?? tag;
  return TAG_ZH[tag.toLowerCase()] ?? tag;
}

// ───────────────────────────────────────────────────────────────────────────
// Pantry categories — single source of truth (PantryTagPicker imports this).
// Each item's English name is canonical; itemsZh is the display-only Chinese.
// ───────────────────────────────────────────────────────────────────────────
export interface PantryCategory {
  key: string;
  label: string;
  labelZh: string;
  items: string[];
  itemsZh: string[];
}

export const PANTRY_CATEGORIES: PantryCategory[] = [
  {
    key: "meat", label: "Meat & Protein", labelZh: "肉类 & 蛋白质",
    items:   ["chicken", "beef", "pork", "lamb", "fish", "shrimp", "tofu", "eggs", "turkey", "duck", "salmon", "tuna", "crab", "bacon", "sausage", "ham", "ground beef", "chicken breast", "pork belly", "sardines"],
    itemsZh: ["鸡肉", "牛肉", "猪肉", "羊肉", "鱼", "虾", "豆腐", "鸡蛋", "火鸡", "鸭肉", "三文鱼", "金枪鱼", "螃蟹", "培根", "香肠", "火腿", "牛肉馅", "鸡胸肉", "五花肉", "沙丁鱼"],
  },
  {
    key: "veg", label: "Vegetables", labelZh: "蔬菜",
    items:   ["onion", "garlic", "tomato", "potato", "carrot", "broccoli", "spinach", "bell pepper", "mushroom", "cucumber", "zucchini", "eggplant", "celery", "corn", "cabbage", "lettuce", "kale", "green onion", "ginger", "leek"],
    itemsZh: ["洋葱", "大蒜", "番茄", "土豆", "胡萝卜", "西兰花", "菠菜", "彩椒", "蘑菇", "黄瓜", "西葫芦", "茄子", "芹菜", "玉米", "卷心菜", "生菜", "羽衣甘蓝", "葱", "生姜", "韭葱"],
  },
  {
    key: "grains", label: "Grains & Carbs", labelZh: "谷物 & 主食",
    items:   ["rice", "pasta", "bread", "noodles", "oats", "quinoa", "flour", "tortilla", "couscous", "barley", "panko", "cornstarch", "sourdough", "ramen", "soba", "udon", "rice noodles", "pita", "oat flour", "breadcrumbs"],
    itemsZh: ["米饭", "意面", "面包", "面条", "燕麦", "藜麦", "面粉", "玉米饼", "库斯库斯", "大麦", "面包糠", "玉米淀粉", "酸面包", "拉面", "荞麦面", "乌冬面", "米粉", "皮塔饼", "燕麦粉", "面包屑"],
  },
  {
    key: "dairy", label: "Dairy", labelZh: "乳制品",
    items:   ["milk", "butter", "cheese", "yogurt", "cream", "cream cheese", "sour cream", "mozzarella", "parmesan", "cheddar", "heavy cream", "condensed milk", "whipped cream", "gouda", "brie", "ricotta", "cottage cheese", "kefir", "ghee", "feta"],
    itemsZh: ["牛奶", "黄油", "奶酪", "酸奶", "奶油", "奶油奶酪", "酸奶油", "马苏里拉", "帕玛森", "切达奶酪", "淡奶油", "炼乳", "打发奶油", "高达奶酪", "布里奶酪", "瑞可塔", "农家奶酪", "开菲尔", "酥油", "菲达奶酪"],
  },
  {
    key: "condiments", label: "Condiments & Sauces", labelZh: "调味品 & 酱料",
    items:   ["soy sauce", "salt", "sugar", "pepper", "vinegar", "honey", "ketchup", "mustard", "mayo", "hot sauce", "fish sauce", "oyster sauce", "hoisin sauce", "sriracha", "Worcestershire sauce", "coconut milk", "tomato paste", "chicken stock", "baking soda", "baking powder"],
    itemsZh: ["生抽", "盐", "糖", "胡椒", "醋", "蜂蜜", "番茄酱", "芥末", "蛋黄酱", "辣椒酱", "鱼露", "蚝油", "海鲜酱", "是拉差辣酱", "伍斯特酱", "椰浆", "番茄膏", "鸡汤", "小苏打", "泡打粉"],
  },
  {
    key: "oils", label: "Cooking Oils", labelZh: "烹饪油",
    items:   ["olive oil", "vegetable oil", "sesame oil", "coconut oil", "canola oil", "sunflower oil", "avocado oil", "peanut oil", "corn oil", "grapeseed oil", "chili oil", "toasted sesame oil", "lard", "shortening", "ghee", "truffle oil", "walnut oil", "flaxseed oil", "garlic oil", "cooking spray"],
    itemsZh: ["橄榄油", "食用油", "芝麻油", "椰子油", "菜籽油", "葵花籽油", "牛油果油", "花生油", "玉米油", "葡萄籽油", "辣椒油", "熟芝麻油", "猪油", "起酥油", "酥油", "松露油", "核桃油", "亚麻籽油", "蒜油", "烹饪喷雾"],
  },
  {
    key: "fruits", label: "Fruits", labelZh: "水果",
    items:   ["apple", "banana", "lemon", "lime", "orange", "strawberry", "blueberry", "mango", "avocado", "grapes", "pineapple", "watermelon", "peach", "pear", "raspberry", "cherry", "kiwi", "pomelo", "papaya", "coconut"],
    itemsZh: ["苹果", "香蕉", "柠檬", "青柠", "橙子", "草莓", "蓝莓", "芒果", "牛油果", "葡萄", "菠萝", "西瓜", "桃子", "梨", "树莓", "樱桃", "猕猴桃", "柚子", "木瓜", "椰子"],
  },
  {
    key: "herbs", label: "Herbs & Spices", labelZh: "香料 & 调味",
    items:   ["basil", "cilantro", "parsley", "thyme", "rosemary", "cumin", "paprika", "chili powder", "turmeric", "oregano", "bay leaf", "coriander", "cinnamon", "cardamom", "cloves", "nutmeg", "star anise", "dill", "mint", "saffron"],
    itemsZh: ["罗勒", "香菜", "欧芹", "百里香", "迷迭香", "孜然", "红椒粉", "辣椒粉", "姜黄", "牛至", "月桂叶", "芫荽", "肉桂", "豆蔻", "丁香", "肉豆蔻", "八角", "莳萝", "薄荷", "藏红花"],
  },
  {
    key: "frozen", label: "Frozen & Canned", labelZh: "冷冻 & 罐装",
    items:   ["frozen peas", "frozen corn", "canned tomatoes", "canned beans", "canned tuna", "canned chickpeas", "frozen edamame", "canned lentils", "canned olives", "frozen spinach", "canned soup", "canned pumpkin", "frozen mixed veg", "canned corn", "frozen shrimp", "frozen fruit", "canned artichokes", "canned sardines", "canned crab", "canned coconut milk"],
    itemsZh: ["速冻豌豆", "速冻玉米", "番茄罐头", "豆类罐头", "金枪鱼罐头", "鹰嘴豆罐头", "速冻毛豆", "扁豆罐头", "橄榄罐头", "速冻菠菜", "汤罐头", "南瓜罐头", "速冻混合蔬菜", "玉米罐头", "速冻虾", "速冻水果", "洋蓟罐头", "沙丁鱼罐头", "蟹肉罐头", "椰浆罐头"],
  },
];

/** "other" bucket key for pantry items not in any known category. */
export const PANTRY_OTHER_KEY = "other";

export const CATEGORY_LABELS: Record<string, { en: string; zh: string }> = {
  ...Object.fromEntries(PANTRY_CATEGORIES.map((c) => [c.key, { en: c.label, zh: c.labelZh }])),
  [PANTRY_OTHER_KEY]: { en: "Other", zh: "其他" },
};

/** Lowercase canonical English item name → category key. */
export const ITEM_CATEGORY: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const cat of PANTRY_CATEGORIES) {
    for (const item of cat.items) map[item.toLowerCase()] = cat.key;
  }
  return map;
})();

export function categoryForItem(name: string): string {
  return ITEM_CATEGORY[name.trim().toLowerCase()] ?? PANTRY_OTHER_KEY;
}

/**
 * Reverse map: Chinese display name → canonical English. Built from TAG_ZH and
 * the pantry itemsZh pairs so legacy Chinese-stored pantry names can be shown
 * in English (unified language display).
 */
export const TAG_EN: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [en, zh] of Object.entries(TAG_ZH)) {
    if (!(zh in map)) map[zh] = en;
  }
  for (const cat of PANTRY_CATEGORIES) {
    cat.items.forEach((en, i) => {
      const zh = cat.itemsZh[i];
      if (zh && !(zh in map)) map[zh] = en;
    });
  }
  return map;
})();

/** Normalize a pantry name to canonical English when one is known. */
export function toCanonicalEnglish(name: string): string {
  return TAG_EN[name.trim()] ?? name;
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
