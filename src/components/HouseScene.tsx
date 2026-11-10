"use client";

import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { BoxGeometry as BoxGeometryImpl, CanvasTexture, Plane, Raycaster, SRGBColorSpace, Vector2, Vector3 } from "three";
import type { OrbitControls as OrbitImpl } from "three-stdlib";
import { CEILING } from "@/data/goldenHouse";
import { defaultFinish, FURNITURE } from "@/editor/interior";
import { WALL_OF, roomSides } from "@/editor/construction";
import { PART_INFO, type FloorKind, type Furniture, type Room } from "@/editor/parts";
import { Environment, Lightformer } from "@react-three/drei";
import { floorTexture } from "./textures";
import { FurnitureMesh } from "./Furniture3D";
import type { V3 } from "@/editor/editor";
import { colorFor } from "./colors";
import type { SceneCircuit, SceneDevice, SceneRoom } from "./sceneData";

export type { V3 };
export type ViewMode = "real" | "circuit";

export type Corner = "nw" | "ne" | "sw" | "se";
export type ViewName = "home" | "top" | "front" | "fit";

export interface SceneApi {
  /** Floor point (y = 0) under a screen position, or null. */
  floorAt: (clientX: number, clientY: number) => [number, number] | null;
  setView: (v: ViewName) => void;
  /** PNG data URL of the current frame. */
  capture: () => string;
}

export interface EditorHooks {
  rotate: boolean;
  selection?: { kind: "room" | "part" | "furniture"; id: string } | null;
  onFurnitureDown?: (id: string, x: number, z: number) => void;
  dragging?: boolean;
  onRoomDown?: (id: string, x: number, z: number) => void;
  onPartDown?: (id: string, x: number, z: number) => void;
  onHandleDown?: (roomId: string, corner: Corner) => void;
  onDragMove?: (x: number, z: number) => void;
  onDragEnd?: () => void;
  apiRef?: MutableRefObject<SceneApi | null>;
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
  furniture?: Furniture[];
  ceiling?: number;
  /** "render" = solid walls, shadows, textured floors. */
  mode?: "edit" | "render";
  lighting?: "day" | "night";
  showWiring?: boolean;
  cutaway?: boolean;
  measure?: { a: [number, number]; b: [number, number] } | null;
}

