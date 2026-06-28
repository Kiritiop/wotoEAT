import { useColorScheme } from "react-native";

/**
 * wotoEAT design system — warm, friendly, wholesome.
 * A cheerful home-kitchen palette: cream paper backgrounds, white cards,
 * fresh green primary with amber / coral / indigo accents.
 */
const light = {
  // Backgrounds
  bg: "#FBF7F0", // warm cream paper
  surface: "#FFFFFF",
  surfaceAlt: "#F5EFE6",
  inputBg: "#F8F3EB",
  // Borders
  border: "#ECE3D5",
  borderLight: "#F3ECDF",
  // Text (warm-tinted neutrals)
  text: "#221E18",
  textSecondary: "#574E44",
  textMuted: "#857A6B",
  textPlaceholder: "#B0A493",
  // Brand
  primary: "#16A34A", // fresh green
  primaryLight: "#DCFCE7",
  primaryText: "#15803D",
  accent: "#F59E0B", // warm amber
  accentBg: "#FEF3C7",
  coral: "#F87171",
  coralBg: "#FEE4E2",
  indigo: "#6366F1",
  indigoBg: "#E0E7FF",
  // Meal-slot accents (breakfast / lunch / dinner)
  slotBreakfast: "#F59E0B",
  slotLunch: "#16A34A",
  slotDinner: "#6366F1",
  // Status
  success: "#16A34A",
  successBg: "#ECFDF3",
  error: "#EF4444",
  errorBg: "#FEF2F2",
  warning: "#D97706",
  warningBg: "#FFFBEB",
  // Tags
  chipBg: "#F3ECE0",
  chipText: "#574E44",
  // Misc
  disabled: "#C5BBAC",
  overlay: "rgba(34,30,24,0.45)",
  shadow: "#2A2118", // warm shadow tint
  tabBar: "#FFFFFF",
  tabBorder: "#F1E9DB",
  statusBar: "dark" as "dark" | "light",
};

const dark: typeof light = {
  bg: "#17130F",
  surface: "#221C17",
  surfaceAlt: "#2C251F",
  inputBg: "#221C17",
  border: "#3A302A",
  borderLight: "#2C251F",
  text: "#F6F0E8",
  textSecondary: "#D8CCBE",
  textMuted: "#A89A89",
  textPlaceholder: "#7C6F60",
  primary: "#4ADE80",
  primaryLight: "#14532D",
  primaryText: "#86EFAC",
  accent: "#FBBF24",
  accentBg: "#3A2A12",
  coral: "#FB7185",
  coralBg: "#3A1A1F",
  indigo: "#818CF8",
  indigoBg: "#1E1B4B",
  slotBreakfast: "#FBBF24",
  slotLunch: "#4ADE80",
  slotDinner: "#818CF8",
  success: "#4ADE80",
  successBg: "#14361F",
  error: "#F87171",
  errorBg: "#3A1A1A",
  warning: "#FBBF24",
  warningBg: "#3A2A12",
  chipBg: "#2C251F",
  chipText: "#D8CCBE",
  disabled: "#5A4F45",
  overlay: "rgba(0,0,0,0.6)",
  shadow: "transparent",
  tabBar: "#221C17",
  tabBorder: "#3A302A",
  statusBar: "light" as const,
};

export type Theme = typeof light;

/** Corner radii — soft, rounded, friendly. */
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;

/** Spacing scale (4pt base). */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Type scale. */
export const fontSize = {
  xs: 12,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  display: 32,
} as const;

/** Soft shadow presets (warm-tinted). Spread into a style. */
export const shadows = {
  soft: {
    shadowColor: "#2A2118",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  card: {
    shadowColor: "#2A2118",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  float: {
    shadowColor: "#2A2118",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

/**
 * Returns the active color palette based on system color scheme.
 */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === "dark" ? dark : light;
}

export { light, dark };
