import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  RefreshControl,
  Share,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "@/store/useAppStore";
import { getPantry, upsertPantry, deletePantryItem, generateShoppingList } from "@/services/api";
import { getPantryUnits } from "@/constants/filters";
import { toGrams, intuitiveHint } from "@/constants/conversions";
import { IngredientRow } from "@/components/IngredientRow";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatShoppingListText, countShoppingItems } from "@/utils/shopping";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import type { PantryItem } from "@/services/api";

/** Heuristic unit recommendation based on ingredient name and language. */
function recommendUnit(name: string, language: string): string {
  const n = name.toLowerCase();
  if (/oil|sauce|milk|juice|broth|stock|vinegar|wine|beer|cream|liquid|油|汁|奶|醋|汤/.test(n)) return "ml";
  if (language === "zh") {
    if (/egg|鸡蛋|蛋|apple|banana|orange|lemon|lime|onion|potato|avocado|mango|苹果|香蕉|橙|柠檬|洋葱|马铃薯/.test(n)) return "个";
    if (/fish|basa|tilapia|salmon|fillet|巴沙|鱼|carrot|胡萝卜|cucumber|黄瓜/.test(n)) return "条";
    if (/shrimp|prawn|虾|spinach|kale|greens|lettuce|菠菜|生菜|frozen|冷冻/.test(n)) return "袋";
    if (/tofu|豆腐|yogurt|酸奶/.test(n)) return "盒";
    if (/soy sauce|生抽|老抽|oyster sauce|蚝油/.test(n)) return "瓶";
  } else {
    if (/egg|apple|banana|orange|lemon|lime|onion|potato|avocado|mango|tomato|carrot|cucumber/.test(n)) return "piece";
    if (/fish|basa|tilapia|salmon|fillet|shrimp|prawn/.test(n)) return "g";
  }
  return "g";
}

