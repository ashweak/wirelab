/**
 * 2D drafting geometry. Points are plan coordinates [x, z] in metres (z grows down the
 * screen). Typed coordinates follow AutoCAD, with Y up: y = −z, angles CCW from +X.
 */
export type Pt = [number, number];

interface Base {
  id: string;
  layer: string;
}
export type Entity =
  | (Base & { kind: "line"; a: Pt; b: Pt })
  | (Base & { kind: "pline"; pts: Pt[]; closed: boolean })
  | (Base & { kind: "circle"; c: Pt; r: number })
  /** Arc from a0 to a1 CCW (CAD angles, radians). */
  | (Base & { kind: "arc"; c: Pt; r: number; a0: number; a1: number })
  | (Base & { kind: "text"; p: Pt; text: string; h: number })
  /** Aligned dimension a–b, drawn `off` metres to the left of a→b (CAD sense). */
  | (Base & { kind: "dim"; a: Pt; b: Pt; off: number })
  | (Base & { kind: "wall"; a: Pt; b: Pt; t: number; mat: string });

export interface Layer {
  name: string;
  color: string;
  on: boolean;
  locked: boolean;
}

export const DEFAULT_LAYERS: Layer[] = [
  { name: "0", color: "#1f2933", on: true, locked: false },
  { name: "A-WALL", color: "#111827", on: true, locked: false },
  { name: "A-DOOR", color: "#2563eb", on: true, locked: false },
  { name: "A-GLAZ", color: "#0891b2", on: true, locked: false },
  { name: "A-FURN", color: "#6b7280", on: true, locked: false },
  { name: "A-DIMS", color: "#059669", on: true, locked: false },
  { name: "A-ANNO", color: "#7c3aed", on: true, locked: false },
  { name: "E-LITE", color: "#d97706", on: true, locked: false },
  { name: "E-POWR", color: "#dc2626", on: true, locked: false },
];

const r6 = (n: number) => Math.round(n * 1e6) / 1e6 + 0;
const P = (x: number, z: number): Pt => [r6(x), r6(z)];
export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/** CAD angle (radians, CCW, Y up) of a→b. */
export const angleOf = (a: Pt, b: Pt) => Math.atan2(a[1] - b[1], b[0] - a[0]);
const polar = (from: Pt, len: number, ang: number): Pt => P(from[0] + len * Math.cos(ang), from[1] - len * Math.sin(ang));

/** Parse AutoCAD-style input: "x,y", "@dx,dy", "@len<deg", or a bare distance toward the cursor. */
export function parsePoint(input: string, last: Pt | null, cursor: Pt | null): Pt | null {
  const s = input.trim().replace(/\s+/g, "");
  const num = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)";
  let m = s.match(new RegExp(`^(@)?(${num}),(${num})$`));
  if (m) {
    const x = Number(m[2]);
    const y = Number(m[3]);
    if (m[1]) {
      if (!last) return null;
      return P(last[0] + x, last[1] - y);
    }
    return P(x, 0 - y);
  }
  m = s.match(new RegExp(`^@(${num})<(${num})$`));
  if (m) {
    if (!last) return null;
    return polar(last, Number(m[1]), (Number(m[2]) * Math.PI) / 180);
  }
  m = s.match(new RegExp(`^(${num})$`));
  if (m && last && cursor && dist(last, cursor) > 1e-9) return polar(last, Number(m[1]), angleOf(last, cursor));
  return null;
}

/** Ortho: keep only the larger of the horizontal and vertical moves. */
export const ortho = (from: Pt, p: Pt): Pt =>
  Math.abs(p[0] - from[0]) >= Math.abs(p[1] - from[1]) ? P(p[0], from[1]) : P(from[0], p[1]);

// ---------- segments ----------
function segments(e: Entity): [Pt, Pt][] {
  switch (e.kind) {
    case "line":
    case "wall":
    case "dim":
      return [[e.a, e.b]];
    case "pline": {
      const out: [Pt, Pt][] = [];
      for (let i = 1; i < e.pts.length; i++) out.push([e.pts[i - 1], e.pts[i]]);
      if (e.closed && e.pts.length > 2) out.push([e.pts[e.pts.length - 1], e.pts[0]]);
      return out;
    }
    default:
      return [];
  }
}

function segIntersect(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
  const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return P(a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]));
}

function distToSeg(p: Pt, a: Pt, b: Pt) {
  const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  if (L2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / L2));
  return dist(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
}

// ---------- snaps ----------
export type SnapKind = "endpoint" | "intersection" | "midpoint" | "center";
const PRIORITY: SnapKind[] = ["endpoint", "intersection", "midpoint", "center"];

