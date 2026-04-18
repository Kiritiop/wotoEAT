#!/usr/bin/env node
/**
 * MealMind Translation Utility — powered by a local Ollama model.
 *
 * The "mealmind-translator" model is a private, offline AI built from
 * qwen2.5:7b with MealMind's food/cooking vocabulary baked in via Modelfile.
 *
 * ── First-time setup ──────────────────────────────────────────────────────
 *   1. Install Ollama:  https://ollama.com
 *   2. Pull base model: ollama pull qwen2.5:7b
 *   3. Build local AI:  ollama create mealmind-translator -f scripts/Modelfile
 *   4. Start Ollama:    ollama serve   (runs on localhost:11434)
 *
 * ── Usage ─────────────────────────────────────────────────────────────────
 *   npm run translate "Add to pantry"
 *   npm run translate -- --key add_to_pantry "Add to pantry"
 *   npm run translate:audit          ← list zh.ts keys missing from en.ts
 *   npm run translate:fix            ← auto-translate and write missing keys
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.MEALMIND_MODEL ?? "mealmind-translator";

// ── Ollama call ───────────────────────────────────────────────────────────────

async function translate(enText, key = "") {
  const context = key ? `UI key: "${key}"\n` : "";
  const prompt = `${context}Translate this app string to Chinese:\n${enText}`;

  let response;
  try {
    response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch {
    throw new Error(
      `Cannot reach Ollama at ${OLLAMA_URL}.\n` +
      `Make sure Ollama is running: ollama serve`
    );
  }

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 404 && body.includes("model")) {
      throw new Error(
        `Model "${MODEL}" not found.\n` +
        `Build it first:\n` +
        `  ollama pull qwen2.5:7b\n` +
        `  ollama create mealmind-translator -f scripts/Modelfile`
      );
    }
    throw new Error(`Ollama error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return (data.message?.content ?? "").trim().replace(/^["'"'「」]|["'"'「」]$/g, "");
}

// ── Audit helpers ─────────────────────────────────────────────────────────────

function extractKeys(filePath) {
  const src = readFileSync(filePath, "utf8");
  const keys = new Set();
  for (const m of src.matchAll(/^\s{2}(\w+):/gm)) keys.add(m[1]);
  return keys;
}

function extractStringValues(filePath) {
  const src = readFileSync(filePath, "utf8");
  const values = {};
  for (const m of src.matchAll(/^\s{2}(\w+): "([^"]+)"/gm)) values[m[1]] = m[2];
  return values;
}

function findMissingKeys() {
  const enKeys = extractKeys(join(ROOT, "locales/en.ts"));
  const zhKeys = extractKeys(join(ROOT, "locales/zh.ts"));
  return [...enKeys].filter((k) => !zhKeys.has(k));
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--audit") || args.includes("--fix")) {
  const missing = findMissingKeys();

  if (missing.length === 0) {
    console.log("✅ All en.ts keys present in zh.ts — nothing to do.");
    process.exit(0);
  }

  console.log(`\n⚠️  ${missing.length} key(s) in en.ts missing from zh.ts:\n`);
  missing.forEach((k) => console.log(`  • ${k}`));

  if (args.includes("--fix")) {
    const enValues = extractStringValues(join(ROOT, "locales/en.ts"));
    const zhPath = join(ROOT, "locales/zh.ts");
    let zhSrc = readFileSync(zhPath, "utf8");

    console.log(`\n🤖 Translating with local model "${MODEL}"...\n`);

    for (const key of missing) {
      const enText = enValues[key];
      if (!enText) {
        console.log(`  ⏭  ${key} — skipped (function type, translate manually)`);
        continue;
      }
      try {
        const zh = await translate(enText, key);
        console.log(`  ✓  ${key}: "${enText}" → "${zh}"`);
        zhSrc = zhSrc.replace(/^} as const;/m, `  ${key}: "${zh}",\n} as const;`);
      } catch (e) {
        console.error(`  ✗  ${key}: ${e.message}`);
      }
    }

    writeFileSync(zhPath, zhSrc);
    console.log("\n✅ zh.ts updated. Review the new entries before committing.\n");
  }

} else {
  // Single translation mode
  let key = "";
  let text = "";

  const keyIdx = args.indexOf("--key");
  if (keyIdx !== -1) {
    key = args[keyIdx + 1] ?? "";
    text = args.filter((_, i) => i !== keyIdx && i !== keyIdx + 1).join(" ");
  } else {
    text = args.join(" ");
  }

  if (!text) {
    console.error("Usage:");
    console.error('  npm run translate "English text"');
    console.error('  npm run translate -- --key my_key "English text"');
    console.error("  npm run translate:audit");
    console.error("  npm run translate:fix");
    process.exit(1);
  }

  try {
    const result = await translate(text, key);
    if (key) {
      console.log(`  ${key}: "${result}",`);
    } else {
      console.log(result);
    }
  } catch (e) {
    console.error(`\nError: ${e.message}\n`);
    process.exit(1);
  }
}
