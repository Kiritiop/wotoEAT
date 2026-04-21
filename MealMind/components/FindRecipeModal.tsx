import { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "@/store/useAppStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme } from "@/hooks/useTheme";
import { generateRecipeByName, saveRecipe } from "@/services/api";
import type { Recipe, SavedRecipe } from "@/services/api";

const SUGGESTIONS_EN = [
  "Pasta Carbonara", "Kung Pao Chicken", "Beef Tacos",
  "Greek Salad", "Miso Soup", "Grilled Salmon",
  "Shakshuka", "Pad Thai", "Mushroom Risotto",
];
const SUGGESTIONS_ZH = [
  "宫保鸡丁", "番茄炒蛋", "红烧肉",
  "清蒸鱼", "扬州炒饭", "麻婆豆腐",
  "糖醋排骨", "蒜蓉虾", "葱油拌面",
];

type Phase = "idle" | "loading" | "preview" | "saving";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved?: (recipe: SavedRecipe) => void;
}

export default function FindRecipeModal({ visible, onClose, onSaved }: Props) {
  const { language, servings: globalServings } = useAppStore();
  const { t } = useTranslation();
  const c = useTheme();
  const styles = makeStyles(c);

  const [dishName, setDishName] = useState("");
  const [servings, setServings] = useState(globalServings ?? 2);
  const [phase, setPhase] = useState<Phase>("idle");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suggestions = language === "zh" ? SUGGESTIONS_ZH : SUGGESTIONS_EN;
  const isGenerating = phase === "loading";
  const hasRecipe = (phase === "preview" || phase === "saving") && recipe != null;

  function handleClose() {
    setDishName("");
    setRecipe(null);
    setPhase("idle");
    setError(null);
    onClose();
  }

  async function handleGenerate() {
    if (!dishName.trim()) {
      setError(t("no_dish_name"));
      return;
    }
    setPhase("loading");
    setError(null);
    try {
      const result = await generateRecipeByName(dishName.trim(), language, servings);
      setRecipe(result);
      setPhase("preview");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
      setPhase("idle");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  async function handleSave() {
    if (!recipe) return;
    setPhase("saving");
    try {
      const saved = await saveRecipe(recipe);
      onSaved?.(saved);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
      setPhase("preview");
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <View style={[styles.headerIcon, { backgroundColor: c.primaryLight }]}>
            <Ionicons name="search" size={18} color={c.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: c.text }]}>{t("find_recipe")}</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={c.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── Input section — always visible so users can change keywords ── */}
          <View style={styles.inputSection}>
            {!hasRecipe && (
              <Text style={[styles.hint, { color: c.textMuted }]}>{t("find_recipe_hint")}</Text>
            )}

            {/* Dish name input */}
            <View style={[styles.inputRow, { borderColor: c.border, backgroundColor: c.inputBg }]}>
              <Ionicons name="restaurant-outline" size={18} color={c.textMuted} />
              <TextInput
                style={[styles.input, { color: c.text }]}
                placeholder={t("dish_name_placeholder")}
                placeholderTextColor={c.textPlaceholder}
                value={dishName}
                onChangeText={(v) => { setDishName(v); setError(null); }}
                autoCapitalize="words"
                returnKeyType="search"
                onSubmitEditing={handleGenerate}
                editable={!isGenerating && phase !== "saving"}
              />
              {dishName.length > 0 && !isGenerating && phase !== "saving" && (
                <TouchableOpacity onPress={() => setDishName("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={c.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {error && !hasRecipe && (
              <View style={[styles.errorRow, { backgroundColor: c.errorBg }]}>
                <Ionicons name="alert-circle-outline" size={14} color={c.error} />
                <Text style={[styles.errorText, { color: c.error }]}>{error}</Text>
              </View>
            )}

            {/* Suggestion chips — hidden once a recipe is showing */}
            {!hasRecipe && (
              <>
                <Text style={[styles.suggestLabel, { color: c.textPlaceholder }]}>
                  {t("popular_dishes")}
                </Text>
                <View style={styles.suggestGrid}>
                  {suggestions.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.suggestChip, { backgroundColor: c.chipBg, borderColor: c.border }, dishName === s && { backgroundColor: c.primary, borderColor: c.primary }]}
                      onPress={() => { setDishName(s); setError(null); Haptics.selectionAsync(); }}
                      disabled={isGenerating}
                    >
                      <Text style={[styles.suggestText, { color: c.chipText }, dishName === s && { color: "#FFF", fontWeight: "700" }]}>
                        {s}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Servings picker */}
            <View>
              <Text style={[styles.servingsLabel, { color: c.textMuted }]}>{t("servings")}</Text>
              <View style={styles.servingsRow}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.servingsChip, { backgroundColor: c.chipBg, borderColor: c.border }, servings === n && { backgroundColor: c.primary, borderColor: c.primary }]}
                    onPress={() => { setServings(n); Haptics.selectionAsync(); }}
                    disabled={isGenerating || phase === "saving"}
                  >
                    <Text style={[styles.servingsChipText, { color: c.chipText }, servings === n && { color: "#FFF", fontWeight: "700" }]}>
                      {n}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Generate / Regenerate button */}
            <TouchableOpacity
              style={[styles.generateBtn, { backgroundColor: isGenerating || phase === "saving" ? c.disabled : c.primary }]}
              onPress={handleGenerate}
              disabled={isGenerating || phase === "saving"}
              activeOpacity={0.85}
            >
              {isGenerating ? (
                <>
                  <ActivityIndicator color="#FFF" size="small" />
                  <Text style={styles.generateBtnText}>{t("generating_recipe")}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={18} color="#FFF" />
                  <Text style={styles.generateBtnText}>
                    {hasRecipe ? t("regenerate") : t("generate")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Recipe preview ── */}
          {hasRecipe && (
            <View style={styles.previewSection}>
              <Text style={[styles.previewLabel, { color: c.textPlaceholder }]}>{t("recipe_preview")}</Text>

              {/* Recipe header */}
              <View style={[styles.recipeCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.recipeTitle, { color: c.text }]}>{recipe.title}</Text>

                <View style={styles.recipeMeta}>
                  {recipe.prep_time_mins > 0 && (
                    <View style={[styles.metaChip, { backgroundColor: c.surfaceAlt }]}>
                      <Ionicons name="time-outline" size={12} color={c.textMuted} />
                      <Text style={[styles.metaChipText, { color: c.textMuted }]}>{recipe.prep_time_mins} {t("min_label")}</Text>
                    </View>
                  )}
                  {recipe.calories_per_serving != null && (
                    <View style={[styles.metaChip, { backgroundColor: c.surfaceAlt }]}>
                      <Ionicons name="flame-outline" size={12} color={c.textMuted} />
                      <Text style={[styles.metaChipText, { color: c.textMuted }]}>{recipe.calories_per_serving} {t("calories_label")}</Text>
                    </View>
                  )}
                  {recipe.servings > 0 && (
                    <View style={[styles.metaChip, { backgroundColor: c.surfaceAlt }]}>
                      <Ionicons name="people-outline" size={12} color={c.textMuted} />
                      <Text style={[styles.metaChipText, { color: c.textMuted }]}>{recipe.servings} {t("servings")}</Text>
                    </View>
                  )}
                </View>

                {/* Ingredients preview */}
                {recipe.ingredients.length > 0 && (
                  <>
                    <Text style={[styles.sectionLabel, { color: c.textPlaceholder }]}>
                      {t("ingredients_label")} ({recipe.ingredients.length})
                    </Text>
                    {recipe.ingredients.slice(0, 6).map((ing, i) => (
                      <View key={i} style={[styles.ingRow, { borderBottomColor: c.borderLight }]}>
                        <View style={[styles.ingDot, { backgroundColor: c.primary }]} />
                        <Text style={[styles.ingName, { color: c.textSecondary }]}>{ing.name}</Text>
                        <Text style={[styles.ingAmt, { color: c.textMuted }]}>{ing.amount} {ing.unit}</Text>
                      </View>
                    ))}
                    {recipe.ingredients.length > 6 && (
                      <Text style={[styles.moreHint, { color: c.textPlaceholder }]}>
                        {language === "zh"
                          ? `+${recipe.ingredients.length - 6} 种食材`
                          : `+${recipe.ingredients.length - 6} more ingredients`}
                      </Text>
                    )}
                  </>
                )}

                {/* Steps count */}
                {recipe.steps.length > 0 && (
                  <View style={[styles.stepsRow, { borderTopColor: c.borderLight }]}>
                    <Ionicons name="list-outline" size={14} color={c.textMuted} />
                    <Text style={[styles.stepsText, { color: c.textMuted }]}>
                      {recipe.steps.length} {t("steps_label").toLowerCase()}
                    </Text>
                  </View>
                )}

                {/* Tags */}
                {(recipe.tags ?? []).length > 0 && (
                  <View style={styles.tags}>
                    {recipe.tags.slice(0, 5).map((tag) => (
                      <View key={tag} style={[styles.tag, { backgroundColor: c.chipBg }]}>
                        <Text style={[styles.tagText, { color: c.chipText }]}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {error && (
                <View style={[styles.errorRow, { backgroundColor: c.errorBg }]}>
                  <Ionicons name="alert-circle-outline" size={14} color={c.error} />
                  <Text style={[styles.errorText, { color: c.error }]}>{error}</Text>
                </View>
              )}

              {/* Save button */}
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: phase === "saving" ? c.disabled : c.primary }]}
                onPress={handleSave}
                disabled={phase === "saving"}
                activeOpacity={0.85}
              >
                {phase === "saving" ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="bookmark-outline" size={18} color="#FFF" />
                    <Text style={styles.saveBtnText}>{t("save_to_recipes")}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1 },
    header: {
      flexDirection: "row", alignItems: "center", gap: 10,
      paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    headerTitle: { fontSize: 17, fontWeight: "800", flex: 1 },
    content: { padding: 20, paddingBottom: 48 },
    inputSection: { gap: 14 },
    hint: { fontSize: 13, lineHeight: 19 },
    inputRow: {
      flexDirection: "row", alignItems: "center", gap: 10,
      borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
    },
    input: { flex: 1, fontSize: 15 },
    errorRow: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, padding: 10 },
    errorText: { fontSize: 13, flex: 1 },
    suggestLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
    suggestGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    suggestChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
    suggestText: { fontSize: 13, fontWeight: "500" },
    servingsLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 },
    servingsRow: { flexDirection: "row", gap: 8 },
    servingsChip: { width: 40, height: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    servingsChipText: { fontSize: 14, fontWeight: "600" },
    generateBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      borderRadius: 16, paddingVertical: 16, gap: 8, marginTop: 6,
      shadowColor: c.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
    },
    generateBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
    previewSection: { gap: 14, marginTop: 8 },
    previewLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
    recipeCard: {
      borderRadius: 16, borderWidth: 1, padding: 16, gap: 10,
      shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    },
    recipeTitle: { fontSize: 19, fontWeight: "800", lineHeight: 24 },
    recipeMeta: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    metaChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
    metaChipText: { fontSize: 12, fontWeight: "600" },
    sectionLabel: {
      fontSize: 10, fontWeight: "700", textTransform: "uppercase",
      letterSpacing: 0.5, marginTop: 4,
    },
    ingRow: {
      flexDirection: "row", alignItems: "center", gap: 8,
      paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    ingDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
    ingName: { fontSize: 13, flex: 1 },
    ingAmt: { fontSize: 12 },
    moreHint: { fontSize: 12, fontStyle: "italic", marginTop: 4 },
    stepsRow: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4,
    },
    stepsText: { fontSize: 13 },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    tag: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
    tagText: { fontSize: 11 },
    saveBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      borderRadius: 16, paddingVertical: 16, gap: 8,
      shadowColor: c.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
    },
    saveBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  });
}
