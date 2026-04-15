import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import type { PlanHistoryEntry } from "@/services/api";

interface Props {
  history: PlanHistoryEntry[];
  /** Target daily calories shown as a dotted line */
  targetCalories?: number;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

/**
 * A pure React Native bar chart showing daily calorie intake for the past week.
 * No external chart libraries required.
 */
export function WeeklyCalChart({ history, targetCalories }: Props) {
  const c = useTheme();

  if (!history || history.length === 0) return null;

  const sorted = [...history].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const maxCal = Math.max(...sorted.map((h) => h.total_calories), targetCalories ?? 0, 1);
  const BAR_MAX_H = 80;

  return (
    <View style={[styles.container, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={[styles.title, { color: c.text }]}>Weekly Calories</Text>

      {/* Target line label */}
      {targetCalories != null && (
        <Text style={[styles.targetLabel, { color: c.textMuted }]}>
          Target: {targetCalories} kcal
        </Text>
      )}

      <View style={styles.chartArea}>
        {/* Target dashed line */}
        {targetCalories != null && (
          <View
            style={[
              styles.targetLine,
              {
                bottom: (targetCalories / maxCal) * BAR_MAX_H,
                borderColor: c.primary,
              },
            ]}
          />
        )}

        {sorted.map((entry) => {
          const barH = Math.max(4, (entry.total_calories / maxCal) * BAR_MAX_H);
          const isToday =
            entry.date === new Date().toISOString().split("T")[0];

          return (
            <View key={entry.date} style={styles.barCol}>
              <Text style={[styles.calLabel, { color: c.textMuted }]}>
                {entry.total_calories > 0
                  ? `${Math.round(entry.total_calories / 100) / 10}k`
                  : ""}
              </Text>
              <View
                style={[
                  styles.bar,
                  {
                    height: barH,
                    backgroundColor: isToday ? c.primary : c.primaryLight,
                  },
                ]}
              />
              <Text
                style={[
                  styles.dayLabel,
                  {
                    color: isToday ? c.primary : c.textMuted,
                    fontWeight: isToday ? "700" : "400",
                  },
                ]}
              >
                {formatDate(entry.date)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  targetLabel: {
    fontSize: 11,
    marginBottom: 12,
  },
  chartArea: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 100,
    gap: 6,
    marginTop: 4,
    position: "relative",
  },
  targetLine: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: "dashed",
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  calLabel: {
    fontSize: 9,
    fontWeight: "600",
  },
  bar: {
    width: "80%",
    borderRadius: 4,
    minHeight: 4,
  },
  dayLabel: {
    fontSize: 10,
    textAlign: "center",
  },
});