const PVC = "#e8792b";
const PLATE = "#f4f1ea";
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
  onDown,
}: {
  d: SceneDevice;
  tint: string;
  on: boolean;
  opacity: number;
  onClick?: (id: string) => void;
  onDown?: (id: string, x: number, z: number) => void;
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
  const info = PART_INFO[d.type];
  const lamp = (c: string) => mat(on ? "#fff4c7" : c, { emissive: on ? "#ffd977" : "#000", emissiveIntensity: on ? 1.2 : 0 });
  switch (info?.model) {
    case "fixture":
      body = (
        <group>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.05, 24]} />
            {mat(PLATE)}
          </mesh>
          <mesh position={[0, -0.01, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 0.02, 24]} />
            {lamp("#9aa3ad")}
          </mesh>
          <mesh position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.2, 0.012, 6, 24]} />
            {mat(tint)}
          </mesh>
        </group>
      );
      break;
    case "downlight":
      body = (
        <group>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.09, 0.09, 0.02, 20]} />
            {mat(tint)}
          </mesh>
          <mesh position={[0, 0.015, 0]}>
            <cylinderGeometry args={[0.065, 0.065, 0.01, 20]} />
            {lamp("#c9ced3")}
          </mesh>
        </group>
      );
      break;
    case "fan":
      body = (
        <group>
          <mesh position={[0, -0.1, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.2, 8]} />
            {mat("#5d6a77")}
          </mesh>
          <mesh position={[0, -0.22, 0]}>
            <cylinderGeometry args={[0.09, 0.07, 0.08, 16]} />
            {mat(tint)}
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[Math.cos((i * 2 * Math.PI) / 3) * 0.32, -0.22, Math.sin((i * 2 * Math.PI) / 3) * 0.32]} rotation={[0, -(i * 2 * Math.PI) / 3, 0]}>
              <boxGeometry args={[0.55, 0.01, 0.12]} />
              {mat("#8b6a46")}
            </mesh>
          ))}
        </group>
      );
      break;
    case "exhaust":
      body = (
        <group>
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.28, 0.03, 0.28]} />
            {mat(PLATE)}
          </mesh>
          {[-0.08, -0.04, 0, 0.04, 0.08].map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <boxGeometry args={[0.015, 0.012, 0.22]} />
              {mat(tint)}
            </mesh>
          ))}
        </group>
      );
      break;
    case "detector":
      body = (
        <mesh position={[0, 0.01, 0]}>
          <cylinderGeometry args={[0.07, 0.08, 0.04, 20]} />
          {mat(tint === PLATE ? "#f7f7f5" : tint)}
        </mesh>
      );
      break;
    case "sconce":
      body = (
        <group rotation={[0, d.facing, 0]}>
          <mesh position={[0, 0, 0.02]}>
            <boxGeometry args={[0.12, 0.2, 0.03]} />
            {mat(tint)}
          </mesh>
          <mesh position={[0, 0.02, 0.1]}>
            <cylinderGeometry args={[0.07, 0.1, 0.16, 16]} />
            {lamp("#e8dcc2")}
          </mesh>
        </group>
      );
      break;
    case "emergency":
      body = (
        <group rotation={[0, d.facing, 0]}>
          <mesh position={[0, 0, 0.04]}>
            <boxGeometry args={[0.35, 0.12, 0.08]} />
            {mat(PLATE)}
          </mesh>
          {[-0.12, 0.12].map((x) => (
            <mesh key={x} position={[x, -0.08, 0.08]}>
              <boxGeometry args={[0.08, 0.06, 0.08]} />
              {mat(tint)}
            </mesh>
          ))}
          <mesh position={[0, 0, 0.082]}>
            <boxGeometry args={[0.04, 0.03, 0.005]} />
            {mat("#22c55e", { emissive: "#22c55e", emissiveIntensity: on ? 1 : 0 })}
          </mesh>
        </group>
      );
      break;
    case "camera":
      body = (
        <group rotation={[0, d.facing, 0]}>
          <mesh position={[0, 0, 0.04]}>
            <boxGeometry args={[0.08, 0.08, 0.08]} />
            {mat(tint)}
          </mesh>
          <mesh position={[0, -0.03, 0.14]} rotation={[Math.PI / 2 - 0.3, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.045, 0.18, 16]} />
            {mat(PLATE)}
          </mesh>
          <mesh position={[0, -0.06, 0.235]} rotation={[Math.PI / 2 - 0.3, 0, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.01, 16]} />
            {mat("#111")}
          </mesh>
        </group>
      );
      break;
    case "box":
      body = (
        <group rotation={[0, d.facing, 0]}>
          <mesh position={[0, 0, 0.07]}>
            <boxGeometry args={[0.32, 0.42, 0.14]} />
            {mat(d.type === "ev_charger" ? "#e8ecef" : "#5d6a77")}
          </mesh>
          <mesh position={[0, 0.08, 0.142]}>
            <boxGeometry args={[0.14, 0.06, 0.005]} />
            {mat(tint, { emissive: tint, emissiveIntensity: on ? 0.6 : 0 })}
          </mesh>
        </group>
      );
      break;
    case "plate": {
      const big = d.type === "range_outlet";
      const floor = d.type === "floor_outlet";
      const accent =
        d.type === "gfci_outlet" ? "#c0392b" : d.type === "data_outlet" ? "#2563eb" : d.type === "tv_outlet" ? "#7c3aed" : d.type === "outdoor_outlet" ? "#64748b" : null;
      const plate = (
        <>
          <mesh>
            <boxGeometry args={[big ? 0.24 : 0.16, big ? 0.24 : 0.24, 0.025]} />
            {mat(d.type === "outdoor_outlet" ? "#9aa3ad" : PLATE)}
          </mesh>
          <mesh position={[0, 0, 0.014]}>
            <boxGeometry args={[big ? 0.25 : 0.17, 0.25, 0.004]} />
            {mat(tint, { opacity: opacity * 0.9 })}
          </mesh>
          {d.type === "switch" || d.type === "switch_3way" || d.type === "doorbell" ? (
            <mesh position={[0, 0, 0.02]} rotation={[0.25, 0, 0]}>
              <boxGeometry args={[0.07, d.type === "doorbell" ? 0.07 : 0.11, 0.015]} />
              {mat(d.type === "switch_3way" ? "#d4c9a8" : "#e9e5dc")}
            </mesh>
          ) : (
            [0.05, -0.05].map((y) => (
              <mesh key={y} position={[0, y, 0.018]}>
                <boxGeometry args={[big ? 0.12 : 0.07, 0.06, 0.006]} />
                {mat(accent ?? "#e9e5dc")}
              </mesh>
            ))
          )}
        </>
      );
      body = floor ? <group rotation={[-Math.PI / 2, 0, 0]}>{plate}</group> : <group rotation={[0, d.facing, 0]}>{plate}</group>;
      break;
    }
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
    case "heater":
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
      <mesh
        onClick={click}
        onPointerDown={
          onDown
            ? (e: ThreeEvent<PointerEvent>) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                onDown(d.id, e.point.x, e.point.z);
              }
            : undefined
        }
        visible={false}
      >
        <sphereGeometry args={[0.3, 8, 8]} />
      </mesh>
      {d.tag && <Label text={d.tag} position={[0, 0.35, 0]} height={0.26} color="#0f172a" bg="#f5b942" />}
    </group>
  );
}

