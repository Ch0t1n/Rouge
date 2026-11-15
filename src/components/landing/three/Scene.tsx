"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import { scrollState } from "../core/scrollStore";
import { CAMERA_LOOK, CAMERA_POS, CORE_POS, CORE_SCALE, mix, mixVec, PALETTE, stageWeights } from "./choreography";

export type Tier = "high" | "low";

/** Valores derivados del scroll, compartidos por los componentes de la escena en cada frame. */
const live = { stage: 0, w: [1, 0, 0, 0] as [number, number, number, number], energy: 0, time: 0, motion: 1 };

const ROUGE = new THREE.Color(PALETTE.rouge);
const SQUAD = new THREE.Color(PALETTE.squad);
const VIP = new THREE.Color(PALETTE.vip);
const tmpV = new THREE.Vector3();
const tmpLook = new THREE.Vector3();

/** Director: amortigua la etapa, mueve la cámara y deja `live` listo para el resto. */
function Director({ reduced }: { reduced: boolean }) {
  const look = useRef(new THREE.Vector3());
  const { camera } = useThree();
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    live.motion = reduced ? 0.25 : 1;
    live.time += d * live.motion;
    live.stage = THREE.MathUtils.damp(live.stage, scrollState.stage, reduced ? 6 : 2.1, d);
    live.w = stageWeights(live.stage);
    // Energía: la velocidad del scroll "acelera" la escena; en el cierre B2B sube al máximo.
    const speed = Math.min(1, Math.abs(scrollState.velocity) / 40);
    live.energy = THREE.MathUtils.damp(live.energy, Math.max(speed, live.w[3]), 3, d);

    mixVec(tmpV, CAMERA_POS, live.w);
    // Paralaje del puntero sobre la cámara (sutil; casi nulo en el picado cenital).
    const par = 0.45 * (1 - live.w[2] * 0.7);
    tmpV.x += scrollState.pointerX * par;
    tmpV.y += scrollState.pointerY * par * 0.6;
    camera.position.lerp(tmpV, 1 - Math.exp(-4 * d));
    mixVec(tmpLook, CAMERA_LOOK, live.w);
    look.current.lerp(tmpLook, 1 - Math.exp(-4 * d));
    camera.lookAt(look.current);
  });
  return null;
}

