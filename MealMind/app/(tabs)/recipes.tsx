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
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { getSavedRecipes, deleteRecipe, updateRecipe, upsertPantry } from "@/services/api";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAppStore } from "@/store/useAppStore";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import FindRecipeModal from "@/components/FindRecipeModal";
import type { SavedRecipe, Ingredient } from "@/services/api";

type RecipeTab = "saved" | "favorites" | "frequent" | "done";

export default function RecipesScreen() {
  const { authReady, recipeLabels, addRecipeLabel, removeRecipeLabel, pantry, setPantry, language, removeFromShoppingList } = useAppStore();
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
  const [activeTab, setActiveTab] = useState<RecipeTab>("saved");
  const [showFindRecipe, setShowFindRecipe] = useState(false);

  // ── Edit mode ─────────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editPrepTime, setEditPrepTime] = useState("");
  const [editCalories, setEditCalories] = useState("");
  const [editServings, setEditServings] = useState("");
  const [editIngredients, setEditIngredients] = useState<{ name: string; amount: string; unit: string }[]>([]);
  const [editSteps, setEditSteps] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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
    setEditError(null);
    setIsEditing(true);
    Haptics.selectionAsync();
  }

  async function handleSaveEdit() {
    if (!selectedRecipe) return;
    if (!editTitle.trim()) { setEditError("Title is required."); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      const ingredients: Ingredient[] = editIngredients
        .filter((i) => i.name.trim())
        .map((i) => ({ name: i.name.trim(), amount: parseFloat(i.amount) || 1, unit: i.unit.trim() }));
      const updated = await updateRecipe(selectedRecipe.id, {
        title: editTitle.trim(),
        servings: parseInt(editServings) || 2,
        prep_time_mins: parseInt(editPrepTime) || 0,
        calories_per_serving: parseInt(editCalories) || undefined,
        ingredients,
        steps: editSteps.filter((s) => s.trim()),
        tags: selectedRecipe.tags ?? [],
        warnings: [],
        source_name: selectedRecipe.source_name,
      });
      setRecipes((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      setSelectedRecipe(updated);
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
    if (labels.includes(label)) {
      removeRecipeLabel(recipeId, label);
    } else {
      addRecipeLabel(recipeId, label);
    }
    Haptics.selectionAsync();
  }

  async function handleMarkDone(recipe: SavedRecipe) {
    // Reduce pantry inventory for matching ingredients
    if (!recipe.ingredients?.length) {
      addRecipeLabel(recipe.id, "done");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    const newPantry = [...pantry];
    const reduced: string[] = [];

    for (const ing of recipe.ingredients) {
      const idx = newPantry.findIndex(
        (p) => p.name.toLowerCase().includes(ing.name.toLowerCase()) ||
               ing.name.toLowerCase().includes(p.name.toLowerCase())
      );
      if (idx !== -1) {
        const pantryItem = newPantry[idx];
        const newAmount = Math.max(0, pantryItem.amount - ing.amount);
        newPantry[idx] = { ...pantryItem, amount: Math.round(newAmount * 10) / 10 };
        reduced.push(ing.name);
      }
    }

    // Filter out items at 0
    const filteredPantry = newPantry.filter((p) => p.amount > 0);
    setPantry(filteredPantry);
    try { await upsertPantry(filteredPantry); } catch { /* best-effort */ }

    // BUG-09: clean up shopping list items for this recipe (try all slot prefixes)
    const slots = ["breakfast", "lunch", "dinner"];
    for (const slot of slots) {
      const category = `${slot}-${recipe.title}`;
      (recipe.ingredients ?? []).forEach((ing) => removeFromShoppingList(category, ing.name));
    }
    // Also try bare title in case it was added without a slot prefix
    (recipe.ingredients ?? []).forEach((ing) => removeFromShoppingList(recipe.title, ing.name));

    addRecipeLabel(recipe.id, "done");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (reduced.length > 0) {
      Alert.alert(
        t("mark_done"),
        `${t("done_reduces_pantry")}\n\n${reduced.join(", ")}`,
        [{ text: "OK" }]
      );
    }
  }

  // Filter recipes by active tab
  const filteredRecipes = recipes.filter((r) => {
    const labels = recipeLabels[r.id] ?? [];
    if (activeTab === "saved") return true;
    return labels.includes(activeTab === "favorites" ? "favorite" : activeTab === "frequent" ? "frequent" : "done");
  });

  const TABS: { key: RecipeTab; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
    { key: "saved", label: t("saved_tab"), icon: "bookmark" },
    { key: "favorites", label: t("favorites_tab"), icon: "heart" },
    { key: "frequent", label: t("frequent_tab"), icon: "repeat" },
    { key: "done", label: t("done_tab"), icon: "checkmark-circle" },
  ];

  const styles = makeStyles(c);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Sub-tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        {TABS.map(({ key, label, icon }) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, activeTab === key && { borderBottomColor: c.primary, borderBottomWidth: 2 }]}
            onPress={() => { setActiveTab(key); Haptics.selectionAsync(); }}
          >
            <Ionicons name={icon} size={14} color={activeTab === key ? c.primary : c.textMuted} />
            <Text style={[styles.tabLabel, { color: activeTab === key ? c.primary : c.textMuted }, activeTab === key && { fontWeight: "700" }]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredRecipes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadRecipes(true)} tintColor={c.primary} />
        }
        ListHeaderComponent={
          <View>
            <TouchableOpacity style={styles.uploadBtn} onPress={() => setShowFindRecipe(true)}>
              <Ionicons name="search" size={18} color="#FFF" />
              <Text style={styles.uploadBtnText}>{t("find_recipe")}</Text>
            </TouchableOpacity>
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
          const isFrequent = labels.includes("frequent");
          const isDone = labels.includes("done");
          return (
            <View style={[styles.card, { backgroundColor: c.surface }]}>
              <TouchableOpacity style={styles.cardInfo} onPress={() => setSelectedRecipe(item)} activeOpacity={0.7}>
                <Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={2}>{item.title}</Text>
                {item.source_name && (
                  <Text style={[styles.sourceName, { color: c.primary }]}>{item.source_name}</Text>
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
                  {isFrequent && <LabelChip icon="repeat" label={t("mark_frequent")} color="#8B5CF6" bg="#F5F3FF" />}
                  {isDone && <LabelChip icon="checkmark-circle" label={t("done_tab")} color="#16A34A" bg="#F0FDF4" />}
                </View>
                {(item.tags?.length ?? 0) > 0 && (
                  <View style={styles.tags}>
                    {item.tags!.slice(0, 3).map((tag) => (
                      <View key={tag} style={[styles.tag, { backgroundColor: c.chipBg }]}>
                        <Text style={[styles.tagText, { color: c.chipText }]}>{tag}</Text>
                      </View>
                    ))}
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
                      style={[styles.actionBtn, { backgroundColor: isFrequent ? "#F5F3FF" : c.surfaceAlt }]}
                      onPress={() => toggleLabel(item.id, "frequent")}
                    >
                      <Ionicons name="repeat" size={16} color={isFrequent ? "#8B5CF6" : c.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: isDone ? "#F0FDF4" : c.surfaceAlt }]}
                      onPress={() => handleMarkDone(item)}
                    >
                      <Ionicons name={isDone ? "checkmark-circle" : "checkmark-circle-outline"} size={16} color={isDone ? "#16A34A" : c.textMuted} />
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

      {/* Find Recipe modal */}
      <FindRecipeModal
        visible={showFindRecipe}
        onClose={() => setShowFindRecipe(false)}
        onSaved={() => { loadRecipes(); setActiveTab("saved"); }}
      />

      {/* Recipe detail / edit modal */}
      <Modal visible={!!selectedRecipe} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setIsEditing(false); setSelectedRecipe(null); }}>
        {selectedRecipe && (
          <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
            <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
              {isEditing ? (
                <TextInput
                  style={[styles.editTitleInput, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
                  value={editTitle}
                  onChangeText={setEditTitle}
                  placeholder="Recipe title"
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
                <TouchableOpacity onPress={() => { setIsEditing(false); setSelectedRecipe(null); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={24} color={c.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {isEditing ? (
                <>
                  {/* Basic fields */}
                  <Text style={[styles.editFieldLabel, { color: c.textMuted }]}>PREP TIME (MIN)</Text>
                  <TextInput
                    style={[styles.editInput, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
                    value={editPrepTime}
                    onChangeText={setEditPrepTime}
                    keyboardType="number-pad"
                    placeholder="e.g. 30"
                    placeholderTextColor={c.textPlaceholder}
                  />
                  <Text style={[styles.editFieldLabel, { color: c.textMuted }]}>CALORIES / SERVING</Text>
                  <TextInput
                    style={[styles.editInput, { color: c.text, borderColor: c.border, backgroundColor: c.inputBg }]}
                    value={editCalories}
                    onChangeText={setEditCalories}
                    keyboardType="number-pad"
                    placeholder="e.g. 450"
                    placeholderTextColor={c.textPlaceholder}
                  />
                  <Text style={[styles.editFieldLabel, { color: c.textMuted }]}>SERVINGS</Text>
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
                    <Text style={[styles.editFieldLabel, { color: c.textMuted, marginBottom: 0 }]}>INGREDIENTS</Text>
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
                    <Text style={[styles.editFieldLabel, { color: c.textMuted, marginBottom: 0 }]}>STEPS</Text>
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
                      onPress={() => { setIsEditing(false); setEditError(null); }}
                    >
                      <Text style={[styles.editCancelText, { color: c.textMuted }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.editSaveBtn, { backgroundColor: editSaving ? c.disabled : c.primary }]}
                      onPress={handleSaveEdit}
                      disabled={editSaving}
                    >
                      {editSaving
                        ? <ActivityIndicator size="small" color="#FFF" />
                        : <Text style={styles.editSaveBtnText}>Save changes</Text>
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
    tabBar: {
      flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth,
    },
    tab: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 4, paddingVertical: 10,
    },
    tabLabel: { fontSize: 11, fontWeight: "600" },
    content: { padding: 16, paddingBottom: 40 },
    uploadBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      backgroundColor: c.accent, borderRadius: 14, paddingVertical: 13,
      gap: 8, marginBottom: 16,
    },
    uploadBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
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
  });
}
