import { useState, useMemo } from "react";
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

interface Props {
  visible: boolean;
  currentPantry: string[];
  onClose: () => void;
  onSave: (names: string[]) => void;
  language?: string;
}

interface Category {
  key: string;
  label: string;
  labelZh: string;
  items: string[];
  itemsZh: string[];
}

const CATEGORIES: Category[] = [
  {
    key: "meat",
    label: "Meat & Protein",
    labelZh: "肉类 & 蛋白质",
    items:   ["chicken", "beef", "pork", "lamb", "fish", "shrimp", "tofu", "eggs", "turkey", "duck", "salmon", "tuna", "crab", "bacon", "sausage", "ham", "ground beef", "chicken breast", "pork belly", "sardines"],
    itemsZh: ["鸡肉", "牛肉", "猪肉", "羊肉", "鱼", "虾", "豆腐", "鸡蛋", "火鸡", "鸭肉", "三文鱼", "金枪鱼", "螃蟹", "培根", "香肠", "火腿", "牛肉馅", "鸡胸肉", "五花肉", "沙丁鱼"],
  },
  {
    key: "veg",
    label: "Vegetables",
    labelZh: "蔬菜",
    items:   ["onion", "garlic", "tomato", "potato", "carrot", "broccoli", "spinach", "bell pepper", "mushroom", "cucumber", "zucchini", "eggplant", "celery", "corn", "cabbage", "lettuce", "kale", "green onion", "ginger", "leek"],
    itemsZh: ["洋葱", "大蒜", "番茄", "土豆", "胡萝卜", "西兰花", "菠菜", "彩椒", "蘑菇", "黄瓜", "西葫芦", "茄子", "芹菜", "玉米", "卷心菜", "生菜", "羽衣甘蓝", "葱", "生姜", "韭葱"],
  },
  {
    key: "grains",
    label: "Grains & Carbs",
    labelZh: "谷物 & 主食",
    items:   ["rice", "pasta", "bread", "noodles", "oats", "quinoa", "flour", "tortilla", "couscous", "barley", "panko", "cornstarch", "sourdough", "ramen", "soba", "udon", "rice noodles", "pita", "oat flour", "breadcrumbs"],
    itemsZh: ["米饭", "意面", "面包", "面条", "燕麦", "藜麦", "面粉", "玉米饼", "库斯库斯", "大麦", "面包糠", "玉米淀粉", "酸面包", "拉面", "荞麦面", "乌冬面", "米粉", "皮塔饼", "燕麦粉", "面包屑"],
  },
  {
    key: "dairy",
    label: "Dairy",
    labelZh: "乳制品",
    items:   ["milk", "butter", "cheese", "yogurt", "cream", "cream cheese", "sour cream", "mozzarella", "parmesan", "cheddar", "heavy cream", "condensed milk", "whipped cream", "gouda", "brie", "ricotta", "cottage cheese", "kefir", "ghee", "feta"],
    itemsZh: ["牛奶", "黄油", "奶酪", "酸奶", "奶油", "奶油奶酪", "酸奶油", "马苏里拉", "帕玛森", "切达奶酪", "淡奶油", "炼乳", "打发奶油", "高达奶酪", "布里奶酪", "瑞可塔", "农家奶酪", "开菲尔", "酥油", "菲达奶酪"],
  },
  {
    key: "condiments",
    label: "Condiments & Sauces",
    labelZh: "调味品 & 酱料",
    items:   ["soy sauce", "salt", "sugar", "pepper", "vinegar", "honey", "ketchup", "mustard", "mayo", "hot sauce", "fish sauce", "oyster sauce", "hoisin sauce", "sriracha", "Worcestershire sauce", "coconut milk", "tomato paste", "chicken stock", "baking soda", "baking powder"],
    itemsZh: ["生抽", "盐", "糖", "胡椒", "醋", "蜂蜜", "番茄酱", "芥末", "蛋黄酱", "辣椒酱", "鱼露", "蚝油", "海鲜酱", "是拉差辣酱", "伍斯特酱", "椰浆", "番茄膏", "鸡汤", "小苏打", "泡打粉"],
  },
  {
    key: "oils",
    label: "Cooking Oils",
    labelZh: "烹饪油",
    items:   ["olive oil", "vegetable oil", "sesame oil", "coconut oil", "canola oil", "sunflower oil", "avocado oil", "peanut oil", "corn oil", "grapeseed oil", "chili oil", "toasted sesame oil", "lard", "shortening", "ghee", "truffle oil", "walnut oil", "flaxseed oil", "garlic oil", "cooking spray"],
    itemsZh: ["橄榄油", "食用油", "芝麻油", "椰子油", "菜籽油", "葵花籽油", "牛油果油", "花生油", "玉米油", "葡萄籽油", "辣椒油", "熟芝麻油", "猪油", "起酥油", "酥油", "松露油", "核桃油", "亚麻籽油", "蒜油", "烹饪喷雾"],
  },
  {
    key: "fruits",
    label: "Fruits",
    labelZh: "水果",
    items:   ["apple", "banana", "lemon", "lime", "orange", "strawberry", "blueberry", "mango", "avocado", "grapes", "pineapple", "watermelon", "peach", "pear", "raspberry", "cherry", "kiwi", "pomelo", "papaya", "coconut"],
    itemsZh: ["苹果", "香蕉", "柠檬", "青柠", "橙子", "草莓", "蓝莓", "芒果", "牛油果", "葡萄", "菠萝", "西瓜", "桃子", "梨", "树莓", "樱桃", "猕猴桃", "柚子", "木瓜", "椰子"],
  },
  {
    key: "herbs",
    label: "Herbs & Spices",
    labelZh: "香料 & 调味",
    items:   ["basil", "cilantro", "parsley", "thyme", "rosemary", "cumin", "paprika", "chili powder", "turmeric", "oregano", "bay leaf", "coriander", "cinnamon", "cardamom", "cloves", "nutmeg", "star anise", "dill", "mint", "saffron"],
    itemsZh: ["罗勒", "香菜", "欧芹", "百里香", "迷迭香", "孜然", "红椒粉", "辣椒粉", "姜黄", "牛至", "月桂叶", "芫荽", "肉桂", "豆蔻", "丁香", "肉豆蔻", "八角", "莳萝", "薄荷", "藏红花"],
  },
  {
    key: "frozen",
    label: "Frozen & Canned",
    labelZh: "冷冻 & 罐装",
    items:   ["frozen peas", "frozen corn", "canned tomatoes", "canned beans", "canned tuna", "canned chickpeas", "frozen edamame", "canned lentils", "canned olives", "frozen spinach", "canned soup", "canned pumpkin", "frozen mixed veg", "canned corn", "frozen shrimp", "frozen fruit", "canned artichokes", "canned sardines", "canned crab", "canned coconut milk"],
    itemsZh: ["速冻豌豆", "速冻玉米", "番茄罐头", "豆类罐头", "金枪鱼罐头", "鹰嘴豆罐头", "速冻毛豆", "扁豆罐头", "橄榄罐头", "速冻菠菜", "汤罐头", "南瓜罐头", "速冻混合蔬菜", "玉米罐头", "速冻虾", "速冻水果", "洋蓟罐头", "沙丁鱼罐头", "蟹肉罐头", "椰浆罐头"],
  },
];

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
