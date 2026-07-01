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
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

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
      {/* Top bar: language toggle only — the brand lives in the hero below */}
      <View style={styles.topBar}>
        <LanguageToggle />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Hero: the logo is the brand anchor (it already contains the
            "what to eat" wordmark), so no redundant text lockup. Placed on the
            cream page bg so its baked-in cream background blends edge-free. ── */}
        <View style={styles.hero}>
          <Image source={require("@/assets/logo.png")} style={styles.heroLogo} resizeMode="contain" />
          <Text style={[styles.heroTitle, { color: c.text }]}>{t("landing_hero_title")}</Text>
          <Text style={[styles.heroSub, { color: c.textMuted }]}>{t("landing_hero_sub")}</Text>
        </View>

        {/* ── Feature cards ── */}
        <View style={styles.features}>
          {FEATURES.map(({ icon, titleKey, subKey, color }) => (
            <Card key={titleKey} style={styles.featureCard}>
              <View style={[styles.featureIcon, { backgroundColor: color + "18" }]}>
                <Ionicons name={icon} size={22} color={color} />
              </View>
              <View style={styles.featureText}>
                <Text style={[styles.featureTitle, { color: c.text }]}>{t(titleKey)}</Text>
                <Text style={[styles.featureSub, { color: c.textMuted }]}>{t(subKey)}</Text>
              </View>
            </Card>
          ))}
        </View>

        {/* ── CTAs ── */}
        <View style={styles.ctaSection}>
          <Button
            label={t("landing_cta_start")}
            icon="arrow-forward-circle"
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.push("/auth/sign-up");
            }}
          />

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
      flexDirection: "row", alignItems: "center", justifyContent: "flex-end",
      paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4,
    },
    content: { flexGrow: 1, justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 4, paddingBottom: 14 },

    // Hero — logo-led, centered
    hero: { alignItems: "center", paddingTop: 4, gap: 8 },
    heroLogo: { width: 108, height: 108, marginBottom: 2 },
    heroTitle: { fontSize: 27, fontWeight: "800", lineHeight: 33, letterSpacing: -0.4, textAlign: "center" },
    heroSub: { fontSize: 14.5, lineHeight: 21, maxWidth: 360, textAlign: "center" },

    // Features
    features: { gap: 10 },
    featureCard: {
      flexDirection: "row", alignItems: "center", gap: 13,
      paddingVertical: 12, paddingHorizontal: 14,
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
