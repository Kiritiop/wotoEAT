import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import type { ViewStyle } from "react-native";

interface Props {
  message: string | null;
  style?: ViewStyle;
}

/** Displays an inline error message with an alert icon. Renders nothing when message is null. */
export function ErrorBanner({ message, style }: Props) {
  const c = useTheme();
  if (!message) return null;
  return (
    <View
      style={[styles.banner, { backgroundColor: c.errorBg }, style]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="alert-circle-outline" size={15} color={c.error} />
      <Text style={[styles.text, { color: c.error }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 14,
    padding: 12,
  },
  text: { fontSize: 13, flex: 1 },
});
