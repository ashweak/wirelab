"use client";

import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { BoxGeometry, CanvasTexture, SRGBColorSpace } from "three";
import { CEILING } from "@/data/goldenHouse";
import { colorFor } from "./colors";

export type V3 = [number, number, number];

export interface SceneRoom {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface ScenePart {
  id: string;
  type: string;
  position?: V3;
}

export interface SceneCircuit {
  id: string;
  parts: ScenePart[];
}

export interface EditorHooks {
  rotate: boolean;
  onFloorDown?: (x: number, z: number) => void;
  onFloorMove?: (x: number, z: number) => void;
  onFloorUp?: (x: number, z: number) => void;
  onPartClick?: (id: string) => void;
  preview?: { x: number; z: number; w: number; d: number; ok: boolean } | null;
  ghost?: { position: V3; type: string } | null;
}

interface Props {
  rooms: SceneRoom[];
  panel?: V3 | null;
  circuits: SceneCircuit[];
  /** Parts not on any circuit yet (drawn grey). */
  loose?: ScenePart[];
  faulty: Set<string>;
  tripped: Set<string>;
  focus: string | null;
  editor?: EditorHooks;
  camera?: V3;
}

/** Orthogonal route: panel -> up to ceiling -> along x -> along z -> down. */
function route(from: V3, to: V3, lane: number): V3[] {
  const y = CEILING - 0.12 - lane * 0.05;
  return [from, [from[0], y, from[2]], [to[0], y, from[2]], [to[0], y, to[2]], to];
}

/** Text label drawn to a canvas texture (no DOM overlay, no font download). */
function Label({ text, position, height = 0.32, color = "#94a3b8", bg }: {
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

function PartMesh({
  part,
  color,
  glow,
  opacity,
  onClick,
}: {
  part: ScenePart;
  color: string;
  glow: number;
  opacity: number;
  onClick?: (id: string) => void;
}) {
  if (!part.position) return null;
  return (
    <mesh
      position={part.position}
      onClick={
        onClick
          ? (e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onClick(part.id);
            }
          : undefined
      }
    >
      {part.type === "light" || part.type === "lighting_outlet" ? (
        <sphereGeometry args={[0.13, 16, 16]} />
      ) : part.type === "aircon" || part.type === "aircon_outlet" ? (
        <boxGeometry args={[0.25, 0.3, 0.8]} />
      ) : (
        <boxGeometry args={[0.22, 0.22, 0.22]} />
      )}
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} transparent opacity={opacity} />
    </mesh>
  );
}

function Walls({ rooms }: { rooms: SceneRoom[] }) {
  return (
    <group>
      {rooms.map((r) => (
        <group key={r.id}>
          <mesh position={[r.x + r.w / 2, 0.01, r.z + r.d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[Math.max(r.w - 0.06, 0.1), Math.max(r.d - 0.06, 0.1)]} />
            <meshStandardMaterial color="#132235" />
          </mesh>
          <lineSegments position={[r.x + r.w / 2, CEILING / 2, r.z + r.d / 2]}>
            <edgesGeometry args={[new BoxGeometry(r.w, CEILING, r.d)]} />
            <lineBasicMaterial color="#2c4a6b" />
          </lineSegments>
          <Label text={r.name.toUpperCase()} position={[r.x + r.w / 2, 0.2, r.z + r.d / 2]} />
        </group>
      ))}
    </group>
  );
}

export default function HouseScene({ rooms, panel, circuits, loose = [], faulty, tripped, focus, editor, camera = [14, 11, 15] }: Props) {
  const floor = (fn?: (x: number, z: number) => void) =>
    fn
      ? (e: ThreeEvent<PointerEvent>) => {
          if (e.button === 0 || e.type === "pointermove") fn(e.point.x, e.point.z);
        }
      : undefined;

  return (
    <Canvas camera={{ position: camera, fov: 40 }} dpr={[1, 2]}>
      <color attach="background" args={["#0b1622"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[8, 12, 6]} intensity={0.8} />
      <gridHelper args={[30, 60, "#1d3550", "#13263a"]} position={[5, 0, 4]} />

      {editor && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[5, 0, 4]}
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
        >
          <planeGeometry args={[Math.max(editor.preview.w, 0.05), Math.max(editor.preview.d, 0.05)]} />
          <meshBasicMaterial color={editor.preview.ok ? "#f5b942" : "#ef4444"} transparent opacity={0.35} />
        </mesh>
      )}
      {editor?.ghost && (
        <PartMesh part={{ id: "ghost", ...editor.ghost }} color="#f5b942" glow={0.6} opacity={0.5} />
      )}

      {panel && (
        <>
          <mesh
            position={panel}
            onClick={
              editor?.onPartClick
                ? (e: ThreeEvent<MouseEvent>) => {
                    e.stopPropagation();
                    editor.onPartClick!("__panel__");
                  }
                : undefined
            }
          >
            <boxGeometry args={[0.45, 0.6, 0.45]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.4} />
          </mesh>
          <Label text="PANEL" position={[panel[0], panel[1] + 0.55, panel[2]]} height={0.28} color="#0f172a" bg="#e2e8f0" />
        </>
      )}

      {loose.map((p) => (
        <PartMesh key={p.id} part={p} color="#94a3b8" glow={0.1} opacity={0.9} onClick={editor?.onPartClick} />
      ))}

      {panel &&
        circuits.map((c, lane) => {
          const off = tripped.has(c.id);
          const dim = focus !== null && focus !== c.id;
          const bad = faulty.has(c.id);
          const color = off ? "#475569" : bad ? "#ef4444" : colorFor(c.id);
          return (
            <group key={c.id}>
              {c.parts.map((p) =>
                p.position ? (
                  <group key={p.id}>
                    <Line
                      points={route(panel, p.position, lane)}
                      color={color}
                      lineWidth={bad && !dim ? 2.2 : 1.4}
                      transparent
                      opacity={dim ? 0.08 : 0.85}
                      dashed={off}
                      dashSize={0.15}
                      gapSize={0.1}
                    />
                    <PartMesh
                      part={p}
                      color={color}
                      glow={(p.type === "lighting_outlet" || p.type === "light") && !off ? 0.9 : 0.25}
                      opacity={dim ? 0.12 : 1}
                      onClick={editor?.onPartClick}
                    />
                  </group>
                ) : null,
              )}
            </group>
          );
        })}

      <OrbitControls
        target={[5, 1, 4]}
        enableRotate={editor ? editor.rotate : true}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={4}
        maxDistance={40}
      />
    </Canvas>
  );
}
