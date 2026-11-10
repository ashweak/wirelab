"use client";

import { WALL_MATERIALS } from "@/editor/construction";
import { arcPoint, dist, type Entity, type Layer, type Pt, type SnapKind } from "@/cad/geometry";

const SEL = "#d97706";

export interface DraftView {
  X: (x: number) => number;
  Y: (z: number) => number;
  k: number;
}

/** SVG for one drafted entity. */
export function DraftEntity({
  e,
  v,
  color,
  selected = false,
  ghost = false,
}: {
  e: Entity;
  v: DraftView;
  color: string;
  selected?: boolean;
  ghost?: boolean;
}) {
  const { X, Y, k } = v;
  const stroke = selected ? SEL : color;
  const dash = ghost ? "6 4" : selected ? "5 3" : undefined;
  const w = selected ? 2 : 1.2;
  switch (e.kind) {
    case "line":
      return <line x1={X(e.a[0])} y1={Y(e.a[1])} x2={X(e.b[0])} y2={Y(e.b[1])} stroke={stroke} strokeWidth={w} strokeDasharray={dash} />;
    case "pline":
      return (
        <polyline
          points={[...e.pts, ...(e.closed ? [e.pts[0]] : [])].map((q) => `${X(q[0])},${Y(q[1])}`).join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth={w}
          strokeDasharray={dash}
          strokeLinejoin="round"
        />
      );
    case "circle":
      return <circle cx={X(e.c[0])} cy={Y(e.c[1])} r={e.r * k} fill="none" stroke={stroke} strokeWidth={w} strokeDasharray={dash} />;
    case "arc": {
      const p0 = arcPoint(e.c, e.r, e.a0);
      const p1 = arcPoint(e.c, e.r, e.a1);
      const span = ((((e.a1 - e.a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) || 2 * Math.PI;
      return (
        <path
          d={`M ${X(p0[0])} ${Y(p0[1])} A ${e.r * k} ${e.r * k} 0 ${span > Math.PI ? 1 : 0} 0 ${X(p1[0])} ${Y(p1[1])}`}
          fill="none"
          stroke={stroke}
          strokeWidth={w}
          strokeDasharray={dash}
        />
      );
    }
    case "text":
      return (
        <text x={X(e.p[0])} y={Y(e.p[1])} fontSize={Math.max(6, e.h * k)} fill={stroke} fontFamily="ui-monospace, Menlo, monospace">
          {e.text}
        </text>
      );
    case "wall": {
      const len = dist(e.a, e.b);
      if (len < 1e-9) return null;
      const nx = (-(e.b[1] - e.a[1]) / len) * (e.t / 2);
      const nz = ((e.b[0] - e.a[0]) / len) * (e.t / 2);
      const pts: Pt[] = [
        [e.a[0] + nx, e.a[1] + nz],
        [e.b[0] + nx, e.b[1] + nz],
        [e.b[0] - nx, e.b[1] - nz],
        [e.a[0] - nx, e.a[1] - nz],
      ];
      const masonry = /chb|aac|brick/.test(e.mat);
      return (
        <g>
          <polygon
            points={pts.map((q) => `${X(q[0])},${Y(q[1])}`).join(" ")}
            fill={ghost ? "#f5b94255" : masonry ? "url(#hatch)" : e.mat === "concrete150" ? "url(#concrete)" : "#cfccc4"}
            stroke={stroke}
            strokeWidth={selected ? 2 : 1}
            strokeDasharray={dash}
          />
          {ghost && (
            <text
              x={(X(e.a[0]) + X(e.b[0])) / 2}
              y={(Y(e.a[1]) + Y(e.b[1])) / 2 - 10}
              textAnchor="middle"
              fontSize={11}
              fontFamily="ui-monospace, Menlo, monospace"
              fill={SEL}
              fontWeight={700}
            >
              {len.toFixed(2)} m · {WALL_MATERIALS.find((m) => m.id === e.mat)?.label ?? e.mat}
            </text>
          )}
        </g>
      );
    }
    case "dim": {
      const len = dist(e.a, e.b);
      if (len < 1e-9) return null;
      const nx = (e.b[1] - e.a[1]) / len;
      const nz = -(e.b[0] - e.a[0]) / len;
      const a2: Pt = [e.a[0] + nx * e.off, e.a[1] + nz * e.off];
      const b2: Pt = [e.b[0] + nx * e.off, e.b[1] + nz * e.off];
      const ang = (Math.atan2(Y(b2[1]) - Y(a2[1]), X(b2[0]) - X(a2[0])) * 180) / Math.PI;
      const upright = ang > 90 || ang < -90 ? ang + 180 : ang;
      const mx = (X(a2[0]) + X(b2[0])) / 2;
      const my = (Y(a2[1]) + Y(b2[1])) / 2;
      return (
        <g stroke={stroke} strokeWidth={0.8} strokeDasharray={dash}>
          <line x1={X(e.a[0])} y1={Y(e.a[1])} x2={X(a2[0])} y2={Y(a2[1])} />
          <line x1={X(e.b[0])} y1={Y(e.b[1])} x2={X(b2[0])} y2={Y(b2[1])} />
          <line x1={X(a2[0])} y1={Y(a2[1])} x2={X(b2[0])} y2={Y(b2[1])} />
          {[a2, b2].map((q, i) => (
            <line key={i} x1={X(q[0]) - 4} y1={Y(q[1]) + 4} x2={X(q[0]) + 4} y2={Y(q[1]) - 4} strokeWidth={1.4} />
          ))}
          <text
            x={mx}
            y={my - 4}
            textAnchor="middle"
            fontSize={11}
            fill={stroke}
            stroke="none"
            fontFamily="ui-monospace, Menlo, monospace"
            transform={`rotate(${upright} ${mx} ${my})`}
          >
            {len.toFixed(2)}
          </text>
        </g>
      );
    }
  }
}

/** All visible draft entities plus previews, snap marker and dynamic input. */
export function DraftLayer({
  entities,
  layers,
  selection,
  previewEnts,
  cursor,
  last,
  window: box,
  v,
}: {
  entities: Entity[];
  layers: Layer[];
  selection: string[];
  previewEnts: Entity[];
  cursor: { pt: Pt; snap: SnapKind | null } | null;
  last: Pt | null;
  window: { a: Pt; b: Pt } | null;
  v: DraftView;
}) {
  const color = (name: string) => layers.find((l) => l.name === name)?.color ?? "#1f2933";
  const visible = (name: string) => layers.find((l) => l.name === name)?.on !== false;
  const sel = new Set(selection);
  const { X, Y } = v;
  return (
    <g pointerEvents="none">
      {entities
        .filter((e) => visible(e.layer))
        .map((e) => (
          <DraftEntity key={e.id} e={e} v={v} color={color(e.layer)} selected={sel.has(e.id)} />
        ))}
      {previewEnts.map((e) => (
        <DraftEntity key={e.id} e={e} v={v} color={SEL} ghost />
      ))}
      {box && (
        <rect
          x={Math.min(X(box.a[0]), X(box.b[0]))}
          y={Math.min(Y(box.a[1]), Y(box.b[1]))}
          width={Math.abs(X(box.b[0]) - X(box.a[0]))}
          height={Math.abs(Y(box.b[1]) - Y(box.a[1]))}
          fill={box.b[0] < box.a[0] ? "#22c55e22" : "#3b82f622"}
          stroke={box.b[0] < box.a[0] ? "#16a34a" : "#2563eb"}
          strokeDasharray={box.b[0] < box.a[0] ? "5 3" : undefined}
        />
      )}
      {cursor && (
        <g transform={`translate(${X(cursor.pt[0])} ${Y(cursor.pt[1])})`}>
          <line x1={-14} y1={0} x2={14} y2={0} stroke="#334155" strokeWidth={0.8} />
          <line x1={0} y1={-14} x2={0} y2={14} stroke="#334155" strokeWidth={0.8} />
          <rect x={-3} y={-3} width={6} height={6} fill="none" stroke="#334155" strokeWidth={0.8} />
          {cursor.snap === "endpoint" && <rect x={-7} y={-7} width={14} height={14} fill="none" stroke="#16a34a" strokeWidth={2} />}
          {cursor.snap === "midpoint" && <path d="M 0 -8 L 8 6 L -8 6 Z" fill="none" stroke="#16a34a" strokeWidth={2} />}
          {cursor.snap === "center" && <circle r={8} fill="none" stroke="#16a34a" strokeWidth={2} />}
          {cursor.snap === "intersection" && (
            <g stroke="#16a34a" strokeWidth={2}>
              <line x1={-7} y1={-7} x2={7} y2={7} />
              <line x1={-7} y1={7} x2={7} y2={-7} />
            </g>
          )}
          {cursor.snap && (
            <text x={12} y={-10} fontSize={10} fill="#16a34a" fontFamily="ui-monospace, Menlo, monospace" fontWeight={700}>
              {cursor.snap}
            </text>
          )}
          {last && (
            <g transform="translate(16 16)">
              <rect width={120} height={18} rx={3} fill="#0f172a" opacity={0.85} />
              <text x={6} y={13} fontSize={10.5} fill="#e2e8f0" fontFamily="ui-monospace, Menlo, monospace">
                {dist(last, cursor.pt).toFixed(3)} m ∠{" "}
                {(((Math.atan2(last[1] - cursor.pt[1], cursor.pt[0] - last[0]) * 180) / Math.PI + 360) % 360).toFixed(1)}°
              </text>
            </g>
          )}
        </g>
      )}
    </g>
  );
}
