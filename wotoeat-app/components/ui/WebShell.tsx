import type { ReactNode } from "react";
import { Platform, View, useWindowDimensions, StyleSheet } from "react-native";
import { useTheme, shadows } from "@/hooks/useTheme";

const FRAME_MAX_WIDTH = 520;
const WIDE_BREAKPOINT = 768;

/**
 * Desktop-web shell (UI-1 in the roadmap): on wide browser windows the app
 * renders as a centered phone-width column on a muted backdrop instead of
 * stretching edge to edge. Native and narrow web (real phones) pass through
 * untouched. RN Modals portal to the document body on web, so full-screen
 * overlays intentionally still cover the whole window.
 */
export function WebShell({ children }: { children: ReactNode }) {
  const c = useTheme();
  const { width } = useWindowDimensions();
  if (Platform.OS !== "web" || width < WIDE_BREAKPOINT) return <>{children}</>;
  return (
    <View style={[styles.backdrop, { backgroundColor: c.surfaceAlt }]}>
      <View style={[styles.frame, { backgroundColor: c.bg, borderColor: c.border }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center" },
  frame: {
    flex: 1,
    width: "100%",
    maxWidth: FRAME_MAX_WIDTH,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    ...shadows.float,
  },
});
