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

const T = {
  background:        oklchToSrgb(0.145, 0.004, 95),
  card:              oklchToSrgb(0.196, 0.004, 95),
  popover:           oklchToSrgb(0.238, 0.005, 95),
  foreground:        oklchToSrgb(0.968, 0.003, 95),
  "muted-foreground":oklchToSrgb(0.735, 0.008, 95),
  subtle:            oklchToSrgb(0.62,  0.008, 95),
  "gold-400":        oklchToSrgb(0.79,  0.142, 85),
  "gold-500":        oklchToSrgb(0.735, 0.146, 84.3),
  "primary-fg":      oklchToSrgb(0.16,  0.010, 84),
  "platinum-400":    oklchToSrgb(0.86,  0.018, 240),
  gain:              oklchToSrgb(0.76,  0.115, 152),
  loss:              oklchToSrgb(0.70,  0.160, 25),
  "destructive-fg":  oklchToSrgb(0.16,  0.010, 25),
  white:             [1, 1, 1],
};

// [foreground, background, claimed ratio, WCAG minimum, label]
const CHECKS = [
  ["foreground",        "card",        null, 4.5, "body text on card"],
  ["foreground",        "background",  null, 4.5, "body text on canvas"],
  ["muted-foreground",  "card",        7.8,  4.5, "labels on card  (design.md §1)"],
  ["muted-foreground",  "background",  null, 4.5, "labels on canvas"],
  ["subtle",            "background",  5.4,  4.5, "timestamps on canvas (design.md §1)"],
  ["subtle",            "card",        null, 4.5, "timestamps on card"],
  ["gold-400",          "card",        9.4,  4.5, "GOLD AS TEXT on card (design.md §1)"],
  ["gold-400",          "background",  null, 4.5, "gold as text on canvas"],
  ["primary-fg",        "gold-500",    8.2,  4.5, "dark ink on GOLD FILL (design.md §1)"],
  ["platinum-400",      "card",        null, 4.5, "platinum value / caution text"],
  ["platinum-400",      "popover",     null, 4.5, "caution banner text on popover"],
  ["gain",              "card",        8.9,  4.5, "gain on card (design.md §1)"],
  ["loss",              "card",        6.4,  4.5, "loss on card (design.md §1)"],
  ["destructive-fg",    "loss",        null, 4.5, "dark ink on destructive fill"],
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

// The rule the docs state explicitly: white on gold must NOT be used.
const wog = ratio(T.white, T["gold-500"]);
console.log(
  `\n  white on gold-500 (BANNED, docs claim 2.4:1): ${wog.toFixed(2)}:1 -> ${wog < 4.5 ? "correctly banned" : "unexpectedly passes"}`,
);

console.log(fails === 0 ? "\nAll contrast checks PASS." : `\n${fails} contrast check(s) FAILED.`);
process.exit(fails === 0 ? 0 : 1);
