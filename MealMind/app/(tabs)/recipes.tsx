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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { getSavedRecipes, deleteRecipe } from "@/services/api";
import { useAppStore } from "@/store/useAppStore";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import type { SavedRecipe } from "@/services/api";

export default function RecipesScreen() {
  const { authReady } = useAppStore();
  const c = useTheme();
  const { t, strings } = useTranslation();
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<SavedRecipe | null>(null);
  const router = useRouter();

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

  useFocusEffect(
    useCallback(() => {
      void loadRecipes();
    }, [loadRecipes])
  );

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

  const styles = makeStyles(c);

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadRecipes(true)} tintColor={c.primary} />
        }
        ListHeaderComponent={
          <View>
            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={() => router.push("/recipe/upload")}
            >
              <Ionicons name="link" size={18} color="#FFF" />
              <Text style={styles.uploadBtnText}>{t("add_recipe_url")}</Text>
            </TouchableOpacity>
            {loading && (
              <ActivityIndicator style={{ marginTop: 24 }} color={c.primary} />
            )}
            {deleteError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={15} color={c.error} />
                <Text style={[styles.errorText, { color: c.error }]}>{deleteError}</Text>
              </View>
            )}
            {recipes.length > 0 && (
              <Text style={[styles.countLabel, { color: c.textPlaceholder }]}>
                {strings.recipe_count(recipes.length)}
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
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity style={styles.cardInfo} onPress={() => setSelectedRecipe(item)} activeOpacity={0.7}>
            <Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={2}>
                {item.title}
              </Text>
              {item.source_name && (
                <Text style={[styles.sourceName, { color: c.primary }]}>{item.source_name}</Text>
              )}
              <View style={styles.cardMeta}>
                {item.prep_time_mins != null && (
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={12} color={c.textMuted} />
                    <Text style={[styles.metaText, { color: c.textMuted }]}>{item.prep_time_mins} min</Text>
                  </View>
                )}
                {item.calories_per_serving != null && (
                  <View style={styles.metaItem}>
                    <Ionicons name="flame-outline" size={12} color={c.textMuted} />
                    <Text style={[styles.metaText, { color: c.textMuted }]}>{item.calories_per_serving} kcal</Text>
                  </View>
                )}
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

            {pendingDelete === item.id ? (
              <View style={styles.confirmRow}>
                <TouchableOpacity
                  style={[styles.confirmDeleteBtn, { backgroundColor: c.error }]}
                  onPress={() => handleDelete(item.id)}
                >
                  <Text style={styles.confirmDeleteText}>{t("delete")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmCancelBtn, { backgroundColor: c.surfaceAlt }]}
                  onPress={() => setPendingDelete(null)}
                >
                  <Text style={[styles.confirmCancelText, { color: c.textMuted }]}>{t("cancel")}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => { setPendingDelete(item.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="trash-outline" size={20} color={c.error} />
              </TouchableOpacity>
            )}
          </View>
        )}
        showsVerticalScrollIndicator={false}
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
                    <Text style={[styles.detailChipText, { color: c.textMuted }]}>{selectedRecipe.prep_time_mins} min</Text>
                  </View>
                )}
                {selectedRecipe.calories_per_serving != null && (
                  <View style={[styles.detailChip, { backgroundColor: c.surfaceAlt }]}>
                    <Ionicons name="flame-outline" size={13} color={c.textMuted} />
                    <Text style={[styles.detailChipText, { color: c.textMuted }]}>{selectedRecipe.calories_per_serving} kcal</Text>
                  </View>
                )}
              </View>

              {(selectedRecipe.ingredients?.length ?? 0) > 0 && (
                <>
                  <Text style={[styles.detailSectionLabel, { color: c.textPlaceholder }]}>
                    Ingredients ({selectedRecipe.ingredients!.length})
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
                    Steps ({selectedRecipe.steps!.length})
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

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
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
    emptyIconWrap: {
      width: 88, height: 88, borderRadius: 44,
      alignItems: "center", justifyContent: "center", marginBottom: 4,
    },
    emptyTitle: { fontSize: 18, fontWeight: "700" },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 16 },
    card: {
      flexDirection: "row", alignItems: "flex-start",
      backgroundColor: c.surface, borderRadius: 14, padding: 14, marginBottom: 10,
      shadowColor: c.shadow, shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, gap: 12,
    },
    cardInfo: { flex: 1 },
    cardTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
    sourceName: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
    cardMeta: { flexDirection: "row", gap: 12 },
    metaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
    metaText: { fontSize: 12 },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
    tag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    tagText: { fontSize: 11 },
    confirmRow: { flexDirection: "column", gap: 4, alignItems: "flex-end" },
    confirmDeleteBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
    confirmDeleteText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
    confirmCancelBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
    confirmCancelText: { fontSize: 12, fontWeight: "600" },
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
    detailIngName: { fontSize: 14, fontWeight: "500", flex: 1 },
    detailIngAmt: { fontSize: 13 },
    detailStep: { flexDirection: "row", gap: 12, marginBottom: 12 },
    detailStepNum: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 1 },
    detailStepNumText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
    detailStepText: { fontSize: 14, lineHeight: 21, flex: 1 },
  });
}
