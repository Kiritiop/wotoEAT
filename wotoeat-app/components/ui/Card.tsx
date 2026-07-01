import { View, TouchableOpacity, StyleSheet } from "react-native";
import type { ReactNode } from "react";
import type { ViewStyle } from "react-native";
import { useTheme, radius, shadows } from "@/hooks/useTheme";

interface Props {
  children: ReactNode;
  /** Makes the card tappable. */
  onPress?: () => void;
  style?: ViewStyle;
}

/**
 * A soft rounded surface used for list rows, recipe cards, and grouped settings
 * sections. Centralises the surface colour + radius + soft shadow so cards stay
 * visually identical across screens.
 */
export function Card({ children, onPress, style }: Props) {
  const c = useTheme();
  const cardStyle = [styles.card, { backgroundColor: c.surface }, style];
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={cardStyle}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    ...shadows.soft,
  },
});
