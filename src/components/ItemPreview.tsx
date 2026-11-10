"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Group } from "three";
import { FurnitureMesh } from "./Furniture3D";
import { Device, PanelBoard } from "./HouseScene";
import { floorTexture } from "./textures";
import { FURNITURE } from "@/editor/interior";
import { CEILING_MATERIALS, FLOOR_MATERIALS, WALL_MATERIALS } from "@/editor/construction";
import type { EditorPartType, FloorKind, Furniture } from "@/editor/parts";

export type InvItem =
  | { kind: "furniture"; id: string }
  | { kind: "part"; id: EditorPartType }
  | { kind: "wall"; id: string }
  | { kind: "floor"; id: FloorKind }
  | { kind: "ceiling"; id: string };

/** Seconds for one full 360° turn. */
export const TURN_SECONDS = 8;

const CEILING_COLOR: Record<string, string> = {
  gypsum: "#f1f0ec",
  moisture_gypsum: "#d9e7da",
  fibercement: "#c9c6bf",
  pvc: "#f4f4f4",
  wood_tg: "#a87445",
  acoustic: "#e7e4dc",
};

/** Masonry/board face texture for a wall sample. */
function wallTexture(id: string, color: string): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(0,0,0,0.28)";
  g.lineWidth = 3;
  const units: Record<string, [number, number]> = {
    chb100: [0.4, 0.2],
    chb150: [0.4, 0.2],
    aac100: [0.6, 0.2],
    brick100: [0.215, 0.065],
    drywall: [1.22, 2.44],
    fibercement: [1.22, 2.44],
    plywood: [1.22, 2.44],
  };
  const u = units[id];
  if (u) {
    const pw = (u[0] / 1) * 256;
    const ph = (u[1] / 1) * 256;
    for (let row = 0, y = 0; y < 256; row++, y += ph) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y);
      g.stroke();
      for (let x = row % 2 ? pw / 2 : 0; x < 256; x += pw) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + ph);
        g.stroke();
      }
    }
  } else {
    // poured concrete: form-tie dots
    g.fillStyle = "rgba(0,0,0,0.25)";
    for (let x = 32; x < 256; x += 64) for (let y = 32; y < 256; y += 64) g.fillRect(x - 3, y - 3, 6, 6);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Size (w, h, d) of the preview subject in metres, used to frame the camera. */
export function itemSize(item: InvItem): [number, number, number] {
  if (item.kind === "furniture") {
    const f = FURNITURE[item.id];
    return [f.w, f.h + (f.lift ?? 0), f.d];
  }
  if (item.kind === "part") return [0.5, 0.5, 0.5];
  if (item.kind === "wall") return [1, 1, 0.3];
  return [1, 0.1, 1];
}

export function Subject({ item }: { item: InvItem }) {
  const wallTex = useMemo(() => {
    if (item.kind !== "wall") return null;
    const m = WALL_MATERIALS.find((x) => x.id === item.id)!;
    return wallTexture(m.id, m.color);
  }, [item]);
  const floorTex = useMemo(() => {
    if (item.kind !== "floor") return null;
    const m = FLOOR_MATERIALS.find((x) => x.id === item.id)!;
    return floorTexture(m.id, m.color, 1, 1);
  }, [item]);
  switch (item.kind) {
    case "furniture": {
      const d = FURNITURE[item.id];
      const f: Furniture = { id: "preview", type: item.id, roomId: "", x: 0, z: 0, rot: 0, w: d.w, d: d.d, h: d.h, color: d.color };
      return <FurnitureMesh f={f} selected={false} />;
    }
    case "part":
      if (item.id === "panel")
        return (
          <group position={[0, 0.3, -0.05]}>
            <PanelBoard />
          </group>
        );
      return (
        <Device d={{ id: "preview", type: item.id, position: [0, 0.25, 0], facing: Math.PI / 4 }} tint="#d9d4c7" on={false} opacity={1} />
      );
    case "wall": {
      const m = WALL_MATERIALS.find((x) => x.id === item.id)!;
      return (
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[1, 1, Math.max(m.thickness, 0.02)]} />
          <meshStandardMaterial map={wallTex} roughness={0.9} />
        </mesh>
      );
    }
    case "floor":
      return (
        <mesh position={[0, 0.025, 0]}>
          <boxGeometry args={[1, 0.05, 1]} />
          <meshStandardMaterial attach="material-0" color="#777" />
          <meshStandardMaterial attach="material-1" color="#777" />
          <meshStandardMaterial attach="material-2" map={floorTex} roughness={0.6} />
          <meshStandardMaterial attach="material-3" color="#777" />
          <meshStandardMaterial attach="material-4" color="#777" />
          <meshStandardMaterial attach="material-5" color="#777" />
        </mesh>
      );
    case "ceiling":
      return (
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[1, 0.03, 1]} />
          <meshStandardMaterial color={CEILING_COLOR[item.id] ?? "#eee"} roughness={0.8} />
        </mesh>
      );
  }
}

/** The item scaled into a ~1.6 m box and centred on the origin. */
export function Staged({ item }: { item: InvItem }) {
  const [w, h, d] = itemSize(item);
  const s = Math.max(w, h, d, 0.3);
  return (
    <group scale={1.6 / s}>
      <group position={[0, -h / 2, 0]}>
        <Subject item={item} />
      </group>
    </group>
  );
}

function Turntable({ item }: { item: InvItem }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += (dt * Math.PI * 2) / TURN_SECONDS;
  });
  const [w, h, d] = itemSize(item);
  const s = Math.max(w, h, d, 0.3);
  return (
    // scale the subject into a ~1.6 m box so every item fills the frame
    <group ref={ref} scale={1.6 / s}>
      <group position={[0, -h / 2, 0]}>
        <Subject item={item} />
      </group>
    </group>
  );
}

/** One live WebGL view, reused for every hovered slot. */
export default function ItemPreview({ item }: { item: InvItem }) {
  return (
    <Canvas camera={{ position: [1.7, 1.2, 1.7], fov: 40, near: 0.01, far: 50 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={["#0b1220"]} />
      <hemisphereLight args={["#ffffff", "#334155", 1.1]} />
      <directionalLight position={[3, 5, 2]} intensity={1.6} />
      <group key={`${item.kind}-${item.id}`} rotation={[0, 0, 0]}>
        <Turntable item={item} />
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.82, 0]}>
        <circleGeometry args={[1.2, 48]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
    </Canvas>
  );
}

export function itemInfo(item: InvItem): { title: string; lines: string[] } {
  switch (item.kind) {
    case "furniture": {
      const f = FURNITURE[item.id];
      return { title: f.label, lines: [`${f.w} × ${f.d} × ${f.h} m`, f.group] };
    }
    case "wall": {
      const m = WALL_MATERIALS.find((x) => x.id === item.id)!;
      return { title: m.label, lines: [`${Math.round(m.thickness * 1000)} mm wall`, m.note, "Click to apply to the selected room"] };
    }
    case "floor": {
      const m = FLOOR_MATERIALS.find((x) => x.id === item.id)!;
      return { title: m.label, lines: [m.note, "Click to apply to the selected room"] };
    }
    case "ceiling": {
      const m = CEILING_MATERIALS.find((x) => x.id === item.id)!;
      return { title: m.label, lines: [m.note, "Click to apply to the selected room"] };
    }
    default:
      return { title: item.id, lines: [] };
  }
}

export { CEILING_COLOR };
