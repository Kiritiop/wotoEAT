import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, fontSize, radius, space } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import { useAppStore } from "@/store/useAppStore";

/**
 * Every recipe here is written by a language model, and so is the part that
 * honours allergies and dietary restrictions. `_profile_constraints_block`
 * states them as absolute constraints and tests/test_profile_constraints.py
 * pins that, but a model can still be wrong and the person reading the screen
 * may be the one who is allergic. So the warning sits next to the food rather
 * than in a terms page nobody opens.
 *
 * It escalates: with allergies saved in the profile it turns into a warning
 * that names them, because that is the user who can actually be harmed.
 */
export function AiSafetyNote({ style }: { style?: object }) {
  const c = useTheme();
  const { t } = useTranslation();
  const allergies = useAppStore((s) => s.profile.allergies) ?? [];
  const hasAllergies = allergies.filter((a) => String(a).trim()).length > 0;

  const tone = hasAllergies
    ? { bg: c.errorBg, fg: c.error, icon: "warning-outline" as const }
    : { bg: c.surfaceAlt, fg: c.textMuted, icon: "information-circle-outline" as const };

  return (
    <View
      style={[styles.wrap, { backgroundColor: tone.bg }, style]}
      accessibilityRole="alert"
    >
      <Ionicons name={tone.icon} size={14} color={tone.fg} style={styles.icon} />
      <Text style={[styles.text, { color: tone.fg }]}>
        {hasAllergies
          ? `${t("ai_allergy_warning")} ${allergies.join(", ")}.`
          : t("ai_recipe_note")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  icon: { flexShrink: 0, marginTop: 1 },
  text: { flex: 1, fontSize: fontSize.xs, lineHeight: 16 },
});
