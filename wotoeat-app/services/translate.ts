/**
 * Translation service — EN → ZH (Simplified Chinese)
 *
 * Pipeline:
 *   1. In-memory cache (instant, no network)
 *   2. Persistent AsyncStorage cache (survives restarts)
 *   3. Google Translate unofficial endpoint (Google quality, no auth required)
 *   4. MyMemory free API (fallback when Google is unavailable)
 *   5. Silent fallback to original text
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_KEY = "mm_translations_v2";
const GOOGLE_URL = "https://translate.googleapis.com/translate_a/single";
const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_CONCURRENT = 3;
const MAX_CACHE_ENTRIES = 3_000;

const memCache = new Map<string, string>();
let hydrated = false;

export function hasChinese(s: string): boolean {
  return /[一-鿿]/.test(s);
}

/** Skip translation for trivial inputs: single chars, pure numbers/punctuation. */
function shouldSkip(text: string): boolean {
  const t = text.trim();
  return t.length <= 1 || /^[\d\s.,!?%:;()\-+*/=g]+$/i.test(t);
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
  } catch { /* storage unavailable — proceed without persistent cache */ }
}

function flushCache(): void {
  const entries = [...memCache.entries()];
  const trimmed = entries.length > MAX_CACHE_ENTRIES
    ? entries.slice(entries.length - MAX_CACHE_ENTRIES)
    : entries;
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify(trimmed)).catch(() => {});
}

async function fetchGoogle(text: string, signal: AbortSignal): Promise<string> {
  const url = `${GOOGLE_URL}?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
  const json = await res.json() as unknown[];
  const segments = (json[0] as unknown[][]) ?? [];
  const translated = segments.map((p) => ((p as string[])[0] ?? "")).join("").trim();
  if (!translated || !hasChinese(translated)) throw new Error("no Chinese chars in response");
  return translated;
}

async function fetchMyMemory(text: string, signal: AbortSignal): Promise<string> {
  const url = `${MYMEMORY_URL}?q=${encodeURIComponent(text)}&langpair=en|zh-CN`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const json = await res.json() as { responseData?: { translatedText?: string } };
  const translated = json?.responseData?.translatedText;
  if (!translated || !hasChinese(translated)) throw new Error("no Chinese chars in response");
  return translated;
}

async function fetchOneTranslation(text: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    try {
      // Google Translate first — significantly better quality for food/recipe content
      return await fetchGoogle(text, controller.signal);
    } catch {
      // Fall back to MyMemory if Google is unavailable or rate-limits
      return await fetchMyMemory(text, controller.signal);
    }
  } finally {
    clearTimeout(timer);
  }
}

// Share one request per string across concurrent callers — several meal cards
// mounting at once ask for overlapping tags/names, and without this each
// mount fired its own duplicate network request.
const inflight = new Map<string, Promise<string>>();

function fetchShared(text: string): Promise<string> {
  const existing = inflight.get(text);
  if (existing) return existing;
  const p = fetchOneTranslation(text).finally(() => inflight.delete(text));
  inflight.set(text, p);
  return p;
}

/**
 * Translates an array of English strings to Chinese (Simplified).
 * Returns cached values immediately; fetches and caches missing ones.
 */
export async function translateToZh(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];
  await hydrate();

  // De-duplicate: the same string often appears many times in one call
  // (e.g. a tag shared by every meal) — translate it once, not N times.
  const needed = [...new Set(
    texts.filter((t) => !hasChinese(t) && !shouldSkip(t) && !memCache.has(t))
  )];

  for (let i = 0; i < needed.length; i += MAX_CONCURRENT) {
    const batch = needed.slice(i, i + MAX_CONCURRENT);
    const settled = await Promise.allSettled(batch.map(fetchShared));
    let updated = false;
    settled.forEach((r, j) => {
      if (r.status === "fulfilled") {
        memCache.set(batch[j], r.value);
        updated = true;
      }
    });
    if (updated) flushCache();
  }

  return texts.map((t) => {
    if (hasChinese(t) || shouldSkip(t)) return t;
    return memCache.get(t) ?? t;
  });
}

/** Returns a cached translation synchronously, or the original string. */
export function getTranslatedSync(text: string): string {
  if (hasChinese(text) || shouldSkip(text)) return text;
  return memCache.get(text) ?? text;
}

/** Clears all cached translations from memory and storage. */
export function clearTranslationCache(): void {
  memCache.clear();
  hydrated = false;
  AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
}
