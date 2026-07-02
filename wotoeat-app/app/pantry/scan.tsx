/**
 * Scan Receipt screen — photograph a grocery receipt, review the extracted
 * food items, and merge them into the pantry. Accessible from the Pantry tab.
 *
 * Names are stored canonical English (same convention as tags) and displayed
 * per-language; user-edited text is stored literally. Merge never removes:
 * checked matched rows COMBINE with the existing entry, edited matched rows
 * RENAME it, everything else ADDs (see computeScanMerge). Quantities are
 * display-only context — the pantry stores names only.
 */
import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useAppStore } from "@/store/useAppStore";
import { scanReceipt, replacePantry } from "@/services/api";
import type { ScannedItem } from "@/services/api";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Button } from "@/components/ui/Button";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import { usePantryDisplay } from "@/hooks/useDynamicTranslation";

type Phase = "pick" | "processing" | "review" | "saving";

interface ReviewRow {
  key: string;
  name: string; // canonical English until edited; the user's literal text after
  nameZh: string | null; // display-only
  edited: boolean;
  rawText: string;
  quantity: string | null; // display-only, never persisted
  matchesPantry: string | null;
  isFood: boolean;
  checked: boolean;
}

const MAX_EDGE = 1600;

const ci = (s: string) => s.trim().toLowerCase();

interface MergeRow {
  name: string;
  matchesPantry: string | null;
  edited: boolean;
  checked: boolean;
}

/**
 * Merge checked scan rows into the existing pantry. Never removes entries.
 * - unedited row that semantically matched an existing entry → skip (combine)
 * - edited row whose name ci-equals an existing entry → skip (combine)
 * - edited row that semantically matched → RENAME the existing entry
 * - otherwise → ADD, ci-deduped
 * Renames run before adds against a live ci-name set, so the payload can never
 * contain duplicates (replacePantry bulk-inserts under UNIQUE(user_id, name)).
 */
export function computeScanMerge(
  pantry: { name: string; category?: string }[],
  rows: MergeRow[],
): { merged: { name: string; category?: string }[]; added: number; renamed: number } {
  // Copy category overrides through — replacePantry persists them, so dropping
  // the field here would wipe the user's custom categories on every scan merge.
  const merged = pantry.map((p) => (p.category ? { name: p.name, category: p.category } : { name: p.name }));
  const namesCi = new Set(merged.map((e) => ci(e.name)));
  const actionable = rows.filter((r) => r.checked && r.name.trim().length > 0);
  let added = 0;
  let renamed = 0;

  for (const r of actionable) {
    if (!(r.edited && r.matchesPantry)) continue;
    const target = r.name.trim();
    if (namesCi.has(ci(target))) continue; // collision → combine instead
    const idx = merged.findIndex((e) => e.name === r.matchesPantry);
    if (idx === -1) continue; // source already renamed by an earlier row
    namesCi.delete(ci(merged[idx].name));
    // A rename is the same physical item — keep its category override.
    merged[idx] = merged[idx].category ? { name: target, category: merged[idx].category } : { name: target };
    namesCi.add(ci(target));
    renamed++;
  }

  for (const r of actionable) {
    if (!r.edited && r.matchesPantry) continue; // combine with existing entry
    const name = r.name.trim();
    if (namesCi.has(ci(name))) continue; // covers pass-1 targets + intra-scan dupes
    namesCi.add(ci(name));
    merged.push({ name });
    added++;
  }
  return { merged, added, renamed };
}

