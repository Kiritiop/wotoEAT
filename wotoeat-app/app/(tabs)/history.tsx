import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { getMealHistory, generateRecipeByName, saveRecipe, apiErrorMessage } from "@/services/api";
import type { MealSuggestion, MealHistoryEntry } from "@/services/api";
import { MealCard } from "@/components/MealCard";
import { DIFFICULTY_COLORS, translateTag, translateDifficulty } from "@/constants/filters";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAppStore } from "@/store/useAppStore";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";

/** Group batches by date, merge meals, deduplicate by name within each day. */
function groupByDay(entries: MealHistoryEntry[]): { date: string; meals: MealSuggestion[] }[] {
  const map = new Map<string, Map<string, MealSuggestion>>();
  for (const entry of entries) {
    if (!map.has(entry.date)) map.set(entry.date, new Map());
    const dayMap = map.get(entry.date)!;
    for (const meal of entry.meals ?? []) {
      if (!meal?.name) continue; // skip malformed server rows
      if (!dayMap.has(meal.name)) dayMap.set(meal.name, meal);
    }
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, mealMap]) => ({ date, meals: Array.from(mealMap.values()) }));
}

export default function HistoryScreen() {
  const { authReady, language, servings: storeServings } = useAppStore();
  const locale = language === "zh" ? "zh-CN" : "en-US";
  const [entries, setEntries] = useState<MealHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MealSuggestion | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genBanner, setGenBanner] = useState<string | null>(null);
  const [genBannerIsError, setGenBannerIsError] = useState(false);
  const c = useTheme();
  const { t } = useTranslation();

  const load = useCallback(async (isRefresh = false) => {
    if (!authReady) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const data = await getMealHistory(50);
      setEntries(data);
    } catch (e) {
      setError(apiErrorMessage(e, "Could not load history."));
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [authReady]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const grouped = groupByDay(entries);

  const filtered = search.trim()
    ? grouped.map((day) => ({
        ...day,
        // meal_history rows are server JSON — older/partial rows may lack fields,
        // so guard every access or typing a search would crash the screen.
        meals: day.meals.filter((m) =>
          (m.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (m.cuisine ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (m.tags ?? []).some((tag) => tag.toLowerCase().includes(search.toLowerCase()))
        ),
      })).filter((day) => day.meals.length > 0)
    : grouped;

  async function handleGenerateRecipe() {
    if (!selected || generating) return;
    setGenerating(true);
    setGenBanner(null);
    try {
      const recipe = await generateRecipeByName(selected.name, language, storeServings || 1, true);
      await saveRecipe(recipe);
      setGenBannerIsError(false);
      setGenBanner(t("history_saved_banner"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setGenBanner(null), 3000);
    } catch {
      setGenBannerIsError(true);
      setGenBanner(t("history_failed_banner"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(() => setGenBanner(null), 3000);
    } finally {
      setGenerating(false);
    }
  }

  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Search bar */}
      <View style={[styles.searchRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Ionicons name="search-outline" size={16} color={c.textPlaceholder} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder={t("search_history")}
          placeholderTextColor={c.textPlaceholder}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={c.textPlaceholder} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={c.primary} />}
      >
        {(!authReady || loading) && <ActivityIndicator color={c.primary} style={{ marginTop: 32 }} />}

        <ErrorBanner message={error} style={{ marginBottom: 12 }} />

        {!loading && filtered.length === 0 && !error && (
          <EmptyState
            icon="calendar-outline"
            title={t("history_empty_title")}
            body={t("history_empty_body")}
          />
        )}

        {filtered.map((day) => (
          <View key={day.date} style={styles.daySection}>
            <Text style={[styles.dayHeader, { color: c.textMuted }]}>
              {new Date(day.date + "T00:00:00").toLocaleDateString(locale, {
                weekday: "long", month: "long", day: "numeric",
              })}
            </Text>
            {day.meals.map((meal) => (
              <MealCard
                key={meal.name}
                meal={meal}
                onPress={() => { setSelected(meal); Haptics.selectionAsync(); }}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Detail bottom sheet */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setSelected(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: c.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.handle, { backgroundColor: c.border }]} />

            {selected && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
                {/* Header */}
                <Text style={[styles.modalName, { color: c.text }]}>{selected.name}</Text>
                <View style={styles.modalMeta}>
                  <Text style={[styles.modalCuisine, { color: c.primary }]}>{selected.cuisine}</Text>
                  <View style={[styles.diffBadge, { backgroundColor: (DIFFICULTY_COLORS[selected.difficulty] ?? "#999") + "20" }]}>
                    <Text style={[styles.diffText, { color: DIFFICULTY_COLORS[selected.difficulty] ?? "#999" }]}>
                      {translateDifficulty(selected.difficulty, language)}
                    </Text>
                  </View>
                </View>

                {/* Stats row */}
                <View style={[styles.statsRow, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                  <View style={styles.statItem}>
                    <Ionicons name="flame-outline" size={16} color="#F59E0B" />
                    <Text style={[styles.statValue, { color: c.text }]}>{selected.calories_per_serving}</Text>
                    <Text style={[styles.statLabel, { color: c.textMuted }]}>{t("calories_label")}</Text>
                  </View>
                  <View style={[styles.statDivider, { backgroundColor: c.border }]} />
                  <View style={styles.statItem}>
                    <Ionicons name="time-outline" size={16} color={c.textMuted} />
                    <Text style={[styles.statValue, { color: c.text }]}>{selected.prep_time_mins}</Text>
                    <Text style={[styles.statLabel, { color: c.textMuted }]}>{t("min_label")}</Text>
                  </View>
                </View>

                {/* Description */}
                <Text style={[styles.modalDesc, { color: c.textSecondary }]}>{selected.description}</Text>

                {/* Tags */}
                {(selected.tags ?? []).length > 0 && (
                  <View style={styles.tagRow}>
                    {(selected.tags ?? []).map((tag) => (
                      <View key={tag} style={[styles.tag, { backgroundColor: c.chipBg }]}>
                        <Text style={[styles.tagText, { color: c.chipText }]}>{translateTag(tag, language)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Generate & Save CTA */}
                <TouchableOpacity
                  style={[styles.genBtn, { backgroundColor: generating ? c.disabled : c.primary }]}
                  onPress={handleGenerateRecipe}
                  disabled={generating}
                  activeOpacity={0.85}
                >
                  {generating ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="document-text-outline" size={18} color="#FFF" />
                      <Text style={styles.genBtnText}>
                        {t("history_generate_save")}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {genBanner && (
                  <View style={[styles.banner, { backgroundColor: genBannerIsError ? c.errorBg : c.successBg }]}>
                    <Ionicons
                      name={genBannerIsError ? "alert-circle-outline" : "checkmark-circle-outline"}
                      size={14}
                      color={genBannerIsError ? c.error : c.success}
                    />
                    <Text style={[styles.bannerText, { color: genBannerIsError ? c.error : c.success }]}>
                      {genBanner}
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    searchRow: {
      flexDirection: "row", alignItems: "center", gap: 8,
      paddingHorizontal: 16, paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    searchInput: { flex: 1, fontSize: 14, paddingVertical: 2 },
    content: { padding: 16, paddingBottom: 48 },
    daySection: { marginBottom: 20 },
    dayHeader: {
      fontSize: 12, fontWeight: "700", textTransform: "uppercase",
      letterSpacing: 0.6, marginBottom: 10,
    },
    // Modal
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
    sheet: {
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      maxHeight: "80%", paddingHorizontal: 20, paddingBottom: 8,
    },
    handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 16 },
    modalName: { fontSize: 22, fontWeight: "800", marginBottom: 6 },
    modalMeta: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
    modalCuisine: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
    diffBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    diffText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
    statsRow: {
      flexDirection: "row", borderRadius: 14, borderWidth: 1,
      padding: 14, marginBottom: 14, gap: 8,
    },
    statItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
    statDivider: { width: StyleSheet.hairlineWidth },
    statValue: { fontSize: 16, fontWeight: "800" },
    statLabel: { fontSize: 12 },
    modalDesc: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 20 },
    tag: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
    tagText: { fontSize: 12 },
    genBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 8, borderRadius: 14, paddingVertical: 14, marginBottom: 12,
    },
    genBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
    banner: {
      flexDirection: "row", alignItems: "center", gap: 6,
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    },
    bannerText: { fontSize: 13, fontWeight: "600" },
  });
}
