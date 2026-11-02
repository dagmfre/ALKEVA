// Verify WCAG contrast for every foreground/background pair the v2 UI uses,
// from the token values shipped in apps/web/src/app/globals.css (design v2
// layout, 2026-10-24, with the bright pre-v2 gold family restored 2026-11-01).
// Tinted surfaces (badges, selected chips, hairline fills, the text selection)
// are alpha-composited over their real panel in linear light before measuring.
//
//   node scripts/verify-contrast.mjs        → table + exit 1 on any failure

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromHex = (h) =>
  [0, 2, 4].map((i) => srgbToLinear(parseInt(h.replace("#", "").slice(i, i + 2), 16) / 255));
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** fg at `alpha` over an opaque bg, in linear space. */
const over = (fg, bg, alpha) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));

// Token hexes — keep in step with globals.css (each token's comment there).
const T = {
  "bg-deep": fromHex("#060607"),
  background: fromHex("#0b0b0c"),
  card: fromHex("#131314"),
  "panel-2": fromHex("#1a1a1c"),
  raised: fromHex("#242427"),
  foreground: fromHex("#f2f0ec"),
  muted: fromHex("#a6a39d"),
  subtle: fromHex("#918e88"),
  "gold-300": fromHex("#ffe45c"),
  "gold-400": fromHex("#ffd92e"),
  "gold-500": fromHex("#f5d21a"),
  "platinum-400": fromHex("#cdd2da"),
  gain: fromHex("#4cc777"),
  loss: fromHex("#f4737e"),
  "on-gold": fromHex("#0f0d08"),
  bone: fromHex("#ece9e4"),
  "on-bone": fromHex("#141210"),
  // --cta stops; 72% and 100% are the client's brand hexes.
  "cta-top": fromHex("#ffe45c"),
  "cta-40": fromHex("#f5d21a"),
  "cta-72": fromHex("#d4a017"),
  "cta-bottom": fromHex("#b8860b"),
  // --cta-hover's darkest stop.
  "cta-hover-bottom": fromHex("#c49213"),
};
const tint = (c, a, on = "card") => over(T[c], T[on], a);

// [label, fg, bg, minimum]
const pairs = [];
for (const surface of ["bg-deep", "background", "card", "panel-2", "raised"]) {
  pairs.push([`foreground on ${surface}`, T.foreground, T[surface], 4.5]);
  pairs.push([`muted on ${surface}`, T.muted, T[surface], 4.5]);
  pairs.push([`subtle on ${surface}`, T.subtle, T[surface], 4.5]);
}
for (const surface of ["background", "card", "panel-2"]) {
  pairs.push([`gold-300 text on ${surface}`, T["gold-300"], T[surface], 4.5]);
  pairs.push([`gold-400 text on ${surface}`, T["gold-400"], T[surface], 4.5]);
  pairs.push([`platinum-400 on ${surface}`, T["platinum-400"], T[surface], 4.5]);
  pairs.push([`gain on ${surface}`, T.gain, T[surface], 4.5]);
  pairs.push([`loss on ${surface}`, T.loss, T[surface], 4.5]);
}
pairs.push(
  ["on-gold ink on CTA top", T["on-gold"], T["cta-top"], 4.5],
  ["on-gold ink on CTA 40%", T["on-gold"], T["cta-40"], 4.5],
  ["on-gold ink on CTA 72% (#d4a017)", T["on-gold"], T["cta-72"], 4.5],
  ["on-gold ink on CTA bottom (#b8860b)", T["on-gold"], T["cta-bottom"], 4.5],
  ["on-gold ink on CTA hover bottom", T["on-gold"], T["cta-hover-bottom"], 4.5],
  ["on-gold ink on flat gold-500", T["on-gold"], T["gold-500"], 4.5],
  ["Sell: on-bone ink on bone", T["on-bone"], T.bone, 4.5],
  ["price tag: #141006 on gold-400", fromHex("#141006"), T["gold-400"], 4.5],
  ["price tag: #141006 on platinum-400", fromHex("#141006"), T["platinum-400"], 4.5],
  ["badge gold: gold-300 on gold-400/12 over card", T["gold-300"], tint("gold-400", 0.12), 4.5],
  ["badge gain: gain on gain/12 over card", T.gain, tint("gain", 0.12), 4.5],
  ["badge loss: loss on loss/8 over card", T.loss, tint("loss", 0.08), 4.5],
  ["badge platinum: platinum on platinum/12 over card", T["platinum-400"], tint("platinum-400", 0.12), 4.5],
  ["selected chip: gold-300 on gold-400/8 over card", T["gold-300"], tint("gold-400", 0.08), 4.5],
  ["seg thumb: foreground on raised", T.foreground, T.raised, 4.5],
  ["delta chip: loss on loss/8 over background", T.loss, tint("loss", 0.08, "background"), 4.5],
  ["banner caution: platinum on platinum/8 over background", T["platinum-400"], tint("platinum-400", 0.08, "background"), 4.5],
  ["text selection: foreground on gold-400/20 over background", T.foreground, tint("gold-400", 0.2, "background"), 4.5],
  ["text selection: foreground on gold-400/20 over card", T.foreground, tint("gold-400", 0.2, "card"), 4.5],
  // Non-text: hairlines are decorative separators, reported for reference only.
  ["hairline white/7 vs card (non-text, info)", tint("foreground", 0.07), T.card, 1],
  ["field border white/12 vs card (non-text, info)", tint("foreground", 0.12), T.card, 1],
  ["focus ring gold-500 vs panel-2 (non-text)", T["gold-500"], T["panel-2"], 3],
  // Banned on purpose — must stay under 4.5 so nobody "fixes" the rule away.
  // Measured on the darkest stop, the one most favourable to white.
  ["BANNED white text on CTA bottom (#b8860b)", fromHex("#ffffff"), T["cta-bottom"], 0],
  ["BANNED white text on flat gold-500", fromHex("#ffffff"), T["gold-500"], 0],
);

let failed = 0;
for (const [label, fg, bg, min] of pairs) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.toFixed(2).padStart(6)}:1  (min ${min})  ${label}`);
}
const white = ratio(fromHex("#ffffff"), T["cta-bottom"]);
if (white >= 4.5) {
  console.log("FAIL  white on gold now passes — revisit the dark-ink rule");
  failed++;
}
console.log(failed ? `\n${failed} failing pair(s)` : `\nAll ${pairs.length} pairs pass.`);
process.exit(failed ? 1 : 0);
