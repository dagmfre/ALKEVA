"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import { massScale } from "@/components/three/mass-scale";

/**
 * The actual WebGL scene — loaded ONLY through next/dynamic (ssr:false) from
 * `metal-mass.tsx`, so three.js lives in its own lazy chunk and never touches
 * first paint.
 *
 * Honesty rule (spec F13, client Q63): the rendered VOLUME is proportional to
 * the user's actual held grams — uniform scale = cbrt(grams / 10g reference),
 * because mass grows with volume, not with edge length. The synced gram label
 * is HTML rendered by the wrapper from the same PortfolioResponse value, so
 * the number and the mass cannot disagree.
 */

// With image-based lighting the surface reads from its reflections, so
// metalness goes to 1 and roughness drops — a cast bar is polished, not matte.
const GOLD = { color: "#d4a017", metalness: 1, roughness: 0.16 } as const;
const PLATINUM = { color: "#c9cdd6", metalness: 1, roughness: 0.2 } as const;

/**
 * Image-based lighting from three's bundled RoomEnvironment (a procedural
 * scene rendered to a PMREM once) — this is what makes metal look like metal:
 * every facet picks up a different window/panel reflection as the bar turns.
 * No HDR download, no external request — CSP-safe and offline-safe, same as
 * the old hand-rolled rig, which stays underneath for base fill.
 */
function StudioEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envScene = new RoomEnvironment();
    const target = pmrem.fromScene(envScene, 0.04);
    scene.environment = target.texture;
    return () => {
      scene.environment = null;
      target.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return null;
}

/** Classic trapezoid ingot: rectangular base, tapered top, flat shading. */
function ingotGeometry(): THREE.BufferGeometry {
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

function Ingot({ asset, gramsMg }: { asset: "XAU" | "XPT"; gramsMg: string }) {
  const mesh = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => ingotGeometry(), []);
  const mat = asset === "XAU" ? GOLD : PLATINUM;
  const scale = massScale(gramsMg);

  // Slow turn + a barely-there float: enough life to read as an object in
  // space, never enough to read as celebration (the antipatterns line).
  useFrame((state, delta) => {
    if (!mesh.current) return;
    mesh.current.rotation.y += delta * 0.35;
    mesh.current.position.y = Math.sin(state.clock.elapsedTime * 0.9) * 0.05;
  });

  return (
    <mesh ref={mesh} geometry={geometry} scale={scale} rotation={[0.32, 0, 0]}>
      <meshStandardMaterial
        color={mat.color}
        metalness={mat.metalness}
        roughness={mat.roughness}
        envMapIntensity={1.15}
        flatShading
      />
    </mesh>
  );
}

export default function MetalMassScene({
  asset,
  gramsMg,
}: {
  asset: "XAU" | "XPT";
  gramsMg: string;
}) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 0.9, 4.4], fov: 38 }}
      style={{ background: "transparent" }}
    >
      <StudioEnvironment />
      {/* Direct lights ride on top of the environment: a warm key for the
          specular hot-spot and a rim so the silhouette never melts into the
          charcoal card behind it. */}
      <directionalLight position={[3, 4, 5]} intensity={1.4} color="#fff3d6" />
      <directionalLight position={[0, 3, -5]} intensity={1.1} color="#ffffff" />
      <Ingot asset={asset} gramsMg={gramsMg} />
    </Canvas>
  );
}
