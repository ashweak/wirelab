"use client";

import { Canvas } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import { BoxGeometry } from "three";
import type { Project } from "@/engine/types";
import { CEILING, PANEL_POSITION, ROOMS } from "@/data/goldenHouse";
import { colorFor } from "./colors";

type V3 = [number, number, number];

interface Props {
  project: Project;
  /** Circuits with a failing check. */
  faulty: Set<string>;
  /** Circuits whose breaker has tripped in demo mode. */
  tripped: Set<string>;
  /** Circuit to highlight, or null for all. */
  focus: string | null;
}

/** Orthogonal route: panel -> up to ceiling -> along x -> along z -> down. */
function route(to: V3, lane: number): V3[] {
  const [px, py, pz] = PANEL_POSITION;
  const y = CEILING - 0.12 - lane * 0.05;
  return [
    [px, py, pz],
    [px, y, pz],
    [to[0], y, pz],
    [to[0], y, to[2]],
    to,
  ];
}

function Walls() {
  return (
    <group>
      {ROOMS.map((r) => (
        <group key={r.id}>
          <mesh position={[r.x + r.w / 2, 0.01, r.z + r.d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[r.w - 0.06, r.d - 0.06]} />
            <meshStandardMaterial color="#132235" />
          </mesh>
          <lineSegments position={[r.x + r.w / 2, CEILING / 2, r.z + r.d / 2]}>
            <edgesGeometry args={[new BoxGeometry(r.w, CEILING, r.d)]} />
            <lineBasicMaterial color="#2c4a6b" />
          </lineSegments>
          <Html position={[r.x + r.w / 2, 0.05, r.z + r.d / 2]} center>
            <span className="pointer-events-none whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-slate-400">
              {r.name}
            </span>
          </Html>
        </group>
      ))}
    </group>
  );
}

export default function HouseScene({ project, faulty, tripped, focus }: Props) {
  return (
    <Canvas camera={{ position: [14, 11, 15], fov: 40 }} dpr={[1, 2]}>
      <color attach="background" args={["#0b1622"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[8, 12, 6]} intensity={0.8} />
      <gridHelper args={[30, 30, "#1d3550", "#13263a"]} position={[5, 0, 4]} />
      <Walls />

      {/* Panelboard */}
      <mesh position={PANEL_POSITION}>
        <boxGeometry args={[0.12, 0.6, 0.45]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.4} />
      </mesh>
      <Html position={[PANEL_POSITION[0], PANEL_POSITION[1] + 0.5, PANEL_POSITION[2]]} center>
        <span className="pointer-events-none rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-900">
          PANEL
        </span>
      </Html>

      {project.circuits.map((c, lane) => {
        const off = tripped.has(c.id);
        const dim = focus !== null && focus !== c.id;
        const bad = faulty.has(c.id);
        const color = off ? "#475569" : bad ? "#ef4444" : colorFor(c.id);
        const opacity = dim ? 0.12 : 1;
        return (
          <group key={c.id}>
            {c.parts.map((p) =>
              p.position ? (
                <group key={p.id}>
                  <Line
                    points={route(p.position, lane)}
                    color={color}
                    lineWidth={bad && !dim ? 2.2 : 1.4}
                    transparent
                    opacity={dim ? 0.08 : 0.85}
                    dashed={off}
                    dashSize={0.15}
                    gapSize={0.1}
                  />
                  <mesh position={p.position}>
                    {p.type === "lighting_outlet" ? (
                      <sphereGeometry args={[0.13, 16, 16]} />
                    ) : (
                      <boxGeometry args={[0.22, 0.22, 0.22]} />
                    )}
                    <meshStandardMaterial
                      color={color}
                      emissive={off ? "#000000" : color}
                      emissiveIntensity={p.type === "lighting_outlet" && !off ? 0.9 : 0.25}
                      transparent
                      opacity={opacity}
                    />
                  </mesh>
                </group>
              ) : null,
            )}
          </group>
        );
      })}

      <OrbitControls target={[5, 1, 4]} maxPolarAngle={Math.PI / 2.1} minDistance={6} maxDistance={40} />
    </Canvas>
  );
}
