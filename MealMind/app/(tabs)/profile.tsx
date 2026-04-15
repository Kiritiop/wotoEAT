import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "@/store/useAppStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme } from "@/hooks/useTheme";
import { saveProfile } from "@/services/api";
import { supabase } from "@/lib/supabase";
import type { Language } from "@/store/useAppStore";

const ACTIVITY_LEVELS = [
  { value: "sedentary", label: "Sedentary", sub: "Little or no exercise" },
  { value: "light",    label: "Light",    sub: "1–3 days/week" },
  { value: "moderate", label: "Moderate", sub: "3–5 days/week" },
  { value: "active",   label: "Active",   sub: "6–7 days/week" },
  { value: "very_active", label: "Very Active", sub: "Twice a day" },
] as const;

const ALLERGENS = [
  "Peanuts", "Tree nuts", "Shellfish", "Fish", "Dairy", "Eggs", "Gluten", "Soy", "Sesame",
];

const HEALTH_GOALS = [
  "Lose weight", "Maintain weight", "Build muscle", "Eat healthier",
  "More energy", "Better sleep", "Manage diabetes", "Heart health",
];
const RESTRICTIONS = [
  "Vegetarian", "Vegan", "Gluten-free", "Dairy-free",
  "Nut-free", "Halal", "Kosher", "Keto",
];

type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

