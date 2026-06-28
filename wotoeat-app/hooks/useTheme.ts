import { useColorScheme } from "react-native";
import { useAppStore } from "@/store/useAppStore";

const light = {
  // Backgrounds
  bg: "#F9FAFB",
  surface: "#FFFFFF",
  surfaceAlt: "#F3F4F6",
  inputBg: "#FAFAFA",
  // Borders
  border: "#E5E7EB",
  borderLight: "#F3F4F6",
  // Text
  text: "#1A1A1A",
  textSecondary: "#4B5563",
  textMuted: "#6B7280",
  textPlaceholder: "#9CA3AF",
  // Brand
  primary: "#2E7D32",
  primaryLight: "#DCFCE7",
  primaryText: "#166534",
  accent: "#FF6B35",
  // Status
  success: "#16A34A",
  successBg: "#F0FDF4",
  error: "#DC2626",
  errorBg: "#FEF2F2",
  warning: "#D97706",
  warningBg: "#FFFBEB",
  // Tags
  chipBg: "#F3F4F6",
  chipText: "#374151",
  // Misc
  disabled: "#9CA3AF",
  overlay: "rgba(0,0,0,0.33)",
  shadow: "#000",
  tabBar: "#FFFFFF",
  tabBorder: "#F3F4F6",
  statusBar: "dark" as "dark" | "light",
};

const dark: typeof light = {
  bg: "#0F172A",
  surface: "#1E293B",
  surfaceAlt: "#334155",
  inputBg: "#1E293B",
  border: "#334155",
  borderLight: "#1E293B",
  text: "#F1F5F9",
  textSecondary: "#CBD5E1",
  textMuted: "#94A3B8",
  textPlaceholder: "#64748B",
  primary: "#4ADE80",
  primaryLight: "#14532D",
  primaryText: "#86EFAC",
  accent: "#FB923C",
  success: "#4ADE80",
  successBg: "#14532D",
  error: "#F87171",
  errorBg: "#450A0A",
  warning: "#FCD34D",
  warningBg: "#451A03",
  chipBg: "#334155",
  chipText: "#CBD5E1",
  disabled: "#475569",
  overlay: "rgba(0,0,0,0.6)",
  shadow: "transparent",
  tabBar: "#1E293B",
  tabBorder: "#334155",
  statusBar: "light" as const,
};

export type Theme = typeof light;

/**
 * Returns the active color palette based on system color scheme.
 * Users can override via the profile language toggle in future.
 */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === "dark" ? dark : light;
}

export { light, dark };
