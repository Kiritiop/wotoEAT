import { useState, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { translateBatch } from "@/services/api";

// Module-level cache — persists for the app session, avoids re-calling the backend
// for the same string after the first translation.
const translationCache = new Map<string, string>();

function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

/**
 * Translates an array of strings to Chinese via the backend's /translate endpoint
 * (which calls the local mealmind-translator Ollama model).
 *
 * - Only fires when language === "zh"
 * - Skips strings that already contain Chinese characters
 * - Returns cached results instantly on subsequent renders
 * - Falls back silently to original text if the backend is unreachable
 */
export function useBatchTranslated(texts: string[]): string[] {
  const { language } = useAppStore();
  // Stable key so the effect only re-runs when content actually changes
  const textsKey = texts.join("\x00");

  const [results, setResults] = useState<string[]>(texts);

  useEffect(() => {
    if (language !== "zh" || texts.length === 0) {
      setResults(texts);
      return;
    }

    // Apply whatever is cached immediately (no flicker for repeat renders)
    const withCache = texts.map((t) =>
      containsChinese(t) ? t : (translationCache.get(t) ?? t)
    );
    setResults(withCache);

    const needed = texts.filter((t) => !containsChinese(t) && !translationCache.has(t));
    if (needed.length === 0) return;

    let cancelled = false;
    translateBatch(needed).then((translated) => {
      if (cancelled) return;
      needed.forEach((orig, i) => translationCache.set(orig, translated[i] ?? orig));
      setResults(texts.map((t) =>
        containsChinese(t) ? t : (translationCache.get(t) ?? t)
      ));
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
