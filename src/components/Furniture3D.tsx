"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { BoxGeometry } from "three";
import { FURNITURE } from "@/editor/interior";
import type { Furniture } from "@/editor/parts";

type V3 = [number, number, number];

/** Box: centre p (local), size s = [w, h, d]. */
function B({ p, s, c, o = 1, m = 0, r = 0.7, e }: { p: V3; s: V3; c: string; o?: number; m?: number; r?: number; e?: string }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial
        color={c}
        transparent={o < 1}
        opacity={o}
        metalness={m}
        roughness={r}
        emissive={e ?? "#000"}
        emissiveIntensity={e ? 0.6 : 0}
      />
    </mesh>
  );
}
/** Vertical cylinder: centre p, radius top/bottom, height h. */
function C({ p, rt, rb = rt, h, c, m = 0, r = 0.6, rot }: { p: V3; rt: number; rb?: number; h: number; c: string; m?: number; r?: number; rot?: V3 }) {
  return (
    <mesh position={p} rotation={rot} castShadow receiveShadow>
      <cylinderGeometry args={[rt, rb, h, 20]} />
      <meshStandardMaterial color={c} metalness={m} roughness={r} />
    </mesh>
  );
}
function S({ p, r, c, sy = 1 }: { p: V3; r: number; c: string; sy?: number }) {
  return (
    <mesh position={p} scale={[1, sy, 1]} castShadow receiveShadow>
      <sphereGeometry args={[r, 20, 14]} />
      <meshStandardMaterial color={c} roughness={0.85} />
    </mesh>
  );
}
/** Wheel lying on its side along z (axle across the vehicle). */
const Wheel = ({ x, z, r, t = 0.2 }: { x: number; z: number; r: number; t?: number }) => (
  <C p={[x, r, z]} rt={r} h={t} c="#1b1d20" r={0.9} rot={[Math.PI / 2, 0, 0]} />
);

const WOOD = "#7a5a3c";
const WHITE = "#f4f2ec";
const DARK = "#2b3037";
const STEEL = "#9aa3ad";
const GLASS = "#a9c9da";
const SKIN = "#c99a74";

function legs(w: number, d: number, h: number, c: string, inset = 0.06, t = 0.05) {
  return [
    [-w / 2 + inset, -d / 2 + inset],
    [w / 2 - inset, -d / 2 + inset],
    [-w / 2 + inset, d / 2 - inset],
    [w / 2 - inset, d / 2 - inset],
  ].map(([x, z]) => <B key={`${x},${z}`} p={[x, h / 2, z]} s={[t, h, t]} c={c} />);
}

function Bed({ w, d, h, color, y = 0 }: { w: number; d: number; h: number; color: string; y?: number }) {
  const pillows = w >= 1.3 ? [-w / 4, w / 4] : [0];
  return (
    <group position={[0, y, 0]}>
      <B p={[0, h * 0.27, 0]} s={[w, h * 0.55, d]} c={WOOD} />
      <B p={[0, h * 0.72, 0.04]} s={[w - 0.06, h * 0.36, d - 0.1]} c={WHITE} r={0.9} />
      <B p={[0, h - 0.03, 0.25]} s={[w - 0.02, 0.06, d * 0.62]} c={color} r={0.95} />
      {pillows.map((x) => (
        <B key={x} p={[x, h + 0.01, -d / 2 + 0.25]} s={[pillows.length > 1 ? w / 2 - 0.1 : w - 0.2, 0.12, 0.35]} c={WHITE} r={0.95} />
      ))}
      <B p={[0, h * 0.9, -d / 2 + 0.03]} s={[w, h * 1.8, 0.06]} c={WOOD} />
    </group>
  );
}

function Sofa({ w, d, h, color }: { w: number; d: number; h: number; color: string }) {
  return (
    <group>
      <B p={[0, 0.22, 0.05]} s={[w, 0.44, d - 0.1]} c={color} r={0.95} />
      <B p={[0, h / 2 + 0.1, -d / 2 + 0.1]} s={[w, h - 0.2, 0.2]} c={color} r={0.95} />
      <B p={[-w / 2 + 0.09, 0.33, 0.05]} s={[0.18, 0.62, d - 0.1]} c={color} r={0.95} />
      <B p={[w / 2 - 0.09, 0.33, 0.05]} s={[0.18, 0.62, d - 0.1]} c={color} r={0.95} />
    </group>
  );
}

