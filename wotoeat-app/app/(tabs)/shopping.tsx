import { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  AppState,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { IngredientRow } from "@/components/IngredientRow";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { PinnedBar } from "@/components/ui/PinnedBar";
import { useAppStore } from "@/store/useAppStore";
import { generateShoppingList, saveCurrentShoppingList, getCurrentShoppingList, replacePantry, apiErrorMessage } from "@/services/api";
import { formatShoppingListText, countShoppingItems, displayCategory } from "@/utils/shopping";
import { computeShoppingDone } from "@/utils/pantryMerge";
import { shareText } from "@/utils/share";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";

export default function ShoppingScreen() {
  const {
    shoppingList,
    setShoppingList,
    clearShoppingList,
    toggleShoppingItem,
    selectedRecipes,
    pantry,
    setPantry,
    language,
  } = useAppStore();
  const c = useTheme();
  const router = useRouter();
  const { t, strings } = useTranslation();
  const [loading, setLoading] = useState(false);

  // Debounced auto-save: sync shopping list to account 2s after any change
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      if (shoppingList) saveCurrentShoppingList(shoppingList).catch(() => {});
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [shoppingList]);

  // Cross-device sync: the list is otherwise only fetched at app startup.
  // - Going to background: flush a pending debounced save immediately — an
  //   edit made <2s before backgrounding would otherwise never reach the
  //   server (JS timers don't run in background).
  // - Returning to foreground: drop any stale pending save (its closure holds
  //   the pre-background list) and pull the server's latest, so check-offs
  //   made on another device show up instead of being clobbered.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      const current = useAppStore.getState().shoppingList;
      if (state === "background" || state === "inactive") {
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
          if (current) saveCurrentShoppingList(current).catch(() => {});
        }
      } else if (state === "active") {
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        getCurrentShoppingList()
          .then((list) => { if (list) useAppStore.getState().setShoppingList(list); })
          .catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (selectedRecipes.length === 0) {
      setError(t("no_recipes_selected"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const list = await generateShoppingList(selectedRecipes, pantry, language);
      // Regenerating mid-shop must not wipe progress: carry checked state over
      // to items that survive (matched case-insensitively by name).
      const prev = useAppStore.getState().shoppingList;
      if (prev) {
        const checkedNames = new Set(
          prev.groups.flatMap((g) => g.items.filter((i) => i.checked).map((i) => i.name.trim().toLowerCase())),
        );
        if (checkedNames.size > 0) {
          list.groups = list.groups.map((g) => ({
            ...g,
            items: g.items.map((i) =>
              checkedNames.has(i.name.trim().toLowerCase()) ? { ...i, checked: true } : i,
            ),
          }));
        }
      }
      setShoppingList(list);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t("shopping_gen_error")));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  const [shareCopied, setShareCopied] = useState(false);
  async function handleShare() {
    if (!shoppingList) return;
    const outcome = await shareText(formatShoppingListText(shoppingList, language));
    if (outcome === "copied") {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    }
  }

  const { total: totalItems, checked: checkedItems } = shoppingList
    ? countShoppingItems(shoppingList)
    : { total: 0, checked: 0 };

  // "Done shopping": checked (= bought) items move into the pantry and off the
  // list; unchecked items stay. The pantry write is awaited (like scan-confirm)
  // so a failure changes nothing locally.
  const [finishing, setFinishing] = useState(false);
  function handleDoneShopping() {
    const list = useAppStore.getState().shoppingList;
    if (!list || checkedItems === 0 || finishing) return;
    const doMove = async () => {
      setError(null);
      setFinishing(true);
      const { merged, remaining } = computeShoppingDone(useAppStore.getState().pantry, list.groups);
      try {
        await replacePantry(merged);
        setPantry(merged);
        if (remaining.length > 0) {
          setShoppingList({ ...list, groups: remaining });
        } else {
          // clearShoppingList() alone would leave the old list on the server
          // (the debounced auto-save skips null) — persist the emptied list.
          clearShoppingList();
          saveCurrentShoppingList({ groups: [] }).catch(() => {});
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err: unknown) {
        setError(apiErrorMessage(err, t("done_shopping_error")));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setFinishing(false);
      }
    };
    const msg = strings.done_shopping_confirm(checkedItems);
    if (Platform.OS === "web") {
      // RN Alert is a no-op on react-native-web
      if (typeof window !== "undefined" && window.confirm(msg)) void doMove();
      return;
    }
    Alert.alert(t("done_shopping"), msg, [
      { text: t("cancel"), style: "cancel" },
      { text: t("done_shopping"), onPress: () => void doMove() },
    ]);
  }

  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={t("shopping_list")} onBack={() => router.back()} />
      <ErrorBanner message={error} style={styles.errorBanner} />

      {/* Action bar */}
      <View style={styles.actionBar}>
        <Button
          label={`${t("generate_list")} (${selectedRecipes.length})`}
          icon="sparkles"
          loading={loading}
          fullWidth={false}
          style={styles.generateFlex}
          onPress={handleGenerate}
        />

        {shoppingList && (
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: c.surfaceAlt }]}
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel={shareCopied ? t("link_copied") : t("share")}
          >
            <Ionicons name={shareCopied ? "checkmark-done-outline" : "share-outline"} size={22} color={shareCopied ? c.success : c.primary} />
          </TouchableOpacity>
        )}
        {shoppingList && (
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: c.surfaceAlt }]}
            onPress={() => { clearShoppingList(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            accessibilityRole="button"
            accessibilityLabel={t("clear")}
          >
            <Ionicons name="trash-outline" size={22} color={c.error} />
          </TouchableOpacity>
        )}
      </View>

      {!shoppingList && !loading && (
        <EmptyState
          icon="cart-outline"
          iconSize={48}
          title={t("shopping_empty_title")}
          body={t("shopping_empty_body")}
          style={styles.emptyState}
        />
      )}

      {shoppingList && (
        <FlatList
          data={shoppingList.groups}
          keyExtractor={(g) => g.category}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View style={styles.summary}>
              <Text style={[styles.summaryText, { color: c.textMuted }]}>
                {strings.items_progress(checkedItems, totalItems)}
              </Text>
              {shoppingList.total_calories != null && (
                <Text style={[styles.calorieText, { color: c.accent }]}>
                  ~{shoppingList.total_calories} {t("calories_label")}
                </Text>
              )}
            </View>
          }
          renderItem={({ item: group }) => (
            <View style={styles.group}>
              <Text style={[styles.groupLabel, { color: c.textPlaceholder }]}>{displayCategory(group.category)}</Text>
              {group.items.map((item) => (
                <IngredientRow
                  key={item.name}
                  item={item}
                  showCheckbox
                  onToggle={() => {
                    toggleShoppingItem(group.category, item.name);
                    Haptics.selectionAsync();
                  }}
                />
              ))}
            </View>
          )}
          showsVerticalScrollIndicator={false}
        />
      )}

      {shoppingList && checkedItems > 0 && (
        <PinnedBar>
          <Button
            label={`${t("done_shopping")} (${checkedItems})`}
            icon="basket-outline"
            loading={finishing}
            onPress={handleDoneShopping}
          />
        </PinnedBar>
      )}
    </SafeAreaView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    actionBar: { flexDirection: "row", alignItems: "center", padding: 16, gap: 10 },
    generateFlex: { flex: 1 },
    generateBtn: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
      backgroundColor: c.primary, borderRadius: 16, paddingVertical: 14, gap: 8,
    },
    generateBtnText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
    iconBtn: {
      width: 46, height: 46, borderRadius: 16,
      alignItems: "center", justifyContent: "center",
    },
    errorBanner: { marginHorizontal: 16, marginTop: 4 },
    emptyState: { flex: 1, alignItems: "center", justifyContent: "center" },
    content: { paddingHorizontal: 16, paddingBottom: 40 },
    summary: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 },
    summaryText: { fontSize: 14, fontWeight: "600" },
    calorieText: { fontSize: 14, fontWeight: "600" },
    group: { marginBottom: 20 },
    groupLabel: {
      fontSize: 13, fontWeight: "700", textTransform: "uppercase",
      letterSpacing: 0.6, marginBottom: 4,
    },
  });
}
