import { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/Button";

export default function SignInScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignIn() {
    setError("");
    // Mobile keyboards routinely append a space after autocomplete — trim, or
    // Supabase rejects " user@x.com" with a confusing invalid-credentials error.
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError(t("enter_email_password"));
      return;
    }
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (signInError) setError(signInError.message);
      // On success the root _layout listener handles the redirect
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed. Please try again.");
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
      <View style={[styles.langRow, { paddingTop: insets.top + 8 }]}>
        <LanguageToggle />
      </View>
      <View style={styles.inner}>
        <Image source={require("@/assets/logo.png")} style={styles.logoWrap} resizeMode="contain" />
        <Text style={[styles.title, { color: c.text }]}>{t("welcome_back")}</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>{t("app_tagline")}</Text>

        <TextInput
          style={[styles.input, { borderColor: c.border, backgroundColor: c.surface, color: c.text }]}
          placeholder={t("email")}
          placeholderTextColor={c.textPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={[styles.input, { borderColor: c.border, backgroundColor: c.surface, color: c.text }]}
          placeholder={t("password")}
          placeholderTextColor={c.textPlaceholder}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error ? <Text style={[styles.errorText, { color: c.error }]}>{error}</Text> : null}

        <Button
          label={t("sign_in")}
          onPress={handleSignIn}
          loading={loading}
          style={styles.btn}
        />

        <Link href="/auth/forgot-password" asChild>
          <TouchableOpacity style={styles.link}>
            <Text style={[styles.linkText, { color: c.textMuted }]}>{t("forgot_password")}</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/auth/sign-up" asChild>
          <TouchableOpacity style={styles.link}>
            <Text style={[styles.linkText, { color: c.textMuted }]}>
              {t("no_account")}{" "}
              <Text style={[styles.linkBold, { color: c.primary }]}>{t("sign_up_link")}</Text>
            </Text>
          </TouchableOpacity>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    langRow: { alignItems: "flex-end", paddingHorizontal: 20 },
    inner: { flex: 1, justifyContent: "center", paddingHorizontal: 28, gap: 12 },
    logoWrap: {
      width: 100, height: 100,
      alignSelf: "center", marginBottom: 4,
    },
    title: { fontSize: 32, fontWeight: "800", textAlign: "center" },
    subtitle: { fontSize: 16, textAlign: "center", marginBottom: 24 },
    input: {
      borderWidth: 1, borderRadius: 16,
      paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
    },
    btn: { borderRadius: 16, paddingVertical: 16, alignItems: "center", marginTop: 8 },
    btnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
    link: { alignItems: "center", marginTop: 8 },
    linkText: { fontSize: 14 },
    linkBold: { fontWeight: "700" },
    errorText: { fontSize: 14, textAlign: "center" },
  });
}
