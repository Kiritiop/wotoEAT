import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "@/store/useAppStore";
import { CUISINES, FLAVOUR_OPTIONS, PREP_TIME_PRESETS, DIFFICULTY_COLORS, translateTag, translateCuisine, translateDifficulty } from "@/constants/filters";
import { suggestMeals, generateRecipeByName, saveRecipe } from "@/services/api";
import type { MealSuggestion } from "@/services/api";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme } from "@/hooks/useTheme";
import FindRecipeModal from "@/components/FindRecipeModal";
import { MealCard } from "@/components/MealCard";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";

export default function DiscoverScreen() {
  const { profile, pantry, language, servings } = useAppStore();
  const { t } = useTranslation();
  const c = useTheme();

  const [meals, setMeals] = useState<MealSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MealSuggestion | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showFindRecipe, setShowFindRecipe] = useState(false);

  const [cuisines, setCuisines] = useState<string[]>([]);
  const [flavour, setFlavour] = useState<string>("");
  const [maxTime, setMaxTime] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [selectedPantryItems, setSelectedPantryItems] = useState<string[]>([]);

  const styles = makeStyles(c);

  async function handleSuggest() {
    setShowFilters(false);
    setLoading(true);
    setError(null);
    try {
      const result = await suggestMeals({
        cuisine: cuisines.length > 0 ? cuisines.join(", ") : undefined,
        max_prep_time_mins: maxTime ?? undefined,
        dietary_restrictions: profile.dietary_restrictions ?? [],
        dietary_goals: profile.health_goals ?? [],
        flavour_profile: flavour || undefined,
        serving_size: servings ?? 2,
        language,
      });
      setMeals(result.meals);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not suggest meals.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateRecipe() {
    if (!selected) return;
    setGenerating(true);
    setGenError(null);
    setSavedName(null);
    try {
      const recipe = await generateRecipeByName(selected.name, language, servings ?? 2);
      const saved = await saveRecipe(recipe);
      setSavedName(saved.title);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Could not generate recipe.");
    } finally {
      setGenerating(false);
    }
  }

  function addTag() {
    const v = tagDraft.trim();
    if (v && !tags.includes(v)) {
      setTags((prev) => [...prev, v]);
      Haptics.selectionAsync();
    }
    setTagDraft("");
  }

  const diffColor = selected ? (DIFFICULTY_COLORS[selected.difficulty] ?? "#999") : "#999";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={[styles.searchBarBtn, { borderColor: c.border, backgroundColor: c.surface }]}
            onPress={() => setShowFindRecipe(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="search-outline" size={15} color={c.textPlaceholder} />
            <Text style={[styles.searchBarText, { color: c.textPlaceholder }]}>
              {language === "zh" ? "查找或生成食谱…" : "Find or generate a recipe…"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconBtn, { borderColor: showFilters ? c.primary : c.border, backgroundColor: showFilters ? c.primary : c.surface }]}
            onPress={() => { setShowFilters((v) => !v); Haptics.selectionAsync(); }}
          >
            <Ionicons name="options-outline" size={20} color={showFilters ? "#FFF" : c.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── Filter panel ── */}
        {showFilters && (
          <View style={[styles.filterPanel, { backgroundColor: c.surface, borderColor: c.border }]}>

            {/* Cuisine */}
            <Text style={[styles.filterLabel, { color: c.textMuted }]}>{t("cuisine_pref")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {CUISINES.map((cu) => {
                  const active = cu === "Any" ? cuisines.length === 0 : cuisines.includes(cu);
                  return (
                    <TouchableOpacity
                      key={cu}
                      style={[styles.chip, { backgroundColor: active ? c.primary : c.chipBg, borderColor: active ? c.primary : c.border }]}
                      onPress={() => {
                        if (cu === "Any") setCuisines([]);
                        else setCuisines((prev) => prev.includes(cu) ? prev.filter((x) => x !== cu) : [...prev, cu]);
                        Haptics.selectionAsync();
                      }}
                    >
                      <Text style={[styles.chipText, { color: active ? "#FFF" : c.chipText }]}>
                        {translateCuisine(cu, language)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Flavour */}
            <Text style={[styles.filterLabel, { color: c.textMuted, marginTop: 10 }]}>{t("flavour_pref")}</Text>
            <View style={styles.chipRow}>
              {FLAVOUR_OPTIONS.map((f) => {
                const active = flavour === f.value;
                return (
                  <TouchableOpacity
                    key={f.value}
                    style={[styles.chip, { backgroundColor: active ? c.primary : c.chipBg, borderColor: active ? c.primary : c.border }]}
                    onPress={() => { setFlavour(active ? "" : f.value); Haptics.selectionAsync(); }}
                  >
                    <Text style={[styles.chipText, { color: active ? "#FFF" : c.chipText }]}>
                      {language === "zh" ? f.zh : f.en}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Prep time */}
            <Text style={[styles.filterLabel, { color: c.textMuted, marginTop: 10 }]}>{t("prep_time_pref")}</Text>
            <View style={styles.chipRow}>
              {PREP_TIME_PRESETS.map((p) => {
                const active = maxTime === p.value;
                return (
                  <TouchableOpacity
                    key={String(p.value)}
                    style={[styles.chip, { backgroundColor: active ? c.primary : c.chipBg, borderColor: active ? c.primary : c.border }]}
                    onPress={() => { setMaxTime(active ? null : p.value); Haptics.selectionAsync(); }}
                  >
                    <Text style={[styles.chipText, { color: active ? "#FFF" : c.chipText }]}>
                      {language === "zh" ? p.zh : p.en}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Include tags */}
            <Text style={[styles.filterLabel, { color: c.textMuted, marginTop: 10 }]}>
              {language === "zh" ? "包含标签" : "Include tags"}
            </Text>
            {tags.length > 0 && (
              <View style={[styles.chipRow, { marginBottom: 6 }]}>
                {tags.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.chip, { backgroundColor: c.primary, borderColor: c.primary }]}
                    onPress={() => { setTags((prev) => prev.filter((x) => x !== tag)); Haptics.selectionAsync(); }}
                  >
                    <Text style={[styles.chipText, { color: "#FFF" }]}>{tag}</Text>
                    <Ionicons name="close" size={12} color="#FFF" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={[styles.tagInputRow, { backgroundColor: c.inputBg, borderColor: tagDraft.trim() ? c.primary : c.border }]}>
              <Ionicons name="pricetag-outline" size={15} color={tagDraft.trim() ? c.primary : c.textPlaceholder} />
              <TextInput
                style={[styles.tagInput, { color: c.text }]}
                placeholder={language === "zh" ? "添加标签或食材…" : "Add a tag or ingredient…"}
                placeholderTextColor={c.textPlaceholder}
                value={tagDraft}
                onChangeText={setTagDraft}
                returnKeyType="done"
                autoCapitalize="none"
                onSubmitEditing={addTag}
              />
              {tagDraft.length > 0 && (
                <TouchableOpacity onPress={() => setTagDraft("")} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="close-circle" size={15} color={c.textPlaceholder} />
                </TouchableOpacity>
              )}
            </View>

            {/* Pantry picks */}
            {pantry.length > 0 && (
              <>
                <Text style={[styles.filterLabel, { color: c.textMuted, marginTop: 10 }]}>{t("from_pantry")}</Text>
                <View style={styles.chipRow}>
                  {pantry.map((item) => {
                    const active = selectedPantryItems.map((s) => s.toLowerCase()).includes(item.name.toLowerCase());
                    return (
                      <TouchableOpacity
                        key={item.name}
                        style={[styles.chip, { backgroundColor: active ? c.primary : c.chipBg, borderColor: active ? c.primary : c.border }]}
                        onPress={() => {
                          setSelectedPantryItems((prev) =>
                            active ? prev.filter((s) => s.toLowerCase() !== item.name.toLowerCase()) : [...prev, item.name]
                          );
                          Haptics.selectionAsync();
                        }}
                      >
                        <Text style={[styles.chipText, { color: active ? "#FFF" : c.chipText }]}>{item.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        )}

        <FindRecipeModal visible={showFindRecipe} onClose={() => setShowFindRecipe(false)} />

        {/* ── Suggest CTA ── */}
        <TouchableOpacity
          style={[styles.suggestBtn, { backgroundColor: loading ? c.disabled : c.primary }]}
          onPress={handleSuggest}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Ionicons name="sparkles" size={24} color="#FFF" />
              <Text style={styles.suggestBtnText}>
                {language === "zh" ? "发现菜品" : "Suggest Dishes"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <ErrorBanner message={error} />

        {/* ── Results ── */}
        {meals.length > 0 && (
          <View style={styles.results}>
            <Text style={[styles.resultsLabel, { color: c.textMuted }]}>
              {language === "zh" ? `为你推荐 ${meals.length} 道菜` : `${meals.length} dishes for you`}
            </Text>
            {meals.map((meal) => (
              <MealCard
                key={meal.name}
                meal={meal}
                onPress={() => { setSelected(meal); setSavedName(null); setGenError(null); Haptics.selectionAsync(); }}
              />
            ))}
          </View>
        )}

        {/* ── Empty state ── */}
        {meals.length === 0 && !loading && (
          <EmptyState
            icon="restaurant-outline"
            iconSize={48}
            title={language === "zh" ? "还没有推荐" : "No suggestions yet"}
            body={language === "zh" ? "点击「发现菜品」，为你推荐今天想吃的。" : "Tap Suggest Dishes and we'll find something great for you."}
          />
        )}
      </ScrollView>

      {/* ── Meal detail modal ── */}
      <Modal
        visible={!!selected}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        {selected && (
          <SafeAreaView style={[styles.modalSafe, { backgroundColor: c.bg }]}>
            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
              <Text style={[styles.modalTitle, { color: c.text }]} numberOfLines={2}>{selected.name}</Text>
              <Pressable onPress={() => setSelected(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.textMuted} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              {/* Cuisine + difficulty */}
              <View style={styles.modalMeta}>
                <Text style={[styles.modalCuisine, { color: c.primary }]}>{selected.cuisine.toUpperCase()}</Text>
                <View style={[styles.diffBadge, { backgroundColor: diffColor + "22" }]}>
                  <Text style={[styles.diffText, { color: diffColor }]}>
                    {translateDifficulty(selected.difficulty, language)}
                  </Text>
                </View>
              </View>

              {/* Stats */}
              <View style={[styles.statsRow, { backgroundColor: c.surface }]}>
                <View style={styles.statItem}>
                  <Ionicons name="flame-outline" size={18} color="#F59E0B" />
                  <Text style={[styles.statValue, { color: c.text }]}>{selected.calories_per_serving}</Text>
                  <Text style={[styles.statLabel, { color: c.textMuted }]}>{language === "zh" ? "千卡" : "kcal"}</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: c.border }]} />
                <View style={styles.statItem}>
                  <Ionicons name="time-outline" size={18} color={c.primary} />
                  <Text style={[styles.statValue, { color: c.text }]}>{selected.prep_time_mins}</Text>
                  <Text style={[styles.statLabel, { color: c.textMuted }]}>{language === "zh" ? "分钟" : "min"}</Text>
                </View>
              </View>

              {/* Description */}
              <Text style={[styles.modalDescription, { color: c.textSecondary }]}>{selected.description}</Text>

              {/* Tags */}
              {selected.tags.length > 0 && (
                <View style={styles.tagRow}>
                  {selected.tags.map((tag) => (
                    <View key={tag} style={[styles.tagChip, { backgroundColor: c.chipBg }]}>
                      <Text style={[styles.tagChipText, { color: c.chipText }]}>{translateTag(tag, language)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {genError && (
                <View style={[styles.genErrorBanner, { backgroundColor: c.errorBg }]}>
                  <Ionicons name="alert-circle-outline" size={14} color={c.error} />
                  <Text style={[styles.genErrorText, { color: c.error }]}>{genError}</Text>
                </View>
              )}

              {savedName && (
                <View style={[styles.genErrorBanner, { backgroundColor: c.successBg ?? "#F0FDF4" }]}>
                  <Ionicons name="checkmark-circle-outline" size={14} color="#16A34A" />
                  <Text style={[styles.genErrorText, { color: "#16A34A" }]}>
                    {language === "zh" ? `已保存「${savedName}」到食谱` : `Saved "${savedName}" to recipes`}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.generateBtn, { backgroundColor: savedName ? c.disabled : c.accent }]}
                onPress={handleGenerateRecipe}
                disabled={generating || !!savedName}
              >
                {generating ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <Ionicons name={savedName ? "checkmark-circle" : "document-text-outline"} size={18} color="#FFF" />
                    <Text style={styles.generateBtnText}>
                      {savedName
                        ? (language === "zh" ? "已保存" : "Saved")
                        : (language === "zh" ? "生成并保存食谱" : "Generate & Save Recipe")}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, paddingBottom: 48 },

    topBar: { flexDirection: "row", gap: 10, marginBottom: 12 },
    searchBarBtn: {
      flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
      borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    },
    searchBarText: { fontSize: 14 },
    iconBtn: {
      width: 46, height: 46, borderWidth: 1, borderRadius: 12,
      justifyContent: "center", alignItems: "center",
    },

    filterPanel: {
      borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12,
    },
    filterLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
    chip: {
      flexDirection: "row", alignItems: "center", gap: 4,
      borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
    },
    chipText: { fontSize: 13, fontWeight: "500" },
    tagInputRow: {
      flexDirection: "row", alignItems: "center", gap: 6,
      borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
    },
    tagInput: { flex: 1, fontSize: 13 },

    suggestBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 10, borderRadius: 16, paddingVertical: 16, marginBottom: 16,
    },
    suggestBtnText: { color: "#FFF", fontSize: 17, fontWeight: "700" },

    results: { gap: 0 },
    resultsLabel: { fontSize: 12, fontWeight: "600", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },

    modalSafe: { flex: 1 },
    modalHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    modalTitle: { flex: 1, fontSize: 18, fontWeight: "800", marginRight: 12 },
    modalContent: { padding: 20, paddingBottom: 48 },
    modalMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
    modalCuisine: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
    diffBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    diffText: { fontSize: 12, fontWeight: "600" },

    statsRow: {
      flexDirection: "row", borderRadius: 14, padding: 16, marginBottom: 16,
      justifyContent: "space-around",
    },
    statItem: { alignItems: "center", gap: 4 },
    statValue: { fontSize: 20, fontWeight: "800" },
    statLabel: { fontSize: 11 },
    statDivider: { width: 1 },

    modalDescription: { fontSize: 15, lineHeight: 22, marginBottom: 16 },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 20 },
    tagChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
    tagChipText: { fontSize: 12 },

    genErrorBanner: {
      flexDirection: "row", alignItems: "center", gap: 6,
      borderRadius: 10, padding: 10, marginBottom: 12,
    },
    genErrorText: { fontSize: 13, flex: 1 },
    generateBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      borderRadius: 14, paddingVertical: 15, gap: 8,
    },
    generateBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  });
}
