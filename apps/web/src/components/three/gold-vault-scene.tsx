"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import { INGOT_HEIGHT, ingotGeometry } from "@/components/three/ingot-geometry";
import { massScale } from "@/components/three/mass-scale";
import { StudioEnvironment } from "@/components/three/studio-environment";

/**
 * The gold box — loaded ONLY through next/dynamic (ssr:false) from
 * `gold-vault.tsx`, so three.js stays in a lazy chunk.
 *
 * Built procedurally (no model download, no external request — same CSP /
 * offline stance as the ingot): a hollow lacquered-gold body on ball feet, a
 * hinged lid with a medallion, a front hasp, a velvet lining, and the user's
 * bar resting on the velvet.
 *
 * The opening is a staged sequence, driven by springs rather than tweens so a
 * click mid-animation reverses smoothly from wherever it is:
 *   open:  hasp swings out → lid springs back past 110° with a slight
 *          overshoot → the inner light comes up → the bar lifts and turns.
 *   close: the bar settles → lid falls shut with a small bounce → hasp returns.
 *
 * Honesty rule (spec F13) carries over: the bar's VOLUME ∝ the held grams,
 * via the same cube-root `massScale` as every other ingot, fitted to the box.
 * The number is HTML in the wrapper, from the same value — never drawn here.
 */

// ---- Dimensions (scene units) ---------------------------------------------
const W = 2.4; // body width (x)
const D = 1.6; // body depth (z)
const H = 0.95; // body height (y) — the hinge line sits on top of it
const T = 0.09; // wall thickness
const FLOOR_Y = 0.16; // top of the velvet bed
const LID_OPEN = -1.95; // ≈112°, past vertical so the lid rests back on its hinges
const BAR_FIT = 0.36; // massScale range [0.45, 2.2] → bar width ≈ 0.39 … 1.9 inside a 2.2 interior

// ---- Springs ---------------------------------------------------------------
type Spring = { x: number; v: number };

/**
 * Damped spring step; underdamped constants give the overshoot. Integrated in
 * fixed ≤1/120 s sub-steps, so the motion runs in real time and stays stable
 * at any frame rate — a slow GPU drops frames, not speed.
 */
function step(s: Spring, target: number, k: number, c: number, dt: number) {
  const n = Math.max(1, Math.ceil(dt * 120));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += ((target - s.x) * k - s.v * c) * h;
    s.x += s.v * h;
  }
}

// ---- Materials & geometry --------------------------------------------------
function useMaterials() {
  const mats = useMemo(
    () => ({
      // Lacquered body: metal under a thin clearcoat, so reflections double up
      // the way they do on a polished, varnished jewellery box.
      body: new THREE.MeshPhysicalMaterial({
        color: "#d2a668",
        metalness: 1,
        roughness: 0.32,
        clearcoat: 0.7,
        clearcoatRoughness: 0.1,
        envMapIntensity: 1.25,
      }),
      // Mirror-polished trim, rim, feet, hinges and medallion.
      trim: new THREE.MeshStandardMaterial({
        color: "#e6c28b",
        metalness: 1,
        roughness: 0.1,
        envMapIntensity: 1.4,
      }),
      // Oxblood velvet: sheen is what makes fabric read as fabric.
      velvet: new THREE.MeshPhysicalMaterial({
        color: "#2a060d",
        roughness: 0.92,
        metalness: 0,
        sheen: 1,
        sheenRoughness: 0.35,
        sheenColor: new THREE.Color("#9c3a4a"),
      }),
      keyhole: new THREE.MeshBasicMaterial({ color: "#0a0605" }),
      bar: new THREE.MeshStandardMaterial({
        color: "#dcb274",
        metalness: 1,
        roughness: 0.12,
        envMapIntensity: 1.5,
        flatShading: true,
      }),
    }),
    [],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  return mats;
}

function rounded(w: number, h: number, d: number, r: number, seg = 3) {
  return new RoundedBoxGeometry(w, h, d, seg, r);
}

function useGeometries() {
  const geos = useMemo(
    () => ({
      plinth: rounded(W + 0.1, 0.12, D + 0.1, 0.045),
      wallFB: rounded(W, H - 0.1, T, 0.025),
      wallLR: rounded(T, H - 0.1, D - 2 * T, 0.025),
      rimFB: rounded(W + 0.05, 0.06, T + 0.05, 0.022),
      rimLR: rounded(T + 0.05, 0.06, D + 0.05, 0.022),
      panelF: rounded(W - 0.42, H - 0.42, 0.03, 0.012),
      panelS: rounded(0.03, H - 0.42, D - 0.46, 0.012),
      foot: new THREE.SphereGeometry(0.075, 24, 16),
      floor: rounded(W - 2 * T - 0.01, 0.04, D - 2 * T - 0.01, 0.015),
      liningFB: new THREE.BoxGeometry(W - 2 * T, H - FLOOR_Y - 0.06, 0.016),
      liningLR: new THREE.BoxGeometry(0.016, H - FLOOR_Y - 0.06, D - 2 * T),
      lid: rounded(W + 0.08, 0.24, D + 0.08, 0.075, 4),
      lidCap: rounded(W - 0.24, 0.07, D - 0.3, 0.03),
      lidLining: new THREE.BoxGeometry(W - 2 * T, 0.014, D - 2 * T),
      ring: new THREE.TorusGeometry(0.22, 0.032, 16, 64),
      disc: new THREE.CylinderGeometry(0.17, 0.17, 0.035, 48),
      gem: new THREE.OctahedronGeometry(0.11, 0),
      hinge: new THREE.CylinderGeometry(0.042, 0.042, 0.32, 24),
      haspKnuckle: new THREE.CylinderGeometry(0.034, 0.034, 0.3, 20),
      hasp: rounded(0.26, 0.34, 0.04, 0.018),
      lockPlate: rounded(0.36, 0.24, 0.03, 0.014),
      keyholeRound: new THREE.CylinderGeometry(0.03, 0.03, 0.012, 20),
      keyholeSlot: new THREE.BoxGeometry(0.022, 0.06, 0.012),
      bar: ingotGeometry(),
    }),
    [],
  );
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);
  return geos;
}

