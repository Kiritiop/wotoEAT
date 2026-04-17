import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "@/store/useAppStore";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme } from "@/hooks/useTheme";
import { LanguageToggle } from "@/components/LanguageToggle";

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const c = useTheme();
  const { setHasOnboarded } = useAppStore();

  function handleStart() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setHasOnboarded(true);
    router.replace("/(tabs)/discover");
  }

  const styles = makeStyles(c);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Language toggle — top right */}
      <View style={styles.langRow}>
        <LanguageToggle />
      </View>

      <View style={styles.body}>
        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: c.primaryLight }]}>
          <Ionicons name="restaurant" size={52} color={c.primary} />
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: c.text }]}>{t("onboarding_welcome")}</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>{t("onboarding_welcome_sub")}</Text>

        {/* Feature bullets */}
        <View style={styles.bullets}>
          {(["sparkles", "nutrition", "cart"] as const).map((icon, i) => {
            const labels = ["AI meal plans tailored to you", "Track pantry & reduce waste", "Smart shopping lists"];
            const labelsZh = ["根据您的需求智能生成餐饮计划", "管理食材库存，减少浪费", "智能购物清单"];
            return (
              <View key={icon} style={styles.bullet}>
                <View style={[styles.bulletIcon, { backgroundColor: c.primaryLight }]}>
                  <Ionicons name={icon} size={18} color={c.primary} />
                </View>
                <Text style={[styles.bulletText, { color: c.textSecondary }]}>
                  {i === 0
                    ? (c as any).__lang === "zh" ? labelsZh[i] : labels[i]
                    : labels[i]}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* CTA */}
      <View style={styles.footer}>
        <Text style={[styles.hint, { color: c.textPlaceholder }]}>
          {t("complete_profile_sub")}
        </Text>
        <TouchableOpacity
          style={[styles.startBtn, { backgroundColor: c.primary }]}
          onPress={handleStart}
          activeOpacity={0.85}
        >
          <Text style={styles.startBtnText}>{t("onboarding_get_started")}</Text>
          <Ionicons name="arrow-forward" size={20} color="#FFF" />
        </TouchableOpacity>
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
      width: 100, height: 100, borderRadius: 50,
      alignItems: "center", justifyContent: "center", marginBottom: 8,
    },
    title: { fontSize: 28, fontWeight: "800", textAlign: "center" },
    subtitle: { fontSize: 16, textAlign: "center", lineHeight: 22 },
    bullets: { width: "100%", gap: 12, marginTop: 8 },
    bullet: { flexDirection: "row", alignItems: "center", gap: 12 },
    bulletIcon: {
      width: 36, height: 36, borderRadius: 10,
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
