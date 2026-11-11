import { facing, roomAt, ROOM_KINDS, snap, snapPart } from "./editor";
import { fitInside } from "./interior";
import {
  HEIGHT_RANGE,
  PART_INFO,
  isWallPart,
  type EditorDoc,
  type EditorPart,
  type Room,
  type RoomKind,
  type V3,
} from "./parts";

type Result = { ok: true; doc: EditorDoc } | { ok: false; error: string };
type Rect = { x: number; z: number; w: number; d: number };

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const uid = () => Math.random().toString(36).slice(2, 9);
const INSET = 0.08;
const MARGIN = 0.2;

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.z < b.z + b.d - 1e-9 && b.z < a.z + a.d - 1e-9;

function validRect(doc: EditorDoc, rect: Rect, ignoreId?: string): string | null {
  if (rect.w < 1 || rect.d < 1) return "A room must be at least 1 m × 1 m";
  if (doc.rooms.some((r) => r.id !== ignoreId && overlaps(rect, r))) return "Rooms can't overlap";
  return null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export interface RoomPreset {
  id: string;
  label: string;
  kind: RoomKind;
  w: number;
  d: number;
}

export const ROOM_PRESETS: RoomPreset[] = [
  { id: "bedroom", label: "Bedroom 3 × 3", kind: "bedroom", w: 3, d: 3 },
  { id: "master", label: "Master bed 4 × 3.5", kind: "bedroom", w: 4, d: 3.5 },
  { id: "living", label: "Living 5 × 4", kind: "living", w: 5, d: 4 },
  { id: "kitchen", label: "Kitchen 3 × 3", kind: "kitchen", w: 3, d: 3 },
  { id: "bath", label: "Bath 2 × 2", kind: "bath", w: 2, d: 2 },
  { id: "other", label: "Utility 2 × 1.5", kind: "other", w: 2, d: 1.5 },
];

const nextName = (doc: EditorDoc, kind: RoomKind) =>
  `${ROOM_KINDS.find((k) => k.kind === kind)!.label} ${doc.rooms.filter((r) => r.kind === kind).length + 1}`;

/**
 * Put a part back on the same wall of a (moved, resized or rotated) room.
 * `side` is the wall's facing angle; lights stay on the ceiling, clamped inside.
 */
function reseat(p: EditorPart, room: Room, x: number, z: number, side?: number): EditorPart {
  const lo = { x: room.x + MARGIN, z: room.z + MARGIN };
  const hi = { x: room.x + room.w - MARGIN, z: room.z + room.d - MARGIN };
  const cx = r3(clamp(x, lo.x, hi.x));
  const cz = r3(clamp(z, lo.z, hi.z));
  if (!isWallPart(p.type)) return { ...p, roomId: room.id, position: [cx, p.position[1], cz] };
  const y = p.position[1];
  const walls: [number, V3][] = [
    [Math.PI / 2, [r3(room.x + INSET), y, cz]],
    [-Math.PI / 2, [r3(room.x + room.w - INSET), y, cz]],
    [0, [cx, y, r3(room.z + INSET)]],
    [Math.PI, [cx, y, r3(room.z + room.d - INSET)]],
  ];
  const a = side ?? 0;
  const wall = walls.find(([w]) => Math.abs(Math.cos(w - a) - 1) < 1e-6)!;
  return { ...p, roomId: room.id, position: wall[1] };
}

export function moveRoom(doc: EditorDoc, id: string, dx: number, dz: number, step: number): Result {
  const room = doc.rooms.find((r) => r.id === id);
  if (!room) return { ok: false, error: "No such room" };
  const x = snap(room.x + dx, step);
  const z = snap(room.z + dz, step);
  const moved = { ...room, x, z };
  const err = validRect(doc, moved, id);
  if (err) return { ok: false, error: err };
  const mx = x - room.x;
  const mz = z - room.z;
  return {
    ok: true,
    doc: {
      ...doc,
      rooms: doc.rooms.map((r) => (r.id === id ? moved : r)),
      parts: doc.parts.map((p) =>
        p.roomId === id ? { ...p, position: [r3(p.position[0] + mx), p.position[1], r3(p.position[2] + mz)] } : p,
      ),
      furniture: doc.furniture?.map((f) => (f.roomId === id ? { ...f, x: r3(f.x + mx), z: r3(f.z + mz) } : f)),
    },
  };
}

export function resizeRoom(doc: EditorDoc, id: string, rect: Rect): Result {
  const room = doc.rooms.find((r) => r.id === id);
  if (!room) return { ok: false, error: "No such room" };
  const next = { ...room, ...rect };
  const err = validRect(doc, next, id);
  if (err) return { ok: false, error: err };
  return {
    ok: true,
    doc: {
      ...doc,
      rooms: doc.rooms.map((r) => (r.id === id ? next : r)),
      parts: doc.parts.map((p) =>
        p.roomId === id
          ? reseat(p, next, p.position[0], p.position[2], !isWallPart(p.type) ? undefined : facing(p.position, room))
          : p,
      ),
      furniture: doc.furniture?.map((f) => (f.roomId === id ? fitInside(f, next) : f)),
    },
  };
}

/** Rotate 90° clockwise (seen from above) about the room's centre. */
export function rotateRoom(doc: EditorDoc, id: string): Result {
  const room = doc.rooms.find((r) => r.id === id);
  if (!room) return { ok: false, error: "No such room" };
  const cx = room.x + room.w / 2;
  const cz = room.z + room.d / 2;
  const next = { ...room, x: r3(cx - room.d / 2), z: r3(cz - room.w / 2), w: room.d, d: room.w };
  const err = validRect(doc, next, id);
  if (err) return { ok: false, error: err };
  // (dx, dz) -> (-dz, dx); a wall's facing angle turns by -90°.
  const turn = (a: number) => {
    const t = a - Math.PI / 2;
    return t < -Math.PI / 2 - 1e-9 ? t + 2 * Math.PI : t;
  };
  return {
    ok: true,
    doc: {
      ...doc,
      rooms: doc.rooms.map((r) => (r.id === id ? next : r)),
      parts: doc.parts.map((p) => {
        if (p.roomId !== id) return p;
        const dx = p.position[0] - cx;
        const dz = p.position[2] - cz;
        return reseat(p, next, cx - dz, cz + dx, !isWallPart(p.type) ? undefined : turn(facing(p.position, room)));
      }),
      furniture: doc.furniture?.map((f) =>
        f.roomId === id
          ? fitInside(
              { ...f, x: cx - (f.z - cz), z: cz + (f.x - cx), rot: ((f.rot + 90) % 360) as typeof f.rot },
              next,
            )
          : f,
      ),
    },
  };
}

export function movePart(doc: EditorDoc, id: string, x: number, z: number): Result {
  const part = doc.parts.find((p) => p.id === id);
  if (!part) return { ok: false, error: "No such part" };
  const room = roomAt(doc.rooms, x, z);
  if (!room) return { ok: false, error: "Place parts inside a room" };
  const moved = {
    ...part,
    roomId: room.id,
    position: snapPart(part.type, room, x, z, part.height, room.h ?? doc.ceilingM),
  };
  return { ok: true, doc: { ...doc, parts: doc.parts.map((p) => (p.id === id ? moved : p)) } };
}

export function setPartHeight(doc: EditorDoc, id: string, h: number): Result {
  const part = doc.parts.find((p) => p.id === id);
  if (!part) return { ok: false, error: "No such part" };
  const range = HEIGHT_RANGE[part.type];
  if (!range) return { ok: false, error: `${PART_INFO[part.type].label} is fixed to the ${PART_INFO[part.type].mount}` };
  if (h < range[0] || h > range[1])
    return { ok: false, error: `${PART_INFO[part.type].label} height must be ${range[0]}–${range[1]} m` };
  const moved = { ...part, height: h, position: [part.position[0], h, part.position[2]] as V3 };
  return { ok: true, doc: { ...doc, parts: doc.parts.map((p) => (p.id === id ? moved : p)) } };
}

export function duplicatePart(doc: EditorDoc, id: string): Result {
  const part = doc.parts.find((p) => p.id === id);
  const room = doc.rooms.find((r) => r.id === part?.roomId);
  if (!part || !room) return { ok: false, error: "No such part" };
  if (part.type === "panel") return { ok: false, error: "A house has one panelboard" };
  const side = !isWallPart(part.type) ? undefined : facing(part.position, room);
  const alongX = side === undefined || side === 0 || Math.abs(side) === Math.PI;
  const [x, , z] = part.position;
  const limit = alongX ? room.x + room.w - MARGIN : room.z + room.d - MARGIN;
  const fwd = (alongX ? x : z) + 0.5 <= limit + 1e-9 ? 0.5 : -0.5;
  const copy = reseat(
    { ...part, id: uid(), seq: undefined },
    room,
    alongX ? x + fwd : x,
    alongX ? z : z + fwd,
    side,
  );
  delete copy.seq;
  return { ok: true, doc: { ...doc, parts: [...doc.parts, copy] } };
}

/** Copy a room and its parts into the first free spot: right, below, left, above, then further out. */
export function duplicateRoom(doc: EditorDoc, id: string): Result {
  const room = doc.rooms.find((r) => r.id === id);
  if (!room) return { ok: false, error: "No such room" };
  for (let k = 1; k <= 6; k++) {
    for (const [ox, oz] of [
      [room.w * k, 0],
      [0, room.d * k],
      [-room.w * k, 0],
      [0, -room.d * k],
    ]) {
      const spot = { ...room, x: r3(room.x + ox), z: r3(room.z + oz) };
      if (validRect(doc, spot, undefined)) continue;
      const copy: Room = { ...spot, id: uid(), name: nextName(doc, room.kind) };
      const parts = doc.parts
        .filter((p) => p.roomId === id && p.type !== "panel")
        .map((p) => {
          const q: EditorPart = {
            ...p,
            id: uid(),
            roomId: copy.id,
            position: [r3(p.position[0] + ox), p.position[1], r3(p.position[2] + oz)],
          };
          delete q.seq;
          return q;
        });
      const furniture = (doc.furniture ?? [])
        .filter((f) => f.roomId === id)
        .map((f) => ({ ...f, id: uid(), roomId: copy.id, x: r3(f.x + ox), z: r3(f.z + oz) }));
      return {
        ok: true,
        doc: {
          ...doc,
          rooms: [...doc.rooms, copy],
          parts: [...doc.parts, ...parts],
          furniture: [...(doc.furniture ?? []), ...furniture],
        },
      };
    }
  }
  return { ok: false, error: "No free space next to this room" };
}

export function deleteItems(doc: EditorDoc, ids: string[]): EditorDoc {
  const gone = new Set(ids);
  return {
    ...doc,
    rooms: doc.rooms.filter((r) => !gone.has(r.id)),
    parts: doc.parts.filter((p) => !gone.has(p.id) && !gone.has(p.roomId)),
    furniture: doc.furniture?.filter((f) => !gone.has(f.id) && !gone.has(f.roomId)),
  };
}

/** Drop a preset room centred on (x, z), snapped to the grid. */
export function placePreset(doc: EditorDoc, preset: RoomPreset, x: number, z: number, step: number): Result {
  const rect = { x: snap(x - preset.w / 2, step), z: snap(z - preset.d / 2, step), w: preset.w, d: preset.d };
  const err = validRect(doc, rect);
  if (err) return { ok: false, error: err };
  const room: Room = { id: uid(), name: nextName(doc, preset.kind), kind: preset.kind, ...rect };
  return { ok: true, doc: { ...doc, rooms: [...doc.rooms, room] } };
}

export function updateRoom(doc: EditorDoc, id: string, patch: Partial<Pick<Room, "name" | "kind">>): EditorDoc {
  return { ...doc, rooms: doc.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}
