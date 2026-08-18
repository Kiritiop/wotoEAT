import { Alert, Platform } from "react-native";

interface ConfirmOptions {
  /** Native dialog title. Web's window.confirm has no title, so it shows only the message. */
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Red confirm button on native (sign out, clear the day's meals). */
  destructive?: boolean;
}

/**
 * Cross-platform confirmation for destructive actions.
 *
 * React Native's `Alert.alert` is a no-op on react-native-web, and this app
 * ships to Vercel, so every confirmation needs the `window.confirm` branch or
 * the action silently fires (or silently doesn't) in a browser. Three screens
 * had their own copy of this; they now share one (FIX-6).
 *
 * `onConfirm` runs only when the user confirms. Cancel does nothing.
 */
export function confirmAction(
  { title, message, confirmLabel, cancelLabel, destructive = false }: ConfirmOptions,
  onConfirm: () => void,
): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(message)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: "cancel" },
    { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: onConfirm },
  ]);
}
