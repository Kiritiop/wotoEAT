import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";

interface Props {
  open: boolean;
  children: ReactNode;
}

const DURATION = 240;

/**
 * Animates its children open and closed instead of jump-cutting (UI-4).
 *
 * Height is measured from the content rather than hardcoded, so the panel can
 * grow as filters are added without anyone remembering to update a constant.
 * Driven by a plain shared value (like FadeSlideIn) rather than reanimated's
 * entering/exiting API, so web, iOS, and Android behave identically.
 *
 * Children stay mounted while closed. That is what makes the close animation
 * possible at all, and it keeps the panel's own state (drafts, scroll position)
 * alive across a collapse. `pointerEvents` is disabled when closed so the
 * hidden content can never take a tap.
 */
export function Collapsible({ open, children }: Props) {
  const [contentHeight, setContentHeight] = useState(0);
  const progress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: DURATION,
      easing: Easing.out(Easing.cubic),
    });
    // Shared value is stable; only `open` drives the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const animatedStyle = useAnimatedStyle(() => ({
    // Before the first measurement, fall back to natural height so the panel is
    // never stuck at 0 if onLayout has not fired yet.
    height: contentHeight > 0 ? progress.value * contentHeight : undefined,
    opacity: progress.value,
  }));

  function onLayout(e: LayoutChangeEvent) {
    const h = e.nativeEvent.layout.height;
    // Ignore the 0 that can arrive while clipped, and no-op on unchanged values
    // so this never loops with the height it just set.
    if (h > 0 && Math.abs(h - contentHeight) > 1) setContentHeight(h);
  }

  return (
    <Animated.View style={[{ overflow: "hidden" }, animatedStyle]} pointerEvents={open ? "auto" : "none"}>
      <View onLayout={onLayout}>{children}</View>
    </Animated.View>
  );
}
