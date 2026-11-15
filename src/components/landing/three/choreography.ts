import * as THREE from "three";

/**
 * Coreografía de la escena por etapas (0 Hero · 1 Experiencia · 2 Plano/Squads · 3 B2B/Cierre).
 * `stage` es un float amortiguado: los valores se mezclan por pesos triangulares, así cualquier
 * punto intermedio es una transición suave entre dos etapas vecinas.
 */
export type Vec3 = readonly [number, number, number];

export function stageWeights(stage: number): [number, number, number, number] {
  const w = (i: number) => Math.max(0, 1 - Math.abs(stage - i));
  return [w(0), w(1), w(2), w(3)];
}

export function mix(values: readonly number[], w: readonly number[]) {
  let v = 0;
  for (let i = 0; i < w.length; i++) v += values[i] * w[i];
  return v;
}

export function mixVec(target: THREE.Vector3, values: readonly Vec3[], w: readonly number[]) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < w.length; i++) {
    x += values[i][0] * w[i];
    y += values[i][1] * w[i];
    z += values[i][2] * w[i];
  }
  return target.set(x, y, z);
}

// Cámara: frontal → giro de 45° → picado cenital → frontal cercana.
export const CAMERA_POS: readonly Vec3[] = [
  [0, 0, 7.2],
  [5.1, 1.1, 5.1],
  [0, 9.5, 2.4],
  [0, 0.25, 5.6],
];
export const CAMERA_LOOK: readonly Vec3[] = [
  [0, 0, 0],
  [0, 0, 0],
  [0, -0.6, 0],
  [0, 0, 0],
];

// Núcleo: centro → a un lateral (detrás del teléfono) → aplastado sobre la grilla → centro, grande.
// En la etapa 1 el lateral se calcula sobre el vector "derecha" de la cámara girada 45°.
export const CORE_POS: readonly Vec3[] = [
  [0, 0, 0],
  [-1.7, 0, 1.7],
  [0, -0.55, 0],
  [0, 0, 0],
];
export const CORE_SCALE: readonly Vec3[] = [
  [1, 1, 1],
  [0.82, 0.82, 0.82],
  [0.6, 0.05, 0.6],
  [1, 1, 1],
];

export const PALETTE = {
  obsidian: "#070709",
  rouge: "#FF1E56",
  squad: "#00F0FF",
  vip: "#FFB800",
} as const;
