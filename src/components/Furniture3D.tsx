"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { BoxGeometry } from "three";
import type { Furniture } from "@/editor/parts";

type V3 = [number, number, number];

/** Box helper: centre (x, y, z) in the piece's local frame, size (w, h, d). */
function B({ p, s, c, o = 1, m = 0, r = 0.7 }: { p: V3; s: V3; c: string; o?: number; m?: number; r?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} transparent={o < 1} opacity={o} metalness={m} roughness={r} />
    </mesh>
  );
}

const WOOD = "#7a5a3c";
const WHITE = "#f4f2ec";
const DARK = "#2b3037";

function Model({ f }: { f: Furniture }) {
  const { w, d, h, color } = f;
  const leg = (x: number, z: number, lh: number, c = WOOD) => <B key={`${x},${z}`} p={[x, lh / 2, z]} s={[0.05, lh, 0.05]} c={c} />;
  switch (f.type) {
    case "bed_single":
    case "bed_double":
      return (
        <group>
          <B p={[0, 0.15, 0]} s={[w, 0.3, d]} c={WOOD} />
          <B p={[0, 0.4, 0.04]} s={[w - 0.06, 0.2, d - 0.1]} c={WHITE} r={0.9} />
          <B p={[0, h - 0.04, 0.25]} s={[w - 0.02, 0.06, d * 0.62]} c={color} r={0.95} />
          {(f.type === "bed_double" ? [-w / 4, w / 4] : [0]).map((x) => (
            <B key={x} p={[x, 0.56, -d / 2 + 0.25]} s={[f.type === "bed_double" ? w / 2 - 0.1 : w - 0.2, 0.12, 0.35]} c={WHITE} r={0.95} />
          ))}
          <B p={[0, 0.5, -d / 2 + 0.03]} s={[w, 1.0, 0.06]} c={WOOD} />
        </group>
      );
    case "sofa":
      return (
        <group>
          <B p={[0, 0.22, 0.05]} s={[w, 0.44, d - 0.1]} c={color} r={0.95} />
          <B p={[0, h / 2 + 0.1, -d / 2 + 0.1]} s={[w, h - 0.2, 0.2]} c={color} r={0.95} />
          <B p={[-w / 2 + 0.09, 0.33, 0.05]} s={[0.18, 0.62, d - 0.1]} c={color} r={0.95} />
          <B p={[w / 2 - 0.09, 0.33, 0.05]} s={[0.18, 0.62, d - 0.1]} c={color} r={0.95} />
          {[-1, 1].map((k) => (
            <B key={k} p={[(k * (w - 0.36)) / 4, 0.49, 0.08]} s={[(w - 0.4) / 2 - 0.02, 0.1, d - 0.32]} c={color} r={1} />
          ))}
        </group>
      );
    case "coffee_table":
    case "dining_table":
    case "desk":
      return (
        <group>
          <B p={[0, h - 0.02, 0]} s={[w, 0.04, d]} c={color} />
          {leg(-w / 2 + 0.06, -d / 2 + 0.06, h - 0.04, color)}
          {leg(w / 2 - 0.06, -d / 2 + 0.06, h - 0.04, color)}
          {leg(-w / 2 + 0.06, d / 2 - 0.06, h - 0.04, color)}
          {leg(w / 2 - 0.06, d / 2 - 0.06, h - 0.04, color)}
        </group>
      );
    case "chair":
      return (
        <group>
          <B p={[0, 0.45, 0]} s={[w, 0.05, d]} c={color} />
          <B p={[0, 0.45 + (h - 0.45) / 2, -d / 2 + 0.025]} s={[w, h - 0.45, 0.05]} c={color} />
          {leg(-w / 2 + 0.04, -d / 2 + 0.04, 0.43, color)}
          {leg(w / 2 - 0.04, -d / 2 + 0.04, 0.43, color)}
          {leg(-w / 2 + 0.04, d / 2 - 0.04, 0.43, color)}
          {leg(w / 2 - 0.04, d / 2 - 0.04, 0.43, color)}
        </group>
      );
    case "wardrobe":
      return (
        <group>
          <B p={[0, h / 2, 0]} s={[w, h, d]} c={color} />
          <B p={[0, h / 2, d / 2 + 0.003]} s={[0.01, h - 0.1, 0.005]} c={DARK} />
          {[-0.05, 0.05].map((x) => (
            <B key={x} p={[x, h / 2, d / 2 + 0.015]} s={[0.02, 0.25, 0.02]} c="#c9b98f" m={0.6} r={0.3} />
          ))}
        </group>
      );
    case "tv_stand":
      return (
        <group>
          <B p={[0, h / 2, 0]} s={[w, h, d]} c={color} />
          <B p={[0, h + 0.33, -d / 2 + 0.12]} s={[Math.min(w * 0.9, 1.45), 0.62, 0.04]} c="#0e1116" m={0.3} r={0.2} />
          <B p={[0, h + 0.02, -d / 2 + 0.12]} s={[0.3, 0.04, 0.18]} c={DARK} />
        </group>
      );
    case "counter":
      return (
        <group>
          <B p={[0, (h - 0.04) / 2, 0]} s={[w, h - 0.04, d]} c={color} />
          <B p={[0, h - 0.02, 0.01]} s={[w + 0.02, 0.04, d + 0.02]} c="#5a5f66" r={0.35} />
          <B p={[w / 4, h - 0.05, 0]} s={[0.5, 0.06, 0.38]} c="#aeb6bf" m={0.8} r={0.25} />
        </group>
      );
    case "fridge":
      return (
        <group>
          <B p={[0, h / 2, 0]} s={[w, h, d]} c={color} m={0.4} r={0.35} />
          <B p={[0, h * 0.68, d / 2 + 0.003]} s={[w - 0.02, 0.01, 0.005]} c={DARK} />
          <B p={[w / 2 - 0.06, h * 0.82, d / 2 + 0.02]} s={[0.025, 0.3, 0.025]} c="#9aa3ad" m={0.8} r={0.3} />
          <B p={[w / 2 - 0.06, h * 0.4, d / 2 + 0.02]} s={[0.025, 0.4, 0.025]} c="#9aa3ad" m={0.8} r={0.3} />
        </group>
      );
    case "toilet":
      return (
        <group>
          <mesh position={[0, 0.2, 0.08]} castShadow receiveShadow>
            <cylinderGeometry args={[w / 2, w / 2.6, 0.4, 20]} />
            <meshStandardMaterial color={color} roughness={0.2} />
          </mesh>
          <B p={[0, 0.42, 0.08]} s={[w, 0.04, d * 0.62]} c={color} r={0.2} />
          <B p={[0, 0.58, -d / 2 + 0.1]} s={[w, h - 0.4, 0.2]} c={color} r={0.2} />
        </group>
      );
    case "vanity":
      return (
        <group>
          <B p={[0, (h - 0.04) / 2, 0]} s={[w, h - 0.04, d]} c={WOOD} />
          <B p={[0, h - 0.02, 0]} s={[w, 0.04, d]} c={color} r={0.25} />
          <mesh position={[0, h - 0.03, 0.02]}>
            <cylinderGeometry args={[Math.min(w, d) * 0.3, Math.min(w, d) * 0.25, 0.05, 20]} />
            <meshStandardMaterial color="#ffffff" roughness={0.15} />
          </mesh>
          <B p={[0, h + 0.4, -d / 2 + 0.01]} s={[w * 0.8, 0.6, 0.02]} c="#cfe3ee" m={0.9} r={0.05} />
        </group>
      );
    case "shower":
      return (
        <group>
          <B p={[0, 0.04, 0]} s={[w, 0.08, d]} c={WHITE} r={0.3} />
          <B p={[0, h / 2, d / 2 - 0.01]} s={[w, h, 0.02]} c={color} o={0.25} m={0.1} r={0.05} />
          <B p={[w / 2 - 0.01, h / 2, 0]} s={[0.02, h, d]} c={color} o={0.25} m={0.1} r={0.05} />
          <B p={[-w / 2 + 0.15, h - 0.15, -d / 2 + 0.08]} s={[0.18, 0.02, 0.18]} c="#9aa3ad" m={0.8} r={0.3} />
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
  return (
    <group position={[f.x, 0, f.z]} rotation={[0, (-f.rot * Math.PI) / 180, 0]}>
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
        <boxGeometry args={[f.w, f.h, f.d]} />
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
