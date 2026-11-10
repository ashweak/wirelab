"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WALL_OF, roomSides, FLOOR_MATERIALS } from "@/editor/construction";
import { FURNITURE, defaultFinish, footprint } from "@/editor/interior";
import { PART_INFO, type EditorDoc, type EditorPartType, type V3 } from "@/editor/parts";
import type { Schedule } from "@/engine/types";
import { colorFor } from "./colors";
import type { Corner } from "./HouseScene";
import type { SceneCircuit, SceneDevice } from "./sceneData";

export interface PlanApi {
  fit: () => void;
  floorAt: (clientX: number, clientY: number) => [number, number] | null;
}

interface Props {
  doc: EditorDoc;
  mode: "floor" | "circuit";
  circuits: SceneCircuit[];
  schedule: Schedule | null;
  panel: SceneDevice | null;
  loose: SceneDevice[];
  selection: { kind: "room" | "part" | "furniture"; id: string } | null;
  dragging: boolean;
  /** Pan the sheet when dragging empty paper (select tool). */
  panOnEmpty: boolean;
  preview: { x: number; z: number; w: number; d: number; ok: boolean } | null;
  ghost: SceneDevice | null;
  measure: { a: [number, number]; b: [number, number] } | null;
  title: string;
  toolbar?: React.ReactNode;
  apiRef?: React.MutableRefObject<PlanApi | null>;
  onRoomDown: (id: string, x: number, z: number) => void;
  onPartDown: (id: string, x: number, z: number) => void;
  onFurnitureDown: (id: string, x: number, z: number) => void;
  onHandleDown: (id: string, c: Corner) => void;
  onFloorDown: (x: number, z: number) => void;
  onFloorMove: (x: number, z: number) => void;
  onFloorUp: (x: number, z: number) => void;
  onDragMove: (x: number, z: number) => void;
  onDragEnd: () => void;
}

const INK = "#1f2933";
const PAPER = "#fbfaf6";
const AMBER = "#d97706";
const MONO = "ui-monospace, Menlo, Consolas, monospace";

/** Pick a "nice" scale-bar length (m) close to the target. */
function niceLength(target: number) {
  const steps = [0.5, 1, 2, 5, 10, 20, 50];
  return steps.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
}

