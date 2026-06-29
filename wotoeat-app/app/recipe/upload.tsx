/**
 * Upload Recipe screen — paste a URL, preview the parsed result, save it.
 * Accessible from the Recipes tab.
 */
import { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { parseRecipe, saveRecipe } from "@/services/api";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import type { Recipe } from "@/services/api";

export default function UploadRecipeScreen() {
  const c = useTheme();
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const router = useRouter();

  function isValidUrl(val: string): boolean {
    try {
      const u = new URL(val);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  async function handleParse() {
    if (!isValidUrl(url.trim())) {
      setParseError(t("parse_invalid_url"));
      return;
    }
    setParseError(null);
    setParsing(true);
    setRecipe(null);
    setSaveStatus("idle");
    try {
      const result = await parseRecipe(url.trim());
      result.source_url = url.trim();
      try {
        result.source_name = new URL(url.trim()).hostname.replace("www.", "");
      } catch {}
      setRecipe(result);
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : "No recipe found at that URL.");
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!recipe) return;
    setSaving(true);
    setSaveStatus("idle");
    setSaveError(null);
    try {
      await saveRecipe(recipe);
      setSaveStatus("saved");
      setTimeout(() => router.back(), 1200);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Could not save.");
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[styles.intro, { color: c.textMuted }]}>{t("parse_url_hint")}</Text>

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.urlInput, { borderColor: c.border, backgroundColor: c.surface, color: c.text }]}
          placeholder={t("parse_url_placeholder")}
          placeholderTextColor={c.textPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={url}
          onChangeText={(v) => { setUrl(v); setParseError(null); }}
        />
        <TouchableOpacity
          style={[
            styles.parseBtn,
            { backgroundColor: c.primary },
            (parsing || !url.trim()) && { backgroundColor: c.disabled },
          ]}
          onPress={handleParse}
          disabled={parsing || !url.trim()}
        >
          {parsing ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.parseBtnText}>{t("parse")}</Text>
          )}
        </TouchableOpacity>
      </View>

      {parseError && (
        <View style={[styles.errorBanner, { backgroundColor: c.errorBg }]}>
          <Ionicons name="alert-circle-outline" size={15} color={c.error} />
          <Text style={[styles.errorText, { color: c.error }]}>{parseError}</Text>
        </View>
      )}

      {recipe && (
        <View style={[styles.preview, { backgroundColor: c.surface, shadowColor: c.shadow }]}>
          <View style={styles.previewHeader}>
            <Text style={[styles.previewTitle, { color: c.text }]}>{recipe.title}</Text>
            {recipe.source_name && (
              <Text style={[styles.previewSource, { color: c.primary }]}>{recipe.source_name}</Text>
            )}
          </View>

          <View style={styles.metaRow}>
            <View style={[styles.metaChip, { backgroundColor: c.surfaceAlt }]}>
              <Ionicons name="time-outline" size={13} color={c.textMuted} />
              <Text style={[styles.metaText, { color: c.textMuted }]}>{recipe.prep_time_mins} min</Text>
            </View>
            {recipe.calories_per_serving != null && (
              <View style={[styles.metaChip, { backgroundColor: c.surfaceAlt }]}>
                <Ionicons name="flame-outline" size={13} color={c.textMuted} />
                <Text style={[styles.metaText, { color: c.textMuted }]}>{recipe.calories_per_serving} kcal</Text>
              </View>
            )}
            <View style={[styles.metaChip, { backgroundColor: c.surfaceAlt }]}>
              <Ionicons name="people-outline" size={13} color={c.textMuted} />
              <Text style={[styles.metaText, { color: c.textMuted }]}>Serves {recipe.servings}</Text>
            </View>
          </View>

          {recipe.warnings.length > 0 && (
            <View style={[styles.warning, { backgroundColor: c.warningBg }]}>
              <Ionicons name="warning-outline" size={14} color={c.warning} />
              <Text style={[styles.warningText, { color: c.warning }]}>{recipe.warnings.join(" · ")}</Text>
            </View>
          )}

          <Text style={[styles.sectionLabel, { color: c.textPlaceholder }]}>
            {t("ingredients_label")} ({recipe.ingredients.length})
          </Text>
          {recipe.ingredients.map((ing, i) => (
            <View key={i} style={[styles.ingredientRow, { borderBottomColor: c.borderLight }]}>
              <Text style={[styles.ingredientName, { color: c.textSecondary }]}>{ing.name}</Text>
              <Text style={[styles.ingredientAmount, { color: c.textMuted }]}>
                {ing.amount} {ing.unit}
              </Text>
            </View>
          ))}

          <Text style={[styles.sectionLabel, { color: c.textPlaceholder }]}>
            {t("steps_label")} ({recipe.steps.length})
          </Text>
          {recipe.steps.map((step, i) => (
            <View key={i} style={[styles.stepRow, { borderBottomColor: c.borderLight }]}>
              <Text style={[styles.stepNum, { backgroundColor: c.primary }]}>{i + 1}</Text>
              <Text style={[styles.stepText, { color: c.textSecondary }]}>{step}</Text>
            </View>
          ))}

          {saveStatus === "error" && saveError && (
            <View style={[styles.errorBanner, { backgroundColor: c.errorBg }]}>
              <Ionicons name="alert-circle-outline" size={15} color={c.error} />
              <Text style={[styles.errorText, { color: c.error }]}>{saveError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.saveBtn,
              { backgroundColor: c.accent },
              (saving || saveStatus === "saved") && { backgroundColor: c.disabled },
            ]}
            onPress={handleSave}
            disabled={saving || saveStatus === "saved"}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons
                  name={saveStatus === "saved" ? "checkmark-circle" : "bookmark"}
                  size={18}
                  color="#FFF"
                />
                <Text style={styles.saveBtnText}>
                  {saveStatus === "saved" ? `${t("saved")}!` : t("save_to_recipes")}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, paddingBottom: 48 },
    intro: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
    inputRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
    urlInput: {
      flex: 1, borderWidth: 1, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 14,
    },
    parseBtn: {
      borderRadius: 12, paddingHorizontal: 18,
      justifyContent: "center", alignItems: "center", minWidth: 72,
    },
    parseBtnText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
    errorBanner: {
      flexDirection: "row", alignItems: "center", gap: 6,
      borderRadius: 10, padding: 10, marginBottom: 12,
    },
    errorText: { fontSize: 13, flex: 1 },
    preview: {
      borderRadius: 16, padding: 16,
      shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6,
      elevation: 2,
    },
    previewHeader: { marginBottom: 10 },
    previewTitle: { fontSize: 20, fontWeight: "800", lineHeight: 26 },
    previewSource: { fontSize: 12, fontWeight: "600", marginTop: 2 },
    metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
    metaChip: {
      flexDirection: "row", alignItems: "center", gap: 4,
      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    },
    metaText: { fontSize: 12 },
    warning: {
      flexDirection: "row", alignItems: "center", gap: 6,
      borderRadius: 8, padding: 10, marginBottom: 12,
    },
    warningText: { fontSize: 12, flex: 1 },
    sectionLabel: {
      fontSize: 11, fontWeight: "700", textTransform: "uppercase",
      letterSpacing: 0.5, marginTop: 14, marginBottom: 8,
    },
    ingredientRow: {
      flexDirection: "row", justifyContent: "space-between",
      paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    ingredientName: { fontSize: 14, flex: 1 },
    ingredientAmount: { fontSize: 14, fontWeight: "500" },
    stepRow: {
      flexDirection: "row", gap: 10, paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    stepNum: {
      width: 22, height: 22, borderRadius: 11,
      color: "#FFF", fontSize: 12, fontWeight: "700",
      textAlign: "center", lineHeight: 22, flexShrink: 0,
    },
    stepText: { flex: 1, fontSize: 14, lineHeight: 20 },
    saveBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      borderRadius: 14, paddingVertical: 15, marginTop: 20, gap: 8,
    },
    saveBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  });
}
