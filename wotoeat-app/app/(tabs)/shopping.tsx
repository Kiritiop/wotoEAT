import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Share,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { IngredientRow } from "@/components/IngredientRow";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAppStore } from "@/store/useAppStore";
import { generateShoppingList, saveCurrentShoppingList } from "@/services/api";
import { formatShoppingListText, countShoppingItems } from "@/utils/shopping";
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
    language,
  } = useAppStore();
  const c = useTheme();
  const { t, strings } = useTranslation();
  const [loading, setLoading] = useState(false);

  // Debounced auto-save: sync shopping list to account 2s after any change
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (shoppingList) saveCurrentShoppingList(shoppingList).catch(() => {});
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [shoppingList]);
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
      setShoppingList(list);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate list.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  async function handleShare() {
    if (!shoppingList) return;
    await Share.share({ message: formatShoppingListText(shoppingList, language) });
  }

  const { total: totalItems, checked: checkedItems } = shoppingList
    ? countShoppingItems(shoppingList)
    : { total: 0, checked: 0 };

  const styles = makeStyles(c);

  return (
    <SafeAreaView style={styles.safe}>
      <ErrorBanner message={error} style={styles.errorBanner} />

      {/* Action bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.generateBtn, loading && { backgroundColor: c.disabled }]}
          onPress={handleGenerate}
          disabled={loading}
        >
          {loading ? (
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

        {shoppingList && (
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: c.surfaceAlt }]} onPress={handleShare}>
            <Ionicons name="share-outline" size={22} color={c.primary} />
          </TouchableOpacity>
        )}
        {shoppingList && (
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: c.surfaceAlt }]}
            onPress={() => { clearShoppingList(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
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
              <Text style={[styles.groupLabel, { color: c.textPlaceholder }]}>{group.category}</Text>
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
    </SafeAreaView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    actionBar: { flexDirection: "row", alignItems: "center", padding: 16, gap: 10 },
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
