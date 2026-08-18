import { useEffect } from "react";
import type { ReactNode } from "react";
import type { ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";

interface Props {
  children: ReactNode;
  /** Stagger start, in ms (e.g. index * 60 in a list). */
  delay?: number;
  style?: ViewStyle;
}

/**
 * Fades and slides children up ~14px on mount (UI-4 motion pass). Driven by a
 * plain shared value instead of reanimated's entering/layout API so it behaves
 * identically on web, iOS, and Android. Mount-only: re-renders never replay it,
 * so it is safe around unmemoized children (remount via a changed key to
 * replay, e.g. a swapped meal card).
 */
export function FadeSlideIn({ children, delay = 0, style }: Props) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }),
    );
    // Shared value is stable; animate once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));
  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
}