export default function ProfileScreen() {
  const { profile, setProfile, language, setLanguage } = useAppStore();
  const { t } = useTranslation();
  const c = useTheme();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleGoal(goal: string) {
    const lower = goal.toLowerCase();
    const cur = profile.health_goals ?? [];
    setProfile({ health_goals: cur.includes(lower) ? cur.filter((g) => g !== lower) : [...cur, lower] });
    setSaved(false);
  }
  function toggleRestriction(r: string) {
    const lower = r.toLowerCase();
    const cur = profile.dietary_restrictions ?? [];
    setProfile({ dietary_restrictions: cur.includes(lower) ? cur.filter((v) => v !== lower) : [...cur, lower] });
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveProfile(profile);
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  const styles = makeStyles(c);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Avatar */}
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, { backgroundColor: c.primaryLight }]}>
            <Ionicons name="person" size={40} color={c.primary} />
          </View>
          <Text style={[styles.avatarLabel, { color: c.text }]}>{t("your_profile")}</Text>
          <Text style={[styles.avatarSub, { color: c.textMuted }]}>{t("profile_subtitle")}</Text>
        </View>

        {/* Language toggle */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>{t("language")}</Text>
          <View style={styles.langRow}>
            {(["en", "zh"] as Language[]).map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[
                  styles.langBtn,
                  { borderColor: c.border, backgroundColor: c.inputBg },
                  language === lang && { backgroundColor: c.primary, borderColor: c.primary },
                ]}
                onPress={() => {
                  setLanguage(lang);
                  Haptics.selectionAsync();
                }}
              >
                <Text style={[styles.langText, { color: c.textMuted }, language === lang && { color: "#FFF" }]}>
                  {lang === "en" ? t("language_en") : t("language_zh")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Body metrics */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>{t("body_metrics")}</Text>
            <TouchableOpacity
              style={[styles.imperialToggle, { borderColor: c.border, backgroundColor: profile.use_imperial ? c.primary : c.inputBg }]}
              onPress={() => { setProfile({ use_imperial: !profile.use_imperial }); setSaved(false); Haptics.selectionAsync(); }}
            >
              <Text style={[styles.imperialToggleText, { color: profile.use_imperial ? "#FFF" : c.textMuted }]}>
                {t("use_imperial")}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={[styles.fieldLabel, { color: c.textMuted }]}>{t("age")}</Text>
              <TextInput
                style={[styles.input, { borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
                keyboardType="number-pad"
                placeholder="e.g. 28"
                placeholderTextColor={c.textPlaceholder}
                value={profile.age?.toString() ?? ""}
                onChangeText={(v) => { setProfile({ age: v ? parseInt(v) : undefined }); setSaved(false); }}
              />
            </View>
            <View style={styles.half}>
              <Text style={[styles.fieldLabel, { color: c.textMuted }]}>{t("sex")}</Text>
              <View style={[styles.segmented, { borderColor: c.border }]}>
                {(["male", "female", "other"] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.segment, { backgroundColor: c.inputBg }, profile.sex === s && { backgroundColor: c.primary }]}
                    onPress={() => { setProfile({ sex: s }); setSaved(false); Haptics.selectionAsync(); }}
                  >
                    <Text style={[styles.segmentText, { color: c.textMuted }, profile.sex === s && { color: "#FFF" }]}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={[styles.fieldLabel, { color: c.textMuted }]}>
                {profile.use_imperial ? t("weight_lbs") : t("weight_kg")}
              </Text>
              <TextInput
                style={[styles.input, { borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
                keyboardType="decimal-pad"
                placeholder={profile.use_imperial ? "e.g. 154" : "e.g. 70"}
                placeholderTextColor={c.textPlaceholder}
                value={profile.use_imperial && profile.weight_kg
                  ? (profile.weight_kg * 2.20462).toFixed(1)
                  : (profile.weight_kg?.toString() ?? "")}
                onChangeText={(v) => {
                  const num = v ? parseFloat(v) : undefined;
                  setProfile({ weight_kg: num != null ? (profile.use_imperial ? num / 2.20462 : num) : undefined });
                  setSaved(false);
                }}
              />
            </View>
            <View style={styles.half}>
              <Text style={[styles.fieldLabel, { color: c.textMuted }]}>
                {profile.use_imperial ? t("height_in") : t("height_cm")}
              </Text>
              <TextInput
                style={[styles.input, { borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
                keyboardType="decimal-pad"
                placeholder={profile.use_imperial ? "e.g. 67" : "e.g. 170"}
                placeholderTextColor={c.textPlaceholder}
                value={profile.use_imperial && profile.height_cm
                  ? (profile.height_cm / 2.54).toFixed(1)
                  : (profile.height_cm?.toString() ?? "")}
                onChangeText={(v) => {
                  const num = v ? parseFloat(v) : undefined;
                  setProfile({ height_cm: num != null ? (profile.use_imperial ? num * 2.54 : num) : undefined });
                  setSaved(false);
                }}
              />
            </View>
          </View>

          {/* Calorie goal */}
          <Text style={[styles.fieldLabel, { color: c.textMuted }]}>{t("calorie_goal")}</Text>
          <TextInput
            style={[styles.input, { borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
            keyboardType="number-pad"
            placeholder={t("calorie_goal_placeholder")}
            placeholderTextColor={c.textPlaceholder}
            value={profile.calorie_goal?.toString() ?? ""}
            onChangeText={(v) => { setProfile({ calorie_goal: v ? parseInt(v) : undefined }); setSaved(false); }}
          />
        </View>

        {/* Activity level */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>{t("activity_level")}</Text>
          <View style={styles.activityList}>
            {ACTIVITY_LEVELS.map((level) => (
              <TouchableOpacity
                key={level.value}
                style={[
                  styles.activityRow,
                  { borderColor: c.border, backgroundColor: c.inputBg },
                  profile.activity_level === level.value && { borderColor: c.primary, backgroundColor: c.successBg },
                ]}
                onPress={() => {
                  setProfile({ activity_level: level.value as ActivityLevel });
                  setSaved(false);
                  Haptics.selectionAsync();
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.activityLabel, { color: c.textSecondary }, profile.activity_level === level.value && { color: c.primaryText }]}>
                    {level.label}
                  </Text>
                  <Text style={[styles.activitySub, { color: c.textMuted }]}>{level.sub}</Text>
                </View>
                {profile.activity_level === level.value && (
                  <Ionicons name="checkmark-circle" size={20} color={c.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Health goals */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>{t("health_goals")}</Text>
          <View style={styles.chipWrap}>
            {HEALTH_GOALS.map((goal) => {
              const active = (profile.health_goals ?? []).includes(goal.toLowerCase());
              return (
                <TouchableOpacity
                  key={goal}
                  style={[styles.chip, { backgroundColor: c.chipBg, borderColor: c.border }, active && { backgroundColor: c.primary, borderColor: c.primary }]}
                  onPress={() => { toggleGoal(goal); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.chipText, { color: c.chipText }, active && { color: "#FFF", fontWeight: "600" }]}>{goal}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Dietary restrictions */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>{t("dietary_restrictions")}</Text>
          <View style={styles.chipWrap}>
            {RESTRICTIONS.map((r) => {
              const active = (profile.dietary_restrictions ?? []).includes(r.toLowerCase());
              return (
                <TouchableOpacity
                  key={r}
                  style={[styles.chip, { backgroundColor: c.chipBg, borderColor: c.border }, active && { backgroundColor: c.primary, borderColor: c.primary }]}
                  onPress={() => { toggleRestriction(r); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.chipText, { color: c.chipText }, active && { color: "#FFF", fontWeight: "600" }]}>{r}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Allergies */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>{t("allergies")}</Text>
          <Text style={[styles.fieldHint, { color: c.textPlaceholder }]}>{t("allergies_hint")}</Text>
          <View style={styles.chipWrap}>
            {ALLERGENS.map((a) => {
              const active = (profile.allergies ?? []).includes(a.toLowerCase());
              return (
                <TouchableOpacity
                  key={a}
                  style={[styles.chip, { backgroundColor: c.chipBg, borderColor: c.border }, active && { backgroundColor: c.error + "22", borderColor: c.error }]}
                  onPress={() => {
                    const lower = a.toLowerCase();
                    const cur = profile.allergies ?? [];
                    setProfile({ allergies: cur.includes(lower) ? cur.filter((x) => x !== lower) : [...cur, lower] });
                    setSaved(false);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text style={[styles.chipText, { color: c.chipText }, active && { color: c.error, fontWeight: "600" }]}>{a}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Error */}
        {error && (
          <View style={[styles.errorBanner, { backgroundColor: c.errorBg }]}>
            <Ionicons name="alert-circle-outline" size={15} color={c.error} />
            <Text style={[styles.errorText, { color: c.error }]}>{error}</Text>
          </View>
        )}

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: c.primary }, (saving || saved) && { opacity: 0.85 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Ionicons name={saved ? "checkmark-circle" : "save-outline"} size={18} color="#FFF" />
              <Text style={styles.saveBtnText}>{saved ? t("profile_saved") : t("save_profile")}</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Sign out */}
        <TouchableOpacity style={[styles.signOutBtn, { backgroundColor: c.errorBg }]} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color={c.error} />
          <Text style={[styles.signOutText, { color: c.error }]}>{t("sign_out")}</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 48 },
    avatarWrap: { alignItems: "center", marginBottom: 28 },
    avatar: {
      width: 80, height: 80, borderRadius: 40,
      alignItems: "center", justifyContent: "center", marginBottom: 12,
    },
    avatarLabel: { fontSize: 20, fontWeight: "800" },
    avatarSub: { fontSize: 13, marginTop: 4, textAlign: "center" },
    section: {
      borderRadius: 16, padding: 16, marginBottom: 12,
      borderWidth: 1,
      shadowColor: c.shadow, shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    sectionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    sectionTitle: {
      fontSize: 14, fontWeight: "700", textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    imperialToggle: {
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1,
    },
    imperialToggleText: { fontSize: 11, fontWeight: "600" },
    langRow: { flexDirection: "row", gap: 10 },
    langBtn: {
      flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
      alignItems: "center",
    },
    langText: { fontSize: 14, fontWeight: "600" },
    row: { flexDirection: "row", gap: 12, marginBottom: 12 },
    half: { flex: 1 },
    fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
    fieldHint: { fontSize: 12, marginBottom: 6 },
    input: {
      borderWidth: 1, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 14,
    },
    segmented: { flexDirection: "row", borderRadius: 10, overflow: "hidden", borderWidth: 1 },
    segment: { flex: 1, paddingVertical: 10, alignItems: "center" },
    segmentText: { fontSize: 12, fontWeight: "600" },
    activityList: { gap: 8 },
    activityRow: {
      flexDirection: "row", alignItems: "center",
      padding: 12, borderRadius: 10, borderWidth: 1,
    },
    activityLabel: { fontSize: 14, fontWeight: "600" },
    activitySub: { fontSize: 12, marginTop: 1 },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    chipText: { fontSize: 13 },
    errorBanner: {
      flexDirection: "row", alignItems: "center", gap: 6,
      borderRadius: 10, padding: 10, marginBottom: 12,
    },
    errorText: { fontSize: 13, flex: 1 },
    saveBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      borderRadius: 14, paddingVertical: 15, gap: 8, marginTop: 8,
    },
    saveBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
    signOutBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      borderRadius: 14, paddingVertical: 13, gap: 8, marginTop: 10,
    },
    signOutText: { fontSize: 15, fontWeight: "600" },
  });
}
