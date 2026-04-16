/** Bilingual option lists for profile/onboarding chips. */

export const HEALTH_GOAL_OPTIONS = [
  { value: "lose weight",      en: "Lose weight",      zh: "减重" },
  { value: "maintain weight",  en: "Maintain weight",  zh: "保持体重" },
  { value: "build muscle",     en: "Build muscle",     zh: "增肌" },
  { value: "eat healthier",    en: "Eat healthier",    zh: "健康饮食" },
  { value: "more energy",      en: "More energy",      zh: "增加精力" },
  { value: "better sleep",     en: "Better sleep",     zh: "改善睡眠" },
  { value: "manage diabetes",  en: "Manage diabetes",  zh: "控制血糖" },
  { value: "heart health",     en: "Heart health",     zh: "心脏健康" },
] as const;

export const DIETARY_RESTRICTION_OPTIONS = [
  { value: "vegetarian", en: "Vegetarian", zh: "素食" },
  { value: "vegan",      en: "Vegan",      zh: "纯素" },
  { value: "gluten-free",en: "Gluten-free",zh: "无麸质" },
  { value: "dairy-free", en: "Dairy-free", zh: "无乳制品" },
  { value: "nut-free",   en: "Nut-free",   zh: "无坚果" },
  { value: "halal",      en: "Halal",      zh: "清真" },
  { value: "kosher",     en: "Kosher",     zh: "犹太洁食" },
  { value: "keto",       en: "Keto",       zh: "生酮" },
] as const;

export const ALLERGEN_OPTIONS = [
  { value: "peanuts",    en: "Peanuts",    zh: "花生" },
  { value: "tree nuts",  en: "Tree nuts",  zh: "坚果" },
  { value: "shellfish",  en: "Shellfish",  zh: "贝类" },
  { value: "fish",       en: "Fish",       zh: "鱼类" },
  { value: "dairy",      en: "Dairy",      zh: "乳制品" },
  { value: "eggs",       en: "Eggs",       zh: "鸡蛋" },
  { value: "gluten",     en: "Gluten",     zh: "麸质" },
  { value: "soy",        en: "Soy",        zh: "大豆" },
  { value: "sesame",     en: "Sesame",     zh: "芝麻" },
] as const;

export const ACTIVITY_LEVEL_OPTIONS = [
  { value: "sedentary",   en: "Sedentary",    zh: "久坐",    en_sub: "Little or no exercise", zh_sub: "几乎不运动" },
  { value: "light",       en: "Light",        zh: "轻度",    en_sub: "1–3 days/week",         zh_sub: "每周 1–3 天" },
  { value: "moderate",    en: "Moderate",     zh: "中度",    en_sub: "3–5 days/week",         zh_sub: "每周 3–5 天" },
  { value: "active",      en: "Active",       zh: "活跃",    en_sub: "6–7 days/week",         zh_sub: "每周 6–7 天" },
  { value: "very_active", en: "Very Active",  zh: "非常活跃",en_sub: "Twice a day",           zh_sub: "每天两次" },
] as const;

export type ActivityLevelValue = typeof ACTIVITY_LEVEL_OPTIONS[number]["value"];

/** Return the display label for an option item based on current language. */
export function optionLabel(
  item: { en: string; zh: string },
  language: string,
): string {
  return language === "zh" ? item.zh : item.en;
}
