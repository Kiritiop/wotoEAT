import { TouchableOpacity, Text, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useAppStore } from "@/store/useAppStore";
import { useTheme } from "@/hooks/useTheme";

export function LanguageToggle() {
  const { language, setLanguage } = useAppStore();
  const c = useTheme();

  function toggle() {
    setLanguage(language === "en" ? "zh" : "en");
    Haptics.selectionAsync();
  }

  return (
    <TouchableOpacity
      onPress={toggle}
      style={[styles.btn, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Text style={[styles.text, { color: c.textMuted }]}>
        {language === "en" ? "中文" : "EN"}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  text: { fontSize: 13, fontWeight: "600" },
});
