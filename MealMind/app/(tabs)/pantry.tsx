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
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "@/store/useAppStore";
import { getPantry, upsertPantry, deletePantryItem } from "@/services/api";
import { PANTRY_UNITS } from "@/constants/filters";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import type { PantryItem } from "@/services/api";

export default function PantryScreen() {
  const { pantry, setPantry, authReady } = useAppStore();
  const c = useTheme();
  const { t, strings } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newUnit, setNewUnit] = useState("g");
  const [nameError, setNameError] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    setNewName("");
    setNewAmount("");
    setNewUnit("g");
    setNameError(false);
    setAmountError(false);
    setFormError(null);
    setShowModal(true);
    Haptics.selectionAsync();
  }

  function openEdit(item: PantryItem) {
    setEditingItem(item);
    setNewName(item.name);
    setNewAmount(String(item.amount));
    setNewUnit(item.unit);
    setNameError(false);
    setAmountError(false);
    setFormError(null);
    setShowModal(true);
    Haptics.selectionAsync();
  }

  async function handleSave() {
    let hasError = false;
    if (!newName.trim()) { setNameError(true); hasError = true; }
    else setNameError(false);
    if (!newAmount.trim()) { setAmountError(true); hasError = true; }
    else setAmountError(false);

    if (hasError) {
      if (!newName.trim() && !newAmount.trim()) {
        setFormError(t("missing_fields"));
      } else if (!newName.trim()) {
        setFormError(t("missing_name"));
      } else {
        setFormError(t("missing_amount"));
      }
      return;
    }

    const parsed = parseFloat(newAmount);
    if (isNaN(parsed) || parsed <= 0) {
      setAmountError(true);
      setFormError(t("invalid_amount"));
      return;
    }

    const item: PantryItem = {
      name: newName.trim().toLowerCase(),
      amount: parsed,
      unit: newUnit,
    };

    setFormError(null);
    setSaving(true);
    try {
      // If editing and name changed, delete the old entry first
      if (editingItem && editingItem.name !== item.name) {
        await deletePantryItem(editingItem.name);
        setPantry(pantry.filter((p) => p.name !== editingItem.name));
      }
      await upsertPantry([item]);
      setPantry([...pantry.filter((p) => p.name !== item.name), item]);
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
            <Text style={styles.intro}>{t("pantry_intro")}</Text>
            <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
              <Ionicons name="add" size={20} color="#FFF" />
              <Text style={styles.addBtnText}>{t("add_ingredient")}</Text>
            </TouchableOpacity>
            {loading && <ActivityIndicator style={{ marginTop: 24 }} color={c.primary} />}
            {deleteError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={15} color={c.error} />
                <Text style={[styles.errorText, { color: c.error }]}>{deleteError}</Text>
              </View>
            )}
            {pantry.length > 0 && (
              <Text style={styles.countLabel}>{strings.pantry_count(pantry.length)}</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconWrap, { backgroundColor: c.successBg }]}>
                <Ionicons name="nutrition-outline" size={40} color={c.primaryLight} />
              </View>
              <Text style={[styles.emptyTitle, { color: c.text }]}>{t("pantry_empty_title")}</Text>
              <Text style={[styles.emptyText, { color: c.textMuted }]}>{t("pantry_empty_body")}</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemName, { color: c.text }]}>{item.name}</Text>
              <Text style={[styles.itemAmount, { color: c.textMuted }]}>
                {item.amount} {item.unit}
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
        )}
        showsVerticalScrollIndicator={false}
      />

      {/* Add / Edit modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: c.text }]}>
              {editingItem ? t("edit_ingredient") : t("add_to_pantry")}
            </Text>

            <Text style={[styles.fieldLabel, { color: c.textMuted }]}>{t("ingredient_name")}</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: nameError ? c.error : c.border, backgroundColor: c.inputBg, color: c.text },
              ]}
              placeholder={t("ingredient_name_placeholder")}
              placeholderTextColor={c.textPlaceholder}
              value={newName}
              onChangeText={(v) => { setNewName(v); if (v.trim()) setNameError(false); }}
              autoFocus={!editingItem}
            />

            <Text style={[styles.fieldLabel, { color: c.textMuted }]}>{t("amount")}</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: amountError ? c.error : c.border, backgroundColor: c.inputBg, color: c.text },
              ]}
              placeholder={t("amount_placeholder")}
              keyboardType="decimal-pad"
              placeholderTextColor={c.textPlaceholder}
              value={newAmount}
              onChangeText={(v) => { setNewAmount(v); if (v.trim()) setAmountError(false); }}
            />

            <Text style={[styles.fieldLabel, { color: c.textMuted }]}>{t("unit")}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.unitScroll}
              contentContainerStyle={styles.unitScrollContent}
            >
              {PANTRY_UNITS.map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[
                    styles.unitChip,
                    { backgroundColor: c.chipBg },
                    newUnit === u && { backgroundColor: c.primary },
                  ]}
                  onPress={() => { setNewUnit(u); Haptics.selectionAsync(); }}
                >
                  <Text style={[
                    styles.unitChipText,
                    { color: c.chipText },
                    newUnit === u && { color: "#FFF", fontWeight: "600" },
                  ]}>
                    {u}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {formError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={15} color={c.error} />
                <Text style={[styles.errorText, { color: c.error }]}>{formError}</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: c.surfaceAlt }]}
                onPress={() => setShowModal(false)}
              >
                <Text style={[styles.cancelText, { color: c.textMuted }]}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: c.primary }, saving && { backgroundColor: c.disabled }]}
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
    </SafeAreaView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, paddingBottom: 40 },
    intro: { fontSize: 14, color: c.textMuted, lineHeight: 20, marginBottom: 14 },
    addBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 13,
      gap: 8,
      marginBottom: 16,
    },
    addBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
    countLabel: { fontSize: 13, color: c.textPlaceholder, fontWeight: "600", marginBottom: 8 },
    emptyState: { alignItems: "center", paddingVertical: 48, gap: 10 },
    emptyIconWrap: {
      width: 80, height: 80, borderRadius: 40,
      alignItems: "center", justifyContent: "center", marginBottom: 4,
    },
    emptyTitle: { fontSize: 18, fontWeight: "700" },
    errorBanner: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: c.errorBg, borderRadius: 10, padding: 10, marginTop: 8,
    },
    errorText: { fontSize: 13, flex: 1 },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 16 },
    itemRow: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: c.surface, borderRadius: 12,
      padding: 14, marginBottom: 8,
      shadowColor: c.shadow, shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
    },
    itemInfo: { flex: 1 },
    itemName: { fontSize: 15, fontWeight: "600", textTransform: "capitalize" },
    itemAmount: { fontSize: 13, marginTop: 2 },
    modalBackdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: "flex-end" },
    modalCard: {
      backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 24, paddingBottom: 40, gap: 6,
    },
    modalTitle: { fontSize: 20, fontWeight: "800", marginBottom: 8 },
    fieldLabel: {
      fontSize: 12, fontWeight: "600", textTransform: "uppercase",
      letterSpacing: 0.4, marginTop: 8,
    },
    input: {
      borderWidth: 1, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, marginTop: 4,
    },
    unitScroll: { marginTop: 4 },
    unitScrollContent: { flexDirection: "row", gap: 8, paddingRight: 8 },
    unitChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
    unitChipText: { fontSize: 13 },
    modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
    cancelBtn: {
      flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center",
    },
    cancelText: { fontSize: 15, fontWeight: "600" },
    saveBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
    saveBtnText: { fontSize: 15, fontWeight: "700", color: "#FFF" },
  });
}
