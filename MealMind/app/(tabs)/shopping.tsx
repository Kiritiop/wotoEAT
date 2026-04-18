import { useState } from "react";
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
import { useAppStore } from "@/store/useAppStore";
import { generateShoppingList } from "@/services/api";
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
    const lines: string[] = [];
    for (const group of shoppingList.groups) {
      lines.push(`\n${group.category.toUpperCase()}`);
      for (const item of group.items) {
        const check = item.checked ? "[x]" : "[ ]";
        lines.push(`${check} ${item.name} — ${item.amount} ${item.unit}`);
      }
    }
    await Share.share({ message: `MealMind Shopping List\n${lines.join("\n")}` });
  }

  const totalItems = shoppingList?.groups.reduce(
    (sum, g) => sum + g.items.length,
    0
  ) ?? 0;
  const checkedItems = shoppingList?.groups.reduce(
    (sum, g) => sum + g.items.filter((i) => i.checked).length,
    0
  ) ?? 0;

  const styles = makeStyles(c);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={15} color={c.error} />
          <Text style={[styles.errorText, { color: c.error }]}>{error}</Text>
        </View>
      )}

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
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconWrap, { backgroundColor: c.successBg }]}>
            <Ionicons name="cart-outline" size={48} color={c.primaryLight} />
          </View>
          <Text style={[styles.emptyTitle, { color: c.text }]}>{t("shopping_empty_title")}</Text>
          <Text style={[styles.emptyText, { color: c.textMuted }]}>
            {t("shopping_empty_body")}
          </Text>
        </View>
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
      backgroundColor: c.primary, borderRadius: 14, paddingVertical: 13, gap: 8,
    },
    generateBtnText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
    iconBtn: {
      width: 46, height: 46, borderRadius: 14,
      alignItems: "center", justifyContent: "center",
    },
    errorBanner: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: c.errorBg, borderRadius: 10, padding: 12,
      marginHorizontal: 16, marginTop: 4,
    },
    errorText: { fontSize: 13, flex: 1 },
    emptyState: {
      flex: 1, alignItems: "center", justifyContent: "center",
      paddingHorizontal: 32, gap: 10,
    },
    emptyIconWrap: {
      width: 96, height: 96, borderRadius: 48,
      alignItems: "center", justifyContent: "center", marginBottom: 8,
    },
    emptyTitle: { fontSize: 20, fontWeight: "700" },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
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
