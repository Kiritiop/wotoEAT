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
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";

export default function SignUpScreen() {
  const c = useTheme();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  async function handleSignUp() {
    setError("");
    if (!email || !password) {
      setError(t("enter_email_password"));
      return;
    }
    if (password !== confirm) {
      setError(t("passwords_no_match"));
      return;
    }
    if (password.length < 6) {
      setError(t("password_too_short"));
      return;
    }
    setLoading(true);
    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
    } else {
      setSuccess(true);
    }
  }

  const styles = makeStyles(c);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <View style={styles.logoWrap}>
          <Ionicons name="leaf" size={36} color={c.primary} />
        </View>
        <Text style={[styles.title, { color: c.text }]}>{t("create_account")}</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>{t("start_discovering")}</Text>

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
          placeholder={`${t("password")} (min 6)`}
          placeholderTextColor={c.textPlaceholder}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          style={[styles.input, { borderColor: c.border, backgroundColor: c.surface, color: c.text }]}
          placeholder={t("confirm_password")}
          placeholderTextColor={c.textPlaceholder}
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
        />

        {error ? <Text style={[styles.errorText, { color: c.error }]}>{error}</Text> : null}

        {success ? (
          <View style={styles.successBox}>
            <Text style={[styles.successText, { color: c.success }]}>
              {t("account_created")}{" "}
            </Text>
            <TouchableOpacity onPress={() => router.replace("/auth/sign-in")}>
              <Text style={[styles.linkBold, { color: c.primary }]}>{t("sign_in_here")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: c.primary }, loading && { backgroundColor: c.disabled }]}
            onPress={handleSignUp}
            disabled={loading}
          >
            <Text style={styles.btnText}>
              {loading ? t("creating_account") : t("create_account")}
            </Text>
          </TouchableOpacity>
        )}

        <Link href="/auth/sign-in" asChild>
          <TouchableOpacity style={styles.link}>
            <Text style={[styles.linkText, { color: c.textMuted }]}>
              {t("have_account")}{" "}
              <Text style={[styles.linkBold, { color: c.primary }]}>{t("sign_in_link")}</Text>
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
    successBox: { alignItems: "center", gap: 4 },
    successText: { fontSize: 14, textAlign: "center" },
  });
}
