import { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";

/**
 * Where the password-reset email lands. Supabase puts the recovery token in
 * the URL fragment; `detectSessionInUrl` (web-only, see lib/supabase.ts) trades
 * it for a short-lived session and fires PASSWORD_RECOVERY, after which
 * `updateUser` is allowed to set a new password.
 *
 * That session is why the root layout has to leave this route alone: the user
 * is technically signed in the moment they arrive, and the normal
 * "signed in and sitting in /auth" rule would bounce them into the app before
 * they ever set a password.
 */
export default function ResetPasswordScreen() {
  const c = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // The recovery session may already exist (the fragment is parsed before
    // React mounts) or arrive a tick later, so accept either.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSave() {
    setError("");
    if (password.length < 6) {
      setError(t("password_too_short"));
      return;
    }
    if (password !== confirm) {
      setError(t("passwords_no_match"));
      return;
    }
    setLoading(true);
    try {
      const { error: supaErr } = await supabase.auth.updateUser({ password });
      if (supaErr) {
        setError(supaErr.message);
      } else {
        setDone(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setLoading(false);
    }
  }

  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Image source={require("@/assets/logo.png")} style={styles.logoWrap} resizeMode="contain"
          alt="wotoEAT" accessibilityLabel="wotoEAT" />
        <Text style={[styles.title, { color: c.text }]}>{t("reset_password")}</Text>

        {done ? (
          <>
            <Text style={[styles.subtitle, { color: c.textMuted }]}>{t("password_updated")}</Text>
            <Button
              label={t("sign_in")}
              fullWidth
              onPress={() => router.replace("/auth/sign-in")}
            />
          </>
        ) : !ready ? (
          // No recovery session: the link was already used, has expired, or the
          // page was opened directly. Say so instead of showing a form whose
          // save is guaranteed to fail.
          <>
            <Text style={[styles.subtitle, { color: c.textMuted }]}>{t("reset_link_invalid")}</Text>
            <Button
              label={t("forgot_password")}
              fullWidth
              onPress={() => router.replace("/auth/forgot-password")}
            />
          </>
        ) : (
          <>
            <Text style={[styles.subtitle, { color: c.textMuted }]}>{t("reset_password_new_hint")}</Text>

            <PasswordInput
              style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }]}
              placeholder={t("password")}
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
            />
            <PasswordInput
              style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }]}
              placeholder={t("confirm_password")}
              textContentType="newPassword"
              value={confirm}
              onChangeText={setConfirm}
              onSubmitEditing={handleSave}
              returnKeyType="done"
            />

            {error ? <Text style={[styles.error, { color: c.error }]}>{error}</Text> : null}

            <Button
              label={loading ? t("saving") : t("save")}
              loading={loading}
              disabled={loading}
              fullWidth
              onPress={handleSave}
            />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    inner: { flex: 1, justifyContent: "center", paddingHorizontal: 28, maxWidth: 440, width: "100%", alignSelf: "center" },
    logoWrap: { width: 72, height: 72, alignSelf: "center", marginBottom: 16 },
    title: { fontSize: 26, fontWeight: "800", textAlign: "center", marginBottom: 8 },
    subtitle: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 24 },
    input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, marginBottom: 12 },
    error: { fontSize: 13, marginBottom: 12, textAlign: "center" },
  });
}
