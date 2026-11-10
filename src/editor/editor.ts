import { CEILING, PANEL_POSITION, ROOMS, goldenHouse } from "@/data/goldenHouse";
import type { Circuit, Part, PartType, Project } from "@/engine/types";
import {
  PART_INFO,
  type EditorDoc,
  type EditorPart,
  type EditorPartType,
  type Room,
  type RoomKind,
  type V3,
} from "./parts";
import { chainOrder, chainSegments, segLength } from "./wiring";

export * from "./parts";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

export const GRID = 0.5;
export const MAX_LIGHTS_PER_CIRCUIT = 12;
export const MAX_OUTLETS_PER_CIRCUIT = 8;

export const ROOM_KINDS: { kind: RoomKind; label: string }[] = [
  { kind: "living", label: "Living" },
  { kind: "kitchen", label: "Kitchen" },
  { kind: "bedroom", label: "Bedroom" },
  { kind: "bath", label: "Bath" },
  { kind: "other", label: "Other" },
];

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const uid = () => Math.random().toString(36).slice(2, 9);

export const snap = (v: number, step = GRID) => {
  const s = Math.round(v / step) * step;
  return s === 0 ? 0 : s;
};

const overlaps = (a: Omit<Room, "id" | "name" | "kind">, b: Room) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;

export function makeRoom(
  a: [number, number],
  b: [number, number],
  kind: RoomKind,
  rooms: Room[],
): Result<{ room: Room }> {
  const rect = {
    x: Math.min(a[0], b[0]),
    z: Math.min(a[1], b[1]),
    w: Math.abs(b[0] - a[0]),
    d: Math.abs(b[1] - a[1]),
  };
  if (rect.w < 1 || rect.d < 1) return { ok: false, error: "A room must be at least 1 m × 1 m" };
  if (rooms.some((r) => overlaps(rect, r))) return { ok: false, error: "Rooms can't overlap" };
  const label = ROOM_KINDS.find((k) => k.kind === kind)!.label;
  const n = rooms.filter((r) => r.kind === kind).length + 1;
  return { ok: true, room: { id: uid(), name: `${label} ${n}`, kind, ...rect } };
}

export const roomAt = (rooms: Room[], x: number, z: number) =>
  rooms.find((r) => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d);

const INSET = 0.08;

/** Snap a clicked floor point to where the part is actually mounted. */
export function snapPart(type: EditorPartType, room: Room, x: number, z: number): V3 {
  const cx = Math.min(Math.max(x, room.x + 0.2), room.x + room.w - 0.2);
  const cz = Math.min(Math.max(z, room.z + 0.2), room.z + room.d - 0.2);
  if (type === "light") return [r3(cx), r3(CEILING - 0.05), r3(cz)];

  const h = type === "outlet" && room.kind === "kitchen" ? 1.1 : PART_INFO[type].height!;
  const walls = [
    { dist: x - room.x, pos: [room.x + INSET, h, cz] as V3 },
    { dist: room.x + room.w - x, pos: [room.x + room.w - INSET, h, cz] as V3 },
    { dist: z - room.z, pos: [cx, h, room.z + INSET] as V3 },
    { dist: room.z + room.d - z, pos: [cx, h, room.z + room.d - INSET] as V3 },
  ];
  const best = walls.reduce((a, b) => (b.dist < a.dist ? b : a));
  return best.pos.map(r3) as V3;
}

/** Which way a wall-mounted part faces (rotation about y), from its room's walls. */
export function facing(pos: V3, room: { x: number; z: number; w: number; d: number }): number {
  const d = [
    { a: Math.PI / 2, v: Math.abs(pos[0] - room.x) },
    { a: -Math.PI / 2, v: Math.abs(room.x + room.w - pos[0]) },
    { a: 0, v: Math.abs(pos[2] - room.z) },
    { a: Math.PI, v: Math.abs(room.z + room.d - pos[2]) },
  ];
  return d.reduce((a, b) => (b.v < a.v ? b : a)).a;
}

export function addPart(doc: EditorDoc, type: EditorPartType, x: number, z: number): Result<{ doc: EditorDoc }> {
  const room = roomAt(doc.rooms, x, z);
  if (!room) return { ok: false, error: "Place parts inside a room" };
  const part: EditorPart = { id: uid(), type, roomId: room.id, position: snapPart(type, room, x, z) };
  const others = type === "panel" ? doc.parts.filter((p) => p.type !== "panel") : doc.parts;
  return { ok: true, doc: { ...doc, parts: [...others, part] } };
}

/** Panel -> straight up to the ceiling -> along x -> along z -> down to the part. */
export const routeLength = (panel: V3, to: V3) =>
  CEILING - panel[1] + Math.abs(panel[0] - to[0]) + Math.abs(panel[2] - to[2]) + (CEILING - to[1]);

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

