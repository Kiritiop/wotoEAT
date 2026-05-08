import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { Head } from "expo-router/head";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import { getProfile, setAuthToken } from "@/services/api";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NetworkBanner } from "@/components/NetworkBanner";
import { useTheme } from "@/hooks/useTheme";
import type { Session } from "@supabase/supabase-js";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const { setProfile, setHasOnboarded, hasOnboarded, setAuthReady } = useAppStore();
  const theme = useTheme();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthToken(data.session?.access_token ?? null);
      setAuthReady(true);
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAuthToken(s?.access_token ?? null); // Keep interceptor token in sync immediately
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Load profile from backend whenever a session is established.
  // Wait for `ready` so getSession().then() has run and setAuthToken() is guaranteed.
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
    <>
      <Head>
        <title>wotoEAT — What to Eat</title>
        <meta name="description" content="AI-powered meal planning tailored to your health goals, pantry, and taste." />
        <link rel="icon" type="image/png" href="/assets/favicon.png" />
        <link rel="apple-touch-icon" href="/assets/favicon.png" />
        <meta name="theme-color" content="#2E7D32" />
      </Head>
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
        </Stack>
      </GestureHandlerRootView>
    </ErrorBoundary>
    </>
  );
}
