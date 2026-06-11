import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  RefreshControl,
  Share,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "@/store/useAppStore";
import { getPantry, replacePantry, deletePantryItem, generateShoppingList } from "@/services/api";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { PantryTagPicker } from "@/components/PantryTagPicker";
import { formatShoppingListText, countShoppingItems } from "@/utils/shopping";
import { IngredientRow } from "@/components/IngredientRow";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";

export default function PantryScreen() {
  const {
    pantry, setPantry, authReady, language,
    shoppingList, setShoppingList, clearShoppingList, toggleShoppingItem, selectedRecipes,
  } = useAppStore();
  const c = useTheme();
  const { t, strings } = useTranslation();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Shopping modal state ──────────────────────────────────────────────────
  const [showShopping, setShowShopping] = useState(false);
  const [shoppingLoading, setShoppingLoading] = useState(false);
  const [shoppingError, setShoppingError] = useState<string | null>(null);

  const loadPantry = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const items = await getPantry();
      setPantry(items);
    } catch {
      // Silently ignore — user might be offline
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [setPantry]);

  useEffect(() => {
    if (!authReady) return;
    loadPantry();
  }, [loadPantry, authReady]);

  async function handleDelete(name: string) {
    setDeleteError(null);
    try {
      await deletePantryItem(name);
      setPantry(pantry.filter((p) => p.name !== name));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  async function handleTagPickerSave(names: string[]) {
    const newItems = names.map((name) => ({ name }));
    setPantry(newItems);
    setShowTagPicker(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try { await replacePantry(newItems); } catch { /* best-effort */ }
  }

  // ── Shopping helpers ──────────────────────────────────────────────────────
  async function handleGenerateShopping() {
    if (selectedRecipes.length === 0) {
      setShoppingError(t("no_recipes_selected"));
      return;
    }
    setShoppingError(null);
    setShoppingLoading(true);
    try {
      const list = await generateShoppingList(selectedRecipes, pantry, language);
      setShoppingList(list);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      setShoppingError(err instanceof Error ? err.message : "Failed to generate list.");
    } finally {
      setShoppingLoading(false);
    }
  }

  async function handleShareShopping() {
    if (!shoppingList) return;
    await Share.share({ message: formatShoppingListText(shoppingList, language) });
  }

  const { total: totalItems, checked: checkedItems } = shoppingList
    ? countShoppingItems(shoppingList)
    : { total: 0, checked: 0 };

  const styles = makeStyles(c);

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={pantry}
        keyExtractor={(item) => item.name}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadPantry(true)} tintColor={c.primary} />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.headerRow}>
              <Text style={[styles.intro, { flex: 1 }]}>{t("pantry_intro")}</Text>
              <TouchableOpacity
                style={[styles.cartBtn, { backgroundColor: c.surfaceAlt }]}
                onPress={() => { setShowShopping(true); Haptics.selectionAsync(); }}
              >
                <Ionicons name="cart-outline" size={22} color={c.primary} />
                {selectedRecipes.length > 0 && (
                  <View style={[styles.cartBadge, { backgroundColor: c.primary }]}>
                    <Text style={styles.cartBadgeText}>{selectedRecipes.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.addRow}>
              <TouchableOpacity style={styles.addBtn} onPress={() => { setShowTagPicker(true); Haptics.selectionAsync(); }}>
                <Ionicons name="add" size={20} color="#FFF" />
                <Text style={styles.addBtnText}>{t("add_ingredient")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.scanBtn, { borderColor: c.primary }]}
                onPress={() => {
                  Haptics.selectionAsync();
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  router.push("/pantry/scan" as any);
                }}
              >
                <Ionicons name="scan-outline" size={18} color={c.primary} />
                <Text style={[styles.scanBtnText, { color: c.primary }]}>{t("scan_receipt")}</Text>
              </TouchableOpacity>
            </View>
            {loading && <ActivityIndicator style={{ marginTop: 24 }} color={c.primary} />}
            <ErrorBanner message={deleteError} style={{ marginTop: 8 }} />
            {pantry.length > 0 && (
              <Text style={styles.countLabel}>{strings.pantry_count(pantry.length)}</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="nutrition-outline"
              iconSize={40}
              title={t("pantry_empty_title")}
              body={t("pantry_empty_body")}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[styles.itemRow, { backgroundColor: c.surface }]}>
            <Text style={[styles.itemName, { color: c.text }]}>{item.name}</Text>
            <TouchableOpacity
              onPress={() => handleDelete(item.name)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close-circle" size={20} color={c.textMuted} />
            </TouchableOpacity>
          </View>
        )}
        showsVerticalScrollIndicator={false}
      />

      {/* Tag picker modal */}
      <PantryTagPicker
        visible={showTagPicker}
        currentPantry={pantry.map((p) => p.name)}
        onClose={() => setShowTagPicker(false)}
        onSave={handleTagPickerSave}
        language={language}
      />

      {/* ── Shopping list modal ───────────────────────────────────────────── */}
      <Modal visible={showShopping} animationType="slide" transparent={false} presentationStyle="pageSheet">
        <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
          <View style={[styles.shoppingHeader, { borderBottomColor: c.border }]}>
            <Text style={[styles.shoppingTitle, { color: c.text }]}>{t("shopping_list")}</Text>
            <View style={styles.shoppingHeaderActions}>
              {shoppingList && (
                <>
                  <TouchableOpacity onPress={handleShareShopping} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="share-outline" size={22} color={c.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { clearShoppingList(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={22} color={c.error} />
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity onPress={() => setShowShopping(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color={c.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.shoppingGenRow}>
            <ErrorBanner message={shoppingError} style={{ marginBottom: 8 }} />
            <TouchableOpacity
              style={[styles.generateBtn, shoppingLoading && { backgroundColor: c.disabled }]}
              onPress={handleGenerateShopping}
              disabled={shoppingLoading}
            >
              {shoppingLoading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={16} color="#FFF" />
                  <Text style={styles.generateBtnText}>
                    {t("generate_list")} ({selectedRecipes.length})
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {!shoppingList && !shoppingLoading && (
            <EmptyState
              icon="cart-outline"
              iconSize={48}
              title={t("cart_empty")}
              body={t("cart_empty_sub")}
            />
          )}

          {shoppingList && (
            <ScrollView contentContainerStyle={styles.shoppingContent} showsVerticalScrollIndicator={false}>
              <View style={styles.shoppingSummary}>
                <Text style={[styles.summaryText, { color: c.textMuted }]}>
                  {strings.items_progress(checkedItems, totalItems)}
                </Text>
              </View>
              {shoppingList.groups.map((group) => (
                <View key={group.category} style={styles.shoppingGroup}>
                  <Text style={[styles.groupLabel, { color: c.textPlaceholder }]}>{group.category}</Text>
                  {group.items.map((item) => (
                    <IngredientRow
                      key={item.name}
                      item={item}
                      showCheckbox
                      onToggle={() => { toggleShoppingItem(group.category, item.name); Haptics.selectionAsync(); }}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, paddingBottom: 40 },
    headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 10 },
    intro: { fontSize: 13, color: c.textMuted, lineHeight: 19 },
    cartBtn: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    cartBadge: {
      position: "absolute", top: -4, right: -4,
      width: 16, height: 16, borderRadius: 8,
      alignItems: "center", justifyContent: "center",
    },
    cartBadgeText: { color: "#FFF", fontSize: 9, fontWeight: "700" },
    addRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
    addBtn: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
      backgroundColor: c.primary, borderRadius: 14, paddingVertical: 13, gap: 8,
    },
    addBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
    scanBtn: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
      borderRadius: 14, paddingVertical: 13, gap: 8, borderWidth: 1.5,
    },
    scanBtnText: { fontSize: 15, fontWeight: "700" },
    countLabel: { fontSize: 13, color: c.textPlaceholder, fontWeight: "600", marginBottom: 8 },
    itemRow: {
      flexDirection: "row", alignItems: "center", borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 10, marginBottom: 6,
      shadowColor: c.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    itemName: { flex: 1, fontSize: 15, fontWeight: "500", textTransform: "capitalize" },
    // Shopping modal
    shoppingHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    shoppingTitle: { fontSize: 20, fontWeight: "800" },
    shoppingHeaderActions: { flexDirection: "row", alignItems: "center", gap: 16 },
    shoppingGenRow: { paddingHorizontal: 16, paddingTop: 12 },
    generateBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      backgroundColor: c.primary, borderRadius: 14, paddingVertical: 13, gap: 8,
    },
    generateBtnText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
    shoppingContent: { paddingHorizontal: 16, paddingBottom: 40 },
    shoppingSummary: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 },
    summaryText: { fontSize: 14, fontWeight: "600" },
    shoppingGroup: { marginBottom: 20 },
    groupLabel: {
      fontSize: 13, fontWeight: "700", textTransform: "uppercase",
      letterSpacing: 0.6, marginBottom: 4,
    },
  });
}
