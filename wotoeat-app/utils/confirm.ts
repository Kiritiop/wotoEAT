import { Alert, Platform } from "react-native";

/**
 * Cross-platform confirmation for destructive or irreversible actions.
 * RN's Alert.alert is a no-op on react-native-web, so web falls back to
 * window.confirm (which only shows `message`, not `title`).
 */
export function confirmAction(opts: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(opts.message)) opts.onConfirm();
    return;
  }
  Alert.alert(opts.title, opts.message, [
    { text: opts.cancelLabel, style: "cancel" },
    {
      text: opts.confirmLabel,
      style: opts.destructive ? "destructive" : "default",
      onPress: opts.onConfirm,
    },
  ]);
}
