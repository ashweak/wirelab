import { CEILING } from "@/data/goldenHouse";
import { computeSchedule } from "@/engine/engine";
import type { CheckResult, Project } from "@/engine/types";
import { facing, toProject } from "./editor";
import {
  PART_INFO,
  PART_TYPES,
  isLightingLoad,
  isWallPart,
  type EditorDoc,
  type EditorPartType,
  type V3,
} from "./parts";

/** Conduit runs just under the ceiling slab. */
export const CONDUIT_DROP = 0.08;
export const CONDUIT_Y = CEILING - CONDUIT_DROP;
const EPS = 0.02;
const TAIL_M = 0.3; // wire left at each device for terminations

/**
 * Two wall devices share a wall plane. With facings known, they must face the same way and
 * sit on the same plane; without them (legacy data) fall back to a shared x or z coordinate.
 */
const onSameWall = (a: V3, b: V3, ceiling = CEILING, fa?: number, fb?: number) => {
  if (a[1] >= ceiling - 0.2 || b[1] >= ceiling - 0.2) return false;
  if (fa !== undefined && fb !== undefined) {
    if (Math.abs(Math.cos(fa - fb) - 1) > 1e-6) return false;
    return Math.abs(Math.sin(fa)) > 0.5 ? Math.abs(a[0] - b[0]) < EPS : Math.abs(a[2] - b[2]) < EPS;
  }
  return Math.abs(a[0] - b[0]) < EPS || Math.abs(a[2] - b[2]) < EPS;
};

/**
 * Route between two mounting points.
 * Same wall: along the wall at the first device's height, then up/down to the second.
 * Otherwise: up to the ceiling, across in x, across in z, down.
 */
export function segPath(a: V3, b: V3, ceiling = CEILING, fa?: number, fb?: number): V3[] {
  if (onSameWall(a, b, ceiling, fa, fb)) return [a, [b[0], a[1], b[2]], b];
  const y = ceiling - CONDUIT_DROP;
  return [a, [a[0], y, a[2]], [b[0], y, a[2]], [b[0], y, b[2]], b];
}

export const PANEL_KEY = "panel";
export const routeKey = (from: string, to: string) => `${from}>${to}`;
export const polyLength = (pts: V3[]) =>
  pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) : 0), 0);

/** Route options shared by the chain helpers. */
export interface RouteOpts {
  panelId?: string;
  routes?: Record<string, V3[]>;
}

/** Length used for wire and voltage drop (measured to the ceiling line). */
export function segLength(a: V3, b: V3, ceiling = CEILING, fa?: number, fb?: number): number {
  const flat = Math.abs(a[0] - b[0]) + Math.abs(a[2] - b[2]);
  if (onSameWall(a, b, ceiling, fa, fb)) return flat + Math.abs(a[1] - b[1]);
  return ceiling - a[1] + flat + (ceiling - b[1]);
}

/** Hand-wired parts first (by seq), then nearest-neighbour from wherever the chain ends. */
export function chainOrder<T extends { position: V3; seq?: number; face?: number }>(
  panel: V3,
  parts: T[],
  ceiling = CEILING,
  panelFace?: number,
): T[] {
  const manual = parts.filter((p) => p.seq !== undefined).sort((a, b) => a.seq! - b.seq!);
  const rest = parts.filter((p) => p.seq === undefined);
  const out = [...manual];
  let at = out.at(-1)?.position ?? panel;
  let face = out.length ? out.at(-1)!.face : panelFace;
  const dist = (p: T) => segLength(at, p.position, ceiling, face, p.face);
  while (rest.length) {
    let best = 0;
    for (let i = 1; i < rest.length; i++) if (dist(rest[i]) < dist(rest[best])) best = i;
    const [p] = rest.splice(best, 1);
    out.push(p);
    at = p.position;
    face = p.face;
  }
  return out;
}

/** One hop of a chain: its key, polyline and whether the user drew it. */
export interface Hop {
  key: string;
  path: V3[];
  custom: boolean;
  lengthM: number;
}

export function chainHops(
  panel: V3,
  ordered: { id?: string; position: V3; face?: number }[],
  ceiling = CEILING,
  panelFace?: number,
  opts: RouteOpts = {},
): Hop[] {
  return ordered.map((p, i) => {
    const prev = i === 0 ? null : ordered[i - 1];
    const a = prev ? prev.position : panel;
    const key = routeKey(prev ? (prev.id ?? `#${i - 1}`) : (opts.panelId ?? PANEL_KEY), p.id ?? `#${i}`);
    const wp = opts.routes?.[key];
    if (wp) {
      const path = [a, ...wp, p.position];
      return { key, path, custom: true, lengthM: polyLength(path) };
    }
    const fa = prev ? prev.face : panelFace;
    return { key, path: segPath(a, p.position, ceiling, fa, p.face), custom: false, lengthM: segLength(a, p.position, ceiling, fa, p.face) };
  });
}

/** Segments for the engine: length of each hop and the load still downstream of it. */
export function chainSegments(
  panel: V3,
  ordered: { id?: string; position: V3; va: number; face?: number }[],
  ceiling = CEILING,
  panelFace?: number,
  opts: RouteOpts = {},
) {
  const hops = chainHops(panel, ordered, ceiling, panelFace, opts);
  return ordered.map((p, i) => ({
    lengthM: hops[i].lengthM,
    downstreamVA: ordered.slice(i).reduce((s, x) => s + x.va, 0),
  }));
}

