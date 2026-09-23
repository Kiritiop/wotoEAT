import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
} from "@expo-google-fonts/nunito";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import {
  getProfile, setAuthToken, getCurrentShoppingList, getPantry,
  saveProfile, saveCurrentShoppingList, replacePantry,
} from "@/services/api";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NetworkBanner } from "@/components/NetworkBanner";
import { WebShell } from "@/components/ui/WebShell";
import { useTheme } from "@/hooks/useTheme";
import { applyBrandFont } from "@/lib/fonts";
import type { Session } from "@supabase/supabase-js";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const { setProfile, setHasOnboarded, hasOnboarded, setAuthReady, setShoppingList, clearMeals, clearMealsIfStale, isGuest, setIsGuest } = useAppStore();
  const theme = useTheme();
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
  });
  // Apply the brand font globally once the weights are available (idempotent).
  if (fontsLoaded) applyBrandFont();

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION once storage is read — use it as
    // the single source of truth so authReady is only set after the token is known.
    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setAuthToken(s?.access_token ?? null);
      // SIGNED_OUT clears unconditionally (a user switch is always bracketed by
      // it). Start/sign-in clear only when the stream is from a previous DAY —
      // clearing unconditionally here defeated same-day persistence on every
      // cold start (and wiped seenMeals, so restarting let the AI re-suggest
      // dishes already shown today); on web SIGNED_IN can even re-fire on tab
      // refocus, which would wipe a live stream mid-session.
      if (event === "SIGNED_OUT") {
        clearMeals();
      } else if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        clearMealsIfStale();
      }
      setAuthReady(true);
      setReady(true);
    });
    return () => listener.subscription.unsubscribe();
    // Subscribe exactly once for the component's lifetime. The referenced store
    // actions (clearMeals/setAuthReady) are stable Zustand setters, so omitting
    // them is intentional — re-running would tear down and re-add the listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Date rollover on warm reopen: onRehydrateStorage only runs on cold start,
  // but iOS/Android keep the app in memory for days — reopening from background
  // the next morning would otherwise still show yesterday's meal stream.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      useAppStore.getState().clearMealsIfStale();
    });
    return () => sub.remove();
  }, []);

  // ── Guest → account handoff ───────────────────────────────────────────────
  // A guest's work lives entirely in persisted local state, and the account
  // they land in may be brand new (nothing on the server) or one they already
  // had (everything on the server). Those need opposite syncs, so each store is
  // checked before it is touched:
  //
  //   server empty  → push the guest's local copy up; it is the only copy.
  //   server has it → adopt the server's copy; it is the one they signed in for.
  //
  // Guessing either way loses data: pushing blindly overwrites an existing
  // account with a throwaway guest session, and pulling blindly greets a new
  // user by wiping everything that convinced them to sign up.
  //
  // isGuest clears only after all three settle, so the guest guards elsewhere
  // (shopping auto-save, profile save, the gated tabs) stay consistent for the
  // whole handoff instead of flipping mid-flight.
  const migratingRef = useRef(false);
  const [migrating, setMigrating] = useState(false);
  useEffect(() => {
    if (!session || !ready || !isGuest || migratingRef.current) return;
    migratingRef.current = true;
    setMigrating(true);
    const local = useAppStore.getState();
    void (async () => {
      // Each store is independent: a failed pantry sync must not cost them
      // their profile. Nothing is deleted locally on failure either, so the
      // worst case leaves them exactly where a guest was — not worse.
      try {
        const serverProfile = await getProfile();
        if (Object.keys(serverProfile).length > 0) {
          setProfile(serverProfile);
        } else {
          await saveProfile(local.profile);
        }
        setHasOnboarded(true);
      } catch { /* keep the local copy; the profile screen can retry */ }

      try {
        const serverList = await getCurrentShoppingList();
        if (serverList) {
          setShoppingList(serverList);
        } else if (local.shoppingList) {
          await saveCurrentShoppingList(local.shoppingList);
        }
      } catch { /* the debounced auto-save retries on the next edit */ }

      try {
        const serverPantry = await getPantry();
        if (serverPantry.length > 0) {
          local.setPantry(serverPantry);
        } else if (local.pantry.length > 0) {
          await replacePantry(local.pantry);
        }
      } catch { /* the pantry screen refetches on focus */ }

      setIsGuest(false);
      setMigrating(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, ready, isGuest]);

  // Load profile from backend whenever a session is established.
  // Wait for `ready` so onAuthStateChange has fired and setAuthToken() is guaranteed.
  useEffect(() => {
    if (!session || !ready) return;
    // Skip while a guest's local state is being pushed up — pulling the new
    // (empty) account's profile here would race the push.
    if (isGuest || migrating) return;
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
    // Keyed on the user id (not the whole session object) so a token refresh
    // doesn't refetch the profile; the store setters are stable. Intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, ready, isGuest, migrating]);

  // Redirect based on auth + onboarding state
  useEffect(() => {
    if (!ready) return;
    // Hold still during the guest → account handoff. hasOnboarded is false for
    // a guest (they never saw onboarding), so redirecting on it mid-migration
    // would bounce a brand-new account through onboarding and straight back
    // out the moment saveProfile lands.
    if (migrating) return;
    const seg0 = segments[0] as string | undefined;
    const inAuth = seg0 === "auth";
    const inOnboarding = seg0 === "onboarding";
    // Root index (landing page) — valid unauthenticated destination
    const atLanding = seg0 === undefined || seg0 === "index";
    // Legal documents are public: linked from the landing page, and on web they
    // are opened by direct URL. Gating them behind a session would mean a
    // privacy policy you must sign in to read.
    const inLegal = seg0 === "legal";
    // Password recovery hands the user a real session before they have set a
    // password, so the "signed in and sitting in /auth" rule below would throw
    // them into the app with their old password still active. This route has
    // to outrank it.
    // Compared as a joined path rather than by indexing: without the generated
    // typed-routes file (gitignored, so absent on a fresh CI checkout) useSegments
    // is a 1-tuple and segments[1] is a type error. Local builds have the file and
    // never see it, so CI is the only place this shows up.
    const inReset = segments.join("/") === "auth/reset-password";
    // A guest is unauthenticated but has explicitly asked to look around, so
    // the app treats them like a signed-in user for routing. Every screen they
    // can reach either works anonymously (discover, shopping) or swaps itself
    // for a sign-up prompt (pantry, recipes, history) — see GuestGate.
    const admitted = !!session || isGuest;

    if (!admitted && !inAuth && !atLanding && !inLegal) {
      router.replace("/");
    } else if (session && (inAuth || atLanding) && !inReset) {
      // Signed-in users skip the landing page entirely (web reopens land on "/")
      if (!hasOnboarded) {
         
        router.replace("/onboarding" as any);
      } else {
        router.replace("/(tabs)/discover");
      }
    } else if (session && !inAuth && !inOnboarding && !inLegal && !hasOnboarded) {

      router.replace("/onboarding" as any);
    }
    // Guests are deliberately absent from the two branches above: they must be
    // able to reach /auth (that is the whole point of the sign-up prompts), and
    // onboarding writes to the profile endpoint, which 401s without a session.
    // `router` is a stable expo-router singleton; including it would add churn
    // without changing behaviour. The listed deps are the real redirect inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, ready, segments, hasOnboarded, isGuest, migrating]);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style={theme.statusBar} />
        <WebShell>
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
          <Stack.Screen name="legal/[doc]" />
          <Stack.Screen
            name="share/[id]"
            options={{
              headerShown: true,
              title: "Shared Recipe",
              headerBackTitle: "Back",
            }}
          />
        </Stack>
        </WebShell>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
