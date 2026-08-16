// Verify the contrast ratios ALKEVA's design docs claim, from the OKLCH
// token values actually shipped in apps/web/src/app/globals.css.
// OKLCH -> OKLab -> linear sRGB -> gamma sRGB -> WCAG relative luminance.

function oklchToSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;

  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [r, g, bl].map((v) => Math.min(1, Math.max(0, v)));
}

// WCAG relative luminance works on LINEAR values, which is what we already have.
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const ratio = (c1, c2) => {
  const [a, b] = [lum(c1), lum(c2)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};
const hex = (rgb) =>
  "#" +
  rgb
    .map((v) => {
      const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, s)) * 255).toString(16).padStart(2, "0");
    })
    .join("");

// Alpha compositing in LINEAR space: fg (with alpha) over an opaque bg.
// Needed because --border/--input are now alpha-white hairlines.
const over = (fg, bg, alpha) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));

const T = {
  // Surface ladder v3 — Gauld charcoal (near-neutral, five levels, well sunk
  // below the page). Chroma ≤ 0.003; gold supplies all the warmth now.
  well:              oklchToSrgb(0.145, 0.002, 85),
  background:        oklchToSrgb(0.173, 0.002, 85),
  card:              oklchToSrgb(0.209, 0.003, 85),
  popover:           oklchToSrgb(0.244, 0.003, 85),
  control:           oklchToSrgb(0.264, 0.003, 85),
  foreground:        oklchToSrgb(0.961, 0, 0),
  "muted-foreground":oklchToSrgb(0.735, 0, 0),
  subtle:            oklchToSrgb(0.64,  0, 0),
  // Gauld luminous golds; 400 is gold-as-text, 500 is gold-as-fill.
  "gold-400":        oklchToSrgb(0.892, 0.173, 95.2),
  "gold-500":        oklchToSrgb(0.868, 0.175, 96.5),
  "gold-600":        oklchToSrgb(0.758, 0.155, 88.1),
  "gold-700":        oklchToSrgb(0.703, 0.144, 84.2),
  "primary-fg":      oklchToSrgb(0.16,  0.010, 84),
  "platinum-400":    oklchToSrgb(0.86,  0.018, 240),
  "platinum-500":    oklchToSrgb(0.79,  0.020, 242),
  gain:              oklchToSrgb(0.76,  0.115, 152),
  loss:              oklchToSrgb(0.70,  0.160, 25),
  "destructive-fg":  oklchToSrgb(0.16,  0.010, 25),
  // The four stops of the primary CTA gradient — dark ink must clear 4.5:1
  // at every one of them. 72%/100% remain the client's #d4a017 / #b8860b.
  "cta-top":         oklchToSrgb(0.917, 0.155, 98),
  "cta-upper":       oklchToSrgb(0.868, 0.175, 96.5),
  "cta-brand":       oklchToSrgb(0.735, 0.146, 84.3),
  "cta-deep":        oklchToSrgb(0.652, 0.132, 81.6),
  white:             [1, 1, 1],
};
// Alpha hairlines composited over the surfaces they actually sit on.
T["border-on-card"] = over(T.white, T.card, 0.08);
T["border-on-canvas"] = over(T.white, T.background, 0.08);
T["input-on-card"] = over(T.white, T.card, 0.16);

