import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Button } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  /** Header title for the tab this stands in for, e.g. "Pantry". */
  headerTitle: string;
  /**
   * Header action slot. The Pantry gate passes its cart button through here:
   * the shopping list is only reachable from the Pantry header, so dropping it
   * would strand guests with a list they built and cannot open.
   */
  headerRight?: React.ReactNode;
  /** Ionicon matching the tab. */
  icon: React.ComponentProps<typeof Ionicons>["name"];
  /** What the guest is missing, e.g. "Your pantry lives in your account". */
  title: string;
  /** One line on why it needs an account. */
  body: string;
}

/**
 * Stands in for a screen a guest cannot use.
 *
 * Pantry, saved recipes and meal history all live behind require_user_id on the
 * API — there is no anonymous version of "your" saved data. Rather than let
 * those screens mount and render a wall of 401s, the tab swaps to this: it says
 * plainly what the feature is and offers the account that unlocks it.
 *
 * It keeps the ScreenHeader so the shell stays consistent with every other
 * in-app screen, and so a header action a guest CAN use still works.
 *
 * Guests keep the parts that genuinely work without an account (discover, swap,
 * shopping list), so this is a prompt, not a dead end.
 */
export function GuestGate({ headerTitle, headerRight, icon, title, body }: Props) {
  const c = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <ScreenHeader title={headerTitle} right={headerRight} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.iconWrap, { backgroundColor: c.primaryLight }]}>
          <Ionicons name={icon} size={40} color={c.primary} />
        </View>

        <Text style={[styles.title, { color: c.text }]}>{title}</Text>
        <Text style={[styles.body, { color: c.textMuted }]}>{body}</Text>

        <View style={[styles.badge, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Ionicons name="checkmark-circle" size={16} color={c.primary} />
          <Text style={[styles.badgeText, { color: c.textMuted }]}>
            {t("guest_keeps_progress")}
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            label={t("guest_gate_cta")}
            icon="person-add"
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.push("/auth/sign-up");
            }}
          />
          <Button
            label={t("sign_in")}
            variant="secondary"
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/auth/sign-in");
            }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 32,
    gap: 10,
  },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  title: { fontSize: 21, fontWeight: "800", textAlign: "center", letterSpacing: -0.3 },
  body: { fontSize: 14.5, lineHeight: 21, textAlign: "center", maxWidth: 320 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
    marginTop: 6,
  },
  badgeText: { fontSize: 12.5, fontWeight: "600" },
  actions: { alignSelf: "stretch", gap: 9, marginTop: 18 },
});
