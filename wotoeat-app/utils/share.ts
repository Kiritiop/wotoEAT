import { Platform, Share } from "react-native";

export type ShareOutcome = "shared" | "copied" | "failed";

/**
 * Cross-platform text sharing. Native uses the OS share sheet. On web,
 * react-native-web's Share.share requires navigator.share, which desktop
 * browsers mostly lack — fall back to copying the text to the clipboard so
 * the button still does something useful ("copied" lets the caller toast).
 */
export async function shareText(message: string): Promise<ShareOutcome> {
  if (Platform.OS === "web") {
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.share) {
      try {
        await nav.share({ text: message });
        return "shared";
      } catch (e) {
        // User cancelled the sheet — not a failure, and nothing to copy.
        if ((e as Error)?.name === "AbortError") return "shared";
        // fall through to clipboard
      }
    }
    try {
      await nav?.clipboard?.writeText(message);
      return "copied";
    } catch {
      return "failed";
    }
  }
  try {
    await Share.share({ message });
    return "shared";
  } catch {
    return "failed";
  }
}
