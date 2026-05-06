import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "@/store/useAppStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme } from "@/hooks/useTheme";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { saveProfile } from "@/services/api";
import { supabase } from "@/lib/supabase";
import {
  HEALTH_GOAL_OPTIONS,
  DIETARY_RESTRICTION_OPTIONS,
  ALLERGEN_OPTIONS,
  ACTIVITY_LEVEL_OPTIONS,
  optionLabel,
} from "@/constants/profileOptions";
import { CUISINES, FLAVOUR_OPTIONS, PREP_TIME_PRESETS, translateCuisine } from "@/constants/filters";
import type { Language } from "@/store/useAppStore";

import type { ActivityLevelValue } from "@/constants/profileOptions";

export default function ProfileScreen() {
  const { profile, setProfile, language, setLanguage } = useAppStore();
  const { t } = useTranslation();
  const c = useTheme();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  function toggleSection(key: string) {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
    Haptics.selectionAsync();
  }
  const [otherAllergyText, setOtherAllergyText] = useState("");
  const [showOtherAllergyInput, setShowOtherAllergyInput] = useState(false);
  const [otherRestrictionText, setOtherRestrictionText] = useState("");
  const [showOtherRestrictionInput, setShowOtherRestrictionInput] = useState(false);

  // BUG-08: local display states prevent float drift from repeated kg↔lbs round-trips
  const toDisplay = (kg: number | undefined, imperial: boolean, factor: number) =>
    kg != null ? (imperial ? (kg * factor).toFixed(1) : kg.toString()) : "";
  const [weightDisplay, setWeightDisplay] = useState(() => toDisplay(profile.weight_kg, !!profile.use_imperial, 2.20462));
  const [heightDisplay, setHeightDisplay] = useState(() => toDisplay(profile.height_cm, !!profile.use_imperial, 1 / 2.54));

  // Re-derive display when unit system toggles
  useEffect(() => {
    setWeightDisplay(toDisplay(profile.weight_kg, !!profile.use_imperial, 2.20462));
    setHeightDisplay(toDisplay(profile.height_cm, !!profile.use_imperial, 1 / 2.54));
  }, [profile.use_imperial]); // eslint-disable-line react-hooks/exhaustive-deps

  const standardAllergenValues = ALLERGEN_OPTIONS.map((a) => a.value as string);
  const standardRestrictionValues = DIETARY_RESTRICTION_OPTIONS.map((r) => r.value as string);
  const customAllergens = (profile.allergies ?? []).filter((a) => !standardAllergenValues.includes(a));
  const customRestrictions = (profile.dietary_restrictions ?? []).filter((r) => !standardRestrictionValues.includes(r));

  function addCustomAllergen() {
    const val = otherAllergyText.trim();
    if (!val) return;
    if (!(profile.allergies ?? []).includes(val)) {
      setProfile({ allergies: [...(profile.allergies ?? []), val] });
      setSaved(false);
    }
    setOtherAllergyText("");
    // N-11: reset Other chip so it doesn't stay in active state
    setShowOtherAllergyInput(false);
  }

  function addCustomRestriction() {
    const val = otherRestrictionText.trim();
    if (!val) return;
    if (!(profile.dietary_restrictions ?? []).includes(val)) {
      setProfile({ dietary_restrictions: [...(profile.dietary_restrictions ?? []), val] });
      setSaved(false);
    }
    setOtherRestrictionText("");
    // N-11: reset Other chip so it doesn't stay in active state
    setShowOtherRestrictionInput(false);
  }

  function toggleField(key: "health_goals" | "dietary_restrictions" | "allergies" | "cuisine_preferences", value: string) {
    const cur = (profile[key] ?? []) as string[];
    setProfile({ [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] });
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
    useAppStore.getState().resetAll();
  }

  const styles = makeStyles(c);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Complete profile banner — shown when key fields are missing */}
        {(!profile.age || !profile.weight_kg || !profile.height_cm || !(profile.health_goals?.length)) && (
          <View style={[styles.completeBanner, { backgroundColor: c.primaryLight, borderColor: c.primary + "40" }]}>
            <Ionicons name="information-circle" size={20} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.completeBannerTitle, { color: c.primary }]}>{t("complete_profile")}</Text>
              <Text style={[styles.completeBannerSub, { color: c.primary }]}>{t("complete_profile_sub")}</Text>
            </View>
          </View>
        )}

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

        {/* Meal Preferences */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <TouchableOpacity style={styles.accordionHeader} onPress={() => toggleSection("meal_preferences")}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>{t("meal_preferences")}</Text>
            <Ionicons name={expandedSections["meal_preferences"] ? "chevron-up" : "chevron-down"} size={16} color={c.textMuted} />
          </TouchableOpacity>
          {expandedSections["meal_preferences"] && (
            <View style={styles.accordionBody}>
              <Text style={[styles.fieldHint, { color: c.textPlaceholder }]}>{t("preferred_cuisines_hint")}</Text>

              {/* Cuisine */}
              <Text style={[styles.fieldLabel, { color: c.textMuted }]}>{t("preferred_cuisines")}</Text>
              <View style={styles.chipWrap}>
                {CUISINES.filter((cu) => cu !== "Any").map((cu) => {
                  const active = (profile.cuisine_preferences ?? []).includes(cu);
                  return (
                    <TouchableOpacity
                      key={cu}
                      style={[styles.chip, { backgroundColor: c.chipBg, borderColor: c.border }, active && { backgroundColor: c.primary, borderColor: c.primary }]}
                      onPress={() => { toggleField("cuisine_preferences", cu); Haptics.selectionAsync(); }}
                    >
                      <Text style={[styles.chipText, { color: c.chipText }, active && { color: "#FFF", fontWeight: "600" }]}>
                        {translateCuisine(cu, language)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Flavour */}
              <Text style={[styles.fieldLabel, { color: c.textMuted, marginTop: 10 }]}>{t("flavour_pref")}</Text>
              <View style={styles.chipWrap}>
                {FLAVOUR_OPTIONS.map((f) => {
                  const active = profile.flavour_preference === f.value;
                  return (
                    <TouchableOpacity
                      key={f.value}
                      style={[styles.chip, { backgroundColor: c.chipBg, borderColor: c.border }, active && { backgroundColor: c.primary, borderColor: c.primary }]}
                      onPress={() => { setProfile({ flavour_preference: active ? null : f.value }); setSaved(false); Haptics.selectionAsync(); }}
                    >
                      <Text style={[styles.chipText, { color: c.chipText }, active && { color: "#FFF", fontWeight: "600" }]}>
                        {language === "zh" ? f.zh : f.en}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Prep time */}
              <Text style={[styles.fieldLabel, { color: c.textMuted, marginTop: 10 }]}>{t("prep_time_pref")}</Text>
              <View style={styles.chipWrap}>
                {PREP_TIME_PRESETS.map((p) => {
                  const active = (profile.preferred_max_prep_mins ?? null) === p.value;
                  return (
                    <TouchableOpacity
                      key={String(p.value)}
                      style={[styles.chip, { backgroundColor: c.chipBg, borderColor: c.border }, active && { backgroundColor: c.primary, borderColor: c.primary }]}
                      onPress={() => { setProfile({ preferred_max_prep_mins: active ? null : p.value ?? undefined }); setSaved(false); Haptics.selectionAsync(); }}
                    >
                      <Text style={[styles.chipText, { color: c.chipText }, active && { color: "#FFF", fontWeight: "600" }]}>
                        {language === "zh" ? p.zh : p.en}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        {/* Body metrics */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.accordionHeader}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => toggleSection("body_metrics")}>
              <Text style={[styles.sectionTitle, { color: c.text }]}>{t("body_metrics")}</Text>
            </TouchableOpacity>
            <View style={styles.accordionRight}>
              <TouchableOpacity
                style={[styles.imperialToggle, { borderColor: c.border, backgroundColor: profile.use_imperial ? c.primary : c.inputBg }]}
                onPress={() => { setProfile({ use_imperial: !profile.use_imperial }); setSaved(false); Haptics.selectionAsync(); }}
              >
                <Text style={[styles.imperialToggleText, { color: profile.use_imperial ? "#FFF" : c.textMuted }]}>
                  {t("use_imperial")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => toggleSection("body_metrics")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name={expandedSections["body_metrics"] ? "chevron-up" : "chevron-down"} size={16} color={c.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
          {expandedSections["body_metrics"] && (
            <View style={styles.accordionBody}>
              <View style={styles.row}>
                <View style={styles.half}>
                  <Text style={[styles.fieldLabel, { color: c.textMuted }]}>{t("age")}</Text>
                  <TextInput
                    style={[styles.input, { borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
                    keyboardType="number-pad"
                    placeholder={t("onboarding_age_placeholder")}
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
                          {t(s as "male" | "female" | "other")}
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
                    placeholder={profile.use_imperial ? "e.g. 154" : t("onboarding_weight_placeholder")}
                    placeholderTextColor={c.textPlaceholder}
                    value={weightDisplay}
                    onChangeText={(v) => { setWeightDisplay(v); setSaved(false); }}
                    onBlur={() => {
                      if (weightDisplay === "") { setProfile({ weight_kg: undefined }); return; }
                      const num = parseFloat(weightDisplay);
                      if (!isNaN(num) && num > 0) setProfile({ weight_kg: profile.use_imperial ? num / 2.20462 : num });
                      else setWeightDisplay(profile.weight_kg != null ? toDisplay(profile.weight_kg, !!profile.use_imperial, 2.20462) : "");
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
                    placeholder={profile.use_imperial ? "e.g. 67" : t("onboarding_height_placeholder")}
                    placeholderTextColor={c.textPlaceholder}
                    value={heightDisplay}
                    onChangeText={(v) => { setHeightDisplay(v); setSaved(false); }}
                    onBlur={() => {
                      if (heightDisplay === "") { setProfile({ height_cm: undefined }); return; }
                      const num = parseFloat(heightDisplay);
                      if (!isNaN(num) && num > 0) setProfile({ height_cm: profile.use_imperial ? num * 2.54 : num });
                      else setHeightDisplay(profile.height_cm != null ? toDisplay(profile.height_cm, !!profile.use_imperial, 1 / 2.54) : "");
                    }}
                  />
                </View>
              </View>

              {/* Calorie goal + Protein goal side by side */}
              <View style={styles.row}>
                <View style={styles.half}>
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
                <View style={styles.half}>
                  <Text style={[styles.fieldLabel, { color: c.textMuted }]}>{t("protein_goal")}</Text>
                  <TextInput
                    style={[styles.input, { borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
                    keyboardType="number-pad"
                    placeholder={t("protein_goal_placeholder")}
                    placeholderTextColor={c.textPlaceholder}
                    value={profile.protein_goal_g?.toString() ?? ""}
                    onChangeText={(v) => { setProfile({ protein_goal_g: v ? parseInt(v) : undefined }); setSaved(false); }}
                  />
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Activity level */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <TouchableOpacity style={styles.accordionHeader} onPress={() => toggleSection("activity_level")}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>{t("activity_level")}</Text>
            <Ionicons name={expandedSections["activity_level"] ? "chevron-up" : "chevron-down"} size={16} color={c.textMuted} />
          </TouchableOpacity>
          {expandedSections["activity_level"] && (
            <View style={[styles.accordionBody, { gap: 8 }]}>
              {ACTIVITY_LEVEL_OPTIONS.map((level) => (
                <TouchableOpacity
                  key={level.value}
                  style={[
                    styles.activityRow,
                    { borderColor: c.border, backgroundColor: c.inputBg },
                    profile.activity_level === level.value && { borderColor: c.primary, backgroundColor: c.successBg },
                  ]}
                  onPress={() => {
                    setProfile({ activity_level: level.value as ActivityLevelValue });
                    setSaved(false);
                    Haptics.selectionAsync();
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.activityLabel, { color: c.textSecondary }, profile.activity_level === level.value && { color: c.primaryText }]}>
                      {optionLabel(level, language)}
                    </Text>
                    <Text style={[styles.activitySub, { color: c.textMuted }]}>
                      {language === "zh" ? level.zh_sub : level.en_sub}
                    </Text>
                  </View>
                  {profile.activity_level === level.value && (
                    <Ionicons name="checkmark-circle" size={20} color={c.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Health goals */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <TouchableOpacity style={styles.accordionHeader} onPress={() => toggleSection("health_goals")}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>{t("health_goals")}</Text>
            <Ionicons name={expandedSections["health_goals"] ? "chevron-up" : "chevron-down"} size={16} color={c.textMuted} />
          </TouchableOpacity>
          {expandedSections["health_goals"] && (
            <View style={styles.accordionBody}>
              <View style={styles.chipWrap}>
                {HEALTH_GOAL_OPTIONS.map((goal) => {
                  const active = (profile.health_goals ?? []).includes(goal.value);
                  return (
                    <TouchableOpacity
                      key={goal.value}
                      style={[styles.chip, { backgroundColor: c.chipBg, borderColor: c.border }, active && { backgroundColor: c.primary, borderColor: c.primary }]}
                      onPress={() => { toggleField("health_goals", goal.value); Haptics.selectionAsync(); }}
                    >
                      <Text style={[styles.chipText, { color: c.chipText }, active && { color: "#FFF", fontWeight: "600" }]}>{optionLabel(goal, language)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        {/* Dietary restrictions */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <TouchableOpacity style={styles.accordionHeader} onPress={() => toggleSection("dietary_restrictions")}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>{t("dietary_restrictions")}</Text>
            <Ionicons name={expandedSections["dietary_restrictions"] ? "chevron-up" : "chevron-down"} size={16} color={c.textMuted} />
          </TouchableOpacity>
          {expandedSections["dietary_restrictions"] && (
            <View style={styles.accordionBody}>
              <View style={styles.chipWrap}>
                {DIETARY_RESTRICTION_OPTIONS.map((r) => {
                  const active = (profile.dietary_restrictions ?? []).includes(r.value);
                  return (
                    <TouchableOpacity
                      key={r.value}
                      style={[styles.chip, { backgroundColor: c.chipBg, borderColor: c.border }, active && { backgroundColor: c.primary, borderColor: c.primary }]}
                      onPress={() => { toggleField("dietary_restrictions", r.value); Haptics.selectionAsync(); }}
                    >
                      <Text style={[styles.chipText, { color: c.chipText }, active && { color: "#FFF", fontWeight: "600" }]}>{optionLabel(r, language)}</Text>
                    </TouchableOpacity>
                  );
                })}
                {/* Other chip */}
                <TouchableOpacity
                  style={[styles.chip, { backgroundColor: c.chipBg, borderColor: c.border }, (showOtherRestrictionInput || customRestrictions.length > 0) && { backgroundColor: c.primary, borderColor: c.primary }]}
                  onPress={() => { setShowOtherRestrictionInput((v) => !v); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.chipText, { color: c.chipText }, (showOtherRestrictionInput || customRestrictions.length > 0) && { color: "#FFF", fontWeight: "600" }]}>
                    {t("allergy_other")}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Custom restrictions already added */}
              {customRestrictions.length > 0 && (
                <View style={[styles.chipWrap, { marginTop: 8 }]}>
                  {customRestrictions.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, { backgroundColor: c.primary, borderColor: c.primary, flexDirection: "row", alignItems: "center", gap: 4 }]}
                      onPress={() => { toggleField("dietary_restrictions", r); Haptics.selectionAsync(); }}
                    >
                      <Text style={[styles.chipText, { color: "#FFF", fontWeight: "600" }]}>{r}</Text>
                      <Ionicons name="close" size={12} color="#FFF" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {customRestrictions.length > 0 && (
                <Text style={[styles.aiNote, { color: c.textMuted }]}>{t("ai_custom_note")}</Text>
              )}

              {showOtherRestrictionInput && (
                <View style={[styles.row, { marginTop: 10, marginBottom: 0 }]}>
                  <TextInput
                    style={[styles.input, { flex: 1, borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
                    placeholder={t("restriction_other_placeholder")}
                    placeholderTextColor={c.textPlaceholder}
                    value={otherRestrictionText}
                    onChangeText={setOtherRestrictionText}
                    onSubmitEditing={addCustomRestriction}
                    returnKeyType="done"
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={[styles.chip, { backgroundColor: c.primary, borderColor: c.primary, height: 42, justifyContent: "center" }]}
                    onPress={addCustomRestriction}
                  >
                    <Text style={[styles.chipText, { color: "#FFF", fontWeight: "700" }]}>{t("add")}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Allergies */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <TouchableOpacity style={styles.accordionHeader} onPress={() => toggleSection("allergies")}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>{t("allergies")}</Text>
            <Ionicons name={expandedSections["allergies"] ? "chevron-up" : "chevron-down"} size={16} color={c.textMuted} />
          </TouchableOpacity>
          {expandedSections["allergies"] && (
            <View style={styles.accordionBody}>
              <Text style={[styles.fieldHint, { color: c.textPlaceholder }]}>{t("allergies_hint")}</Text>
              <View style={styles.chipWrap}>
                {ALLERGEN_OPTIONS.map((a) => {
                  const active = (profile.allergies ?? []).includes(a.value);
                  return (
                    <TouchableOpacity
                      key={a.value}
                      style={[styles.chip, { backgroundColor: c.chipBg, borderColor: c.border }, active && { backgroundColor: c.error + "22", borderColor: c.error }]}
                      onPress={() => { toggleField("allergies", a.value); Haptics.selectionAsync(); }}
                    >
                      <Text style={[styles.chipText, { color: c.chipText }, active && { color: c.error, fontWeight: "600" }]}>{optionLabel(a, language)}</Text>
                    </TouchableOpacity>
                  );
                })}
                {/* Other chip */}
                <TouchableOpacity
                  style={[styles.chip, { backgroundColor: c.chipBg, borderColor: c.border }, (showOtherAllergyInput || customAllergens.length > 0) && { backgroundColor: c.error + "22", borderColor: c.error }]}
                  onPress={() => { setShowOtherAllergyInput((v) => !v); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.chipText, { color: c.chipText }, (showOtherAllergyInput || customAllergens.length > 0) && { color: c.error, fontWeight: "600" }]}>
                    {t("allergy_other")}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Custom allergens already added */}
              {customAllergens.length > 0 && (
                <View style={[styles.chipWrap, { marginTop: 8 }]}>
                  {customAllergens.map((allergen) => (
                    <TouchableOpacity
                      key={allergen}
                      style={[styles.chip, { backgroundColor: c.error + "22", borderColor: c.error, flexDirection: "row", alignItems: "center", gap: 4 }]}
                      onPress={() => { toggleField("allergies", allergen); Haptics.selectionAsync(); }}
                    >
                      <Text style={[styles.chipText, { color: c.error, fontWeight: "600" }]}>{allergen}</Text>
                      <Ionicons name="close" size={12} color={c.error} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {customAllergens.length > 0 && (
                <Text style={[styles.aiNote, { color: c.textMuted }]}>{t("ai_custom_note")}</Text>
              )}

              {showOtherAllergyInput && (
                <View style={[styles.row, { marginTop: 10, marginBottom: 0 }]}>
                  <TextInput
                    style={[styles.input, { flex: 1, borderColor: c.border, backgroundColor: c.inputBg, color: c.text }]}
                    placeholder={t("allergy_other_placeholder")}
                    placeholderTextColor={c.textPlaceholder}
                    value={otherAllergyText}
                    onChangeText={setOtherAllergyText}
                    onSubmitEditing={addCustomAllergen}
                    returnKeyType="done"
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={[styles.chip, { backgroundColor: c.primary, borderColor: c.primary, height: 42, justifyContent: "center" }]}
                    onPress={addCustomAllergen}
                  >
                    <Text style={[styles.chipText, { color: "#FFF", fontWeight: "700" }]}>{t("add")}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>

        <ErrorBanner message={error} style={{ marginBottom: 12 }} />

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

        {/* About the Creator */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border, marginTop: 10 }]}>
          <Text style={[styles.sectionTitle, { color: c.text, marginBottom: 14 }]}>{t("about_creator")}</Text>

          <View style={styles.aboutRow}>
            <Ionicons name="person-circle-outline" size={18} color={c.primary} />
            <Text style={[styles.aboutLabel, { color: c.text }]}>Jerry Wang</Text>
          </View>

          <TouchableOpacity style={styles.aboutRow} onPress={() => Linking.openURL("mailto:wzirui102348@gmail.com")}>
            <Ionicons name="mail-outline" size={18} color={c.primary} />
            <Text style={[styles.aboutLink, { color: c.primary }]}>wzirui102348@gmail.com</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.aboutRow} onPress={() => Linking.openURL("https://www.linkedin.com/in/wang-jerry/")}>
            <Ionicons name="logo-linkedin" size={18} color={c.primary} />
            <Text style={[styles.aboutLink, { color: c.primary }]}>linkedin.com/in/wang-jerry</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.aboutRow} onPress={() => Linking.openURL("https://ko-fi.com/kiritiop")}>
            <Ionicons name="cafe-outline" size={18} color={c.primary} />
            <Text style={[styles.aboutLink, { color: c.primary }]}>{t("about_support")} · ko-fi.com/kiritiop</Text>
          </TouchableOpacity>

          <View style={[styles.aboutDivider, { borderColor: c.border }]} />
          <Text style={[styles.aboutCopyright, { color: c.textMuted }]}>{t("about_copyright")}</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 48 },
    completeBanner: {
      flexDirection: "row", alignItems: "flex-start", gap: 10,
      borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 16,
    },
    completeBannerTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
    completeBannerSub: { fontSize: 12, lineHeight: 17, opacity: 0.85 },
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
    sectionTitle: {
      fontSize: 14, fontWeight: "700", textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    accordionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    accordionRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    accordionBody: { marginTop: 12 },
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
    aiNote: { fontSize: 11, fontStyle: "italic", marginTop: 6 },
    aboutRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
    aboutLabel: { fontSize: 14, fontWeight: "600" },
    aboutLink: { fontSize: 14, fontWeight: "500", textDecorationLine: "underline" },
    aboutDivider: { borderTopWidth: 1, marginVertical: 10 },
    aboutCopyright: { fontSize: 12, textAlign: "center" },
  });
}