function Person({ w, h, color, d }: { w: number; d: number; h: number; color: string }) {
  const k = h / 1.75;
  return (
    <group>
      <B p={[-w * 0.18, 0.42 * k, 0]} s={[w * 0.28, 0.84 * k, d * 0.6]} c="#2c3440" />
      <B p={[w * 0.18, 0.42 * k, 0]} s={[w * 0.28, 0.84 * k, d * 0.6]} c="#2c3440" />
      <B p={[0, 1.15 * k, 0]} s={[w * 0.75, 0.62 * k, d * 0.8]} c={color} r={0.9} />
      <B p={[-w * 0.47, 1.12 * k, 0]} s={[w * 0.16, 0.6 * k, d * 0.5]} c={color} />
      <B p={[w * 0.47, 1.12 * k, 0]} s={[w * 0.16, 0.6 * k, d * 0.5]} c={color} />
      <S p={[0, 1.6 * k, 0]} r={0.12 * k} c={SKIN} sy={1.15} />
    </group>
  );
}

/** Generic car-like body: chassis, cabin (fraction of length), wheels. */
function Car({ w, d, h, color, cabin = 0.55, cabinX = 0, bed = false }: { w: number; d: number; h: number; color: string; cabin?: number; cabinX?: number; bed?: boolean }) {
  const r = Math.min(0.34, h * 0.22);
  const body = h * 0.45;
  return (
    <group>
      <B p={[0, r + body / 2 - 0.05, 0]} s={[w, body, d]} c={color} m={0.4} r={0.35} />
      <B p={[cabinX, r + body + (h - r - body) / 2 - 0.06, 0]} s={[w * cabin, h - r - body, d * 0.9]} c={GLASS} m={0.3} r={0.1} o={0.85} />
      <B p={[cabinX, h - 0.04, 0]} s={[w * cabin * 0.95, 0.05, d * 0.88]} c={color} m={0.4} r={0.35} />
      {bed && <B p={[-w * 0.28, r + body + 0.1, 0]} s={[w * 0.4, 0.2, d * 0.95]} c={DARK} />}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => <Wheel key={`${sx}${sz}`} x={sx * w * 0.32} z={sz * (d / 2 - 0.05)} r={r} />),
      )}
    </group>
  );
}

