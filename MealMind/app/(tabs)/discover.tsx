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
const CUISINES = ["Chinese", "Japanese", "Korean", "Italian", "Mexican", "Indian", "Thai", "Mediterranean", "American", "French"];
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "@/store/useAppStore";
import { translateTag, translateCuisine, translateDifficulty } from "@/constants/filters";
import { getDailyPlan, swapMeal, saveRecipe } from "@/services/api";
import type { Recipe, Ingredient } from "@/services/api";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme } from "@/hooks/useTheme";
import { useBatchTranslated, useTranslated } from "@/hooks/useDynamicTranslation";
import FindRecipeModal from "@/components/FindRecipeModal";
import type { Rating } from "@/store/useAppStore";
import type { DailyMealPlan, DailyPlanMeal } from "@/services/api";

type MealRating = Rating;
type SlotFilter = "all" | "breakfast" | "lunch" | "dinner";

const SLOT_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2 };

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

function MacroCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={cardStyles.macroCell}>
      <Text style={[cardStyles.macroValue, { color }]}>{value}</Text>
      <Text style={cardStyles.macroLabel}>{label}</Text>
    </View>
  );
}

function MealSlotCard({
  meal, onRate, onSwap, swapping, onFindRecipe,
}: {
  meal: DailyPlanMeal;
  onRate: (r: MealRating) => void;
  onSwap: () => void;
  swapping: boolean;
  onFindRecipe: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const c = useTheme();
  const { t } = useTranslation();
  const { language, shoppingList, addToShoppingList, removeFromShoppingList } = useAppStore();
  const accent = SLOT_COLOUR[meal.slot] ?? "#2E7D32";
  const icon = SLOT_ICON[meal.slot] ?? "restaurant";
  const hasMacros = meal.protein_g != null || meal.carbs_g != null || meal.fat_g != null;

  // Dynamic AI translation — kicks in when language="zh" and content is English
  const translatedName = useTranslated(meal.name);
  const translatedDescription = useTranslated(meal.description);
  const translatedIngredients = useBatchTranslated(meal.ingredients ?? []);
  const translatedSteps = useBatchTranslated(meal.steps ?? []);

  const cartCategory = meal.name;
  const cartItems = shoppingList?.groups.find((g) => g.category === cartCategory)?.items ?? [];
  const inCart = (ing: string) => cartItems.some((i) => i.name === ing);
  const allInCart = (meal.ingredients ?? []).length > 0 && (meal.ingredients ?? []).every(inCart);

  function toggleIngredient(ing: string) {
    if (inCart(ing)) removeFromShoppingList(cartCategory, ing);
    else addToShoppingList(cartCategory, ing);
    Haptics.selectionAsync();
  }

  function addAll() {
    (meal.ingredients ?? []).forEach((ing) => {
      if (!inCart(ing)) addToShoppingList(cartCategory, ing);
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // ── Save meal to My Recipes ───────────────────────────────────────────────
  const [savedState, setSavedState] = useState<"idle" | "saving" | "saved">("idle");

  function parseIngredient(s: string): Ingredient {
    // Parses "100g chicken breast" or "2 eggs" → structured ingredient
    const m = s.match(/^([\d.]+)\s*([a-zA-Z\u4e00-\u9fff]+)?\s+(.+)$/);
    if (m && m[3]) return { name: m[3].trim(), amount: parseFloat(m[1]) || 1, unit: m[2] ?? "" };
    return { name: s, amount: 1, unit: "" };
  }

  async function handleSaveMeal() {
    if (savedState !== "idle") return;
    setSavedState("saving");
    try {
      const recipe: Recipe = {
        title: meal.name,
        servings: 2,
        prep_time_mins: meal.prep_time_mins,
        calories_per_serving: meal.calories_per_serving,
        ingredients: (meal.ingredients ?? []).map(parseIngredient),
        steps: meal.steps ?? [],
        tags: meal.tags ?? [],
        warnings: [],
        source_name: "MealMind Plan",
      };
      await saveRecipe(recipe);
      setSavedState("saved");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setSavedState("idle");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  return (
    <View style={[cardStyles.card, { backgroundColor: c.surface }]}>
      <View style={[cardStyles.slotHeader, { backgroundColor: accent + "18" }]}>
        <View style={[cardStyles.slotIconWrap, { backgroundColor: accent }]}>
          <Ionicons name={icon} size={16} color="#FFF" />
        </View>
        <Text style={[cardStyles.slotLabel, { color: accent }]}>
          {meal.slot === "breakfast" ? t("breakfast") : meal.slot === "lunch" ? t("lunch") : t("dinner")}
        </Text>
        <View style={cardStyles.slotMeta}>
          <Ionicons name="flame-outline" size={13} color={c.textMuted} />
          <Text style={[cardStyles.metaText, { color: c.textMuted }]}>{meal.calories_per_serving} {t("calories_label")}</Text>
          <Ionicons name="time-outline" size={13} color={c.textMuted} style={{ marginLeft: 8 }} />
          <Text style={[cardStyles.metaText, { color: c.textMuted }]}>{meal.prep_time_mins} {t("min_label")}</Text>
        </View>
      </View>

      <View style={cardStyles.body}>
        <Text style={[cardStyles.name, { color: c.text }]}>{translatedName}</Text>
        <View style={cardStyles.rowMeta}>
          <Text style={[cardStyles.cuisine, { color: c.textMuted }]}>{meal.cuisine}</Text>
          <View style={[cardStyles.diffBadge, { backgroundColor: (DIFFICULTY_COLOUR[meal.difficulty] ?? "#999") + "20" }]}>
            <Text style={[cardStyles.diffText, { color: DIFFICULTY_COLOUR[meal.difficulty] ?? "#999" }]}>
              {translateDifficulty(meal.difficulty, language)}
            </Text>
          </View>
        </View>

        <View style={cardStyles.compsRow}>
          <CompChip icon="leaf" label={meal.components.vegetable} color="#16A34A" />
          <CompChip icon="fish" label={meal.components.protein} color="#2563EB" />
          <CompChip icon="ellipse" label={meal.components.staple} color="#D97706" />
        </View>

        {meal.uses_pantry_items.length > 0 && (
          <View style={[cardStyles.pantryRow, { backgroundColor: c.successBg }]}>
            <Ionicons name="checkmark-circle" size={13} color="#16A34A" />
            <Text style={cardStyles.pantryText}>
              {t("using_from_pantry")} {meal.uses_pantry_items.join(", ")}
            </Text>
          </View>
        )}

        <View style={cardStyles.ratingRow}>
          <TouchableOpacity
            style={[cardStyles.dislikeBtn, { borderColor: swapping ? c.error : c.border, backgroundColor: swapping ? c.errorBg : "transparent" }]}
            onPress={() => { onRate("down"); onSwap(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
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
            style={[cardStyles.infoIconBtn, { borderColor: showInfo ? c.primary : c.border, backgroundColor: showInfo ? c.primaryLight : "transparent" }]}
            onPress={() => { setShowInfo((v) => !v); Haptics.selectionAsync(); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="information-circle-outline" size={17} color={showInfo ? c.primary : c.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[cardStyles.saveIconBtn, {
              borderColor: savedState === "saved" ? c.primary : c.border,
              backgroundColor: savedState === "saved" ? c.primaryLight : "transparent",
            }]}
            onPress={handleSaveMeal}
            disabled={savedState !== "idle"}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {savedState === "saving" ? (
              <ActivityIndicator size={13} color={c.primary} />
            ) : (
              <Ionicons
                name={savedState === "saved" ? "bookmark" : "bookmark-outline"}
                size={15}
                color={savedState === "saved" ? c.primary : c.textMuted}
              />
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

        {showInfo && (
          <View style={[cardStyles.infoPanel, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
            {/* Calorie + macros row */}
            <View style={cardStyles.macroRow}>
              <MacroCell label="kcal" value={String(meal.calories_per_serving)} color="#F59E0B" />
              {meal.protein_g != null && <MacroCell label={t("macro_protein")} value={`${meal.protein_g}g`} color="#2563EB" />}
              {meal.carbs_g != null && <MacroCell label={t("macro_carbs")} value={`${meal.carbs_g}g`} color="#16A34A" />}
              {meal.fat_g != null && <MacroCell label={t("macro_fat")} value={`${meal.fat_g}g`} color="#D97706" />}
              {meal.fiber_g != null && <MacroCell label={t("macro_fiber")} value={`${meal.fiber_g}g`} color="#7C3AED" />}
            </View>

            {/* Divider */}
            <View style={[cardStyles.infoDivider, { backgroundColor: c.border }]} />

            {/* Ingredient components */}
            <Text style={[cardStyles.infoSectionLabel, { color: c.textMuted }]}>{t("ingredients_breakdown")}</Text>
            <View style={cardStyles.componentsList}>
              <View style={cardStyles.componentRow}>
                <View style={[cardStyles.componentDot, { backgroundColor: "#16A34A" }]} />
                <Text style={[cardStyles.componentText, { color: c.textSecondary }]}>{meal.components.vegetable}</Text>
              </View>
              <View style={cardStyles.componentRow}>
                <View style={[cardStyles.componentDot, { backgroundColor: "#2563EB" }]} />
                <Text style={[cardStyles.componentText, { color: c.textSecondary }]}>{meal.components.protein}</Text>
              </View>
              <View style={cardStyles.componentRow}>
                <View style={[cardStyles.componentDot, { backgroundColor: "#D97706" }]} />
                <Text style={[cardStyles.componentText, { color: c.textSecondary }]}>{meal.components.staple}</Text>
              </View>
            </View>

            {/* Prep + difficulty */}
            <View style={cardStyles.infoDivider2} />
            <View style={cardStyles.infoFooterRow}>
              <View style={cardStyles.infoFooterItem}>
                <Ionicons name="time-outline" size={13} color={c.textMuted} />
                <Text style={[cardStyles.infoFooterText, { color: c.textMuted }]}>{meal.prep_time_mins} {t("min_label")}</Text>
              </View>
              <View style={[cardStyles.diffBadge, { backgroundColor: (DIFFICULTY_COLOUR[meal.difficulty] ?? "#999") + "20" }]}>
                <Text style={[cardStyles.diffText, { color: DIFFICULTY_COLOUR[meal.difficulty] ?? "#999" }]}>{translateDifficulty(meal.difficulty, language)}</Text>
              </View>
            </View>

            {hasMacros && (
              <Text style={[cardStyles.infoEstimated, { color: c.textPlaceholder }]}>{t("nutrition_estimated")}</Text>
            )}
          </View>
        )}


        {expanded && (
          <View style={cardStyles.expandBody}>
            <Text style={[cardStyles.description, { color: c.textSecondary }]}>{translatedDescription}</Text>

            {(meal.ingredients ?? []).length > 0 && (
              <View style={{ gap: 4 }}>
                <View style={cardStyles.ingHeader}>
                  <Text style={[cardStyles.recipeLabel, { color: c.text }]}>{t("ingredients_label")}</Text>
                  <TouchableOpacity
                    style={[cardStyles.addAllBtn, { borderColor: allInCart ? c.primary : c.border, backgroundColor: allInCart ? c.primaryLight : "transparent" }]}
                    onPress={addAll}
                  >
                    <Ionicons name={allInCart ? "checkmark" : "cart-outline"} size={12} color={allInCart ? c.primary : c.textMuted} />
                    <Text style={[cardStyles.addAllText, { color: allInCart ? c.primary : c.textMuted }]}>
                      {allInCart ? t("added_to_cart") : t("add_all_to_cart")}
                    </Text>
                  </TouchableOpacity>
                </View>
                {translatedIngredients.map((ing, i) => {
                  const origIng = (meal.ingredients ?? [])[i] ?? ing;
                  const added = inCart(origIng);
                  return (
                    <View key={i} style={cardStyles.ingRow}>
                      <View style={[cardStyles.ingDot, { backgroundColor: c.primary }]} />
                      <Text style={[cardStyles.ingText, { color: c.textSecondary }]}>{ing}</Text>
                      <TouchableOpacity
                        style={[cardStyles.ingCartBtn, { borderColor: added ? c.primary : c.border, backgroundColor: added ? c.primaryLight : "transparent" }]}
                        onPress={() => toggleIngredient(origIng)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name={added ? "remove" : "add"} size={14} color={added ? c.primary : c.textMuted} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            {(meal.steps ?? []).length > 0 && (
              <View>
                <Text style={[cardStyles.recipeLabel, { color: c.text }]}>{t("steps_label")}</Text>
                {translatedSteps.map((step, i) => (
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
                    <Text style={[cardStyles.tagText, { color: c.textMuted }]}>{translateTag(tag, language)}</Text>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[cardStyles.findBtn, { backgroundColor: c.successBg, borderColor: c.primaryLight }]}
              onPress={onFindRecipe}
            >
              <Ionicons name="search-outline" size={14} color={c.primary} />
              <Text style={[cardStyles.findBtnText, { color: c.primary }]}>{t("find_recipes_online")}</Text>
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
  const { profile, pantry, dailyPlan, setDailyPlan, clearDailyPlan, language, ratings, setRating, servings, setServings } = useAppStore();
  const router = useRouter();
  const { t, strings } = useTranslation();
  const c = useTheme();

  const [loading, setLoading] = useState(false);
  const [swappingSlot, setSwappingSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cuisine, setCuisine] = useState("");
  const [maxTime, setMaxTime] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [slotFilter, setSlotFilter] = useState<SlotFilter>("all");
  const [showNutritionNote, setShowNutritionNote] = useState(false);
  const [showFindRecipe, setShowFindRecipe] = useState(false);

  const SLOT_FILTERS: { key: SlotFilter; label: string }[] = [
    { key: "all", label: t("all_meals") },
    { key: "breakfast", label: t("breakfast") },
    { key: "lunch", label: t("lunch") },
    { key: "dinner", label: t("dinner") },
  ];

  const sortedMeals = (dailyPlan?.meals ?? [])
    .slice()
    .sort((a, b) => (SLOT_ORDER[a.slot] ?? 0) - (SLOT_ORDER[b.slot] ?? 0))
    .filter((m) => slotFilter === "all" || m.slot === slotFilter);

  const totalProteinG = dailyPlan?.meals.reduce((s, m) => s + (m.protein_g ?? 0), 0) ?? 0;
  const proteinGoal = profile.protein_goal_g;
  const showProtein = totalProteinG > 0 && !!proteinGoal;

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    const targetSlots: ("breakfast" | "lunch" | "dinner")[] | undefined =
      slotFilter === "all" ? undefined : [slotFilter as "breakfast" | "lunch" | "dinner"];
    try {
      const { plan } = await getDailyPlan(
        profile, pantry,
        cuisine.trim() || undefined,
        maxTime ? parseInt(maxTime) : undefined,
        language,
        Object.keys(ratings).length > 0 ? ratings : undefined,
        servings,
        targetSlots,
      );

      if (slotFilter === "all" || !dailyPlan) {
        // Replace the whole plan
        setDailyPlan(plan);
        setShowNutritionNote(false);
      } else {
        // Merge: keep existing meals for other slots, replace/add the generated one
        const newMeal = plan.meals.find((m) => m.slot === slotFilter) ?? plan.meals[0];
        const kept = dailyPlan.meals.filter((m) => m.slot !== newMeal.slot);
        const merged = [...kept, newMeal].sort((a, b) => (SLOT_ORDER[a.slot] ?? 0) - (SLOT_ORDER[b.slot] ?? 0));
        const newTotal = merged.reduce((s, m) => s + (m.calories_per_serving ?? 0), 0);
        setDailyPlan({ ...dailyPlan, meals: merged, total_calories: newTotal });
      }

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
    const text = ["My MealMind Plan", "", ...lines, "", `Total: ${dailyPlan.total_calories} kcal`].join("\n");
    try { await Share.share({ message: text }); } catch { /* dismissed */ }
  }

  const styles = makeStyles(c);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Settings toggle ── */}
        <TouchableOpacity
          style={[styles.settingsToggle, { backgroundColor: c.surface, borderColor: c.border }]}
          onPress={() => { setShowSettings((v) => !v); Haptics.selectionAsync(); }}
        >
          <Ionicons name="options-outline" size={16} color={c.textMuted} />
          <Text style={[styles.settingsToggleText, { color: c.textMuted }]}>{t("show_settings")}</Text>
          <Ionicons name={showSettings ? "chevron-up" : "chevron-down"} size={14} color={c.textMuted} />
        </TouchableOpacity>

        {/* ── Collapsible settings panel ── */}
        {showSettings && (
          <View style={[styles.settingsPanel, { backgroundColor: c.surface, borderColor: c.border }]}>
            {/* Cuisine chips */}
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
                      <Text style={[styles.cuisineChipText, { color: c.chipText }, active && { color: "#FFF", fontWeight: "700" }]}>{translateCuisine(cu, language)}</Text>
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

            {/* Max prep time */}
            <Text style={[styles.filterLabel, { color: c.textMuted, marginTop: 10 }]}>{t("max_prep")}</Text>
            <TextInput
              style={[styles.filterInput, { borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
              placeholder="e.g. 30"
              placeholderTextColor={c.textPlaceholder}
              value={maxTime}
              onChangeText={setMaxTime}
              keyboardType="number-pad"
            />

            {/* Servings picker */}
            <Text style={[styles.filterLabel, { color: c.textMuted, marginTop: 10 }]}>{t("servings")}</Text>
            <View style={styles.servingsRow}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.servingsChip, { backgroundColor: c.chipBg, borderColor: c.border }, servings === n && { backgroundColor: c.primary, borderColor: c.primary }]}
                  onPress={() => { setServings(n); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.servingsChipText, { color: c.chipText }, servings === n && { color: "#FFF", fontWeight: "700" }]}>
                    {strings.servings_people(n)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Find Recipe shortcut */}
            <TouchableOpacity
              style={[styles.findRecipeBtn, { borderColor: c.primary, backgroundColor: c.primaryLight }]}
              onPress={() => { setShowSettings(false); setShowFindRecipe(true); Haptics.selectionAsync(); }}
            >
              <Ionicons name="search" size={15} color={c.primary} />
              <Text style={[styles.findRecipeBtnText, { color: c.primary }]}>{t("find_recipe")}</Text>
            </TouchableOpacity>
          </View>
        )}

        <FindRecipeModal visible={showFindRecipe} onClose={() => setShowFindRecipe(false)} />

        {/* ── Meal slot selector (controls what gets generated) ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.slotFilterRow}>
            {SLOT_FILTERS.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[styles.slotChip, { borderColor: c.border, backgroundColor: c.chipBg }, slotFilter === key && { backgroundColor: c.primary, borderColor: c.primary }]}
                onPress={() => { setSlotFilter(key as SlotFilter); Haptics.selectionAsync(); }}
              >
                <Text style={[styles.slotChipText, { color: c.chipText }, slotFilter === key && { color: "#FFF", fontWeight: "700" }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* ── Big generate CTA ── */}
        <TouchableOpacity
          style={[styles.generateBtnLarge, { backgroundColor: loading ? c.disabled : c.primary }]}
          onPress={handleGenerate}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Ionicons name="sparkles" size={22} color="#FFF" />
              <Text style={styles.generateBtnLargeText}>{t("generate_cta")}</Text>
            </>
          )}
        </TouchableOpacity>

        {/* ── Error banner ── */}
        {error && (
          <View style={[styles.errorBanner, { backgroundColor: c.errorBg }]}>
            <Ionicons name="alert-circle-outline" size={15} color={c.error} />
            <Text style={[styles.errorText, { color: c.error }]}>{error}</Text>
          </View>
        )}

        {/* ── Plan section ── */}
        {dailyPlan && (
          <View style={styles.planSection}>
            {/* Summary row */}
            <View style={styles.summaryRow}>
              <View style={styles.totalBadge}>
                <Ionicons name="flame" size={14} color="#F59E0B" />
                <Text style={styles.totalText}>{dailyPlan.total_calories} {t("total_calories")}</Text>
              </View>
              <View style={styles.summaryActions}>
                {!!dailyPlan.nutrition_note && (
                  <TouchableOpacity
                    onPress={() => { setShowNutritionNote((v) => !v); Haptics.selectionAsync(); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="information-circle-outline" size={20} color={showNutritionNote ? c.primary : c.textMuted} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={handleShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="share-outline" size={18} color={c.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { clearDailyPlan(); Haptics.selectionAsync(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="refresh-outline" size={18} color={c.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {showNutritionNote && !!dailyPlan.nutrition_note && (
              <View style={[styles.noteCard, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                <Ionicons name="information-circle-outline" size={15} color={c.primary} />
                <Text style={[styles.noteText, { color: c.textSecondary }]}>{dailyPlan.nutrition_note}</Text>
              </View>
            )}

            {showProtein && (
              <View style={[styles.proteinCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <View style={styles.proteinRow}>
                  <Ionicons name="barbell-outline" size={14} color="#2563EB" />
                  <Text style={[styles.proteinLabel, { color: c.textSecondary }]}>{t("protein_today")}</Text>
                  <Text style={[styles.proteinValue, { color: "#2563EB" }]}>
                    {totalProteinG}g / {proteinGoal}g {t("protein_of_goal")}
                  </Text>
                </View>
                <View style={[styles.proteinBarBg, { backgroundColor: c.border }]}>
                  <View style={[styles.proteinBarFill, {
                    backgroundColor: totalProteinG >= proteinGoal! ? "#16A34A" : "#2563EB",
                    width: `${Math.min(100, Math.round((totalProteinG / proteinGoal!) * 100))}%` as any,
                  }]} />
                </View>
              </View>
            )}

            {/* Meal cards */}
            {sortedMeals.map((meal) => (
              <MealSlotCard
                key={meal.slot}
                meal={meal}
                onRate={(r) => setRating(meal.name, r)}
                onSwap={() => handleSwap(meal.slot as "breakfast" | "lunch" | "dinner")}
                swapping={swappingSlot === meal.slot}
                onFindRecipe={() => {
                  const mealParam = JSON.stringify({
                    name: meal.name, cuisine: meal.cuisine, description: meal.description,
                    prep_time_mins: meal.prep_time_mins, calories_per_serving: meal.calories_per_serving,
                    difficulty: meal.difficulty, tags: meal.tags ?? [],
                  });
                  router.push({ pathname: "/meal/[id]", params: { id: meal.slot, meal: mealParam } });
                }}
              />
            ))}

          </View>
        )}

        {/* ── Empty state ── */}
        {sortedMeals.length === 0 && !loading && (
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

// ── Shared card styles ────────────────────────────────────────────────────────
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
  infoIconBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  saveIconBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  infoPanel: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8, marginTop: 2 },
  macroRow: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  macroCell: { alignItems: "center", minWidth: 48 },
  macroValue: { fontSize: 16, fontWeight: "800" },
  macroLabel: { fontSize: 10, fontWeight: "600", color: "#999", textTransform: "uppercase", letterSpacing: 0.3 },
  infoDivider: { height: StyleSheet.hairlineWidth },
  infoDivider2: { height: 0 },
  infoSectionLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  componentsList: { gap: 4 },
  componentRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  componentDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  componentText: { fontSize: 13, flex: 1 },
  infoFooterRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoFooterItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  infoFooterText: { fontSize: 12, fontWeight: "500" },
  infoEstimated: { fontSize: 10, fontStyle: "italic" },
  expandBtn: { flexDirection: "row", alignItems: "center", gap: 3, marginLeft: "auto" },
  expandText: { fontSize: 13, fontWeight: "600" },
  expandBody: { gap: 10 },
  description: { fontSize: 13, lineHeight: 19 },
  recipeLabel: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  ingHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  addAllBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 12, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  addAllText: { fontSize: 11, fontWeight: "600" },
  ingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  ingDot: { width: 5, height: 5, borderRadius: 3, flexShrink: 0 },
  ingText: { fontSize: 13, lineHeight: 18, flex: 1 },
  ingCartBtn: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 },
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
    content: { padding: 16, paddingBottom: 48, gap: 10 },
    settingsToggle: {
      flexDirection: "row", alignItems: "center", gap: 6,
      borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11,
    },
    settingsToggleText: { fontSize: 13, fontWeight: "600", flex: 1 },
    generateBtnLarge: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      borderRadius: 18, paddingVertical: 18, gap: 10,
      shadowColor: c.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
    },
    generateBtnLargeText: { color: "#FFF", fontSize: 18, fontWeight: "800", letterSpacing: 0.2 },
    // Settings panel
    settingsPanel: {
      borderRadius: 14, borderWidth: 1, padding: 14,
    },
    filterLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
    cuisineChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
    cuisineChipText: { fontSize: 12, fontWeight: "600" },
    filterInput: {
      borderWidth: 1, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 9, fontSize: 14,
    },
    servingsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    servingsChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    servingsChipText: { fontSize: 12, fontWeight: "600" },
    findRecipeBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 6, borderRadius: 12, borderWidth: 1, paddingVertical: 11, marginTop: 6,
    },
    findRecipeBtnText: { fontSize: 13, fontWeight: "700" },
    // Error
    errorBanner: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, padding: 10 },
    errorText: { fontSize: 13, flex: 1 },
    // Plan
    planSection: { gap: 10 },
    summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    summaryActions: { flexDirection: "row", alignItems: "center", gap: 14 },
    totalBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: c.warningBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    totalText: { fontSize: 13, fontWeight: "700", color: c.warning },
    // Slot filter
    slotFilterRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
    slotChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    slotChipText: { fontSize: 13, fontWeight: "600" },
    // Nutrition note
    noteCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, padding: 12, borderWidth: 1 },
    noteText: { fontSize: 13, color: c.textSecondary, lineHeight: 18, flex: 1 },
    // Protein tracker
    proteinCard: { borderRadius: 12, padding: 12, borderWidth: 1, gap: 8 },
    proteinRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    proteinLabel: { fontSize: 13, fontWeight: "600", flex: 1 },
    proteinValue: { fontSize: 13, fontWeight: "700" },
    proteinBarBg: { height: 6, borderRadius: 3, overflow: "hidden" },
    proteinBarFill: { height: 6, borderRadius: 3 },
    // Empty state
    empty: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 24, gap: 12 },
    emptyIconWrap: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: 8 },
    emptyTitle: { fontSize: 20, fontWeight: "800" },
    emptyBody: { fontSize: 14, textAlign: "center", lineHeight: 21 },
  });
}
