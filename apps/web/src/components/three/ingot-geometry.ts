import * as THREE from "three";

/**
 * Classic trapezoid ingot: rectangular base, tapered top, flat shading.
 * Shared by the rotating ingot and the bar inside the gold box, so the bar a
 * user sees is the same object everywhere. Imported only from lazy scene
 * chunks — never from a module on the first-paint path.
 */
export function ingotGeometry(): THREE.BufferGeometry {
  // Base 2.4 × 1.2, top 1.9 × 0.85, height 0.7 — proportions of a cast bar.
  const bx = 1.2, bz = 0.6, tx = 0.95, tz = 0.425, h = 0.7;
  const base = [
    [-bx, 0, -bz], [bx, 0, -bz], [bx, 0, bz], [-bx, 0, bz],
  ] as const;
  const top = [
    [-tx, h, -tz], [tx, h, -tz], [tx, h, tz], [-tx, h, tz],
  ] as const;
  const quads: [number[], number[], number[], number[]][] = [
    [base[3] as never, base[2] as never, base[1] as never, base[0] as never], // bottom
    [top[0] as never, top[1] as never, top[2] as never, top[3] as never], // top
    [base[0] as never, base[1] as never, top[1] as never, top[0] as never], // back
    [base[2] as never, base[3] as never, top[3] as never, top[2] as never], // front
    [base[1] as never, base[2] as never, top[2] as never, top[1] as never], // right
    [base[3] as never, base[0] as never, top[0] as never, top[3] as never], // left
  ];
  const positions: number[] = [];
  for (const [a, b, c, d] of quads) {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  // Center vertically so rotation pivots through the bar's middle.
  geo.translate(0, -h / 2, 0);
  return geo;
}

/** Height of the ingot at scale 1 — callers seat it on a surface with this. */
export const INGOT_HEIGHT = 0.7;
