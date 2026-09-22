import { ScrollView, Text, View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useTheme, fontSize, radius, space } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import { legalDoc, LEGAL_LAST_UPDATED, type LegalSlug } from "@/constants/legal";

/**
 * One screen for all five legal documents; the slug picks the content. Public
 * on purpose: reachable signed-out, as a guest, and by direct URL on the web,
 * because a privacy policy you have to sign in to read is not a privacy policy.
 *
 * The DRAFT banner is not decoration. Nothing in constants/legal.ts has been
 * reviewed by a lawyer; remove the banner only when that has happened.
 */
export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const c = useTheme();
  const router = useRouter();
  const { t, language } = useTranslation();

  const content = legalDoc(doc as LegalSlug, language);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]} edges={["top"]}>
      {/* These five URLs are in the sitemap, and the helmet provider puts an
          empty <title> ahead of the static one in +html.tsx unless a route
          fills it. */}
      <Head>
        <title>{`${content ? t(content.titleKey) : t("legal_title")} | wotoEAT`}</title>
      </Head>
      <ScreenHeader
        title={content ? t(content.titleKey) : t("legal_title")}
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      />
      <ScrollView contentContainerStyle={styles.body}>
        {!content ? (
          <Text style={[styles.para, { color: c.textMuted }]}>{t("legal_not_found")}</Text>
        ) : (
          <>
            <View style={[styles.draft, { backgroundColor: c.errorBg }]}>
              <Ionicons name="alert-circle-outline" size={14} color={c.error} style={{ marginTop: 1 }} />
              <Text style={[styles.draftText, { color: c.error }]}>{t("legal_draft_banner")}</Text>
            </View>
            <Text style={[styles.updated, { color: c.textPlaceholder }]}>
              {t("legal_last_updated")}: {LEGAL_LAST_UPDATED}
            </Text>
            {content.sections.map(([heading, text]) => (
              <View key={heading} style={styles.section}>
                <Text style={[styles.heading, { color: c.text }]}>{heading}</Text>
                <Text style={[styles.para, { color: c.textSecondary }]}>{text}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Theme-independent: every colour here is applied inline from useTheme at the
// call site, so this needs neither the `c` parameter nor the useMemo wrapper
// the other screens use.
const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { paddingHorizontal: space.xl, paddingBottom: 40 },
  draft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    marginBottom: space.xl,
  },
  draftText: { flex: 1, fontSize: fontSize.xs, lineHeight: 16, fontWeight: "600" },
  updated: { fontSize: fontSize.xs, marginBottom: space.xl },
  section: { marginBottom: space.xl },
  heading: { fontSize: fontSize.md, fontWeight: "700", marginBottom: 6 },
  para: { fontSize: fontSize.sm, lineHeight: 21 },
});