/** Núcleo ROUGE: TorusKnot de cromo oscuro dentro de un icosaedro facetado de cristal. */
function Core({ tier }: { tier: Tier }) {
  const group = useRef<THREE.Group>(null);
  const knot = useRef<THREE.Mesh>(null);
  const shell = useRef<THREE.Mesh>(null);
  const knotMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const shellMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const edgesMat = useRef<THREE.LineBasicMaterial>(null);
  const tilt = useRef({ x: 0, y: 0 });
  const ico = useMemo(() => new THREE.IcosahedronGeometry(1.55, 1), []);
  const edges = useMemo(() => new THREE.EdgesGeometry(ico, 1), [ico]);
  const emissive = useMemo(() => new THREE.Color(), []);
  useEffect(() => () => {
    ico.dispose();
    edges.dispose();
  }, [ico, edges]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g || !knot.current || !shell.current) return;
    const { w, time, energy, motion } = live;
    mixVec(tmpV, CORE_POS, w);
    g.position.lerp(tmpV, 1 - Math.exp(-5 * dt));
    mixVec(tmpV, CORE_SCALE, w);
    g.scale.lerp(tmpV, 1 - Math.exp(-5 * dt));
    // Responde al mouse con lerp (inclinación hacia el puntero).
    tilt.current.x = THREE.MathUtils.lerp(tilt.current.x, -scrollState.pointerY * 0.45, 0.05);
    tilt.current.y = THREE.MathUtils.lerp(tilt.current.y, scrollState.pointerX * 0.6, 0.05);
    g.rotation.x = tilt.current.x * (1 - w[2]);
    g.rotation.y = tilt.current.y * (1 - w[2]);
    const spin = (0.25 + energy * 0.9) * motion;
    knot.current.rotation.y += dt * spin;
    knot.current.rotation.x += dt * spin * 0.4;
    shell.current.rotation.y -= dt * spin * 0.35;
    shell.current.rotation.z += dt * spin * 0.15;
    // Cierre: carmesí + dorado con máxima energía.
    if (knotMat.current) {
      emissive.copy(ROUGE).lerp(VIP, 0.5 + 0.5 * Math.sin(time * 1.4));
      knotMat.current.emissive.copy(emissive);
      knotMat.current.emissiveIntensity = 0.04 + w[3] * 0.22 + energy * 0.1;
    }
    if (shellMat.current) shellMat.current.opacity = 0.22 * (1 - w[2] * 0.85);
    if (edgesMat.current) {
      edgesMat.current.opacity = 0.55 * (1 - w[2]) + 0.15;
      edgesMat.current.color.copy(ROUGE).lerp(VIP, w[3] * 0.7).lerp(SQUAD, w[2]);
    }
  });

  return (
    <group ref={group}>
      <mesh ref={knot}>
        <torusKnotGeometry args={[0.62, 0.21, tier === "high" ? 260 : 120, tier === "high" ? 36 : 16, 2, 3]} />
        <meshPhysicalMaterial ref={knotMat} color="#1b1b24" metalness={0.92} roughness={0.12} clearcoat={1} clearcoatRoughness={0.08} envMapIntensity={1.6} />
      </mesh>
      <mesh ref={shell} geometry={ico}>
        <meshPhysicalMaterial ref={shellMat} color="#0d0d14" metalness={0.9} roughness={0.1} clearcoat={1} flatShading transparent opacity={0.22} envMapIntensity={2.2} depthWrite={false} />
        <lineSegments geometry={edges}>
          <lineBasicMaterial ref={edgesMat} color={PALETTE.rouge} transparent opacity={0.55} toneMapped={false} />
        </lineSegments>
      </mesh>
    </group>
  );
}

const RINGS = [
  { r: 2.05, color: PALETTE.rouge, tilt: [1.2, 0.2, 0] as const, split: [-2.2, 0.9, -0.6] as const, flat: 1.35 },
  { r: 2.45, color: PALETTE.squad, tilt: [0.4, 1.1, 0.3] as const, split: [0.4, -0.8, 0.9] as const, flat: 2.35 },
  { r: 2.9, color: PALETTE.vip, tilt: [-0.7, -0.4, 0.9] as const, split: [2.3, 0.5, -0.4] as const, flat: 3.5 },
];

