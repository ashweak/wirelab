"use client";

import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { CEILING } from "@/data/goldenHouse";
import type { V3 } from "@/editor/editor";
import { colorFor } from "./colors";
import type { SceneCircuit, SceneDevice, SceneRoom } from "./sceneData";

export type { V3 };
export type ViewMode = "real" | "circuit";

export interface EditorHooks {
  rotate: boolean;
  onFloorDown?: (x: number, z: number) => void;
  onFloorMove?: (x: number, z: number) => void;
  onFloorUp?: (x: number, z: number) => void;
  onPartClick?: (id: string) => void;
  preview?: { x: number; z: number; w: number; d: number; ok: boolean } | null;
  ghost?: SceneDevice | null;
}

interface Props {
  rooms: SceneRoom[];
  panel?: { id: string; position: V3; facing: number } | null;
  circuits: SceneCircuit[];
  loose?: SceneDevice[];
  faulty: Set<string>;
  tripped: Set<string>;
  focus: string | null;
  view?: ViewMode;
  editor?: EditorHooks;
  camera?: V3;
}

const PVC = "#e8792b";
const PLATE = "#f4f1ea";
const WALL_T = 0.1;
const CONDUIT_R = 0.022;

/** Text label drawn to a canvas texture (no DOM overlay, no font download). */
function Label({
  text,
  position,
  height = 0.32,
  color = "#cbd5e1",
  bg,
}: {
  text: string;
  position: V3;
  height?: number;
  color?: string;
  bg?: string;
}) {
  const { tex, aspect } = useMemo(() => {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    const font = "600 44px ui-monospace, Menlo, Consolas, monospace";
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 32;
    c.width = w;
    c.height = 64;
    ctx.font = font;
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(text, 16, 34);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return { tex: t, aspect: w / 64 };
  }, [text, color, bg]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <sprite position={position} scale={[height * aspect, height, 1]} raycast={() => null}>
      <spriteMaterial map={tex} transparent depthTest={false} />
    </sprite>
  );
}

/** Axis-aligned conduit: one cylinder per straight run, a ball at each bend. */
function Conduit({ path, color, opacity, glow }: { path: V3[]; color: string; opacity: number; glow: number }) {
  const parts = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    if (len < 1e-4) continue;
    const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const rot: V3 =
      Math.abs(a[0] - b[0]) > 1e-4 ? [0, 0, Math.PI / 2] : Math.abs(a[2] - b[2]) > 1e-4 ? [Math.PI / 2, 0, 0] : [0, 0, 0];
    parts.push(
      <mesh key={`s${i}`} position={mid} rotation={rot} raycast={() => null}>
        <cylinderGeometry args={[CONDUIT_R, CONDUIT_R, len, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} transparent opacity={opacity} />
      </mesh>,
    );
    if (i < path.length - 1)
      parts.push(
        <mesh key={`b${i}`} position={b} raycast={() => null}>
          <sphereGeometry args={[CONDUIT_R * 1.4, 8, 8]} />
          <meshStandardMaterial color={color} transparent opacity={opacity} />
        </mesh>,
      );
  }
  return <group>{parts}</group>;
}

