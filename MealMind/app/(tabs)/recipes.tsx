import { useState, useCallback, useRef } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { getSavedRecipes, deleteRecipe, updateRecipe, saveRecipe, getPlanHistory } from "@/services/api";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAppStore } from "@/store/useAppStore";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import type { SavedRecipe, Ingredient, PlanHistoryEntry } from "@/services/api";

type RecipeTab = "saved" | "liked" | "history" | "mine";

export default function RecipesScreen() {
  const { authReady, recipeLabels, addRecipeLabel, removeRecipeLabel, language, servings: storeServings } = useAppStore();
  const c = useTheme();
  const { t, strings } = useTranslation();

  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const hasFetchedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<SavedRecipe | null>(null);
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

  // ── New recipe creation (H-2) ─────────────────────────────────────────────
  const [isNewRecipe, setIsNewRecipe] = useState(false);

  function openNewRecipe() {
    setEditTitle("");
    setEditPrepTime("");
    setEditCalories("");
    setEditServings(String(storeServings || 2));
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
      amount: String(ing.amount),
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
    if (!editTitle.trim()) { setEditError("Title is required."); return; }
    const badIng = editIngredients.find((i) => i.name.trim() && isNaN(parseFloat(i.amount)));
    if (badIng) { setEditError(`Amount for "${badIng.name}" must be a number.`); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      const ingredients: Ingredient[] = editIngredients
        .filter((i) => i.name.trim())
        .map((i) => ({ name: i.name.trim(), amount: parseFloat(i.amount) || 1, unit: i.unit.trim() }));
      const recipePayload = {
        title: editTitle.trim(),
        servings: parseInt(editServings) || 2,
        prep_time_mins: parseInt(editPrepTime) || 0,
        calories_per_serving: editCalories.trim() ? parseInt(editCalories) : undefined,
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
      setEditError(err instanceof Error ? err.message : "Could not save.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setEditSaving(false);
    }
  }

  const loadRecipes = useCallback(async (isRefresh = false) => {
    if (!authReady) return;
    // BUG-16: skip redundant fetches on every modal open/close; only refetch on explicit refresh
    if (!isRefresh && hasFetchedRef.current) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await getSavedRecipes();
      setRecipes(data);
      hasFetchedRef.current = true;
    } catch {
      // Silently ignore load errors
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [authReady]);

  useFocusEffect(useCallback(() => { void loadRecipes(); }, [loadRecipes]));

  async function handleDelete(id: string) {
    setDeleteError(null);
    try {
      await deleteRecipe(id);
      setRecipes((prev) => prev.filter((r) => r.id !== id));
      setPendingDelete(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete.");
      setPendingDelete(null);
    }
  }

  function toggleLabel(recipeId: string, label: string) {
    const labels = recipeLabels[recipeId] ?? [];
    if (labels.includes(label)) removeRecipeLabel(recipeId, label);
    else addRecipeLabel(recipeId, label);
    Haptics.selectionAsync();
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

  // ── History tab state ─────────────────────────────────────────────────────
  const [historyData, setHistoryData] = useState<PlanHistoryEntry[]>([]);
  const [historyLimit] = useState(7);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");

  async function loadHistory(limit = historyLimit) {
    setHistoryLoading(true);
    try { setHistoryData(await getPlanHistory(limit)); } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  }

  const filteredHistory = historySearch.trim()
    ? historyData.filter((entry) => {
        const q = historySearch.trim().toLowerCase();
        return entry.plan.meals.some((m) => m.name.toLowerCase().includes(q));
      })
    : historyData;

  // Load history whenever History tab is selected
  const prevTabRef = useRef<RecipeTab>("saved");
  if (activeTab === "history" && prevTabRef.current !== "history") {
    prevTabRef.current = "history";
    void loadHistory();
  } else if (activeTab !== "history") {
    prevTabRef.current = activeTab;
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
    return r.title.toLowerCase().includes(q) || (r.tags ?? []).some((t) => t.toLowerCase().includes(q));
  });

  const TABS: { key: RecipeTab; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
    { key: "saved", label: t("saved_tab"), icon: "bookmark" },
    { key: "liked", label: t("liked_tab"), icon: "heart" },
    { key: "history", label: t("tab_history"), icon: "time" },
    { key: "mine", label: t("mine_tab"), icon: "person" },
  ];

  const styles = makeStyles(c);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Sub-tab bar + search icon */}
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
        {activeTab !== "history" && (
          <TouchableOpacity
            style={styles.searchIconBtn}
            onPress={() => { setShowSearch((v) => !v); if (showSearch) setSearchText(""); Haptics.selectionAsync(); }}
          >
            <Ionicons name={showSearch ? "close" : "search"} size={20} color={c.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      {showSearch && activeTab !== "history" && (
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
        <FlatList
          data={filteredHistory}
          keyExtractor={(item) => item.date}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View>
              <View style={[styles.searchBar, { backgroundColor: c.inputBg, borderColor: c.border, marginBottom: 8 }]}>
                <Ionicons name="search" size={15} color={c.textPlaceholder} />
                <TextInput
                  style={[styles.searchInput, { color: c.text }]}
                  placeholder={t("search_history")}
                  placeholderTextColor={c.textPlaceholder}
                  value={historySearch}
                  onChangeText={setHistorySearch}
                  returnKeyType="search"
                />
                {historySearch.length > 0 && (
                  <TouchableOpacity onPress={() => setHistorySearch("")}>
                    <Ionicons name="close-circle" size={15} color={c.textPlaceholder} />
                  </TouchableOpacity>
                )}
              </View>
              {historyLoading && <ActivityIndicator style={{ marginTop: 12 }} color={c.primary} />}
            </View>
          }
          ListEmptyComponent={
            !historyLoading ? (
              <EmptyState
                icon="time-outline"
                title={t("history_empty_title")}
                body={t("history_empty_body")}
              />
            ) : null
          }
          renderItem={({ item: entry }) => (
            <View style={[styles.card, { backgroundColor: c.surface }]}>
              <View style={{ flex: 1, paddingVertical: 4 }}>
                <Text style={[styles.cardTitle, { color: c.text }]}>
                  {new Date(entry.date).toLocaleDateString(language === "zh" ? "zh-CN" : "en-US", { weekday: "short", month: "short", day: "numeric" })}
                </Text>
                <Text style={[styles.metaText, { color: c.textMuted, marginTop: 2 }]}>
                  {entry.total_calories} {t("calories_label")}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {entry.plan.meals.map((meal) => (
                    <View key={meal.slot} style={[styles.tag, { backgroundColor: c.chipBg }]}>
                      <Text style={[styles.tagText, { color: c.chipText }]}>
                        {t(meal.slot as "breakfast" | "lunch" | "dinner")} · {meal.name}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}
          showsVerticalScrollIndicator={false}
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
              <TouchableOpacity style={[styles.newRecipeBtn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]} onPress={openNewRecipe}>
                <Ionicons name="add" size={18} color={c.primary} />
                <Text style={[styles.newRecipeBtnText, { color: c.primary }]}>{t("new_recipe")}</Text>
              </TouchableOpacity>
            )}
            {activeTagFilter && (
              <View style={styles.tagFilterPill}>
                <Ionicons name="pricetag" size={12} color={c.primary} />
                <Text style={[styles.tagFilterText, { color: c.primary }]}>{activeTagFilter}</Text>
                <TouchableOpacity onPress={() => setActiveTagFilter(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="close-circle" size={14} color={c.primary} />
                </TouchableOpacity>
              </View>
            )}
            {loading && <ActivityIndicator style={{ marginTop: 24 }} color={c.primary} />}
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
                          <Text style={[styles.tagText, { color: isActive ? "#FFF" : c.chipText }]}>{tag}</Text>
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
                    placeholder="e.g. 30"
                    placeholderTextColor={c.textPlaceholder}
                  />
                  <Text style={[styles.editFieldLabel, { color: c.textMuted }]}>{t("edit_field_calories").toUpperCase()}</Text>
                  <TextInput
                    style={[styles.editInput, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
                    value={editCalories}
                    onChangeText={setEditCalories}
                    keyboardType="number-pad"
                    placeholder="e.g. 450"
                    placeholderTextColor={c.textPlaceholder}
                  />
                  <Text style={[styles.editFieldLabel, { color: c.textMuted }]}>{t("edit_field_servings").toUpperCase()}</Text>
                  <TextInput
                    style={[styles.editInput, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
                    value={editServings}
                    onChangeText={setEditServings}
                    keyboardType="number-pad"
                    placeholder="e.g. 2"
                    placeholderTextColor={c.textPlaceholder}
                  />

                  {/* Ingredients */}
                  <View style={styles.editSectionHeader}>
                    <Text style={[styles.editFieldLabel, { color: c.textMuted, marginBottom: 0 }]}>{t("edit_field_ingredients").toUpperCase()}</Text>
                    <TouchableOpacity
                      onPress={() => setEditIngredients((prev) => [...prev, { name: "", amount: "1", unit: "" }])}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="add-circle" size={22} color={c.primary} />
                    </TouchableOpacity>
                  </View>
                  {editIngredients.map((ing, i) => (
                    <View key={i} style={styles.editIngRow}>
                      <TextInput
                        style={[styles.editIngName, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
                        value={ing.name}
                        onChangeText={(v) => setEditIngredients((prev) => prev.map((x, j) => j === i ? { ...x, name: v } : x))}
                        placeholder="Ingredient"
                        placeholderTextColor={c.textPlaceholder}
                      />
                      <TextInput
                        style={[styles.editIngAmt, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
                        value={ing.amount}
                        onChangeText={(v) => setEditIngredients((prev) => prev.map((x, j) => j === i ? { ...x, amount: v } : x))}
                        keyboardType="decimal-pad"
                        placeholder="Amt"
                        placeholderTextColor={c.textPlaceholder}
                      />
                      <TextInput
                        style={[styles.editIngUnit, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
                        value={ing.unit}
                        onChangeText={(v) => setEditIngredients((prev) => prev.map((x, j) => j === i ? { ...x, unit: v } : x))}
                        placeholder="Unit"
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

                  {/* Steps */}
                  <View style={styles.editSectionHeader}>
                    <Text style={[styles.editFieldLabel, { color: c.textMuted, marginBottom: 0 }]}>{t("edit_field_steps").toUpperCase()}</Text>
                    <TouchableOpacity
                      onPress={() => setEditSteps((prev) => [...prev, ""])}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="add-circle" size={22} color={c.primary} />
                    </TouchableOpacity>
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
                        placeholder={`Step ${i + 1}`}
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

                  <ErrorBanner message={editError} style={{ marginTop: 8 }} />

                  <View style={styles.editActions}>
                    <TouchableOpacity
                      style={[styles.editCancelBtn, { backgroundColor: c.surfaceAlt }]}
                      onPress={() => { if (isNewRecipe) { closeModal(); } else { setIsEditing(false); setEditError(null); } }}
                    >
                      <Text style={[styles.editCancelText, { color: c.textMuted }]}>{t("cancel")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.editSaveBtn, { backgroundColor: editSaving ? c.disabled : c.primary }]}
                      onPress={handleSaveEdit}
                      disabled={editSaving}
                    >
                      {editSaving
                        ? <ActivityIndicator size="small" color="#FFF" />
                        : <Text style={styles.editSaveBtnText}>{selectedRecipe?.source_name === "__mine__" ? (language === "zh" ? "保存" : "Save") : (language === "zh" ? "存入「我的」" : "Save to Mine")}</Text>
                      }
                    </TouchableOpacity>
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

                  {/* Tags row */}
                  <View style={styles.detailTagsRow}>
                    {(selectedRecipe.tags ?? []).map((tag) => (
                      <View key={tag} style={[styles.tag, { backgroundColor: c.chipBg }]}>
                        <Text style={[styles.tagText, { color: c.chipText }]}>{tag}</Text>
                      </View>
                    ))}
                    {showTagInput ? (
                      <View style={[styles.tagInput, { backgroundColor: c.inputBg, borderColor: c.border }]}>
                        <TextInput
                          style={[{ fontSize: 12, color: c.text, minWidth: 60 }]}
                          value={newTagText}
                          onChangeText={setNewTagText}
                          placeholder={language === "zh" ? "输入标签…" : "Tag name…"}
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
                      <Text style={[styles.detailSectionLabel, { color: c.textPlaceholder }]}>
                        {t("ingredients_label")} ({selectedRecipe.ingredients!.length})
                      </Text>
                      {selectedRecipe.ingredients!.map((ing, i) => (
                        <View key={i} style={[styles.detailIngRow, { borderBottomColor: c.borderLight }]}>
                          <Text style={[styles.detailIngName, { color: c.textSecondary }]}>{ing.name}</Text>
                          <Text style={[styles.detailIngAmt, { color: c.textMuted }]}>{ing.amount} {ing.unit}</Text>
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
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
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
    card: {
      flexDirection: "row", alignItems: "flex-start",
      borderRadius: 14, padding: 14, marginBottom: 10,
      shadowColor: c.shadow, shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, gap: 12,
    },
    cardInfo: { flex: 1 },
    cardTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
    sourceName: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
    cardMeta: { flexDirection: "row", gap: 12, marginBottom: 6 },
    metaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
    metaText: { fontSize: 12 },
    labelRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 6 },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
    tag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    tagText: { fontSize: 11 },
    cardActions: { flexDirection: "column", gap: 6, alignItems: "center" },
    actionBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
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
    detailIngRow: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    detailIngName: { fontSize: 14, flex: 1 },
    detailIngAmt: { fontSize: 13 },
    detailStep: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
    detailStepNum: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    detailStepNumText: { fontSize: 11, fontWeight: "800", color: "#FFF" },
    detailStepText: { fontSize: 13, lineHeight: 18, flex: 1 },
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
    editStepInput: {
      flex: 1, borderWidth: 1, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, lineHeight: 18,
    },
    editActions: { flexDirection: "row", gap: 10, marginTop: 20 },
    editCancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    editCancelText: { fontSize: 15, fontWeight: "600" },
    editSaveBtn: { flex: 2, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    editSaveBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
    newRecipeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 16 },
    newRecipeBtnText: { fontSize: 15, fontWeight: "700" },
    tagFilterPill: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: c.primaryLight, marginBottom: 10 },
    tagFilterText: { fontSize: 13, fontWeight: "600" },
  });
}
