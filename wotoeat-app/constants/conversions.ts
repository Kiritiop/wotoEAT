/**
 * Unit conversion helpers for pantry ingredients.
 * Converts piece/count-based units to grams, and shows intuitive labels for gram amounts.
 */

interface ConversionEntry {
  pattern: RegExp;
  gramsPerPiece: number;
  labelEn: string;
  labelZh: string;
}

const PIECE_CONVERSIONS: ConversionEntry[] = [
  { pattern: /\b(egg|eggs|鸡蛋|蛋)\b/, gramsPerPiece: 60, labelEn: "egg", labelZh: "个" },
  { pattern: /\b(apple|apples|苹果)\b/, gramsPerPiece: 180, labelEn: "apple", labelZh: "个" },
  { pattern: /\b(banana|bananas|香蕉)\b/, gramsPerPiece: 100, labelEn: "banana", labelZh: "根" },
  { pattern: /\b(orange|oranges|橙|橙子)\b/, gramsPerPiece: 130, labelEn: "orange", labelZh: "个" },
  { pattern: /\b(lemon|lemons|柠檬)\b/, gramsPerPiece: 80, labelEn: "lemon", labelZh: "个" },
  { pattern: /\b(lime|limes|青柠)\b/, gramsPerPiece: 60, labelEn: "lime", labelZh: "个" },
  { pattern: /\b(onion|onions|洋葱)\b/, gramsPerPiece: 150, labelEn: "onion", labelZh: "个" },
  { pattern: /\b(potato|potatoes|马铃薯|土豆)\b/, gramsPerPiece: 180, labelEn: "potato", labelZh: "个" },
  { pattern: /\b(tomato|tomatoes|番茄|西红柿)\b/, gramsPerPiece: 120, labelEn: "tomato", labelZh: "个" },
  { pattern: /\b(carrot|carrots|胡萝卜)\b/, gramsPerPiece: 100, labelEn: "carrot", labelZh: "根" },
  { pattern: /\b(cucumber|cucumbers|黄瓜)\b/, gramsPerPiece: 300, labelEn: "cucumber", labelZh: "根" },
  { pattern: /\b(avocado|avocados|牛油果)\b/, gramsPerPiece: 170, labelEn: "avocado", labelZh: "个" },
  { pattern: /\b(mango|mangos|芒果)\b/, gramsPerPiece: 200, labelEn: "mango", labelZh: "个" },
  { pattern: /\b(pear|pears|梨)\b/, gramsPerPiece: 170, labelEn: "pear", labelZh: "个" },
  { pattern: /\b(garlic|大蒜|蒜)\b/, gramsPerPiece: 4, labelEn: "clove", labelZh: "瓣" },
];

const PIECE_UNITS = new Set(["piece", "pieces", "pcs", "pc", "个", "条", "根", "颗", "瓣"]);

/**
 * If the given unit is piece-based and the ingredient name is recognisable,
 * returns the equivalent gram weight; otherwise returns null.
 */
export function toGrams(amount: number, unit: string, name: string): number | null {
  if (!PIECE_UNITS.has(unit.toLowerCase().trim())) return null;
  const n = name.toLowerCase();
  const entry = PIECE_CONVERSIONS.find((e) => e.pattern.test(n));
  if (!entry) return null;
  return Math.round(amount * entry.gramsPerPiece);
}

/**
 * Given a gram amount and ingredient name, returns a friendly equivalent string
 * such as "≈ 3 eggs" or "≈ 3个", or null if no conversion is known.
 */
export function intuitiveHint(grams: number, name: string, language: string): string | null {
  const n = name.toLowerCase();
  const entry = PIECE_CONVERSIONS.find((e) => e.pattern.test(n));
  if (!entry || entry.gramsPerPiece <= 0) return null;
  const count = Math.round(grams / entry.gramsPerPiece);
  if (count <= 0) return null;
  if (language === "zh") {
    return `≈ ${count}${entry.labelZh}`;
  }
  const label = count === 1 ? entry.labelEn : entry.labelEn + "s";
  return `≈ ${count} ${label}`;
}
