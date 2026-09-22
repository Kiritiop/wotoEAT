import type { ReactNode } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, fontSize, space } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  /** Title variant — a single screen title (Pantry, Recipes, Profile…). */
  title?: string;
  /** Greeting variant — a friendly line + muted subline (Today). Overrides title. */
  greeting?: string;
  subtitle?: string;
  /** Optional right-aligned action slot (icon buttons, etc.). */
  right?: ReactNode;
  /** When set, shows a back chevron in place of the brand mark. */
  onBack?: () => void;
}

/**
 * Consistent in-app screen header used across every page so the shell feels
 * cohesive: a small brand mark (the app logo) or a back chevron on the left,
 * the screen title or a greeting beside it, and an optional action slot on the
 * right. Render it inside the screen's existing SafeAreaView (it adds no top
 * inset of its own). Non-interactive titles sit at the top, out of the thumb
 * zone, per mobile UX guidance.
 */
export function ScreenHeader({ title, greeting, subtitle, right, onBack }: Props) {
  const c = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.backBtn, { backgroundColor: c.surfaceAlt }]}
            accessibilityRole="button"
            accessibilityLabel={t("back")}
          >
            <Ionicons name="chevron-back" size={22} color={c.text} />
          </TouchableOpacity>
        ) : (
          <Image source={require("@/assets/logo.png")} style={styles.brandMark} resizeMode="contain"
            alt="" accessibilityElementsHidden importantForAccessibility="no" />
        )}
        <View style={styles.titles}>
          {greeting ? (
            <>
              <Text style={[styles.greeting, { color: c.text }]} numberOfLines={1} accessibilityRole="header">{greeting}</Text>
              {subtitle ? (
                <Text style={[styles.subtitle, { color: c.textMuted }]} numberOfLines={1}>{subtitle}</Text>
              ) : null}
            </>
          ) : (
            <Text style={[styles.title, { color: c.text }]} numberOfLines={1} accessibilityRole="header">{title}</Text>
          )}
        </View>
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    gap: space.md,
  },
  left: { flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1, minWidth: 0 },
  brandMark: { width: 32, height: 32 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  titles: { flex: 1, minWidth: 0 },
  title: { fontSize: fontSize.xl, fontWeight: "800", letterSpacing: -0.3 },
  greeting: { fontSize: fontSize.lg, fontWeight: "800", letterSpacing: -0.2 },
  subtitle: { fontSize: fontSize.sm, marginTop: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
