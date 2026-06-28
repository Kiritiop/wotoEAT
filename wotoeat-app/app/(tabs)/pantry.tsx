import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  SectionList,
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
import { usePantryDisplay } from "@/hooks/useDynamicTranslation";
import { categoryForItem, toCanonicalEnglish, CATEGORY_LABELS, PANTRY_CATEGORIES, PANTRY_OTHER_KEY } from "@/constants/filters";
import type { PantryItem } from "@/services/api";

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
  const [editingName, setEditingName] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Stored names are canonical English; display follows the current language.
  const displayNames = usePantryDisplay(pantry.map((p) => p.name));
  const displayByName = useMemo(
    () => new Map(pantry.map((p, i) => [p.name, displayNames[i] ?? p.name])),
    [pantry, displayNames],
  );

  // Group the saved pantry by category for an organized list ("Other" last).
  const sections = useMemo(() => {
    const groups: Record<string, PantryItem[]> = {};
    for (const item of pantry) {
      const key = categoryForItem(toCanonicalEnglish(item.name));
      (groups[key] ??= []).push(item);
    }
    const order = [...PANTRY_CATEGORIES.map((c) => c.key), PANTRY_OTHER_KEY];
    return order
      .filter((k) => groups[k]?.length)
      .map((k) => ({ key: k, data: groups[k] }));
  }, [pantry]);

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

  async function commitRename(oldName: string) {
    const newName = draft.trim();
    if (!newName || newName === oldName) {
      setEditingName(null);
      return;
    }
    const collision = pantry.some(
      (p) => p.name !== oldName && p.name.trim().toLowerCase() === newName.toLowerCase(),
    );
    if (collision) {
      setDeleteError(t("pantry_name_exists"));
      return; // keep edit mode open so the user can adjust
    }
    const renamed = pantry.map((p) => (p.name === oldName ? { name: newName } : p));
    setEditingName(null);
    setDeleteError(null);
    setPantry(renamed);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await replacePantry(renamed);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Could not rename.");
      loadPantry(); // restore server truth
    }
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
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.name}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadPantry(true)} tintColor={c.primary} />
        }
        renderSectionHeader={({ section }) =>
          pantry.length > 0 ? (
            <Text style={[styles.sectionHeader, { color: c.textPlaceholder }]}>
              {language === "zh" ? CATEGORY_LABELS[section.key].zh : CATEGORY_LABELS[section.key].en}
            </Text>
          ) : null
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
        renderItem={({ item }) =>
          item.name === editingName ? (
            <View style={[styles.itemRow, { backgroundColor: c.surface }]}>
              <TextInput
                style={[styles.itemEditInput, { color: c.text }]}
                value={draft}
                onChangeText={setDraft}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => commitRename(item.name)}
                placeholder={t("ingredient_name")}
                placeholderTextColor={c.textPlaceholder}
              />
              <TouchableOpacity
                onPress={() => commitRename(item.name)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="checkmark-circle" size={22} color={c.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setEditingName(null); setDeleteError(null); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ marginLeft: 12 }}
              >
                <Ionicons name="close-circle" size={20} color={c.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.itemRow, { backgroundColor: c.surface }]}>
              <Text style={[styles.itemName, { color: c.text }]}>{displayByName.get(item.name) ?? item.name}</Text>
              <TouchableOpacity
                onPress={() => {
                  // Prefill the RAW stored name — prefilling the translated
                  // display would rewrite storage on a no-op save.
                  setEditingName(item.name);
                  setDraft(item.name);
                  Haptics.selectionAsync();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ marginRight: 14 }}
              >
                <Ionicons name="create-outline" size={18} color={c.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDelete(item.name)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={20} color={c.textMuted} />
              </TouchableOpacity>
            </View>
          )
        }
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
    cartBtn: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    cartBadge: {
      position: "absolute", top: -4, right: -4,
      width: 16, height: 16, borderRadius: 8,
      alignItems: "center", justifyContent: "center",
    },
    cartBadgeText: { color: "#FFF", fontSize: 9, fontWeight: "700" },
    addRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
    addBtn: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
      backgroundColor: c.primary, borderRadius: 16, paddingVertical: 14, gap: 8,
    },
    addBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
    scanBtn: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
      borderRadius: 16, paddingVertical: 14, gap: 8, borderWidth: 1.5,
    },
    scanBtnText: { fontSize: 15, fontWeight: "700" },
    countLabel: { fontSize: 13, color: c.textPlaceholder, fontWeight: "600", marginBottom: 8 },
    sectionHeader: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
    itemRow: {
      flexDirection: "row", alignItems: "center", borderRadius: 16,
      paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
      shadowColor: c.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 1,
    },
    itemName: { flex: 1, fontSize: 15, fontWeight: "500", textTransform: "capitalize" },
    itemEditInput: { flex: 1, fontSize: 15, fontWeight: "500", paddingVertical: 0, marginRight: 12 },
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
      backgroundColor: c.primary, borderRadius: 16, paddingVertical: 14, gap: 8,
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
