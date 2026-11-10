import { CEILING, PANEL_POSITION, ROOMS, goldenHouse } from "@/data/goldenHouse";
import type { Circuit, Part, PartType, Project } from "@/engine/types";

export type RoomKind = "living" | "kitchen" | "bath" | "bedroom" | "other";
export type EditorPartType = "light" | "outlet" | "aircon" | "water_heater" | "panel";
export type V3 = [number, number, number];

export interface Room {
  id: string;
  name: string;
  kind: RoomKind;
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface EditorPart {
  id: string;
  type: EditorPartType;
  roomId: string;
  position: V3;
}

export interface EditorDoc {
  rooms: Room[];
  parts: EditorPart[];
  feederRunM: number;
}

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

export const PART_INFO: Record<
  EditorPartType,
  { label: string; va: number; motor?: boolean; engineType?: PartType }
> = {
  light: { label: "Light", va: 100, engineType: "lighting_outlet" },
  outlet: { label: "Outlet", va: 180, engineType: "convenience_outlet" },
  aircon: { label: "Aircon 1.5 HP", va: 1800, motor: true, engineType: "aircon_outlet" },
  water_heater: { label: "Water heater", va: 3500, engineType: "appliance_outlet" },
  panel: { label: "Panelboard", va: 0 },
};

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

const WALL_HEIGHT: Record<Exclude<EditorPartType, "light">, number> = {
  outlet: 0.3,
  aircon: 2.1,
  water_heater: 1.8,
  panel: 1.5,
};
const INSET = 0.08;

/** Snap a clicked floor point to where the part is actually mounted. */
export function snapPart(type: EditorPartType, room: Room, x: number, z: number): V3 {
  const cx = Math.min(Math.max(x, room.x + 0.2), room.x + room.w - 0.2);
  const cz = Math.min(Math.max(z, room.z + 0.2), room.z + room.d - 0.2);
  if (type === "light") return [r3(cx), r3(CEILING - 0.05), r3(cz)];

  const h = type === "outlet" && room.kind === "kitchen" ? 1.1 : WALL_HEIGHT[type];
  const walls = [
    { dist: x - room.x, pos: [room.x + INSET, h, cz] as V3 },
    { dist: room.x + room.w - x, pos: [room.x + room.w - INSET, h, cz] as V3 },
    { dist: z - room.z, pos: [cx, h, room.z + INSET] as V3 },
    { dist: room.z + room.d - z, pos: [cx, h, room.z + room.d - INSET] as V3 },
  ];
  const best = walls.reduce((a, b) => (b.dist < a.dist ? b : a));
  return best.pos.map(r3) as V3;
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

/** Group placed parts into circuits and hand the result to the PEC engine. */
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
  const run = (parts: EditorPart[]) =>
    Math.ceil(Math.max(...parts.map((p) => routeLength(panel.position, p.position))) * 2) / 2;
  const rooms = (parts: EditorPart[]) => [...new Set(parts.map((p) => roomName(p.roomId)))].join(", ");

  const groups: { kind: Circuit["kind"]; label: string; parts: EditorPart[] }[] = [
    ...chunk(doc.parts.filter((p) => p.type === "light"), MAX_LIGHTS_PER_CIRCUIT).map((g) => ({
      kind: "lighting" as const,
      label: "Lighting",
      parts: g,
    })),
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

  const circuits: Circuit[] = groups.map((g, i) => ({
    id: `C${i + 1}`,
    name: `C${i + 1} ${g.label}`,
    kind: g.kind,
    runM: run(g.parts),
    parts: g.parts.map(toEngine),
  }));

  return { ok: true, project: { name: "My house", feederRunM: doc.feederRunM, circuits } };
}

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
};

/** The golden test house as an editable document. */
export function goldenEditorDoc(): EditorDoc {
  const g = goldenHouse();
  return {
    feederRunM: g.feederRunM,
    rooms: ROOMS.map((r) => ({ ...r, kind: GOLDEN_KIND[r.id] })),
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
    ],
  };
}
