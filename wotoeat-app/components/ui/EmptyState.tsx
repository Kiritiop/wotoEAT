import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import type { ViewStyle } from "react-native";

interface Props {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  body?: string;
  iconSize?: number;
  style?: ViewStyle;
}

/** Centered empty-state illustration with icon, title, and optional body text. */
export function EmptyState({ icon, title, body, iconSize = 44, style }: Props) {
  const c = useTheme();
  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.iconWrap, { backgroundColor: c.primary }]}>
        <Ionicons name={icon} size={iconSize} color="#FFF" />
      </View>
      <Text style={[styles.title, { color: c.text }]}>{title}</Text>
      {body ? <Text style={[styles.body, { color: c.textMuted }]}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 10,
  },
  iconWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
  title: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  body: { fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 8 },
});
