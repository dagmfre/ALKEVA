/**
 * Translation coverage per shipped locale.
 *
 * `apps/web/src/i18n/request.ts` layers every locale over English, so a
 * missing key renders English instead of throwing MISSING_MESSAGE. That is the
 * right runtime behaviour and exactly why a gap can hide: the screen looks
 * fine. This report is the thing that does not let it hide.
 *
 * Exits non-zero when a locale is below the completeness floor, so it can gate
 * a release once every language is expected to be complete.
 *
 *   node scripts/i18n-report.mjs          # report
 *   node scripts/i18n-report.mjs --strict # fail under 100%
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MESSAGES = path.join(root, "apps", "web", "messages");
const REFERENCE = "en";
const strict = process.argv.includes("--strict");

/** Locale registry, read from source so this script cannot drift from the app. */
async function locales() {
  const src = await readFile(path.join(root, "packages", "shared", "src", "locales.ts"), "utf8");
  const match = src.match(/export const LOCALES = \[([^\]]+)\]/);
  if (!match) throw new Error("LOCALES not found in packages/shared/src/locales.ts");
  return [...match[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
}

function flatten(obj, prefix = "") {
  const out = new Map();
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of flatten(value, full)) out.set(k, v);
    } else {
      out.set(full, value);
    }
  }
  return out;
}

const load = async (code) =>
  flatten(JSON.parse(await readFile(path.join(MESSAGES, `${code}.json`), "utf8")));

const reference = await load(REFERENCE);
const codes = await locales();
let failed = false;

console.log(`reference: ${REFERENCE}.json — ${reference.size} keys\n`);

for (const code of codes) {
  if (code === REFERENCE) continue;

  let messages;
  try {
    messages = await load(code);
  } catch {
    console.log(`${code}  MISSING messages/${code}.json — every string falls back to English`);
    failed = true;
    continue;
  }

  const missing = [...reference.keys()].filter((k) => !messages.has(k));
  const untranslated = [...reference.keys()].filter(
    // Same string as English, and long enough that a genuine shared token
    // (ALKEVA, KYC, CSV, g) is not counted as a lazy copy.
    (k) => messages.get(k) === reference.get(k) && String(reference.get(k)).length > 8,
  );
  const extra = [...messages.keys()].filter((k) => !reference.has(k));
  const done = reference.size - missing.length;
  const pct = ((done / reference.size) * 100).toFixed(1);

  console.log(
    `${code}  ${pct}%  (${done}/${reference.size})` +
      (missing.length ? `  missing ${missing.length}` : "") +
      (untranslated.length ? `  same-as-English ${untranslated.length}` : "") +
      (extra.length ? `  unused ${extra.length}` : ""),
  );
  for (const key of missing.slice(0, 12)) console.log(`      missing: ${key}`);
  if (missing.length > 12) console.log(`      … and ${missing.length - 12} more`);
  for (const key of extra.slice(0, 12)) console.log(`      unused:  ${key}`);

  if (missing.length || extra.length) failed = true;
}

if (failed && strict) {
  console.error("\nTranslation gaps found (--strict).");
  process.exit(1);
}
console.log(failed ? "\nGaps above fall back to English at runtime." : "\nAll locales complete.");
