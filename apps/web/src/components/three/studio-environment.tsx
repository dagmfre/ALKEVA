"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Image-based lighting from three's bundled RoomEnvironment (a procedural
 * scene rendered to a PMREM once) — this is what makes metal look like metal:
 * every facet picks up a different window/panel reflection as the bar turns.
 * No HDR download, no external request — CSP-safe and offline-safe, same as
 * the old hand-rolled rig, which stays underneath for base fill.
 */
export function StudioEnvironment() {
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
