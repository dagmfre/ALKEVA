"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { StudioEnvironment } from "@/components/three/studio-environment";
import { ingotGeometry } from "@/components/three/ingot-geometry";
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
const GOLD = { color: "#cfa264", metalness: 1, roughness: 0.16 } as const;
const PLATINUM = { color: "#c9cdd6", metalness: 1, roughness: 0.2 } as const;

function Ingot({ asset, gramsMg }: { asset: "XAU" | "XPT"; gramsMg: string }) {
  const mesh = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => ingotGeometry(), []);
  const mat = asset === "XAU" ? GOLD : PLATINUM;
  const scale = massScale(gramsMg);

  // Slow turn + a barely-there float: enough life to read as an object in
  // space, never enough to read as celebration.
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
