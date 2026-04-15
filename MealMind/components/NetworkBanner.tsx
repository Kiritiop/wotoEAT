import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Shows a slim red banner at the top of the screen when there is no internet.
 * Disappears automatically when connectivity is restored.
 * On web, NetworkBanner.web.tsx is used instead (returns null).
 */
export function NetworkBanner() {
  const c = useTheme();
  const { t } = useTranslation();
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!(state.isConnected && state.isInternetReachable !== false));
    });
    return unsubscribe;
  }, []);

  if (!isOffline) return null;

  return (
    <View style={[styles.banner, { backgroundColor: c.error }]}>
      <Ionicons name="cloud-offline-outline" size={14} color="#FFF" />
      <Text style={styles.text}>{t("no_internet")} — {t("offline_note")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  text: { color: "#FFF", fontSize: 12, fontWeight: "600" },
});
