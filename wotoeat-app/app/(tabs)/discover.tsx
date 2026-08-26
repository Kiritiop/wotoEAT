import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
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
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "@/store/useAppStore";
import { CUISINES, FLAVOUR_OPTIONS, PREP_TIME_PRESETS, SLOT_COLOUR, SLOT_ICON, DIFFICULTY_COLORS, translateTag, translateCuisine, translateDifficulty } from "@/constants/filters";
import { pantryNameMatches, ingredientNameFrom } from "@/utils/pantryMatch";
import { CookedSheet } from "@/components/CookedSheet";
import { SkeletonMealCard } from "@/components/SkeletonMealCard";
import { FadeSlideIn } from "@/components/ui/FadeSlideIn";
import { Collapsible } from "@/components/ui/Collapsible";
import { confirmAction } from "@/utils/confirm";
import { Button } from "@/components/ui/Button";
import { generateMeals, swapMeal, deleteRecipe, createShare, shareWebUrl, generateRecipeByName, apiErrorMessage } from "@/services/api";
import type { Recipe, Ingredient , DailyPlanMeal } from "@/services/api";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme } from "@/hooks/useTheme";
import { useBatchTranslated, useTranslated, usePantryDisplay } from "@/hooks/useDynamicTranslation";
import { shareText } from "@/utils/share";
import FindRecipeModal from "@/components/FindRecipeModal";
import { searchMealImage } from "@/services/imageSearch";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Chip } from "@/components/ui/Chip";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { GuestBanner } from "@/components/GuestBanner";
import { PinnedBar } from "@/components/ui/PinnedBar";
import type { Rating } from "@/store/useAppStore";
import { saveRecipeAndRate } from "@/utils/saveAndRate";

type MealTypeTag = "any" | "breakfast" | "lunch" | "dinner";

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

// Does a pantry name and an ingredient name refer to the same food?
// Word-aware (not raw substring) so "egg" no longer matches "eggplant", "oil"
// no longer matches "boiling water", and "soy sauce" no longer matches "fish
// sauce" — while plural/morphology (tomato↔tomatoes) still matches. Every word
// of the shorter name must match a word of the longer name; a word matches if
// equal or is a >=4-char prefix of the other. CJK has no whitespace word
// boundaries, so it falls back to containment.
// pantryNameMatches / ingredientNameFrom moved to utils/pantryMatch.ts so the
// cooked-consumption sheet shares the exact same matcher as the badge/auto-add.

function MacroCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={cardStyles.macroCell}>
      <Text style={[cardStyles.macroValue, { color }]}>{value}</Text>
      <Text style={cardStyles.macroLabel}>{label}</Text>
    </View>
  );
}

