import { useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
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
  { icon: "sparkles", titleKey: "landing_f1_title", subKey: "landing_f1_sub", color: "#16A34A" },
  { icon: "leaf-outline", titleKey: "landing_f2_title", subKey: "landing_f2_sub", color: "#0369A1" },
  { icon: "bookmark-outline", titleKey: "landing_f3_title", subKey: "landing_f3_sub", color: "#7C3AED" },
];

// Enable LayoutAnimation on Android so the Learn More dropdown animates.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function LandingScreen() {
  const router = useRouter();
  const c = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [showMore, setShowMore] = useState(false);

  function toggleMore() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowMore((v) => !v);
    Haptics.selectionAsync();
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Top bar: brand lockup (left) + language toggle (right) */}
      <View style={styles.topBar}>
        <View style={styles.brand}>
          <Image source={require("@/assets/logo.png")} style={styles.brandLogo} resizeMode="contain" />
          <Text style={[styles.brandName, { color: c.text }]}>wotoEAT</Text>
        </View>
        <LanguageToggle />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Hero ── */}
        <View style={styles.hero}>
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

          {/* ── Learn More dropdown ── */}
          <TouchableOpacity
            style={styles.learnMoreToggle}
            onPress={toggleMore}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.learnMoreLabel, { color: c.textMuted }]}>{t("landing_learn_more")}</Text>
            <Ionicons name={showMore ? "chevron-up" : "chevron-down"} size={15} color={c.textMuted} />
          </TouchableOpacity>

          {showMore && (
            <View style={styles.learnMoreBody}>
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
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    topBar: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4,
    },
    brand: { flexDirection: "row", alignItems: "center", gap: 8 },
    brandLogo: { width: 30, height: 30 },
    brandName: { fontSize: 19, fontWeight: "800", letterSpacing: -0.3 },
    content: { flexGrow: 1, justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 8, paddingBottom: 14 },

    // Hero
    hero: { paddingTop: 12, gap: 10 },
    heroTitle: { fontSize: 27, fontWeight: "800", lineHeight: 33, letterSpacing: -0.4 },
    heroSub: { fontSize: 14.5, lineHeight: 21, maxWidth: 360 },

    // Features
    features: { gap: 10 },
    featureCard: {
      flexDirection: "row", alignItems: "center", gap: 13,
      borderRadius: 16, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 14,
      shadowColor: "#2A2118", shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
    },
    featureIcon: {
      width: 42, height: 42, borderRadius: 13,
      alignItems: "center", justifyContent: "center", flexShrink: 0,
    },
    featureText: { flex: 1 },
    featureTitle: { fontSize: 15, fontWeight: "700", marginBottom: 1 },
    featureSub: { fontSize: 12.5, lineHeight: 17 },

    // CTAs
    ctaSection: { gap: 10, alignItems: "center" },
    ctaPrimary: {
      width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 10, borderRadius: 16, paddingVertical: 16,
      shadowColor: c.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
    },
    ctaPrimaryText: { color: "#FFF", fontSize: 17, fontWeight: "800" },
    signinRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    signinLabel: { fontSize: 14 },
    signinLink: { fontSize: 14, fontWeight: "700" },
    finePrint: { fontSize: 12, textAlign: "center" },
    learnMoreToggle: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 4, paddingVertical: 6, marginTop: 2,
    },
    learnMoreLabel: { fontSize: 13, fontWeight: "600" },
    learnMoreBody: { alignItems: "center", gap: 8, marginTop: 2 },
    creatorFooter: { alignItems: "center", gap: 4 },
    creatorText: { fontSize: 11 },
    creatorLinks: { flexDirection: "row", alignItems: "center", gap: 6 },
    creatorLink: { fontSize: 11, fontWeight: "600" },
    creatorDot: { fontSize: 11 },
  });
}
