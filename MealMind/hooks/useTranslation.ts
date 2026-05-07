import { useAppStore } from "@/store/useAppStore";
import en from "@/locales/en";
import zh from "@/locales/zh";

type Strings = typeof en;
type StringKey = keyof Strings;

const locales: Record<string, Strings> = { en, zh };

/**
 * Returns a bound translation function `t(key)` for the user's current language.
 * Reactive — re-renders when language changes.
 */
export function useTranslation() {
  const language = useAppStore((s) => s.language);
  const strings: Strings = locales[language] ?? en;

  function t(key: StringKey): string {
    const val = strings[key];
    if (typeof val === "function") return (val as () => string)();
    return val as string;
  }

  return { t, language, strings };
}