/** Anillos orbitales: órbitas → se separan (conexiones) → zonas concéntricas planas → órbita cerrada. */
function Rings() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const spins = useRef(RINGS.map(() => 0));
  const pos = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const { w, energy, motion, time } = live;
    RINGS.forEach((ring, i) => {
      const m = refs.current[i];
      if (!m) return;
      spins.current[i] += dt * (0.3 + i * 0.12 + energy * 1.6) * motion * (i % 2 ? -1 : 1);
      // Posición: centro · separados en cadena · sobre el piso · centro.
      const [cx, cy, cz] = CORE_POS[1];
      pos.set((cx + ring.split[0]) * w[1], (cy + ring.split[1]) * w[1] - 0.58 * w[2], (cz + ring.split[2]) * w[1]);
      m.position.lerp(pos, 1 - Math.exp(-4 * dt));
      const s = mix([1, 0.7, ring.flat / ring.r, 0.82 + 0.05 * Math.sin(time * 3 + i)], w);
      m.scale.setScalar(s);
      m.rotation.set(
        mix([ring.tilt[0], ring.tilt[0] * 0.6 + 0.4, -Math.PI / 2, ring.tilt[0] * 1.3], w),
        mix([ring.tilt[1], ring.tilt[1] + 0.8, 0, ring.tilt[1]], w),
        mix([ring.tilt[2], ring.tilt[2], 0, ring.tilt[2]], w),
      );
      m.rotateZ(spins.current[i]);
      const mat = mats.current[i];
      if (mat) {
        mat.opacity = mix([0.75, 0.9, 0.35 + 0.2 * Math.sin(time * 2 + i * 2), 1], w);
        mat.color.set(ring.color);
        if (w[3] > 0) mat.color.lerp(i === 1 ? ROUGE : VIP, w[3] * 0.8);
      }
    });
  });
  return (
    <>
      {RINGS.map((ring, i) => (
        <mesh key={ring.color} ref={(el) => void (refs.current[i] = el)}>
          <torusGeometry args={[ring.r, 0.014, 8, 220]} />
          <meshBasicMaterial ref={(el) => void (mats.current[i] = el)} color={ring.color} transparent opacity={0.75} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

const PARTICLE_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec3 uPointer;
  uniform float uEnergy;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.6 + aSeed * 6.2831) * 0.18;
    p.x += cos(uTime * 0.4 + aSeed * 12.0) * 0.12;
    // Repulsión suave alrededor del puntero (en espacio local del sistema).
    vec3 d = p - uPointer;
    float f = smoothstep(2.2, 0.0, length(d));
    p += normalize(d + 1e-4) * f * 0.9;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.65 + 0.35 * sin(uTime * 2.0 + aSeed * 40.0);
    gl_PointSize = aSize * uPixelRatio * (1.0 + uEnergy * 0.6) * tw * (18.0 / -mv.z);
    vColor = aColor;
    vAlpha = smoothstep(22.0, 4.0, -mv.z) * (0.55 + f * 0.45);
  }
`;
const PARTICLE_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, a * a * vAlpha);
  }
`;

/** Polvo de luz alrededor del núcleo; se aparta del puntero y acelera con la energía. */
function Particles({ count }: { count: number }) {
  const points = useRef<THREE.Points>(null);
  const { camera, gl } = useThree();
  const [geometry, material] = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const seed = new Float32Array(count);
    const palette = [new THREE.Color("#F8FAFC"), new THREE.Color("#94A3B8"), ROUGE, SQUAD, VIP];
    const weights = [0.34, 0.26, 0.18, 0.14, 0.08];
    for (let i = 0; i < count; i++) {
      const r = 3 + Math.pow(Math.random(), 0.7) * 7;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.65, r * Math.sin(ph) * Math.sin(th)], i * 3);
      let k = Math.random();
      let c = palette[0];
      for (let j = 0; j < weights.length; j++) {
        if ((k -= weights[j]) <= 0) {
          c = palette[j];
          break;
        }
      }
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = 1.2 + Math.random() * 3.2;
      seed[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uPointer: { value: new THREE.Vector3(99, 99, 99) }, uEnergy: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return [g, m] as const;
  }, [count]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  const ndc = useMemo(() => new THREE.Vector3(), []);
  const inv = useMemo(() => new THREE.Matrix4(), []);
  useFrame((_, dt) => {
    const p = points.current;
    if (!p) return;
    const { time, energy, motion, w } = live;
    p.rotation.y += dt * (0.025 + energy * 0.25) * motion;
    p.rotation.x = THREE.MathUtils.lerp(p.rotation.x, scrollState.pointerY * 0.08, 0.04);
    material.uniforms.uTime.value = time;
    material.uniforms.uEnergy.value = energy;
    material.uniforms.uPixelRatio.value = gl.getPixelRatio();
    // Puntero → punto del mundo a la distancia del núcleo → espacio local de las partículas.
    ndc.set(scrollState.pointerX, scrollState.pointerY, 0.5).unproject(camera).sub(camera.position).normalize();
    const dist = camera.position.length() * (1 - w[2] * 0.1);
    ndc.multiplyScalar(dist).add(camera.position);
    p.updateMatrixWorld();
    inv.copy(p.matrixWorld).invert();
    material.uniforms.uPointer.value.copy(ndc.applyMatrix4(inv));
  });
  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} />;
}

