/**
 * A card representing one parsed recipe — shown on the Meal Detail screen.
 * Lets the user preview ingredients and add the recipe to their shopping list.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Recipe } from "@/services/api";
import { useAppStore } from "@/store/useAppStore";
import { useTheme } from "@/hooks/useTheme";

interface Props {
  recipe: Recipe;
}

export function RecipeSource({ recipe }: Props) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  const { addRecipe, removeRecipe, selectedRecipes } = useAppStore();
  const isAdded = selectedRecipes.some((r) => r.title === recipe.title);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  }

  function handleAddRemove() {
    if (isAdded) {
      removeRecipe(recipe.title);
    } else {
      addRecipe(recipe);
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      {/* Header */}
      <TouchableOpacity style={styles.header} onPress={toggle} activeOpacity={0.8}>
        <View style={styles.headerLeft}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
            {recipe.title}
          </Text>
          {recipe.source_name && (
            <Text style={[styles.source, { color: c.primary }]}>{recipe.source_name}</Text>
          )}
          <View style={styles.meta}>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={13} color={c.textMuted} />
              <Text style={[styles.metaText, { color: c.textMuted }]}>{recipe.prep_time_mins} min</Text>
            </View>
            {recipe.calories_per_serving != null && (
              <View style={styles.metaItem}>
                <Ionicons name="flame-outline" size={13} color={c.textMuted} />
                <Text style={[styles.metaText, { color: c.textMuted }]}>
                  {recipe.calories_per_serving} kcal
                </Text>
              </View>
            )}
            <Text style={[styles.metaText, { color: c.textMuted }]}>Serves {recipe.servings}</Text>
          </View>
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={c.textPlaceholder}
        />
      </TouchableOpacity>

      {/* Expandable ingredient list */}
      {open && (
        <View style={styles.body}>
          {recipe.warnings.length > 0 && (
            <View style={[styles.warning, { backgroundColor: c.warningBg }]}>
              <Ionicons name="warning-outline" size={14} color={c.warning} />
              <Text style={[styles.warningText, { color: c.warning }]}>
                {recipe.warnings.join(" · ")}
              </Text>
            </View>
          )}
          <Text style={[styles.sectionLabel, { color: c.textPlaceholder }]}>Ingredients</Text>
          {recipe.ingredients.map((ing, i) => (
            <View key={i} style={[styles.ingredientRow, { borderBottomColor: c.borderLight }]}>
              <Text style={[styles.ingredientName, { color: c.textSecondary }]}>{ing.name}</Text>
              <Text style={[styles.ingredientAmount, { color: c.textMuted }]}>
                {ing.amount} {ing.unit}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Add to shopping list button */}
      <TouchableOpacity
        style={[
          styles.addBtn,
          { borderTopColor: c.borderLight },
          isAdded && { backgroundColor: c.successBg },
        ]}
        onPress={handleAddRemove}
      >
        <Ionicons
          name={isAdded ? "checkmark-circle" : "add-circle-outline"}
          size={18}
          color={isAdded ? c.primary : c.accent}
        />
        <Text style={[styles.addBtnText, { color: isAdded ? c.primary : c.accent }]}>
          {isAdded ? "Added to list" : "Add to shopping list"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, marginBottom: 12, overflow: "hidden", borderWidth: 1 },
  header: { flexDirection: "row", alignItems: "flex-start", padding: 14, gap: 12 },
  headerLeft: { flex: 1 },
  title: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  source: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  meta: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontSize: 12 },
  body: { paddingHorizontal: 14, paddingBottom: 4 },
  warning: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 8, padding: 8, marginBottom: 10,
  },
  warningText: { fontSize: 12, flex: 1 },
  sectionLabel: {
    fontSize: 11, fontWeight: "700", textTransform: "uppercase",
    letterSpacing: 0.5, marginBottom: 8,
  },
  ingredientRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ingredientName: { fontSize: 14, flex: 1 },
  ingredientAmount: { fontSize: 14, fontWeight: "500" },
  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, padding: 12, borderTopWidth: StyleSheet.hairlineWidth,
  },
  addBtnText: { fontSize: 14, fontWeight: "600" },
});
