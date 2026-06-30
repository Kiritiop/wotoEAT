import type { ReactNode } from "react";
import { View, StyleSheet } from "react-native";
import { useTheme, space } from "@/hooks/useTheme";

interface Props {
  children: ReactNode;
  /** Hide the top divider (e.g. when the content above already ends in a card). */
  noDivider?: boolean;
}

/**
 * Bottom-anchored container for a screen's single primary action so it stays in
 * the thumb zone and never scrolls away. Render it as the last child of the
 * screen's SafeAreaView, after a `flex: 1` ScrollView/List (give that list a
 * little bottom contentContainer padding so the final row clears this bar).
 */
export function PinnedBar({ children, noDivider }: Props) {
  const c = useTheme();
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: c.bg },
        !noDivider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.borderLight },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
});