function Walls({
  rooms,
  selected,
  onDown,
  render,
  wallH,
}: {
  rooms: SceneRoom[];
  selected?: string;
  onDown?: (id: string, x: number, z: number) => void;
  render: boolean;
  wallH: number;
}) {
  const sides = useMemo(() => roomSides(rooms as Room[]), [rooms]);
  return (
    <group>
      {rooms.map((r) => {
        const fin = defaultFinish({ kind: r.kind ?? "other" });
        const floor = r.floor ?? fin.floor;
        const mat = WALL_OF(r as Room);
        const exposed = ["brick100", "plywood", "concrete150"].includes(mat.id);
        const paint = r.wall ?? (exposed ? mat.color : fin.wall);
        const side = sides[r.id] ?? { left: false, right: false, front: false, back: false };
        // Shared walls: each room draws the half on its own side (no z-fighting, own paint).
        // Exterior walls: the full thickness, centred on the outline, with corners closed.
        const T = mat.thickness;
        const half = T / 2;
        const xw = (shared: boolean, x0: number, inward: number) =>
          shared ? { c: x0 + (inward * half) / 2, t: half } : { c: x0, t: T };
        const L = xw(side.left, r.x, 1);
        const Rt = xw(side.right, r.x + r.w, -1);
        const F = xw(side.front, r.z, 1);
        const Bk = xw(side.back, r.z + r.d, -1);
        const ext = (shared: boolean) => (shared ? 0 : half);
        const walls: { pos: V3; size: V3 }[] = [
          { pos: [L.c, wallH / 2, r.z + r.d / 2], size: [L.t, wallH, r.d] },
          { pos: [Rt.c, wallH / 2, r.z + r.d / 2], size: [Rt.t, wallH, r.d] },
          {
            pos: [r.x + r.w / 2 + (ext(side.right) - ext(side.left)) / 2, wallH / 2, F.c],
            size: [r.w + ext(side.left) + ext(side.right), wallH, F.t],
          },
          {
            pos: [r.x + r.w / 2 + (ext(side.right) - ext(side.left)) / 2, wallH / 2, Bk.c],
            size: [r.w + ext(side.left) + ext(side.right), wallH, Bk.t],
          },
        ];
        return (
          <group key={r.id}>
            <Floor r={r} kind={floor.kind} color={floor.color} render={render} selected={selected === r.id} onDown={onDown} />
            {walls.map((w, i) => (
              <group key={i}>
                <mesh position={w.pos} raycast={() => null} castShadow={render} receiveShadow={render}>
                  <boxGeometry args={w.size} />
                  {render ? (
                    <meshStandardMaterial key="solid" color={paint} roughness={0.92} />
                  ) : (
                    <meshStandardMaterial key="ghost" color={paint} transparent opacity={0.16} depthWrite={false} />
                  )}
                </mesh>
                <mesh position={[w.pos[0], wallH + 0.005, w.pos[2]]} raycast={() => null}>
                  <boxGeometry args={[w.size[0], 0.01, w.size[2]]} />
                  <meshStandardMaterial color={render ? "#3b3f45" : "#b9b09d"} />
                </mesh>
              </group>
            ))}
            {!render && (
              <Label text={r.name.toUpperCase()} position={[r.x + r.w / 2, 0.15, r.z + r.d / 2]} color="#94a3b8" />
            )}
          </group>
        );
      })}
    </group>
  );
}

