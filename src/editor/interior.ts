import { CEILING } from "@/data/goldenHouse";
import { roomAt, snap } from "./editor";
import type { EditorDoc, FloorKind, Furniture, FurnitureType, Room } from "./parts";

type Result = { ok: true; doc: EditorDoc } | { ok: false; error: string };

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export interface FurnitureSpec {
  label: string;
  group: "Bedroom" | "Living" | "Kitchen" | "Bath";
  w: number;
  d: number;
  h: number;
  color: string;
  /** [min, max] for width, depth, height (m). */
  limits: { w: [number, number]; d: [number, number]; h: [number, number] };
}

export const FURNITURE: Record<FurnitureType, FurnitureSpec> = {
  bed_single: { label: "Single bed", group: "Bedroom", w: 1.0, d: 2.0, h: 0.55, color: "#5b7fa6", limits: { w: [0.9, 1.2], d: [1.9, 2.2], h: [0.4, 0.7] } },
  bed_double: { label: "Double bed", group: "Bedroom", w: 1.5, d: 2.0, h: 0.55, color: "#8a6f9e", limits: { w: [1.2, 2.0], d: [1.9, 2.2], h: [0.4, 0.7] } },
  wardrobe: { label: "Wardrobe", group: "Bedroom", w: 1.2, d: 0.6, h: 2.0, color: "#a27b55", limits: { w: [0.6, 3.0], d: [0.45, 0.7], h: [1.5, 2.4] } },
  desk: { label: "Desk", group: "Bedroom", w: 1.2, d: 0.6, h: 0.75, color: "#c2a27a", limits: { w: [0.8, 2.0], d: [0.5, 0.9], h: [0.7, 0.8] } },
  sofa: { label: "Sofa", group: "Living", w: 2.0, d: 0.9, h: 0.85, color: "#4f6d5a", limits: { w: [1.2, 3.2], d: [0.8, 1.1], h: [0.7, 1.0] } },
  coffee_table: { label: "Coffee table", group: "Living", w: 1.0, d: 0.55, h: 0.42, color: "#7a5a3c", limits: { w: [0.6, 1.6], d: [0.4, 0.9], h: [0.3, 0.5] } },
  tv_stand: { label: "TV + stand", group: "Living", w: 1.6, d: 0.45, h: 0.5, color: "#3a3f47", limits: { w: [1.0, 2.4], d: [0.35, 0.6], h: [0.4, 0.7] } },
  dining_table: { label: "Dining table", group: "Kitchen", w: 1.5, d: 0.9, h: 0.75, color: "#8b6a46", limits: { w: [0.8, 2.4], d: [0.7, 1.2], h: [0.7, 0.8] } },
  chair: { label: "Chair", group: "Kitchen", w: 0.45, d: 0.45, h: 0.9, color: "#6b4f35", limits: { w: [0.4, 0.6], d: [0.4, 0.6], h: [0.8, 1.1] } },
  counter: { label: "Kitchen counter", group: "Kitchen", w: 2.4, d: 0.6, h: 0.9, color: "#d9d4ca", limits: { w: [0.6, 4.0], d: [0.55, 0.7], h: [0.85, 0.95] } },
  fridge: { label: "Refrigerator", group: "Kitchen", w: 0.7, d: 0.7, h: 1.7, color: "#c7ccd1", limits: { w: [0.55, 0.9], d: [0.6, 0.8], h: [1.4, 1.9] } },
  toilet: { label: "Toilet", group: "Bath", w: 0.4, d: 0.65, h: 0.75, color: "#f2f2ef", limits: { w: [0.35, 0.45], d: [0.6, 0.75], h: [0.7, 0.85] } },
  vanity: { label: "Sink vanity", group: "Bath", w: 0.8, d: 0.5, h: 0.85, color: "#e8e4dc", limits: { w: [0.5, 1.5], d: [0.4, 0.6], h: [0.8, 0.9] } },
  shower: { label: "Shower", group: "Bath", w: 0.9, d: 0.9, h: 2.0, color: "#cfe3ee", limits: { w: [0.8, 1.4], d: [0.8, 1.4], h: [1.9, 2.1] } },
};

export const FLOOR_KINDS: { kind: FloorKind; label: string; color: string }[] = [
  { kind: "tile", label: "Ceramic tile", color: "#d8d2c6" },
  { kind: "wood", label: "Wood planks", color: "#9a6b3f" },
  { kind: "vinyl", label: "Vinyl", color: "#b8ab95" },
  { kind: "concrete", label: "Polished concrete", color: "#8d9196" },
];

export const WALL_PAINTS = ["#f1ece2", "#e6dccb", "#d7e3e8", "#e3ead9", "#efe0d9", "#cfd5dc", "#f4f4f2", "#3e4a56"];

/** Default finishes by room type. */
export function defaultFinish(room: Room): { floor: { kind: FloorKind; color: string }; wall: string } {
  const floor =
    room.kind === "bath" || room.kind === "kitchen"
      ? FLOOR_KINDS[0]
      : room.kind === "bedroom"
        ? FLOOR_KINDS[1]
        : room.kind === "living"
          ? FLOOR_KINDS[2]
          : FLOOR_KINDS[3];
  return { floor: { kind: floor.kind, color: floor.color }, wall: room.kind === "bath" ? "#d7e3e8" : "#f1ece2" };
}

export const footprint = (f: Pick<Furniture, "w" | "d" | "rot">) =>
  f.rot === 90 || f.rot === 270 ? { w: f.d, d: f.w } : { w: f.w, d: f.d };

