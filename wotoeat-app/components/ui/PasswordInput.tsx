import { useState } from "react";
import { View, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import type { StyleProp, TextStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  style?: StyleProp<TextStyle>;
  textContentType?: "password" | "newPassword";
  onSubmitEditing?: () => void;
  returnKeyType?: "done" | "next";
}

/**
 * Password field with a show/hide toggle. One component rather than five
 * copies of the eye icon, so the hit area and the label can't drift apart
 * across the sign-in, sign-up and reset screens.
 */
export function PasswordInput({
  value, onChangeText, placeholder, style,
  textContentType = "password", onSubmitEditing, returnKeyType,
}: Props) {
  const c = useTheme();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <TextInput
        style={[style, styles.input]}
        placeholder={placeholder}
        placeholderTextColor={c.textPlaceholder}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType={textContentType}
        accessibilityLabel={placeholder}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
      />
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setVisible((v) => !v)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={visible ? t("hide_password") : t("show_password")}
      >
        <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={19} color={c.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", justifyContent: "center" },
  input: { paddingRight: 46 },
  toggle: { position: "absolute", right: 12, padding: 4 },
});