function Floor({
  r,
  kind,
  color,
  render,
  selected,
  onDown,
}: {
  r: SceneRoom;
  kind: FloorKind;
  color: string;
  render: boolean;
  selected: boolean;
  onDown?: (id: string, x: number, z: number) => void;
}) {
  const map = useMemo(() => floorTexture(kind, color, r.w, r.d), [kind, color, r.w, r.d]);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh
      position={[r.x + r.w / 2, 0.005, r.z + r.d / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      {...(onDown
        ? {
            onPointerDown: (e: ThreeEvent<PointerEvent>) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              onDown(r.id, e.point.x, e.point.z);
            },
          }
        : { raycast: () => null })}
    >
      <planeGeometry args={[r.w, r.d]} />
      <meshStandardMaterial
        map={map}
        color={render ? "#ffffff" : selected ? "#b8a26a" : "#7d8792"}
        roughness={kind === "tile" || kind === "concrete" ? 0.45 : 0.75}
        metalness={0}
      />
    </mesh>
  );
}

const AMBER = "#f5b942";

function SelectedRoom({ r, onHandleDown }: { r: SceneRoom; onHandleDown?: (id: string, c: Corner) => void }) {
  const edges: { pos: V3; size: V3 }[] = [
    { pos: [r.x + r.w / 2, 0.03, r.z], size: [r.w, 0.03, 0.05] },
    { pos: [r.x + r.w / 2, 0.03, r.z + r.d], size: [r.w, 0.03, 0.05] },
    { pos: [r.x, 0.03, r.z + r.d / 2], size: [0.05, 0.03, r.d] },
    { pos: [r.x + r.w, 0.03, r.z + r.d / 2], size: [0.05, 0.03, r.d] },
  ];
  const corners: [Corner, number, number][] = [
    ["nw", r.x, r.z],
    ["ne", r.x + r.w, r.z],
    ["sw", r.x, r.z + r.d],
    ["se", r.x + r.w, r.z + r.d],
  ];
  return (
    <group>
      {edges.map((e, i) => (
        <mesh key={i} position={e.pos} raycast={() => null}>
          <boxGeometry args={e.size} />
          <meshBasicMaterial color={AMBER} />
        </mesh>
      ))}
      {corners.map(([c, x, z]) => (
        <mesh
          key={c}
          position={[x, 0.12, z]}
          onPointerDown={
            onHandleDown
              ? (e: ThreeEvent<PointerEvent>) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  onHandleDown(r.id, c);
                }
              : undefined
          }
          onPointerOver={() => (document.body.style.cursor = "nwse-resize")}
          onPointerOut={() => (document.body.style.cursor = "")}
        >
          <boxGeometry args={[0.28, 0.24, 0.28]} />
          <meshStandardMaterial color="#ffffff" emissive={AMBER} emissiveIntensity={0.6} />
        </mesh>
      ))}
      <Label text={`${r.w.toFixed(2)} m`} position={[r.x + r.w / 2, 0.35, r.z - 0.35]} height={0.3} color="#0f172a" bg={AMBER} />
      <Label text={`${r.d.toFixed(2)} m`} position={[r.x + r.w + 0.55, 0.35, r.z + r.d / 2]} height={0.3} color="#0f172a" bg={AMBER} />
    </group>
  );
}

function SelectedPart({ position }: { position: V3 }) {
  return (
    <lineSegments position={position} raycast={() => null}>
      <edgesGeometry args={[new BoxGeometryImpl(0.55, 0.55, 0.55)]} />
      <lineBasicMaterial color={AMBER} />
    </lineSegments>
  );
}

