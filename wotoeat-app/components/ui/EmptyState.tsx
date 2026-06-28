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
      <View style={[styles.iconWrap, { backgroundColor: c.primaryLight }]}>
        <Ionicons name={icon} size={iconSize} color={c.primary} />
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
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  body: { fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 8 },
});