// [foreground, background, claimed ratio, WCAG minimum, label]
const CHECKS = [
  ["foreground",        "card",        null, 4.5, "body text on card"],
  ["foreground",        "background",  null, 4.5, "body text on canvas"],
  ["foreground",        "popover",     null, 4.5, "body text on raised surface"],
  ["foreground",        "well",        null, 4.5, "body text in a well"],
  ["muted-foreground",  "card",        null, 4.5, "labels on card"],
  ["muted-foreground",  "background",  null, 4.5, "labels on canvas"],
  ["muted-foreground",  "popover",     null, 4.5, "labels on raised surface"],
  ["muted-foreground",  "well",        null, 4.5, "labels in a well"],
  ["subtle",            "background",  null, 4.5, "timestamps on canvas"],
  ["subtle",            "card",        null, 4.5, "timestamps on card"],
  ["subtle",            "popover",     null, 4.5, "timestamps on raised surface"],
  ["foreground",        "control",     null, 4.5, "body text on control surface"],
  ["muted-foreground",  "control",     null, 4.5, "labels on control surface"],
  ["gold-400",          "card",        null, 4.5, "GOLD AS TEXT on card"],
  ["gold-400",          "background",  null, 4.5, "gold as text on canvas"],
  ["gold-400",          "well",        null, 4.5, "gold total inside the fee well"],
  ["gold-400",          "popover",     null, 4.5, "gold on the active nav pill"],
  ["gold-500",          "card",        null, 4.5, "luminous gold-500 as text on card"],
  ["primary-fg",        "gold-500",    null, 4.5, "dark ink on GOLD FILL"],
  ["primary-fg",        "gold-700",    null, 4.5, "dark ink on disabled CTA (gold-700)"],
  ["primary-fg",        "cta-top",     null, 4.5, "dark ink on CTA gradient · top stop"],
  ["primary-fg",        "cta-upper",   null, 4.5, "dark ink on CTA gradient · 40%"],
  ["primary-fg",        "cta-brand",   null, 4.5, "dark ink on CTA gradient · brand anchor"],
  ["primary-fg",        "cta-deep",    null, 4.5, "dark ink on CTA gradient · deep stop"],
  ["platinum-400",      "card",        null, 4.5, "platinum value / caution text"],
  ["platinum-400",      "popover",     null, 4.5, "caution banner text on popover"],
  ["gain",              "card",        null, 4.5, "gain on card"],
  ["loss",              "card",        null, 4.5, "loss on card"],
  ["destructive-fg",    "loss",        null, 4.5, "dark ink on destructive fill"],
];

// Non-text pairs: a hairline has no WCAG text minimum, but it has to be
// visible. Reported, never asserted.
const REPORT_ONLY = [
  ["border-on-card", "card", "hairline (8% white) on card"],
  ["border-on-canvas", "background", "hairline (8% white) on canvas"],
  ["input-on-card", "card", "raised border (16% white) on card"],
  ["well", "card", "well against its panel"],
  ["popover", "card", "raised against panel"],
  ["control", "popover", "control against raised surface"],
  ["gold-600", "popover", "pill-active gold rim on popover"],
];

console.log("token                sRGB");
for (const [k, v] of Object.entries(T)) console.log(`  ${k.padEnd(19)}${hex(v)}`);

console.log("\npair                                           measured  claimed  min   verdict");
let fails = 0;
for (const [fg, bg, claimed, min, label] of CHECKS) {
  const r = ratio(T[fg], T[bg]);
  const ok = r >= min;
  if (!ok) fails++;
  const claimStr = claimed === null ? "  —  " : `${claimed.toFixed(1)}:1`;
  const drift =
    claimed !== null && Math.abs(r - claimed) > 0.35 ? `  ⚠ claim off by ${(r - claimed).toFixed(2)}` : "";
  console.log(
    `  ${label.padEnd(42)} ${r.toFixed(2).padStart(5)}:1  ${claimStr}  ${min}   ${ok ? "PASS" : "FAIL"}${drift}`,
  );
}

console.log("\nnon-text (reported, not asserted)");
for (const [a, b, label] of REPORT_ONLY) {
  console.log(`  ${label.padEnd(42)} ${ratio(T[a], T[b]).toFixed(2).padStart(5)}:1`);
}

// The rule the docs state explicitly: white on gold must NOT be used.
const wog = ratio(T.white, T["gold-500"]);
console.log(
  `\n  white on gold-500 (BANNED, docs claim 2.4:1): ${wog.toFixed(2)}:1 -> ${wog < 4.5 ? "correctly banned" : "unexpectedly passes"}`,
);

console.log(fails === 0 ? "\nAll contrast checks PASS." : `\n${fails} contrast check(s) FAILED.`);
process.exit(fails === 0 ? 0 : 1);
