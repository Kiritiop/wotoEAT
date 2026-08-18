import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from "react-native";
import type { ViewStyle } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, radius, space, fontSize } from "@/hooks/useTheme";

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

type Variant = "primary" | "secondary" | "ghost";

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  iconRight?: boolean;
  loading?: boolean;
  /** Optional text shown beside the spinner while loading (e.g. "Generating…"). */
  loadingLabel?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

/**
 * The single source of truth for buttons across the app. Replaces the ~8
 * near-identical "green rounded pill" style blocks that had drifted apart.
 * Haptics stay with callers (they already fire their own in onPress) so this
 * never double-buzzes or changes existing behaviour.
 *
 * - primary   → solid green, white text (the screen's main action)
 * - secondary → outlined, green text (a secondary action beside a primary)
 * - ghost     → no fill/border, muted text (low-emphasis / quiet actions)
 */
export function Button({
  label, onPress, variant = "primary", icon, iconRight,
  loading, loadingLabel, disabled, fullWidth = true, style,
}: Props) {
  const c = useTheme();
  const isDisabled = disabled || loading;

  // Press feedback (UI-4 motion pass): a quick scale dip alongside the
  // existing activeOpacity fade. pressIn/pressOut don't fire when disabled.
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const bg =
    variant === "primary" ? (isDisabled ? c.disabled : c.primary) : "transparent";
  const borderColor = variant === "secondary" ? c.primary : "transparent";
  const fg = variant === "primary" ? "#FFF" : c.primary;

  const iconEl = icon ? <Ionicons name={icon} size={18} color={fg} /> : null;

  return (
    <AnimatedTouchable
      onPress={onPress}
      onPressIn={() => { scale.value = withTiming(0.97, { duration: 80 }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 140 }); }}
      disabled={isDisabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={loading && loadingLabel ? loadingLabel : label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      style={[
        styles.base,
        { backgroundColor: bg, borderColor, borderWidth: variant === "secondary" ? 1.5 : 0 },
        fullWidth && styles.fullWidth,
        variant === "ghost" && styles.ghost,
        isDisabled && variant !== "primary" && { opacity: 0.5 },
        style,
        pressStyle,
      ]}
    >
      {loading ? (
        <>
          <ActivityIndicator size="small" color={fg} />
          {loadingLabel ? <Text style={[styles.label, { color: fg }]}>{loadingLabel}</Text> : null}
        </>
      ) : (
        <>
          {!iconRight && iconEl}
          <Text style={[styles.label, { color: fg }]}>{label}</Text>
          {iconRight && iconEl}
        </>
      )}
    </AnimatedTouchable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderRadius: radius.md,
    paddingVertical: space.md + 2, // 14
    paddingHorizontal: space.lg,
  },
  fullWidth: { width: "100%" },
  ghost: { paddingVertical: space.sm },
  label: { fontSize: fontSize.md, fontWeight: "700" },
});