function Model({ f }: { f: Furniture }) {
  const { w, d, h, color } = f;
  const kind = FURNITURE[f.type]?.model ?? "box";
  switch (kind) {
    case "bed":
      return <Bed w={w} d={d} h={h} color={color} />;
    case "bunk":
      return (
        <group>
          <Bed w={w} d={d} h={0.45} color={color} />
          <Bed w={w} d={d} h={0.35} color={color} y={h - 0.45} />
          {legs(w, d, h, WOOD, 0.03, 0.07)}
        </group>
      );
    case "crib":
      return (
        <group>
          <B p={[0, 0.45, 0]} s={[w, 0.08, d]} c={WHITE} />
          {legs(w, d, h, color, 0.02, 0.04)}
          {[-1, 1].map((k) => (
            <B key={k} p={[0, h - 0.05, (k * d) / 2]} s={[w, 0.04, 0.03]} c={color} />
          ))}
          {[-1, 1].map((k) => (
            <B key={`s${k}`} p={[(k * w) / 2, h - 0.05, 0]} s={[0.03, 0.04, d]} c={color} />
          ))}
        </group>
      );
    case "sofa":
      return <Sofa w={w} d={d} h={h} color={color} />;
    case "sectional":
      return (
        <group>
          <group position={[0, 0, -d / 2 + 0.45]}>
            <Sofa w={w} d={0.9} h={h} color={color} />
          </group>
          <B p={[w / 2 - 0.45, 0.22, 0.45]} s={[0.9, 0.44, d - 0.9]} c={color} r={0.95} />
        </group>
      );
    case "armchair":
      return <Sofa w={w} d={d} h={h} color={color} />;
    case "table":
      return (
        <group>
          <B p={[0, h - 0.02, 0]} s={[w, 0.04, d]} c={color} />
          {legs(w, d, h - 0.04, color)}
        </group>
      );
    case "round_table":
      return (
        <group>
          <C p={[0, h - 0.02, 0]} rt={w / 2} h={0.04} c={color} />
          <C p={[0, (h - 0.04) / 2, 0]} rt={0.05} h={h - 0.04} c={color} />
          <C p={[0, 0.02, 0]} rt={w * 0.25} h={0.04} c={color} />
        </group>
      );
    case "chair":
      return (
        <group>
          <B p={[0, 0.45, 0]} s={[w, 0.05, d]} c={color} />
          <B p={[0, 0.45 + (h - 0.45) / 2, -d / 2 + 0.025]} s={[w, h - 0.45, 0.05]} c={color} />
          {legs(w, d, 0.43, color, 0.04, 0.04)}
        </group>
      );
    case "stool":
      return (
        <group>
          <C p={[0, h - 0.03, 0]} rt={w / 2} h={0.06} c={color} />
          <C p={[0, h / 2, 0]} rt={0.03} h={h} c={STEEL} m={0.7} />
          <C p={[0, 0.02, 0]} rt={w / 2.4} h={0.04} c={STEEL} m={0.7} />
        </group>
      );
    case "office_chair":
      return (
        <group>
          <C p={[0, 0.48, 0]} rt={w / 2.2} h={0.08} c={color} />
          <B p={[0, 0.85, -d / 2 + 0.08]} s={[w * 0.8, h - 0.55, 0.06]} c={color} />
          <C p={[0, 0.25, 0]} rt={0.03} h={0.45} c={STEEL} m={0.7} />
          <C p={[0, 0.05, 0]} rt={w / 2} h={0.04} c={DARK} />
        </group>
      );
    case "cabinet":
    case "wardrobe":
      return (
        <group>
          <B p={[0, h / 2, 0]} s={[w, h, d]} c={color} />
          <B p={[0, h / 2, d / 2 + 0.003]} s={[0.01, h - 0.06, 0.005]} c={DARK} />
          {[-0.05, 0.05].map((x) => (
            <B key={x} p={[x, h * 0.55, d / 2 + 0.015]} s={[0.02, Math.min(0.25, h * 0.3), 0.02]} c="#c9b98f" m={0.6} r={0.3} />
          ))}
        </group>
      );
    case "shelf": {
      const n = Math.max(2, Math.round(h / 0.4));
      return (
        <group>
          <B p={[0, h / 2, -d / 2 + 0.01]} s={[w, h, 0.02]} c={color} />
          <B p={[-w / 2 + 0.01, h / 2, 0]} s={[0.02, h, d]} c={color} />
          <B p={[w / 2 - 0.01, h / 2, 0]} s={[0.02, h, d]} c={color} />
          {Array.from({ length: n + 1 }, (_, i) => (
            <B key={i} p={[0, (i * h) / n + 0.01, 0]} s={[w, 0.02, d]} c={color} />
          ))}
          {Array.from({ length: n }, (_, i) => (
            <B key={`b${i}`} p={[-w * 0.15, (i * h) / n + h / n / 2, 0]} s={[w * 0.5, (h / n) * 0.6, d * 0.7]} c={["#b34a3c", "#3c6fb3", "#d9b24c", "#4c9a6a"][i % 4]} />
          ))}
        </group>
      );
    }
    case "tv":
      return (
        <group>
          <B p={[0, h / 2, 0]} s={[w, h, d]} c={color} />
          <B p={[0, h + 0.33, -d / 2 + 0.12]} s={[Math.min(w * 0.9, 1.45), 0.62, 0.04]} c="#0e1116" m={0.3} r={0.2} />
        </group>
      );
    case "counter":
    case "sink_counter":
    case "island":
      return (
        <group>
          <B p={[0, (h - 0.04) / 2, 0]} s={[w, h - 0.04, d]} c={color} />
          <B p={[0, h - 0.02, 0.01]} s={[w + 0.02, 0.04, d + 0.02]} c={kind === "island" ? "#cfc8bb" : "#5a5f66"} r={0.35} />
          {kind === "sink_counter" && <B p={[0, h - 0.05, 0]} s={[0.55, 0.06, 0.4]} c={STEEL} m={0.8} r={0.25} />}
        </group>
      );
    case "fridge":
      return (
        <group>
          <B p={[0, h / 2, 0]} s={[w, h, d]} c={color} m={0.4} r={0.35} />
          <B p={[0, h * 0.68, d / 2 + 0.003]} s={[w - 0.02, 0.01, 0.005]} c={DARK} />
          <B p={[w / 2 - 0.06, h * 0.82, d / 2 + 0.02]} s={[0.025, 0.3, 0.025]} c={STEEL} m={0.8} r={0.3} />
        </group>
      );
    case "washer":
      return (
        <group>
          <B p={[0, h / 2, 0]} s={[w, h, d]} c={color} r={0.4} />
          <C p={[0, h * 0.45, d / 2 + 0.01]} rt={Math.min(w, h) * 0.3} h={0.02} c="#5d6a77" rot={[Math.PI / 2, 0, 0]} />
        </group>
      );
    case "range":
      return (
        <group>
          <B p={[0, h / 2, 0]} s={[w, h, d]} c={color} m={0.5} r={0.35} />
          <B p={[0, h + 0.003, 0]} s={[w - 0.04, 0.006, d - 0.04]} c="#111" r={0.15} />
          <B p={[0, h * 0.45, d / 2 + 0.005]} s={[w * 0.8, h * 0.45, 0.01]} c="#1a1d21" r={0.2} />
        </group>
      );
    case "toilet":
      return (
        <group>
          <C p={[0, 0.2, 0.08]} rt={w / 2} rb={w / 2.6} h={0.4} c={color} r={0.2} />
          <B p={[0, 0.42, 0.08]} s={[w, 0.04, d * 0.62]} c={color} r={0.2} />
          <B p={[0, 0.58, -d / 2 + 0.1]} s={[w, h - 0.4, 0.2]} c={color} r={0.2} />
        </group>
      );
    case "urinal":
      return <B p={[0, h / 2, 0]} s={[w, h, d]} c={color} r={0.2} />;
    case "vanity":
      return (
        <group>
          <B p={[0, (h - 0.04) / 2, 0]} s={[w, h - 0.04, d]} c={WOOD} />
          <B p={[0, h - 0.02, 0]} s={[w, 0.04, d]} c={color} r={0.25} />
          <B p={[0, h + 0.4, -d / 2 + 0.01]} s={[w * 0.8, 0.6, 0.02]} c="#cfe3ee" m={0.9} r={0.05} />
        </group>
      );
    case "pedestal_sink":
      return (
        <group>
          <C p={[0, (h - 0.15) / 2, 0]} rt={0.08} rb={0.12} h={h - 0.15} c={color} r={0.2} />
          <B p={[0, h - 0.08, 0]} s={[w, 0.16, d]} c={color} r={0.2} />
        </group>
      );
    case "shower":
      return (
        <group>
          <B p={[0, 0.04, 0]} s={[w, 0.08, d]} c={WHITE} r={0.3} />
          <B p={[0, h / 2, d / 2 - 0.01]} s={[w, h, 0.02]} c={color} o={0.25} r={0.05} />
          <B p={[w / 2 - 0.01, h / 2, 0]} s={[0.02, h, d]} c={color} o={0.25} r={0.05} />
        </group>
      );
    case "tub":
      return (
        <group>
          <B p={[0, h / 2, 0]} s={[w, h, d]} c={color} r={0.2} />
          <B p={[0, h - 0.04, 0]} s={[w - 0.14, 0.06, d - 0.14]} c="#9fd0e6" r={0.05} />
        </group>
      );
    case "rug":
      return <B p={[0, 0.006, 0]} s={[w, Math.max(h, 0.01), d]} c={color} r={1} />;
    case "floor_lamp":
      return (
        <group>
          <C p={[0, 0.02, 0]} rt={w / 2.5} h={0.04} c={DARK} />
          <C p={[0, h / 2, 0]} rt={0.015} h={h} c={DARK} m={0.6} />
          <C p={[0, h - 0.15, 0]} rt={w / 3} rb={w / 2} h={0.3} c={color} />
        </group>
      );
    case "piano":
      return (
        <group>
          <B p={[0, h / 2, -d / 4]} s={[w, h, d / 2]} c={color} m={0.2} r={0.15} />
          <B p={[0, 0.72, 0.1]} s={[w * 0.9, 0.06, d / 2]} c={color} m={0.2} r={0.15} />
          <B p={[0, 0.76, 0.12]} s={[w * 0.85, 0.02, 0.15]} c={WHITE} />
        </group>
      );
    case "board":
      return (
        <group>
          <B p={[0, h * 0.62, 0]} s={[w, h * 0.55, 0.03]} c={color} r={0.3} />
          {legs(w, d, h * 0.9, STEEL, 0.05, 0.04)}
        </group>
      );
    case "partition":
      return <B p={[0, h / 2, 0]} s={[w, h, d]} c={color} r={0.9} />;
    case "glass":
      return (
        <group>
          <B p={[0, h / 2, 0]} s={[w, h, Math.min(d, 0.03)]} c={color} o={0.3} m={0.1} r={0.05} />
          <B p={[0, h - 0.02, 0]} s={[w, 0.04, d]} c={DARK} m={0.5} />
          <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c={DARK} m={0.5} />
        </group>
      );
    case "door":
      return (
        <group>
          <B p={[-w / 2 + 0.03, h / 2, 0]} s={[0.06, h, d]} c="#d8d1c2" />
          <B p={[w / 2 - 0.03, h / 2, 0]} s={[0.06, h, d]} c="#d8d1c2" />
          <B p={[0, h - 0.03, 0]} s={[w, 0.06, d]} c="#d8d1c2" />
          <B p={[0, (h - 0.06) / 2, 0]} s={[w - 0.12, h - 0.06, 0.04]} c={color} />
          <C p={[w / 2 - 0.15, h * 0.48, 0.04]} rt={0.02} h={0.12} c="#c9b98f" m={0.7} rot={[Math.PI / 2, 0, 0]} />
        </group>
      );
    case "window":
      return (
        <group>
          <B p={[0, h / 2, 0]} s={[w, h, 0.02]} c={color} o={0.35} m={0.1} r={0.05} />
          {[
            [0, h - 0.03, w, 0.06],
            [0, 0.03, w, 0.06],
          ].map(([x, y, sw, sh], i) => (
            <B key={i} p={[x, y, 0]} s={[sw, sh, d]} c="#e8e4dc" />
          ))}
          <B p={[-w / 2 + 0.03, h / 2, 0]} s={[0.06, h, d]} c="#e8e4dc" />
          <B p={[w / 2 - 0.03, h / 2, 0]} s={[0.06, h, d]} c="#e8e4dc" />
          <B p={[0, h / 2, 0]} s={[0.04, h, d * 0.6]} c="#e8e4dc" />
        </group>
      );
    case "column":
      return <B p={[0, h / 2, 0]} s={[w, h, d]} c={color} r={0.85} />;
    case "round_column":
      return <C p={[0, h / 2, 0]} rt={w / 2} h={h} c={color} r={0.85} />;
    case "stairs": {
      const n = Math.max(3, Math.round(h / 0.18));
      return (
        <group>
          {Array.from({ length: n }, (_, i) => (
            <B key={i} p={[0, ((i + 1) * h) / n / 2, -d / 2 + ((i + 0.5) * d) / n]} s={[w, ((i + 1) * h) / n, d / n]} c={color} />
          ))}
        </group>
      );
    }
    case "ramp":
      return (
        <mesh position={[0, h / 2, 0]} rotation={[Math.atan2(h, d), 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, 0.05, Math.hypot(h, d)]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      );
    case "railing":
    case "fence": {
      const posts = Math.max(2, Math.round(w / (kind === "fence" ? 1.5 : 0.12)) + 1);
      return (
        <group>
          <B p={[0, h - 0.03, 0]} s={[w, 0.05, Math.max(d, 0.05)]} c={color} m={0.3} />
          {kind === "fence" && <B p={[0, h / 2, 0]} s={[w, h * 0.85, Math.max(d * 0.5, 0.03)]} c={color} r={0.9} />}
          {Array.from({ length: posts }, (_, i) => (
            <B key={i} p={[-w / 2 + (i * w) / (posts - 1), h / 2, 0]} s={[kind === "fence" ? 0.12 : 0.025, h, kind === "fence" ? 0.12 : 0.025]} c={color} m={0.3} />
          ))}
        </group>
      );
    }
    case "tree":
      return (
        <group>
          <C p={[0, h * 0.25, 0]} rt={0.12} rb={0.18} h={h * 0.5} c="#6b4a2f" r={0.95} />
          <S p={[0, h * 0.65, 0]} r={w / 2} c={color} sy={(h * 0.7) / w} />
        </group>
      );
    case "palm":
      return (
        <group>
          <C p={[0, h * 0.45, 0]} rt={0.12} rb={0.18} h={h * 0.9} c="#8b6b45" r={0.95} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh key={i} position={[Math.cos((i * Math.PI) / 3) * w * 0.28, h * 0.92, Math.sin((i * Math.PI) / 3) * w * 0.28]} rotation={[0, -(i * Math.PI) / 3, 0.5]} castShadow>
              <boxGeometry args={[w * 0.55, 0.03, 0.35]} />
              <meshStandardMaterial color={color} roughness={0.9} />
            </mesh>
          ))}
        </group>
      );
    case "shrub":
      return <S p={[0, h / 2, 0]} r={w / 2} c={color} sy={h / w} />;
    case "plant":
      return (
        <group>
          <C p={[0, h * 0.15, 0]} rt={w / 2.4} rb={w / 3.2} h={h * 0.3} c="#b0643c" />
          <S p={[0, h * 0.62, 0]} r={w / 2} c={color} sy={(h * 0.75) / w} />
        </group>
      );
    case "pool":
      return (
        <group>
          <B p={[0, 0.03, 0]} s={[w + 0.4, 0.06, d + 0.4]} c="#d8d2c6" />
          <B p={[0, 0.065, 0]} s={[w, 0.01, d]} c={color} r={0.05} m={0.1} />
        </group>
      );
    case "tank":
      return <C p={[0, h / 2, 0]} rt={w / 2} h={h} c={color} r={0.5} />;
    case "bin":
      return <C p={[0, h / 2, 0]} rt={w / 2} rb={w / 2.3} h={h} c={color} />;
    case "post":
      return (
        <group>
          <C p={[0, h / 2, 0]} rt={0.05} rb={0.08} h={h} c={color} m={0.5} />
          <B p={[0, h, 0]} s={[w, 0.12, d]} c={color} e="#ffe2a8" />
        </group>
      );
    case "ac_outdoor":
      return (
        <group>
          <B p={[0, h / 2, 0]} s={[w, h, d]} c={color} r={0.4} />
          <C p={[-w * 0.15, h / 2, d / 2 + 0.005]} rt={h * 0.38} h={0.01} c="#5d6a77" rot={[Math.PI / 2, 0, 0]} />
        </group>
      );
    case "solar":
      return (
        <group>
          <mesh position={[0, h * 0.6, 0]} rotation={[-0.3, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, 0.04, d]} />
            <meshStandardMaterial color={color} metalness={0.6} roughness={0.2} />
          </mesh>
          {legs(w, d * 0.6, h * 0.5, STEEL, 0.1, 0.04)}
        </group>
      );
    case "person":
      return <Person w={w} d={d} h={h} color={color} />;
    case "wheelchair":
      return (
        <group>
          <Wheel x={0} z={-w / 2 + 0.03} r={0.3} t={0.04} />
          <Wheel x={0} z={w / 2 - 0.03} r={0.3} t={0.04} />
          <group rotation={[0, Math.PI / 2, 0]}>
            <B p={[0, 0.48, 0]} s={[w * 0.7, 0.06, 0.45]} c={DARK} />
            <B p={[0, 0.75, -0.22]} s={[w * 0.7, 0.5, 0.04]} c={DARK} />
          </group>
          <B p={[0.05, 0.85, 0]} s={[0.3, 0.55, w * 0.55]} c={color} />
          <S p={[0.05, 1.22, 0]} r={0.11} c={SKIN} sy={1.15} />
        </group>
      );
    case "car":
      return <Car w={w} d={d} h={h} color={color} />;
    case "pickup":
      return <Car w={w} d={d} h={h} color={color} cabin={0.35} cabinX={w * 0.12} bed />;
    case "van":
      return <Car w={w} d={d} h={h} color={color} cabin={0.85} />;
    case "truck":
      return (
        <group>
          <B p={[-w * 0.12, h * 0.55, 0]} s={[w * 0.72, h * 0.75, d]} c={color} />
          <B p={[w * 0.37, h * 0.42, 0]} s={[w * 0.24, h * 0.62, d * 0.95]} c="#e6e6e6" m={0.3} />
          {[-0.35, -0.15, 0.35].map((k) =>
            [-1, 1].map((sz) => <Wheel key={`${k}${sz}`} x={k * w} z={sz * (d / 2 - 0.1)} r={0.5} t={0.3} />),
          )}
        </group>
      );
    case "jeepney":
      return (
        <group>
          <B p={[w * 0.38, 0.75, 0]} s={[w * 0.22, 0.6, d * 0.85]} c={STEEL} m={0.7} r={0.3} />
          <B p={[-w * 0.1, 1.05, 0]} s={[w * 0.75, 1.2, d]} c={color} m={0.6} r={0.3} />
          <B p={[-w * 0.1, h - 0.05, 0]} s={[w * 0.8, 0.1, d + 0.1]} c="#c43b3b" />
          {[-1, 1].map((sz) => (
            <B key={sz} p={[-w * 0.1, 1.25, sz * (d / 2 + 0.005)]} s={[w * 0.7, 0.35, 0.01]} c="#1f3a5f" />
          ))}
          {[-0.3, 0.3].flatMap((k) => [-1, 1].map((sz) => <Wheel key={`${k}${sz}`} x={k * w} z={sz * (d / 2 - 0.1)} r={0.38} t={0.22} />))}
        </group>
      );
    case "moto":
    case "bicycle": {
      const r = kind === "moto" ? 0.3 : 0.34;
      return (
        <group>
          <Wheel x={-w / 2 + r} z={0} r={r} t={kind === "moto" ? 0.12 : 0.04} />
          <Wheel x={w / 2 - r} z={0} r={r} t={kind === "moto" ? 0.12 : 0.04} />
          <B p={[0, r + 0.25, 0]} s={[w * 0.55, kind === "moto" ? 0.3 : 0.05, kind === "moto" ? 0.3 : 0.05]} c={color} m={0.5} />
          <B p={[-w * 0.12, h * 0.8, 0]} s={[0.3, 0.08, 0.2]} c={DARK} />
          <B p={[w / 2 - r, h * 0.85, 0]} s={[0.04, 0.04, d]} c={DARK} />
        </group>
      );
    }
    case "tricycle":
      return (
        <group>
          <group position={[0, 0, -d / 2 + 0.3]}>
            <Wheel x={-w / 2 + 0.3} z={0} r={0.3} t={0.12} />
            <Wheel x={w / 2 - 0.3} z={0} r={0.3} t={0.12} />
            <B p={[0, 0.6, 0]} s={[w * 0.6, 0.3, 0.3]} c={DARK} m={0.5} />
          </group>
          <B p={[0, 0.95, d / 4]} s={[w * 0.75, 1.0, d * 0.55]} c={color} m={0.4} r={0.4} />
          <B p={[0, h - 0.04, d / 4]} s={[w * 0.8, 0.08, d * 0.6]} c={DARK} />
          <Wheel x={0} z={d / 2 - 0.1} r={0.3} t={0.12} />
        </group>
      );
    case "box":
    default:
      return (
        <group>
          <B p={[0, h / 2, 0]} s={[w, h, d]} c={color} r={0.5} />
          <B p={[0, h * 0.7, d / 2 + 0.003]} s={[w * 0.5, h * 0.12, 0.005]} c={DARK} />
        </group>
      );
  }
}

export function FurnitureMesh({
  f,
  selected,
  onDown,
}: {
  f: Furniture;
  selected: boolean;
  onDown?: (id: string, x: number, z: number) => void;
}) {
  const lift = f.y ?? FURNITURE[f.type]?.lift ?? 0;
  return (
    <group position={[f.x, lift, f.z]} rotation={[0, (-f.rot * Math.PI) / 180, 0]}>
      <Model f={f} />
      <mesh
        position={[0, f.h / 2, 0]}
        visible={false}
        onPointerDown={
          onDown
            ? (e: ThreeEvent<PointerEvent>) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                onDown(f.id, e.point.x, e.point.z);
              }
            : undefined
        }
      >
        <boxGeometry args={[f.w, Math.max(f.h, 0.1), f.d]} />
      </mesh>
      {selected && (
        <lineSegments position={[0, f.h / 2, 0]} raycast={() => null}>
          <edgesGeometry args={[new BoxGeometry(f.w + 0.06, f.h + 0.06, f.d + 0.06)]} />
          <lineBasicMaterial color="#f5b942" />
        </lineSegments>
      )}
    </group>
  );
}
