/**
 * Shared recipe/meal — read-only public view opened from a /share/<id> link.
 * Works on web (primary) and as a native deep link. No auth required.
 */
import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getShared } from "@/services/api";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";

 
function ingredientToText(ing: any): string {
  if (typeof ing === "string") return ing;
  if (ing && typeof ing === "object") {
    const amount = ing.amount != null ? String(ing.amount) : "";
    return [amount, ing.unit, ing.name].filter(Boolean).join(" ").trim();
  }
  return String(ing ?? "");
}

export default function SharedItemScreen() {
  const c = useTheme();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
   
  const [payload, setPayload] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getShared(String(id))
      .then((res) => setPayload(res.payload))
      .catch((err) => setError(err instanceof Error ? err.message : "Not found."))
      .finally(() => setLoading(false));
  }, [id]);

  const styles = makeStyles(c);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (error || !payload) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="sad-outline" size={40} color={c.textMuted} />
        <Text style={[styles.errorText, { color: c.textMuted }]}>{error ?? "Not found."}</Text>
      </View>
    );
  }

  const title = payload.title ?? payload.name ?? "";
  const ingredients: string[] = (payload.ingredients ?? []).map(ingredientToText).filter(Boolean);
  const steps: string[] = (payload.steps ?? []).filter(Boolean);
  const tags: string[] = (payload.tags ?? []).filter(Boolean);
  const tips: string[] = (payload.chef_tips ?? []).filter(Boolean);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: c.text }]}>{title}</Text>
      {!!(payload.cuisine || payload.source_name) && (
        <Text style={[styles.source, { color: c.primary }]}>{payload.cuisine ?? payload.source_name}</Text>
      )}
      {!!(payload.intro ?? payload.description) && (
        <Text style={[styles.intro, { color: c.textSecondary }]}>{payload.intro ?? payload.description}</Text>
      )}

      <View style={styles.metaRow}>
        {payload.prep_time_mins != null && (
          <View style={[styles.metaChip, { backgroundColor: c.surfaceAlt }]}>
            <Ionicons name="time-outline" size={13} color={c.textMuted} />
            <Text style={[styles.metaText, { color: c.textMuted }]}>{payload.prep_time_mins} {t("min_label")}</Text>
          </View>
        )}
        {payload.calories_per_serving != null && (
          <View style={[styles.metaChip, { backgroundColor: c.surfaceAlt }]}>
            <Ionicons name="flame-outline" size={13} color={c.textMuted} />
            <Text style={[styles.metaText, { color: c.textMuted }]}>{payload.calories_per_serving} {t("calories_label")}</Text>
          </View>
        )}
        {payload.servings != null && (
          <View style={[styles.metaChip, { backgroundColor: c.surfaceAlt }]}>
            <Ionicons name="people-outline" size={13} color={c.textMuted} />
            <Text style={[styles.metaText, { color: c.textMuted }]}>{payload.servings}</Text>
          </View>
        )}
      </View>

      {tags.length > 0 && (
        <View style={styles.tags}>
          {tags.map((tag) => (
            <View key={tag} style={[styles.tag, { backgroundColor: c.chipBg }]}>
              <Text style={[styles.tagText, { color: c.textMuted }]}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {ingredients.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: c.textPlaceholder }]}>{t("ingredients_label")}</Text>
          {ingredients.map((ing, i) => (
            <View key={i} style={styles.ingRow}>
              <View style={[styles.dot, { backgroundColor: c.primary }]} />
              <Text style={[styles.ingText, { color: c.textSecondary }]}>{ing}</Text>
            </View>
          ))}
        </>
      )}

      {steps.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: c.textPlaceholder }]}>{t("steps_label")}</Text>
          {steps.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <Text style={[styles.stepNum, { backgroundColor: c.primary }]}>{i + 1}</Text>
              <Text style={[styles.stepText, { color: c.textSecondary }]}>{step}</Text>
            </View>
          ))}
        </>
      )}

      {tips.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: c.textPlaceholder }]}>{t("chef_tips_label")}</Text>
          {tips.map((tip, i) => (
            <View key={i} style={[styles.tipRow, { backgroundColor: c.primaryLight }]}>
              <Ionicons name="bulb-outline" size={14} color={c.primary} style={{ marginTop: 1 }} />
              <Text style={[styles.tipText, { color: c.text }]}>{tip}</Text>
            </View>
          ))}
        </>
      )}

      <Text style={[styles.footer, { color: c.textPlaceholder }]}>wotoEAT</Text>
    </ScrollView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    center: { alignItems: "center", justifyContent: "center", gap: 12 },
    content: { padding: 20, paddingBottom: 48, maxWidth: 680, width: "100%", alignSelf: "center" },
    title: { fontSize: 24, fontWeight: "800", lineHeight: 30 },
    source: { fontSize: 13, fontWeight: "600", marginTop: 4 },
    intro: { fontSize: 14, lineHeight: 20, marginTop: 10 },
    errorText: { fontSize: 14 },
    metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
    metaChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
    metaText: { fontSize: 12 },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
    tag: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
    tagText: { fontSize: 12, fontWeight: "500" },
    sectionLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
    ingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 },
    dot: { width: 5, height: 5, borderRadius: 3 },
    ingText: { fontSize: 14, lineHeight: 20, flex: 1 },
    stepRow: { flexDirection: "row", gap: 10, paddingVertical: 6 },
    stepNum: { width: 22, height: 22, borderRadius: 11, color: "#FFF", fontSize: 12, fontWeight: "700", textAlign: "center", lineHeight: 22, flexShrink: 0 },
    stepText: { flex: 1, fontSize: 14, lineHeight: 20 },
    tipRow: { flexDirection: "row", gap: 8, borderRadius: 10, padding: 10, marginBottom: 6 },
    tipText: { flex: 1, fontSize: 13, lineHeight: 19 },
    footer: { fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: 28 },
  });
}