const GRID_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const GRID_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uPins[6];
  uniform vec3 uPinColors[6];
  varying vec2 vUv;
  float gridLine(vec2 p, float cells, float width) {
    vec2 g = abs(fract(p * cells - 0.5) - 0.5) / fwidth(p * cells);
    return 1.0 - min(min(g.x, g.y) / width, 1.0);
  }
  void main() {
    vec2 p = vUv - 0.5;
    float fade = smoothstep(0.5, 0.12, length(p));
    float minor = gridLine(vUv, 48.0, 1.0) * 0.35;
    float major = gridLine(vUv, 8.0, 1.6) * 0.9;
    vec3 col = vec3(0.0, 0.94, 1.0) * (minor + major);
    float alpha = (minor + major) * 0.85;
    for (int i = 0; i < 6; i++) {
      vec2 c = uPins[i].xy;
      float d = length(p - c);
      float phase = fract(uTime * 0.45 + uPins[i].z);
      float ring = smoothstep(0.006, 0.0, abs(d - phase * 0.14)) * (1.0 - phase);
      float core = smoothstep(0.012, 0.0, d);
      float halo = smoothstep(0.06, 0.0, d) * 0.35;
      float k = ring + core + halo;
      col += uPinColors[i] * k;
      alpha += k;
    }
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0) * fade * uOpacity);
  }