export default function ScanReceiptScreen() {
  const c = useTheme();
  const { t, strings, language } = useTranslation();
  const router = useRouter();
  const { pantry, setPantry } = useAppStore();

  const [phase, setPhase] = useState<Phase>("pick");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // badgeMatch: which existing pantry entry this row will combine into / rename.
  // For edited rows the exact ci match is re-derived live; the server's
  // semantic match is kept as fallback so a pending rename stays visible.
  const rowsResolved = useMemo(
    () =>
      rows.map((r) => {
        const exact = pantry.find((p) => ci(p.name) === ci(r.name))?.name ?? null;
        const badgeMatch = r.edited ? (exact ?? r.matchesPantry) : r.matchesPantry;
        return { ...r, badgeMatch };
      }),
    [rows, pantry],
  );
  const badgeDisplayNames = usePantryDisplay(rowsResolved.map((r) => r.badgeMatch ?? ""));

  function mapScanError(err: unknown): string {
     
    const e = err as any;
    const status = e?.response?.status;
    const detail: string = e?.response?.data?.detail ?? "";
    if (status === 429) return t("scan_rate_limited");
    if (status === 422) {
      if (detail === "no_receipt" || detail === "unreadable_receipt") return t("scan_err_no_receipt");
      if (detail === "no_food_items") return t("scan_err_no_food");
      if (detail) return detail;
    }
    if (status === 503 && detail) return detail;
    return t("scan_err_generic");
  }

  async function pickImage(fromCamera: boolean) {
    setError(null);
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError(t("scan_camera_denied"));
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        quality: 1,
        exif: false,
      };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.length) return;
      await processAsset(result.assets[0]);
    } catch {
      setPhase("pick");
      setError(t("scan_err_generic"));
    }
  }

  async function processAsset(asset: ImagePicker.ImagePickerAsset) {
    setPhase("processing");
    try {
      // Resize + re-encode to JPEG: converts HEIC, bakes EXIF rotation into
      // pixels, strips GPS metadata, and keeps us far under Groq's 4MB cap.
      const ctx = ImageManipulator.manipulate(asset.uri);
      const longest = Math.max(asset.width ?? 0, asset.height ?? 0);
      if (longest > MAX_EDGE) {
        const portrait = (asset.height ?? 0) >= (asset.width ?? 0);
        ctx.resize(portrait ? { height: MAX_EDGE } : { width: MAX_EDGE });
      }
      const rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.7,
        base64: true,
      });
      let b64 = saved.base64 ?? "";
      // Web returns data URLs; the backend strips this too (defense-in-depth).
      if (b64.startsWith("data:")) b64 = b64.slice(b64.indexOf(",") + 1);
      if (!b64) throw new Error("encode-failed");

      const items = await scanReceipt(b64, language);
      if (!items.length) {
        setPhase("pick");
        setError(t("scan_err_no_food"));
        return;
      }
      const score = (i: ScannedItem) => (!i.is_food ? 2 : i.matches_pantry ? 1 : 0);
      const sorted = [...items].sort((a, b) => score(a) - score(b));
      setRows(
        sorted.map((i, idx) => ({
          key: String(idx),
          name: i.name,
          nameZh: i.name_zh ?? null,
          edited: false,
          rawText: i.raw_text,
          quantity: i.quantity ?? null,
          matchesPantry: i.matches_pantry ?? null,
          isFood: i.is_food,
          checked: i.is_food && !i.matches_pantry,
        })),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase("review");
    } catch (err: unknown) {
      setPhase("pick");
      setError(mapScanError(err));
    }
  }

  function toggleRow(key: string) {
    Haptics.selectionAsync();
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, checked: !r.checked } : r)));
  }

  function renameRow(key: string, name: string) {
    // No trim/transform here — it would break IME (pinyin) composition.
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, name, edited: true } : r)));
  }

  async function handleConfirm() {
    setError(null);
    setPhase("saving");
    const { merged } = computeScanMerge(pantry, rows);
    try {
      await replacePantry(merged);
      setPantry(merged);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: unknown) {
      // Stay on review with row state intact — silently dropping the scan
      // would discard the user's corrections.
      setPhase("review");
      setError(mapScanError(err));
    }
  }

  const foodCount = rowsResolved.filter((r) => r.isFood).length;
  const matchedCount = rowsResolved.filter((r) => r.isFood && r.badgeMatch).length;
  const nonFoodCount = rowsResolved.length - foodCount;
  const checkedCount = rowsResolved.filter((r) => r.checked && r.name.trim()).length;
  const breakdown = strings.scan_breakdown(matchedCount, nonFoodCount);

  const styles = useMemo(() => makeStyles(c), [c]);

  if (phase === "processing") {
    return (
      <View style={[styles.centerFill, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={[styles.processingTitle, { color: c.text }]}>{t("scan_processing")}</Text>
        <Text style={[styles.processingHint, { color: c.textMuted }]}>{t("scan_processing_hint")}</Text>
      </View>
    );
  }

  if (phase === "pick") {
    return (
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <Text style={[styles.intro, { color: c.textMuted }]}>{t("scan_intro")}</Text>
        <ErrorBanner message={error} style={{ marginBottom: 12 }} />
        {Platform.OS !== "web" && (
          <TouchableOpacity
            style={[styles.bigBtn, { backgroundColor: c.primary }]}
            onPress={() => pickImage(true)}
          >
            <Ionicons name="camera-outline" size={22} color="#FFF" />
            <Text style={styles.bigBtnText}>{t("scan_take_photo")}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.bigBtnOutline, { borderColor: c.primary }]}
          onPress={() => pickImage(false)}
        >
          <Ionicons name="images-outline" size={22} color={c.primary} />
          <Text style={[styles.bigBtnOutlineText, { color: c.primary }]}>{t("scan_pick_photo")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // review / saving
  return (
    <View style={[styles.reviewContainer, { backgroundColor: c.bg }]}>
      <FlatList
        data={rowsResolved}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <View style={styles.reviewHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.foundTitle, { color: c.text }]}>{strings.scan_found(foodCount)}</Text>
                {breakdown.length > 0 && (
                  <Text style={[styles.breakdown, { color: c.textMuted }]}>{breakdown}</Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => { setRows([]); setError(null); setPhase("pick"); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.rescan, { color: c.primary }]}>{t("scan_rescan")}</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.editHint, { color: c.textPlaceholder }]}>{t("scan_edit_hint")}</Text>
            <ErrorBanner message={error} style={{ marginBottom: 10 }} />
          </View>
        }
        renderItem={({ item, index }) => {
          const displayName = item.edited
            ? item.name
            : language === "zh" && item.nameZh
              ? item.nameZh
              : item.name;
          const badgeName = badgeDisplayNames[index];
          return (
            <View style={[styles.row, { backgroundColor: c.surface, shadowColor: c.shadow }]}>
              <TouchableOpacity
                onPress={() => toggleRow(item.key)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={item.checked ? "checkbox" : "square-outline"}
                  size={22}
                  color={item.checked ? c.primary : c.textPlaceholder}
                />
              </TouchableOpacity>
              <View style={styles.rowBody}>
                <View style={styles.nameRow}>
                  <TextInput
                    style={[styles.nameInput, { color: c.text }]}
                    value={displayName}
                    onChangeText={(v) => renameRow(item.key, v)}
                    placeholder={t("ingredient_name")}
                    placeholderTextColor={c.textPlaceholder}
                  />
                  <Ionicons name="create-outline" size={15} color={c.textPlaceholder} />
                </View>
                <Text style={[styles.rawText, { color: c.textPlaceholder }]} numberOfLines={1}>
                  {item.rawText}
                  {item.quantity ? ` · ${item.quantity}` : ""}
                </Text>
                {item.badgeMatch ? (
                  <View style={[styles.badge, { backgroundColor: c.primaryLight }]}>
                    <Ionicons name="checkmark-circle-outline" size={12} color={c.primaryText} />
                    <Text style={[styles.badgeText, { color: c.primaryText }]}>
                      {t("scan_already_have")}
                      {badgeName && badgeName !== displayName ? ` · ${badgeName}` : ""}
                    </Text>
                  </View>
                ) : !item.isFood ? (
                  <View style={[styles.badge, { backgroundColor: c.chipBg }]}>
                    <Text style={[styles.badgeText, { color: c.chipText }]}>{t("scan_not_food")}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
      />
      <View style={[styles.bottomBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        {checkedCount === 0 && (
          <Text style={[styles.noChecked, { color: c.textPlaceholder }]}>{t("scan_no_items_checked")}</Text>
        )}
        <Button
          icon="basket-outline"
          label={strings.scan_add_items(checkedCount)}
          onPress={handleConfirm}
          loading={phase === "saving"}
          disabled={checkedCount === 0}
        />
      </View>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1, padding: 16 },
    centerFill: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
    processingTitle: { fontSize: 17, fontWeight: "700", marginTop: 8 },
    processingHint: { fontSize: 13 },
    intro: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
    bigBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      borderRadius: 16, paddingVertical: 16, gap: 8, marginBottom: 12,
    },
    bigBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
    bigBtnOutline: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      borderRadius: 16, paddingVertical: 16, gap: 8, borderWidth: 1.5,
    },
    bigBtnOutlineText: { fontSize: 15, fontWeight: "700" },
    // Review
    reviewContainer: { flex: 1 },
    listContent: { padding: 16, paddingBottom: 24 },
    reviewHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
    foundTitle: { fontSize: 18, fontWeight: "800" },
    breakdown: { fontSize: 13, fontWeight: "500", marginTop: 2 },
    rescan: { fontSize: 14, fontWeight: "700" },
    editHint: { fontSize: 12, marginBottom: 12 },
    row: {
      flexDirection: "row", alignItems: "flex-start", gap: 12,
      borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
      shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 1,
    },
    rowBody: { flex: 1 },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    nameInput: { flex: 1, fontSize: 15, fontWeight: "600", paddingVertical: 0, textTransform: "capitalize" },
    rawText: { fontSize: 12, marginTop: 2 },
    badge: {
      flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
      borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginTop: 6,
    },
    badgeText: { fontSize: 11, fontWeight: "600" },
    bottomBar: {
      padding: 16, paddingBottom: 28,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    noChecked: { fontSize: 12, textAlign: "center", marginBottom: 8 },
    confirmBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      borderRadius: 16, paddingVertical: 15, gap: 8,
    },
    confirmBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  });
}
