import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "@/store/useAppStore";
import { GuestGate } from "@/components/GuestGate";
import { getPantry, replacePantry, deletePantryItem, apiErrorMessage } from "@/services/api";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Chip } from "@/components/ui/Chip";
import { PantryTagPicker } from "@/components/PantryTagPicker";
import { Button } from "@/components/ui/Button";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import { usePantryDisplay } from "@/hooks/useDynamicTranslation";
import { categoryForItem, toCanonicalEnglish, CATEGORY_LABELS, PANTRY_CATEGORIES, PANTRY_OTHER_KEY } from "@/constants/filters";
import type { PantryItem } from "@/services/api";

function PantryScreen() {
  const {
    pantry, setPantry, authReady, language, selectedRecipes,
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
  const [editCategory, setEditCategory] = useState<string>(PANTRY_OTHER_KEY);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const categoryKeys = useMemo(
    () => [...PANTRY_CATEGORIES.map((cat) => cat.key), PANTRY_OTHER_KEY],
    [],
  );

  // Stored names are canonical English; display follows the current language.
  const displayNames = usePantryDisplay(pantry.map((p) => p.name));
  const displayByName = useMemo(
    () => new Map(pantry.map((p, i) => [p.name, displayNames[i] ?? p.name])),
    [pantry, displayNames],
  );

  // Group the saved pantry by category for an organized list ("Other" last).
  const sections = useMemo(() => {
    const valid = new Set(categoryKeys);
    const groups: Record<string, PantryItem[]> = {};
    for (const item of pantry) {
      // Prefer the stored category override; fall back to name-derived lookup.
      const key = item.category && valid.has(item.category)
        ? item.category
        : categoryForItem(toCanonicalEnglish(item.name));
      (groups[key] ??= []).push(item);
    }
    return categoryKeys
      .filter((k) => groups[k]?.length)
      .map((k) => ({ key: k, count: groups[k].length, data: collapsed[k] ? [] : groups[k] }));
  }, [pantry, collapsed, categoryKeys]);

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
      setDeleteError(apiErrorMessage(err, "Could not delete."));
    }
  }

  async function handleTagPickerSave(names: string[]) {
    // Preserve each surviving item's category override — building bare {name}
    // rows would wipe user-assigned categories on every picker save (persisted
    // via replacePantry, so the loss would also hit the server).
    const catByName = new Map(
      pantry.filter((p) => p.category).map((p) => [p.name.trim().toLowerCase(), p.category]),
    );
    const newItems = names.map((name) => {
      const category = catByName.get(name.trim().toLowerCase());
      return category ? { name, category } : { name };
    });
    setPantry(newItems);
    setShowTagPicker(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try { await replacePantry(newItems); } catch { /* best-effort */ }
  }

  async function commitRename(oldName: string) {
    const newName = draft.trim() || oldName;
    const oldItem = pantry.find((p) => p.name === oldName);
    const oldCategory = oldItem?.category ?? categoryForItem(toCanonicalEnglish(oldName));
    const nameChanged = newName !== oldName;
    const categoryChanged = editCategory !== oldCategory;
    if (!nameChanged && !categoryChanged) {
      setEditingName(null);
      return;
    }
    if (nameChanged) {
      const collision = pantry.some(
        (p) => p.name !== oldName && p.name.trim().toLowerCase() === newName.toLowerCase(),
      );
      if (collision) {
        setDeleteError(t("pantry_name_exists"));
        return; // keep edit mode open so the user can adjust
      }
    }
    const updated = pantry.map((p) =>
      p.name === oldName ? { name: newName, category: editCategory } : p,
    );
    setEditingName(null);
    setDeleteError(null);
    setPantry(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await replacePantry(updated);
    } catch (err: unknown) {
      setDeleteError(apiErrorMessage(err, "Could not save."));
      loadPantry(); // restore server truth
    }
  }

  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        title={t("tab_pantry")}
        right={
          <TouchableOpacity
            style={[styles.cartBtn, { backgroundColor: c.surfaceAlt }]}
            onPress={() => { router.push("/(tabs)/shopping"); Haptics.selectionAsync(); }}
            accessibilityRole="button"
            accessibilityLabel={t("shopping_list")}
          >
            <Ionicons name="cart-outline" size={22} color={c.primary} />
            {selectedRecipes.length > 0 && (
              <View style={[styles.cartBadge, { backgroundColor: c.primary }]}>
                <Text style={styles.cartBadgeText}>{selectedRecipes.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        }
      />
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
            <TouchableOpacity
              style={styles.sectionHeaderRow}
              activeOpacity={0.7}
              onPress={() => {
                setCollapsed((p) => ({ ...p, [section.key]: !p[section.key] }));
                Haptics.selectionAsync();
              }}
            >
              <Text style={[styles.sectionHeader, { color: c.textPlaceholder }]}>
                {(language === "zh" ? CATEGORY_LABELS[section.key].zh : CATEGORY_LABELS[section.key].en) + `  (${section.count})`}
              </Text>
              <Ionicons
                name={collapsed[section.key] ? "chevron-forward" : "chevron-down"}
                size={16}
                color={c.textPlaceholder}
              />
            </TouchableOpacity>
          ) : null
        }
        ListHeaderComponent={
          <View>
            <Text style={[styles.intro, styles.introSpacing]}>{t("pantry_intro")}</Text>

            <View style={styles.addRow}>
              <Button
                label={t("add_ingredient")}
                icon="add"
                fullWidth={false}
                style={styles.addRowBtn}
                onPress={() => { setShowTagPicker(true); Haptics.selectionAsync(); }}
              />
              <Button
                label={t("scan_receipt")}
                icon="scan-outline"
                variant="secondary"
                fullWidth={false}
                style={styles.addRowBtn}
                onPress={() => { Haptics.selectionAsync(); router.push("/pantry/scan" as any); }}
              />
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
            <View style={[styles.editCard, { backgroundColor: c.surface }]}>
              <View style={styles.editTopRow}>
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
              <Text style={[styles.editCatLabel, { color: c.textMuted }]}>
                {language === "zh" ? "分类" : "Category"}
              </Text>
              <View style={styles.editCatRow}>
                {categoryKeys.map((k) => (
                  <Chip
                    key={k}
                    label={language === "zh" ? CATEGORY_LABELS[k].zh : CATEGORY_LABELS[k].en}
                    active={editCategory === k}
                    onPress={() => { setEditCategory(k); Haptics.selectionAsync(); }}
                  />
                ))}
              </View>
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
                  setEditCategory(item.category ?? categoryForItem(toCanonicalEnglish(item.name)));
                  Haptics.selectionAsync();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ marginRight: 14 }}
                accessibilityRole="button"
                accessibilityLabel={t("edit")}
              >
                <Ionicons name="create-outline" size={18} color={c.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDelete(item.name)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={t("delete")}
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
    </SafeAreaView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
    intro: { fontSize: 13, color: c.textMuted, lineHeight: 19 },
    introSpacing: { marginBottom: 12 },
    cartBtn: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    cartBadge: {
      position: "absolute", top: -4, right: -4,
      width: 16, height: 16, borderRadius: 8,
      alignItems: "center", justifyContent: "center",
    },
    cartBadgeText: { color: "#FFF", fontSize: 9, fontWeight: "700" },
    addRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
    addRowBtn: { flex: 1 },
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
    sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, marginBottom: 6 },
    sectionHeader: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
    editCard: {
      borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8, gap: 10,
      shadowColor: c.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 1,
    },
    editTopRow: { flexDirection: "row", alignItems: "center" },
    editCatLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
    editCatRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    itemRow: {
      flexDirection: "row", alignItems: "center", borderRadius: 16,
      paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
      shadowColor: c.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 1,
    },
    itemName: { flex: 1, fontSize: 15, fontWeight: "500", textTransform: "capitalize" },
    itemEditInput: { flex: 1, fontSize: 15, fontWeight: "500", paddingVertical: 0, marginRight: 12 },
  });
}

