import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import { LanguageToggle } from "@/components/LanguageToggle";

const FEATURES: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  titleKey: "landing_f1_title" | "landing_f2_title" | "landing_f3_title";
  subKey: "landing_f1_sub" | "landing_f2_sub" | "landing_f3_sub";
  color: string;
}[] = [
  { icon: "sparkles", titleKey: "landing_f1_title", subKey: "landing_f1_sub", color: "#2E7D32" },
  { icon: "leaf-outline", titleKey: "landing_f2_title", subKey: "landing_f2_sub", color: "#0369A1" },
  { icon: "bookmark-outline", titleKey: "landing_f3_title", subKey: "landing_f3_sub", color: "#7C3AED" },
];

export default function LandingScreen() {
  const router = useRouter();
  const c = useTheme();
  const { t } = useTranslation();
  const styles = makeStyles(c);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Language toggle */}
      <View style={styles.topBar}>
        <LanguageToggle />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={[styles.logoRing, { backgroundColor: c.primaryLight }]}>
            <Ionicons name="restaurant" size={52} color={c.primary} />
          </View>
          <Text style={[styles.appName, { color: c.text }]}>wotoEAT</Text>
          <Text style={[styles.heroTitle, { color: c.text }]}>{t("landing_hero_title")}</Text>
          <Text style={[styles.heroSub, { color: c.textMuted }]}>{t("landing_hero_sub")}</Text>
        </View>

        {/* ── Feature cards ── */}
        <View style={styles.features}>
          {FEATURES.map(({ icon, titleKey, subKey, color }) => (
            <View key={titleKey} style={[styles.featureCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={[styles.featureIcon, { backgroundColor: color + "18" }]}>
                <Ionicons name={icon} size={22} color={color} />
              </View>
              <View style={styles.featureText}>
                <Text style={[styles.featureTitle, { color: c.text }]}>{t(titleKey)}</Text>
                <Text style={[styles.featureSub, { color: c.textMuted }]}>{t(subKey)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── CTAs ── */}
        <View style={styles.ctaSection}>
          <TouchableOpacity
            style={[styles.ctaPrimary, { backgroundColor: c.primary }]}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.push("/auth/sign-up");
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-forward-circle" size={20} color="#FFF" />
            <Text style={styles.ctaPrimaryText}>{t("landing_cta_start")}</Text>
          </TouchableOpacity>

          <View style={styles.signinRow}>
            <Text style={[styles.signinLabel, { color: c.textMuted }]}>{t("landing_cta_signin")}</Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                router.push("/auth/sign-in");
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.signinLink, { color: c.primary }]}>{t("sign_in")}</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.finePrint, { color: c.textPlaceholder }]}>{t("landing_fine_print")}</Text>

          {/* Creator footer */}
          <View style={styles.creatorFooter}>
            <Text style={[styles.creatorText, { color: c.textMuted }]}>
              {t("about_copyright")}
            </Text>
            <View style={styles.creatorLinks}>
              <TouchableOpacity onPress={() => Linking.openURL("https://www.linkedin.com/in/wang-jerry/")}>
                <Text style={[styles.creatorLink, { color: c.primary }]}>LinkedIn</Text>
              </TouchableOpacity>
              <Text style={[styles.creatorDot, { color: c.textMuted }]}>·</Text>
              <TouchableOpacity onPress={() => Linking.openURL("https://ko-fi.com/kiritiop")}>
                <Text style={[styles.creatorLink, { color: c.primary }]}>Ko-fi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    topBar: { alignItems: "flex-end", paddingHorizontal: 20, paddingTop: 4 },
    content: { paddingHorizontal: 24, paddingBottom: 40 },

    // Hero
    hero: { alignItems: "center", paddingTop: 24, paddingBottom: 32, gap: 10 },
    logoRing: {
      width: 100, height: 100, borderRadius: 50,
      alignItems: "center", justifyContent: "center", marginBottom: 8,
    },
    appName: { fontSize: 36, fontWeight: "900", letterSpacing: -0.5 },
    heroTitle: { fontSize: 22, fontWeight: "800", textAlign: "center", lineHeight: 28 },
    heroSub: { fontSize: 15, textAlign: "center", lineHeight: 22, maxWidth: 320 },

    // Features
    features: { gap: 12, marginBottom: 32 },
    featureCard: {
      flexDirection: "row", alignItems: "center", gap: 14,
      borderRadius: 16, borderWidth: 1, padding: 16,
      shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
    },
    featureIcon: {
      width: 46, height: 46, borderRadius: 14,
      alignItems: "center", justifyContent: "center", flexShrink: 0,
    },
    featureText: { flex: 1 },
    featureTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
    featureSub: { fontSize: 13, lineHeight: 18 },

    // CTAs
    ctaSection: { gap: 14, alignItems: "center" },
    ctaPrimary: {
      width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 10, borderRadius: 18, paddingVertical: 18,
      shadowColor: c.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
    },
    ctaPrimaryText: { color: "#FFF", fontSize: 17, fontWeight: "800" },
    signinRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    signinLabel: { fontSize: 14 },
    signinLink: { fontSize: 14, fontWeight: "700" },
    finePrint: { fontSize: 12, textAlign: "center", marginTop: 4 },
    creatorFooter: { alignItems: "center", gap: 4, marginTop: 20 },
    creatorText: { fontSize: 11 },
    creatorLinks: { flexDirection: "row", alignItems: "center", gap: 6 },
    creatorLink: { fontSize: 11, fontWeight: "600" },
    creatorDot: { fontSize: 11 },
  });
}