/** Device models, drawn ~2x real size so they read at house scale. */
function Device({
  d,
  tint,
  on,
  opacity,
  onClick,
}: {
  d: SceneDevice;
  tint: string;
  on: boolean;
  opacity: number;
  onClick?: (id: string) => void;
}) {
  const mat = (color: string, extra: Record<string, unknown> = {}) => (
    <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.6} {...extra} />
  );
  const click = onClick
    ? (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick(d.id);
      }
    : undefined;

  let body: React.ReactNode;
  switch (d.type) {
    case "light":
      body = (
        <group>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.05, 24]} />
            {mat(PLATE)}
          </mesh>
          <mesh position={[0, -0.01, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 0.02, 24]} />
            {mat(on ? "#fff4c7" : "#9aa3ad", { emissive: on ? "#ffd977" : "#000", emissiveIntensity: on ? 1.2 : 0 })}
          </mesh>
          <mesh position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.2, 0.012, 6, 24]} />
            {mat(tint)}
          </mesh>
        </group>
      );
      break;
    case "outlet":
    case "switch":
      body = (
        <group rotation={[0, d.facing, 0]}>
          <mesh>
            <boxGeometry args={[0.16, 0.24, 0.025]} />
            {mat(PLATE)}
          </mesh>
          <mesh position={[0, 0, 0.014]}>
            <boxGeometry args={[0.17, 0.25, 0.004]} />
            {mat(tint, { opacity: opacity * 0.9 })}
          </mesh>
          {d.type === "outlet" ? (
            <>
              {[0.05, -0.05].map((y) => (
                <mesh key={y} position={[0, y, 0.018]}>
                  <boxGeometry args={[0.07, 0.06, 0.006]} />
                  {mat("#e9e5dc")}
                </mesh>
              ))}
            </>
          ) : (
            <mesh position={[0, 0, 0.02]} rotation={[0.25, 0, 0]}>
              <boxGeometry args={[0.07, 0.11, 0.015]} />
              {mat("#e9e5dc")}
            </mesh>
          )}
        </group>
      );
      break;
    case "aircon":
      body = (
        <group rotation={[0, d.facing, 0]}>
          <mesh position={[0, 0, 0.1]}>
            <boxGeometry args={[0.85, 0.29, 0.2]} />
            {mat(PLATE)}
          </mesh>
          <mesh position={[0, -0.1, 0.205]}>
            <boxGeometry args={[0.7, 0.04, 0.01]} />
            {mat("#3b4652")}
          </mesh>
          <mesh position={[0.32, 0.06, 0.205]}>
            <boxGeometry args={[0.06, 0.03, 0.005]} />
            {mat(tint, { emissive: tint, emissiveIntensity: on ? 0.8 : 0 })}
          </mesh>
        </group>
      );
      break;
    case "water_heater":
      body = (
        <group rotation={[0, d.facing, 0]}>
          <mesh position={[0, 0, 0.06]}>
            <boxGeometry args={[0.3, 0.45, 0.12]} />
            {mat(PLATE)}
          </mesh>
          <mesh position={[0, 0.1, 0.122]}>
            <boxGeometry args={[0.12, 0.06, 0.005]} />
            {mat("#1f2937", { emissive: tint, emissiveIntensity: on ? 0.5 : 0 })}
          </mesh>
        </group>
      );
      break;
    default:
      body = null;
  }

  return (
    <group position={d.position}>
      {body}
      {/* Generous invisible hit target so small parts are easy to click. */}
      <mesh onClick={click} visible={false}>
        <sphereGeometry args={[0.3, 8, 8]} />
      </mesh>
      {d.tag && <Label text={d.tag} position={[0, 0.35, 0]} height={0.26} color="#0f172a" bg="#f5b942" />}
    </group>
  );
}