export function snapCandidates(ents: Entity[]): { pt: Pt; kind: SnapKind }[] {
  const out: { pt: Pt; kind: SnapKind }[] = [];
  for (const e of ents) {
    for (const [a, b] of segments(e)) {
      out.push({ pt: a, kind: "endpoint" }, { pt: b, kind: "endpoint" });
      out.push({ pt: P((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), kind: "midpoint" });
    }
    if (e.kind === "circle") out.push({ pt: e.c, kind: "center" });
    if (e.kind === "arc") {
      out.push({ pt: e.c, kind: "center" });
      out.push({ pt: polar(e.c, e.r, e.a0), kind: "endpoint" }, { pt: polar(e.c, e.r, e.a1), kind: "endpoint" });
    }
    if (e.kind === "text") out.push({ pt: e.p, kind: "endpoint" });
  }
  const segs = ents.flatMap(segments).slice(0, 400);
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const x = segIntersect(segs[i][0], segs[i][1], segs[j][0], segs[j][1]);
      if (x) out.push({ pt: x, kind: "intersection" });
    }
  return out;
}

/** Nearest snap point within `tol`; ties at the same spot go to the higher-priority kind. */
export function findSnap(p: Pt, ents: Entity[], tol: number, cands = snapCandidates(ents)) {
  let best: { pt: Pt; kind: SnapKind; d: number } | null = null;
  for (const c of cands) {
    const d = dist(p, c.pt);
    if (d > tol) continue;
    if (
      !best ||
      d < best.d - 1e-9 ||
      (Math.abs(d - best.d) < 1e-9 && PRIORITY.indexOf(c.kind) < PRIORITY.indexOf(best.kind))
    )
      best = { ...c, d };
  }
  return best ? { pt: best.pt, kind: best.kind } : null;
}

