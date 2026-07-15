import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useTheme, radius, space, fontSize, shadows } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";

const STATUS_KEYS = ["gen_status_1", "gen_status_2", "gen_status_3"] as const;
const STATUS_INTERVAL_MS = 1700;

/**
 * Placeholder meal card shown while generation is in flight (UI-2 in the
 * roadmap): pulsing blocks mirroring the real card's anatomy plus rotating
 * status copy, so the multi-second AI wait reads as cooking, not stalling.
 * Pulse is an opacity loop — no gradients (product rule).
 */
export function SkeletonMealCard() {
  const c = useTheme();
  const { t } = useTranslation();

  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.45, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    // Shared value is stable; run the loop once for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const [statusIdx, setStatusIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setStatusIdx((i) => (i + 1) % STATUS_KEYS.length),
      STATUS_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, []);

  const styles = useMemo(() => makeStyles(c), [c]);
  const block = { backgroundColor: c.surfaceAlt };

  return (
    <View style={[styles.card, { backgroundColor: c.surface }]} accessibilityLabel={t(STATUS_KEYS[statusIdx])}>
      <Animated.View style={pulseStyle}>
        <View style={[styles.header, block]} />
        <View style={styles.body}>
          <View style={[styles.title, block]} />
          <View style={styles.chipRow}>
            <View style={[styles.chip, block]} />
            <View style={[styles.chip, styles.chipWide, block]} />
          </View>
          <View style={styles.macroRow}>
            <View style={[styles.macro, block]} />
            <View style={[styles.macro, block]} />
            <View style={[styles.macro, block]} />
          </View>
        </View>
      </Animated.View>
      <Text style={[styles.status, { color: c.textMuted }]}>{t(STATUS_KEYS[statusIdx])}</Text>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    card: {
      borderRadius: radius.lg,
      overflow: "hidden",
      marginBottom: space.lg,
      ...shadows.card,
    },
    header: { height: 44 },
    body: { padding: space.lg, gap: space.md },
    title: { height: 22, borderRadius: radius.sm, width: "62%" },
    chipRow: { flexDirection: "row", gap: space.sm },
    chip: { height: 24, borderRadius: radius.pill, width: 72 },
    chipWide: { width: 96 },
    macroRow: { flexDirection: "row", gap: space.md, marginTop: space.xs },
    macro: { height: 34, borderRadius: radius.sm, flex: 1 },
    status: {
      fontSize: fontSize.sm,
      fontWeight: "600",
      textAlign: "center",
      paddingBottom: space.lg,
    },
  });
}