`;

// Pines del plano (coordenadas de la grilla -0.5..0.5, fase de pulso): Squad cian, Matches rouge, Punto Base dorado.
const PINS: { x: number; y: number; phase: number; color: string }[] = [
  { x: -0.16, y: 0.08, phase: 0.0, color: PALETTE.squad },
  { x: -0.1, y: 0.15, phase: 0.33, color: PALETTE.squad },
  { x: -0.2, y: 0.19, phase: 0.66, color: PALETTE.squad },
  { x: 0.14, y: -0.06, phase: 0.2, color: PALETTE.rouge },
  { x: 0.2, y: 0.12, phase: 0.55, color: PALETTE.rouge },
  { x: 0.02, y: -0.2, phase: 0.8, color: PALETTE.vip },
];
const GRID_SIZE = 16;

/** Grilla holográfica del boliche (etapa 2) con pulsos de pines y columnas de luz. */
function HoloGrid() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: GRID_VERT,
        fragmentShader: GRID_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0 },
          uPins: { value: PINS.map((p) => new THREE.Vector3(p.x, p.y, p.phase)) },
          uPinColors: { value: PINS.map((p) => new THREE.Color(p.color)) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  const beams = useRef<(THREE.Mesh | null)[]>([]);
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const { w, time } = live;
    const vis = w[2] + w[1] * 0.15 + w[3] * 0.1;
    material.uniforms.uTime.value = time;
    material.uniforms.uOpacity.value = vis;
    if (group.current) group.current.visible = vis > 0.01;
    beams.current.forEach((b, i) => {
      if (!b) return;
      const h = 0.6 + 0.9 * (0.5 + 0.5 * Math.sin(time * 2.2 + PINS[i].phase * 6.28));
      b.scale.set(1, h * w[2] + 0.001, 1);
      b.position.y = (h * w[2]) / 2;
      (b.material as THREE.MeshBasicMaterial).opacity = 0.55 * w[2];
    });
  });
  return (
    <group ref={group} position={[0, -0.62, 0]}>
      <mesh rotation-x={-Math.PI / 2} material={material}>
        <planeGeometry args={[GRID_SIZE, GRID_SIZE, 1, 1]} />
      </mesh>
      {PINS.map((p, i) => (
        // uv.y crece hacia -z al rotar el plano: invertimos y para alinear columnas y pulsos.
        <mesh key={i} ref={(el) => void (beams.current[i] = el)} position={[p.x * GRID_SIZE, 0, -p.y * GRID_SIZE]}>
          <cylinderGeometry args={[0.035, 0.035, 1, 8, 1, true]} />
          <meshBasicMaterial color={p.color} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Láseres de pista: barras finas aditivas que barren detrás del núcleo (hero y cierre). */
function Lasers() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const colors = [PALETTE.rouge, PALETTE.squad, PALETTE.rouge, PALETTE.vip];
  useFrame(() => {
    const { w, time, energy } = live;
    const vis = w[0] * 0.6 + w[3] * 0.9 + energy * 0.2;
    refs.current.forEach((m, i) => {
      if (!m) return;
      m.visible = vis > 0.01;
      m.rotation.z = Math.sin(time * (0.35 + i * 0.07) + i * 1.7) * 0.7 + (i - 1.5) * 0.35;
      (m.material as THREE.MeshBasicMaterial).opacity = vis * (0.18 + 0.12 * Math.sin(time * 3 + i));
    });
  });
  return (
    <group position={[0, 6.5, -6]}>
      {colors.map((c, i) => (
        <mesh key={i} ref={(el) => void (refs.current[i] = el)}>
          <boxGeometry args={[0.025, 26, 0.025]} />
          <meshBasicMaterial color={c} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Luces de club: principal rouge, contraluz cian y destellos dorados (suben en el cierre). */
function ClubLights() {
  const key = useRef<THREE.PointLight>(null);
  const rim = useRef<THREE.PointLight>(null);
  const gold = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const { w, time, energy } = live;
    if (key.current) {
      key.current.position.set(Math.sin(time * 0.5) * 4, 2.5, 4 + Math.cos(time * 0.5));
      key.current.intensity = 55 + w[3] * 25 + energy * 25;
    }
    if (rim.current) {
      rim.current.position.set(-4 + Math.cos(time * 0.4), -1.5, -3);
      rim.current.intensity = 45 + w[2] * 40;
    }
    if (gold.current) {
      gold.current.position.set(Math.cos(time) * 2.5, 3.5, Math.sin(time) * 2.5);
      gold.current.intensity = 6 + w[3] * 70 + 10 * Math.max(0, Math.sin(time * 6)) * w[3];
    }
  });
  return (
    <>
      <ambientLight intensity={0.12} />
      <pointLight ref={key} color={PALETTE.rouge} distance={20} decay={2} />
      <pointLight ref={rim} color={PALETTE.squad} distance={20} decay={2} />
      <pointLight ref={gold} color={PALETTE.vip} distance={16} decay={2} />
      <directionalLight position={[0, 5, 5]} intensity={0.35} color="#F8FAFC" />
    </>
  );
}

/** Reflejos para el cromo, generados en GPU con Lightformers (sin HDR externo que pueda dar 404). */
function StudioEnv({ tier }: { tier: Tier }) {
  return (
    <Environment resolution={tier === "high" ? 256 : 64} frames={1}>
      <color attach="background" args={["#050507"]} />
      <Lightformer form="rect" intensity={3} color={PALETTE.rouge} position={[4, 2, 3]} scale={[6, 2, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={2.4} color={PALETTE.squad} position={[-5, -1, -2]} scale={[5, 3, 1]} target={[0, 0, 0]} />
      <Lightformer form="ring" intensity={2} color={PALETTE.vip} position={[0, 5, -3]} scale={2.5} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={1.2} color="#F8FAFC" position={[0, 0, 6]} scale={[8, 0.4, 1]} target={[0, 0, 0]} />
    </Environment>
  );
}

export default function Scene({ tier, reduced }: { tier: Tier; reduced: boolean }) {
  const [dpr, setDpr] = useState<number>(tier === "high" ? 1.5 : 1);
  return (
    <Canvas
      dpr={tier === "high" ? [1, dpr] : [1, Math.min(dpr, 1.25)]}
      gl={{ antialias: tier === "high", powerPreference: "high-performance", alpha: false, stencil: false }}
      camera={{ position: [0, 0, 7.2], fov: 40, near: 0.1, far: 60 }}
      flat={false}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(tier === "high" ? 1.5 : 1.25)} />
      <color attach="background" args={[PALETTE.obsidian]} />
      <fog attach="fog" args={[PALETTE.obsidian, 9, 24]} />
      <Director reduced={reduced} />
      <ClubLights />
      <StudioEnv tier={tier} />
      <Core tier={tier} />
      <Rings />
      <Particles count={tier === "high" ? 2200 : 650} />
      <HoloGrid />
      {tier === "high" && <Lasers />}
    </Canvas>
  );
}
