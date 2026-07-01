import { View, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, shadows } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

function TabIcon({ name, focused, color }: { name: IoniconName; focused: boolean; color: string }) {
  const c = useTheme();
  return (
    <View style={[styles.iconPill, focused && { backgroundColor: c.primaryLight }]}>
      <Ionicons
        name={focused ? name : (`${name}-outline` as IoniconName)}
        size={22}
        color={color}
      />
    </View>
  );
}

export default function TabsLayout() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTitleStyle: { fontWeight: "800", color: c.text, fontSize: 19 },
        headerShadowVisible: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textPlaceholder,
        tabBarStyle: {
          backgroundColor: c.tabBar,
          borderTopWidth: 0,
          paddingTop: 8,
          height: 66 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          ...shadows.float,
          shadowOffset: { width: 0, height: -4 },
        },
        tabBarItemStyle: { paddingTop: 2 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          headerShown: false,
          title: t("tab_today"),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="calendar" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pantry"
        options={{
          headerShown: false,
          title: t("tab_pantry"),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="nutrition" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          headerShown: false,
          title: t("tab_my_recipes"),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="heart" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          href: null,
          title: t("tab_history"),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          headerShown: false,
          title: t("tab_profile"),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="person" focused={focused} color={color} />
          ),
        }}
      />
      {/* Shopping is accessible via cart icon in Pantry — hidden from tab bar */}
      <Tabs.Screen
        name="shopping"
        options={{
          href: null,
          title: t("shopping_list"),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconPill: {
    width: 52,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
});
