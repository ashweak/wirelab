import { CEILING } from "@/data/goldenHouse";
import { computeSchedule } from "@/engine/engine";
import type { CheckResult, Project } from "@/engine/types";
import { toProject } from "./editor";
import { PART_INFO, type EditorDoc, type V3 } from "./parts";

/** Conduit runs just under the ceiling slab. */
export const CONDUIT_Y = CEILING - 0.08;
const EPS = 0.02;
const TAIL_M = 0.3; // wire left at each device for terminations

const onSameWall = (a: V3, b: V3) =>
  a[1] < CEILING - 0.2 &&
  b[1] < CEILING - 0.2 &&
  (Math.abs(a[0] - b[0]) < EPS || Math.abs(a[2] - b[2]) < EPS);

/**
 * Route between two mounting points.
 * Same wall: along the wall at the first device's height, then up/down to the second.
 * Otherwise: up to the ceiling, across in x, across in z, down.
 */
export function segPath(a: V3, b: V3): V3[] {
  if (onSameWall(a, b)) return [a, [b[0], a[1], b[2]], b];
  return [a, [a[0], CONDUIT_Y, a[2]], [b[0], CONDUIT_Y, a[2]], [b[0], CONDUIT_Y, b[2]], b];
}

/** Length used for wire and voltage drop (measured to the ceiling line). */
export function segLength(a: V3, b: V3): number {
  const flat = Math.abs(a[0] - b[0]) + Math.abs(a[2] - b[2]);
  if (onSameWall(a, b)) return flat + Math.abs(a[1] - b[1]);
  return CEILING - a[1] + flat + (CEILING - b[1]);
}

/** Hand-wired parts first (by seq), then nearest-neighbour from wherever the chain ends. */
export function chainOrder<T extends { position: V3; seq?: number }>(panel: V3, parts: T[]): T[] {
  const manual = parts.filter((p) => p.seq !== undefined).sort((a, b) => a.seq! - b.seq!);
  const rest = parts.filter((p) => p.seq === undefined);
  const out = [...manual];
  let at = out.at(-1)?.position ?? panel;
  while (rest.length) {
    let best = 0;
    for (let i = 1; i < rest.length; i++)
      if (segLength(at, rest[i].position) < segLength(at, rest[best].position)) best = i;
    const [p] = rest.splice(best, 1);
    out.push(p);
    at = p.position;
  }
  return out;
}

/** Segments for the engine: length of each hop and the load still downstream of it. */
export function chainSegments(panel: V3, ordered: { position: V3; va: number }[]) {
  return ordered.map((p, i) => ({
    lengthM: segLength(i === 0 ? panel : ordered[i - 1].position, p.position),
    downstreamVA: ordered.slice(i).reduce((s, x) => s + x.va, 0),
  }));
}

/** Polylines for drawing a chained circuit. */
export function chainPaths(panel: V3, ordered: { position?: V3 }[]): V3[][] {
  const pts = ordered.filter((p) => p.position).map((p) => p.position!);
  return pts.map((p, i) => segPath(i === 0 ? panel : pts[i - 1], p));
}

/** Ceiling points where a conduit drops down a wall to a device (junction boxes). */
export function dropPoints(paths: V3[][]): V3[] {
  return paths
    .filter((p) => p.length === 5 && p[4][1] < CEILING - 0.2)
    .map((p) => [p[4][0], CONDUIT_Y, p[4][2]] as V3);
}

export function designChecks(doc: EditorDoc): CheckResult[] {
  return doc.rooms.flatMap((r) => {
    const here = doc.parts.filter((p) => p.roomId === r.id);
    const lit = here.some((p) => p.type === "light");
    const switched = here.some((p) => p.type === "switch");
    return lit && !switched
      ? [
          {
            code: "NO-SWITCH",
            severity: "warning" as const,
            targetId: r.id,
            message: `${r.name}: lights have no wall switch`,
            fix: `Add a switch in ${r.name}, beside the door`,
          },
        ]
      : [];
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
    drops += dropPoints(chainPaths(panel.position, c.parts)).length;
    breakers.set(r.breakerA, (breakers.get(r.breakerA) ?? 0) + 1);
  });

  const count = (t: EditorDoc["parts"][number]["type"]) => doc.parts.filter((p) => p.type === t).length;
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
    {
      item: 'Utility box 2" × 4"',
      qty: count("outlet") + count("switch") + count("aircon") + count("water_heater"),
      unit: "pcs",
    },
    { item: "Octagonal junction box", qty: count("light") + drops, unit: "pcs" },
    { item: "Duplex convenience outlet", qty: count("outlet"), unit: "pcs" },
    { item: "Wall switch, 1-gang", qty: count("switch"), unit: "pcs" },
    { item: "Lighting outlet (ceiling)", qty: count("light"), unit: "pcs" },
    { item: "Aircon outlet, 20 A", qty: count("aircon"), unit: "pcs" },
    { item: "Water heater outlet", qty: count("water_heater"), unit: "pcs" },
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
