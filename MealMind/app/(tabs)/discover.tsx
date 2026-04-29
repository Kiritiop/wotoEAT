import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Share,
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView as SafeAreaViewRN } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "@/store/useAppStore";
import { CUISINES, FLAVOUR_OPTIONS, PREP_TIME_PRESETS, SLOT_COLOUR, SLOT_ICON, DIFFICULTY_COLORS, translateTag, translateCuisine, translateDifficulty } from "@/constants/filters";
import { getDailyPlan, swapMeal, saveRecipe, deleteRecipe } from "@/services/api";
import type { Recipe, Ingredient } from "@/services/api";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme } from "@/hooks/useTheme";
import { useBatchTranslated, useTranslated } from "@/hooks/useDynamicTranslation";
import FindRecipeModal from "@/components/FindRecipeModal";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Rating } from "@/store/useAppStore";
import type { DailyMealPlan, DailyPlanMeal } from "@/services/api";

type MealTypeTag = "any" | "breakfast" | "lunch" | "dinner";

const SLOT_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2 };

/** Scales the leading number in an ingredient string (e.g. "100g chicken" → "150g chicken").
 *  N-09: non-numeric quantities (e.g. "a handful") get a ~ prefix to signal approximate. */
function scaleIngredientStr(s: string, factor: number): string {
  if (Math.abs(factor - 1) < 0.001) return s;
  const m = s.match(/^([\d.]+)([\s\S]*)$/);
  if (!m) return `~${s}`;
  const scaled = parseFloat(m[1]) * factor;
  const display = scaled % 1 < 0.05 ? Math.round(scaled).toString() : scaled.toFixed(1);
  return display + m[2];
}

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
  onRate: (r: Rating) => void;
  onSwap: () => void;
  swapping: boolean;
  onFindRecipe: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const c = useTheme();
  const { t, strings } = useTranslation();
  const { language, servings: storeServings, planServings, pantry, shoppingList, addToShoppingList, removeFromShoppingList, addRecipe, removeRecipe, selectedRecipes, toggleConfirmedSlot } = useAppStore();
  // N-13: derive confirmed from selectedRecipes for bidirectional sync with Shopping/Pantry tab
  const isConfirmed = selectedRecipes.some((r) => r.title === meal.name);

  // N-01: extract name from ingredient string — handles "100g chicken breast", "2 eggs", bare strings
  function ingredientNameFrom(s: string): string {
    const withUnit = s.match(/^[\d.]+\s*[a-zA-Z一-鿿]+\s+(.+)$/);
    if (withUnit) return withUnit[1].trim().toLowerCase();
    const noUnit = s.match(/^[\d.]+\s+(.+)$/);
    if (noUnit) return noUnit[1].trim().toLowerCase();
    return s.trim().toLowerCase();
  }
  const pantryMatches = (meal.ingredients ?? []).filter((ing) => {
    const n = ingredientNameFrom(ing);
    return pantry.some((p) => p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase()));
  });
  const missingIngredients = (meal.ingredients ?? []).filter((ing) => {
    const n = ingredientNameFrom(ing);
    return !pantry.some((p) => p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase()));
  });

  // B2: track parsed names of auto-added ingredients so we can undo on un-confirm
  const [autoAddedIngs, setAutoAddedIngs] = useState<string[]>([]);
  const [cartBanner, setCartBanner] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  function handleConfirm() {
    const willConfirm = !isConfirmed;
    toggleConfirmedSlot(meal.slot);
    if (willConfirm) {
      // BUG-04: add meal to selectedRecipes so shopping list generation has input
      addRecipe({
        title: meal.name,
        servings: storeServings || 1,
        prep_time_mins: meal.prep_time_mins,
        calories_per_serving: meal.calories_per_serving,
        ingredients: (meal.ingredients ?? []).map(parseIngredient),
        steps: meal.steps ?? [],
        tags: meal.tags ?? [],
        warnings: [],
        source_name: "wotoEAT Plan",
      });
      const toAdd = missingIngredients.filter((ing) => !inCart(ing));
      toAdd.forEach((ing) => addToShoppingList(cartCategory, ingredientNameFrom(ing)));
      setAutoAddedIngs(toAdd.map(ingredientNameFrom));
      if (toAdd.length > 0) {
        setCartBanner(language === "zh"
          ? `${toAdd.length} 个食材已加入购物车`
          : `${toAdd.length} item${toAdd.length > 1 ? "s" : ""} added to cart`);
        setTimeout(() => setCartBanner(null), 3000);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      removeRecipe(meal.name);
      autoAddedIngs.forEach((ing) => removeFromShoppingList(cartCategory, ing));
      setAutoAddedIngs([]);
      setCartBanner(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  // Serving size scaler — relative to the servings the plan was generated for
  const [displayServings, setDisplayServings] = useState(storeServings || 1);
  const scaleFactor = displayServings / (planServings || storeServings || 1);
  const accent = SLOT_COLOUR[meal.slot] ?? "#2E7D32";
  const icon = (SLOT_ICON[meal.slot] ?? "restaurant") as React.ComponentProps<typeof Ionicons>["name"];
  const hasMacros = meal.protein_g != null || meal.carbs_g != null || meal.fat_g != null;

  // Dynamic AI translation — kicks in when language="zh" and content is English
  const translatedName = useTranslated(meal.name);
  const translatedDescription = useTranslated(meal.description);
  const translatedIngredients = useBatchTranslated(meal.ingredients ?? []);
  const translatedSteps = useBatchTranslated(meal.steps ?? []);

  // BUG-05: slot prefix prevents collision when two meals share the same name
  const cartCategory = `${meal.slot}-${meal.name}`;
  const cartItems = shoppingList?.groups.find((g) => g.category === cartCategory)?.items ?? [];
  // BUG-07: normalize ingredient names so "200g chicken" matches "chicken" already in cart
  const inCart = (ing: string) => {
    const n = ingredientNameFrom(ing);
    return cartItems.some((i) => i.name === ing || ingredientNameFrom(i.name) === n);
  };
  const allInCart = (meal.ingredients ?? []).length > 0 && (meal.ingredients ?? []).every(inCart);

  function toggleIngredient(ing: string) {
    if (inCart(ing)) removeFromShoppingList(cartCategory, ingredientNameFrom(ing));
    else addToShoppingList(cartCategory, ingredientNameFrom(ing));
    Haptics.selectionAsync();
  }

  function addAll() {
    (meal.ingredients ?? []).forEach((ing) => {
      if (!inCart(ing)) addToShoppingList(cartCategory, ingredientNameFrom(ing));
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // ── Save meal to My Recipes ───────────────────────────────────────────────
  const [savedState, setSavedState] = useState<"idle" | "saving" | "saved" | "unsaving">("idle");
  const [savedId, setSavedId] = useState<string | null>(null);

  function parseIngredient(s: string): Ingredient {
    // Parses "100g chicken breast" or "2 eggs" → structured ingredient
    // N-01: handles "100g chicken breast", "2 eggs" (no unit), and bare strings
    const withUnit = s.match(/^([\d.]+)\s*([a-zA-Z\u4e00-\u9fff]+)\s+(.+)$/);
    if (withUnit && withUnit[3]) return { name: withUnit[3].trim(), amount: parseFloat(withUnit[1]) || 1, unit: withUnit[2] };
    const noUnit = s.match(/^([\d.]+)\s+(.+)$/);
    if (noUnit && noUnit[2]) return { name: noUnit[2].trim(), amount: parseFloat(noUnit[1]) || 1, unit: "" };
    return { name: s, amount: 1, unit: "" };
  }

  async function handleSaveMeal() {
    if (savedState === "saving" || savedState === "unsaving") return;
    if (savedState === "saved" && savedId) {
      setSavedState("unsaving");
      try {
        await deleteRecipe(savedId);
        setSavedId(null);
        setSavedState("idle");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        setSavedState("saved");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }
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
        source_name: "wotoEAT Plan",
      };
      const result = await saveRecipe(recipe);
      setSavedId(result.id);
      setSavedState("saved");
      // C2/A7: brief toast pointing user to Recipes tab for editing
      setSavedBanner(language === "zh" ? "已保存 — 前往食谱编辑" : "Saved — tap Recipes to edit");
      setTimeout(() => setSavedBanner(null), 4000);
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
          <Text style={[cardStyles.metaText, { color: c.textMuted }]}>{meal.calories_per_serving} {language === "zh" ? "千卡/人份" : "kcal/serving"}</Text>
          <Ionicons name="time-outline" size={13} color={c.textMuted} style={{ marginLeft: 8 }} />
          <Text style={[cardStyles.metaText, { color: c.textMuted }]}>{meal.prep_time_mins} {t("min_label")}</Text>
        </View>
      </View>

      <Pressable style={cardStyles.body} onPress={() => { setShowDetail(true); Haptics.selectionAsync(); }}>
        <Text style={[cardStyles.name, { color: c.text }]}>{translatedName}</Text>
        <View style={cardStyles.rowMeta}>
          <Text style={[cardStyles.cuisine, { color: c.textMuted }]}>{meal.cuisine}</Text>
          <View style={[cardStyles.diffBadge, { backgroundColor: (DIFFICULTY_COLORS[meal.difficulty] ?? "#999") + "20" }]}>
            <Text style={[cardStyles.diffText, { color: DIFFICULTY_COLORS[meal.difficulty] ?? "#999" }]}>
              {translateDifficulty(meal.difficulty, language)}
            </Text>
          </View>
        </View>

        <View style={cardStyles.compsRow}>
          <CompChip icon="leaf" label={meal.components.vegetable} color="#16A34A" />
          <CompChip icon="fish" label={meal.components.protein} color="#2563EB" />
          <CompChip icon="ellipse" label={meal.components.staple} color="#D97706" />
        </View>

        {pantryMatches.length > 0 && (
          <View style={[cardStyles.pantryRow, { backgroundColor: c.successBg }]}>
            <Ionicons name="checkmark-circle" size={13} color="#16A34A" />
            <Text style={cardStyles.pantryText}>
              {t("using_from_pantry")} {pantryMatches.map(ingredientNameFrom).join(", ")}
            </Text>
          </View>
        )}
        <Text style={[cardStyles.tapHint, { color: c.textPlaceholder }]}>
          {language === "zh" ? "点击查看详情" : "Tap for details"}
        </Text>

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
            disabled={savedState === "saving" || savedState === "unsaving"}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {savedState === "saving" || savedState === "unsaving" ? (
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
            style={[cardStyles.confirmIconBtn, {
              borderColor: isConfirmed ? c.success : c.border,
              backgroundColor: isConfirmed ? c.successBg : "transparent",
            }]}
            onPress={handleConfirm}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isConfirmed ? "checkmark-circle" : "checkmark-circle-outline"}
              size={17}
              color={isConfirmed ? c.success : c.textMuted}
            />
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

        {cartBanner && (
          <View style={[cardStyles.cartBanner, { backgroundColor: c.successBg }]}>
            <Ionicons name="cart" size={13} color={c.success} />
            <Text style={[cardStyles.cartBannerText, { color: c.success }]}>{cartBanner}</Text>
          </View>
        )}
        {savedBanner && (
          <View style={[cardStyles.cartBanner, { backgroundColor: c.primaryLight }]}>
            <Ionicons name="bookmark" size={13} color={c.primary} />
            <Text style={[cardStyles.cartBannerText, { color: c.primary }]}>{savedBanner}</Text>
          </View>
        )}

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
              <View style={[cardStyles.diffBadge, { backgroundColor: (DIFFICULTY_COLORS[meal.difficulty] ?? "#999") + "20" }]}>
                <Text style={[cardStyles.diffText, { color: DIFFICULTY_COLORS[meal.difficulty] ?? "#999" }]}>{translateDifficulty(meal.difficulty, language)}</Text>
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

                {/* Serving size stepper */}
                <View style={cardStyles.servingsStepper}>
                  <TouchableOpacity
                    onPress={() => {
                      setDisplayServings((n) => Math.max(1, n - 1));
                      Haptics.selectionAsync();
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    disabled={displayServings <= 1}
                  >
                    <Ionicons name="remove-circle-outline" size={20} color={displayServings <= 1 ? c.disabled : c.textMuted} />
                  </TouchableOpacity>
                  <Text style={[cardStyles.servingsStepperText, { color: c.textSecondary }]}>
                    {strings.servings_people(displayServings)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setDisplayServings((n) => Math.min(12, n + 1));
                      Haptics.selectionAsync();
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    disabled={displayServings >= 12}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={displayServings >= 12 ? c.disabled : c.textMuted} />
                  </TouchableOpacity>
                </View>

                {translatedIngredients.map((ing, i) => {
                  const origIng = (meal.ingredients ?? [])[i] ?? ing;
                  const scaledIng = scaleIngredientStr(ing, scaleFactor);
                  const added = inCart(origIng);
                  return (
                    <View key={i} style={cardStyles.ingRow}>
                      <View style={[cardStyles.ingDot, { backgroundColor: c.primary }]} />
                      <Text style={[cardStyles.ingText, { color: c.textSecondary }]}>{scaledIng}</Text>
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

        {/* Detail modal */}
        <Modal visible={showDetail} transparent animationType="slide" onRequestClose={() => setShowDetail(false)}>
          <Pressable style={cardStyles.modalOverlay} onPress={() => setShowDetail(false)}>
            <Pressable style={[cardStyles.modalSheet, { backgroundColor: c.surface }]} onPress={(e) => e.stopPropagation()}>
              <SafeAreaViewRN edges={["bottom"]}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                  {/* Handle bar */}
                  <View style={[cardStyles.modalHandle, { backgroundColor: c.border }]} />

                  {/* Slot badge */}
                  <View style={[cardStyles.modalSlotBadge, { backgroundColor: accent + "18" }]}>
                    <View style={[cardStyles.slotIconWrap, { backgroundColor: accent }]}>
                      <Ionicons name={icon} size={14} color="#FFF" />
                    </View>
                    <Text style={[cardStyles.slotLabel, { color: accent }]}>
                      {meal.slot === "breakfast" ? t("breakfast") : meal.slot === "lunch" ? t("lunch") : t("dinner")}
                    </Text>
                  </View>

                  {/* Title + meta */}
                  <Text style={[cardStyles.modalTitle, { color: c.text }]}>{translatedName}</Text>
                  <View style={[cardStyles.rowMeta, { marginHorizontal: 20, marginBottom: 4 }]}>
                    <Text style={[cardStyles.cuisine, { color: c.textMuted }]}>{meal.cuisine}</Text>
                    <View style={[cardStyles.diffBadge, { backgroundColor: (DIFFICULTY_COLORS[meal.difficulty] ?? "#999") + "20" }]}>
                      <Text style={[cardStyles.diffText, { color: DIFFICULTY_COLORS[meal.difficulty] ?? "#999" }]}>
                        {translateDifficulty(meal.difficulty, language)}
                      </Text>
                    </View>
                    <View style={cardStyles.rowMeta}>
                      <Ionicons name="time-outline" size={13} color={c.textMuted} />
                      <Text style={[cardStyles.metaText, { color: c.textMuted }]}>{meal.prep_time_mins} {t("min_label")}</Text>
                    </View>
                  </View>

                  {/* Description */}
                  <Text style={[cardStyles.modalDesc, { color: c.textSecondary }]}>{translatedDescription}</Text>

                  {/* Macros */}
                  <View style={[cardStyles.macroRow, { paddingHorizontal: 20, marginBottom: 16 }]}>
                    <MacroCell label="kcal" value={String(meal.calories_per_serving)} color="#F59E0B" />
                    {meal.protein_g != null && <MacroCell label={t("macro_protein")} value={`${meal.protein_g}g`} color="#2563EB" />}
                    {meal.carbs_g != null && <MacroCell label={t("macro_carbs")} value={`${meal.carbs_g}g`} color="#16A34A" />}
                    {meal.fat_g != null && <MacroCell label={t("macro_fat")} value={`${meal.fat_g}g`} color="#D97706" />}
                    {meal.fiber_g != null && <MacroCell label={t("macro_fiber")} value={`${meal.fiber_g}g`} color="#7C3AED" />}
                  </View>

                  {/* Tags */}
                  {(meal.tags ?? []).length > 0 && (
                    <View style={[cardStyles.tags, { paddingHorizontal: 20, marginBottom: 16 }]}>
                      {(meal.tags ?? []).map((tag) => (
                        <View key={tag} style={[cardStyles.tag, { backgroundColor: c.chipBg }]}>
                          <Text style={[cardStyles.tagText, { color: c.textMuted }]}>{translateTag(tag, language)}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Serving stepper */}
                  <View style={[cardStyles.servingsStepper, { paddingHorizontal: 20, marginBottom: 8 }]}>
                    <TouchableOpacity onPress={() => { setDisplayServings((n) => Math.max(1, n - 1)); Haptics.selectionAsync(); }} disabled={displayServings <= 1} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="remove-circle-outline" size={22} color={displayServings <= 1 ? c.disabled : c.textMuted} />
                    </TouchableOpacity>
                    <Text style={[cardStyles.servingsStepperText, { color: c.textSecondary }]}>{strings.servings_people(displayServings)}</Text>
                    <TouchableOpacity onPress={() => { setDisplayServings((n) => Math.min(12, n + 1)); Haptics.selectionAsync(); }} disabled={displayServings >= 12} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="add-circle-outline" size={22} color={displayServings >= 12 ? c.disabled : c.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {/* Ingredients */}
                  {(meal.ingredients ?? []).length > 0 && (
                    <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                      <Text style={[cardStyles.recipeLabel, { color: c.text, marginBottom: 8 }]}>{t("ingredients_label")}</Text>
                      {translatedIngredients.map((ing, i) => {
                        const origIng = (meal.ingredients ?? [])[i] ?? ing;
                        const scaledIng = scaleIngredientStr(ing, scaleFactor);
                        const added = inCart(origIng);
                        return (
                          <View key={i} style={cardStyles.ingRow}>
                            <View style={[cardStyles.ingDot, { backgroundColor: c.primary }]} />
                            <Text style={[cardStyles.ingText, { color: c.textSecondary, flex: 1 }]}>{scaledIng}</Text>
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

                  {/* Steps */}
                  {(meal.steps ?? []).length > 0 && (
                    <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                      <Text style={[cardStyles.recipeLabel, { color: c.text, marginBottom: 8 }]}>{t("steps_label")}</Text>
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
                </ScrollView>

                {/* Modal footer actions */}
                <View style={[cardStyles.modalFooter, { borderColor: c.border }]}>
                  <TouchableOpacity
                    style={[cardStyles.modalActionBtn, { borderColor: c.border }]}
                    onPress={() => { setShowDetail(false); onRate("down"); onSwap(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                    disabled={swapping}
                  >
                    {swapping ? <ActivityIndicator size={14} color={c.error} /> : <Ionicons name="shuffle-outline" size={16} color={c.textMuted} />}
                    <Text style={[cardStyles.modalActionText, { color: c.textMuted }]}>{t("swap_meal")}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[cardStyles.modalActionBtn, { borderColor: c.border }]}
                    onPress={() => { handleSaveMeal(); }}
                    disabled={savedState === "saving"}
                  >
                    {savedState === "saving" ? <ActivityIndicator size={14} color={c.primary} /> : <Ionicons name={savedState === "saved" ? "bookmark" : "bookmark-outline"} size={16} color={c.primary} />}
                    <Text style={[cardStyles.modalActionText, { color: c.primary }]}>{savedState === "saved" ? t("saved") : t("save")}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[cardStyles.modalActionBtn, { borderColor: isConfirmed ? c.success : c.border, backgroundColor: isConfirmed ? c.successBg : "transparent" }]}
                    onPress={() => { handleConfirm(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }}
                  >
                    <Ionicons name={isConfirmed ? "checkmark-circle" : "checkmark-circle-outline"} size={16} color={isConfirmed ? c.success : c.textMuted} />
                    <Text style={[cardStyles.modalActionText, { color: isConfirmed ? c.success : c.textMuted }]}>{isConfirmed ? t("confirm") : t("confirm")}</Text>
                  </TouchableOpacity>
                </View>
              </SafeAreaViewRN>
            </Pressable>
          </Pressable>
        </Modal>
      </Pressable>
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
  const { profile, pantry, dailyPlan, setDailyPlan, patchDailyPlan, clearDailyPlan, language, ratings, setRating, servings, setPlanServings } = useAppStore();
  const router = useRouter();
  const { t } = useTranslation();
  const c = useTheme();

  const [loading, setLoading] = useState(false);
  const [swappingSlot, setSwappingSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Initialize from profile preferences so the user's saved cuisines are pre-selected
  const [cuisine, setCuisine] = useState(() => profile.cuisine_preferences?.[0] ?? "");
  const [flavour, setFlavour] = useState(() => profile.flavour_preference ?? "");
  const [maxTime, setMaxTime] = useState<number | null>(() => profile.preferred_max_prep_mins ?? null);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<MealTypeTag[]>(["any"]);
  const [showFindRecipe, setShowFindRecipe] = useState(false);

  const MEAL_TYPE_TAGS: { key: MealTypeTag; labelEn: string; labelZh: string }[] = [
    { key: "any", labelEn: "Any", labelZh: "随机" },
    { key: "breakfast", labelEn: "Breakfast", labelZh: "早餐" },
    { key: "lunch", labelEn: "Lunch", labelZh: "午餐" },
    { key: "dinner", labelEn: "Dinner", labelZh: "晚餐" },
  ];

  function toggleMealType(tag: MealTypeTag) {
    Haptics.selectionAsync();
    if (tag === "any") { setSelectedSlots(["any"]); return; }
    setSelectedSlots((prev) => {
      const without = prev.filter((s) => s !== "any" && s !== tag);
      const adding = !prev.includes(tag);
      const next = adding ? [...without, tag] : without;
      return next.length === 0 ? ["any"] : next;
    });
  }

  const sortedMeals = (dailyPlan?.meals ?? [])
    .slice()
    .sort((a, b) => (SLOT_ORDER[a.slot] ?? 0) - (SLOT_ORDER[b.slot] ?? 0))
    .filter((m) => selectedSlots.includes("any") || selectedSlots.includes(m.slot as MealTypeTag));

  const displayCalories = sortedMeals.reduce((s, m) => s + (m.calories_per_serving ?? 0), 0);

  const totalProteinG = dailyPlan?.meals.reduce((s, m) => s + (m.protein_g ?? 0), 0) ?? 0;
  const proteinGoal = profile.protein_goal_g;
  const showProtein = totalProteinG > 0 && !!proteinGoal;

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    // "any" → pass ["any"] so backend generates 1 random meal
    // specific selection → pass those slots
    const isAny = selectedSlots.includes("any");
    const targetSlots: string[] = isAny ? ["any"] : selectedSlots;
    try {
      const { plan } = await getDailyPlan(
        profile, pantry,
        cuisine.trim() || undefined,
        maxTime ?? undefined,
        language,
        Object.keys(ratings).length > 0 ? ratings : undefined,
        servings,
        targetSlots as ("breakfast" | "lunch" | "dinner")[],
        flavour.trim() || undefined,
      );

      if (isAny || !dailyPlan) {
        setDailyPlan(plan);
        setPlanServings(servings);
      } else {
        // Merge generated meals into the existing plan
        let merged = [...dailyPlan.meals];
        for (const newMeal of plan.meals) {
          merged = merged.filter((m) => m.slot !== newMeal.slot);
          merged.push(newMeal);
        }
        merged.sort((a, b) => (SLOT_ORDER[a.slot] ?? 0) - (SLOT_ORDER[b.slot] ?? 0));
        const newTotal = merged.reduce((s, m) => s + (m.calories_per_serving ?? 0), 0);
        patchDailyPlan({ ...dailyPlan, meals: merged, total_calories: newTotal });
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
      // patchDailyPlan preserves confirmedSlots (BUG-01)
      patchDailyPlan({ ...dailyPlan, meals: updatedMeals, total_calories: newTotal });
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
    const text = ["My wotoEAT Plan", "", ...lines, "", `Total: ${dailyPlan.total_calories} kcal`].join("\n");
    try { await Share.share({ message: text }); } catch { /* dismissed */ }
  }

  const styles = makeStyles(c);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Top bar: refresh + search + filters ── */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={[styles.topBarBtn, { borderColor: c.border, backgroundColor: c.surface }]}
            onPress={() => { clearDailyPlan(); Haptics.selectionAsync(); }}
          >
            <Ionicons name="refresh-outline" size={20} color={c.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.searchBarBtn, { borderColor: c.border, backgroundColor: c.surface }]}
            onPress={() => setShowFindRecipe(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="search-outline" size={15} color={c.textPlaceholder} />
            <Text style={[styles.searchBarText, { color: c.textPlaceholder }]}>{t("search_recipes")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.topBarBtn, { borderColor: showSettings ? c.primary : c.border, backgroundColor: showSettings ? c.primary : c.surface }]}
            onPress={() => { setShowSettings((v) => !v); Haptics.selectionAsync(); }}
          >
            <Ionicons name="options-outline" size={20} color={showSettings ? "#FFF" : c.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── Always-visible meal type tags ── */}
        <View style={styles.mealTypeRow}>
          {MEAL_TYPE_TAGS.map((tag) => {
            const active = selectedSlots.includes(tag.key);
            return (
              <TouchableOpacity
                key={tag.key}
                style={[styles.mealTypeChip, { backgroundColor: active ? c.primary : c.chipBg, borderColor: active ? c.primary : c.border }]}
                onPress={() => { toggleMealType(tag.key); Haptics.selectionAsync(); }}
              >
                <Text style={[styles.mealTypeChipText, { color: active ? "#FFF" : c.chipText }]}>
                  {language === "zh" ? tag.labelZh : tag.labelEn}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Collapsible filters panel ── */}
        {showSettings && (
          <View style={[styles.settingsPanel, { backgroundColor: c.surface, borderColor: c.border }]}>

            {/* Cuisine */}
            <Text style={[styles.filterLabel, { color: c.textMuted, marginTop: 10 }]}>{t("cuisine_pref")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {CUISINES.map((cu) => {
                  const active = cu === "Any" ? !cuisine.trim() : cuisine === cu;
                  return (
                    <TouchableOpacity
                      key={cu}
                      style={[styles.filterChip, { backgroundColor: c.chipBg, borderColor: c.border }, active && { backgroundColor: c.primary, borderColor: c.primary }]}
                      onPress={() => { setCuisine(cu === "Any" ? "" : cuisine === cu ? "" : cu); Haptics.selectionAsync(); }}
                    >
                      <Text style={[styles.filterChipText, { color: c.chipText }, active && { color: "#FFF", fontWeight: "700" }]}>
                        {translateCuisine(cu, language)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Flavour */}
            <Text style={[styles.filterLabel, { color: c.textMuted, marginTop: 10 }]}>{t("flavour_pref")}</Text>
            <View style={styles.filterChipRow}>
              {FLAVOUR_OPTIONS.map((f) => {
                const active = flavour === f.value;
                return (
                  <TouchableOpacity
                    key={f.value}
                    style={[styles.filterChip, { backgroundColor: c.chipBg, borderColor: c.border }, active && { backgroundColor: c.primary, borderColor: c.primary }]}
                    onPress={() => { setFlavour(active ? "" : f.value); Haptics.selectionAsync(); }}
                  >
                    <Text style={[styles.filterChipText, { color: c.chipText }, active && { color: "#FFF", fontWeight: "700" }]}>
                      {language === "zh" ? f.zh : f.en}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Prep time */}
            <Text style={[styles.filterLabel, { color: c.textMuted, marginTop: 10 }]}>{t("prep_time_pref")}</Text>
            <View style={styles.filterChipRow}>
              {PREP_TIME_PRESETS.map((p) => {
                const active = maxTime === p.value;
                return (
                  <TouchableOpacity
                    key={String(p.value)}
                    style={[styles.filterChip, { backgroundColor: c.chipBg, borderColor: c.border }, active && { backgroundColor: c.primary, borderColor: c.primary }]}
                    onPress={() => { setMaxTime(active ? null : p.value); Haptics.selectionAsync(); }}
                  >
                    <Text style={[styles.filterChipText, { color: c.chipText }, active && { color: "#FFF", fontWeight: "700" }]}>
                      {language === "zh" ? p.zh : p.en}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <FindRecipeModal visible={showFindRecipe} onClose={() => setShowFindRecipe(false)} />

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
              <Ionicons name="sparkles" size={28} color="#FFF" />
              <Text style={styles.generateBtnLargeText}>{t("generate_cta")}</Text>
            </>
          )}
        </TouchableOpacity>

        <ErrorBanner message={error} />

        {/* ── Plan section ── */}
        {dailyPlan && (
          <View style={styles.planSection}>
            {/* Summary row */}
            <View style={styles.summaryRow}>
              <View style={styles.totalBadge}>
                <Ionicons name="flame" size={14} color="#F59E0B" />
                <Text style={styles.totalText}>{displayCalories} {t("total_calories")}</Text>
              </View>
              <View style={styles.summaryActions}>
                <TouchableOpacity onPress={handleShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="share-outline" size={18} color={c.textMuted} />
                </TouchableOpacity>
              </View>
            </View>


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

        {sortedMeals.length === 0 && !loading && (
          <EmptyState
            icon="restaurant-outline"
            iconSize={48}
            title={t("no_plan_title")}
            body={t("no_plan_body")}
          />
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
  confirmIconBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cartBanner: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6 },
  cartBannerText: { fontSize: 12, fontWeight: "600" },
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
  servingsStepper: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  servingsStepperText: { fontSize: 13, fontWeight: "600" },
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
  tapHint: { fontSize: 11, marginTop: 4, marginBottom: 2 },
  // Detail modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", overflow: "hidden" },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 12 },
  modalSlotBadge: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 20, marginBottom: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, alignSelf: "flex-start" },
  modalTitle: { fontSize: 22, fontWeight: "800", marginHorizontal: 20, marginBottom: 6 },
  modalDesc: { fontSize: 14, lineHeight: 20, marginHorizontal: 20, marginBottom: 14 },
  modalFooter: { flexDirection: "row", borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, gap: 8 },
  modalActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderRadius: 12, paddingVertical: 10 },
  modalActionText: { fontSize: 13, fontWeight: "600" },
});

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, paddingBottom: 48, gap: 10 },
    // Top bar
    topBar: { flexDirection: "row", alignItems: "center", gap: 8 },
    topBarBtn: {
      width: 44, height: 44, borderRadius: 12, borderWidth: 1,
      alignItems: "center", justifyContent: "center", flexShrink: 0,
    },
    searchBarBtn: {
      flex: 1, height: 44, flexDirection: "row", alignItems: "center",
      gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14,
    },
    searchBarText: { fontSize: 14, flex: 1 },
    // Generate CTA
    generateBtnLarge: {
      alignItems: "center", justifyContent: "center",
      borderRadius: 20, paddingVertical: 28, gap: 8,
      shadowColor: c.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
    },
    generateBtnLargeText: { color: "#FFF", fontSize: 22, fontWeight: "800", letterSpacing: 0.3 },
    // Meal type tags (always visible)
    mealTypeRow: { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" },
    mealTypeChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    mealTypeChipText: { fontSize: 13, fontWeight: "600" },
    // Filters panel
    settingsPanel: { borderRadius: 14, borderWidth: 1, padding: 14 },
    filterLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
    filterChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    filterChipText: { fontSize: 13, fontWeight: "600" },
    // Plan
    planSection: { gap: 10 },
    summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    summaryActions: { flexDirection: "row", alignItems: "center", gap: 14 },
    totalBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: c.warningBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    totalText: { fontSize: 13, fontWeight: "700", color: c.warning },
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
  });
}
