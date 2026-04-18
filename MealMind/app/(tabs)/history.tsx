import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getPlanHistory } from "@/services/api";
import { WeeklyCalChart } from "@/components/WeeklyCalChart";
import { useAppStore } from "@/store/useAppStore";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import type { PlanHistoryEntry, DailyPlanMeal } from "@/services/api";

const SLOT_COLOR: Record<string, string> = {
  breakfast: "#F59E0B",
  lunch: "#2E7D32",
  dinner: "#6366F1",
};

export default function HistoryScreen() {
  const { profile, authReady } = useAppStore();
  const [history, setHistory] = useState<PlanHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const c = useTheme();
  const { t } = useTranslation();

  const load = useCallback(async (isRefresh = false) => {
    if (!authReady) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const data = await getPlanHistory(7);
      setHistory(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [authReady]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Filter by search query — match date string or meal names
  const filteredHistory = search.trim()
    ? history.filter((entry) => {
        const q = search.toLowerCase();
        const dateStr = new Date(entry.date + "T00:00:00").toLocaleDateString(undefined, {
          weekday: "long", month: "long", day: "numeric",
        }).toLowerCase();
        if (dateStr.includes(q)) return true;
        return entry.plan?.meals?.some((m: DailyPlanMeal) => m.name.toLowerCase().includes(q));
      })
    : history;

  const styles = makeStyles(c);

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
        {loading && <ActivityIndicator color={c.primary} style={{ marginTop: 32 }} />}

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={15} color={c.error} />
            <Text style={[styles.errorText, { color: c.error }]}>{error}</Text>
          </View>
        )}

        {!loading && history.length > 0 && !search && (
          <WeeklyCalChart history={history} targetCalories={profile.calorie_goal ?? undefined} />
        )}

        {!loading && filteredHistory.length === 0 && !error && (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: c.successBg }]}>
              <Ionicons name="calendar-outline" size={44} color={c.primaryLight} />
            </View>
            <Text style={[styles.emptyTitle, { color: c.text }]}>{t("history_empty_title")}</Text>
            <Text style={[styles.emptyBody, { color: c.textMuted }]}>{t("history_empty_body")}</Text>
          </View>
        )}

        {filteredHistory.map((entry) => (
          <View key={entry.date} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.dateRow}>
              <Text style={[styles.dateText, { color: c.text }]}>
                {new Date(entry.date + "T00:00:00").toLocaleDateString(undefined, {
                  weekday: "long", month: "long", day: "numeric",
                })}
              </Text>
              <View style={styles.calBadge}>
                <Ionicons name="flame" size={12} color="#F59E0B" />
                <Text style={styles.calBadgeText}>{entry.total_calories} {t("calories_label")}</Text>
              </View>
            </View>

            {entry.plan?.meals?.map((meal: DailyPlanMeal) => (
              <View key={meal.slot} style={styles.mealRow}>
                <View style={[styles.slotDot, { backgroundColor: SLOT_COLOR[meal.slot] ?? c.primary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.mealSlot, { color: SLOT_COLOR[meal.slot] ?? c.primary }]}>
                    {meal.slot.charAt(0).toUpperCase() + meal.slot.slice(1)}
                  </Text>
                  <Text style={[styles.mealName, { color: c.text }]} numberOfLines={1}>{meal.name}</Text>
                  <Text style={[styles.mealMeta, { color: c.textMuted }]}>
                    {meal.calories_per_serving} {t("calories_label")} · {meal.prep_time_mins} {t("min_label")}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
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
    errorBanner: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: c.errorBg, borderRadius: 10, padding: 10, marginBottom: 12,
    },
    errorText: { fontSize: 13, flex: 1 },
    empty: { alignItems: "center", paddingVertical: 48, gap: 12 },
    emptyIcon: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginBottom: 4 },
    emptyTitle: { fontSize: 20, fontWeight: "800" },
    emptyBody: { fontSize: 14, textAlign: "center", lineHeight: 21 },
    card: {
      borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1,
      shadowColor: c.shadow, shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    dateText: { fontSize: 15, fontWeight: "700" },
    calBadge: {
      flexDirection: "row", alignItems: "center", gap: 3,
      backgroundColor: c.warningBg, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3,
    },
    calBadgeText: { fontSize: 11, fontWeight: "700", color: c.warning },
    mealRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
    slotDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
    mealSlot: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
    mealName: { fontSize: 14, fontWeight: "600", marginTop: 1 },
    mealMeta: { fontSize: 12, marginTop: 1 },
  });
}