function Walls({ rooms }: { rooms: SceneRoom[] }) {
  return (
    <group>
      {rooms.map((r) => {
        const walls: { pos: V3; size: V3 }[] = [
          { pos: [r.x, CEILING / 2, r.z + r.d / 2], size: [WALL_T, CEILING, r.d] },
          { pos: [r.x + r.w, CEILING / 2, r.z + r.d / 2], size: [WALL_T, CEILING, r.d] },
          { pos: [r.x + r.w / 2, CEILING / 2, r.z], size: [r.w, CEILING, WALL_T] },
          { pos: [r.x + r.w / 2, CEILING / 2, r.z + r.d], size: [r.w, CEILING, WALL_T] },
        ];
        return (
          <group key={r.id}>
            <mesh position={[r.x + r.w / 2, 0.005, r.z + r.d / 2]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
              <planeGeometry args={[r.w, r.d]} />
              <meshStandardMaterial color="#3a4553" roughness={0.9} />
            </mesh>
            {walls.map((w, i) => (
              <group key={i}>
                <mesh position={w.pos} raycast={() => null}>
                  <boxGeometry args={w.size} />
                  <meshStandardMaterial color="#d8d1c2" transparent opacity={0.14} depthWrite={false} />
                </mesh>
                <mesh position={[w.pos[0], CEILING + 0.005, w.pos[2]]} raycast={() => null}>
                  <boxGeometry args={[w.size[0], 0.01, w.size[2]]} />
                  <meshStandardMaterial color="#b9b09d" />
                </mesh>
              </group>
            ))}
            <Label text={r.name.toUpperCase()} position={[r.x + r.w / 2, 0.15, r.z + r.d / 2]} color="#94a3b8" />
          </group>
        );
      })}
    </group>
  );
}

export default function HouseScene({
  rooms,
  panel,
  circuits,
  loose = [],
  faulty,
  tripped,
  focus,
  view = "real",
  editor,
  camera = [14, 11, 15],
}: Props) {
  const floor = (fn?: (x: number, z: number) => void) =>
    fn
      ? (e: ThreeEvent<PointerEvent>) => {
          if (e.button === 0 || e.type === "pointermove") fn(e.point.x, e.point.z);
        }
      : undefined;

  return (
    <Canvas camera={{ position: camera, fov: 40 }} dpr={[1, 2]}>
      <color attach="background" args={["#0b1622"]} />
      <hemisphereLight args={["#f1f5f9", "#1e293b", 0.9]} />
      <directionalLight position={[8, 14, 6]} intensity={0.9} />
      <gridHelper args={[30, 60, "#1d3550", "#13263a"]} position={[5, 0, 4]} />

      {editor && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[5, 0.01, 4]}
          onPointerDown={floor(editor.onFloorDown)}
          onPointerMove={floor(editor.onFloorMove)}
          onPointerUp={floor(editor.onFloorUp)}
        >
          <planeGeometry args={[30, 30]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      <Walls rooms={rooms} />

      {editor?.preview && (
        <mesh
          position={[editor.preview.x + editor.preview.w / 2, 0.03, editor.preview.z + editor.preview.d / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <planeGeometry args={[Math.max(editor.preview.w, 0.05), Math.max(editor.preview.d, 0.05)]} />
          <meshBasicMaterial color={editor.preview.ok ? "#f5b942" : "#ef4444"} transparent opacity={0.35} />
        </mesh>
      )}
      {editor?.ghost && <Device d={editor.ghost} tint="#f5b942" on={false} opacity={0.5} />}

      {panel && (
        <group position={panel.position} rotation={[0, panel.facing, 0]}>
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[0.42, 0.55, 0.1]} />
            <meshStandardMaterial color="#9aa5b1" metalness={0.5} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0, 0.102]}>
            <boxGeometry args={[0.36, 0.48, 0.005]} />
            <meshStandardMaterial color="#b8c2cc" metalness={0.4} roughness={0.4} />
          </mesh>
          <mesh
            visible={false}
            onClick={
              editor?.onPartClick
                ? (e: ThreeEvent<MouseEvent>) => {
                    e.stopPropagation();
                    editor.onPartClick!(panel.id);
                  }
                : undefined
            }
          >
            <sphereGeometry args={[0.4, 8, 8]} />
          </mesh>
          <Label text="PANEL" position={[0, 0.45, 0.1]} height={0.24} color="#0f172a" bg="#e2e8f0" />
        </group>
      )}

      {loose.map((d) => (
        <Device key={d.id} d={d} tint="#94a3b8" on={false} opacity={0.95} onClick={editor?.onPartClick} />
      ))}

      {panel &&
        circuits.map((c) => {
          const off = tripped.has(c.id);
          const dim = focus !== null && focus !== c.id;
          const bad = faulty.has(c.id);
          const ckt = colorFor(c.id);
          const pipe = off ? "#475569" : bad ? "#ef4444" : view === "real" ? PVC : ckt;
          const tint = off ? "#475569" : bad ? "#ef4444" : view === "real" ? PLATE : ckt;
          const opacity = dim ? 0.12 : 1;
          return (
            <group key={c.id}>
              {c.paths.map((p, i) => (
                <Conduit key={i} path={p} color={pipe} opacity={opacity} glow={bad && !dim ? 0.5 : 0.08} />
              ))}
              {c.drops.map((p, i) => (
                <mesh key={`j${i}`} position={p} raycast={() => null}>
                  <cylinderGeometry args={[0.07, 0.07, 0.05, 8]} />
                  <meshStandardMaterial color="#8b96a3" transparent opacity={opacity} />
                </mesh>
              ))}
              {c.devices.map((d) => (
                <Device key={d.id} d={d} tint={tint} on={!off} opacity={dim ? 0.15 : 1} onClick={editor?.onPartClick} />
              ))}
            </group>
          );
        })}

      <OrbitControls
        target={[5, 1, 4]}
        enableRotate={editor ? editor.rotate : true}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={3}
        maxDistance={40}
      />
    </Canvas>
  );
}