/**
 * Guests never mount PantryScreen — getPantry / replacePantry are all
 * require_user_id on the API, so the screen would render a wall of 401s. The
 * gate is the default export so the inner component's hooks only ever run for
 * a signed-in user.
 *
 * The cart is passed through to the gate's header on purpose: the shopping
 * list is only reachable from here, and a guest CAN build one (confirming a
 * meal fills it locally, and /shopping/generate is anonymous). Dropping the
 * cart would leave them with a list they had no way to open.
 */
export default function PantryTab() {
  const isGuest = useAppStore((s) => s.isGuest);
  const selectedRecipes = useAppStore((s) => s.selectedRecipes);
  const { t } = useTranslation();
  const c = useTheme();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(c), [c]);

  if (isGuest) {
    return (
      <GuestGate
        headerTitle={t("tab_pantry")}
        headerRight={
          <TouchableOpacity
            style={[styles.cartBtn, { backgroundColor: c.surfaceAlt }]}
            onPress={() => { router.push("/(tabs)/shopping"); Haptics.selectionAsync(); }}
            accessibilityRole="button"
            accessibilityLabel={t("shopping_list")}
          >
            <Ionicons name="cart-outline" size={22} color={c.primary} />
            {selectedRecipes.length > 0 && (
              <View style={[styles.cartBadge, { backgroundColor: c.primary }]}>
                <Text style={styles.cartBadgeText}>{selectedRecipes.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        }
        icon="nutrition"
        title={t("guest_pantry_title")}
        body={t("guest_pantry_body")}
      />
    );
  }
  return <PantryScreen />;
}
