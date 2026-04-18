import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
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
import { getSavedRecipes, deleteRecipe, upsertPantry } from "@/services/api";
import { useAppStore } from "@/store/useAppStore";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import FindRecipeModal from "@/components/FindRecipeModal";
import type { SavedRecipe } from "@/services/api";

type RecipeTab = "saved" | "favorites" | "frequent" | "done";

export default function RecipesScreen() {
  const { authReady, recipeLabels, addRecipeLabel, removeRecipeLabel, pantry, setPantry, language } = useAppStore();
  const c = useTheme();
  const { t, strings } = useTranslation();
  const router = useRouter();

  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<SavedRecipe | null>(null);
  const [activeTab, setActiveTab] = useState<RecipeTab>("saved");
  const [showFindRecipe, setShowFindRecipe] = useState(false);

  const loadRecipes = useCallback(async (isRefresh = false) => {
    if (!authReady) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await getSavedRecipes();
      setRecipes(data);
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
            {deleteError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={15} color={c.error} />
                <Text style={[styles.errorText, { color: c.error }]}>{deleteError}</Text>
              </View>
            )}
            {filteredRecipes.length > 0 && (
              <Text style={[styles.countLabel, { color: c.textPlaceholder }]}>
                {strings.recipe_count(filteredRecipes.length)}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconWrap, { backgroundColor: c.successBg }]}>
                <Ionicons name="book-outline" size={44} color={c.primaryLight} />
              </View>
              <Text style={[styles.emptyTitle, { color: c.text }]}>{t("no_recipes_title")}</Text>
              <Text style={[styles.emptyText, { color: c.textMuted }]}>{t("no_recipes_body")}</Text>
            </View>
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

      {/* Recipe detail modal */}
      <Modal visible={!!selectedRecipe} animationType="slide" presentationStyle="pageSheet">
        {selectedRecipe && (
          <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
            <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
              <Text style={[styles.modalTitle, { color: c.text }]} numberOfLines={2}>
                {selectedRecipe.title}
              </Text>
              <TouchableOpacity onPress={() => setSelectedRecipe(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
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
    errorBanner: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: c.errorBg, borderRadius: 10, padding: 10, marginBottom: 10,
    },
    errorText: { fontSize: 13, flex: 1 },
    emptyState: { alignItems: "center", paddingVertical: 48, gap: 10 },
    emptyIconWrap: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginBottom: 4 },
    emptyTitle: { fontSize: 18, fontWeight: "700" },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 16 },
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
    modalTitle: { fontSize: 18, fontWeight: "700", flex: 1, marginRight: 12 },
    modalContent: { padding: 20, paddingBottom: 40 },
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
  });
}