export default function PantryScreen() {
  const {
    pantry, setPantry, authReady, language,
    shoppingList, setShoppingList, clearShoppingList, toggleShoppingItem, selectedRecipes,
  } = useAppStore();
  const c = useTheme();
  const { t, strings } = useTranslation();

  // ── Pantry state ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newUnit, setNewUnit] = useState("g");
  const [unitManuallySet, setUnitManuallySet] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Shopping modal state ──────────────────────────────────────────────────
  const [showShopping, setShowShopping] = useState(false);
  const [shoppingLoading, setShoppingLoading] = useState(false);
  const [shoppingError, setShoppingError] = useState<string | null>(null);

  // Auto-recommend unit whenever name changes and user hasn't manually picked one
  useEffect(() => {
    if (!unitManuallySet && newName.trim().length > 1) {
      setNewUnit(recommendUnit(newName, language));
    }
  }, [newName, unitManuallySet, language]);

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

  function openAdd() {
    setEditingItem(null);
    setNewName(""); setNewAmount(""); setNewUnit("g");
    setUnitManuallySet(false); setShowUnitPicker(false);
    setNameError(false); setAmountError(false); setFormError(null);
    setShowModal(true);
    Haptics.selectionAsync();
  }

  function openEdit(item: PantryItem) {
    setEditingItem(item);
    setNewName(item.name);
    setNewAmount(String(item.amount));
    setNewUnit(item.unit);
    setUnitManuallySet(true);
    setShowUnitPicker(false);
    setNameError(false); setAmountError(false); setFormError(null);
    setShowModal(true);
    Haptics.selectionAsync();
  }

  async function handleSave() {
    let hasError = false;
    if (!newName.trim()) { setNameError(true); hasError = true; } else setNameError(false);
    if (!newAmount.trim()) { setAmountError(true); hasError = true; } else setAmountError(false);

    if (hasError) {
      setFormError(!newName.trim() ? t("missing_name") : t("missing_amount"));
      return;
    }

    const parsed = parseFloat(newAmount);
    if (isNaN(parsed) || parsed <= 0) {
      setAmountError(true);
      setFormError(t("invalid_amount"));
      return;
    }

    // Task 2: auto-convert piece units to grams
    const gramAmount = toGrams(parsed, newUnit, newName.trim());
    const finalAmount = gramAmount ?? parsed;
    const finalUnit = gramAmount != null ? "g" : newUnit;

    const item: PantryItem = { name: newName.trim().toLowerCase(), amount: finalAmount, unit: finalUnit };
    setFormError(null);
    setSaving(true);
    try {
      if (editingItem && editingItem.name !== item.name) {
        await deletePantryItem(editingItem.name);
        setPantry(pantry.filter((p) => p.name !== editingItem.name));
      }

      // Task 3: stack amounts if same ingredient already exists (when adding, not editing)
      const existing = editingItem ? null : pantry.find((p) => p.name === item.name && p.unit === item.unit);
      const savedItem = existing
        ? { ...item, amount: Math.round((existing.amount + item.amount) * 10) / 10 }
        : item;

      await upsertPantry([savedItem]);
      setPantry([...pantry.filter((p) => p.name !== savedItem.name), savedItem]);
      setShowModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Could not save.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  }

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
    await Share.share({ message: formatShoppingListText(shoppingList) });
  }

  const { total: totalItems, checked: checkedItems } = shoppingList
    ? countShoppingItems(shoppingList)
    : { total: 0, checked: 0 };

  const styles = makeStyles(c);
  const isRecommended = !unitManuallySet && newName.trim().length > 1;
  const conversionGrams = newAmount.trim() && !isNaN(parseFloat(newAmount))
    ? toGrams(parseFloat(newAmount), newUnit, newName)
    : null;

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
            {/* Header row with add + cart buttons */}
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

            <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
              <Ionicons name="add" size={20} color="#FFF" />
              <Text style={styles.addBtnText}>{t("add_ingredient")}</Text>
            </TouchableOpacity>
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
        renderItem={({ item }) => {
          const hint = intuitiveHint(item.amount, item.name, language);
          return (
            <View style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, { color: c.text }]}>{item.name}</Text>
                <Text style={[styles.itemAmount, { color: c.textMuted }]}>
                  {item.amount} {item.unit}
                  {hint ? <Text style={{ color: c.primary }}> {hint}</Text> : null}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => openEdit(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ marginRight: 12 }}
              >
                <Ionicons name="pencil-outline" size={18} color={c.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDelete(item.name)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="trash-outline" size={20} color={c.error} />
              </TouchableOpacity>
            </View>
          );
        }}
        showsVerticalScrollIndicator={false}
      />

      {/* ── Add / Edit modal ──────────────────────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: c.text }]}>
              {editingItem ? t("edit_ingredient") : t("add_to_pantry")}
            </Text>

            <Text style={[styles.fieldLabel, { color: c.textMuted }]}>{t("ingredient_name")}</Text>
            <TextInput
              style={[styles.input, { borderColor: nameError ? c.error : c.border, backgroundColor: c.inputBg, color: c.text }]}
              placeholder={t("ingredient_name_placeholder")}
              placeholderTextColor={c.textPlaceholder}
              value={newName}
              onChangeText={(v) => { setNewName(v); if (v.trim()) setNameError(false); }}
              autoFocus={!editingItem}
            />

            <Text style={[styles.fieldLabel, { color: c.textMuted }]}>{t("amount")}</Text>
            <TextInput
              style={[styles.input, { borderColor: amountError ? c.error : c.border, backgroundColor: c.inputBg, color: c.text }]}
              placeholder={t("amount_placeholder")}
              keyboardType="decimal-pad"
              placeholderTextColor={c.textPlaceholder}
              value={newAmount}
              onChangeText={(v) => { setNewAmount(v); if (v.trim()) setAmountError(false); }}
            />

            <Text style={[styles.fieldLabel, { color: c.textMuted }]}>{t("unit")}</Text>
            <View style={styles.unitRow}>
              <TouchableOpacity
                style={[styles.unitBtn, { backgroundColor: c.primary }]}
                onPress={() => { setShowUnitPicker((v) => !v); Haptics.selectionAsync(); }}
              >
                <Text style={styles.unitBtnText}>{newUnit}</Text>
                <Ionicons name={showUnitPicker ? "chevron-up" : "chevron-down"} size={14} color="#FFF" />
              </TouchableOpacity>
              {isRecommended && (
                <View style={[styles.suggestedBadge, { backgroundColor: c.primaryLight }]}>
                  <Ionicons name="sparkles" size={11} color={c.primary} />
                  <Text style={[styles.suggestedText, { color: c.primary }]}>suggested</Text>
                </View>
              )}
              {conversionGrams != null && (
                <Text style={[styles.conversionHint, { color: c.textMuted }]}>→ {conversionGrams}g</Text>
              )}
            </View>

            {showUnitPicker && (
              <View style={[styles.unitDropdown, { backgroundColor: c.surface, borderColor: c.border }]}>
                {getPantryUnits(language).map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.unitOption, u === newUnit && { backgroundColor: c.primaryLight }]}
                    onPress={() => { setNewUnit(u); setUnitManuallySet(true); setShowUnitPicker(false); Haptics.selectionAsync(); }}
                  >
                    <Text style={[styles.unitOptionText, { color: u === newUnit ? c.primary : c.text }, u === newUnit && { fontWeight: "700" }]}>
                      {u}
                    </Text>
                    {u === newUnit && <Ionicons name="checkmark" size={14} color={c.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <ErrorBanner message={formError} style={{ marginTop: 8 }} />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: c.surfaceAlt }]}
                onPress={() => setShowModal(false)}
              >
                <Text style={[styles.cancelText, { color: c.textMuted }]}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: saving ? c.disabled : c.primary }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? t("saving") : editingItem ? t("save") : t("add")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Shopping list modal ───────────────────────────────────────────── */}
      <Modal visible={showShopping} animationType="slide" transparent={false} presentationStyle="pageSheet">
        <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
          {/* Header */}
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

          {/* Generate button */}
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
                {shoppingList.total_calories != null && (
                  <Text style={[styles.calText, { color: c.accent }]}>
                    ~{shoppingList.total_calories} {t("calories_label")}
                  </Text>
                )}
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
    addBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      backgroundColor: c.primary, borderRadius: 14, paddingVertical: 13, gap: 8, marginBottom: 16,
    },
    addBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
    countLabel: { fontSize: 13, color: c.textPlaceholder, fontWeight: "600", marginBottom: 8 },
    itemRow: {
      flexDirection: "row", alignItems: "center", backgroundColor: c.surface, borderRadius: 12,
      padding: 14, marginBottom: 8,
      shadowColor: c.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
    },
    itemInfo: { flex: 1 },
    itemName: { fontSize: 15, fontWeight: "600", textTransform: "capitalize" },
    itemAmount: { fontSize: 13, marginTop: 2 },
    // Modal (add/edit)
    modalBackdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: "flex-end" },
    modalCard: {
      backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 24, paddingBottom: 40, gap: 6,
    },
    modalTitle: { fontSize: 20, fontWeight: "800", marginBottom: 8 },
    fieldLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 8 },
    input: {
      borderWidth: 1, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginTop: 4,
    },
    unitRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" },
    unitBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
    unitBtnText: { fontSize: 15, fontWeight: "700", color: "#FFF" },
    suggestedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    suggestedText: { fontSize: 11, fontWeight: "600" },
    conversionHint: { fontSize: 12, fontWeight: "600" },
    unitDropdown: {
      borderRadius: 12, borderWidth: 1, marginTop: 4, overflow: "hidden",
      flexDirection: "row", flexWrap: "wrap", padding: 6, gap: 4,
    },
    unitOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 4 },
    unitOptionText: { fontSize: 14 },
    modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
    cancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    cancelText: { fontSize: 15, fontWeight: "600" },
    saveBtn: { flex: 2, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    saveBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
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
    calText: { fontSize: 14, fontWeight: "600" },
    shoppingGroup: { marginBottom: 20 },
    groupLabel: {
      fontSize: 13, fontWeight: "700", textTransform: "uppercase",
      letterSpacing: 0.6, marginBottom: 4,
    },
  });
}
