/**
 * The one scaling rule both renderers (WebGL and the static SVG fallback)
 * share: uniform scale = cbrt(grams / 10g reference), clamped to a range
 * that keeps the bar legible. Cube root because mass is proportional to
 * VOLUME — a 20g bar is 2× the volume of a 10g bar, which is ~1.26× the
 * linear size, exactly like real metal.
 */
export const REF_GRAMS = 10;
export const SCALE_MIN = 0.45;
export const SCALE_MAX = 2.2;

export function massScale(gramsMg: string): number {
  const grams = Number(BigInt(gramsMg)) / 1000;
  if (!Number.isFinite(grams) || grams <= 0) return SCALE_MIN;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.cbrt(grams / REF_GRAMS)));
}