/** Keep a piece's footprint inside its room. */
export function fitInside(f: Furniture, room: Room): Furniture {
  const fp = footprint(f);
  return {
    ...f,
    roomId: room.id,
    x: r3(clamp(f.x, room.x + fp.w / 2, room.x + room.w - fp.w / 2)),
    z: r3(clamp(f.z, room.z + fp.d / 2, room.z + room.d - fp.d / 2)),
  };
}

const list = (doc: EditorDoc) => doc.furniture ?? [];

export function addFurniture(doc: EditorDoc, type: FurnitureType, x: number, z: number, step: number): Result {
  const room = roomAt(doc.rooms, x, z);
  if (!room) return { ok: false, error: "Place furniture inside a room" };
  const spec = FURNITURE[type];
  if (spec.w > room.w + 1e-9 && spec.d > room.w + 1e-9)
    return { ok: false, error: `${room.name} is too small for a ${spec.label.toLowerCase()}` };
  const f = fitInside(
    { id: uid(), type, roomId: room.id, x: snap(x, step), z: snap(z, step), rot: 0, w: spec.w, d: spec.d, h: spec.h, color: spec.color },
    room,
  );
  return { ok: true, doc: { ...doc, furniture: [...list(doc), f] } };
}

const replace = (doc: EditorDoc, f: Furniture): EditorDoc => ({
  ...doc,
  furniture: list(doc).map((q) => (q.id === f.id ? f : q)),
});

export function moveFurniture(doc: EditorDoc, id: string, x: number, z: number, step: number): Result {
  const f = list(doc).find((q) => q.id === id);
  if (!f) return { ok: false, error: "No such item" };
  const room = roomAt(doc.rooms, x, z);
  if (!room) return { ok: false, error: "Place furniture inside a room" };
  return { ok: true, doc: replace(doc, fitInside({ ...f, x: snap(x, step), z: snap(z, step) }, room)) };
}

export function rotateFurniture(doc: EditorDoc, id: string): Result {
  const f = list(doc).find((q) => q.id === id);
  const room = doc.rooms.find((r) => r.id === f?.roomId);
  if (!f || !room) return { ok: false, error: "No such item" };
  const rot = ((f.rot + 90) % 360) as Furniture["rot"];
  return { ok: true, doc: replace(doc, fitInside({ ...f, rot }, room)) };
}

export function resizeFurniture(doc: EditorDoc, id: string, size: Partial<Pick<Furniture, "w" | "d" | "h">>): Result {
  const f = list(doc).find((q) => q.id === id);
  const room = doc.rooms.find((r) => r.id === f?.roomId);
  if (!f || !room) return { ok: false, error: "No such item" };
  const spec = FURNITURE[f.type];
  const names = { w: "width", d: "depth", h: "height" } as const;
  for (const k of ["w", "d", "h"] as const) {
    const v = size[k];
    if (v === undefined) continue;
    const [lo, hi] = spec.limits[k];
    if (v < lo - 1e-9 || v > hi + 1e-9) return { ok: false, error: `${spec.label} ${names[k]} must be ${lo}–${hi} m` };
  }
  return { ok: true, doc: replace(doc, fitInside({ ...f, ...size }, room)) };
}

export function setFurnitureColor(doc: EditorDoc, id: string, color: string): EditorDoc {
  const f = list(doc).find((q) => q.id === id);
  return f ? replace(doc, { ...f, color }) : doc;
}

export function duplicateFurniture(doc: EditorDoc, id: string): Result {
  const f = list(doc).find((q) => q.id === id);
  const room = doc.rooms.find((r) => r.id === f?.roomId);
  if (!f || !room) return { ok: false, error: "No such item" };
  const fp = footprint(f);
  // Try right, left, behind, in front; take the first spot that fits without being pushed back.
  const spots = [
    [fp.w + 0.1, 0],
    [-(fp.w + 0.1), 0],
    [0, fp.d + 0.1],
    [0, -(fp.d + 0.1)],
  ];
  for (const [ox, oz] of spots) {
    const want = { ...f, id: uid(), x: r3(f.x + ox), z: r3(f.z + oz) };
    const got = fitInside(want, room);
    if (got.x === want.x && got.z === want.z) return { ok: true, doc: { ...doc, furniture: [...list(doc), got] } };
  }
  return { ok: false, error: `No free space in ${room.name} for another ${FURNITURE[f.type].label.toLowerCase()}` };
}

export function setFinish(doc: EditorDoc, roomId: string, patch: Pick<Partial<Room>, "floor" | "wall">): EditorDoc {
  return { ...doc, rooms: doc.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)) };
}

export const CEILING_RANGE: [number, number] = [2.4, 3.6];

/** Change the floor-to-ceiling height; lights follow the ceiling, wall parts stay below it. */
export function setCeiling(doc: EditorDoc, h: number): Result {
  if (h < CEILING_RANGE[0] || h > CEILING_RANGE[1])
    return { ok: false, error: `Ceiling height must be ${CEILING_RANGE[0]}–${CEILING_RANGE[1]} m` };
  return {
    ok: true,
    doc: {
      ...doc,
      ceilingM: h,
      parts: doc.parts.map((p) =>
        p.type === "light"
          ? { ...p, position: [p.position[0], r3(h - 0.05), p.position[2]] }
          : p.position[1] > h - 0.3
            ? { ...p, position: [p.position[0], r3(h - 0.3), p.position[2]] }
            : p,
      ),
    },
  };
}

export const ceilingOf = (doc: EditorDoc) => doc.ceilingM ?? CEILING;