const partVA = (p: EditorPart) => PART_INFO[p.type].va;

/** Group placed parts into daisy-chained circuits and hand the result to the PEC engine. */
export function toProject(doc: EditorDoc): Result<{ project: Project }> {
  const panel = doc.parts.find((p) => p.type === "panel");
  if (!panel) return { ok: false, error: "Place a panelboard first" };

  const roomName = (id: string) => doc.rooms.find((r) => r.id === id)?.name ?? "?";
  const toEngine = (p: EditorPart): Part => {
    const info = PART_INFO[p.type];
    return {
      id: p.id,
      type: info.engineType!,
      room: p.roomId,
      position: p.position,
      ...(p.type === "aircon" || p.type === "water_heater" ? { va: info.va } : {}),
      ...(info.motor ? { motor: true } : {}),
    };
  };
  const rooms = (parts: EditorPart[]) => [...new Set(parts.map((p) => roomName(p.roomId)))].join(", ");

  const lightGroups = chunk(doc.parts.filter((p) => p.type === "light"), MAX_LIGHTS_PER_CIRCUIT);
  // Switches ride on the lighting circuit that feeds lights in their room (else the first one).
  const switches = doc.parts.filter((p) => p.type === "switch");
  const lighting = lightGroups.map((g) => ({ kind: "lighting" as const, label: "Lighting", parts: [...g] }));
  for (const s of switches) {
    const home = lighting.find((g) => g.parts.some((p) => p.type === "light" && p.roomId === s.roomId)) ?? lighting[0];
    home?.parts.push(s);
  }

  const groups: { kind: Circuit["kind"]; label: string; parts: EditorPart[] }[] = [
    ...lighting,
    ...chunk(doc.parts.filter((p) => p.type === "outlet"), MAX_OUTLETS_PER_CIRCUIT).map((g) => ({
      kind: "outlet" as const,
      label: `Outlets, ${rooms(g)}`,
      parts: g,
    })),
    ...doc.parts
      .filter((p) => p.type === "aircon" || p.type === "water_heater")
      .map((p) => ({
        kind: "appliance" as const,
        label: `${PART_INFO[p.type].label} (${roomName(p.roomId)})`,
        parts: [p],
      })),
  ];

  const circuits: Circuit[] = groups.map((g, i) => {
    const ordered = chainOrder(panel.position, g.parts);
    const segments = chainSegments(
      panel.position,
      ordered.map((p) => ({ position: p.position, va: partVA(p) })),
    );
    return {
      id: `C${i + 1}`,
      name: `C${i + 1} ${g.label}`,
      kind: g.kind,
      runM: Math.round(segments.reduce((s, x) => s + x.lengthM, 0) * 10) / 10,
      segments,
      parts: ordered.map(toEngine),
    };
  });

  return { ok: true, project: { name: "My house", feederRunM: doc.feederRunM, circuits } };
}

/** Wire tool: append a part to the hand-drawn order of its circuit. */
export function wireNext(doc: EditorDoc, partId: string): EditorDoc {
  const next = Math.max(0, ...doc.parts.map((p) => p.seq ?? 0)) + 1;
  return { ...doc, parts: doc.parts.map((p) => (p.id === partId ? { ...p, seq: next } : p)) };
}

export const resetWiring = (doc: EditorDoc): EditorDoc => ({
  ...doc,
  parts: doc.parts.map((p) => {
    const q = { ...p };
    delete q.seq;
    return q;
  }),
});

const GOLDEN_KIND: Record<string, RoomKind> = {
  living: "living",
  kitchen: "kitchen",
  bath: "bath",
  bed1: "bedroom",
  bed2: "bedroom",
  bed3: "bedroom",
};

const FROM_ENGINE: Record<PartType, EditorPartType> = {
  lighting_outlet: "light",
  convenience_outlet: "outlet",
  aircon_outlet: "aircon",
  appliance_outlet: "water_heater",
  switch: "switch",
};

/** The golden test house as an editable document, with a switch in every room. */
export function goldenEditorDoc(): EditorDoc {
  const g = goldenHouse();
  const rooms: Room[] = ROOMS.map((r) => ({ ...r, kind: GOLDEN_KIND[r.id] }));
  return {
    feederRunM: g.feederRunM,
    rooms,
    parts: [
      { id: "panel", type: "panel", roomId: "living", position: PANEL_POSITION },
      ...g.circuits.flatMap((c) =>
        c.parts.map((p) => ({
          id: p.id,
          type: FROM_ENGINE[p.type],
          roomId: p.room,
          position: p.position!,
        })),
      ),
      ...rooms.map((r) => ({
        id: `SW-${r.id}`,
        type: "switch" as const,
        roomId: r.id,
        position: snapPart("switch", r, r.x + r.w - 0.1, r.z + 0.6),
      })),
    ],
  };
}

export { segLength };