function MealSlotCardInner({
  meal, onRate, onSwap, swapping, onTagPress,
}: {
  meal: DailyPlanMeal;
  // Both take the meal they act on so the parent can hand every card the same
  // stable callback instance (see React.memo at the end of this component).
  onRate: (mealName: string, r: Rating) => void;
  onSwap: (meal: DailyPlanMeal) => void;
  swapping: boolean;
  onTagPress: (tag: string) => void;
}) {

  const [showInfo, setShowInfo] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showCooked, setShowCooked] = useState(false);
  const scrollStartY = useRef(0);
  const isConfirming = useRef(false);
  const c = useTheme();
  const { t, strings } = useTranslation();
  const { language, servings: storeServings, planServings, pantry, shoppingList, addToShoppingList, removeFromShoppingList, addRecipe, removeRecipe, selectedRecipes, replaceMeal, cookedMeals, isGuest } = useAppStore();
  const router = useRouter();
  const isCooked = cookedMeals.includes(meal.name);

  // Lazy step loading: the meal card is generated light (no steps/chef_tips) to
  // keep generation fast and under Groq's token-per-minute ceiling. Full steps
  // are fetched on demand the first time the user needs them (opens detail,
  // saves, or shares) via the cached /recipes/generate endpoint, then merged
  // back into the stored meal so they persist and only generate once.
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [stepsError, setStepsError] = useState(false);
  const hasSteps = (meal.steps ?? []).filter(Boolean).length > 0;

  async function ensureSteps(): Promise<{ steps: string[]; chef_tips: string[]; intro?: string | null }> {
    const current = { steps: meal.steps ?? [], chef_tips: meal.chef_tips ?? [], intro: meal.intro };
    if (hasSteps || loadingSteps) return current;
    setLoadingSteps(true);
    setStepsError(false);
    try {
      const full = await generateRecipeByName(meal.name, language, planServings || storeServings || 1);
      const enriched = {
        intro: meal.intro || full.intro,
        steps: full.steps?.length ? full.steps : current.steps,
        chef_tips: full.chef_tips?.length ? full.chef_tips : current.chef_tips,
      };
      replaceMeal(meal.name, { ...meal, ...enriched });
      return enriched;
    } catch {
      setStepsError(true);
      return current;
    } finally {
      setLoadingSteps(false);
    }
  }
  // N-13: derive confirmed from selectedRecipes for bidirectional sync with Shopping/Pantry tab
  const isConfirmed = useMemo(
    () => selectedRecipes.some((r) => r.title === meal.name),
    [selectedRecipes, meal.name],
  );

  // Pantry matching is O(ingredients x pantry) with a word-aware comparison per
  // pair, and it feeds the "In pantry" badges, the shopping auto-add, and the
  // detail rows. Memoized so it recomputes only when the pantry or the dish
  // changes, not on every render of every card in the stream (FIX-5).
  const ingInPantry = useCallback(
    (ing: string) => {
      const n = ingredientNameFrom(ing);
      return pantry.some((p) => pantryNameMatches(p.name, n));
    },
    [pantry],
  );
  const { pantryMatches, missingIngredients } = useMemo(() => {
    const all = meal.ingredients ?? [];
    const matches: string[] = [];
    const missing: string[] = [];
    for (const ing of all) (ingInPantry(ing) ? matches : missing).push(ing);
    return { pantryMatches: matches, missingIngredients: missing };
  }, [meal.ingredients, ingInPantry]);

  const [cartBanner, setCartBanner] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  function handleConfirm() {
    if (isConfirming.current) return;
    isConfirming.current = true;
    const willConfirm = !isConfirmed;
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
      if (toAdd.length > 0) {
        setCartBanner(language === "zh"
          ? `${toAdd.length} 个食材已加入购物车`
          : `${toAdd.length} item${toAdd.length !== 1 ? "s" : ""} added to cart`);
        setTimeout(() => setCartBanner(null), 3000);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      removeRecipe(meal.name);
      // Remove every shopping item this meal contributed. The meal-{name} group is
      // exclusive to this meal, so clearing it is robust even after a remount (where
      // the old per-instance autoAddedIngs list would be empty and leak stale items).
      const group = shoppingList?.groups.find((g) => g.category === cartCategory);
      group?.items.forEach((item) => removeFromShoppingList(cartCategory, item.name));
      setCartBanner(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    isConfirming.current = false;
  }

  // Serving size scaler — relative to the servings the plan was generated for
  const [displayServings, setDisplayServings] = useState(storeServings || 1);
  const scaleFactor = displayServings / (planServings || storeServings || 1);
  const accent = SLOT_COLOUR[meal.slot] ?? "#16A34A";
  const icon = (SLOT_ICON[meal.slot] ?? "restaurant") as React.ComponentProps<typeof Ionicons>["name"];
  const hasMacros = meal.protein_g != null || meal.carbs_g != null || meal.fat_g != null;

  // Dynamic AI translation — kicks in when language="zh" and content is English
  const translatedName = useTranslated(meal.name);
  const translatedIntro = useTranslated(meal.intro || meal.description);
  const translatedIngredients = useBatchTranslated(meal.ingredients ?? []);
  const translatedSteps = useBatchTranslated(meal.steps ?? []);
  const translatedChefTips = useBatchTranslated(meal.chef_tips ?? []);

  // Meal names are unique within a day (the seen-meals exclusion guarantees it),
  // so a "meal-" prefixed name is a safe, collision-free shopping category key.
  const cartCategory = `meal-${meal.name}`;
  const cartItems = useMemo(
    () => shoppingList?.groups.find((g) => g.category === cartCategory)?.items ?? [],
    [shoppingList, cartCategory],
  );
  // Normalize both sides so "200g chicken breast" matches cart item "chicken breast"
  const cartNames = useMemo(
    () => new Set(cartItems.map((i) => ingredientNameFrom(i.name))),
    [cartItems],
  );
  const inCart = useCallback((ing: string) => cartNames.has(ingredientNameFrom(ing)), [cartNames]);
  const allInCart = useMemo(() => {
    const all = meal.ingredients ?? [];
    return all.length > 0 && all.every(inCart);
  }, [meal.ingredients, inCart]);

  function toggleIngredient(ing: string) {
    if (inCart(ing)) removeFromShoppingList(cartCategory, ingredientNameFrom(ing));
    else addToShoppingList(cartCategory, ingredientNameFrom(ing));
    Haptics.selectionAsync();
  }

  function addAll() {
    if (allInCart) {
      (meal.ingredients ?? []).forEach((ing) => removeFromShoppingList(cartCategory, ingredientNameFrom(ing)));
    } else {
      (meal.ingredients ?? []).forEach((ing) => {
        if (!inCart(ing)) addToShoppingList(cartCategory, ingredientNameFrom(ing));
      });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // ── Save meal to My Recipes ───────────────────────────────────────────────
  const [savedState, setSavedState] = useState<"idle" | "saving" | "saved" | "unsaving">("idle");
  const [savedId, setSavedId] = useState<string | null>(null);

  const [mealImageUrl, setMealImageUrl] = useState<string | null>(null);
  const fetchedImageFor = useRef<string | null>(null);
  // Fetch the hero image lazily — only once the detail modal is opened, since
  // that is the sole place it renders. Avoids firing an image search per card
  // up-front for the whole meal stream.
  useEffect(() => {
    if (!showDetail || fetchedImageFor.current === meal.name) return;
    fetchedImageFor.current = meal.name;
    let active = true;
    searchMealImage(meal.name, meal.image_query, meal.cuisine, meal.description).then((url) => { if (active) setMealImageUrl(url); });
    return () => { active = false; };
    // image_query travels with the meal, so it never changes without the name
    // changing too; it is listed only to satisfy exhaustive-deps. The
    // fetchedImageFor guard is what actually prevents a refetch.
  }, [showDetail, meal.name, meal.image_query, meal.cuisine, meal.description]);

  const [sharing, setSharing] = useState(false);
  async function handleShareMeal() {
    if (sharing) return;
    setSharing(true);
    try {
      const { steps, chef_tips, intro } = await ensureSteps();
      const id = await createShare("meal", {
        title: meal.name,
        cuisine: meal.cuisine,
        intro: intro ?? meal.description,
        prep_time_mins: meal.prep_time_mins,
        calories_per_serving: meal.calories_per_serving,
        ingredients: meal.ingredients ?? [],
        steps,
        chef_tips,
        tags: meal.tags ?? [],
        protein_g: meal.protein_g, carbs_g: meal.carbs_g, fat_g: meal.fat_g, fiber_g: meal.fiber_g,
      });
      const outcome = await shareText(`${meal.name}\n${shareWebUrl(id)}`);
      if (outcome === "copied") {
        setSavedBanner(t("link_copied"));
        setTimeout(() => setSavedBanner(null), 3000);
      }
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSharing(false);
    }
  }

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
    // Saving is the one card action a guest cannot do — /recipes/save is
    // require_user_id. Send them to sign-up instead of firing a request that
    // can only come back 401 and buzz an error with no explanation.
    if (isGuest) {
      Haptics.selectionAsync();
      router.push("/auth/sign-up");
      return;
    }
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
      const { steps, chef_tips } = await ensureSteps();
      const recipe: Recipe = {
        title: meal.name,
        servings: storeServings || 1,
        prep_time_mins: meal.prep_time_mins,
        calories_per_serving: meal.calories_per_serving,
        ingredients: (meal.ingredients ?? []).map(parseIngredient),
        steps,
        chef_tips,
        tags: meal.tags ?? [],
        warnings: [],
        source_name: "wotoEAT Plan",
      };
      // saveRecipeAndRate records the "up" rating that feeds generation's
      // TASTE PROFILE block (the app's only positive taste signal).
      const result = await saveRecipeAndRate(recipe);
      setSavedId(result.id);
      setSavedState("saved");
      // C2/A7: brief toast pointing user to Recipes tab for editing
      setSavedBanner(t("meal_saved_toast"));
      setTimeout(() => setSavedBanner(null), 4000);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setSavedState("idle");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  return (
    <View style={[cardStyles.card, { backgroundColor: c.surface }]}>
      <View style={[cardStyles.slotHeader, { backgroundColor: accent }]}>
        <View style={[cardStyles.slotIconWrap, { backgroundColor: "rgba(255,255,255,0.25)" }]}>
          <Ionicons name={icon} size={16} color="#FFF" />
        </View>
        <Text style={[cardStyles.slotLabel, { color: "#FFF" }]}>
          {meal.slot === "breakfast" ? t("breakfast") : meal.slot === "lunch" ? t("lunch") : t("dinner")}
        </Text>
        <View style={[cardStyles.slotMeta, { backgroundColor: "rgba(255,255,255,0.22)" }]}>
          <Ionicons name="time-outline" size={13} color="#FFF" />
          <Text style={[cardStyles.metaText, { color: "#FFF" }]}>{meal.prep_time_mins} {t("min_label")}</Text>
        </View>
      </View>

      <Pressable style={cardStyles.body} onPress={() => { setShowDetail(true); ensureSteps(); Haptics.selectionAsync(); }}>
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
          <CompChip icon="leaf" label={meal.components?.vegetable ?? ""} color="#16A34A" />
          <CompChip icon="fish" label={meal.components?.protein ?? ""} color="#2563EB" />
          {!!meal.components?.staple && <CompChip icon="ellipse" label={meal.components.staple} color="#D97706" />}
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
          {t("tap_for_details")}
        </Text>

        <View style={cardStyles.ratingRow}>
          <TouchableOpacity
            style={[cardStyles.dislikeBtn, { borderColor: swapping ? c.error : c.border, backgroundColor: swapping ? c.errorBg : "transparent" }]}
            onPress={() => { onRate(meal.name, "down"); onSwap(meal); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
            disabled={swapping}
            accessibilityRole="button"
            accessibilityLabel={t("swap_meal")}
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
            accessibilityRole="button"
            accessibilityLabel={t("nutrition_info")}
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
            accessibilityRole="button"
            accessibilityLabel={savedState === "saved" ? t("saved") : t("save")}
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
            accessibilityRole="button"
            accessibilityLabel={isConfirmed ? t("unconfirm") : t("confirm")}
          >
            <Ionicons
              name={isConfirmed ? "checkmark-circle" : "checkmark-circle-outline"}
              size={17}
              color={isConfirmed ? c.success : c.textMuted}
            />
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
              <MacroCell label={t("calories_label")} value={String(meal.calories_per_serving)} color="#F59E0B" />
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
                <Text style={[cardStyles.componentText, { color: c.textSecondary }]}>{meal.components?.vegetable ?? ""}</Text>
              </View>
              <View style={cardStyles.componentRow}>
                <View style={[cardStyles.componentDot, { backgroundColor: "#2563EB" }]} />
                <Text style={[cardStyles.componentText, { color: c.textSecondary }]}>{meal.components?.protein ?? ""}</Text>
              </View>
              <View style={cardStyles.componentRow}>
                <View style={[cardStyles.componentDot, { backgroundColor: "#D97706" }]} />
                <Text style={[cardStyles.componentText, { color: c.textSecondary }]}>{meal.components?.staple ?? ""}</Text>
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


        {/* Detail modal */}
        <Modal visible={showDetail} transparent animationType="slide" onRequestClose={() => setShowDetail(false)}>
          <Pressable style={cardStyles.modalOverlay} onPress={() => setShowDetail(false)}>
            <Pressable style={[cardStyles.modalSheet, { backgroundColor: c.surface }]} onPress={(e) => e.stopPropagation()}>
              <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 24 }}
                  scrollEventThrottle={16}
                  onScrollBeginDrag={(e) => { scrollStartY.current = e.nativeEvent.contentOffset.y; }}
                  onScroll={(e) => { if (e.nativeEvent.contentOffset.y < -60) setShowDetail(false); }}
                  onScrollEndDrag={(e) => { if (e.nativeEvent.contentOffset.y <= 0 && scrollStartY.current <= 0) setShowDetail(false); }}
                >
                  {/* Handle bar */}
                  <View style={[cardStyles.modalHandle, { backgroundColor: c.border }]} />

                  {/* Hero image — shown only when a result is found */}
                  {mealImageUrl && (
                    <Image
                      source={{ uri: mealImageUrl }}
                      style={cardStyles.modalHeroImage}
                      contentFit="cover"
                      transition={200}
                      cachePolicy="memory-disk"
                    />
                  )}

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

                  {/* Intro (rich flavor description) when available, otherwise description */}
                  <Text style={[cardStyles.modalDesc, { color: c.textSecondary }]}>{translatedIntro}</Text>

                  {/* Macros */}
                  <View style={[cardStyles.macroRow, { paddingHorizontal: 20, marginBottom: 16 }]}>
                    <MacroCell label={t("calories_label")} value={String(meal.calories_per_serving)} color="#F59E0B" />
                    {meal.protein_g != null && <MacroCell label={t("macro_protein")} value={`${meal.protein_g}g`} color="#2563EB" />}
                    {meal.carbs_g != null && <MacroCell label={t("macro_carbs")} value={`${meal.carbs_g}g`} color="#16A34A" />}
                    {meal.fat_g != null && <MacroCell label={t("macro_fat")} value={`${meal.fat_g}g`} color="#D97706" />}
                    {meal.fiber_g != null && <MacroCell label={t("macro_fiber")} value={`${meal.fiber_g}g`} color="#7C3AED" />}
                  </View>

                  {/* Tags */}
                  {(meal.tags ?? []).filter(Boolean).length > 0 && (
                    <View style={[cardStyles.tags, { paddingHorizontal: 20, marginBottom: 16 }]}>
                      {(meal.tags ?? []).filter(Boolean).map((tag) => (
                        <TouchableOpacity
                          key={tag}
                          style={[cardStyles.tag, { backgroundColor: c.chipBg }]}
                          onPress={() => { onTagPress(tag); setShowDetail(false); Haptics.selectionAsync(); }}
                          activeOpacity={0.7}
                        >
                          <Text style={[cardStyles.tagText, { color: c.textMuted }]}>{translateTag(tag, language)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Serving stepper + add all */}
                  <View style={[cardStyles.servingsStepper, { paddingHorizontal: 20, marginBottom: 8, justifyContent: "space-between" }]}>
                    <View style={cardStyles.servingsStepper}>
                      <TouchableOpacity onPress={() => { setDisplayServings((n) => Math.max(1, n - 1)); Haptics.selectionAsync(); }} disabled={displayServings <= 1} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="remove-circle-outline" size={22} color={displayServings <= 1 ? c.disabled : c.textMuted} />
                      </TouchableOpacity>
                      <Text style={[cardStyles.servingsStepperText, { color: c.textSecondary }]}>{strings.servings_people(displayServings)}</Text>
                      <TouchableOpacity onPress={() => { setDisplayServings((n) => Math.min(12, n + 1)); Haptics.selectionAsync(); }} disabled={displayServings >= 12} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="add-circle-outline" size={22} color={displayServings >= 12 ? c.disabled : c.textMuted} />
                      </TouchableOpacity>
                    </View>
                    {(meal.ingredients ?? []).length > 0 && (
                      <TouchableOpacity
                        style={[cardStyles.addAllBtn, { borderColor: allInCart ? c.error : c.border, backgroundColor: allInCart ? c.errorBg : "transparent" }]}
                        onPress={addAll}
                      >
                        <Ionicons name={allInCart ? "cart" : "cart-outline"} size={12} color={allInCart ? c.error : c.textMuted} />
                        <Text style={[cardStyles.addAllText, { color: allInCart ? c.error : c.textMuted }]}>
                          {allInCart ? t("remove_all_from_cart") : t("add_all_to_cart")}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Ingredients */}
                  {(meal.ingredients ?? []).length > 0 && (
                    <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                      <Text style={[cardStyles.recipeLabel, { color: c.text, marginBottom: 8 }]}>{t("ingredients_label")}</Text>
                      {translatedIngredients.map((ing, i) => {
                        const origIng = (meal.ingredients ?? [])[i] ?? ing;
                        const scaledIng = scaleIngredientStr(ing, scaleFactor);
                        const added = inCart(origIng);
                        const haveIt = ingInPantry(origIng);
                        return (
                          <View key={i} style={cardStyles.ingRow}>
                            <View style={[cardStyles.ingDot, { backgroundColor: haveIt ? "#16A34A" : c.primary }]} />
                            <Text style={[cardStyles.ingText, { color: c.textSecondary, flex: 1 }]}>{scaledIng}</Text>
                            {haveIt && (
                              <View style={[cardStyles.inPantryTag, { backgroundColor: c.successBg }]}>
                                <Ionicons name="checkmark-circle" size={11} color="#16A34A" />
                                <Text style={cardStyles.inPantryTagText}>{t("in_pantry")}</Text>
                              </View>
                            )}
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

                  {/* Steps — lazily fetched the first time the modal opens */}
                  <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                    <Text style={[cardStyles.recipeLabel, { color: c.text, marginBottom: 8 }]}>{t("steps_label")}</Text>
                    {loadingSteps && translatedSteps.filter(Boolean).length === 0 && (
                      <View style={cardStyles.stepRow}>
                        <ActivityIndicator size="small" color={c.primary} />
                        <Text style={[cardStyles.stepText, { color: c.textMuted }]}>{t("loading")}</Text>
                      </View>
                    )}
                    {stepsError && translatedSteps.filter(Boolean).length === 0 && (
                      <TouchableOpacity style={cardStyles.stepRow} onPress={ensureSteps}>
                        <Ionicons name="refresh" size={16} color={c.primary} />
                        <Text style={[cardStyles.stepText, { color: c.primary }]}>{t("retry")}</Text>
                      </TouchableOpacity>
                    )}
                    {translatedSteps.filter(Boolean).map((step, i) => (
                      <View key={i} style={cardStyles.stepRow}>
                        <View style={[cardStyles.stepNum, { backgroundColor: c.primary }]}>
                          <Text style={cardStyles.stepNumText}>{i + 1}</Text>
                        </View>
                        <Text style={[cardStyles.stepText, { color: c.textSecondary }]}>{step}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Chef's tips */}
                  {translatedChefTips.filter(Boolean).length > 0 && (
                    <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                      <Text style={[cardStyles.recipeLabel, { color: c.text, marginBottom: 8 }]}>{t("chef_tips_label")}</Text>
                      {translatedChefTips.filter(Boolean).map((tip, i) => (
                        <View key={i} style={[cardStyles.tipRow, { backgroundColor: c.primaryLight }]}>
                          <Ionicons name="bulb-outline" size={14} color={c.primary} style={{ flexShrink: 0, marginTop: 1 }} />
                          <Text style={[cardStyles.tipText, { color: c.text }]}>{tip}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* I cooked this — pantry-loop Phase 2 (consumption review) */}
                  <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
                    <Button
                      label={isCooked ? t("cooked_done") : t("cooked_it")}
                      icon={isCooked ? "checkmark-circle" : "restaurant-outline"}
                      variant={isCooked ? "secondary" : "primary"}
                      disabled={isCooked}
                      onPress={() => setShowCooked(true)}
                    />
                  </View>
                </ScrollView>

                {/* Modal footer actions */}
                <View style={[cardStyles.modalFooter, { borderColor: c.border }]}>
                  <TouchableOpacity
                    style={[cardStyles.modalActionBtn, { borderColor: c.border }]}
                    onPress={() => { setShowDetail(false); onRate(meal.name, "down"); onSwap(meal); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                    disabled={swapping}
                  >
                    {swapping ? <ActivityIndicator size={14} color={c.error} /> : <Ionicons name="shuffle-outline" size={16} color={c.textMuted} />}
                    <Text style={[cardStyles.modalActionText, { color: c.textMuted }]}>{t("swap_meal")}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[cardStyles.modalActionBtn, { borderColor: c.border }]}
                    onPress={handleShareMeal}
                    disabled={sharing}
                  >
                    {sharing ? <ActivityIndicator size={14} color={c.textMuted} /> : <Ionicons name="share-outline" size={16} color={c.textMuted} />}
                    <Text style={[cardStyles.modalActionText, { color: c.textMuted }]}>{t("share")}</Text>
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
                    <Text style={[cardStyles.modalActionText, { color: isConfirmed ? c.success : c.textMuted }]}>{isConfirmed ? t("unconfirm") : t("confirm")}</Text>
                  </TouchableOpacity>
                </View>

                {/* Nested inside the detail modal's subtree so it presents above it */}
                <CookedSheet
                  visible={showCooked}
                  mealName={meal.name}
                  ingredients={meal.ingredients ?? []}
                  onClose={() => setShowCooked(false)}
                />
              </SafeAreaView>
            </Pressable>
          </Pressable>
        </Modal>
      </Pressable>
    </View>
  );
}

/**
 * Memoized: the parent re-renders on every keystroke in the filter panel, and
 * without this every card in the stream re-ran its pantry matching and cart
 * scans each time (FIX-5). The parent passes referentially stable callbacks
 * (see `latestCardHandlers` in TodayScreen), so the default shallow prop
 * comparison is enough: `meal` and `swapping` are the only props that move.
 */
const MealSlotCard = memo(MealSlotCardInner);

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
  const { profile, pantry, meals, seenMeals, addMeal, replaceMeal, clearMeals, addSeenMeals, language, ratings, setRating, servings, setPlanServings, removeRecipe, shoppingList, removeFromShoppingList } = useAppStore();
  const { t } = useTranslation();
  const c = useTheme();
  // Pantry names are stored canonical English; chips display per-language while
  // selection state / required_ingredients keep the raw stored values.
  const pantryDisplayNames = usePantryDisplay(pantry.map((p) => p.name));

  const [loading, setLoading] = useState(false);
  const [swappingName, setSwappingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState(false);
  const [planCached, setPlanCached] = useState(false);
  // Initialize from profile preferences so the user's saved cuisines are pre-selected
  const [cuisines, setCuisines] = useState<string[]>(() => profile.cuisine_preferences ?? []);
  const [flavour, setFlavour] = useState(() => profile.flavour_preference ?? "");
  const [maxTime, setMaxTime] = useState<number | null>(() => profile.preferred_max_prep_mins ?? null);

  // Tab screens stay mounted, so a lazy initializer alone would keep stale
  // defaults after the user edits their preferences in the Profile tab —
  // re-sync whenever the saved profile preferences actually change.
  const cuisinePrefKey = (profile.cuisine_preferences ?? []).join("\x00");
  useEffect(() => {
    setCuisines(profile.cuisine_preferences ?? []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuisinePrefKey]);
  useEffect(() => {
    setFlavour(profile.flavour_preference ?? "");
  }, [profile.flavour_preference]);
  useEffect(() => {
    setMaxTime(profile.preferred_max_prep_mins ?? null);
  }, [profile.preferred_max_prep_mins]);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<MealTypeTag[]>(["any"]);
  const [mealStyle, setMealStyle] = useState<"full" | "main_dish">("full");
  // Persisted preferences (store-backed): the ingredients/tags a user requires
  // in generated meals survive app restarts instead of resetting every session.
  const { requiredIngredients, setRequiredIngredients, selectedPantryItems, setSelectedPantryItems } = useAppStore();
  const [ingredientDraft, setIngredientDraft] = useState("");
  // Ignore pantry selections whose item has since been deleted from the pantry.
  const livePantryItems = selectedPantryItems.filter((s) =>
    pantry.some((p) => p.name.toLowerCase() === s.toLowerCase()),
  );
  const [showFindRecipe, setShowFindRecipe] = useState(false);

  const MEAL_TYPE_TAGS: { key: MealTypeTag; labelEn: string; labelZh: string }[] = [
    { key: "any", labelEn: "Auto", labelZh: "自动" },
    { key: "breakfast", labelEn: "Breakfast", labelZh: "早餐" },
    { key: "lunch", labelEn: "Lunch", labelZh: "午餐" },
    { key: "dinner", labelEn: "Dinner", labelZh: "晚餐" },
  ];

  function toggleMealType(tag: MealTypeTag) {
    Haptics.selectionAsync();
    // Single-select: each generation produces exactly one meal
    if (tag === "any" || selectedSlots.includes(tag)) {
      setSelectedSlots(["any"]);
    } else {
      setSelectedSlots([tag]);
    }
  }

  // Newest meals first; the meal-type chips act as a visible-list filter.
  const sortedMeals = meals
    .slice()
    .reverse()
    .filter((m) => selectedSlots.includes("any") || selectedSlots.includes(m.slot as MealTypeTag));

  const totalProteinG = meals.reduce((s, m) => s + (m.protein_g ?? 0), 0);
  const proteinGoal = profile.protein_goal_g;
  const showProtein = totalProteinG > 0 && !!proteinGoal;

  // Clearing wipes today's whole meal stream + confirmations, so confirm first.
  // No prompt when empty.
  function handleClearMeals() {
    if (meals.length === 0) return;
    confirmAction({
      title: t("clear_meals_title"),
      message: t("clear_meals_confirm"),
      confirmLabel: t("clear"),
      cancelLabel: t("cancel"),
      destructive: true,
    }, () => { clearMeals(); Haptics.selectionAsync(); });
  }

  async function handleGenerate() {
    setShowSettings(false);
    setLoading(true);
    setError(null);
    setFilterError(false);
    const isAny = selectedSlots.includes("any");
    let targetSlots: string[];
    if (isAny) {
      const hour = new Date().getHours();
      const inferred = hour >= 5 && hour < 11 ? "breakfast" : hour >= 11 && hour < 15 ? "lunch" : "dinner";
      targetSlots = [inferred];
    } else {
      targetSlots = selectedSlots;
    }
    try {
      const { plan, cached } = await generateMeals(
        profile, pantry,
        cuisines.length > 0 ? cuisines.join(", ") : undefined,
        maxTime ?? undefined,
        language,
        Object.keys(ratings).length > 0 ? ratings : undefined,
        servings,
        targetSlots as ("breakfast" | "lunch" | "dinner")[],
        flavour.trim() || undefined,
        [...livePantryItems, ...requiredIngredients].join(", ") || undefined,
        mealStyle,
        seenMeals,
      );

      setPlanCached(cached);
      // Append every returned meal to the growing stream; track names so the
      // same dish is never suggested again today.
      for (const newMeal of plan.meals) {
        addMeal(newMeal);
        addSeenMeals([newMeal.name]);
      }
      setPlanServings(servings);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      const status = (e as any)?.response?.status;
      const detail: string = (e as any)?.response?.data?.detail ?? "";
      const hasFilters = requiredIngredients.length > 0 || livePantryItems.length > 0;
      const isNoMatch = detail.toLowerCase().includes("no dish") || detail.toLowerCase().includes("required tags");
      if (status === 422 && hasFilters && isNoMatch) {
        setError(
          language === "zh"
            ? "没有菜肴能同时满足所有所选标签，请减少筛选条件后重试。"
            : "No dish can satisfy all selected tags. Try removing one or more filters.",
        );
        setFilterError(true);
      } else if ((status === 422 || status === 500) && hasFilters) {
        setError(
          language === "zh"
            ? "部分筛选标签或食材无法识别，请清除筛选条件后重试。"
            : "Some selected tags or ingredients couldn't be processed. Clear filters and try again.",
        );
        setFilterError(true);
      } else {
        setError(apiErrorMessage(e, t("could_not_generate")));
        setFilterError(false);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSwap(meal: DailyPlanMeal) {
    setSwappingName(meal.name);
    setError(null);
    try {
      const newMeal = await swapMeal(
        meal.slot,
        profile,
        pantry,
        language,
        cuisines.length > 0 ? cuisines.join(", ") : undefined,
        flavour.trim() || undefined,
        maxTime ?? undefined,
        [...livePantryItems, ...requiredIngredients].join(", ") || undefined,
        mealStyle,
        seenMeals,
      );
      replaceMeal(meal.name, newMeal);
      addSeenMeals([newMeal.name]);
      // Clear the old meal's confirmation and shopping list entries
      removeRecipe(meal.name);
      const oldCategory = `meal-${meal.name}`;
      const oldGroup = shoppingList?.groups.find((g) => g.category === oldCategory);
      if (oldGroup) {
        oldGroup.items.forEach((item) => removeFromShoppingList(oldCategory, item.name));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      const status = (e as any)?.response?.status;
      const detail: string = (e as any)?.response?.data?.detail ?? "";
      const hasFilters = requiredIngredients.length > 0 || livePantryItems.length > 0;
      const isNoMatch = detail.toLowerCase().includes("no dish") || detail.toLowerCase().includes("required tags");
      if (status === 422 && hasFilters && isNoMatch) {
        setError(
          language === "zh"
            ? "没有菜肴能同时满足所有所选标签，请减少筛选条件后重试。"
            : "No dish can satisfy all selected tags. Try removing one or more filters.",
        );
        setFilterError(true);
      } else {
        setError(apiErrorMessage(e, t("could_not_swap")));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSwappingName(null);
    }
  }

  // MealSlotCard is memoized, which only pays off if its callbacks keep a stable
  // identity. Each wrapper below is created once and reads the current closure
  // from this ref, which the parent refreshes on every render, so the handlers
  // are never stale even though their identity never changes (FIX-5).
  const latestCardHandlers = useRef({ handleSwap, setRating, setShowSettings, requiredIngredients, setRequiredIngredients });
  latestCardHandlers.current = { handleSwap, setRating, setShowSettings, requiredIngredients, setRequiredIngredients };

  const handleCardRate = useCallback((mealName: string, r: Rating) => {
    latestCardHandlers.current.setRating(mealName, r);
  }, []);
  const handleCardSwap = useCallback((m: DailyPlanMeal) => {
    void latestCardHandlers.current.handleSwap(m);
  }, []);
  const handleCardTagPress = useCallback((tag: string) => {
    const h = latestCardHandlers.current;
    h.setShowSettings(true);
    if (!h.requiredIngredients.includes(tag)) {
      h.setRequiredIngredients([...h.requiredIngredients, tag]);
    }
    Haptics.selectionAsync();
  }, []);

  const styles = useMemo(() => makeStyles(c), [c]);
  const hour = new Date().getHours();
  const greeting =
    language === "zh"
      ? hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好"
      : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const subGreeting = language === "zh" ? "用现有食材，做真正的好菜" : "Real dishes from what you've got";

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        greeting={greeting}
        subtitle={subGreeting}
        right={
          <TouchableOpacity
            style={[styles.topBarBtn, { borderColor: showSettings ? c.primary : c.border, backgroundColor: showSettings ? c.primary : c.surface }]}
            onPress={() => { setShowSettings((v) => !v); Haptics.selectionAsync(); }}
            accessibilityRole="button"
            accessibilityLabel={t("filters")}
          >
            <Ionicons name="options-outline" size={20} color={showSettings ? "#FFF" : c.textMuted} />
          </TouchableOpacity>
        }
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Renders nothing unless the visitor is browsing without an account. */}
        <GuestBanner />

        {/* ── Search + refresh ── */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={[styles.searchBarBtn, { borderColor: c.border, backgroundColor: c.surface }]}
            onPress={() => setShowFindRecipe(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="search-outline" size={15} color={c.textPlaceholder} />
            <Text style={[styles.searchBarText, { color: c.textPlaceholder }]}>{t("search_recipes")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.topBarBtn, { borderColor: c.border, backgroundColor: c.surface }]}
            onPress={handleClearMeals}
            accessibilityRole="button"
            accessibilityLabel={t("clear")}
          >
            <Ionicons name="refresh-outline" size={20} color={c.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── Meal-type chips (always visible — the most-used filter) ── */}
        <View style={styles.slotChipRow}>
          {MEAL_TYPE_TAGS.map((tag) => (
            <Chip
              key={tag.key}
              label={language === "zh" ? tag.labelZh : tag.labelEn}
              active={selectedSlots.includes(tag.key)}
              onPress={() => toggleMealType(tag.key)}
            />
          ))}
        </View>

        {/* ── Collapsible filters panel: animates both directions (UI-4). Kept
             mounted so closing can animate too, and so the tag draft survives. ── */}
        <Collapsible open={showSettings}>
          <View style={[styles.settingsPanel, { backgroundColor: c.surface, borderColor: c.border }]}>

            {/* Meal style */}
            <Text style={[styles.filterLabel, { color: c.textMuted }]}>{t("meal_style_label")}</Text>
            <View style={styles.filterChipRow}>
              {([{ key: "full", en: "Full Meal", zh: "完整餐" }, { key: "main_dish", en: "Main Dish", zh: "主菜" }] as const).map((opt) => (
                <Chip
                  key={opt.key}
                  label={language === "zh" ? opt.zh : opt.en}
                  active={mealStyle === opt.key}
                  onPress={() => { setMealStyle(opt.key); Haptics.selectionAsync(); }}
                />
              ))}
            </View>

            {/* Required tags / ingredients — chip accumulator */}
            <Text style={[styles.filterLabel, { color: c.textMuted, marginTop: 10 }]}>
              {t("include_tags_label")}
            </Text>
            {requiredIngredients.length > 0 && (
              <View style={[styles.filterChipRow, { marginBottom: 6 }]}>
                {requiredIngredients.map((ing) => (
                  <Chip
                    key={ing}
                    label={ing}
                    active
                    onPress={() => {}}
                    onClose={() => { setRequiredIngredients(requiredIngredients.filter((x) => x !== ing)); Haptics.selectionAsync(); }}
                  />
                ))}
              </View>
            )}
            <View style={[styles.ingSearchRow, { backgroundColor: c.inputBg, borderColor: ingredientDraft.trim() ? c.primary : c.border }]}>
              <Ionicons name="pricetag-outline" size={15} color={ingredientDraft.trim() ? c.primary : c.textPlaceholder} />
              <TextInput
                style={[styles.ingSearchInput, { color: c.text }]}
                placeholder={t("add_tag_or_ingredient")}
                placeholderTextColor={c.textPlaceholder}
                value={ingredientDraft}
                onChangeText={setIngredientDraft}
                returnKeyType="done"
                autoCapitalize="none"
                onSubmitEditing={() => {
                  const v = ingredientDraft.trim();
                  if (v && !requiredIngredients.includes(v)) {
                    setRequiredIngredients([...requiredIngredients, v]);
                    Haptics.selectionAsync();
                  }
                  setIngredientDraft("");
                }}
              />
              {ingredientDraft.length > 0 && (
                <TouchableOpacity onPress={() => setIngredientDraft("")} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="close-circle" size={15} color={c.textPlaceholder} />
                </TouchableOpacity>
              )}
            </View>

            {/* Pantry recommendations */}
            {pantry.length > 0 && (
              <>
                <Text style={[styles.filterLabel, { color: c.textMuted, marginTop: 10 }]}>{t("from_pantry")}</Text>
                <View style={styles.filterChipRow}>
                  {pantry.map((item, idx) => {
                    const active = selectedPantryItems.map(s => s.toLowerCase()).includes(item.name.toLowerCase());
                    return (
                      <Chip
                        key={item.name}
                        label={pantryDisplayNames[idx] ?? item.name}
                        active={active}
                        onPress={() => {
                          setSelectedPantryItems(
                            active
                              ? selectedPantryItems.filter(s => s.toLowerCase() !== item.name.toLowerCase())
                              : [...selectedPantryItems, item.name]
                          );
                          Haptics.selectionAsync();
                        }}
                      />
                    );
                  })}
                </View>
              </>
            )}

            {/* Cuisine */}
            <Text style={[styles.filterLabel, { color: c.textMuted, marginTop: 10 }]}>{t("cuisine_pref")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {CUISINES.map((cu) => (
                  <Chip
                    key={cu}
                    label={translateCuisine(cu, language)}
                    active={cu === "Any" ? cuisines.length === 0 : cuisines.includes(cu)}
                    onPress={() => { if (cu === "Any") { setCuisines([]); } else { setCuisines((prev) => prev.includes(cu) ? prev.filter((c) => c !== cu) : [...prev, cu]); } Haptics.selectionAsync(); }}
                  />
                ))}
              </View>
            </ScrollView>

            {/* Flavour */}
            <Text style={[styles.filterLabel, { color: c.textMuted, marginTop: 10 }]}>{t("flavour_pref")}</Text>
            <View style={styles.filterChipRow}>
              {FLAVOUR_OPTIONS.map((f) => {
                const active = flavour === f.value;
                return (
                  <Chip
                    key={f.value}
                    label={language === "zh" ? f.zh : f.en}
                    active={active}
                    onPress={() => { setFlavour(active ? "" : f.value); Haptics.selectionAsync(); }}
                  />
                );
              })}
            </View>

            {/* Prep time */}
            <Text style={[styles.filterLabel, { color: c.textMuted, marginTop: 10 }]}>{t("prep_time_pref")}</Text>
            <View style={styles.filterChipRow}>
              {PREP_TIME_PRESETS.map((p) => {
                const active = maxTime === p.value;
                return (
                  <Chip
                    key={String(p.value)}
                    label={language === "zh" ? p.zh : p.en}
                    active={active}
                    onPress={() => { setMaxTime(active ? null : p.value); Haptics.selectionAsync(); }}
                  />
                );
              })}
            </View>
          </View>
        </Collapsible>

        <FindRecipeModal visible={showFindRecipe} onClose={() => setShowFindRecipe(false)} />

        <ErrorBanner message={error} />
        {filterError && (
          <TouchableOpacity
            style={[styles.clearFilterBtn, { backgroundColor: c.errorBg, borderColor: c.error }]}
            onPress={() => {
              setRequiredIngredients([]);
              setSelectedPantryItems([]);
              setFilterError(false);
              setError(null);
            }}
          >
            <Ionicons name="close-circle-outline" size={14} color={c.error} />
            <Text style={[styles.clearFilterText, { color: c.error }]}>
              {t("clear_filters")}
            </Text>
          </TouchableOpacity>
        )}

        {/* Generation in flight: skeleton card where the new meal will land */}
        {loading && <SkeletonMealCard />}

        {/* ── Meal stream section ── */}
        {meals.length > 0 && (
          <View style={styles.planSection}>
            {/* Summary row */}
            {planCached && (
              <View style={styles.summaryRow}>
                <View style={styles.summaryActions}>
                  <Text style={[styles.cachedLabel, { color: c.textMuted }]}>
                    {t("cached_label")}
                  </Text>
                </View>
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

            {/* Meal cards — keyed by name, so a new/swapped meal remounts and
                animates in while existing cards stay still */}
            {sortedMeals.map((meal) => (
              <FadeSlideIn key={meal.name}>
                <MealSlotCard
                  meal={meal}
                  onRate={handleCardRate}
                  onSwap={handleCardSwap}
                  swapping={swappingName === meal.name}
                  onTagPress={handleCardTagPress}
                />
              </FadeSlideIn>
            ))}

          </View>
        )}

        {meals.length === 0 && !loading && (
          <View style={styles.welcomeWrap}>
            <View style={[styles.stepsCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              {([
                { icon: "basket", color: "#F59E0B", text: t("welcome_step1") },
                { icon: "sparkles", color: "#16A34A", text: t("welcome_step2") },
                { icon: "cart", color: "#6366F1", text: t("welcome_step3") },
              ] as const).map((s, i) => (
                <View
                  key={s.icon}
                  style={[
                    styles.stepRowW,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.borderLight },
                  ]}
                >
                  <View style={[styles.stepBadge, { backgroundColor: s.color }]}>
                    <Ionicons name={s.icon as any} size={18} color="#FFF" />
                  </View>
                  <Text style={[styles.stepTextW, { color: c.textSecondary }]}>{s.text}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Meals exist but the active meal-type chip filters them all out —
            a filter state, not a new user, so don't show the getting-started steps. */}
        {meals.length > 0 && sortedMeals.length === 0 && !loading && (
          <View style={styles.filterEmptyWrap}>
            <Ionicons name="funnel-outline" size={26} color={c.textPlaceholder} />
            <Text style={[styles.filterEmptyText, { color: c.textMuted }]}>{t("no_meals_for_filter")}</Text>
          </View>
        )}
      </ScrollView>

      {/* ── Pinned primary action — stays in the thumb zone as the stream grows ── */}
      <PinnedBar>
        <TouchableOpacity onPress={handleGenerate} disabled={loading} activeOpacity={0.9}>
          <View style={[styles.generateFab, { backgroundColor: loading ? c.disabled : c.primary }]}>
            {loading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Ionicons name="sparkles" size={20} color="#FFF" />
                <Text style={styles.generateFabText}>{t("generate_cta")}</Text>
              </>
            )}
          </View>
        </TouchableOpacity>
      </PinnedBar>
    </SafeAreaView>
  );
}

// ── Shared card styles ────────────────────────────────────────────────────────
const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 22, overflow: "hidden",
    shadowColor: "#2A2118", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07, shadowRadius: 14, elevation: 3,
  },
  slotHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 9 },
  slotIconWrap: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  slotLabel: { fontSize: 13, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
  slotMeta: { flexDirection: "row", alignItems: "center", marginLeft: "auto", gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
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
  dislikeBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  dislikeText: { fontSize: 12, fontWeight: "600" },
  infoIconBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  saveIconBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  confirmIconBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
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
  inPantryTag: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, flexShrink: 0 },
  inPantryTagText: { fontSize: 10, fontWeight: "700", color: "#16A34A" },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  stepNum: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  stepNumText: { fontSize: 11, fontWeight: "800", color: "#FFF" },
  stepText: { fontSize: 13, lineHeight: 18, flex: 1 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, padding: 10, marginBottom: 6 },
  tipText: { fontSize: 13, lineHeight: 18, flex: 1 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 },
  tagText: { fontSize: 12 },
  findBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  findBtnText: { fontSize: 13, fontWeight: "600", flex: 1 },
  tapHint: { fontSize: 11, marginTop: 4, marginBottom: 2 },
  // Detail modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "90%", overflow: "hidden" },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 12 },
  modalSlotBadge: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 20, marginBottom: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, alignSelf: "flex-start" },
  modalTitle: { fontSize: 22, fontWeight: "800", marginHorizontal: 20, marginBottom: 6 },
  modalDesc: { fontSize: 14, lineHeight: 20, marginHorizontal: 20, marginBottom: 14 },
  modalFooter: { flexDirection: "row", borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, gap: 8 },
  modalActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderRadius: 12, paddingVertical: 10 },
  modalActionText: { fontSize: 13, fontWeight: "600" },
  modalHeroImage: { width: "100%", height: 200 },
});

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 10 },
    slotChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    welcomeWrap: { paddingTop: 8, paddingBottom: 8, gap: 10, alignItems: "center" },
    filterEmptyWrap: { paddingTop: 40, paddingHorizontal: 32, gap: 10, alignItems: "center" },
    filterEmptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
    stepsCard: {
      width: "100%", borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, marginTop: 6,
      shadowColor: c.shadow, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05, shadowRadius: 12, elevation: 1,
    },
    stepRowW: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 15 },
    stepBadge: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    stepTextW: { flex: 1, fontSize: 14, fontWeight: "600", lineHeight: 19 },
    // Top bar
    topBar: { flexDirection: "row", alignItems: "center", gap: 8 },
    topBarBtn: {
      width: 48, height: 48, borderRadius: 16, borderWidth: 1,
      alignItems: "center", justifyContent: "center", flexShrink: 0,
    },
    searchBarBtn: {
      flex: 1, height: 48, flexDirection: "row", alignItems: "center",
      gap: 8, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16,
    },
    searchBarText: { fontSize: 14, flex: 1 },
    // Generate CTA — pinned FAB in the thumb zone
    generateFab: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      borderRadius: 18, paddingVertical: 16, gap: 8,
      shadowColor: c.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
    },
    generateFabText: { color: "#FFF", fontSize: 17, fontWeight: "800", letterSpacing: 0.3 },
    ingSearchRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
    ingSearchInput: { flex: 1, fontSize: 13, paddingVertical: 0 },
    // Filters panel
    settingsPanel: { borderRadius: 20, borderWidth: 1, padding: 16 },
    filterLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
    filterChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    clearFilterBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, marginTop: 6, alignSelf: "flex-start" },
    clearFilterText: { fontSize: 13, fontWeight: "600" },
    // Plan
    planSection: { gap: 10 },
    cachedLabel: { fontSize: 11, fontStyle: "italic" },
    summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end" },
    summaryActions: { flexDirection: "row", alignItems: "center", gap: 14 },
    // Nutrition note
    noteCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 18, padding: 14, borderWidth: 1 },
    noteText: { fontSize: 13, color: c.textSecondary, lineHeight: 18, flex: 1 },
    // Protein tracker
    proteinCard: { borderRadius: 18, padding: 14, borderWidth: 1, gap: 8 },
    proteinRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    proteinLabel: { fontSize: 13, fontWeight: "600", flex: 1 },
    proteinValue: { fontSize: 13, fontWeight: "700" },
    proteinBarBg: { height: 6, borderRadius: 3, overflow: "hidden" },
    proteinBarFill: { height: 6, borderRadius: 3 },
  });
}