// ---------- measures, hit tests, selection ----------
export function length(e: Entity): number {
  if (e.kind === "circle") return 2 * Math.PI * e.r;
  if (e.kind === "arc") return e.r * (((e.a1 - e.a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) || e.r * 2 * Math.PI;
  return segments(e).reduce((s, [a, b]) => s + dist(a, b), 0);
}

export function area(e: Entity): number {
  if (e.kind === "circle") return Math.PI * e.r * e.r;
  if (e.kind !== "pline" || !e.closed) return 0;
  let s = 0;
  for (let i = 0; i < e.pts.length; i++) {
    const [x1, z1] = e.pts[i];
    const [x2, z2] = e.pts[(i + 1) % e.pts.length];
    s += x1 * z2 - x2 * z1;
  }
  return Math.abs(s) / 2;
}

export function hitTest(e: Entity, p: Pt, tol: number): boolean {
  if (e.kind === "circle") return Math.abs(dist(p, e.c) - e.r) <= tol;
  if (e.kind === "arc") {
    if (Math.abs(dist(p, e.c) - e.r) > tol) return false;
    const a = angleOf(e.c, p);
    const span = (((e.a1 - e.a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const at = (((a - e.a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return at <= span;
  }
  if (e.kind === "text") return dist(p, e.p) <= Math.max(tol, e.h * Math.max(1, e.text.length) * 0.3);
  const t = e.kind === "wall" ? Math.max(tol, e.t / 2) : tol;
  return segments(e).some(([a, b]) => distToSeg(p, a, b) <= t);
}

export function bbox(e: Entity): [Pt, Pt] {
  const pts: Pt[] =
    e.kind === "circle" || e.kind === "arc"
      ? [
          [e.c[0] - e.r, e.c[1] - e.r],
          [e.c[0] + e.r, e.c[1] + e.r],
        ]
      : e.kind === "text"
        ? [e.p, [e.p[0] + e.h * 0.6 * e.text.length, e.p[1] - e.h]]
        : segments(e).flat();
  const xs = pts.map((q) => q[0]);
  const zs = pts.map((q) => q[1]);
  return [
    [Math.min(...xs), Math.min(...zs)],
    [Math.max(...xs), Math.max(...zs)],
  ];
}

/** Window (inside) or crossing (inside or touching) selection, like AutoCAD. */
export function selectInRect(ents: Entity[], c1: Pt, c2: Pt, crossing: boolean): string[] {
  const lo: Pt = [Math.min(c1[0], c2[0]), Math.min(c1[1], c2[1])];
  const hi: Pt = [Math.max(c1[0], c2[0]), Math.max(c1[1], c2[1])];
  const inside = (q: Pt) => q[0] >= lo[0] && q[0] <= hi[0] && q[1] >= lo[1] && q[1] <= hi[1];
  const edges: [Pt, Pt][] = [
    [lo, [hi[0], lo[1]]],
    [[hi[0], lo[1]], hi],
    [hi, [lo[0], hi[1]]],
    [[lo[0], hi[1]], lo],
  ];
  return ents
    .filter((e) => {
      const [a, b] = bbox(e);
      if (inside(a) && inside(b)) return true;
      if (!crossing) return false;
      const segs = segments(e);
      if (segs.some(([p, q]) => inside(p) || inside(q) || edges.some(([r, s]) => segIntersect(p, q, r, s)))) return true;
      if (e.kind === "circle" || e.kind === "arc") return !(b[0] < lo[0] || a[0] > hi[0] || b[1] < lo[1] || a[1] > hi[1]);
      if (e.kind === "text") return inside(e.p);
      return false;
    })
    .map((e) => e.id);
}

// ---------- transforms ----------
const mapPts = (e: Entity, f: (q: Pt) => Pt): Entity => {
  switch (e.kind) {
    case "line":
    case "wall":
    case "dim":
      return { ...e, a: f(e.a), b: f(e.b) };
    case "pline":
      return { ...e, pts: e.pts.map(f) };
    case "circle":
      return { ...e, c: f(e.c) };
    case "arc":
      return { ...e, c: f(e.c) };
    case "text":
      return { ...e, p: f(e.p) };
  }
};

export const move = (e: Entity, dx: number, dz: number) => mapPts(e, (q) => P(q[0] + dx, q[1] + dz));

/** Rotate CCW (CAD sense) by `ang` radians about `c`. */
export function rotate(e: Entity, c: Pt, ang: number): Entity {
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  // In plan coords (z down) a CCW CAD rotation is (x, z) -> (x cos + z sin, -x sin + z cos).
  const f = (q: Pt): Pt => {
    const x = q[0] - c[0];
    const z = q[1] - c[1];
    return P(c[0] + x * cos + z * sin, c[1] - x * sin + z * cos);
  };
  const out = mapPts(e, f);
  if (out.kind === "arc") return { ...out, a0: out.a0 + ang, a1: out.a1 + ang };
  return out;
}

export function mirror(e: Entity, a: Pt, b: Pt): Entity {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const L2 = dx * dx + dz * dz;
  const f = (q: Pt): Pt => {
    const t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2;
    const fx = a[0] + t * dx;
    const fz = a[1] + t * dz;
    return P(2 * fx - q[0], 2 * fz - q[1]);
  };
  const out = mapPts(e, f);
  if (out.kind === "arc") {
    const m = 2 * angleOf(a, b);
    return { ...out, a0: m - (e as typeof out).a1, a1: m - (e as typeof out).a0 };
  }
  return out;
}

export function scale(e: Entity, c: Pt, k: number): Entity {
  const out = mapPts(e, (q) => P(c[0] + (q[0] - c[0]) * k, c[1] + (q[1] - c[1]) * k));
  if (out.kind === "circle" || out.kind === "arc") return { ...out, r: out.r * k };
  if (out.kind === "text") return { ...out, h: out.h * k };
  if (out.kind === "dim") return { ...out, off: out.off * k };
  return out;
}

/** Offset a line, wall, polyline or circle by `d` toward the side of `side`. */
export function offset(e: Entity, d: number, side: Pt): Entity | null {
  if (e.kind === "circle" || e.kind === "arc") {
    const r = dist(side, e.c) > e.r ? e.r + d : e.r - d;
    return r > 0 ? { ...e, r } : null;
  }
  if (e.kind === "line" || e.kind === "wall") {
    const len = dist(e.a, e.b);
    if (len === 0) return null;
    let nx = -(e.b[1] - e.a[1]) / len;
    let nz = (e.b[0] - e.a[0]) / len;
    if ((side[0] - e.a[0]) * nx + (side[1] - e.a[1]) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    return move(e, nx * d, nz * d);
  }
  if (e.kind === "pline" && e.closed) {
    // Grow or shrink a closed outline about its centroid (exact for rectangles).
    const cx = e.pts.reduce((s, q) => s + q[0], 0) / e.pts.length;
    const cz = e.pts.reduce((s, q) => s + q[1], 0) / e.pts.length;
    const inside = selectInRect([e], side, side, true).length === 0 && pointInPoly(side, e.pts);
    const sign = inside ? -1 : 1;
    return { ...e, pts: e.pts.map((q) => P(q[0] + Math.sign(q[0] - cx) * d * sign, q[1] + Math.sign(q[1] - cz) * d * sign)) };
  }
  return null;
}

export function pointInPoly(p: Pt, pts: Pt[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Circle through three points, as an arc from the first to the third through the second. */
export function arc3(p1: Pt, p2: Pt, p3: Pt): { c: Pt; r: number; a0: number; a1: number } | null {
  const ax = p1[0], az = p1[1], bx = p2[0], bz = p2[1], cx = p3[0], cz = p3[1];
  const d = 2 * (ax * (bz - cz) + bx * (cz - az) + cx * (az - bz));
  if (Math.abs(d) < 1e-12) return null;
  const ux = ((ax * ax + az * az) * (bz - cz) + (bx * bx + bz * bz) * (cz - az) + (cx * cx + cz * cz) * (az - bz)) / d;
  const uz = ((ax * ax + az * az) * (cx - bx) + (bx * bx + bz * bz) * (ax - cx) + (cx * cx + cz * cz) * (bx - ax)) / d;
  const c: Pt = P(ux, uz);
  const a1 = angleOf(c, p1);
  const a2 = angleOf(c, p2);
  const a3 = angleOf(c, p3);
  const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  // CCW from p1 passes p2 before p3 → arc p1→p3 CCW; otherwise p3→p1.
  return norm(a2 - a1) < norm(a3 - a1) ? { c, r: dist(c, p1), a0: a1, a1: a3 } : { c, r: dist(c, p1), a0: a3, a1: a1 };
}

export const arcPoint = polar;
