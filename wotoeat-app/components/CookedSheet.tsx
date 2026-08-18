import { useEffect, useMemo, useState } from "react";
import { View, Text, Modal, Pressable, ScrollView, Switch, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { IngredientRow } from "@/components/IngredientRow";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/store/useAppStore";
import { replacePantry, apiErrorMessage } from "@/services/api";
import { pantryItemsUsedBy } from "@/utils/pantryMatch";
import { categoryForItem, STAPLE_CATEGORY_KEYS } from "@/constants/filters";
import { usePantryDisplay } from "@/hooks/useDynamicTranslation";
import { useTheme, radius, space, fontSize } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";

// The review pre-UNchecks staple categories: one dish rarely finishes the soy
// sauce. Perishables (meat/veg/dairy/fruit/other) default checked, being what a
// single cook plausibly uses up. The staple set is derived from the `staple`
// flag on PANTRY_CATEGORIES so it cannot drift from the category list (FIX-7).

interface Props {
  visible: boolean;
  mealName: string;
  ingredients: string[];
  onClose: () => void;
}

/**
 * "I cooked this" review sheet (pantry-loop Phase 2): proposes which pantry
 * items the dish used up; confirming removes the checked ones (the pantry is
 * name-only, so consumption = review-and-remove) and marks the meal cooked.
 * The replacePantry call is awaited (scan-confirm pattern) — on failure the
 * sheet stays open and nothing changes locally.
 */
export function CookedSheet({ visible, mealName, ingredients, onClose }: Props) {
  const c = useTheme();
  const { t } = useTranslation();
  const { pantry, setPantry, addCookedMeal, addToShoppingList } = useAppStore();

  const matched = useMemo(() => pantryItemsUsedBy(pantry, ingredients), [pantry, ingredients]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [restock, setRestock] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-derive defaults each time the sheet opens (pantry may have changed).
  useEffect(() => {
    if (!visible) return;
    setChecked(new Set(
      matched
        .filter((p) => !STAPLE_CATEGORY_KEYS.has(p.category ?? categoryForItem(p.name)))
        .map((p) => p.name),
    ));
    setRestock(false);
    setError(null);
    // matched is derived from pantry+ingredients; keying on `visible` alone is
    // deliberate so user toggles aren't reset mid-review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const displayNames = usePantryDisplay(matched.map((p) => p.name));

  function toggle(name: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    Haptics.selectionAsync();
  }

  async function handleConfirm() {
    if (saving) return;
    setError(null);
    const removed = matched.filter((p) => checked.has(p.name));
    if (removed.length === 0) {
      // Nothing consumed — just record the cook.
      addCookedMeal(mealName);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
      return;
    }
    setSaving(true);
    const removedNames = new Set(removed.map((p) => p.name));
    const remaining = pantry.filter((p) => !removedNames.has(p.name));
    try {
      await replacePantry(remaining);
      setPantry(remaining);
      if (restock) removed.forEach((p) => addToShoppingList(`meal-${mealName}`, p.name));
      addCookedMeal(mealName);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t("cooked_error")));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  }

  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: c.surface }]} onPress={() => {}}>
          <Text style={[styles.title, { color: c.text }]}>{t("cooked_title")}</Text>
          <Text style={[styles.hint, { color: c.textMuted }]}>
            {matched.length > 0 ? t("cooked_hint") : t("cooked_no_matches")}
          </Text>
          <ErrorBanner message={error} style={{ marginBottom: space.sm }} />

          {matched.length > 0 && (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {matched.map((p, i) => (
                <IngredientRow
                  key={p.name}
                  item={{ name: displayNames[i] ?? p.name, checked: checked.has(p.name) }}
                  showCheckbox
                  onToggle={() => toggle(p.name)}
                />
              ))}
            </ScrollView>
          )}

          {matched.length > 0 && (
            <View style={styles.restockRow}>
              <Text style={[styles.restockLabel, { color: c.textSecondary }]}>{t("cooked_add_restock")}</Text>
              <Switch
                value={restock}
                onValueChange={(v) => { setRestock(v); Haptics.selectionAsync(); }}
                trackColor={{ true: c.primary, false: c.border }}
                thumbColor="#FFF"
              />
            </View>
          )}

          <Button label={t("cooked_confirm")} icon="restaurant-outline" loading={saving} onPress={handleConfirm} />
          <Button label={t("cancel")} variant="ghost" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
    sheet: {
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: space.lg,
      paddingBottom: space.xl,
      maxHeight: "80%",
      gap: space.sm,
    },
    title: { fontSize: fontSize.lg, fontWeight: "700" },
    hint: { fontSize: fontSize.sm, lineHeight: 18 },
    list: { flexGrow: 0, marginVertical: space.xs },
    restockRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: space.xs,
      gap: space.md,
    },
    restockLabel: { fontSize: fontSize.sm, flex: 1 },
  });
}
