import { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Head from "expo-router/head";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "@/store/useAppStore";
import { useTheme, fontSize, space } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/**
 * Public search-landing page for the "what to eat generator" family of
 * queries. It exists because the app is a single-page shell: without a real
 * URL whose text answers that query, there is nothing for Google to rank.
 *
 * `vercel.json` must keep its /what-to-eat rewrite, or the catch-all serves
 * +not-found.html here and the exported HTML is thrown away.
 */
const BULLETS = [
  { icon: "restaurant-outline", titleKey: "wte_b1_title", subKey: "wte_b1_sub" },
  { icon: "snow-outline", titleKey: "wte_b2_title", subKey: "wte_b2_sub" },
  { icon: "shield-checkmark-outline", titleKey: "wte_b3_title", subKey: "wte_b3_sub" },
  { icon: "refresh-outline", titleKey: "wte_b4_title", subKey: "wte_b4_sub" },
] as const;

export default function WhatToEatScreen() {
  const c = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const setIsGuest = useAppStore((s) => s.setIsGuest);
  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <SafeAreaView style={styles.safe}>
      <Head>
        <title>{t("wte_meta_title")}</title>
        <meta name="description" content={t("wte_meta_desc")} />
      </Head>

      <View style={styles.topBar}>
        <LanguageToggle />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image
            source={require("@/assets/logo.png")}
            style={styles.logo}
            resizeMode="contain"
            alt="wotoEAT"
            accessibilityLabel="wotoEAT"
          />
          <Text style={[styles.h1, { color: c.text }]} accessibilityRole="header">
            {t("wte_h1")}
          </Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>{t("wte_sub")}</Text>
        </View>

        <Button
          label={t("wte_cta")}
          icon="sparkles"
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setIsGuest(true);
            router.replace("/(tabs)/discover");
          }}
        />
        <Text style={[styles.ctaSub, { color: c.textPlaceholder }]}>{t("wte_cta_sub")}</Text>

        <Text style={[styles.h2, { color: c.text }]}>{t("wte_how")}</Text>
        <View style={styles.bullets}>
          {BULLETS.map(({ icon, titleKey, subKey }) => (
            <Card key={titleKey} style={styles.card}>
              <View style={[styles.iconWrap, { backgroundColor: c.primary + "18" }]}>
                <Ionicons name={icon} size={20} color={c.primary} />
              </View>
              <View style={styles.cardText}>
                <Text style={[styles.cardTitle, { color: c.text }]}>{t(titleKey)}</Text>
                <Text style={[styles.cardSub, { color: c.textMuted }]}>{t(subKey)}</Text>
              </View>
            </Card>
          ))}
        </View>

        <TouchableOpacity
          accessibilityRole="link"
          onPress={() => router.push("/")}
          style={styles.homeLink}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.homeLabel, { color: c.primary }]}>{t("wte_home")}</Text>
          <Ionicons name="arrow-forward" size={14} color={c.primary} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    topBar: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: space.xl, paddingTop: space.sm },
    content: { paddingHorizontal: space.xl, paddingBottom: 40, gap: space.md },
    hero: { alignItems: "center", gap: 8, paddingTop: space.sm },
    logo: { width: 92, height: 92 },
    h1: { fontSize: 28, fontWeight: "800", letterSpacing: -0.4, textAlign: "center" },
    sub: { fontSize: fontSize.md, lineHeight: 22, textAlign: "center", maxWidth: 380 },
    ctaSub: { fontSize: fontSize.xs, textAlign: "center" },
    h2: { fontSize: fontSize.lg, fontWeight: "800", marginTop: space.md },
    bullets: { gap: 10 },
    card: { flexDirection: "row", alignItems: "flex-start", gap: 13, paddingVertical: 12, paddingHorizontal: 14 },
    iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    cardText: { flex: 1 },
    cardTitle: { fontSize: fontSize.md, fontWeight: "700", marginBottom: 2 },
    cardSub: { fontSize: fontSize.sm, lineHeight: 19 },
    homeLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: space.md },
    homeLabel: { fontSize: fontSize.sm, fontWeight: "700" },
  });
}