/* Imperative three.js plumbing: camera, controls and the API ref are mutated on purpose. */
/* eslint-disable react-hooks/immutability */
/** Drag tracking, floor picking and camera presets (lives inside the Canvas). */
function Interaction({
  editor,
  controls,
  rooms,
}: {
  editor?: EditorHooks;
  controls: MutableRefObject<OrbitImpl | null>;
  rooms: SceneRoom[];
}) {
  const { camera, gl, scene } = useThree();
  const roomsRef = useRef(rooms);
  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  const floorAt = useMemo(() => {
    const ray = new Raycaster();
    const plane = new Plane(new Vector3(0, 1, 0), 0);
    const hit = new Vector3();
    return (cx: number, cy: number): [number, number] | null => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectPlane(plane, hit) ? [hit.x, hit.z] : null;
    };
  }, [camera, gl]);

  useEffect(() => {
    if (!editor?.apiRef) return;
    editor.apiRef.current = {
      floorAt,
      capture: () => {
        gl.render(scene, camera);
        return gl.domElement.toDataURL("image/png");
      },
      setView: (v) => {
        const rs = roomsRef.current;
        const minX = rs.length ? Math.min(...rs.map((r) => r.x)) : 0;
        const maxX = rs.length ? Math.max(...rs.map((r) => r.x + r.w)) : 10;
        const minZ = rs.length ? Math.min(...rs.map((r) => r.z)) : 0;
        const maxZ = rs.length ? Math.max(...rs.map((r) => r.z + r.d)) : 8;
        const span = Math.max(maxX - minX, maxZ - minZ, 6);
        // Shift left a little so the house sits clear of the shape library overlay.
        const cx = (minX + maxX) / 2 - span * 0.08;
        const cz = (minZ + maxZ) / 2;
        const pos: Record<ViewName, V3> = {
          home: [cx + span * 1.05, span * 1.15, cz + span * 1.45],
          top: [cx, span * 1.6, cz + 0.01],
          front: [cx, 2.5, cz + span * 1.5],
          fit: [cx + span * 0.7, span * 1.3, cz + span * 1.1],
        };
        camera.position.set(...pos[v]);
        controls.current?.target.set(cx, 0.8, cz);
        controls.current?.update();
      },
    };
  }, [editor?.apiRef, floorAt, camera, controls, gl, scene]);

  const dragging = editor?.dragging;
  const onMove = editor?.onDragMove;
  const onEnd = editor?.onDragEnd;
  useEffect(() => {
    if (!dragging) {
      if (controls.current) controls.current.enabled = true;
      return;
    }
    if (controls.current) controls.current.enabled = false;
    const move = (e: PointerEvent) => {
      const p = floorAt(e.clientX, e.clientY);
      if (p) onMove?.(p[0], p[1]);
    };
    const up = () => onEnd?.();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, onMove, onEnd, floorAt, controls]);

  return null;
}
/* eslint-enable react-hooks/immutability */

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
  furniture = [],
  ceiling = CEILING,
  mode = "edit",
  lighting = "day",
  showWiring = true,
  cutaway = false,
  measure = null,
}: Props) {
  const render = mode === "render";
  const night = render && lighting === "night";
  const wallH = render && cutaway ? 1.1 : ceiling;
  const wiringVisible = !render || showWiring;
  // In a cutaway render, anything mounted above the cut (lights, panel, aircon) would float, so hide it.
  const above = (d: { position: V3 }) => render && cutaway && d.position[1] > wallH;
  const lit = useMemo(
    () =>
      circuits
        .flatMap((c) => (tripped.has(c.id) ? [] : c.devices.filter((d) => d.type === "light" || d.type === "downlight")))
        .slice(0, 24),
    [circuits, tripped],
  );
  const controls = useRef<OrbitImpl | null>(null);
  const grab =
    <A extends unknown[]>(fn?: (...a: A) => void) =>
    fn
      ? (...a: A) => {
          if (controls.current) controls.current.enabled = false;
          window.addEventListener(
            "pointerup",
            () => {
              if (controls.current) controls.current.enabled = true;
            },
            { once: true },
          );
          fn(...a);
        }
      : undefined;
  const sel = editor?.selection;
  const selRoom = sel?.kind === "room" ? rooms.find((r) => r.id === sel.id) : undefined;
  const selPart =
    sel?.kind === "part"
      ? [...loose, ...circuits.flatMap((c) => c.devices), ...(panel ? [panel] : [])].find((d) => d.id === sel.id)
      : undefined;
  const floor = (fn?: (x: number, z: number) => void) =>
    fn
      ? (e: ThreeEvent<PointerEvent>) => {
          if (e.button === 0 || e.type === "pointermove") fn(e.point.x, e.point.z);
        }
      : undefined;

  return (
    <Canvas camera={{ position: camera, fov: 40 }} dpr={[1, 2]} shadows gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={[night ? "#05080d" : render ? "#c9d3dc" : "#0b1622"]} />
      {render ? (
        <>
          <hemisphereLight args={["#ffffff", "#8a8172", night ? 0.04 : 0.45]} />
          {!night && (
            <directionalLight
              position={[14, 20, 9]}
              intensity={2.2}
              castShadow
              shadow-mapSize={[2048, 2048]}
              shadow-bias={-0.0004}
              shadow-normalBias={0.02}
              shadow-camera-left={-16}
              shadow-camera-right={16}
              shadow-camera-top={16}
              shadow-camera-bottom={-16}
              shadow-camera-near={1}
              shadow-camera-far={60}
            >
              <object3D attach="target" position={[5, 0, 4]} />
            </directionalLight>
          )}
          <Environment resolution={128} environmentIntensity={night ? 0.06 : 0.6}>
            <Lightformer form="rect" intensity={2} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
            <Lightformer form="rect" intensity={1} position={[-10, 4, 6]} rotation-y={Math.PI / 2} scale={[12, 4, 1]} />
            <Lightformer form="rect" intensity={0.6} color="#ffe7c2" position={[10, 3, -6]} rotation-y={-Math.PI / 2} scale={[12, 4, 1]} />
          </Environment>
          {night &&
            lit.map((d) => (
              <pointLight
                key={d.id}
                position={[d.position[0], d.position[1] - 0.15, d.position[2]]}
                color="#ffd9a3"
                intensity={4}
                distance={6}
                decay={1.6}
              />
            ))}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[5, -0.01, 4]} receiveShadow raycast={() => null}>
            <planeGeometry args={[80, 80]} />
            <meshStandardMaterial color={night ? "#0b0f14" : "#a7b0a0"} roughness={1} />
          </mesh>
        </>
      ) : (
        <>
          <hemisphereLight args={["#f1f5f9", "#1e293b", 0.9]} />
          <directionalLight position={[8, 14, 6]} intensity={0.9} />
          <gridHelper args={[30, 60, "#1d3550", "#13263a"]} position={[5, 0, 4]} />
        </>
      )}

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

      <Walls rooms={rooms} selected={selRoom?.id} onDown={grab(editor?.onRoomDown)} render={render} wallH={wallH} />
      {furniture.filter((f) => !(render && cutaway && FURNITURE[f.type]?.wallMount)).map((f) => (
        <FurnitureMesh
          key={f.id}
          f={f}
          selected={sel?.kind === "furniture" && sel.id === f.id}
          onDown={grab(editor?.onFurnitureDown)}
        />
      ))}
      {selRoom && <SelectedRoom r={selRoom} onHandleDown={grab(editor?.onHandleDown)} />}
      {selPart && <SelectedPart position={selPart.position} />}
      <Interaction editor={editor} controls={controls} rooms={rooms} />

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

      {panel && !above(panel) && (
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
            onPointerDown={
              editor?.onPartDown
                ? (e: ThreeEvent<PointerEvent>) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    grab(editor.onPartDown)!(panel.id, e.point.x, e.point.z);
                  }
                : undefined
            }
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

      {measure && (
        <group>
          <Line
            points={[
              [measure.a[0], 0.06, measure.a[1]],
              [measure.b[0], 0.06, measure.b[1]],
            ]}
            color="#dc2626"
            lineWidth={2.5}
            depthTest={false}
          />
          {[measure.a, measure.b].map((q, i) => (
            <mesh key={i} position={[q[0], 0.06, q[1]]} raycast={() => null}>
              <sphereGeometry args={[0.07, 12, 12]} />
              <meshBasicMaterial color="#dc2626" depthTest={false} />
            </mesh>
          ))}
          <Label
            text={`${Math.hypot(measure.b[0] - measure.a[0], measure.b[1] - measure.a[1]).toFixed(2)} m`}
            position={[(measure.a[0] + measure.b[0]) / 2, 0.45, (measure.a[1] + measure.b[1]) / 2]}
            height={0.32}
            color="#ffffff"
            bg="#dc2626"
          />
        </group>
      )}
      {loose.filter((d) => !above(d)).map((d) => (
        <Device
          key={d.id}
          d={d}
          tint="#94a3b8"
          on={false}
          opacity={0.95}
          onClick={editor?.onPartClick}
          onDown={grab(editor?.onPartDown)}
        />
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
              {wiringVisible && c.paths.map((p, i) => (
                <Conduit key={i} path={p} color={pipe} opacity={opacity} glow={bad && !dim ? 0.5 : 0.08} />
              ))}
              {wiringVisible && c.drops.map((p, i) => (
                <mesh key={`j${i}`} position={p} raycast={() => null}>
                  <cylinderGeometry args={[0.07, 0.07, 0.05, 8]} />
                  <meshStandardMaterial color="#8b96a3" transparent opacity={opacity} />
                </mesh>
              ))}
              {c.devices.filter((d) => !above(d)).map((d) => (
                <Device
                  key={d.id}
                  d={d}
                  tint={tint}
                  on={!off}
                  opacity={dim ? 0.15 : 1}
                  onClick={editor?.onPartClick}
                  onDown={grab(editor?.onPartDown)}
                />
              ))}
            </group>
          );
        })}

      <OrbitControls
        ref={controls}
        makeDefault
        target={[5, 1, 4]}
        enableRotate={editor ? editor.rotate : true}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={3}
        maxDistance={40}
      />
    </Canvas>
  );
}
