import {
  View,
  Text,
  StyleSheet,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme } from "@/hooks/useTheme";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Button } from "@/components/ui/Button";
import { saveProfile } from "@/services/api";

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const c = useTheme();
  const { setHasOnboarded, profile } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleStart() {
    setSaving(true);
    setSaveError(null);
    try {
      await saveProfile(profile);
      setHasOnboarded(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)/discover");
    } catch {
      setSaveError(t("onboarding_save_error"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  }

  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Language toggle — top right */}
      <View style={styles.langRow}>
        <LanguageToggle />
      </View>

      <View style={styles.body}>
        {/* Icon */}
        <Image source={require("@/assets/logo.png")} style={styles.iconWrap} resizeMode="contain" />

        {/* Title */}
        <Text style={[styles.title, { color: c.text }]}>{t("onboarding_welcome")}</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>{t("onboarding_welcome_sub")}</Text>

        {/* Feature bullets */}
        <View style={styles.bullets}>
          {(["sparkles", "nutrition", "cart"] as const).map((icon, bulletKey) => {
            const keys = ["onboarding_bullet_1", "onboarding_bullet_2", "onboarding_bullet_3"] as const;
            return (
              <View key={icon} style={styles.bullet}>
                <View style={[styles.bulletIcon, { backgroundColor: c.primaryLight }]}>
                  <Ionicons name={icon} size={18} color={c.primary} />
                </View>
                <Text style={[styles.bulletText, { color: c.textSecondary }]}>
                  {t(keys[bulletKey])}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* CTA */}
      <View style={styles.footer}>
        <ErrorBanner message={saveError} />
        <Text style={[styles.hint, { color: c.textPlaceholder }]}>
          {t("complete_profile_sub")}
        </Text>
        <Button
          label={t("onboarding_get_started")}
          icon="arrow-forward"
          iconRight
          onPress={handleStart}
          loading={saving}
        />
      </View>
    </SafeAreaView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    langRow: { alignItems: "flex-end", paddingHorizontal: 20, paddingTop: 8 },
    body: {
      flex: 1, alignItems: "center", justifyContent: "center",
      paddingHorizontal: 32, gap: 16,
    },
    iconWrap: {
      width: 120, height: 120, marginBottom: 8, alignSelf: "center",
    },
    title: { fontSize: 28, fontWeight: "800", textAlign: "center" },
    subtitle: { fontSize: 16, textAlign: "center", lineHeight: 22 },
    bullets: { width: "100%", gap: 12, marginTop: 8 },
    bullet: { flexDirection: "row", alignItems: "center", gap: 12 },
    bulletIcon: {
      width: 40, height: 40, borderRadius: 12,
      alignItems: "center", justifyContent: "center", flexShrink: 0,
    },
    bulletText: { fontSize: 14, lineHeight: 20, flex: 1 },
    footer: { paddingHorizontal: 24, paddingBottom: 32, gap: 12 },
    hint: { fontSize: 12, textAlign: "center", lineHeight: 18 },
    startBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      borderRadius: 16, paddingVertical: 16, gap: 10,
    },
    startBtnText: { color: "#FFF", fontSize: 17, fontWeight: "800" },
  });
}
