import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import { LanguageToggle } from "@/components/LanguageToggle";

export default function SignInScreen() {
  const c = useTheme();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignIn() {
    setError("");
    if (!email || !password) {
      setError(t("enter_email_password"));
      return;
    }
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) setError(signInError.message);
      // On success the root _layout listener handles the redirect
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const styles = makeStyles(c);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.langRow}>
        <LanguageToggle />
      </View>
      <View style={styles.inner}>
        <View style={styles.logoWrap}>
          <Ionicons name="leaf" size={36} color={c.primary} />
        </View>
        <Text style={[styles.title, { color: c.text }]}>wotoEAT</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>{t("app_tagline")}</Text>

        <TextInput
          style={[styles.input, { borderColor: c.border, backgroundColor: c.surface, color: c.text }]}
          placeholder={t("email")}
          placeholderTextColor={c.textPlaceholder}
          autoCapitalize="none"
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

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: c.primary }, loading && { backgroundColor: c.disabled }]}
          onPress={handleSignIn}
          disabled={loading}
        >
          <Text style={styles.btnText}>{loading ? t("signing_in") : t("sign_in")}</Text>
        </TouchableOpacity>

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
    langRow: { alignItems: "flex-end", paddingHorizontal: 20, paddingTop: 56 },
    inner: { flex: 1, justifyContent: "center", paddingHorizontal: 28, gap: 12 },
    logoWrap: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: c.primaryLight,
      alignItems: "center", justifyContent: "center",
      alignSelf: "center", marginBottom: 4,
    },
    title: { fontSize: 32, fontWeight: "800", textAlign: "center" },
    subtitle: { fontSize: 16, textAlign: "center", marginBottom: 24 },
    input: {
      borderWidth: 1, borderRadius: 14,
      paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
    },
    btn: { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8 },
    btnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
    link: { alignItems: "center", marginTop: 8 },
    linkText: { fontSize: 14 },
    linkBold: { fontWeight: "700" },
    errorText: { fontSize: 14, textAlign: "center" },
  });
}
