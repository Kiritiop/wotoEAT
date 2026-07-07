import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import type { ShoppingItem } from "@/services/api";

interface Props {
  item: ShoppingItem;
  onToggle?: () => void;
  showCheckbox?: boolean;
}

export function IngredientRow({ item, onToggle, showCheckbox = false }: Props) {
  const c = useTheme();

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: c.borderLight }]}
      onPress={onToggle}
      activeOpacity={onToggle ? 0.7 : 1}
      disabled={!onToggle}
      accessibilityRole={showCheckbox ? "checkbox" : undefined}
      accessibilityLabel={item.name}
      accessibilityState={showCheckbox ? { checked: !!item.checked } : undefined}
    >
      {showCheckbox && (
        <View style={[
          styles.checkbox,
          { borderColor: c.border },
          item.checked && { backgroundColor: c.primary, borderColor: c.primary },
        ]}>
          {item.checked && <Ionicons name="checkmark" size={14} color="#FFF" />}
        </View>
      )}

      <Text
        style={[
          styles.name,
          { color: c.text, flex: 1 },
          item.checked && { color: c.textPlaceholder, textDecorationLine: "line-through" },
        ]}
        numberOfLines={1}
      >
        {item.name}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
  nameBlock: { flex: 1 },
  name: { fontSize: 15 },
  calories: { fontSize: 11, marginTop: 1 },
  amount: { fontSize: 14, fontWeight: "500" },
});
