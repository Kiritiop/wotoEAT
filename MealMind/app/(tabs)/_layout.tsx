import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "@/store/useAppStore";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

function TabIcon({ name, focused, color }: { name: IoniconName; focused: boolean; color: string }) {
  return (
    <Ionicons
      name={focused ? name : (`${name}-outline` as IoniconName)}
      size={24}
      color={color}
    />
  );
}

export default function TabsLayout() {
  const c = useTheme();
  const { t } = useTranslation();
  const selectedRecipes = useAppStore((s) => s.selectedRecipes);
  const recipeCount = selectedRecipes.length;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTitleStyle: { fontWeight: "700", color: c.text },
        headerShadowVisible: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textPlaceholder,
        tabBarStyle: {
          backgroundColor: c.tabBar,
          borderTopWidth: 1,
          borderTopColor: c.tabBorder,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          title: t("tab_today"),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="calendar" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          title: t("tab_shopping"),
          tabBarBadge: recipeCount > 0 ? recipeCount : undefined,
          tabBarBadgeStyle: { backgroundColor: c.accent, color: "#FFF", fontSize: 10 },
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="cart" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pantry"
        options={{
          title: t("tab_pantry"),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="nutrition" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: t("tab_recipes"),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="book" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="eatout"
        options={{
          title: t("tab_eatout"),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="restaurant" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t("tab_history"),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="time" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tab_profile"),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="person" focused={focused} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
