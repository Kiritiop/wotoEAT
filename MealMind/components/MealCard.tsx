import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DIFFICULTY_COLORS, translateDifficulty, translateTag } from "@/constants/filters";
import { useTheme } from "@/hooks/useTheme";
import { useAppStore } from "@/store/useAppStore";
import type { MealSuggestion } from "@/services/api";

interface Props {
  meal: MealSuggestion;
  onPress: () => void;
}

export function MealCard({ meal, onPress }: Props) {
  const c = useTheme();
  const { language } = useAppStore();
  const difficultyColor = DIFFICULTY_COLORS[meal.difficulty] ?? "#999";
  const difficultyLabel = translateDifficulty(meal.difficulty, language);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: c.surface, shadowColor: c.shadow }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Header row: name + difficulty badge */}
      <View style={styles.header}>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={2}>
          {meal.name}
        </Text>
        <View style={[styles.diffBadge, { backgroundColor: difficultyColor + "22" }]}>
          <Text style={[styles.diffText, { color: difficultyColor }]}>
            {difficultyLabel}
          </Text>
        </View>
      </View>

      {/* Cuisine tag */}
      <Text style={[styles.cuisine, { color: c.primary }]}>{meal.cuisine}</Text>

      {/* Description */}
      <Text style={[styles.description, { color: c.textSecondary }]} numberOfLines={2}>
        {meal.description}
      </Text>

      {/* Footer: time + calories */}
      <View style={styles.footer}>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={14} color={c.textMuted} />
          <Text style={[styles.metaText, { color: c.textMuted }]}>{meal.prep_time_mins} min</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="flame-outline" size={14} color={c.textMuted} />
          <Text style={[styles.metaText, { color: c.textMuted }]}>{meal.calories_per_serving} kcal</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={c.textPlaceholder} style={styles.arrow} />
      </View>

      {/* Tags */}
      {meal.tags.length > 0 && (
        <View style={styles.tags}>
          {meal.tags.slice(0, 3).map((tag) => (
            <View key={tag} style={[styles.tag, { backgroundColor: c.chipBg }]}>
              <Text style={[styles.tagText, { color: c.chipText }]}>{translateTag(tag, language)}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16, padding: 16, marginBottom: 12,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "flex-start", marginBottom: 4,
  },
  name: { flex: 1, fontSize: 17, fontWeight: "700", marginRight: 8 },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  diffText: { fontSize: 11, fontWeight: "600" },
  cuisine: {
    fontSize: 13, fontWeight: "600", marginBottom: 6,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  description: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  footer: { flexDirection: "row", alignItems: "center", gap: 12 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 13 },
  arrow: { marginLeft: "auto" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  tag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 11 },
});
