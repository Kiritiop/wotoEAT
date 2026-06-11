import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import { getProfile, setAuthToken, getCurrentShoppingList } from "@/services/api";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NetworkBanner } from "@/components/NetworkBanner";
import { useTheme } from "@/hooks/useTheme";
import type { Session } from "@supabase/supabase-js";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const { setProfile, setHasOnboarded, hasOnboarded, setAuthReady, setShoppingList, clearDailyPlan } = useAppStore();
  const theme = useTheme();

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION once storage is read — use it as
    // the single source of truth so authReady is only set after the token is known.
    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setAuthToken(s?.access_token ?? null);
      // Clear any persisted meal plan on every fresh login or page load so
      // the user never sees a stale plan from a previous session.
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "SIGNED_OUT") {
        clearDailyPlan();
      }
      setAuthReady(true);
      setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Load profile from backend whenever a session is established.
  // Wait for `ready` so onAuthStateChange has fired and setAuthToken() is guaranteed.
  useEffect(() => {
    if (!session || !ready) return;
    getProfile()
      .then((p) => {
        if (Object.keys(p).length > 0) {
          setProfile(p);
          setHasOnboarded(true); // Existing users skip onboarding on new devices/browsers
        }
      })
      .catch(() => {}); // Silently ignore; persisted local profile is fallback
    getCurrentShoppingList()
      .then((list) => { if (list) setShoppingList(list); })
      .catch(() => {});
  }, [session?.user?.id, ready]);

  // Redirect based on auth + onboarding state
  useEffect(() => {
    if (!ready) return;
    const seg0 = segments[0] as string | undefined;
    const inAuth = seg0 === "auth";
    const inOnboarding = seg0 === "onboarding";
    // Root index (landing page) — valid unauthenticated destination
    const atLanding = seg0 === undefined || seg0 === "index";

    if (!session && !inAuth && !atLanding) {
      router.replace("/");
    } else if (session && inAuth) {
      if (!hasOnboarded) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace("/onboarding" as any);
      } else {
        router.replace("/(tabs)/discover");
      }
    } else if (session && !inAuth && !inOnboarding && !hasOnboarded) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace("/onboarding" as any);
    }
  }, [session, ready, segments, hasOnboarded]);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style={theme.statusBar} />
        <NetworkBanner />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.primary,
            headerTitleStyle: { color: theme.text, fontWeight: "700" },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: theme.bg },
            headerShown: false,
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="auth" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen
            name="meal/[id]"
            options={{
              headerShown: true,
              title: "Meal Detail",
              headerBackTitle: "Back",
            }}
          />
          <Stack.Screen
            name="recipe/upload"
            options={{
              headerShown: true,
              title: "Add Recipe",
              headerBackTitle: "Back",
            }}
          />
          <Stack.Screen
            name="pantry/scan"
            options={{
              headerShown: true,
              title: "Scan Receipt",
              headerBackTitle: "Back",
            }}
          />
        </Stack>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
