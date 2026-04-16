/**
 * 3-step onboarding wizard shown to new users on first launch.
 * Step 1 — body metrics, Step 2 — health goals & restrictions, Step 3 — pantry seed.
 * Completes by setting hasOnboarded = true and navigating to the Today tab.
 */
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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "@/store/useAppStore";
import { saveProfile, upsertPantry } from "@/services/api";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme } from "@/hooks/useTheme";
import { LanguageToggle } from "@/components/LanguageToggle";
import {
  HEALTH_GOAL_OPTIONS,
  DIETARY_RESTRICTION_OPTIONS,
  optionLabel,
} from "@/constants/profileOptions";
import { getPantryUnits } from "@/constants/filters";

const TOTAL_STEPS = 3;

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const c = useTheme();
  const { profile, setProfile, setHasOnboarded, pantry, setPantry, language } = useAppStore();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  // Step 3 local pantry item entry
  const [itemName, setItemName] = useState("");
  const [itemAmount, setItemAmount] = useState("");
  const [itemUnit, setItemUnit] = useState("g");

  function toggleGoal(value: string) {
    const cur = profile.health_goals ?? [];
    setProfile({ health_goals: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] });
  }
  function toggleRestriction(value: string) {
    const cur = profile.dietary_restrictions ?? [];
    setProfile({ dietary_restrictions: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] });
  }
  function addPantryItem() {
    if (!itemName.trim() || !itemAmount.trim()) return;
    const item = { name: itemName.trim().toLowerCase(), amount: parseFloat(itemAmount), unit: itemUnit };
    setPantry([...pantry.filter((p) => p.name !== item.name), item]);
    setItemName(""); setItemAmount("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function handleFinish() {
    setSaving(true);
    try {
      await saveProfile(profile);
      if (pantry.length > 0) await upsertPantry(pantry);
    } catch {
      // Continue even if network fails — local state is persisted
    } finally {
      setSaving(false);
    }
    setHasOnboarded(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/(tabs)/discover");
  }

  function nextStep() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep((s) => s + 1);
  }
  function prevStep() { setStep((s) => s - 1); }

  const styles = makeStyles(c);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Language toggle */}
      <View style={styles.langRow}>
        <LanguageToggle />
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View
            key={i}
            style={[styles.progressSegment, i < step && styles.progressActive]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {step === 1 && (
          <View style={styles.stepBody}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepIcon, { backgroundColor: c.primaryLight }]}>
                <Ionicons name="body" size={28} color={c.primary} />
              </View>
              <Text style={styles.stepTitle}>{t("onboarding_step1")}</Text>
              <Text style={styles.stepSub}>{t("onboarding_step1_sub")}</Text>
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>{t("age")}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  placeholder={t("onboarding_age_placeholder")}
                  placeholderTextColor={c.textPlaceholder}
                  value={profile.age?.toString() ?? ""}
                  onChangeText={(v) => setProfile({ age: v ? parseInt(v) : undefined })}
                />
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>{t("sex")}</Text>
                <View style={styles.seg}>
                  {(["male", "female", "other"] as const).map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.segBtn, profile.sex === s && { backgroundColor: c.primary }]}
                      onPress={() => setProfile({ sex: s })}
                    >
                      <Text style={[styles.segText, profile.sex === s && { color: "#FFF" }]}>
                        {t(`${s}` as any)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>{t("weight_kg")}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  placeholder={t("onboarding_weight_placeholder")}
                  placeholderTextColor={c.textPlaceholder}
                  value={profile.weight_kg?.toString() ?? ""}
                  onChangeText={(v) => setProfile({ weight_kg: v ? parseFloat(v) : undefined })}
                />
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>{t("height_cm")}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  placeholder={t("onboarding_height_placeholder")}
                  placeholderTextColor={c.textPlaceholder}
                  value={profile.height_cm?.toString() ?? ""}
                  onChangeText={(v) => setProfile({ height_cm: v ? parseFloat(v) : undefined })}
                />
              </View>
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepBody}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepIcon, { backgroundColor: c.primaryLight }]}>
                <Ionicons name="fitness" size={28} color={c.primary} />
              </View>
              <Text style={styles.stepTitle}>{t("onboarding_step2")}</Text>
              <Text style={styles.stepSub}>{t("onboarding_step2_sub")}</Text>
            </View>

            <Text style={styles.sectionLabel}>{t("health_goals")}</Text>
            <View style={styles.chips}>
              {HEALTH_GOAL_OPTIONS.map((g) => {
                const active = (profile.health_goals ?? []).includes(g.value);
                return (
                  <TouchableOpacity
                    key={g.value}
                    style={[styles.chip, active && { backgroundColor: c.primary, borderColor: c.primary }]}
                    onPress={() => toggleGoal(g.value)}
                  >
                    <Text style={[styles.chipText, active && { color: "#FFF", fontWeight: "600" }]}>
                      {optionLabel(g, language)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>{t("dietary_restrictions")}</Text>
            <View style={styles.chips}>
              {DIETARY_RESTRICTION_OPTIONS.map((r) => {
                const active = (profile.dietary_restrictions ?? []).includes(r.value);
                return (
                  <TouchableOpacity
                    key={r.value}
                    style={[styles.chip, active && { backgroundColor: c.primary, borderColor: c.primary }]}
                    onPress={() => toggleRestriction(r.value)}
                  >
                    <Text style={[styles.chipText, active && { color: "#FFF", fontWeight: "600" }]}>
                      {optionLabel(r, language)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepBody}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepIcon, { backgroundColor: c.primaryLight }]}>
                <Ionicons name="nutrition" size={28} color={c.primary} />
              </View>
              <Text style={styles.stepTitle}>{t("onboarding_step3")}</Text>
              <Text style={styles.stepSub}>{t("onboarding_step3_sub")}</Text>
            </View>

            {/* Add item row */}
            <View style={styles.addRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={t("ingredient_name_placeholder")}
                placeholderTextColor={c.textPlaceholder}
                value={itemName}
                onChangeText={setItemName}
              />
              <TextInput
                style={[styles.input, { width: 72 }]}
                keyboardType="decimal-pad"
                placeholder="500"
                placeholderTextColor={c.textPlaceholder}
                value={itemAmount}
                onChangeText={setItemAmount}
              />
              <TouchableOpacity style={styles.addBtn} onPress={addPantryItem}>
                <Ionicons name="add" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            {/* Unit chips */}
            <View style={[styles.chips, { marginBottom: 16 }]}>
              {getPantryUnits(language).map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[styles.chip, itemUnit === u && { backgroundColor: c.primary, borderColor: c.primary }]}
                  onPress={() => setItemUnit(u)}
                >
                  <Text style={[styles.chipText, itemUnit === u && { color: "#FFF" }]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Added items */}
            {pantry.map((item) => (
              <View key={item.name} style={styles.pantryRow}>
                <Text style={[styles.pantryName, { color: c.text }]}>{item.name}</Text>
                <Text style={[styles.pantryAmt, { color: c.textMuted }]}>{item.amount} {item.unit}</Text>
                <TouchableOpacity onPress={() => setPantry(pantry.filter((p) => p.name !== item.name))}>
                  <Ionicons name="close-circle" size={18} color={c.error} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Navigation buttons */}
      <View style={styles.navRow}>
        {step > 1 ? (
          <TouchableOpacity style={styles.backBtn} onPress={prevStep}>
            <Ionicons name="chevron-back" size={18} color={c.textMuted} />
            <Text style={[styles.backText, { color: c.textMuted }]}>{t("back")}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.backBtn} onPress={() => {
            setHasOnboarded(true);
            router.replace("/(tabs)/discover");
          }}>
            <Text style={[styles.backText, { color: c.textMuted }]}>{t("skip")}</Text>
          </TouchableOpacity>
        )}

        {step < TOTAL_STEPS ? (
          <TouchableOpacity style={[styles.nextBtn, { backgroundColor: c.primary }]} onPress={nextStep}>
            <Text style={styles.nextText}>{t("next")}</Text>
            <Ionicons name="chevron-forward" size={18} color="#FFF" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: c.primary }, saving && { opacity: 0.7 }]}
            onPress={handleFinish}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Text style={styles.nextText}>{t("onboarding_finish")}</Text>
                <Ionicons name="checkmark" size={18} color="#FFF" />
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    langRow: { alignItems: "flex-end", paddingHorizontal: 20, paddingTop: 4 },
    progressBar: { flexDirection: "row", gap: 6, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
    progressSegment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.border },
    progressActive: { backgroundColor: c.primary },
    content: { padding: 24, paddingBottom: 16 },
    stepBody: { gap: 16 },
    stepHeader: { alignItems: "center", marginBottom: 8, gap: 8 },
    stepIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
    stepTitle: { fontSize: 22, fontWeight: "800", color: c.text, textAlign: "center" },
    stepSub: { fontSize: 14, color: c.textMuted, textAlign: "center" },
    label: { fontSize: 12, fontWeight: "600", color: c.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
    sectionLabel: { fontSize: 13, fontWeight: "700", color: c.text, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 },
    row: { flexDirection: "row", gap: 12 },
    half: { flex: 1 },
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, color: c.text, backgroundColor: c.inputBg,
    },
    seg: { flexDirection: "row", borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: c.border },
    segBtn: { flex: 1, paddingVertical: 11, alignItems: "center", backgroundColor: c.inputBg },
    segText: { fontSize: 12, color: c.textMuted, fontWeight: "600" },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
      backgroundColor: c.chipBg, borderWidth: 1, borderColor: c.border,
    },
    chipText: { fontSize: 13, color: c.chipText },
    addRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    addBtn: {
      width: 46, height: 46, borderRadius: 12,
      backgroundColor: c.primary, alignItems: "center", justifyContent: "center",
    },
    pantryRow: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: c.surface, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 10,
      gap: 8, marginBottom: 6,
    },
    pantryName: { flex: 1, fontSize: 14, fontWeight: "600", textTransform: "capitalize" },
    pantryAmt: { fontSize: 13 },
    navRow: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingHorizontal: 24, paddingVertical: 16,
      borderTopWidth: 1, borderTopColor: c.borderLight,
      backgroundColor: c.surface,
    },
    backBtn: { flexDirection: "row", alignItems: "center", gap: 4, padding: 4 },
    backText: { fontSize: 15, fontWeight: "600" },
    nextBtn: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingVertical: 13, paddingHorizontal: 24, borderRadius: 14,
    },
    nextText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  });
}