export default function PlanView(p: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ k: 50, ox: 120, oy: 90 });
  const pan = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const props = useRef(p);
  useEffect(() => {
    props.current = p;
  });

  const toWorld = (cx: number, cy: number): [number, number] => {
    const r = wrap.current!.getBoundingClientRect();
    return [(cx - r.left - view.ox) / view.k, (cy - r.top - view.oy) / view.k];
  };
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Track the container size.
  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useMemo(
    () => () => {
      const rs = props.current.doc.rooms;
      const fs = props.current.doc.furniture ?? [];
      const xs = [...rs.flatMap((r) => [r.x, r.x + r.w]), ...fs.flatMap((f) => [f.x - f.w / 2, f.x + f.w / 2])];
      const zs = [...rs.flatMap((r) => [r.z, r.z + r.d]), ...fs.flatMap((f) => [f.z - f.d / 2, f.z + f.d / 2])];
      const minX = xs.length ? Math.min(...xs) : 0;
      const maxX = xs.length ? Math.max(...xs) : 10;
      const minZ = zs.length ? Math.min(...zs) : 0;
      const maxZ = zs.length ? Math.max(...zs) : 8;
      const el = wrap.current;
      const W = el?.clientWidth ?? 800;
      const H = el?.clientHeight ?? 600;
      // Leave room for the library (left), legend (right) and title block (bottom).
      const availW = W - 230 - (props.current.mode === "circuit" ? 250 : 60);
      const availH = H - 170;
      const k = Math.max(8, Math.min(availW / (maxX - minX + 2), availH / (maxZ - minZ + 2), 140));
      setView({ k, ox: 230 + (availW - (maxX - minX) * k) / 2 - minX * k, oy: 70 + (availH - (maxZ - minZ) * k) / 2 - minZ * k });
    },
    [],
  );
  useEffect(() => {
    if (p.apiRef)
      p.apiRef.current = {
        fit,
        floorAt: (cx, cy) => {
          const el = wrap.current;
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const v = viewRef.current;
          return [(cx - r.left - v.ox) / v.k, (cy - r.top - v.oy) / v.k];
        },
      };
  }, [p.apiRef, fit]);
  useEffect(() => {
    fit();
  }, [fit, p.mode]);

  // Pointer tracking for drags, pans, hover and placement.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const v = viewRef.current;
      const el = wrap.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const world: [number, number] = [(e.clientX - r.left - v.ox) / v.k, (e.clientY - r.top - v.oy) / v.k];
      if (pan.current) {
        const dx = e.clientX - pan.current.x;
        const dy = e.clientY - pan.current.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) pan.current.moved = true;
        setView((cur) => ({ ...cur, ox: pan.current!.ox + dx, oy: pan.current!.oy + dy }));
        return;
      }
      if (props.current.dragging) props.current.onDragMove(world[0], world[1]);
      else if (e.target instanceof Node && el.contains(e.target)) props.current.onFloorMove(world[0], world[1]);
    };
    const up = (e: PointerEvent) => {
      const v = viewRef.current;
      const el = wrap.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const world: [number, number] = [(e.clientX - r.left - v.ox) / v.k, (e.clientY - r.top - v.oy) / v.k];
      const wasPan = pan.current;
      pan.current = null;
      if (props.current.dragging) {
        props.current.onDragEnd();
        props.current.onFloorUp(world[0], world[1]);
        return;
      }
      if (wasPan && wasPan.moved) return;
      if (e.target instanceof Node && el.contains(e.target)) props.current.onFloorUp(world[0], world[1]);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const f = Math.exp(-e.deltaY * 0.0015);
    setView((v) => {
      const k = Math.min(400, Math.max(4, v.k * f));
      return { k, ox: mx - ((mx - v.ox) * k) / v.k, oy: my - ((my - v.oy) * k) / v.k };
    });
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && p.panOnEmpty)) {
      pan.current = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy, moved: false };
      return;
    }
    if (e.button === 0) {
      const [x, z] = toWorld(e.clientX, e.clientY);
      p.onFloorDown(x, z);
    }
  };
  const down =
    (fn: (id: string, x: number, z: number) => void, id: string) =>
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const [x, z] = toWorld(e.clientX, e.clientY);
      fn(id, x, z);
    };

  const { k, ox, oy } = view;
  const X = (x: number) => ox + x * k;
  const Y = (z: number) => oy + z * k;
  const px = (m: number) => m * k;
  const fs = (m: number, min = 9, max = 14) => Math.max(min, Math.min(max, m * k));

  const sides = useMemo(() => roomSides(p.doc.rooms), [p.doc.rooms]);
  const sel = p.selection;
  const circuitMode = p.mode === "circuit";

  // ---------- walls ----------
  const walls = p.doc.rooms.flatMap((r) => {
    const m = WALL_OF(r);
    const T = m.thickness;
    const h = T / 2;
    const s = sides[r.id];
    const rects: { x: number; z: number; w: number; d: number; key: string }[] = [];
    const extL = s.left ? 0 : h;
    const extR = s.right ? 0 : h;
    rects.push(s.left ? { x: r.x, z: r.z, w: h, d: r.d, key: "l" } : { x: r.x - h, z: r.z, w: T, d: r.d, key: "l" });
    rects.push(s.right ? { x: r.x + r.w - h, z: r.z, w: h, d: r.d, key: "r" } : { x: r.x + r.w - h, z: r.z, w: T, d: r.d, key: "r" });
    rects.push(s.front ? { x: r.x, z: r.z, w: r.w, d: h, key: "f" } : { x: r.x - extL, z: r.z - h, w: r.w + extL + extR, d: T, key: "f" });
    rects.push(s.back ? { x: r.x, z: r.z + r.d - h, w: r.w, d: h, key: "b" } : { x: r.x - extL, z: r.z + r.d - h, w: r.w + extL + extR, d: T, key: "b" });
    const fill =
      m.id.startsWith("chb") || m.id === "aac100" || m.id === "brick100" ? "url(#hatch)" : m.id === "concrete150" ? "url(#concrete)" : "#cfccc4";
    return rects.map((q) => (
      <rect key={`${r.id}-${q.key}`} x={X(q.x)} y={Y(q.z)} width={px(q.w)} height={px(q.d)} fill={fill} stroke={INK} strokeWidth={0.8} />
    ));
  });

  // ---------- overall dimensions ----------
  const bounds = p.doc.rooms.length
    ? {
        minX: Math.min(...p.doc.rooms.map((r) => r.x)),
        maxX: Math.max(...p.doc.rooms.map((r) => r.x + r.w)),
        minZ: Math.min(...p.doc.rooms.map((r) => r.z)),
        maxZ: Math.max(...p.doc.rooms.map((r) => r.z + r.d)),
      }
    : null;

  const dimH = (x0: number, x1: number, z: number, key: string, label?: string) => (
    <g key={key} stroke={INK} strokeWidth={0.7}>
      <line x1={X(x0)} y1={Y(z)} x2={X(x1)} y2={Y(z)} />
      {[x0, x1].map((x) => (
        <line key={x} x1={X(x) - 4} y1={Y(z) + 4} x2={X(x) + 4} y2={Y(z) - 4} strokeWidth={1.2} />
      ))}
      <text x={(X(x0) + X(x1)) / 2} y={Y(z) - 4} textAnchor="middle" fontSize={fs(0.22, 9, 12)} fill={INK} stroke="none" fontFamily={MONO}>
        {label ?? (x1 - x0).toFixed(2)}
      </text>
    </g>
  );
  const dimV = (z0: number, z1: number, x: number, key: string) => (
    <g key={key} stroke={INK} strokeWidth={0.7}>
      <line x1={X(x)} y1={Y(z0)} x2={X(x)} y2={Y(z1)} />
      {[z0, z1].map((z) => (
        <line key={z} x1={X(x) - 4} y1={Y(z) + 4} x2={X(x) + 4} y2={Y(z) - 4} strokeWidth={1.2} />
      ))}
      <text
        x={X(x) - 5}
        y={(Y(z0) + Y(z1)) / 2}
        textAnchor="middle"
        fontSize={fs(0.22, 9, 12)}
        fill={INK}
        stroke="none"
        fontFamily={MONO}
        transform={`rotate(-90 ${X(x) - 5} ${(Y(z0) + Y(z1)) / 2})`}
      >
        {(z1 - z0).toFixed(2)}
      </text>
    </g>
  );

  // ---------- furniture plan symbols ----------
  const furniture = (p.doc.furniture ?? []).map((f) => {
    const spec = FURNITURE[f.type];
    const model = spec?.model ?? "box";
    const selected = sel?.kind === "furniture" && sel.id === f.id;
    const stroke = selected ? AMBER : circuitMode ? "#9aa3ad" : INK;
    const w = px(f.w);
    const d = px(f.d);
    let inner: React.ReactNode = null;
    if (model === "door" || model === "roller_door") {
      inner = (
        <>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} fill={PAPER} stroke="none" />
          {model === "door" ? (
            <>
              <line x1={-w / 2} y1={0} x2={-w / 2} y2={w} stroke={stroke} strokeWidth={1.2} />
              <path d={`M ${-w / 2} ${w} A ${w} ${w} 0 0 0 ${w / 2} 0`} fill="none" stroke={stroke} strokeWidth={0.7} strokeDasharray="3 2" />
            </>
          ) : (
            <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke={stroke} strokeWidth={1.5} strokeDasharray="6 3" />
          )}
        </>
      );
    } else if (model === "window" || model === "jalousie" || model === "glass") {
      inner = (
        <>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} fill={PAPER} stroke={stroke} strokeWidth={0.8} />
          <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke={stroke} strokeWidth={0.8} />
          {model !== "glass" && <line x1={-w / 2} y1={-d / 6} x2={w / 2} y2={-d / 6} stroke={stroke} strokeWidth={0.5} />}
        </>
      );
    } else {
      const r = model === "person" || model === "tree" || model === "palm" || model === "shrub" || model === "plant" || model === "round_table" || model === "round_column" || model === "tank" || model === "bin" || model === "stool";
      inner = (
        <>
          {r ? (
            <ellipse rx={w / 2} ry={d / 2} fill={circuitMode ? "none" : `${spec?.color ?? "#999"}22`} stroke={stroke} strokeWidth={selected ? 2 : 0.8} strokeDasharray={model === "tree" || model === "palm" ? "4 2" : undefined} />
          ) : (
            <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={model === "toilet" ? Math.min(w, d) / 2 : 1} fill={circuitMode ? "none" : `${spec?.color ?? "#999"}22`} stroke={stroke} strokeWidth={selected ? 2 : 0.8} />
          )}
          {(model === "bed" || model === "bunk") && <line x1={-w / 2} y1={-d / 2 + px(0.45)} x2={w / 2} y2={-d / 2 + px(0.45)} stroke={stroke} strokeWidth={0.6} />}
          {model === "stairs" &&
            (() => {
              const n = Math.max(3, Math.round(f.h / 0.18));
              return Array.from({ length: n }, (_, i) => (
                <line key={i} x1={-w / 2} y1={-d / 2 + (i * d) / n} x2={w / 2} y2={-d / 2 + (i * d) / n} stroke={stroke} strokeWidth={0.5} />
              ));
            })()}

        </>
      );
    }
    return (
      <g
        key={f.id}
        transform={`translate(${X(f.x)} ${Y(f.z)}) rotate(${f.rot})`}
        onPointerDown={down(p.onFurnitureDown, f.id)}
        style={{ cursor: "move" }}
        opacity={circuitMode ? 0.55 : 1}
      >
        {inner}
        {selected && <rect x={-w / 2 - 3} y={-d / 2 - 3} width={w + 6} height={d + 6} fill="none" stroke={AMBER} strokeWidth={1.5} strokeDasharray="4 2" />}
        {!circuitMode && !spec?.wallMount && Math.min(w, d) > 18 && Math.max(w, d) > 44 && (
          <text
            textAnchor="middle"
            y={4}
            transform={`rotate(${-f.rot})`}
            fontSize={Math.min(10, Math.max(w, d) / 9)}
            fill={INK}
            fontFamily={MONO}
            opacity={0.7}
            pointerEvents="none"
          >
            {spec?.label.split(" (")[0]}
          </text>
        )}
      </g>
    );
  });

  // ---------- electrical symbols ----------
  const symbol = (dv: SceneDevice, color: string, key: string, clickable = true) => {
    const t = dv.type as EditorPartType;
    const info = PART_INFO[t];
    const s = Math.max(7, Math.min(14, px(0.16)));
    const selected = sel?.kind === "part" && sel.id === dv.id;
    const c = selected ? AMBER : color;
    const text = (label: string, size = s * 0.95) => (
      <text textAnchor="middle" y={size * 0.35} fontSize={size} fontFamily={MONO} fontWeight={700} fill={c}>
        {label}
      </text>
    );
    let g: React.ReactNode;
    switch (info?.model) {
      case "fixture":
        g = (
          <>
            <circle r={s} fill={PAPER} stroke={c} strokeWidth={1.4} />
            <line x1={-s * 0.7} y1={-s * 0.7} x2={s * 0.7} y2={s * 0.7} stroke={c} strokeWidth={1.2} />
            <line x1={-s * 0.7} y1={s * 0.7} x2={s * 0.7} y2={-s * 0.7} stroke={c} strokeWidth={1.2} />
          </>
        );
        break;
      case "downlight":
        g = <circle r={s * 0.5} fill={c} stroke={c} />;
        break;
      case "fan":
        g = (
          <>
            <circle r={s} fill={PAPER} stroke={c} strokeWidth={1.2} />
            {[0, 120, 240].map((a) => (
              <line key={a} x1={0} y1={0} x2={s * Math.cos((a * Math.PI) / 180)} y2={s * Math.sin((a * Math.PI) / 180)} stroke={c} strokeWidth={1.4} />
            ))}
          </>
        );
        break;
      case "detector":
        g = (
          <>
            <circle r={s} fill={PAPER} stroke={c} strokeWidth={1.2} />
            {text("SD", s * 0.8)}
          </>
        );
        break;
      case "aircon":
      case "heater":
      case "box":
      case "exhaust":
      case "emergency":
        g = (
          <>
            <rect x={-s * 1.3} y={-s * 0.8} width={s * 2.6} height={s * 1.6} fill={PAPER} stroke={c} strokeWidth={1.3} />
            {text({ aircon: "AC", heater: "WH", exhaust: "EF", emergency: "EL", box: t === "ev_charger" ? "EV" : "P" }[info.model], s * 0.85)}
          </>
        );
        break;
      case "camera":
        g = (
          <>
            <path d={`M ${-s} ${-s * 0.7} L ${s} 0 L ${-s} ${s * 0.7} Z`} fill={PAPER} stroke={c} strokeWidth={1.2} />
          </>
        );
        break;
      case "sconce":
        g = (
          <>
            <path d={`M ${-s} 0 A ${s} ${s} 0 0 1 ${s} 0 Z`} fill={PAPER} stroke={c} strokeWidth={1.3} />
          </>
        );
        break;
      case "plate":
      default:
        if (t === "switch" || t === "switch_3way") g = text(t === "switch" ? "S" : "S₃", s * 1.4);
        else if (t === "doorbell") g = (<><rect x={-s * 0.6} y={-s * 0.6} width={s * 1.2} height={s * 1.2} fill={PAPER} stroke={c} />{text("•", s)}</>);
        else if (t === "data_outlet") g = <path d={`M 0 ${-s} L ${s} ${s * 0.8} L ${-s} ${s * 0.8} Z`} fill={PAPER} stroke={c} strokeWidth={1.3} />;
        else if (t === "tv_outlet") g = (<><rect x={-s} y={-s * 0.7} width={s * 2} height={s * 1.4} fill={PAPER} stroke={c} />{text("TV", s * 0.75)}</>);
        else
          g = (
            <>
              <circle r={s} fill={t === "floor_outlet" ? "#e5e7eb" : PAPER} stroke={c} strokeWidth={1.4} />
              {t === "range_outlet" || t === "ref_outlet" || t === "washer_outlet" ? (
                text({ range_outlet: "R", ref_outlet: "RF", washer_outlet: "WM" }[t as "range_outlet"], s * 0.85)
              ) : (
                <>
                  <line x1={-s * 1.5} y1={-s * 0.35} x2={s * 1.5} y2={-s * 0.35} stroke={c} strokeWidth={1.2} />
                  <line x1={-s * 1.5} y1={s * 0.35} x2={s * 1.5} y2={s * 0.35} stroke={c} strokeWidth={1.2} />
                </>
              )}
              {t === "gfci_outlet" && <text x={s * 1.3} y={-s * 1.1} fontSize={s * 0.75} fontFamily={MONO} fill={c} fontWeight={700}>GFCI</text>}
              {t === "outdoor_outlet" && <text x={s * 1.3} y={-s * 1.1} fontSize={s * 0.75} fontFamily={MONO} fill={c} fontWeight={700}>WP</text>}
            </>
          );
    }
    return (
      <g
        key={key}
        transform={`translate(${X(dv.position[0])} ${Y(dv.position[2])})`}
        onPointerDown={clickable ? down(p.onPartDown, dv.id) : undefined}
        style={{ cursor: clickable ? "move" : undefined }}
      >
        {selected && <circle r={s * 1.9} fill="none" stroke={AMBER} strokeWidth={1.5} strokeDasharray="3 2" />}
        {g}
      </g>
    );
  };

  // ---------- circuit wiring ----------
  const wiring = circuitMode
    ? p.circuits.map((c) => {
        const col = colorFor(c.id);
        const lines = c.paths.map((path, i) => {
          const pts = path.map((v: V3) => [X(v[0]), Y(v[2])]).filter((q, j, a) => j === 0 || q[0] !== a[j - 1][0] || q[1] !== a[j - 1][1]);
          return <polyline key={i} points={pts.map((q) => q.join(",")).join(" ")} fill="none" stroke={col} strokeWidth={1.6} strokeLinejoin="round" opacity={0.9} />;
        });
        const firstDevice = c.devices[0]?.position;
        return (
          <g key={c.id}>
            {lines}
            {firstDevice && (
              <g transform={`translate(${X(firstDevice[0]) + 16} ${Y(firstDevice[2]) - 14})`}>
                <rect x={-12} y={-8} width={24} height={14} rx={3} fill={col} />
                <text textAnchor="middle" y={3} fontSize={9} fontFamily={MONO} fontWeight={700} fill="#0f172a">
                  {c.id}
                </text>
              </g>
            )}
          </g>
        );
      })
    : null;

  // ---------- scale bar + sheet ----------
  const bar = niceLength(140 / k);
  const ratio = Math.round(1000 / (k * 0.2646));
  const titleW = 260;
  const titleH = 74;
  const selRoom = sel?.kind === "room" ? p.doc.rooms.find((r) => r.id === sel.id) : undefined;
  const selFurn = sel?.kind === "furniture" ? p.doc.furniture?.find((f) => f.id === sel.id) : undefined;
  const selPart = sel?.kind === "part" ? p.doc.parts.find((q) => q.id === sel.id) : undefined;
  const anchor = selRoom
    ? { x: X(selRoom.x + selRoom.w / 2), y: Y(selRoom.z) - 34 }
    : selFurn
      ? { x: X(selFurn.x), y: Y(selFurn.z - footprint(selFurn).d / 2) - 34 }
      : selPart
        ? { x: X(selPart.position[0]), y: Y(selPart.position[2]) - 40 }
        : null;

  return (
    <div ref={wrap} className="relative h-full w-full select-none overflow-hidden" style={{ background: "#e9e7e1" }} onWheel={onWheel}>
      <svg width={size.w} height={size.h} className="block" onPointerDown={onBackgroundDown} onContextMenu={(e) => e.preventDefault()}>
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#d9d5cc" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#7d776b" strokeWidth="1" />
          </pattern>
          <pattern id="concrete" width="10" height="10" patternUnits="userSpaceOnUse">
            <rect width="10" height="10" fill="#c9c9c4" />
            <circle cx="2" cy="3" r="0.8" fill="#7d7d78" />
            <circle cx="7" cy="7" r="0.6" fill="#7d7d78" />
          </pattern>
        </defs>

        {/* paper + grid */}
        <rect x={10} y={10} width={size.w - 20} height={size.h - 20} fill={PAPER} />
        <g stroke="#e3e0d6" strokeWidth={0.6}>
          {k > 14 &&
            Array.from({ length: Math.ceil(size.w / k) + 2 }, (_, i) => {
              const x = Math.floor(-ox / k) + i;
              return <line key={`gx${i}`} x1={X(x)} y1={10} x2={X(x)} y2={size.h - 10} />;
            })}
          {k > 14 &&
            Array.from({ length: Math.ceil(size.h / k) + 2 }, (_, i) => {
              const z = Math.floor(-oy / k) + i;
              return <line key={`gz${i}`} x1={10} y1={Y(z)} x2={size.w - 10} y2={Y(z)} />;
            })}
        </g>

        {/* room floors (clickable) */}
        {p.doc.rooms.map((r) => {
          const fin = r.floor ?? defaultFinish(r).floor;
          const selected = selRoom?.id === r.id;
          return (
            <rect
              key={r.id}
              x={X(r.x)}
              y={Y(r.z)}
              width={px(r.w)}
              height={px(r.d)}
              fill={circuitMode ? "#ffffff" : `${fin.color}55`}
              stroke={selected ? AMBER : "none"}
              strokeWidth={selected ? 2 : 0}
              onPointerDown={down(p.onRoomDown, r.id)}
              style={{ cursor: "move" }}
            />
          );
        })}

        {walls}

        {/* room labels */}
        {p.doc.rooms.map((r) => {
          const fin = r.floor ?? defaultFinish(r).floor;
          return (
            <g key={`t${r.id}`} pointerEvents="none" fontFamily={MONO} textAnchor="middle" fill={INK}>
              <text x={X(r.x + r.w / 2)} y={Y(r.z + r.d * 0.72)} fontSize={fs(0.28, 9, 14)} fontWeight={700}>
                {r.name.toUpperCase()}
              </text>
              <text x={X(r.x + r.w / 2)} y={Y(r.z + r.d * 0.72) + fs(0.24, 8, 12) + 2} fontSize={fs(0.2, 8, 10)} opacity={0.75}>
                {(r.w * r.d).toFixed(1)} m²
              </text>
              {!circuitMode && (
                <text x={X(r.x + r.w / 2)} y={Y(r.z + r.d * 0.72) + 2 * fs(0.24, 8, 12) + 2} fontSize={fs(0.18, 7, 9)} opacity={0.6}>
                  {FLOOR_MATERIALS.find((m) => m.id === fin.kind)?.label.split(" ").slice(0, 2).join(" ")}
                </text>
              )}
            </g>
          );
        })}

        {/* room dimensions (inside) + overall (outside) */}
        {!circuitMode && (
          <g pointerEvents="none">
            {p.doc.rooms.map((r) => [dimH(r.x, r.x + r.w, r.z + 0.35, `dw${r.id}`), dimV(r.z, r.z + r.d, r.x + 0.35, `dd${r.id}`)])}
            {bounds && dimH(bounds.minX, bounds.maxX, bounds.minZ - 0.8, "overall-w")}
            {bounds && dimV(bounds.minZ, bounds.maxZ, bounds.minX - 0.8, "overall-d")}
          </g>
        )}

        {furniture}
        {wiring}

        {/* electrical symbols */}
        {p.panel && (
          <g
            transform={`translate(${X(p.panel.position[0])} ${Y(p.panel.position[2])})`}
            onPointerDown={down(p.onPartDown, p.panel.id)}
            style={{ cursor: "move" }}
          >
            {sel?.kind === "part" && sel.id === p.panel.id && <circle r={18} fill="none" stroke={AMBER} strokeDasharray="3 2" strokeWidth={1.5} />}
            <rect x={-12} y={-7} width={24} height={14} fill={PAPER} stroke={INK} strokeWidth={1.5} />
            <path d="M -12 7 L 12 -7 L 12 7 Z" fill={INK} />
            {circuitMode && (
              <text y={-11} textAnchor="middle" fontSize={10} fontFamily={MONO} fontWeight={700} fill={INK}>
                PANEL
              </text>
            )}
          </g>
        )}
        {p.circuits.flatMap((c) =>
          c.devices.map((dv) => symbol(dv, circuitMode ? colorFor(c.id) : "#5b6470", `${c.id}-${dv.id}`)),
        )}
        {p.loose.map((dv) => symbol(dv, circuitMode ? "#6b7280" : "#8b939c", `loose-${dv.id}`))}
        {p.ghost && <g opacity={0.5}>{symbol(p.ghost, AMBER, "ghost", false)}</g>}

        {/* previews */}
        {p.preview && (
          <rect
            x={X(p.preview.x)}
            y={Y(p.preview.z)}
            width={px(p.preview.w)}
            height={px(p.preview.d)}
            fill={p.preview.ok ? "#f5b94233" : "#ef444433"}
            stroke={p.preview.ok ? AMBER : "#ef4444"}
            strokeDasharray="5 3"
            pointerEvents="none"
          />
        )}

        {/* selected room handles */}
        {selRoom &&
          (
            [
              ["nw", selRoom.x, selRoom.z],
              ["ne", selRoom.x + selRoom.w, selRoom.z],
              ["sw", selRoom.x, selRoom.z + selRoom.d],
              ["se", selRoom.x + selRoom.w, selRoom.z + selRoom.d],
            ] as [Corner, number, number][]
          ).map(([c, x, z]) => (
            <rect
              key={c}
              x={X(x) - 6}
              y={Y(z) - 6}
              width={12}
              height={12}
              fill="#fff"
              stroke={AMBER}
              strokeWidth={2}
              style={{ cursor: "nwse-resize" }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                p.onHandleDown(selRoom.id, c);
              }}
            />
          ))}

        {/* measurement */}
        {p.measure && (
          <g pointerEvents="none">
            <line x1={X(p.measure.a[0])} y1={Y(p.measure.a[1])} x2={X(p.measure.b[0])} y2={Y(p.measure.b[1])} stroke="#dc2626" strokeWidth={1.6} />
            {[p.measure.a, p.measure.b].map((q, i) => (
              <circle key={i} cx={X(q[0])} cy={Y(q[1])} r={4} fill="#fff" stroke="#dc2626" strokeWidth={1.6} />
            ))}
            <g transform={`translate(${(X(p.measure.a[0]) + X(p.measure.b[0])) / 2} ${(Y(p.measure.a[1]) + Y(p.measure.b[1])) / 2 - 12})`}>
              <rect x={-36} y={-10} width={72} height={18} rx={4} fill="#dc2626" />
              <text textAnchor="middle" y={3} fontSize={11} fontFamily={MONO} fontWeight={700} fill="#fff">
                {Math.hypot(p.measure.b[0] - p.measure.a[0], p.measure.b[1] - p.measure.a[1]).toFixed(2)} m
              </text>
            </g>
          </g>
        )}

        {/* sheet border, scale bar, title block, legend (screen-fixed) */}
        <g pointerEvents="none">
          <rect x={18} y={18} width={size.w - 36} height={size.h - 36} fill="none" stroke={INK} strokeWidth={2} />
          <rect x={22} y={22} width={size.w - 44} height={size.h - 44} fill="none" stroke={INK} strokeWidth={0.6} />

          <g transform={`translate(${size.w - titleW - 22} ${size.h - titleH - 44})`} fontFamily={MONO} fill={INK}>
            <rect width={titleW} height={titleH} fill={PAPER} stroke={INK} strokeWidth={1.2} />
            <line x1={0} y1={24} x2={titleW} y2={24} stroke={INK} strokeWidth={0.6} />
            <line x1={0} y1={48} x2={titleW} y2={48} stroke={INK} strokeWidth={0.6} />
            <line x1={170} y1={24} x2={170} y2={titleH} stroke={INK} strokeWidth={0.6} />
            <text x={8} y={16} fontSize={12} fontWeight={700}>{p.title}</text>
            <text x={8} y={40} fontSize={11}>{circuitMode ? "E-1 · Electrical plan" : "A-1 · Floor plan"}</text>
            <text x={8} y={64} fontSize={10}>WireLab PH · draft</text>
            <text x={178} y={40} fontSize={10}>Scale ≈ 1:{ratio}</text>
            <text x={178} y={64} fontSize={10}>{new Date().toISOString().slice(0, 10)}</text>
          </g>

          <g transform={`translate(240 ${size.h - 78})`} fontFamily={MONO} fill={INK}>
            {[0, 1, 2, 3].map((i) => (
              <rect key={i} x={(i * px(bar)) / 4} y={0} width={px(bar) / 4} height={6} fill={i % 2 ? PAPER : INK} stroke={INK} strokeWidth={0.8} />
            ))}
            <text x={0} y={18} fontSize={10} textAnchor="middle">0</text>
            <text x={px(bar) / 2} y={18} fontSize={10} textAnchor="middle">{bar / 2}</text>
            <text x={px(bar)} y={18} fontSize={10} textAnchor="middle">{bar} m</text>
          </g>

          {circuitMode && (
            <g transform={`translate(${size.w - 252} 60)`} fontFamily={MONO} fill={INK}>
              <rect width={226} height={186 + (p.schedule?.circuits.length ?? 0) * 13} fill={PAPER} stroke={INK} strokeWidth={1} />
              <text x={8} y={16} fontSize={11} fontWeight={700}>LEGEND</text>
              {(
                [
                  ["light", "Ceiling light"],
                  ["downlight", "LED downlight"],
                  ["ceiling_fan", "Ceiling fan"],
                  ["switch", "Switch (S₃ = 3-way)"],
                  ["outlet", "Duplex outlet"],
                  ["range_outlet", "Dedicated outlet (R/RF/WM)"],
                  ["aircon", "Appliance (AC/WH/EV/P)"],
                  ["data_outlet", "Data outlet"],
                  ["smoke_detector", "Smoke detector"],
                ] as [EditorPartType, string][]
              ).map(([t, label], i) => (
                <g key={t} transform={`translate(0 ${30 + i * 16})`}>
                  <LegendGlyph t={t} />
                  <text x={34} y={4} fontSize={10}>{label}</text>
                </g>
              ))}
              {p.schedule && (
                <g transform="translate(0 182)">
                  <text x={8} y={0} fontSize={10} fontWeight={700}>CKT   VA     BRKR  WIRE</text>
                  {p.schedule.circuits.map((c, i) => (
                    <text key={c.id} x={8} y={13 + i * 13} fontSize={10} fill={colorFor(c.id)} fontWeight={700}>
                      {`${c.id.padEnd(5)} ${String(c.loadVA).padEnd(6)} ${String(c.breakerA).padEnd(3)}A  ${c.wireMm2.toFixed(1)}`}
                    </text>
                  ))}
                </g>
              )}
            </g>
          )}
        </g>
      </svg>

      {p.toolbar && anchor && (
        <div className="pointer-events-auto absolute z-20 -translate-x-1/2" style={{ left: Math.max(250, Math.min(size.w - 140, anchor.x)), top: Math.max(30, anchor.y) }}>
          {p.toolbar}
        </div>
      )}
    </div>
  );
}

