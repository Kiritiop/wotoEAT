import { useState } from "react";
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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";

export default function ForgotPasswordScreen() {
  const c = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSend() {
    setError("");
    if (!email.trim()) {
      setError(t("enter_email"));
      return;
    }
    setLoading(true);
    try {
      const { error: supaErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: "wotoeat://reset-password",
      });
      if (supaErr) {
        setError(supaErr.message);
      } else {
        setSent(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
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
      <View style={styles.inner}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={c.primary} />
          <Text style={[styles.backText, { color: c.primary }]}>{t("back")}</Text>
        </TouchableOpacity>

        <Image source={require("@/assets/logo.png")} style={styles.logoWrap} resizeMode="contain" />
        <Text style={[styles.title, { color: c.text }]}>{t("reset_password")}</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>
          {t("reset_password_hint")}
        </Text>

        {sent ? (
          <View style={[styles.successBox, { backgroundColor: c.successBg }]}>
            <Ionicons name="checkmark-circle" size={24} color={c.success} />
            <Text style={[styles.successText, { color: c.success }]}>
              {t("reset_link_sent")}
            </Text>
          </View>
        ) : (
          <>
            <TextInput
              style={[styles.input, { borderColor: c.border, backgroundColor: c.surface, color: c.text }]}
              placeholder={t("email")}
              placeholderTextColor={c.textPlaceholder}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />

            {error ? <Text style={[styles.errorText, { color: c.error }]}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: c.primary }, loading && { backgroundColor: c.disabled }]}
              onPress={handleSend}
              disabled={loading}
            >
              <Text style={styles.btnText}>
                {loading ? t("sending") : t("send_reset_link")}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    inner: { flex: 1, justifyContent: "center", paddingHorizontal: 28, gap: 12 },
    back: { flexDirection: "row", alignItems: "center", gap: 4, position: "absolute", top: 60, left: 28 },
    backText: { fontSize: 15, fontWeight: "600" },
    logoWrap: {
      width: 100, height: 100,
      alignSelf: "center", marginBottom: 4,
    },
    title: { fontSize: 28, fontWeight: "800", textAlign: "center" },
    subtitle: { fontSize: 15, textAlign: "center", marginBottom: 16, lineHeight: 22 },
    input: {
      borderWidth: 1, borderRadius: 14,
      paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
    },
    btn: { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8 },
    btnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
    errorText: { fontSize: 14, textAlign: "center" },
    successBox: {
      flexDirection: "row", alignItems: "center", gap: 10,
      borderRadius: 14, padding: 16,
    },
    successText: { fontSize: 15, fontWeight: "600", flex: 1 },
  });
}
