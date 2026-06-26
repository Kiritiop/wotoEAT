import { useState } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { PANTRY_CATEGORIES as CATEGORIES } from "@/constants/filters";

interface Props {
  visible: boolean;
  currentPantry: string[];
  onClose: () => void;
  onSave: (names: string[]) => void;
  language?: string;
}

export function PantryTagPicker({ visible, currentPantry, onClose, onSave, language = "en" }: Props) {
  const c = useTheme();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(currentPantry));
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [showCustomInput, setShowCustomInput] = useState<Record<string, boolean>>({});
  const [customItemsByCategory, setCustomItemsByCategory] = useState<Record<string, string[]>>({});
  const allCollapsed: Record<string, boolean> = Object.fromEntries(
    [...CATEGORIES.map((c) => [c.key, true]), ["__custom__", true]]
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(allCollapsed);

  // Reset selection to current pantry when modal opens
  const handleOpen = () => {
    setSelected(new Set(currentPantry));
    setCustomInputs({});
    setShowCustomInput({});
    setCustomItemsByCategory({});
    setCollapsed(allCollapsed);
  };

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    Haptics.selectionAsync();
  }

  function addCustom(catKey: string) {
    const val = (customInputs[catKey] ?? "").trim().toLowerCase();
    if (!val) return;
    setSelected((prev) => new Set([...prev, val]));
    setCustomItemsByCategory((prev) => ({ ...prev, [catKey]: [val, ...(prev[catKey] ?? [])] }));
    setCustomInputs((prev) => ({ ...prev, [catKey]: "" }));
    setShowCustomInput((prev) => ({ ...prev, [catKey]: false }));
    Haptics.selectionAsync();
  }

  function toggleCollapsed(key: string) {
    setCollapsed((p) => ({ ...p, [key]: !p[key] }));
    Haptics.selectionAsync();
  }

  const selectedCount = selected.size;
  const styles = makeStyles(c);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onShow={handleOpen} onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={c.textMuted} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: c.text }]}>
            {language === "zh" ? "选择食材" : "Select Ingredients"}
          </Text>
          <TouchableOpacity onPress={() => onSave([...selected])} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[styles.saveBtn, { color: c.primary }]}>
              {language === "zh" ? `保存 (${selectedCount})` : `Save (${selectedCount})`}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {CATEGORIES.map((cat) => {
            const isCollapsed = !!collapsed[cat.key];
            const totalItems = (customItemsByCategory[cat.key] ?? []).length + cat.items.length;
            return (
              <View key={cat.key} style={styles.category}>
                <TouchableOpacity style={styles.catHeader} onPress={() => toggleCollapsed(cat.key)} activeOpacity={0.7}>
                  <Text style={[styles.catLabel, { color: c.text }]}>
                    {language === "zh" ? cat.labelZh : cat.label}
                    <Text style={[styles.catCount, { color: c.textMuted }]}>{` (${totalItems})`}</Text>
                  </Text>
                  <Ionicons name={isCollapsed ? "chevron-forward" : "chevron-down"} size={16} color={c.textMuted} />
                </TouchableOpacity>

                {!isCollapsed && (
                  <View style={styles.tagRowWrap}>
                    {/* Custom item input toggle */}
                    {showCustomInput[cat.key] ? (
                      <View style={[styles.customInputRow, { backgroundColor: c.inputBg, borderColor: c.border }]}>
                        <TextInput
                          style={[styles.customInput, { color: c.text }]}
                          placeholder={language === "zh" ? "自定义…" : "Custom…"}
                          placeholderTextColor={c.textPlaceholder}
                          value={customInputs[cat.key] ?? ""}
                          onChangeText={(v) => setCustomInputs((p) => ({ ...p, [cat.key]: v }))}
                          onSubmitEditing={() => addCustom(cat.key)}
                          autoFocus
                          returnKeyType="done"
                        />
                        <TouchableOpacity onPress={() => addCustom(cat.key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="checkmark-circle" size={20} color={c.primary} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.tag, { backgroundColor: c.surfaceAlt, borderColor: c.border, borderStyle: "dashed" }]}
                        onPress={() => { setShowCustomInput((p) => ({ ...p, [cat.key]: true })); Haptics.selectionAsync(); }}
                      >
                        <Ionicons name="add" size={13} color={c.textMuted} />
                        <Text style={[styles.tagText, { color: c.textMuted }]}>
                          {language === "zh" ? "自定义" : "Custom"}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {(customItemsByCategory[cat.key] ?? []).map((item) => {
                      const active = selected.has(item);
                      return (
                        <TouchableOpacity
                          key={`custom-${item}`}
                          style={[styles.tag, { backgroundColor: active ? c.primary : c.chipBg, borderColor: active ? c.primary : c.border }]}
                          onPress={() => toggle(item)}
                          activeOpacity={0.7}
                        >
                          {active && <Ionicons name="checkmark" size={12} color="#FFF" />}
                          <Text style={[styles.tagText, { color: active ? "#FFF" : c.chipText }]}>{item}</Text>
                        </TouchableOpacity>
                      );
                    })}

                    {cat.items.map((item, idx) => {
                      const active = selected.has(item);
                      const label = language === "zh" ? (cat.itemsZh[idx] ?? item) : item;
                      return (
                        <TouchableOpacity
                          key={item}
                          style={[styles.tag, { backgroundColor: active ? c.primary : c.chipBg, borderColor: active ? c.primary : c.border }]}
                          onPress={() => toggle(item)}
                          activeOpacity={0.7}
                        >
                          {active && <Ionicons name="checkmark" size={12} color="#FFF" />}
                          <Text style={[styles.tagText, { color: active ? "#FFF" : c.chipText }]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}

          {/* Custom-added items not in any category */}
          {(() => {
            const allDefault = new Set(CATEGORIES.flatMap((c) => c.items));
            const sessionCustom = new Set(Object.values(customItemsByCategory).flat());
            const extras = [...selected].filter((s) => !allDefault.has(s) && !sessionCustom.has(s));
            if (extras.length === 0) return null;
            const isCollapsed = !!collapsed["__custom__"];
            return (
              <View style={styles.category}>
                <TouchableOpacity style={styles.catHeader} onPress={() => toggleCollapsed("__custom__")} activeOpacity={0.7}>
                  <Text style={[styles.catLabel, { color: c.text }]}>
                    {language === "zh" ? "我的自定义" : "My Custom Items"}
                    <Text style={[styles.catCount, { color: c.textMuted }]}>{` (${extras.length})`}</Text>
                  </Text>
                  <Ionicons name={isCollapsed ? "chevron-forward" : "chevron-down"} size={16} color={c.textMuted} />
                </TouchableOpacity>
                {!isCollapsed && (
                  <View style={styles.tagRowWrap}>
                    {extras.map((item) => (
                      <TouchableOpacity
                        key={item}
                        style={[styles.tag, { backgroundColor: c.primary, borderColor: c.primary }]}
                        onPress={() => toggle(item)}
                      >
                        <Ionicons name="checkmark" size={12} color="#FFF" />
                        <Text style={[styles.tagText, { color: "#FFF" }]}>{item}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })()}
        </ScrollView>

        {/* Sticky save bar */}
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.surface }]}>
            <TouchableOpacity
              style={[styles.footerBtn, { backgroundColor: c.primary }]}
              onPress={() => onSave([...selected])}
            >
              <Text style={styles.footerBtnText}>
                {language === "zh"
                  ? `保存 ${selectedCount} 种食材`
                  : `Save ${selectedCount} ingredient${selectedCount !== 1 ? "s" : ""}`}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1 },
    header: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: { fontSize: 17, fontWeight: "700" },
    saveBtn: { fontSize: 16, fontWeight: "700" },
    content: { padding: 16, paddingBottom: 100 },
    category: { marginBottom: 20 },
    catHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingVertical: 4, marginBottom: 10,
    },
    catLabel: { fontSize: 14, fontWeight: "700", flex: 1 },
    catCount: { fontSize: 13, fontWeight: "400" },
    tagRowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    tag: {
      flexDirection: "row", alignItems: "center", gap: 4,
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
    },
    tagText: { fontSize: 13, fontWeight: "500" },
    customInputRow: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, minWidth: 120,
    },
    customInput: { flex: 1, fontSize: 13, paddingVertical: 2 },
    footer: {
      paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth,
    },
    footerBtn: {
      borderRadius: 14, paddingVertical: 14, alignItems: "center",
    },
    footerBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  });
}