/** Small legend glyphs drawn in screen units. */
function LegendGlyph({ t }: { t: EditorPartType }) {
  const s = 6;
  const c = INK;
  const at = (n: React.ReactNode) => <g transform="translate(18 0)">{n}</g>;
  switch (t) {
    case "light":
      return at(<><circle r={s} fill={PAPER} stroke={c} /><line x1={-4} y1={-4} x2={4} y2={4} stroke={c} /><line x1={-4} y1={4} x2={4} y2={-4} stroke={c} /></>);
    case "downlight":
      return at(<circle r={3} fill={c} />);
    case "ceiling_fan":
      return at(<><circle r={s} fill={PAPER} stroke={c} />{[0, 120, 240].map((a) => <line key={a} x2={s * Math.cos((a * Math.PI) / 180)} y2={s * Math.sin((a * Math.PI) / 180)} stroke={c} />)}</>);
    case "switch":
      return at(<text textAnchor="middle" y={4} fontSize={12} fontWeight={700} fill={c}>S</text>);
    case "outlet":
      return at(<><circle r={s} fill={PAPER} stroke={c} /><line x1={-9} y1={-2} x2={9} y2={-2} stroke={c} /><line x1={-9} y1={2} x2={9} y2={2} stroke={c} /></>);
    case "range_outlet":
      return at(<><circle r={s} fill={PAPER} stroke={c} /><text textAnchor="middle" y={3} fontSize={8} fontWeight={700} fill={c}>R</text></>);
    case "aircon":
      return at(<><rect x={-9} y={-5} width={18} height={10} fill={PAPER} stroke={c} /><text textAnchor="middle" y={3} fontSize={7} fontWeight={700} fill={c}>AC</text></>);
    case "data_outlet":
      return at(<path d="M 0 -6 L 6 5 L -6 5 Z" fill={PAPER} stroke={c} />);
    case "smoke_detector":
      return at(<><circle r={s} fill={PAPER} stroke={c} /><text textAnchor="middle" y={3} fontSize={6} fontWeight={700} fill={c}>SD</text></>);
    default:
      return null;
  }
}
