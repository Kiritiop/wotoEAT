import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "@/store/useAppStore";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * A quiet, always-visible reminder that nothing is being saved to an account,
 * with the one-tap way out. Renders nothing for signed-in users.
 *
 * Deliberately a thin strip rather than a dismissible card: a guest who forgets
 * they are a guest is the person most likely to lose work, and there is no
 * server-side copy of anything they have made.
 */
export function GuestBanner() {
  const isGuest = useAppStore((s) => s.isGuest);
  const c = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  if (!isGuest) return null;

  return (
    <View style={[styles.bar, { backgroundColor: c.primaryLight, borderColor: c.border }]}>
      <Ionicons name="eye-outline" size={15} color={c.primary} />
      <Text style={[styles.label, { color: c.text }]} numberOfLines={1}>
        {t("guest_banner")}
      </Text>
      <TouchableOpacity
        onPress={() => {
          Haptics.selectionAsync();
          router.push("/auth/sign-up");
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.cta, { color: c.primary }]}>{t("guest_banner_cta")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 10,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
  },
  label: { flex: 1, fontSize: 12.5, fontWeight: "600" },
  cta: { fontSize: 12.5, fontWeight: "800", textDecorationLine: "underline" },
});
