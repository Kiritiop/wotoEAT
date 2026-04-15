import { useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Share,
} from "react-native";
// Cuisine presets — user taps to fill the cuisine field
const CUISINES = ["Chinese", "Japanese", "Korean", "Italian", "Mexican", "Indian", "Thai", "Mediterranean", "American", "French"];
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "@/store/useAppStore";
import { getDailyPlan, generatePlanShoppingList, swapMeal } from "@/services/api";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme } from "@/hooks/useTheme";
import type { Rating } from "@/store/useAppStore";
import type { DailyMealPlan, DailyPlanMeal } from "@/services/api";

type MealRating = Rating; // alias

const SLOT_COLOUR: Record<string, string> = {
  breakfast: "#F59E0B",
  lunch: "#2E7D32",
  dinner: "#6366F1",
};
const SLOT_ICON: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  breakfast: "sunny",
  lunch: "partly-sunny",
  dinner: "moon",
};
const DIFFICULTY_COLOUR: Record<string, string> = {
  easy: "#16A34A",
  medium: "#D97706",
  hard: "#DC2626",
};

function MealSlotCard({
  meal,
  onRate,
  onSwap,
  swapping,
  onFindRecipe,
}: {
  meal: DailyPlanMeal;
  onRate: (r: MealRating) => void;
  onSwap: () => void;
  swapping: boolean;
  onFindRecipe: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const c = useTheme();
  const { t } = useTranslation();
  const accent = SLOT_COLOUR[meal.slot] ?? "#2E7D32";
  const icon = SLOT_ICON[meal.slot] ?? "restaurant";

  return (
    <View style={[cardStyles.card, { backgroundColor: c.surface }]}>
      {/* Slot header */}
      <View style={[cardStyles.slotHeader, { backgroundColor: accent + "18" }]}>
        <View style={[cardStyles.slotIconWrap, { backgroundColor: accent }]}>
          <Ionicons name={icon} size={16} color="#FFF" />
        </View>
        <Text style={[cardStyles.slotLabel, { color: accent }]}>
          {meal.slot === "breakfast" ? t("breakfast") : meal.slot === "lunch" ? t("lunch") : t("dinner")}
        </Text>
        <View style={cardStyles.slotMeta}>
          <Ionicons name="flame-outline" size={13} color={c.textMuted} />
          <Text style={[cardStyles.metaText, { color: c.textMuted }]}>{meal.calories_per_serving} kcal</Text>
          <Ionicons name="time-outline" size={13} color={c.textMuted} style={{ marginLeft: 8 }} />
          <Text style={[cardStyles.metaText, { color: c.textMuted }]}>{meal.prep_time_mins} min</Text>
        </View>
      </View>

      <View style={cardStyles.body}>
        <Text style={[cardStyles.name, { color: c.text }]}>{meal.name}</Text>
        <View style={cardStyles.rowMeta}>
          <Text style={[cardStyles.cuisine, { color: c.textMuted }]}>{meal.cuisine}</Text>
          <View style={[cardStyles.diffBadge, { backgroundColor: (DIFFICULTY_COLOUR[meal.difficulty] ?? "#999") + "20" }]}>
            <Text style={[cardStyles.diffText, { color: DIFFICULTY_COLOUR[meal.difficulty] ?? "#999" }]}>
              {meal.difficulty}
            </Text>
          </View>
        </View>

        {/* Components */}
        <View style={cardStyles.compsRow}>
          <CompChip icon="leaf" label={meal.components.vegetable} color="#16A34A" />
          <CompChip icon="fish" label={meal.components.protein} color="#2563EB" />
          <CompChip icon="ellipse" label={meal.components.staple} color="#D97706" />
        </View>

        {/* Pantry items */}
        {meal.uses_pantry_items.length > 0 && (
          <View style={[cardStyles.pantryRow, { backgroundColor: c.successBg }]}>
            <Ionicons name="checkmark-circle" size={13} color="#16A34A" />
            <Text style={cardStyles.pantryText}>
              {t("using_from_pantry")} {meal.uses_pantry_items.join(", ")}
            </Text>
          </View>
        )}

        {/* Dislike (swap) + expand buttons */}
        <View style={cardStyles.ratingRow}>
          <TouchableOpacity
            style={[cardStyles.dislikeBtn, { borderColor: swapping ? c.error : c.border, backgroundColor: swapping ? c.errorBg : "transparent" }]}
            onPress={() => {
              onRate("down");
              onSwap();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }}
            disabled={swapping}
          >
            {swapping ? (
              <ActivityIndicator size={13} color={c.error} />
            ) : (
              <>
                <Ionicons name="thumbs-down-outline" size={14} color={c.textMuted} />
                <Text style={[cardStyles.dislikeText, { color: c.textMuted }]}>{t("swap_meal")}</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={cardStyles.expandBtn}
            onPress={() => { setExpanded((e) => !e); Haptics.selectionAsync(); }}
          >
            <Text style={[cardStyles.expandText, { color: c.textMuted }]}>
              {expanded ? t("less") : t("more_details")}
            </Text>
            <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={c.textMuted} />
          </TouchableOpacity>
        </View>

        {expanded && (
          <View style={cardStyles.expandBody}>
            <Text style={[cardStyles.description, { color: c.textSecondary }]}>{meal.description}</Text>

            {(meal.ingredients ?? []).length > 0 && (
              <View>
                <Text style={[cardStyles.recipeLabel, { color: c.text }]}>Ingredients</Text>
                {(meal.ingredients ?? []).map((ing, i) => (
                  <View key={i} style={cardStyles.ingRow}>
                    <View style={[cardStyles.ingDot, { backgroundColor: c.primary }]} />
                    <Text style={[cardStyles.ingText, { color: c.textSecondary }]}>{ing}</Text>
                  </View>
                ))}
              </View>
            )}

            {(meal.steps ?? []).length > 0 && (
              <View>
                <Text style={[cardStyles.recipeLabel, { color: c.text }]}>Steps</Text>
                {(meal.steps ?? []).map((step, i) => (
                  <View key={i} style={cardStyles.stepRow}>
                    <View style={[cardStyles.stepNum, { backgroundColor: c.primary }]}>
                      <Text style={cardStyles.stepNumText}>{i + 1}</Text>
                    </View>
                    <Text style={[cardStyles.stepText, { color: c.textSecondary }]}>{step}</Text>
                  </View>
                ))}
              </View>
            )}

            {(meal.tags ?? []).length > 0 && (
              <View style={cardStyles.tags}>
                {(meal.tags ?? []).map((tag) => (
                  <View key={tag} style={[cardStyles.tag, { backgroundColor: c.chipBg }]}>
                    <Text style={[cardStyles.tagText, { color: c.textMuted }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[cardStyles.findBtn, { backgroundColor: c.successBg, borderColor: c.primaryLight }]}
              onPress={onFindRecipe}
            >
              <Ionicons name="search-outline" size={14} color={c.primary} />
              <Text style={[cardStyles.findBtnText, { color: c.primary }]}>Find recipes online</Text>
              <Ionicons name="chevron-forward" size={14} color={c.primary} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

function CompChip({ icon, label, color }: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  color: string;
}) {
  return (
    <View style={[cardStyles.compChip, { borderColor: color + "40", backgroundColor: color + "10" }]}>
      <Ionicons name={icon} size={11} color={color} />
      <Text style={[cardStyles.compText, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export default function TodayScreen() {
  const { profile, pantry, dailyPlan, setDailyPlan, clearDailyPlan, setShoppingList, language, ratings, setRating } = useAppStore();
  const router = useRouter();
  const { t } = useTranslation();
  const c = useTheme();
  const [loading, setLoading] = useState(false);
  const [shopping, setShopping] = useState(false);
  const [swappingSlot, setSwappingSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cuisine, setCuisine] = useState("");
  const [maxTime, setMaxTime] = useState("");

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const { plan } = await getDailyPlan(
        profile, pantry,
        cuisine.trim() || undefined,
        maxTime ? parseInt(maxTime) : undefined,
        language,
        Object.keys(ratings).length > 0 ? ratings : undefined,
      );
      setDailyPlan(plan);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate plan.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSwap(slot: "breakfast" | "lunch" | "dinner") {
    if (!dailyPlan) return;
    setSwappingSlot(slot);
    setError(null);
    try {
      const newMeal = await swapMeal(slot, dailyPlan as DailyMealPlan, profile, pantry, language);
      const updatedMeals = dailyPlan.meals.map((m) => m.slot === slot ? newMeal : m);
      const newTotal = updatedMeals.reduce((sum, m) => sum + (m.calories_per_serving ?? 0), 0);
      setDailyPlan({ ...dailyPlan, meals: updatedMeals, total_calories: newTotal });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not swap meal.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSwappingSlot(null);
    }
  }

  async function handleShare() {
    if (!dailyPlan) return;
    const lines = dailyPlan.meals.map(
      (m) => `${m.slot.charAt(0).toUpperCase() + m.slot.slice(1)}: ${m.name} (${m.calories_per_serving} kcal, ${m.prep_time_mins} min)`
    );
    const text = [
      "My MealMind Plan",
      "",
      ...lines,
      "",
      `Total: ${dailyPlan.total_calories} kcal`,
    ].join("\n");
    try {
      await Share.share({ message: text });
    } catch {
      // User dismissed share sheet
    }
  }

  async function handleShopForPlan() {
    if (!dailyPlan) return;
    setShopping(true);
    setError(null);
    try {
      const list = await generatePlanShoppingList(dailyPlan, pantry, language);
      setShoppingList(list);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      router.push("/(tabs)/shopping");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate shopping list.");
    } finally {
      setShopping(false);
    }
  }

  const styles = makeStyles(c);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.heading}>{t("todays_plan")}</Text>
          <Text style={styles.subheading}>{t("plan_subtitle")}</Text>
        </View>

        {/* Filters card */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.filterRow}>
            <View style={styles.filterField}>
              <Text style={[styles.filterLabel, { color: c.textMuted }]}>{t("cuisine_pref")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {CUISINES.map((cu) => {
                    const active = cuisine.trim().toLowerCase() === cu.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={cu}
                        style={[styles.cuisineChip, { backgroundColor: c.chipBg, borderColor: c.border }, active && { backgroundColor: c.primary, borderColor: c.primary }]}
                        onPress={() => { setCuisine(active ? "" : cu); Haptics.selectionAsync(); }}
                      >
                        <Text style={[styles.cuisineChipText, { color: c.chipText }, active && { color: "#FFF", fontWeight: "700" }]}>{cu}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
              <TextInput
                style={[styles.filterInput, { borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
                placeholder={t("cuisine_placeholder")}
                placeholderTextColor={c.textPlaceholder}
                value={cuisine}
                onChangeText={setCuisine}
                autoCapitalize="words"
              />
            </View>
            <View style={styles.filterField}>
              <Text style={[styles.filterLabel, { color: c.textMuted }]}>{t("max_prep")}</Text>
              <TextInput
                style={[styles.filterInput, { borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
                placeholder="e.g. 30"
                placeholderTextColor={c.textPlaceholder}
                value={maxTime}
                onChangeText={setMaxTime}
                keyboardType="number-pad"
              />
            </View>
          </View>

          {error && (
            <View style={[styles.errorBanner, { backgroundColor: c.errorBg }]}>
              <Ionicons name="alert-circle-outline" size={15} color={c.error} />
              <Text style={[styles.errorText, { color: c.error }]}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.generateBtn, { backgroundColor: c.primary }, loading && styles.btnDisabled]}
            onPress={handleGenerate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Ionicons name="sparkles" size={17} color="#FFF" />
                <Text style={styles.generateBtnText}>
                  {dailyPlan ? t("regenerate_plan") : t("generate_plan")}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Plan */}
        {dailyPlan && (
          <View style={styles.planSection}>
            {/* Total calories + share + clear */}
            <View style={styles.totalRow}>
              <View style={styles.totalBadge}>
                <Ionicons name="flame" size={15} color="#F59E0B" />
                <Text style={styles.totalText}>{dailyPlan.total_calories} {t("total_calories")}</Text>
              </View>
              <View style={styles.totalActions}>
                <TouchableOpacity onPress={handleShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="share-outline" size={18} color={c.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { clearDailyPlan(); Haptics.selectionAsync(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="refresh-outline" size={18} color={c.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {dailyPlan.meals.map((meal) => (
              <MealSlotCard
                key={meal.slot}
                meal={meal}
                onRate={(r) => setRating(meal.name, r)}
                onSwap={() => handleSwap(meal.slot as "breakfast" | "lunch" | "dinner")}
                swapping={swappingSlot === meal.slot}
                onFindRecipe={() => {
                  const mealParam = JSON.stringify({
                    name: meal.name,
                    cuisine: meal.cuisine,
                    description: meal.description,
                    prep_time_mins: meal.prep_time_mins,
                    calories_per_serving: meal.calories_per_serving,
                    difficulty: meal.difficulty,
                    tags: meal.tags ?? [],
                  });
                  router.push({ pathname: "/meal/[id]", params: { id: meal.slot, meal: mealParam } });
                }}
              />
            ))}

            {/* Nutrition note */}
            {!!dailyPlan.nutrition_note && (
              <View style={[styles.noteCard, { backgroundColor: c.surfaceAlt }]}>
                <Ionicons name="information-circle-outline" size={16} color={c.primary} />
                <Text style={styles.noteText}>{dailyPlan.nutrition_note}</Text>
              </View>
            )}

            {/* Shopping reminders */}
            {dailyPlan.shopping_reminders.length > 0 && (
              <View style={[styles.remindersCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <View style={styles.remindersHeader}>
                  <Ionicons name="cart-outline" size={18} color={c.primary} />
                  <Text style={[styles.remindersTitle, { color: c.text }]}>{t("shopping_reminders")}</Text>
                </View>
                {dailyPlan.shopping_reminders.map((r) => (
                  <View key={r.item} style={styles.reminderRow}>
                    <View style={[styles.reminderDot, { backgroundColor: c.primary }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reminderItem, { color: c.text }]}>{r.item}</Text>
                      <Text style={[styles.reminderReason, { color: c.textMuted }]}>{r.reason}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Shop for plan CTA */}
            <TouchableOpacity
              style={[styles.shopBtn, { backgroundColor: c.accent }, shopping && styles.btnDisabled]}
              onPress={handleShopForPlan}
              disabled={shopping}
            >
              {shopping ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="cart" size={17} color="#FFF" />
                  <Text style={styles.generateBtnText}>{t("shop_for_plan")}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Empty state */}
        {!dailyPlan && !loading && (
          <View style={styles.empty}>
            <View style={[styles.emptyIconWrap, { backgroundColor: c.successBg }]}>
              <Ionicons name="restaurant-outline" size={48} color={c.primaryLight} />
            </View>
            <Text style={[styles.emptyTitle, { color: c.text }]}>{t("no_plan_title")}</Text>
            <Text style={[styles.emptyBody, { color: c.textMuted }]}>{t("no_plan_body")}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Shared card styles (no theme dependency) ─────────────────────────────────
const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 16, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  slotHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  slotIconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  slotLabel: { fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  slotMeta: { flexDirection: "row", alignItems: "center", marginLeft: "auto", gap: 3 },
  metaText: { fontSize: 12, fontWeight: "600" },
  body: { padding: 14, paddingTop: 8, gap: 8 },
  name: { fontSize: 17, fontWeight: "800" },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 10 },
  cuisine: { fontSize: 13, fontWeight: "500" },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  diffText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  compsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  compChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1, maxWidth: 130 },
  compText: { fontSize: 12, fontWeight: "600" },
  pantryRow: { flexDirection: "row", alignItems: "flex-start", gap: 5, borderRadius: 8, padding: 8 },
  pantryText: { fontSize: 12, color: "#166534", flex: 1, lineHeight: 17 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dislikeBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  dislikeText: { fontSize: 12, fontWeight: "600" },
  expandBtn: { flexDirection: "row", alignItems: "center", gap: 3, marginLeft: "auto" },
  expandText: { fontSize: 13, fontWeight: "600" },
  expandBody: { gap: 10 },
  description: { fontSize: 13, lineHeight: 19 },
  recipeLabel: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  ingRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  ingDot: { width: 5, height: 5, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  ingText: { fontSize: 13, lineHeight: 18, flex: 1 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  stepNum: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  stepNumText: { fontSize: 11, fontWeight: "800", color: "#FFF" },
  stepText: { fontSize: 13, lineHeight: 18, flex: 1 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  tagText: { fontSize: 12 },
  findBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  findBtnText: { fontSize: 13, fontWeight: "600", flex: 1 },
});

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, paddingBottom: 48, gap: 12 },
    header: {},
    heading: { fontSize: 24, fontWeight: "800", color: c.text },
    subheading: { fontSize: 14, color: c.textMuted, lineHeight: 20, marginTop: 4 },
    card: {
      borderRadius: 16, padding: 16, borderWidth: 1,
      shadowColor: c.shadow, shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    filterRow: { flexDirection: "column", gap: 0, marginBottom: 12 },
    cuisineChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
    cuisineChipText: { fontSize: 12, fontWeight: "600" },
    filterField: {},
    filterLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
    filterInput: {
      borderWidth: 1, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 9, fontSize: 14,
    },
    errorBanner: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, padding: 10, marginBottom: 12 },
    errorText: { fontSize: 13, flex: 1 },
    generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 14, paddingVertical: 14, gap: 8 },
    shopBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 14, paddingVertical: 14, gap: 8 },
    btnDisabled: { opacity: 0.6 },
    generateBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
    planSection: { gap: 12 },
    totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    totalActions: { flexDirection: "row", alignItems: "center", gap: 14 },
    totalBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: c.warningBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    totalText: { fontSize: 13, fontWeight: "700", color: c.warning },
    noteCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, padding: 12 },
    noteText: { fontSize: 13, color: c.textSecondary, lineHeight: 18, flex: 1 },
    remindersCard: { borderRadius: 16, padding: 14, borderWidth: 1 },
    remindersHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
    remindersTitle: { fontSize: 15, fontWeight: "700" },
    reminderRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
    reminderDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5, flexShrink: 0 },
    reminderItem: { fontSize: 14, fontWeight: "600" },
    reminderReason: { fontSize: 12, lineHeight: 17, marginTop: 1 },
    empty: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 24, gap: 12 },
    emptyIconWrap: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: 8 },
    emptyTitle: { fontSize: 20, fontWeight: "800" },
    emptyBody: { fontSize: 14, textAlign: "center", lineHeight: 21 },
  });
}