/** A soft round sprite for the dust motes — square points read as pixels. */
function useMoteTexture() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,236,170,0.55)");
    g.addColorStop(1, "rgba(255,220,120,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

// ---- Dust motes rising out of the open box ---------------------------------
const MOTES = 70;

function Motes({ reveal }: { reveal: React.MutableRefObject<number> }) {
  const tex = useMoteTexture();
  const points = useRef<THREE.Points>(null);
  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(MOTES * 3);
    const speeds = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) {
      positions[i * 3] = (Math.random() - 0.5) * (W - 0.4);
      positions[i * 3 + 1] = FLOOR_Y + Math.random() * 1.6;
      positions[i * 3 + 2] = (Math.random() - 0.5) * (D - 0.4);
      speeds[i] = 0.12 + Math.random() * 0.22;
    }
    return { positions, speeds };
  }, []);

  useFrame((state, delta) => {
    const p = points.current;
    if (!p) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < MOTES; i++) {
      let y = positions[i * 3 + 1]! + speeds[i]! * delta;
      if (y > FLOOR_Y + 1.8) y = FLOOR_Y + 0.05;
      positions[i * 3 + 1] = y;
      positions[i * 3]! += Math.sin(t * 0.7 + i) * 0.0009;
    }
    p.geometry.attributes.position!.needsUpdate = true;
    (p.material as THREE.PointsMaterial).opacity = reveal.current * 0.85;
    p.visible = reveal.current > 0.01;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={tex}
        size={0.05}
        sizeAttenuation
        color="#f0d39c"
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ---- The box ---------------------------------------------------------------
function GoldBox({
  gramsMg,
  open,
  hovered,
  onRevealChange,
}: {
  gramsMg: string;
  open: boolean;
  hovered: boolean;
  onRevealChange: (revealed: boolean) => void;
}) {
  const m = useMaterials();
  const g = useGeometries();

  const root = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const hasp = useRef<THREE.Group>(null);
  const bar = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.PointLight>(null);

  const lidS = useRef<Spring>({ x: 0, v: 0 });
  const haspS = useRef<Spring>({ x: 0, v: 0 });
  const liftS = useRef<Spring>({ x: 0, v: 0 });
  const reveal = useRef(0);
  const revealed = useRef(false);

  const hasGold = BigInt(gramsMg) > 0n;
  const barScale = BAR_FIT * massScale(gramsMg);
  const barRestY = FLOOR_Y + (INGOT_HEIGHT * barScale) / 2;
  // Lifted, the bar's centre clears the rim whatever its size, so it is
  // presented above the box in front of the lid lining, never half-hidden.
  const barLift = H + 0.3 - barRestY;

  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useRef(new THREE.Vector3(0, 0.55, 0));
  const lookTarget = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.25); // a backgrounded tab must not fling the lid
    const t = state.clock.elapsedTime;
    const lidX = lidS.current.x;

    // --- Stage logic: each part waits for the one before it. -------------
    const haspTarget = open || lidX < -0.12 ? 1 : hovered ? 0.18 : 0;
    let lidTarget: number;
    if (open) lidTarget = haspS.current.x > 0.7 ? LID_OPEN : 0;
    else if (liftS.current.x > 0.12) lidTarget = lidX; // hold while the bar settles
    else lidTarget = hovered ? -0.035 : 0; // the hover peek
    const liftTarget = open && lidX < -1.35 ? 1 : 0;

    step(haspS.current, haspTarget, 140, 15, dt);
    step(lidS.current, lidTarget, 24, 6, dt); // ~1.2 s swing with a soft overshoot
    step(liftS.current, liftTarget, 16, 6.5, dt);

    // The lid cannot pass through the body: a closed lid lands with a small
    // bounce (the "thunk"), never a dip below the rim.
    if (lidS.current.x > 0) {
      lidS.current.x = 0;
      lidS.current.v = -lidS.current.v * 0.22;
    }

    if (hasp.current) hasp.current.rotation.x = -1.25 * haspS.current.x;
    if (lid.current) lid.current.rotation.x = lidS.current.x;

    reveal.current = THREE.MathUtils.clamp(lidS.current.x / LID_OPEN, 0, 1);
    if (glow.current) glow.current.intensity = 2.6 * reveal.current;

    const lift = liftS.current.x;
    if (bar.current) {
      bar.current.position.y = barRestY + lift * (barLift + Math.sin(t * 1.4) * 0.03);
      bar.current.rotation.y = lift * (0.6 + t * 0.35);
      bar.current.rotation.x = lift * 0.18;
    }

    const isRevealed = lift > 0.5;
    if (isRevealed !== revealed.current) {
      revealed.current = isRevealed;
      onRevealChange(isRevealed);
    }

    // --- Camera: dolly in and tip down to look into the open box. --------
    const r = reveal.current;
    // Rises and pulls back a little, so the opened lid stays in frame.
    camTarget.set(0, 2.05 + r * 1.35, 5.0 + r * 0.55);
    lookTarget.set(0, 0.55 + r * 0.45, -r * 0.25);
    state.camera.position.lerp(camTarget, 1 - Math.exp(-2.6 * dt));
    lookAt.current.lerp(lookTarget, 1 - Math.exp(-2.6 * dt));
    state.camera.lookAt(lookAt.current);

    // --- Pointer parallax + an idle sway, so it feels held, not printed. --
    if (root.current) {
      const yaw = 0.5 + state.pointer.x * 0.35 + Math.sin(t * 0.35) * 0.08;
      const pitch = -state.pointer.y * 0.06;
      root.current.rotation.y = THREE.MathUtils.damp(root.current.rotation.y, yaw, 3, dt);
      root.current.rotation.x = THREE.MathUtils.damp(root.current.rotation.x, pitch, 3, dt);
    }
  });

  const shadow = { castShadow: true, receiveShadow: true } as const;

  return (
    <group ref={root} position={[0, 0.09, 0]}>
      {/* Ball feet */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`${sx}${sz}`}
            geometry={g.foot}
            material={m.trim}
            position={[sx * (W / 2 - 0.16), -0.03, sz * (D / 2 - 0.16)]}
            scale={[1, 0.8, 1]}
            castShadow
          />
        )),
      )}

      {/* Body: plinth, four walls, raised panels, rim */}
      <mesh geometry={g.plinth} material={m.trim} position={[0, 0.06, 0]} {...shadow} />
      <mesh geometry={g.wallFB} material={m.body} position={[0, 0.07 + (H - 0.1) / 2, D / 2 - T / 2]} {...shadow} />
      <mesh geometry={g.wallFB} material={m.body} position={[0, 0.07 + (H - 0.1) / 2, -(D / 2 - T / 2)]} {...shadow} />
      <mesh geometry={g.wallLR} material={m.body} position={[-(W / 2 - T / 2), 0.07 + (H - 0.1) / 2, 0]} {...shadow} />
      <mesh geometry={g.wallLR} material={m.body} position={[W / 2 - T / 2, 0.07 + (H - 0.1) / 2, 0]} {...shadow} />
      <mesh geometry={g.panelF} material={m.trim} position={[0, H / 2 + 0.02, D / 2 + 0.012]} />
      <mesh geometry={g.panelF} material={m.trim} position={[0, H / 2 + 0.02, -(D / 2 + 0.012)]} />
      <mesh geometry={g.panelS} material={m.trim} position={[-(W / 2 + 0.012), H / 2 + 0.02, 0]} />
      <mesh geometry={g.panelS} material={m.trim} position={[W / 2 + 0.012, H / 2 + 0.02, 0]} />
      <mesh geometry={g.rimFB} material={m.trim} position={[0, H - 0.03, D / 2 - T / 2]} {...shadow} />
      <mesh geometry={g.rimFB} material={m.trim} position={[0, H - 0.03, -(D / 2 - T / 2)]} {...shadow} />
      <mesh geometry={g.rimLR} material={m.trim} position={[-(W / 2 - T / 2), H - 0.03, 0]} {...shadow} />
      <mesh geometry={g.rimLR} material={m.trim} position={[W / 2 - T / 2, H - 0.03, 0]} {...shadow} />

      {/* Lock plate + keyhole on the front */}
      <mesh geometry={g.lockPlate} material={m.trim} position={[0, H - 0.24, D / 2 + 0.03]} />
      <mesh geometry={g.keyholeRound} material={m.keyhole} position={[0, H - 0.21, D / 2 + 0.046]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={g.keyholeSlot} material={m.keyhole} position={[0, H - 0.25, D / 2 + 0.046]} />

      {/* Rear hinges */}
      {[-0.72, 0.72].map((x) => (
        <mesh key={x} geometry={g.hinge} material={m.trim} position={[x, H, -D / 2 - 0.02]} rotation={[0, 0, Math.PI / 2]} castShadow />
      ))}

      {/* Velvet lining */}
      <mesh geometry={g.floor} material={m.velvet} position={[0, FLOOR_Y - 0.02, 0]} receiveShadow />
      {[1, -1].map((s) => (
        <mesh key={`fb${s}`} geometry={g.liningFB} material={m.velvet} position={[0, FLOOR_Y + (H - FLOOR_Y - 0.06) / 2, s * (D / 2 - T - 0.008)]} receiveShadow />
      ))}
      {[1, -1].map((s) => (
        <mesh key={`lr${s}`} geometry={g.liningLR} material={m.velvet} position={[s * (W / 2 - T - 0.008), FLOOR_Y + (H - FLOOR_Y - 0.06) / 2, 0]} receiveShadow />
      ))}

      {/* The light that comes up from inside as the lid opens */}
      <pointLight ref={glow} position={[0, 0.75, 0.1]} color="#f2cf95" intensity={0} distance={3.2} decay={2} />

      {/* The user's bar, resting on the velvet */}
      {hasGold && (
        <mesh
          ref={bar}
          geometry={g.bar}
          material={m.bar}
          scale={barScale}
          position={[0, barRestY, 0]}
          castShadow
          receiveShadow
        />
      )}

      <Motes reveal={reveal} />

      {/* Lid — pivots on the hinge line at the back top edge */}
      <group ref={lid} position={[0, H, -D / 2]}>
        <mesh geometry={g.lid} material={m.body} position={[0, 0.12, D / 2]} {...shadow} />
        <mesh geometry={g.lidCap} material={m.trim} position={[0, 0.255, D / 2]} {...shadow} />
        <mesh geometry={g.lidLining} material={m.velvet} position={[0, -0.006, D / 2]} />
        {/* Medallion */}
        <mesh geometry={g.ring} material={m.trim} position={[0, 0.3, D / 2]} rotation={[-Math.PI / 2, 0, 0]} castShadow />
        <mesh geometry={g.disc} material={m.body} position={[0, 0.3, D / 2]} />
        <mesh geometry={g.gem} material={m.trim} position={[0, 0.33, D / 2]} scale={[1, 0.38, 1]} />

        {/* Hasp — hangs from the lid's front edge over the lock plate */}
        <group ref={hasp} position={[0, 0.07, D + 0.045]}>
          <mesh geometry={g.haspKnuckle} material={m.trim} rotation={[0, 0, Math.PI / 2]} />
          <mesh geometry={g.hasp} material={m.trim} position={[0, -0.17, 0.03]} castShadow />
        </group>
      </group>
    </group>
  );
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[14, 14]} />
      <shadowMaterial opacity={0.5} />
    </mesh>
  );
}

/** Exposure is set once on the renderer — R3F's default ACES is kept. */
function Exposure() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMappingExposure = 1.08;
  }, [gl]);
  return null;
}

export default function GoldVaultScene({
  gramsMg,
  open,
  hovered,
  active,
  onRevealChange,
}: {
  gramsMg: string;
  open: boolean;
  hovered: boolean;
  /** False while scrolled out of view — the render loop stops entirely. */
  active: boolean;
  onRevealChange: (revealed: boolean) => void;
}) {
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      frameloop={active ? "always" : "never"}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 2.05, 5.0], fov: 34 }}
      style={{ background: "transparent" }}
    >
      <Exposure />
      <StudioEnvironment />
      <ambientLight intensity={0.15} />
      <directionalLight
        position={[3.5, 6, 4]}
        intensity={2.2}
        color="#fff1d0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-camera-near={1}
        shadow-camera-far={16}
      />
      {/* Cool rim from behind so the gold silhouette separates from the dark page */}
      <directionalLight position={[-3, 3, -5]} intensity={1.2} color="#dfe6ff" />
      <GoldBox gramsMg={gramsMg} open={open} hovered={hovered} onRevealChange={onRevealChange} />
      <Ground />
    </Canvas>
  );
}