/** Polylines for drawing a chained circuit. */
export function chainPaths(
  panel: V3,
  ordered: { id?: string; position?: V3; face?: number }[],
  ceiling = CEILING,
  panelFace?: number,
  opts: RouteOpts = {},
): V3[][] {
  const pts = ordered.filter((p) => p.position) as { id?: string; position: V3; face?: number }[];
  return chainHops(panel, pts, ceiling, panelFace, opts).map((h) => h.path);
}

/** Ceiling points where a conduit drops down a wall to a device (junction boxes). */
export function dropPoints(paths: V3[][], ceiling = CEILING): V3[] {
  return paths
    .filter((p) => p.length === 5 && p[4][1] < ceiling - 0.2)
    .map((p) => [p[4][0], ceiling - CONDUIT_DROP, p[4][2]] as V3);
}

export function designChecks(doc: EditorDoc): CheckResult[] {
  return doc.rooms.flatMap((r) => {
    const here = doc.parts.filter((p) => p.roomId === r.id);
    const out: CheckResult[] = [];
    const lit = here.some((p) => isLightingLoad(p.type));
    const switched = here.some((p) => p.type === "switch" || p.type === "switch_3way");
    if (lit && !switched)
      out.push({
        code: "NO-SWITCH",
        severity: "warning",
        targetId: r.id,
        message: `${r.name}: lights or fans have no wall switch`,
        fix: `Add a switch in ${r.name}, beside the door`,
      });
    if (r.kind === "bath" && here.some((p) => p.type === "outlet"))
      out.push({
        code: "GFCI-BATH",
        severity: "warning",
        targetId: r.id,
        message: `${r.name}: bathroom outlets should be ground-fault protected`,
        fix: "Replace with a GFCI outlet",
      });
    return out;
  });
}

export interface MaterialLine {
  item: string;
  qty: number;
  unit: string;
}

const groundFor = (breakerA: number) => (breakerA <= 20 ? 2.0 : breakerA <= 60 ? 3.5 : 5.5);

/** Rough-in bill of materials (quantities only; prices come in the outputs step). */
export function materials(doc: EditorDoc): MaterialLine[] {
  const built = toProject(doc);
  if (!built.ok) return [];
  const project: Project = built.project;
  const schedule = computeSchedule(project);
  const panel = doc.parts.find((p) => p.type === "panel")!;

  const lineNeutral = new Map<number, number>();
  const ground = new Map<number, number>();
  let conduitM = 0;
  let drops = 0;
  const breakers = new Map<number, number>();

  project.circuits.forEach((c, i) => {
    const r = schedule.circuits[i];
    const run = c.segments?.reduce((s, x) => s + x.lengthM, 0) ?? c.runM;
    const wire = run + TAIL_M * c.parts.length;
    lineNeutral.set(r.wireMm2, (lineNeutral.get(r.wireMm2) ?? 0) + 2 * wire);
    const g = groundFor(r.breakerA);
    ground.set(g, (ground.get(g) ?? 0) + wire);
    conduitM += run;
    const ceil = doc.ceilingM ?? CEILING;
    const face = (id: string, pos: V3) => {
      const p = doc.parts.find((q) => q.id === id);
      const r = doc.rooms.find((q) => q.id === p?.roomId);
      return p && r && isWallPart(p.type) ? facing(pos, r) : undefined;
    };
    const pf = face(panel.id, panel.position);
    drops += dropPoints(
      chainPaths(
        panel.position,
        c.parts.map((p) => ({ id: p.id, position: p.position, face: face(p.id, p.position!) })),
        ceil,
        pf,
        { panelId: PANEL_KEY, routes: doc.routes },
      ),
      ceil,
    ).length;
    breakers.set(r.breakerA, (breakers.get(r.breakerA) ?? 0) + 1);
  });

  const count = (t: EditorPartType) => doc.parts.filter((p) => p.type === t).length;
  const wallBoxes = doc.parts.filter((p) => p.type !== "panel" && PART_INFO[p.type].mount !== "ceiling").length;
  const ceilingBoxes = doc.parts.filter((p) => PART_INFO[p.type].mount === "ceiling").length;
  const lines: MaterialLine[] = [
    ...[...lineNeutral].sort((a, b) => a[0] - b[0]).map(([mm2, m]) => ({
      item: `THHN ${mm2.toFixed(1)} mm² wire (line + neutral)`,
      qty: Math.ceil(m),
      unit: "m",
    })),
    ...[...ground].sort((a, b) => a[0] - b[0]).map(([mm2, m]) => ({
      item: `THHN ${mm2.toFixed(1)} mm² wire, green (ground)`,
      qty: Math.ceil(m),
      unit: "m",
    })),
    { item: 'PVC conduit 15 mm (½"), 3 m length', qty: Math.ceil(conduitM / 3), unit: "pcs" },
    { item: 'Utility box 2" × 4"', qty: wallBoxes, unit: "pcs" },
    { item: "Octagonal junction box", qty: ceilingBoxes + drops, unit: "pcs" },
    ...PART_TYPES.filter((t) => t !== "panel").map((t) => ({ item: PART_INFO[t].bom, qty: count(t), unit: "pcs" })),
    ...[...breakers].sort((a, b) => a[0] - b[0]).map(([a, n]) => ({
      item: `Circuit breaker ${a} A, 2-pole`,
      qty: n,
      unit: "pcs",
    })),
    {
      item: `Panelboard, main ${schedule.main.breakerA} A + ${project.circuits.length} branches`,
      qty: 1,
      unit: "set",
    },
  ];
  return lines.filter((l) => l.qty > 0);
}

export { PART_INFO };
