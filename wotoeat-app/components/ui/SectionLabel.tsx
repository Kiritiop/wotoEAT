import { Text, StyleSheet } from "react-native";
import type { TextStyle } from "react-native";
import { useTheme, fontSize } from "@/hooks/useTheme";

interface Props {
  children: string;
  style?: TextStyle;
}

/**
 * The small uppercase muted label used above grouped content (pantry categories,
 * shopping groups, filter sections). One source so letter-spacing/weight/colour
 * stay identical everywhere.
 */
export function SectionLabel({ children, style }: Props) {
  const c = useTheme();
  return <Text style={[styles.label, { color: c.textPlaceholder }, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
