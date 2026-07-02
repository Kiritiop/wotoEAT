import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { getSavedRecipes, deleteRecipe, updateRecipe, saveRecipe, getMealHistory, generateRecipeByName, updateRecipeLabels, createShare, shareWebUrl, apiErrorMessage } from "@/services/api";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { shareText } from "@/utils/share";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/store/useAppStore";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import { translateTag, DIFFICULTY_COLORS, translateDifficulty } from "@/constants/filters";
import type { SavedRecipe, Ingredient, MealHistoryEntry, MealSuggestion } from "@/services/api";
import { MealCard } from "@/components/MealCard";

type RecipeTab = "saved" | "liked" | "mine" | "history";

export default function RecipesScreen() {
  const { authReady, recipeLabels, addRecipeLabel, removeRecipeLabel, setAllRecipeLabels, language, servings: storeServings } = useAppStore();
  const c = useTheme();
  const { t, strings } = useTranslation();
  const router = useRouter();

  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const hasFetchedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<SavedRecipe | null>(null);
  // Serving scaler for the read-only detail view (parity with the meal detail
  // sheet and FindRecipeModal). Resets to the recipe's own servings on open.
  const [detailServings, setDetailServings] = useState(1);
  useEffect(() => {
    if (selectedRecipe) setDetailServings(selectedRecipe.servings || 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecipe?.id]);
  const detailScale = selectedRecipe ? detailServings / (selectedRecipe.servings || 1) : 1;
  const scaleAmount = (amount: number | string | null | undefined): string => {
    if (amount == null || amount === "") return "";
    if (Math.abs(detailScale - 1) < 0.001) return String(amount);
    const n = typeof amount === "number" ? amount : parseFloat(String(amount));
    if (Number.isNaN(n)) return `~${amount}`;
    const scaled = n * detailScale;
    return scaled % 1 < 0.05 ? String(Math.round(scaled)) : scaled.toFixed(1);
  };
  const [activeTab, setActiveTab] = useState<RecipeTab>("saved");

  // ── Search ────────────────────────────────────────────────────────────────
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState("");

  // ── Edit mode ─────────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editPrepTime, setEditPrepTime] = useState("");
  const [editCalories, setEditCalories] = useState("");
  const [editServings, setEditServings] = useState("");
  const [editIngredients, setEditIngredients] = useState<{ name: string; amount: string; unit: string }[]>([]);
  const [editSteps, setEditSteps] = useState<string[]>([]);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // ── Tag add in detail view ─────────────────────────────────────────────────
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTagText, setNewTagText] = useState("");

  // ── Tag filter (G-3) ──────────────────────────────────────────────────────
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  // ── History tab ───────────────────────────────────────────────────────────
  const [historyEntries, setHistoryEntries] = useState<MealHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historySelected, setHistorySelected] = useState<MealSuggestion | null>(null);
  const [historyGenerating, setHistoryGenerating] = useState(false);
  const [historyBanner, setHistoryBanner] = useState<string | null>(null);
  const [historyBannerIsError, setHistoryBannerIsError] = useState(false);

  // ── New recipe creation (H-2) ─────────────────────────────────────────────
  const [isNewRecipe, setIsNewRecipe] = useState(false);

  function openNewRecipe() {
    setEditTitle("");
    setEditPrepTime("");
    setEditCalories("");
    setEditServings(String(storeServings || 1));
    setEditIngredients([{ name: "", amount: "1", unit: "" }]);
    setEditSteps([""]);
    setEditTags([]);
    setEditError(null);
    setIsNewRecipe(true);
    setIsEditing(true);
    setSelectedRecipe({ id: "", title: "", source_name: "__mine__", tags: [], ingredients: [], steps: [], warnings: [] });
    Haptics.selectionAsync();
  }

  function closeModal() {
    setIsEditing(false);
    setIsNewRecipe(false);
    setSelectedRecipe(null);
    setEditTitle("");
    setEditPrepTime("");
    setEditCalories("");
    setEditServings("");
    setEditIngredients([]);
    setEditSteps([]);
    setEditTags([]);
    setEditError(null);
    setShowTagInput(false);
    setNewTagText("");
  }

  function openEditMode(recipe: SavedRecipe) {
    setEditTitle(recipe.title);
    setEditPrepTime(recipe.prep_time_mins != null ? String(recipe.prep_time_mins) : "");
    setEditCalories(recipe.calories_per_serving != null ? String(recipe.calories_per_serving) : "");
    setEditServings(recipe.servings != null ? String(recipe.servings) : "");
    setEditIngredients((recipe.ingredients ?? []).map((ing) => ({
      name: ing.name,
      // amount can be null (e.g. URL-parsed "to taste" items) — String(null)
      // would show the literal text "null" in the field and persist on save.
      amount: ing.amount != null ? String(ing.amount) : "",
      unit: ing.unit,
    })));
    setEditSteps([...(recipe.steps ?? [])]);
    setEditTags([...(recipe.tags ?? [])]);
    setEditError(null);
    setIsEditing(true);
    Haptics.selectionAsync();
  }

  async function handleSaveEdit() {
    if (!selectedRecipe) return;
    if (!editTitle.trim()) { setEditError(t("edit_title_required")); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      const ingredients: Ingredient[] = editIngredients
        .filter((i) => i.name.trim())
        .map((i) => {
          const parsed = parseFloat(i.amount);
          // Empty amount stays null ("to taste" items) — don't fabricate a 1.
          return { name: i.name.trim(), amount: isNaN(parsed) ? (i.amount.trim() || null) : parsed, unit: i.unit.trim() };
        });
      const cals = parseInt(editCalories, 10);
      const recipePayload = {
        title: editTitle.trim(),
        servings: parseInt(editServings, 10) || 1,
        prep_time_mins: parseInt(editPrepTime, 10) || 0,
        calories_per_serving: Number.isNaN(cals) ? undefined : cals,
        ingredients,
        steps: editSteps.filter((s) => s.trim()),
        tags: editTags,
        warnings: [],
        source_name: "__mine__",
      };

      if (isNewRecipe) {
        // Brand new user recipe
        const created = await saveRecipe(recipePayload);
        setRecipes((prev) => [created, ...prev]);
        setSelectedRecipe(null);
        setActiveTab("mine");
        setIsNewRecipe(false);
      } else if (selectedRecipe.source_name === "__mine__") {
        // Mine recipe: update in-place
        const updated = await updateRecipe(selectedRecipe.id, recipePayload);
        setRecipes((prev) => prev.map((r) => r.id === updated.id ? updated : r));
        setSelectedRecipe(updated);
      } else {
        // Saved recipe: duplicate to Mine
        const created = await saveRecipe(recipePayload);
        setRecipes((prev) => [created, ...prev]);
        setSelectedRecipe(null);
        setActiveTab("mine");
      }
      setIsEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setEditError(apiErrorMessage(err, "Could not save."));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setEditSaving(false);
    }
  }

  const [loadError, setLoadError] = useState<string | null>(null);

  const loadRecipes = useCallback(async (isRefresh = false) => {
    if (!authReady) return;
    // BUG-16: skip redundant fetches on every modal open/close; only refetch on explicit refresh
    if (!isRefresh && hasFetchedRef.current) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setLoadError(null);
    try {
      const data = await getSavedRecipes();
      setRecipes(data);
      // Populate label store from backend — include ALL recipes so removed labels are cleared
      const labelsFromBackend: Record<string, string[]> = {};
      data.forEach((r) => { labelsFromBackend[r.id] = r.labels ?? []; });
      setAllRecipeLabels(labelsFromBackend);
      hasFetchedRef.current = true;
    } catch (err) {
      setLoadError(apiErrorMessage(err, "Could not load recipes."));
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [authReady, setAllRecipeLabels]);

  useFocusEffect(useCallback(() => { void loadRecipes(); }, [loadRecipes]));

  async function handleDelete(id: string) {
    setDeleteError(null);
    try {
      await deleteRecipe(id);
      setRecipes((prev) => prev.filter((r) => r.id !== id));
      setPendingDelete(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      setDeleteError(apiErrorMessage(err, "Failed to delete."));
      setPendingDelete(null);
    }
  }

  function toggleLabel(recipeId: string, label: string) {
    const current = recipeLabels[recipeId] ?? [];
    const newLabels = current.includes(label) ? current.filter((l) => l !== label) : [...current, label];
    if (current.includes(label)) removeRecipeLabel(recipeId, label);
    else addRecipeLabel(recipeId, label);
    Haptics.selectionAsync();
    updateRecipeLabels(recipeId, newLabels).catch(() => {});
  }

  const [sharingRecipe, setSharingRecipe] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  async function handleShareRecipe() {
    if (!selectedRecipe || sharingRecipe) return;
    setSharingRecipe(true);
    try {
      const id = await createShare("recipe", {
        title: selectedRecipe.title,
        intro: selectedRecipe.intro,
        source_name: selectedRecipe.source_name,
        servings: selectedRecipe.servings,
        prep_time_mins: selectedRecipe.prep_time_mins,
        calories_per_serving: selectedRecipe.calories_per_serving,
        ingredients: selectedRecipe.ingredients ?? [],
        steps: selectedRecipe.steps ?? [],
        chef_tips: selectedRecipe.chef_tips ?? [],
        tags: selectedRecipe.tags ?? [],
      });
      const outcome = await shareText(`${selectedRecipe.title}\n${shareWebUrl(id)}`);
      if (outcome === "copied") {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      }
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSharingRecipe(false);
    }
  }

  async function addTagToRecipe(tag: string) {
    if (!selectedRecipe || !tag.trim()) return;
    const trimmed = tag.trim().toLowerCase();
    const newTags = [...(selectedRecipe.tags ?? []).filter((t) => t !== trimmed), trimmed];
    const updated = { ...selectedRecipe, tags: newTags };
    setSelectedRecipe(updated);
    setRecipes((prev) => prev.map((r) => r.id === updated.id ? updated : r));
    setNewTagText("");
    setShowTagInput(false);
    try {
      await updateRecipe(selectedRecipe.id, {
        title: selectedRecipe.title,
        servings: selectedRecipe.servings ?? 2,
        prep_time_mins: selectedRecipe.prep_time_mins ?? 0,
        calories_per_serving: selectedRecipe.calories_per_serving,
        ingredients: selectedRecipe.ingredients ?? [],
        steps: selectedRecipe.steps ?? [],
        tags: newTags,
        warnings: selectedRecipe.warnings ?? [],
        source_name: selectedRecipe.source_name,
      });
    } catch { /* best-effort */ }
  }

  const loadHistory = useCallback(async (isRefresh = false) => {
    if (!authReady) return;
    if (isRefresh) setHistoryRefreshing(true); else setHistoryLoading(true);
    try {
      const data = await getMealHistory(50);
      setHistoryEntries(data);
    } catch { /* silent */ } finally {
      setHistoryRefreshing(false);
      setHistoryLoading(false);
    }
  }, [authReady]);

  const historyLoadedRef = useRef(false);
  useEffect(() => {
    if (activeTab === "history" && !historyLoadedRef.current) {
      historyLoadedRef.current = true;
      void loadHistory();
    }
  }, [activeTab, loadHistory]);

  async function handleHistoryGenerateRecipe() {
    if (!historySelected || historyGenerating) return;
    setHistoryGenerating(true);
    setHistoryBanner(null);
    try {
      const recipe = await generateRecipeByName(historySelected.name, language, storeServings || 1, true);
      await saveRecipe(recipe);
      setHistoryBannerIsError(false);
      setHistoryBanner(t("history_saved_banner"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setHistoryBanner(null), 3000);
    } catch {
      setHistoryBannerIsError(true);
      setHistoryBanner(t("history_failed_banner"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(() => setHistoryBanner(null), 3000);
    } finally {
      setHistoryGenerating(false);
    }
  }

  // Filter recipes by active tab, tag filter, then search text
  const filteredRecipes = recipes.filter((r) => {
    const labels = recipeLabels[r.id] ?? [];
    let tabMatch = false;
    if (activeTab === "saved") tabMatch = r.source_name !== "__mine__";
    else if (activeTab === "liked") tabMatch = labels.includes("favorite");
    else if (activeTab === "mine") tabMatch = r.source_name === "__mine__";
    if (!tabMatch) return false;
    if (activeTagFilter && !(r.tags ?? []).some((t) => t.toLowerCase() === activeTagFilter.toLowerCase())) return false;
    if (!searchText.trim()) return true;
    const q = searchText.trim().toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      (r.tags ?? []).some((t) => t.toLowerCase().includes(q)) ||
      (r.ingredients ?? []).some((ing) => ing.name?.toLowerCase().includes(q))
    );
  });

  const TABS: { key: RecipeTab; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
    { key: "saved", label: t("saved_tab"), icon: "bookmark" },
    { key: "liked", label: t("liked_tab"), icon: "heart" },
    { key: "mine", label: t("mine_tab"), icon: "person" },
    { key: "history", label: t("tab_history"), icon: "time" },
  ];

  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        title={t("tab_my_recipes")}
        right={
          activeTab !== "history" ? (
            <TouchableOpacity
              style={styles.searchIconBtn}
              onPress={() => { setShowSearch((v) => !v); if (showSearch) setSearchText(""); Haptics.selectionAsync(); }}
            >
              <Ionicons name={showSearch ? "close" : "search"} size={20} color={c.textMuted} />
            </TouchableOpacity>
          ) : undefined
        }
      />
      {/* Sub-tab bar */}
      <View style={[styles.tabBarRow, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <View style={styles.tabBar}>
          {TABS.map(({ key, label, icon }) => (
            <TouchableOpacity
              key={key}
              style={[styles.tab, activeTab === key && { borderBottomColor: c.primary, borderBottomWidth: 2 }]}
              onPress={() => { setActiveTab(key); setSearchText(""); setShowSearch(false); setActiveTagFilter(null); setHistorySearch(""); Haptics.selectionAsync(); }}
            >
              <Ionicons name={icon} size={14} color={activeTab === key ? c.primary : c.textMuted} />
              <Text style={[styles.tabLabel, { color: activeTab === key ? c.primary : c.textMuted }, activeTab === key && { fontWeight: "700" }]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {showSearch && (
        <View style={[styles.searchBar, { backgroundColor: c.inputBg, borderColor: c.border }]}>
          <Ionicons name="search" size={15} color={c.textPlaceholder} />
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            placeholder={t("search_recipes")}
            placeholderTextColor={c.textPlaceholder}
            value={searchText}
            onChangeText={setSearchText}
            autoFocus
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText("")}>
              <Ionicons name="close-circle" size={15} color={c.textPlaceholder} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {activeTab === "history" ? (
        <HistoryTabContent
          entries={historyEntries}
          loading={historyLoading}
          refreshing={historyRefreshing}
          search={historySearch}
          onSearchChange={setHistorySearch}
          onRefresh={() => loadHistory(true)}
          onSelectMeal={(meal) => { setHistorySelected(meal); Haptics.selectionAsync(); }}
          language={language}
          c={c}
          t={t}
        />
      ) : (
      <FlatList
        data={filteredRecipes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadRecipes(true)} tintColor={c.primary} />
        }
        ListHeaderComponent={
          <View>
            {(activeTab === "saved" || activeTab === "mine") && (
              <View style={styles.recipeActionRow}>
                <TouchableOpacity style={[styles.newRecipeBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border, flex: 1, marginBottom: 0 }]} onPress={openNewRecipe}>
                  <Ionicons name="add" size={18} color={c.primary} />
                  <Text style={[styles.newRecipeBtnText, { color: c.primary }]}>{t("new_recipe")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.newRecipeBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border, flex: 1, marginBottom: 0 }]}
                  onPress={() => { router.push("/recipe/upload"); Haptics.selectionAsync(); }}
                >
                  <Ionicons name="link" size={16} color={c.primary} />
                  <Text style={[styles.newRecipeBtnText, { color: c.primary }]}>{t("import_from_url")}</Text>
                </TouchableOpacity>
              </View>
            )}
            {activeTagFilter && (
              <View style={styles.tagFilterPill}>
                <Ionicons name="pricetag" size={12} color={c.primary} />
                <Text style={[styles.tagFilterText, { color: c.primary }]}>{translateTag(activeTagFilter, language)}</Text>
                <TouchableOpacity onPress={() => setActiveTagFilter(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="close-circle" size={14} color={c.primary} />
                </TouchableOpacity>
              </View>
            )}
            {loading && <ActivityIndicator style={{ marginTop: 24 }} color={c.primary} />}
            {loadError && (
              <View style={{ marginBottom: 10 }}>
                <ErrorBanner message={loadError} style={{ marginBottom: 6 }} />
                <TouchableOpacity
                  style={[styles.retryBtn, { borderColor: c.error, backgroundColor: c.errorBg }]}
                  onPress={() => loadRecipes(true)}
                >
                  <Ionicons name="refresh-outline" size={14} color={c.error} />
                  <Text style={[styles.retryBtnText, { color: c.error }]}>{t("retry")}</Text>
                </TouchableOpacity>
              </View>
            )}
            <ErrorBanner message={deleteError} style={{ marginBottom: 10 }} />
            {filteredRecipes.length > 0 && (
              <Text style={[styles.countLabel, { color: c.textPlaceholder }]}>
                {strings.recipe_count(filteredRecipes.length)}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="book-outline"
              title={t("no_recipes_title")}
              body={t("no_recipes_body")}
            />
          ) : null
        }
        renderItem={({ item }) => {
          const labels = recipeLabels[item.id] ?? [];
          const isFavorite = labels.includes("favorite");
          return (
            <View style={[styles.card, { backgroundColor: c.surface }]}>
              <TouchableOpacity style={styles.cardInfo} onPress={() => setSelectedRecipe(item)} activeOpacity={0.7}>
                <Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={2}>{item.title}</Text>
                {item.source_name && item.source_name !== "__mine__" && (
                  <Text style={[styles.sourceName, { color: c.primary }]}>{item.source_name}</Text>
                )}
                {item.source_name === "__mine__" && (
                  <Text style={[styles.sourceName, { color: c.primary }]}>{t("my_recipe")}</Text>
                )}
                <View style={styles.cardMeta}>
                  {item.prep_time_mins != null && (
                    <View style={styles.metaItem}>
                      <Ionicons name="time-outline" size={12} color={c.textMuted} />
                      <Text style={[styles.metaText, { color: c.textMuted }]}>{item.prep_time_mins} {t("min_label")}</Text>
                    </View>
                  )}
                  {item.calories_per_serving != null && (
                    <View style={styles.metaItem}>
                      <Ionicons name="flame-outline" size={12} color={c.textMuted} />
                      <Text style={[styles.metaText, { color: c.textMuted }]}>{item.calories_per_serving} {t("calories_label")}</Text>
                    </View>
                  )}
                </View>
                {/* Label chips */}
                <View style={styles.labelRow}>
                  {isFavorite && <LabelChip icon="heart" label={t("mark_favorite")} color="#EF4444" bg="#FEF2F2" />}
                </View>
                {(item.tags?.length ?? 0) > 0 && (
                  <View style={styles.tags}>
                    {item.tags!.slice(0, 3).map((tag) => {
                      const isActive = activeTagFilter?.toLowerCase() === tag.toLowerCase();
                      return (
                        <TouchableOpacity
                          key={tag}
                          style={[styles.tag, { backgroundColor: isActive ? c.primary : c.chipBg }]}
                          onPress={() => { setActiveTagFilter(isActive ? null : tag); Haptics.selectionAsync(); }}
                        >
                          <Text style={[styles.tagText, { color: isActive ? "#FFF" : c.chipText }]}>{translateTag(tag, language)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {item.tags!.length > 3 && (
                      <View style={[styles.tag, { backgroundColor: c.surfaceAlt }]}>
                        <Text style={[styles.tagText, { color: c.textMuted }]}>{strings.more_tags(item.tags!.length - 3)}</Text>
                      </View>
                    )}
                  </View>
                )}
              </TouchableOpacity>

              {/* Action buttons column */}
              <View style={styles.cardActions}>
                {pendingDelete === item.id ? (
                  <>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: c.error }]}
                      onPress={() => handleDelete(item.id)}
                    >
                      <Ionicons name="trash" size={14} color="#FFF" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: c.surfaceAlt }]}
                      onPress={() => setPendingDelete(null)}
                    >
                      <Ionicons name="close" size={14} color={c.textMuted} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: isFavorite ? "#FEF2F2" : c.surfaceAlt }]}
                      onPress={() => toggleLabel(item.id, "favorite")}
                    >
                      <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={16} color={isFavorite ? "#EF4444" : c.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: c.surfaceAlt }]}
                      onPress={() => { setSelectedRecipe(item); openEditMode(item); }}
                    >
                      <Ionicons name="pencil-outline" size={16} color={c.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setPendingDelete(item.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                      style={[styles.actionBtn, { backgroundColor: c.surfaceAlt }]}
                    >
                      <Ionicons name="trash-outline" size={16} color={c.error} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
      )}

      {/* History meal detail sheet */}
      <Modal visible={!!historySelected} transparent animationType="slide" onRequestClose={() => { setHistorySelected(null); setHistoryBanner(null); setHistoryBannerIsError(false); setHistoryGenerating(false); }}>
        <Pressable style={styles.histOverlay} onPress={() => { setHistorySelected(null); setHistoryBanner(null); setHistoryBannerIsError(false); setHistoryGenerating(false); }}>
          <Pressable style={[styles.histSheet, { backgroundColor: c.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.histHandle, { backgroundColor: c.border }]} />
            {historySelected && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
                <Text style={[styles.histName, { color: c.text }]}>{historySelected.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <Text style={[styles.histCuisine, { color: c.primary }]}>{historySelected.cuisine}</Text>
                  <View style={[styles.histDiffBadge, { backgroundColor: (DIFFICULTY_COLORS[historySelected.difficulty] ?? "#999") + "20" }]}>
                    <Text style={[styles.histDiffText, { color: DIFFICULTY_COLORS[historySelected.difficulty] ?? "#999" }]}>
                      {translateDifficulty(historySelected.difficulty, language)}
                    </Text>
                  </View>
                </View>
                <View style={[styles.histStatsRow, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                  <View style={styles.histStatItem}>
                    <Ionicons name="flame-outline" size={16} color="#F59E0B" />
                    <Text style={[styles.histStatValue, { color: c.text }]}>{historySelected.calories_per_serving}</Text>
                    <Text style={[styles.histStatLabel, { color: c.textMuted }]}>{t("calories_label")}</Text>
                  </View>
                  <View style={[styles.histStatDivider, { backgroundColor: c.border }]} />
                  <View style={styles.histStatItem}>
                    <Ionicons name="time-outline" size={16} color={c.textMuted} />
                    <Text style={[styles.histStatValue, { color: c.text }]}>{historySelected.prep_time_mins}</Text>
                    <Text style={[styles.histStatLabel, { color: c.textMuted }]}>{t("min_label")}</Text>
                  </View>
                </View>
                <Text style={[styles.histDesc, { color: c.textSecondary }]}>{historySelected.description}</Text>
                {(historySelected.tags ?? []).length > 0 && (
                  <View style={styles.histTagRow}>
                    {(historySelected.tags ?? []).map((tag) => (
                      <View key={tag} style={[styles.tag, { backgroundColor: c.chipBg }]}>
                        <Text style={[styles.tagText, { color: c.chipText }]}>{translateTag(tag, language)}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Button
                  icon="document-text-outline"
                  label={t("history_generate_save")}
                  loading={historyGenerating}
                  onPress={handleHistoryGenerateRecipe}
                />
                {historyBanner && (
                  <View style={[styles.histBanner, { backgroundColor: historyBannerIsError ? c.errorBg : c.successBg }]}>
                    <Ionicons name={historyBannerIsError ? "alert-circle-outline" : "checkmark-circle-outline"} size={14}
                      color={historyBannerIsError ? c.error : c.success} />
                    <Text style={[styles.histBannerText, { color: historyBannerIsError ? c.error : c.success }]}>{historyBanner}</Text>
                  </View>
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Recipe detail / edit modal */}
      <Modal visible={!!selectedRecipe} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeModal}>
        {selectedRecipe && (
          <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
            <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
              {isEditing ? (
                <TextInput
                  style={[styles.editTitleInput, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
                  value={editTitle}
                  onChangeText={setEditTitle}
                  placeholder={t("recipe_title_placeholder")}
                  placeholderTextColor={c.textPlaceholder}
                />
              ) : (
                <Text style={[styles.modalTitle, { color: c.text }]} numberOfLines={2}>
                  {selectedRecipe.title}
                </Text>
              )}
              <View style={styles.modalHeaderActions}>
                {!isEditing && (
                  <TouchableOpacity
                    onPress={handleShareRecipe}
                    disabled={sharingRecipe}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={shareCopied ? t("link_copied") : t("share")}
                  >
                    {sharingRecipe
                      ? <ActivityIndicator size={16} color={c.primary} />
                      : <Ionicons name={shareCopied ? "checkmark-done-outline" : "share-outline"} size={20} color={shareCopied ? c.success : c.primary} />}
                  </TouchableOpacity>
                )}
                {!isEditing && (
                  <TouchableOpacity onPress={() => openEditMode(selectedRecipe)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="pencil-outline" size={20} color={c.primary} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={closeModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={24} color={c.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {isEditing ? (
                <>
                  {/* Basic fields */}
                  <Text style={[styles.editFieldLabel, { color: c.textMuted }]}>{t("edit_field_prep").toUpperCase()}</Text>
                  <TextInput
                    style={[styles.editInput, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
                    value={editPrepTime}
                    onChangeText={setEditPrepTime}
                    keyboardType="number-pad"
                    placeholder={t("edit_placeholder_prep")}
                    placeholderTextColor={c.textPlaceholder}
                  />
                  <Text style={[styles.editFieldLabel, { color: c.textMuted }]}>{t("edit_field_calories").toUpperCase()}</Text>
                  <TextInput
                    style={[styles.editInput, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
                    value={editCalories}
                    onChangeText={setEditCalories}
                    keyboardType="number-pad"
                    placeholder={t("edit_placeholder_calories")}
                    placeholderTextColor={c.textPlaceholder}
                  />
                  <Text style={[styles.editFieldLabel, { color: c.textMuted }]}>{t("edit_field_servings").toUpperCase()}</Text>
                  <TextInput
                    style={[styles.editInput, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
                    value={editServings}
                    onChangeText={setEditServings}
                    keyboardType="number-pad"
                    placeholder={t("edit_placeholder_servings")}
                    placeholderTextColor={c.textPlaceholder}
                  />

                  {/* Ingredients */}
                  <View style={styles.editSectionHeader}>
                    <Text style={[styles.editFieldLabel, { color: c.textMuted, marginBottom: 0 }]}>{t("edit_field_ingredients").toUpperCase()}</Text>
                  </View>
                  {editIngredients.map((ing, i) => (
                    <View key={i} style={styles.editIngRow}>
                      <TextInput
                        style={[styles.editIngName, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
                        value={ing.name}
                        onChangeText={(v) => setEditIngredients((prev) => prev.map((x, j) => j === i ? { ...x, name: v } : x))}
                        placeholder={t("edit_placeholder_ingredient")}
                        placeholderTextColor={c.textPlaceholder}
                      />
                      <TextInput
                        style={[styles.editIngAmt, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
                        value={ing.amount}
                        onChangeText={(v) => setEditIngredients((prev) => prev.map((x, j) => j === i ? { ...x, amount: v } : x))}
                        keyboardType="default"
                        placeholder={t("edit_placeholder_amount")}
                        placeholderTextColor={c.textPlaceholder}
                      />
                      <TextInput
                        style={[styles.editIngUnit, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
                        value={ing.unit}
                        onChangeText={(v) => setEditIngredients((prev) => prev.map((x, j) => j === i ? { ...x, unit: v } : x))}
                        placeholder={t("edit_placeholder_unit")}
                        placeholderTextColor={c.textPlaceholder}
                      />
                      <TouchableOpacity
                        onPress={() => setEditIngredients((prev) => prev.filter((_, j) => j !== i))}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={18} color={c.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={[styles.addRowBox, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}
                    onPress={() => { setEditIngredients((prev) => [...prev, { name: "", amount: "", unit: "" }]); Haptics.selectionAsync(); }}
                  >
                    <Ionicons name="add" size={15} color={c.textMuted} />
                    <Text style={[styles.addRowBoxText, { color: c.textPlaceholder }]}>
                      {t("edit_add_ingredient")}
                    </Text>
                  </TouchableOpacity>

                  {/* Steps */}
                  <View style={styles.editSectionHeader}>
                    <Text style={[styles.editFieldLabel, { color: c.textMuted, marginBottom: 0 }]}>{t("edit_field_steps").toUpperCase()}</Text>
                  </View>
                  {editSteps.map((step, i) => (
                    <View key={i} style={styles.editStepRow}>
                      <View style={[styles.detailStepNum, { backgroundColor: c.primary }]}>
                        <Text style={styles.detailStepNumText}>{i + 1}</Text>
                      </View>
                      <TextInput
                        style={[styles.editStepInput, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
                        value={step}
                        onChangeText={(v) => setEditSteps((prev) => prev.map((s, j) => j === i ? v : s))}
                        placeholder={strings.step_placeholder(i + 1)}
                        placeholderTextColor={c.textPlaceholder}
                        multiline
                      />
                      <TouchableOpacity
                        onPress={() => setEditSteps((prev) => prev.filter((_, j) => j !== i))}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={18} color={c.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={[styles.addRowBox, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}
                    onPress={() => { setEditSteps((prev) => [...prev, ""]); Haptics.selectionAsync(); }}
                  >
                    <Ionicons name="add" size={15} color={c.textMuted} />
                    <Text style={[styles.addRowBoxText, { color: c.textPlaceholder }]}>
                      {t("edit_add_step")}
                    </Text>
                  </TouchableOpacity>

                  <ErrorBanner message={editError} style={{ marginTop: 8 }} />

                  <View style={styles.editActions}>
                    <TouchableOpacity
                      style={[styles.editCancelBtn, { backgroundColor: c.surfaceAlt }]}
                      onPress={() => { if (isNewRecipe) { closeModal(); } else { setIsEditing(false); setEditError(null); } }}
                    >
                      <Text style={[styles.editCancelText, { color: c.textMuted }]}>{t("cancel")}</Text>
                    </TouchableOpacity>
                    <Button
                      label={selectedRecipe?.source_name === "__mine__" ? t("save") : t("save_to_mine")}
                      loading={editSaving}
                      fullWidth={false}
                      style={{ flex: 2 }}
                      onPress={handleSaveEdit}
                    />
                  </View>
                </>
              ) : (
                <>
                  {selectedRecipe.source_name && (
                    <Text style={[styles.detailSource, { color: c.primary }]}>{selectedRecipe.source_name}</Text>
                  )}
                  <View style={styles.detailMeta}>
                    {selectedRecipe.prep_time_mins != null && (
                      <View style={[styles.detailChip, { backgroundColor: c.surfaceAlt }]}>
                        <Ionicons name="time-outline" size={13} color={c.textMuted} />
                        <Text style={[styles.detailChipText, { color: c.textMuted }]}>{selectedRecipe.prep_time_mins} {t("min_label")}</Text>
                      </View>
                    )}
                    {selectedRecipe.calories_per_serving != null && (
                      <View style={[styles.detailChip, { backgroundColor: c.surfaceAlt }]}>
                        <Ionicons name="flame-outline" size={13} color={c.textMuted} />
                        <Text style={[styles.detailChipText, { color: c.textMuted }]}>{selectedRecipe.calories_per_serving} {t("calories_label")}</Text>
                      </View>
                    )}
                  </View>

                  {/* Intro / flavor description */}
                  {selectedRecipe.intro && (
                    <Text style={[styles.detailIntro, { color: c.textSecondary }]}>{selectedRecipe.intro}</Text>
                  )}

                  {/* Tags row */}
                  <View style={styles.detailTagsRow}>
                    {(selectedRecipe.tags ?? []).map((tag) => (
                      <View key={tag} style={[styles.tag, { backgroundColor: c.chipBg }]}>
                        <Text style={[styles.tagText, { color: c.chipText }]}>{translateTag(tag, language)}</Text>
                      </View>
                    ))}
                    {showTagInput ? (
                      <View style={[styles.tagInput, { backgroundColor: c.inputBg, borderColor: c.border }]}>
                        <TextInput
                          style={[{ fontSize: 12, color: c.text, minWidth: 60 }]}
                          value={newTagText}
                          onChangeText={setNewTagText}
                          placeholder={t("add_tag")}
                          placeholderTextColor={c.textPlaceholder}
                          autoFocus
                          returnKeyType="done"
                          onSubmitEditing={() => addTagToRecipe(newTagText)}
                        />
                        <TouchableOpacity onPress={() => addTagToRecipe(newTagText)}>
                          <Ionicons name="checkmark" size={14} color={c.primary} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.tag, { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, borderStyle: "dashed" }]}
                        onPress={() => { setShowTagInput(true); setNewTagText(""); }}
                      >
                        <Ionicons name="add" size={12} color={c.textMuted} />
                        <Text style={[styles.tagText, { color: c.textMuted }]}>{t("add_tag")}</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {(selectedRecipe.ingredients?.length ?? 0) > 0 && (
                    <>
                      <View style={styles.detailScalerRow}>
                        <Text style={[styles.detailSectionLabel, { color: c.textPlaceholder, marginTop: 0, marginBottom: 0 }]}>
                          {t("ingredients_label")} ({selectedRecipe.ingredients!.length})
                        </Text>
                        <View style={styles.detailStepper}>
                          <TouchableOpacity
                            onPress={() => { setDetailServings((n) => Math.max(1, n - 1)); Haptics.selectionAsync(); }}
                            disabled={detailServings <= 1}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="remove-circle-outline" size={20} color={detailServings <= 1 ? c.disabled : c.textMuted} />
                          </TouchableOpacity>
                          <Text style={[styles.detailStepperText, { color: c.textSecondary }]}>{strings.servings_people(detailServings)}</Text>
                          <TouchableOpacity
                            onPress={() => { setDetailServings((n) => Math.min(12, n + 1)); Haptics.selectionAsync(); }}
                            disabled={detailServings >= 12}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="add-circle-outline" size={20} color={detailServings >= 12 ? c.disabled : c.textMuted} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      {selectedRecipe.ingredients!.map((ing, i) => (
                        <View key={i} style={[styles.detailIngRow, { borderBottomColor: c.borderLight }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.detailIngName, { color: c.textSecondary }]}>{ing.name}</Text>
                            {ing.tip && (
                              <Text style={[styles.detailIngTip, { color: c.textPlaceholder }]}>{ing.tip}</Text>
                            )}
                          </View>
                          <Text style={[styles.detailIngAmt, { color: c.textMuted }]}>{scaleAmount(ing.amount)} {ing.unit}</Text>
                        </View>
                      ))}
                    </>
                  )}
                  {(selectedRecipe.steps?.length ?? 0) > 0 && (
                    <>
                      <Text style={[styles.detailSectionLabel, { color: c.textPlaceholder }]}>
                        {t("steps_label")} ({selectedRecipe.steps!.length})
                      </Text>
                      {selectedRecipe.steps!.map((step, i) => (
                        <View key={i} style={styles.detailStep}>
                          <View style={[styles.detailStepNum, { backgroundColor: c.primary }]}>
                            <Text style={styles.detailStepNumText}>{i + 1}</Text>
                          </View>
                          <Text style={[styles.detailStepText, { color: c.textSecondary }]}>{step}</Text>
                        </View>
                      ))}
                    </>
                  )}
                  {(selectedRecipe.chef_tips?.length ?? 0) > 0 && (
                    <>
                      <Text style={[styles.detailSectionLabel, { color: c.textPlaceholder }]}>
                        {t("chef_tips_label")}
                      </Text>
                      {selectedRecipe.chef_tips!.map((tip, i) => (
                        <View key={i} style={[styles.detailTipRow, { backgroundColor: c.primaryLight }]}>
                          <Ionicons name="bulb-outline" size={14} color={c.primary} style={{ flexShrink: 0, marginTop: 1 }} />
                          <Text style={[styles.detailTipText, { color: c.text }]}>{tip}</Text>
                        </View>
                      ))}
                    </>
                  )}
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

function HistoryTabContent({
  entries, loading, refreshing, search, onSearchChange, onRefresh, onSelectMeal, language, c, t,
}: {
  entries: MealHistoryEntry[];
  loading: boolean;
  refreshing: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  onRefresh: () => void;
  onSelectMeal: (meal: MealSuggestion) => void;
  language: string;
  c: ReturnType<typeof useTheme>;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const locale = language === "zh" ? "zh-CN" : "en-US";
  const map = new Map<string, Map<string, MealSuggestion>>();
  for (const entry of entries) {
    if (!map.has(entry.date)) map.set(entry.date, new Map());
    const dayMap = map.get(entry.date)!;
    for (const meal of entry.meals ?? []) {
      if (!dayMap.has(meal.name)) dayMap.set(meal.name, meal);
    }
  }
  const grouped = Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, mealMap]) => ({ date, meals: Array.from(mealMap.values()) }));

  const filtered = search.trim()
    ? grouped.map((day) => ({
        ...day,
        // History rows are server JSON — older/partial rows may lack fields.
        meals: day.meals.filter((m) =>
          (m.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (m.cuisine ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (m.tags ?? []).some((tag) => tag.toLowerCase().includes(search.toLowerCase()))
        ),
      })).filter((day) => day.meals.length > 0)
    : grouped;

  return (
    <>
      <View style={[{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <Ionicons name="search-outline" size={16} color={c.textPlaceholder} />
        <TextInput
          style={[{ flex: 1, fontSize: 14, color: c.text, paddingVertical: 2 }]}
          placeholder={t("search_history")}
          placeholderTextColor={c.textPlaceholder}
          value={search}
          onChangeText={onSearchChange}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => onSearchChange("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={c.textPlaceholder} />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {loading && <ActivityIndicator color={c.primary} style={{ marginTop: 32 }} />}
        {!loading && filtered.length === 0 && (
          <EmptyState icon="time-outline" title={t("history_empty_title")} body={t("history_empty_body")} />
        )}
        {filtered.map((day) => (
          <View key={day.date} style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10, color: c.textMuted }}>
              {new Date(day.date + "T00:00:00").toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" })}
            </Text>
            {day.meals.map((meal) => (
              <MealCard key={meal.name} meal={meal} onPress={() => onSelectMeal(meal)} />
            ))}
          </View>
        ))}
      </ScrollView>
    </>
  );
}

function LabelChip({ icon, label, color, bg }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; color: string; bg: string }) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: bg }]}>
      <Ionicons name={icon} size={10} color={color} />
      <Text style={{ fontSize: 10, fontWeight: "700", color }}>{label}</Text>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    tabBarRow: {
      flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth,
    },
    tabBar: {
      flex: 1, flexDirection: "row",
    },
    tab: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 4, paddingVertical: 10,
    },
    tabLabel: { fontSize: 11, fontWeight: "600" },
    searchIconBtn: { paddingHorizontal: 12, paddingVertical: 10 },
    searchBar: {
      flexDirection: "row", alignItems: "center", gap: 8,
      marginHorizontal: 16, marginVertical: 8,
      borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
    },
    searchInput: { flex: 1, fontSize: 14 },
    content: { padding: 16, paddingBottom: 40 },
    countLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
    retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, alignSelf: "flex-start" },
    retryBtnText: { fontSize: 13, fontWeight: "600" },
    card: {
      flexDirection: "row", alignItems: "flex-start",
      borderRadius: 20, padding: 16, marginBottom: 12,
      shadowColor: c.shadow, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.07, shadowRadius: 14, elevation: 2, gap: 12,
    },
    cardInfo: { flex: 1 },
    cardTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
    sourceName: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
    cardMeta: { flexDirection: "row", gap: 12, marginBottom: 6 },
    metaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
    metaText: { fontSize: 12 },
    labelRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 6 },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
    tag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    tagText: { fontSize: 11 },
    cardActions: { flexDirection: "column", gap: 6, alignItems: "center" },
    actionBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    // Detail modal
    modalHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    modalHeaderActions: { flexDirection: "row", alignItems: "center", gap: 14 },
    modalTitle: { fontSize: 18, fontWeight: "700", flex: 1, marginRight: 12 },
    modalContent: { padding: 20, paddingBottom: 60 },
    detailSource: { fontSize: 13, fontWeight: "600", marginBottom: 12 },
    detailMeta: { flexDirection: "row", gap: 8, marginBottom: 16 },
    detailChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    detailChipText: { fontSize: 13 },
    detailTagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10, marginBottom: 4 },
    tagInput: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
    detailSectionLabel: {
      fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5,
      marginTop: 16, marginBottom: 8,
    },
    detailIntro: { fontSize: 14, lineHeight: 20, marginBottom: 12, fontStyle: "italic" },
    detailScalerRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      marginTop: 16, marginBottom: 8,
    },
    detailStepper: { flexDirection: "row", alignItems: "center", gap: 8 },
    detailStepperText: { fontSize: 13, fontWeight: "600", minWidth: 54, textAlign: "center" },
    detailIngRow: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
      paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    detailIngName: { fontSize: 14, flex: 1 },
    detailIngTip: { fontSize: 11, lineHeight: 15, marginTop: 2 },
    detailIngAmt: { fontSize: 13 },
    detailStep: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
    detailStepNum: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    detailStepNumText: { fontSize: 11, fontWeight: "800", color: "#FFF" },
    detailStepText: { fontSize: 13, lineHeight: 18, flex: 1 },
    detailTipRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, padding: 10, marginBottom: 6 },
    detailTipText: { fontSize: 13, lineHeight: 18, flex: 1 },
    // Edit mode
    editTitleInput: {
      flex: 1, fontSize: 17, fontWeight: "700", borderWidth: 1, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 8, marginRight: 12,
    },
    editFieldLabel: {
      fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5,
      marginTop: 14, marginBottom: 4,
    },
    editInput: {
      borderWidth: 1, borderRadius: 10, paddingHorizontal: 14,
      paddingVertical: 10, fontSize: 14,
    },
    editSectionHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      marginTop: 18, marginBottom: 6,
    },
    editIngRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
    editIngName: {
      flex: 3, borderWidth: 1, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 8, fontSize: 13,
    },
    editIngAmt: {
      flex: 1, borderWidth: 1, borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 8, fontSize: 13, textAlign: "center",
    },
    editIngUnit: {
      flex: 1, borderWidth: 1, borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 8, fontSize: 13, textAlign: "center",
    },
    editStepRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
    addRowBox: {
      flexDirection: "row", alignItems: "center", gap: 8,
      borderWidth: 1, borderStyle: "dashed", borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 12, marginBottom: 6,
    },
    addRowBoxText: { fontSize: 13 },
    editStepInput: {
      flex: 1, borderWidth: 1, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, lineHeight: 18,
    },
    editActions: { flexDirection: "row", gap: 10, marginTop: 20 },
    editCancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    editCancelText: { fontSize: 15, fontWeight: "600" },
    editSaveBtn: { flex: 2, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    editSaveBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
    recipeActionRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
    newRecipeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 16 },
    newRecipeBtnText: { fontSize: 15, fontWeight: "700" },
    tagFilterPill: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: c.primaryLight, marginBottom: 10 },
    tagFilterText: { fontSize: 13, fontWeight: "600" },
    // History tab
    histOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
    histSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%", paddingHorizontal: 20, paddingBottom: 8 },
    histHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 16 },
    histName: { fontSize: 22, fontWeight: "800", marginBottom: 6 },
    histCuisine: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
    histDiffBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    histDiffText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
    histStatsRow: { flexDirection: "row", borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 14, gap: 8 },
    histStatItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
    histStatDivider: { width: StyleSheet.hairlineWidth },
    histStatValue: { fontSize: 16, fontWeight: "800" },
    histStatLabel: { fontSize: 12 },
    histDesc: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
    histTagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 20 },
    histGenBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14, marginBottom: 12 },
    histGenBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
    histBanner: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    histBannerText: { fontSize: 13, fontWeight: "600" },
  });
}
