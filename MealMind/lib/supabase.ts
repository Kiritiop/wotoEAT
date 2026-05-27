import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import "react-native-url-polyfill/auto";

// Replace these with your actual values from:
// https://app.supabase.com → your project → Settings → API
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Use localStorage on web (explicitly passed so session survives page reloads),
// AsyncStorage on native.
const storage =
  Platform.OS === "web"
    ? typeof window !== "undefined"
      ? window.localStorage
      : undefined
    : AsyncStorage;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web",
  },
});

// Convenience type for the session user
export type SupabaseUser = NonNullable<
  Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"]
>;
