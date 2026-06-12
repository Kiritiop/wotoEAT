import { useState, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { translateToZh, getTranslatedSync } from "@/services/translate";
import { TAG_ZH } from "@/constants/filters";

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

/**
 * Display form of pantry item names for the current language.
 *
 * Pantry names are STORED canonical English (same convention as tags);
 * this hook translates them at render time only.
 * - en: pass-through (legacy zh-stored names display as-is — no reverse map)
 * - zh: curated TAG_ZH hit (instant) → dynamic translation (cached) → raw
 */
export function usePantryDisplay(names: string[]): string[] {
  const language = useAppStore((s) => s.language);
  const curated = (n: string) => TAG_ZH[n.trim().toLowerCase()];
  const needsDynamic = language === "zh" ? names.filter((n) => !curated(n)) : [];
  const dynamic = useBatchTranslated(needsDynamic);
  if (language !== "zh") return names;
  // useBatchTranslated returns the previous results array for one frame after
  // its input changes — fall back to raw names until lengths align.
  const aligned = dynamic.length === needsDynamic.length ? dynamic : needsDynamic;
  const byName = new Map(needsDynamic.map((n, i) => [n, aligned[i] ?? n]));
  return names.map((n) => curated(n) ?? byName.get(n) ?? n);
}
