import React, { useEffect, useRef } from "react";
import { Text, TouchableOpacity, StyleSheet } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
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

  // Checkmark pop (UI-4 motion pass): the box springs up from small when an
  // item is checked. Guarded on the previous value so re-renders and unchecking
  // stay still.
  const pop = useSharedValue(1);
  const prevChecked = useRef(!!item.checked);
  useEffect(() => {
    if (item.checked && !prevChecked.current) {
      pop.value = 0.5;
      pop.value = withSpring(1, { damping: 12, stiffness: 260 });
    }
    prevChecked.current = !!item.checked;
    // Shared value is stable; only the checked transition matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.checked]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

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
        <Animated.View style={[
          styles.checkbox,
          { borderColor: c.border },
          item.checked && { backgroundColor: c.primary, borderColor: c.primary },
          popStyle,
        ]}>
          {item.checked && <Ionicons name="checkmark" size={14} color="#FFF" />}
        </Animated.View>
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
