import { TouchableOpacity, Text, StyleSheet } from "react-native";
import type { ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, radius, space, fontSize } from "@/hooks/useTheme";

interface Props {
  label: string;
  active?: boolean;
  onPress: () => void;
  /** Show a trailing × (for removable/accumulator chips like include-tags). */
  onClose?: () => void;
  style?: ViewStyle;
}

/**
 * The single source of truth for selectable pill chips (meal-type, cuisine,
 * flavour, filter tags, pantry categories). Active = solid green; inactive =
 * soft chip surface. Replaces the duplicated chip style blocks in Today & Pantry.
 */
export function Chip({ label, active, onPress, onClose, style }: Props) {
  const c = useTheme();
  return (
    <TouchableOpacity
      onPress={onClose ?? onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={[
        styles.chip,
        {
          backgroundColor: active ? c.primary : c.chipBg,
          borderColor: active ? c.primary : c.border,
        },
        style,
      ]}
    >
      <Text style={[styles.label, { color: active ? "#FFF" : c.chipText }]}>{label}</Text>
      {onClose ? <Ionicons name="close" size={12} color={active ? "#FFF" : c.chipText} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm - 1, // 7
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  label: { fontSize: fontSize.sm, fontWeight: "600" },
});
