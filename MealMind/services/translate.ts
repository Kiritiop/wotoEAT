/**
 * Translation service — EN → ZH (Simplified Chinese)
 *
 * Pipeline:
 *   1. In-memory cache (instant, resets on cold start)
 *   2. Persistent AsyncStorage cache (survives restarts)
 *   3. MyMemory free translation API (no auth, food terms translate well)
 *   4. Silent fallback to original text
 *
 * Replaces the previous Ollama-based backend translation which required
 * a locally running model and was unavailable in production.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_KEY = "mm_translations_v1";
const MYMEMORY_BASE = "https://api.mymemory.translated.net/get";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_CONCURRENT = 3;
const MAX_CACHE_ENTRIES = 3_000;

const memCache = new Map<string, string>();
let hydrated = false;

export function hasChinese(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s);
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const entries = JSON.parse(raw) as [string, string][];
      for (const [k, v] of entries) memCache.set(k, v);
    }
  } catch { /* storage unavailable, proceed without persistent cache */ }
}

function flushCache(): void {
  const entries = [...memCache.entries()];
  const trimmed = entries.length > MAX_CACHE_ENTRIES
    ? entries.slice(entries.length - MAX_CACHE_ENTRIES)
    : entries;
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify(trimmed)).catch(() => {});
}

async function fetchOneTranslation(text: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `${MYMEMORY_BASE}?q=${encodeURIComponent(text)}&langpair=en|zh-CN`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { responseData?: { translatedText?: string } };
    const translated = json?.responseData?.translatedText;
    // Validate: must contain Chinese characters to be a real zh-CN result
    if (!translated || !hasChinese(translated)) throw new Error("no chinese in response");
    return translated;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Translates an array of English strings to Chinese (Simplified).
 * Returns cached values immediately; fetches and caches missing ones.
 */
export async function translateToZh(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];
  await hydrate();

  const needed = texts.filter((t) => !hasChinese(t) && !memCache.has(t));

  for (let i = 0; i < needed.length; i += MAX_CONCURRENT) {
    const batch = needed.slice(i, i + MAX_CONCURRENT);
    const settled = await Promise.allSettled(batch.map(fetchOneTranslation));
    let updated = false;
    settled.forEach((r, j) => {
      if (r.status === "fulfilled") {
        memCache.set(batch[j], r.value);
        updated = true;
      }
    });
    if (updated) flushCache();
  }

  return texts.map((t) => hasChinese(t) ? t : (memCache.get(t) ?? t));
}

/** Returns a cached translation synchronously, or the original string. */
export function getTranslatedSync(text: string): string {
  if (hasChinese(text)) return text;
  return memCache.get(text) ?? text;
}

/** Clears all cached translations from memory and storage. */
export function clearTranslationCache(): void {
  memCache.clear();
  hydrated = false;
  AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
}
