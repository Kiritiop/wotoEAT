import { useState, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { translateToZh, getTranslatedSync } from "@/services/translate";

/**
 * Translates an array of strings to Chinese when language === "zh".
 *
 * - Applies persistent-cache results immediately (no flicker for repeat renders)
 * - Fetches missing translations from MyMemory API in the background
 * - Falls back silently to original text if translation fails
 */
export function useBatchTranslated(texts: string[]): string[] {
  const language = useAppStore((s) => s.language);
  const textsKey = texts.join("\x00");
  const [results, setResults] = useState<string[]>(texts);

  useEffect(() => {
    if (language !== "zh" || texts.length === 0) {
      setResults(texts);
      return;
    }

    // Apply whatever is in the session cache right away (avoids loading flash)
    setResults(texts.map(getTranslatedSync));

    let cancelled = false;
    translateToZh(texts).then((translated) => {
      if (!cancelled) setResults(translated);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textsKey, language]);

  return results;
}

/** Convenience wrapper for a single string. */
export function useTranslated(text: string): string {
  return useBatchTranslated([text])[0] ?? text;
}
