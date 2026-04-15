import { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "@/store/useAppStore";
import { getNearbyRestaurants } from "@/services/api";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import type { RestaurantResult } from "@/services/api";

export default function EatOutScreen() {
  const { filters } = useAppStore();
  const c = useTheme();
  const { t, strings } = useTranslation();
  const [restaurants, setRestaurants] = useState<RestaurantResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFindNearby() {
    setError(null);
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Enable location access in Settings to use Eat Out mode.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const data = await getNearbyRestaurants(
        loc.coords.latitude,
        loc.coords.longitude,
        filters
      );
      setRestaurants(data.restaurants);
      if (data.restaurants.length === 0) {
        setError("No nearby restaurants matched your preferences.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not find restaurants.");
    } finally {
      setLoading(false);
    }
  }

  function openMaps(url: string) {
    Linking.openURL(url).catch(() => setError("Could not open Google Maps."));
  }

  const styles = makeStyles(c);

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={restaurants}
        keyExtractor={(item) => item.name + item.address}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <Text style={[styles.heading, { color: c.text }]}>{t("eatout_heading")}</Text>
            <Text style={[styles.subheading, { color: c.textMuted }]}>{t("eatout_subtitle")}</Text>
            <TouchableOpacity
              style={[styles.findBtn, loading && { backgroundColor: c.disabled }]}
              onPress={handleFindNearby}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="location" size={18} color="#FFF" />
                  <Text style={styles.findBtnText}>{t("find_nearby")}</Text>
                </>
              )}
            </TouchableOpacity>
            {error && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={15} color={c.error} />
                <Text style={[styles.errorText, { color: c.error }]}>{error}</Text>
              </View>
            )}
            {restaurants.length > 0 && (
              <Text style={[styles.resultLabel, { color: c.textPlaceholder }]}>
                {strings.top_matches(restaurants.length)}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconWrap, { backgroundColor: c.successBg }]}>
                <Ionicons name="map-outline" size={44} color={c.primaryLight} />
              </View>
              <Text style={[styles.emptyTitle, { color: c.text }]}>{t("eatout_empty_title")}</Text>
              <Text style={[styles.emptyText, { color: c.textMuted }]}>{t("eatout_empty_body")}</Text>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: c.surface, shadowColor: c.shadow }]}
            onPress={() => openMaps(item.maps_url)}
            activeOpacity={0.85}
          >
            <View style={[styles.rankBadge, { backgroundColor: c.primary }]}>
              <Text style={styles.rankText}>{index + 1}</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.restaurantName, { color: c.text }]}>{item.name}</Text>
              <Text style={[styles.address, { color: c.textMuted }]} numberOfLines={1}>
                {item.address}
              </Text>
              {item.rating != null && (
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={13} color="#F59E0B" />
                  <Text style={[styles.ratingText, { color: c.warning }]}>{item.rating.toFixed(1)}</Text>
                </View>
              )}
              <Text style={[styles.reason, { color: c.textSecondary }]}>{item.reason}</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={c.textPlaceholder} />
          </TouchableOpacity>
        )}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, paddingBottom: 40 },
    heading: { fontSize: 22, fontWeight: "800", marginBottom: 6 },
    subheading: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
    findBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      backgroundColor: c.accent, borderRadius: 14, paddingVertical: 14,
      gap: 8, marginBottom: 16,
    },
    findBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
    resultLabel: { fontSize: 13, fontWeight: "600", marginBottom: 12 },
    errorBanner: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: c.errorBg, borderRadius: 10, padding: 10, marginBottom: 12,
    },
    errorText: { fontSize: 13, flex: 1 },
    emptyState: { alignItems: "center", paddingVertical: 48, gap: 10 },
    emptyIconWrap: {
      width: 88, height: 88, borderRadius: 44,
      alignItems: "center", justifyContent: "center", marginBottom: 4,
    },
    emptyTitle: { fontSize: 18, fontWeight: "700" },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 16 },
    card: {
      flexDirection: "row", alignItems: "flex-start",
      borderRadius: 14, padding: 14, marginBottom: 10,
      shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4,
      elevation: 2, gap: 12,
    },
    rankBadge: {
      width: 32, height: 32, borderRadius: 16,
      alignItems: "center", justifyContent: "center", flexShrink: 0,
    },
    rankText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
    cardBody: { flex: 1 },
    restaurantName: { fontSize: 16, fontWeight: "700", marginBottom: 2 },
    address: { fontSize: 13, marginBottom: 4 },
    ratingRow: { flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 6 },
    ratingText: { fontSize: 13, fontWeight: "600" },
    reason: { fontSize: 13, lineHeight: 18 },
  });
}
