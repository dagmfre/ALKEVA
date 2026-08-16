/**
 * Turns the client-supplied logo (design/logo.jpg) into the web assets the
 * dark UI needs: mark-only PNGs at three sizes, the full lockup, and the two
 * app icons.
 *
 * The source is actually a PNG that already carries an alpha channel (the
 * extension is wrong, sharp reads the real header), so the transparency is
 * taken as given. If the client ever re-sends a genuinely flat JPEG on white,
 * `cutBackground()` below rebuilds the alpha by flood-filling inward from the
 * border — a fill rather than a global brightness threshold, so the near-white
 * silver highlights INSIDE the knot are never eaten.
 *
 * The lockup is then trimmed to content and split into mark and wordmark on
 * the fully transparent row band between them, so the app can use the mark on
 * its own in the 26px header slot without shipping the wordmark pixels.
 *
 * Re-run with: node scripts/build-logo-assets.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "design", "logo.jpg");
const PUBLIC_BRAND = path.join(root, "apps", "web", "public", "brand");
const APP_DIR = path.join(root, "apps", "web", "src", "app");

/** Background test: bright AND neutral. Gold is bright but never neutral. */
const isBackground = (r, g, b) => {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min >= 232 && max - min <= 14;
};

async function loadRgba() {
  const meta = await sharp(SRC).metadata();
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  if (meta.hasAlpha) {
    const alpha = Buffer.alloc(width * height);
    for (let i = 0; i < width * height; i++) alpha[i] = data[i * 4 + 3];
    console.log("source carries alpha — using it as delivered");
    return { buffer: data, width, height, alpha };
  }
  console.log("source is opaque — rebuilding alpha by border flood fill");
  return cutBackground(data, info);
}

async function cutBackground(data, info) {
  const { width, height, channels } = info;
  const px = width * height;

  // Flood fill from every border pixel (4-connected, explicit stack — a
  // recursive fill blows the stack on a 600px image).
  const bg = new Uint8Array(px);
  const stack = [];
  const push = (i) => {
    if (bg[i]) return;
    const o = i * channels;
    if (!isBackground(data[o], data[o + 1], data[o + 2])) return;
    bg[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }

  const alpha = Buffer.alloc(px);
  for (let i = 0; i < px; i++) alpha[i] = bg[i] ? 0 : 255;

  // Sub-pixel feather: softens the cut edge without erasing thin strokes.
  const feathered = await sharp(alpha, { raw: { width, height, channels: 1 } })
    .blur(0.6)
    .raw()
    .toBuffer();

  const out = Buffer.alloc(px * 4);
  for (let i = 0; i < px; i++) {
    const o = i * channels;
    out[i * 4] = data[o];
    out[i * 4 + 1] = data[o + 1];
    out[i * 4 + 2] = data[o + 2];
    out[i * 4 + 3] = feathered[i];
  }
  return { buffer: out, width, height, alpha: feathered };
}

/** Rows that are entirely transparent — the gap between mark and wordmark. */
function rowBands(alpha, width, height) {
  const filled = [];
  for (let y = 0; y < height; y++) {
    let any = false;
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] > 8) {
        any = true;
        break;
      }
    }
    filled.push(any);
  }
  const bands = [];
  let start = null;
  for (let y = 0; y < height; y++) {
    if (filled[y] && start === null) start = y;
    if (!filled[y] && start !== null) {
      bands.push([start, y - 1]);
      start = null;
    }
  }
  if (start !== null) bands.push([start, height - 1]);
  return bands;
}

async function main() {
  await mkdir(PUBLIC_BRAND, { recursive: true });

  const { buffer, width, height, alpha } = await loadRgba();
  const raw = { raw: { width, height, channels: 4 } };
  const bands = rowBands(alpha, width, height);
  if (bands.length < 2) {
    throw new Error(
      `expected a mark band and a wordmark band, found ${bands.length} — check the source image`,
    );
  }
  const markBand = bands[0];
  const lastBand = bands[bands.length - 1];
  console.log(`source ${width}×${height}, bands: ${JSON.stringify(bands)}`);

  // Two passes: sharp resolves trim before a pipeline's extract, so cropping
  // and trimming in one chain throws "bad extract area". Crop first, encode,
  // then trim the encoded image.
  const cropBand = async ([top, bottom]) =>
    sharp(
      await sharp(buffer, raw)
        .extract({ left: 0, top, width, height: bottom - top + 1 })
        .png()
        .toBuffer(),
    )
      .trim({ threshold: 1 })
      .png()
      .toBuffer();

  const lockupCrop = await cropBand([markBand[0], lastBand[1]]);
  await writeFile(
    path.join(PUBLIC_BRAND, "lockup.png"),
    await sharp(lockupCrop)
      .resize({ width: 640, fit: "inside" })
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toBuffer(),
  );

  // Mark only — the band above the wordmark.
  const markCrop = await cropBand(markBand);
  const markSharp = () => sharp(markCrop);

  for (const size of [128, 256, 512]) {
    await writeFile(
      path.join(PUBLIC_BRAND, `mark-${size}.png`),
      await markSharp()
        .resize({ width: size, height: size, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9, palette: true, quality: 90 })
        .toBuffer(),
    );
  }

  // Favicon: transparent, so it sits on any browser chrome.
  await writeFile(
    path.join(APP_DIR, "icon.png"),
    await markSharp()
      .resize({ width: 512, height: 512, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toBuffer(),
  );

  // Apple touch icon: iOS composites onto white and squares the corners, so
  // it gets the app's own ground rather than a white halo around the mark.
  await writeFile(
    path.join(APP_DIR, "apple-icon.png"),
    await markSharp()
      .resize({ width: 152, height: 152, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({
        top: 14,
        bottom: 14,
        left: 14,
        right: 14,
        background: { r: 10, g: 10, b: 10, alpha: 1 },
      })
      .flatten({ background: { r: 10, g: 10, b: 10 } })
      .png({ compressionLevel: 9 })
      .toBuffer(),
  );

  console.log("✓ brand assets written to apps/web/public/brand + app icons");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
