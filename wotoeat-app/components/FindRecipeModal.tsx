import { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "@/store/useAppStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme, fontSize } from "@/hooks/useTheme";
import { generateRecipeByName, saveRecipe, apiErrorMessage } from "@/services/api";
import type { Recipe, SavedRecipe } from "@/services/api";
import { translateTag } from "@/constants/filters";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";

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
  const { language, servings: globalServings, setRating } = useAppStore();
  const { t, strings } = useTranslation();
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const [dishName, setDishName] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Serving size for the preview card — scales ingredient amounts without re-generating
  const [previewServings, setPreviewServings] = useState(globalServings ?? 2);

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
    const isRegenerate = recipe != null;
    try {
      const result = await generateRecipeByName(dishName.trim(), language, globalServings ?? 2, isRegenerate);
      setRecipe(result);
      // BUG-14: use the user's requested servings, not whatever the API returned
      setPreviewServings(globalServings ?? 2);
      setPhase("preview");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(apiErrorMessage(e, t("error")));
      setPhase("idle");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  async function handleSave() {
    if (!recipe) return;
    setPhase("saving");
    const factor = previewServings / (recipe.servings || 1);
    const recipeToSave = factor === 1 ? recipe : {
      ...recipe,
      servings: previewServings,
      ingredients: recipe.ingredients.map((ing) => ({
        ...ing,
        amount: typeof ing.amount === "number" ? ing.amount * factor : ing.amount,
      })),
    };
    try {
      const saved = await saveRecipe(recipeToSave);
      // Saving is a positive taste signal — feed the TASTE PROFILE like the
      // Today card's save does.
      setRating(recipeToSave.title, "up");
      onSaved?.(saved);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleClose();
    } catch (e) {
      setError(apiErrorMessage(e, t("error")));
      setPhase("preview");
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
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
                    <Chip
                      key={s}
                      label={s}
                      active={dishName === s}
                      disabled={isGenerating}
                      onPress={() => { setDishName(s); setError(null); Haptics.selectionAsync(); }}
                    />
                  ))}
                </View>
              </>
            )}

            {/* Generate / Regenerate button */}
            <Button
              icon="sparkles"
              label={hasRecipe ? t("regenerate") : t("generate")}
              loading={isGenerating}
              loadingLabel={t("generating_recipe")}
              disabled={phase === "saving"}
              onPress={handleGenerate}
            />
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
                </View>

                {/* Serving size stepper — scales ingredient amounts without re-generating */}
                <View style={styles.servingsStepper}>
                  <Text style={[styles.servingsStepperLabel, { color: c.textMuted }]}>{t("serving_size")}</Text>
                  <TouchableOpacity
                    onPress={() => { setPreviewServings(Math.max(1, previewServings - 1)); Haptics.selectionAsync(); }}
                    disabled={previewServings <= 1}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="remove-circle-outline" size={22} color={previewServings <= 1 ? c.disabled : c.primary} />
                  </TouchableOpacity>
                  <Text style={[styles.servingsCount, { color: c.text }]}>
                    {strings.servings_people(previewServings)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => { setPreviewServings(Math.min(20, previewServings + 1)); Haptics.selectionAsync(); }}
                    disabled={previewServings >= 20}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="add-circle-outline" size={22} color={previewServings >= 20 ? c.disabled : c.primary} />
                  </TouchableOpacity>
                </View>

                {/* Ingredients preview — amounts scaled to previewServings */}
                {recipe.ingredients.length > 0 && (() => {
                  const factor = previewServings / (recipe.servings || 1);
                  return (
                  <>
                    <Text style={[styles.sectionLabel, { color: c.textPlaceholder }]}>
                      {t("ingredients_label")} ({recipe.ingredients.length})
                    </Text>
                    {recipe.ingredients.slice(0, 6).map((ing, i) => {
                      const scaledAmt = (typeof ing.amount === "number" ? ing.amount : parseFloat(String(ing.amount ?? "1")) || 1) * factor;
                      const displayAmt = scaledAmt % 1 < 0.05
                        ? Math.round(scaledAmt).toString()
                        : scaledAmt.toFixed(1);
                      return (
                      <View key={i} style={[styles.ingRow, { borderBottomColor: c.borderLight }]}>
                        <View style={[styles.ingDot, { backgroundColor: c.primary }]} />
                        <Text style={[styles.ingName, { color: c.textSecondary }]}>{ing.name}</Text>
                        <Text style={[styles.ingAmt, { color: c.textMuted }]}>{displayAmt} {ing.unit}</Text>
                      </View>
                      );
                    })}
                    {recipe.ingredients.length > 6 && (
                      <Text style={[styles.moreHint, { color: c.textPlaceholder }]}>
                        {strings.more_ingredients(recipe.ingredients.length - 6)}
                      </Text>
                    )}
                  </>
                  );
                })()}

                {/* Steps list */}
                {recipe.steps.length > 0 && (
                  <>
                    <Text style={[styles.sectionLabel, { color: c.textPlaceholder, marginTop: 8 }]}>
                      {t("steps_label")} ({recipe.steps.length})
                    </Text>
                    {recipe.steps.map((step, i) => (
                      <View key={i} style={styles.stepRow}>
                        <View style={[styles.stepNum, { backgroundColor: c.primary }]}>
                          <Text style={styles.stepNumText}>{i + 1}</Text>
                        </View>
                        <Text style={[styles.stepText, { color: c.textSecondary }]}>{step}</Text>
                      </View>
                    ))}
                  </>
                )}

                {/* Tags */}
                {(recipe.tags ?? []).length > 0 && (
                  <View style={styles.tags}>
                    {recipe.tags.slice(0, 5).map((tag) => (
                      <View key={tag} style={[styles.tag, { backgroundColor: c.chipBg }]}>
                        <Text style={[styles.tagText, { color: c.chipText }]}>{translateTag(tag, language)}</Text>
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
              <Button
                icon="bookmark-outline"
                label={t("save_to_recipes")}
                loading={phase === "saving"}
                onPress={handleSave}
              />
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
    headerTitle: { fontSize: fontSize.lg, fontWeight: "800", flex: 1 },
    content: { padding: 20, paddingBottom: 48 },
    inputSection: { gap: 14 },
    hint: { fontSize: fontSize.sm, lineHeight: 19 },
    inputRow: {
      flexDirection: "row", alignItems: "center", gap: 10,
      borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
    },
    input: { flex: 1, fontSize: fontSize.md },
    errorRow: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, padding: 10 },
    errorText: { fontSize: fontSize.sm, flex: 1 },
    suggestLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
    suggestGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    servingsStepper: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
    servingsStepperLabel: { fontSize: fontSize.xs, fontWeight: "600", flex: 1 },
    servingsCount: { fontSize: fontSize.md, fontWeight: "700", minWidth: 72, textAlign: "center" },
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
    metaChipText: { fontSize: fontSize.xs, fontWeight: "600" },
    sectionLabel: {
      fontSize: 10, fontWeight: "700", textTransform: "uppercase",
      letterSpacing: 0.5, marginTop: 4,
    },
    ingRow: {
      flexDirection: "row", alignItems: "center", gap: 8,
      paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    ingDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
    ingName: { fontSize: fontSize.sm, flex: 1 },
    ingAmt: { fontSize: fontSize.xs },
    moreHint: { fontSize: fontSize.xs, fontStyle: "italic", marginTop: 4 },
    stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
    stepNum: {
      width: 22, height: 22, borderRadius: 11,
      alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
    },
    stepNumText: { fontSize: 11, fontWeight: "800", color: "#FFF" },
    stepText: { fontSize: fontSize.sm, lineHeight: 19, flex: 1 },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    tag: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
    tagText: { fontSize: 11 },
  });
}
