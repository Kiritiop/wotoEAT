/**
 * Meal Detail screen.
 *
 * Receives the MealSuggestion object as a JSON param from the Discover screen.
 * Shows the meal info and lets the user parse recipes from any URL.
 * Parsed recipes appear as RecipeSource cards — tap to expand, add to list.
 */
import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { RecipeSource } from "@/components/RecipeSource";
import { DIFFICULTY_COLORS, translateDifficulty } from "@/constants/filters";
import { parseRecipe, saveRecipe } from "@/services/api";
import { useAppStore } from "@/store/useAppStore";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import type { MealSuggestion, Recipe } from "@/services/api";

// Sites to suggest searching for this meal
const RECIPE_SITES = [
  { name: "AllRecipes", searchUrl: "https://www.allrecipes.com/search?q=" },
  { name: "BBC Good Food", searchUrl: "https://www.bbcgoodfood.com/search?q=" },
  { name: "Serious Eats", searchUrl: "https://www.seriouseats.com/search?q=" },
  { name: "Tasty", searchUrl: "https://tasty.co/search?q=" },
];

export default function MealDetailScreen() {
  const params = useLocalSearchParams<{ id: string; meal: string }>();
  const router = useRouter();
  const c = useTheme();
  const { t } = useTranslation();
  const { selectedRecipes, language } = useAppStore();

  const MEAL_FALLBACK: MealSuggestion = { name: "Unknown Meal", cuisine: "", description: "", prep_time_mins: 0, calories_per_serving: 0, difficulty: "easy", tags: [] };
  let meal: MealSuggestion;
  try {
    meal = params.meal ? (JSON.parse(params.meal) as MealSuggestion) : MEAL_FALLBACK;
  } catch {
    meal = MEAL_FALLBACK;
  }

  const [url, setUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedRecipes, setParsedRecipes] = useState<Recipe[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const difficultyColor = DIFFICULTY_COLORS[meal.difficulty] ?? "#999";
  const difficultyLabel = translateDifficulty(meal.difficulty, language);

  async function handleParse() {
    if (!url.trim()) return;
    if (!url.startsWith("http")) {
      setParseError(t("parse_invalid_url"));
      return;
    }
    setParseError(null);
    setParsing(true);
    try {
      const recipe = await parseRecipe(url.trim());
      recipe.source_url = url.trim();
      try {
        recipe.source_name = new URL(url.trim()).hostname.replace("www.", "");
      } catch {}
      setParsedRecipes((prev) => [recipe, ...prev]);
      setUrl("");
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : "Could not parse recipe from that URL.");
    } finally {
      setParsing(false);
    }
  }

  async function handleSaveAll() {
    if (parsedRecipes.length === 0) return;
    setSaveStatus("idle");
    setSaveError(null);
    try {
      await Promise.all(parsedRecipes.map((r) => saveRecipe(r)));
      setSaveStatus("saved");
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Could not save.");
      setSaveStatus("error");
    }
  }

  const styles = makeStyles(c);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Meal header */}
      <View style={[styles.mealHeader, { backgroundColor: c.surface, shadowColor: c.shadow }]}>
        <View style={styles.cuisineRow}>
          <Text style={[styles.cuisine, { color: c.primary }]}>{meal.cuisine}</Text>
          <View style={[styles.diffBadge, { backgroundColor: difficultyColor + "22" }]}>
            <Text style={[styles.diffText, { color: difficultyColor }]}>
              {difficultyLabel}
            </Text>
          </View>
        </View>
        <Text style={[styles.mealName, { color: c.text }]}>{meal.name}</Text>
        <Text style={[styles.description, { color: c.textSecondary }]}>{meal.description}</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={16} color={c.textMuted} />
            <Text style={[styles.metaText, { color: c.textMuted }]}>{meal.prep_time_mins} {t("min_label")}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="flame-outline" size={16} color={c.textMuted} />
            <Text style={[styles.metaText, { color: c.textMuted }]}>{meal.calories_per_serving} {t("calories_label")} {t("per_serving")}</Text>
          </View>
        </View>
      </View>

      {/* Recipe sites quick links */}
      <Text style={[styles.sectionTitle, { color: c.text }]}>{t("find_recipes_online")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sitesRow}>
        {RECIPE_SITES.map((site) => (
          <TouchableOpacity
            key={site.name}
            style={[styles.siteChip, { backgroundColor: c.successBg, borderColor: c.primaryLight }]}
            onPress={() =>
              Linking.openURL(site.searchUrl + encodeURIComponent(meal.name))
            }
          >
            <Ionicons name="open-outline" size={14} color={c.primary} />
            <Text style={[styles.siteChipText, { color: c.primary }]}>{site.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* URL parser */}
      <Text style={[styles.sectionTitle, { color: c.text }]}>{t("parse_url_hint")}</Text>
      {parseError && (
        <View style={[styles.errorBanner, { backgroundColor: c.errorBg }]}>
          <Ionicons name="alert-circle-outline" size={15} color={c.error} />
          <Text style={[styles.errorText, { color: c.error }]}>{parseError}</Text>
        </View>
      )}
      <View style={styles.parseRow}>
        <TextInput
          style={[styles.urlInput, { borderColor: c.border, backgroundColor: c.surface, color: c.text }]}
          placeholder={t("parse_url_placeholder")}
          placeholderTextColor={c.textPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={url}
          onChangeText={setUrl}
        />
        <TouchableOpacity
          style={[styles.parseBtn, { backgroundColor: c.primary }, (parsing || !url.trim()) && { backgroundColor: c.disabled }]}
          onPress={handleParse}
          disabled={parsing || !url.trim()}
        >
          {parsing ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Ionicons name="cloud-download-outline" size={20} color="#FFF" />
          )}
        </TouchableOpacity>
      </View>

      {/* Parsed recipes */}
      {parsedRecipes.length > 0 && (
        <View>
          <View style={styles.parsedHeader}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>
              {t("parse")} ({parsedRecipes.length})
            </Text>
            <TouchableOpacity onPress={handleSaveAll}>
              <Text style={[styles.saveAllText, { color: c.primary }]}>
                {saveStatus === "saved" ? `${t("saved")}!` : t("save_to_recipes")}
              </Text>
            </TouchableOpacity>
          </View>
          {saveStatus === "error" && saveError && (
            <View style={[styles.errorBanner, { backgroundColor: c.errorBg }]}>
              <Ionicons name="alert-circle-outline" size={15} color={c.error} />
              <Text style={[styles.errorText, { color: c.error }]}>{saveError}</Text>
            </View>
          )}
          {parsedRecipes.map((recipe, i) => (
            <RecipeSource key={i} recipe={recipe} />
          ))}
        </View>
      )}

      {/* Go to shopping list CTA */}
      {selectedRecipes.length > 0 && (
        <TouchableOpacity
          style={[styles.shoppingCta, { backgroundColor: c.accent }]}
          onPress={() => router.push("/(tabs)/shopping")}
        >
          <Ionicons name="cart" size={18} color="#FFF" />
          <Text style={styles.shoppingCtaText}>
            {t("generate_list")} ({selectedRecipes.length})
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, paddingBottom: 48 },
    mealHeader: {
      borderRadius: 16, padding: 18, marginBottom: 20,
      shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6,
      elevation: 2,
    },
    cuisineRow: {
      flexDirection: "row", justifyContent: "space-between",
      alignItems: "center", marginBottom: 6,
    },
    cuisine: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
    diffBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    diffText: { fontSize: 12, fontWeight: "600" },
    mealName: { fontSize: 24, fontWeight: "800", marginBottom: 8, lineHeight: 30 },
    description: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
    metaRow: { flexDirection: "row", gap: 16 },
    metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
    metaText: { fontSize: 14 },
    sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 10, marginTop: 4 },
    sitesRow: { marginBottom: 20 },
    siteChip: {
      flexDirection: "row", alignItems: "center", gap: 5,
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
      marginRight: 8, borderWidth: 1,
    },
    siteChipText: { fontSize: 13, fontWeight: "600" },
    parseRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
    urlInput: {
      flex: 1, borderWidth: 1, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 14,
    },
    parseBtn: {
      width: 50, height: 50, borderRadius: 12,
      alignItems: "center", justifyContent: "center",
    },
    errorBanner: {
      flexDirection: "row", alignItems: "center", gap: 6,
      borderRadius: 10, padding: 10, marginBottom: 10,
    },
    errorText: { fontSize: 13, flex: 1 },
    parsedHeader: {
      flexDirection: "row", justifyContent: "space-between",
      alignItems: "center", marginBottom: 6,
    },
    saveAllText: { fontSize: 14, fontWeight: "700" },
    shoppingCta: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      borderRadius: 14, paddingVertical: 15, marginTop: 24, gap: 8,
    },
    shoppingCtaText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  });
}
