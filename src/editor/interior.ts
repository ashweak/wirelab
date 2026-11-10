import { CEILING } from "@/data/goldenHouse";
import { FLOOR_MATERIALS } from "./floors";
import { roomAt, snap } from "./editor";
import { PART_INFO, type EditorDoc, type FloorKind, type Furniture, type FurnitureType, type Room } from "./parts";

type Result = { ok: true; doc: EditorDoc } | { ok: false; error: string };

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export type FurnitureGroup =
  | "Bedroom"
  | "Living"
  | "Dining"
  | "Kitchen"
  | "Bath"
  | "Office"
  | "Commercial"
  | "Architecture"
  | "Outdoor"
  | "Utility"
  | "People"
  | "Vehicles";

/** Parametric 3D recipe used to draw a catalogue item at any size. */
export type ModelKind =
  | "bed" | "bunk" | "crib" | "sofa" | "sectional" | "armchair" | "table" | "round_table" | "chair" | "stool"
  | "office_chair" | "cabinet" | "shelf" | "wardrobe" | "tv" | "counter" | "sink_counter" | "island" | "fridge"
  | "washer" | "range" | "toilet" | "urinal" | "vanity" | "pedestal_sink" | "shower" | "tub" | "rug" | "floor_lamp"
  | "piano" | "board" | "partition" | "glass" | "door" | "window" | "column" | "round_column" | "stairs" | "ramp"
  | "railing" | "fence" | "tree" | "palm" | "shrub" | "plant" | "pool" | "tank" | "bin" | "post" | "box"
  | "ac_outdoor" | "solar" | "person" | "wheelchair" | "car" | "pickup" | "van" | "jeepney" | "truck" | "moto"
  | "tricycle" | "bicycle" | "jalousie" | "roller_door";

export interface FurnitureSpec {
  label: string;
  group: FurnitureGroup;
  w: number;
  d: number;
  h: number;
  color: string;
  model: ModelKind;
  /** Height above the floor the item hangs at (windows, upper cabinets). */
  lift?: number;
  /** Doors and windows: snap onto the nearest wall line, aligned with it. */
  wallMount?: boolean;
}

/** Any size is allowed between these bounds (m). */
export const SIZE_LIMITS = { w: [0.05, 30], d: [0.05, 30], h: [0.02, 15] } as const;

type Row = [string, string, FurnitureGroup, number, number, number, string, ModelKind, number?];
const ROWS: Row[] = [
  // Bedroom
  ["bed_single", "Single bed", "Bedroom", 1.0, 2.0, 0.55, "#5b7fa6", "bed"],
  ["bed_double", "Double bed", "Bedroom", 1.5, 2.0, 0.55, "#8a6f9e", "bed"],
  ["bed_queen", "Queen bed", "Bedroom", 1.6, 2.03, 0.6, "#7d8f6b", "bed"],
  ["bed_king", "King bed", "Bedroom", 1.93, 2.03, 0.6, "#a0675b", "bed"],
  ["bunk_bed", "Bunk bed", "Bedroom", 1.0, 2.0, 1.7, "#4f7da0", "bunk"],
  ["crib", "Baby crib", "Bedroom", 0.7, 1.3, 0.95, "#e8d9c0", "crib"],
  ["wardrobe", "Wardrobe", "Bedroom", 1.2, 0.6, 2.0, "#a27b55", "wardrobe"],
  ["dresser", "Dresser", "Bedroom", 1.2, 0.5, 0.85, "#9b7653", "cabinet"],
  ["nightstand", "Nightstand", "Bedroom", 0.45, 0.4, 0.55, "#8a6a4a", "cabinet"],
  ["vanity_table", "Vanity table", "Bedroom", 1.0, 0.45, 0.75, "#d9c8b0", "table"],
  ["desk", "Study desk", "Bedroom", 1.2, 0.6, 0.75, "#c2a27a", "table"],
  // Living
  ["sofa", "Sofa (3-seat)", "Living", 2.0, 0.9, 0.85, "#4f6d5a", "sofa"],
  ["loveseat", "Loveseat", "Living", 1.5, 0.85, 0.85, "#6b5a4f", "sofa"],
  ["sectional", "L-shaped sofa", "Living", 2.8, 2.0, 0.85, "#5a6470", "sectional"],
  ["armchair", "Armchair", "Living", 0.85, 0.85, 0.85, "#9b6b4a", "armchair"],
  ["coffee_table", "Coffee table", "Living", 1.0, 0.55, 0.42, "#7a5a3c", "table"],
  ["side_table", "Side table", "Living", 0.5, 0.5, 0.55, "#7a5a3c", "table"],
  ["tv_stand", "TV + stand", "Living", 1.6, 0.45, 0.5, "#3a3f47", "tv"],
  ["bookshelf", "Bookshelf", "Living", 0.9, 0.35, 1.8, "#8b6a46", "shelf"],
  ["console_table", "Console table", "Living", 1.2, 0.35, 0.8, "#5c4632", "table"],
  ["piano", "Upright piano", "Living", 1.5, 0.6, 1.25, "#1d1d1f", "piano"],
  ["rug", "Area rug", "Living", 2.0, 1.4, 0.01, "#b5855a", "rug"],
  ["floor_lamp", "Floor lamp", "Living", 0.4, 0.4, 1.6, "#e8dcc2", "floor_lamp"],
  // Dining
  ["dining_table", "Dining table (6)", "Dining", 1.5, 0.9, 0.75, "#8b6a46", "table"],
  ["dining_table_8", "Dining table (8)", "Dining", 2.2, 1.0, 0.75, "#6f5236", "table"],
  ["round_dining", "Round dining table", "Dining", 1.1, 1.1, 0.75, "#9b7653", "round_table"],
  ["chair", "Dining chair", "Dining", 0.45, 0.45, 0.9, "#6b4f35", "chair"],
  ["bench", "Bench", "Dining", 1.4, 0.35, 0.45, "#7a5a3c", "table"],
  ["buffet", "Buffet / sideboard", "Dining", 1.6, 0.45, 0.85, "#5c4632", "cabinet"],
  ["bar_stool", "Bar stool", "Dining", 0.4, 0.4, 0.75, "#2f3338", "stool"],
  // Kitchen
  ["counter", "Kitchen counter", "Kitchen", 2.4, 0.6, 0.9, "#d9d4ca", "counter"],
  ["sink_counter", "Sink counter", "Kitchen", 1.2, 0.6, 0.9, "#d9d4ca", "sink_counter"],
  ["island", "Kitchen island", "Kitchen", 1.8, 0.9, 0.9, "#ece6da", "island"],
  ["upper_cabinet", "Upper cabinet", "Kitchen", 1.2, 0.35, 0.7, "#e2dccf", "cabinet", 1.45],
  ["fridge", "Refrigerator", "Kitchen", 0.7, 0.7, 1.7, "#c7ccd1", "fridge"],
  ["range", "Range / oven", "Kitchen", 0.6, 0.6, 0.9, "#b9bec4", "range"],
  ["dishwasher", "Dishwasher", "Kitchen", 0.6, 0.6, 0.85, "#c9ced3", "cabinet"],
  ["washer", "Washing machine", "Kitchen", 0.6, 0.6, 0.85, "#eef0f2", "washer"],
  ["dryer", "Clothes dryer", "Kitchen", 0.6, 0.6, 0.85, "#e4e7ea", "washer"],
  // Bath
  ["toilet", "Toilet", "Bath", 0.4, 0.65, 0.75, "#f2f2ef", "toilet"],
  ["urinal", "Urinal", "Bath", 0.4, 0.35, 0.65, "#f2f2ef", "urinal", 0.45],
  ["vanity", "Sink vanity", "Bath", 0.8, 0.5, 0.85, "#e8e4dc", "vanity"],
  ["pedestal_sink", "Pedestal sink", "Bath", 0.5, 0.45, 0.85, "#f4f4f2", "pedestal_sink"],
  ["shower", "Shower", "Bath", 0.9, 0.9, 2.0, "#cfe3ee", "shower"],
  ["bathtub", "Bathtub", "Bath", 1.7, 0.75, 0.55, "#f4f4f2", "tub"],
  // Office
  ["office_desk", "Office desk", "Office", 1.6, 0.8, 0.75, "#a58b6c", "table"],
  ["office_chair", "Office chair", "Office", 0.6, 0.6, 1.1, "#2d3138", "office_chair"],
  ["conference_table", "Conference table", "Office", 3.0, 1.2, 0.75, "#6f5236", "table"],
  ["filing_cabinet", "Filing cabinet", "Office", 0.45, 0.6, 1.3, "#8d949c", "cabinet"],
  ["whiteboard", "Whiteboard", "Office", 1.8, 0.5, 1.9, "#f7f7f5", "board"],
  ["reception", "Reception counter", "Office", 2.4, 0.7, 1.1, "#c9b79c", "counter"],
  ["cubicle", "Cubicle partition", "Office", 1.5, 0.06, 1.5, "#7d8792", "partition"],
  ["printer", "Printer / copier", "Office", 0.6, 0.6, 1.1, "#d6d9dd", "box"],
  // Commercial
  ["gondola", "Store shelf (gondola)", "Commercial", 1.2, 0.6, 1.6, "#cfd4d9", "shelf"],
  ["rack", "Storage rack", "Commercial", 2.0, 0.6, 2.0, "#4b6a8a", "shelf"],
  ["checkout", "Checkout counter", "Commercial", 1.6, 0.7, 0.95, "#3d5a73", "counter"],
  ["display_fridge", "Display chiller", "Commercial", 1.2, 0.7, 2.0, "#dfe6ec", "fridge"],
  ["booth", "Restaurant booth", "Commercial", 1.6, 0.7, 1.1, "#8a2f2f", "sofa"],
  ["cafe_table", "Café table", "Commercial", 0.7, 0.7, 0.75, "#3a3f47", "round_table"],
  // Architecture
  ["door", "Door", "Architecture", 0.9, 0.12, 2.1, "#8a6a4a", "door"],
  ["double_door", "Double door", "Architecture", 1.6, 0.12, 2.1, "#6f5236", "door"],
  ["sliding_door", "Sliding glass door", "Architecture", 2.0, 0.12, 2.1, "#bcd6e3", "glass"],
  ["window", "Window", "Architecture", 1.2, 0.12, 1.2, "#bcd6e3", "window", 0.9],
  ["wide_window", "Wide window", "Architecture", 2.4, 0.12, 1.4, "#bcd6e3", "window", 0.8],
  ["column", "Square column", "Architecture", 0.3, 0.3, 2.7, "#c9c4b8", "column"],
  ["round_column", "Round column", "Architecture", 0.35, 0.35, 2.7, "#c9c4b8", "round_column"],
  ["stairs", "Stairs", "Architecture", 1.0, 3.6, 2.7, "#b0a690", "stairs"],
  ["ramp", "Ramp (1:12)", "Architecture", 1.2, 3.6, 0.3, "#9a9a92", "ramp"],
  ["railing", "Railing", "Architecture", 2.0, 0.05, 1.0, "#5c6670", "railing"],
  ["partition_wall", "Partition wall", "Architecture", 2.0, 0.1, 2.7, "#e6e0d4", "partition"],
  ["glass_partition", "Glass partition", "Architecture", 2.0, 0.05, 2.4, "#bcd6e3", "glass"],
  ["panel_door", "Panel door (wood)", "Architecture", 0.9, 0.12, 2.1, "#7a5232", "door"],
  ["flush_door", "Flush door", "Architecture", 0.8, 0.12, 2.1, "#c8a77e", "door"],
  ["pvc_door", "PVC bathroom door", "Architecture", 0.7, 0.12, 2.1, "#e9e6df", "door"],
  ["folding_door", "Folding door", "Architecture", 1.8, 0.12, 2.1, "#d9d2c3", "door"],
  ["garage_door", "Roll-up garage door", "Architecture", 2.7, 0.15, 2.4, "#9aa3ad", "roller_door"],
  ["awning_window", "Awning window", "Architecture", 0.76, 0.12, 0.91, "#bcd6e3", "window", 1.2],
  ["casement_window", "Casement window", "Architecture", 0.91, 0.12, 0.91, "#bcd6e3", "window", 1.0],
  ["sliding_window", "Sliding window", "Architecture", 1.22, 0.12, 0.91, "#bcd6e3", "window", 1.0],
  ["jalousie_window", "Jalousie window", "Architecture", 0.6, 0.12, 0.9, "#bcd6e3", "jalousie", 1.2],
  ["fixed_window", "Fixed picture window", "Architecture", 1.5, 0.12, 1.2, "#bcd6e3", "window", 0.9],
  ["transom", "Transom / vent window", "Architecture", 0.9, 0.12, 0.3, "#bcd6e3", "jalousie", 2.15],
  // Outdoor
  ["tree", "Shade tree", "Outdoor", 3.0, 3.0, 5.0, "#3f7a3a", "tree"],
  ["palm", "Palm tree", "Outdoor", 2.5, 2.5, 6.0, "#4b8a3c", "palm"],
  ["shrub", "Shrub", "Outdoor", 1.0, 1.0, 0.9, "#4f8a45", "shrub"],
  ["potted_plant", "Potted plant", "Outdoor", 0.5, 0.5, 1.2, "#3f7a3a", "plant"],
  ["garden_bench", "Garden bench", "Outdoor", 1.5, 0.5, 0.45, "#7a5a3c", "table"],
  ["fence", "Fence", "Outdoor", 3.0, 0.08, 1.5, "#d7d1c4", "fence"],
  ["gate", "Gate", "Outdoor", 3.0, 0.1, 1.8, "#3d4248", "railing"],
  ["pool", "Swimming pool", "Outdoor", 6.0, 3.0, 0.1, "#3fa7d6", "pool"],
  ["patio_set", "Patio table", "Outdoor", 0.9, 0.9, 0.72, "#f2efe8", "round_table"],
  ["lamp_post", "Lamp post", "Outdoor", 0.3, 0.3, 3.5, "#2f3338", "post"],
  ["trash_bin", "Trash bin", "Outdoor", 0.5, 0.5, 0.9, "#2f6b3a", "bin"],
  // Utility
  ["water_tank", "Water tank", "Utility", 1.1, 1.1, 1.5, "#2f5f8a", "tank"],
  ["generator", "Generator set", "Utility", 1.2, 0.7, 0.9, "#c9a227", "box"],
  ["ac_outdoor", "Aircon outdoor unit", "Utility", 0.8, 0.3, 0.55, "#eef0f2", "ac_outdoor"],
  ["solar_panel", "Solar panel", "Utility", 1.7, 1.0, 0.6, "#1f2f4a", "solar"],
  ["meter", "Electric meter", "Utility", 0.3, 0.15, 0.4, "#d6d9dd", "box", 1.4],
  // People (for scale)
  ["person_man", "Man (1.75 m)", "People", 0.5, 0.3, 1.75, "#3b5b8a", "person"],
  ["person_woman", "Woman (1.60 m)", "People", 0.45, 0.28, 1.6, "#a04a6a", "person"],
  ["person_child", "Child (1.10 m)", "People", 0.35, 0.22, 1.1, "#d18b2c", "person"],
  ["person_elderly", "Senior (1.62 m)", "People", 0.45, 0.3, 1.62, "#6a6f4a", "person"],
  ["wheelchair_user", "Wheelchair user", "People", 0.65, 1.1, 1.3, "#3b5b8a", "wheelchair"],
  // Vehicles
  ["car_sedan", "Sedan", "Vehicles", 4.6, 1.8, 1.45, "#b33a3a", "car"],
  ["car_suv", "SUV", "Vehicles", 4.8, 1.9, 1.8, "#2f3338", "car"],
  ["pickup", "Pickup truck", "Vehicles", 5.3, 1.9, 1.8, "#e6e6e6", "pickup"],
  ["van", "Van", "Vehicles", 5.0, 1.9, 2.0, "#f2f2f2", "van"],
  ["jeepney", "Jeepney", "Vehicles", 6.0, 2.0, 2.3, "#c9c9c9", "jeepney"],
  ["truck", "Truck", "Vehicles", 7.0, 2.4, 3.2, "#2f5f8a", "truck"],
  ["motorcycle", "Motorcycle", "Vehicles", 2.0, 0.75, 1.1, "#b33a3a", "moto"],
  ["tricycle", "Tricycle", "Vehicles", 2.4, 1.4, 1.5, "#2f7a4a", "tricycle"],
  ["bicycle", "Bicycle", "Vehicles", 1.75, 0.6, 1.05, "#2f5f8a", "bicycle"],
];

const WALL_MOUNT = new Set(["door", "window", "glass", "jalousie", "roller_door"]);
const WALL_MOUNT_IDS = new Set(["sliding_door"]);

export const FURNITURE: Record<string, FurnitureSpec> = Object.fromEntries(
  ROWS.map(([id, label, group, w, d, h, color, model, lift]) => [
    id,
    {
      label,
      group,
      w,
      d,
      h,
      color,
      model,
      ...(lift ? { lift } : {}),
      ...((WALL_MOUNT.has(model) && model !== "glass") || WALL_MOUNT_IDS.has(id) ? { wallMount: true } : {}),
    },
  ]),
);

export const FURNITURE_GROUPS: FurnitureGroup[] = [
  "Bedroom",
  "Living",
  "Dining",
  "Kitchen",
  "Bath",
  "Office",
  "Commercial",
  "Architecture",
  "Outdoor",
  "Utility",
  "People",
  "Vehicles",
];

export const FLOOR_KINDS: { kind: FloorKind; label: string; color: string }[] = FLOOR_MATERIALS.map((m) => ({
  kind: m.id,
  label: m.label,
  color: m.color,
}));

export const WALL_PAINTS = ["#f1ece2", "#e6dccb", "#d7e3e8", "#e3ead9", "#efe0d9", "#cfd5dc", "#f4f4f2", "#3e4a56"];

/** Default finishes by room type. */
export function defaultFinish(room: Pick<Room, "kind">): { floor: { kind: FloorKind; color: string }; wall: string } {
  const id: FloorKind =
    room.kind === "bath" || room.kind === "kitchen"
      ? "tile"
      : room.kind === "bedroom"
        ? "wood"
        : room.kind === "living"
          ? "vinyl"
          : "concrete";
  const m = FLOOR_MATERIALS.find((f) => f.id === id)!;
  return { floor: { kind: id, color: m.color }, wall: room.kind === "bath" ? "#d7e3e8" : "#f1ece2" };
}

export const footprint = (f: Pick<Furniture, "w" | "d" | "rot">) =>
  f.rot === 90 || f.rot === 270 ? { w: f.d, d: f.w } : { w: f.w, d: f.d };

/** Keep a piece's footprint inside its room. */
export function fitInside(f: Furniture, room: Room | undefined): Furniture {
  const fp = footprint(f);
  // Outdoors, or too big for the room it was dropped on (a car on a bedroom): leave it where it was put.
  if (!room || fp.w > room.w + 1e-9 || fp.d > room.d + 1e-9) return { ...f, roomId: "", x: r3(f.x), z: r3(f.z) };
  const along = (v: number, lo: number, size: number, span: number) => clamp(v, lo + size / 2, lo + span - size / 2);
  if (FURNITURE[f.type]?.wallMount) return snapToWall(f, room);
  return {
    ...f,
    roomId: room.id,
    x: r3(along(f.x, room.x, fp.w, room.w)),
    z: r3(along(f.z, room.z, fp.d, room.d)),
  };
}

/** Put a door or window on the nearest wall line of the room, its width running along the wall. */
function snapToWall(f: Furniture, room: Room): Furniture {
  const walls = [
    { dist: f.z - room.z, rot: 0, z: room.z, alongX: true },
    { dist: room.z + room.d - f.z, rot: 0, z: room.z + room.d, alongX: true },
    { dist: f.x - room.x, rot: 90, x: room.x, alongX: false },
    { dist: room.x + room.w - f.x, rot: 90, x: room.x + room.w, alongX: false },
  ];
  const best = walls.reduce((a, b) => (b.dist < a.dist ? b : a));
  const span = best.alongX ? room.w : room.d;
  const lo = best.alongX ? room.x : room.z;
  const w = Math.min(f.w, span);
  const along = clamp(best.alongX ? f.x : f.z, lo + w / 2, lo + span - w / 2);
  return {
    ...f,
    roomId: room.id,
    w,
    rot: best.rot as Furniture["rot"],
    x: r3(best.alongX ? along : best.x!),
    z: r3(best.alongX ? best.z! : along),
  };
}

const list = (doc: EditorDoc) => doc.furniture ?? [];

export function addFurniture(doc: EditorDoc, type: FurnitureType, x: number, z: number, step: number): Result {
  const spec = FURNITURE[type];
  if (!spec) return { ok: false, error: "Unknown item" };
  const room = roomAt(doc.rooms, x, z);
  const f = fitInside(
    { id: uid(), type, roomId: "", x: snap(x, step), z: snap(z, step), rot: 0, w: spec.w, d: spec.d, h: spec.h, color: spec.color },
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
  return { ok: true, doc: replace(doc, fitInside({ ...f, x: snap(x, step), z: snap(z, step) }, roomAt(doc.rooms, x, z))) };
}

export function rotateFurniture(doc: EditorDoc, id: string): Result {
  const f = list(doc).find((q) => q.id === id);
  if (!f) return { ok: false, error: "No such item" };
  const rot = ((f.rot + 90) % 360) as Furniture["rot"];
  return { ok: true, doc: replace(doc, fitInside({ ...f, rot }, doc.rooms.find((r) => r.id === f.roomId))) };
}

export function resizeFurniture(doc: EditorDoc, id: string, size: Partial<Pick<Furniture, "w" | "d" | "h">>): Result {
  const f = list(doc).find((q) => q.id === id);
  if (!f) return { ok: false, error: "No such item" };
  const names = { w: "Width", d: "Depth", h: "Height" } as const;
  for (const k of ["w", "d", "h"] as const) {
    const v = size[k];
    if (v === undefined) continue;
    const [lo, hi] = SIZE_LIMITS[k];
    if (!(v >= lo - 1e-9 && v <= hi + 1e-9)) return { ok: false, error: `${names[k]} must be ${lo}–${hi} m` };
  }
  return { ok: true, doc: replace(doc, fitInside({ ...f, ...size }, doc.rooms.find((r) => r.id === f.roomId))) };
}

export function setFurnitureColor(doc: EditorDoc, id: string, color: string): EditorDoc {
  const f = list(doc).find((q) => q.id === id);
  return f ? replace(doc, { ...f, color }) : doc;
}

export function duplicateFurniture(doc: EditorDoc, id: string): Result {
  const f = list(doc).find((q) => q.id === id);
  if (!f) return { ok: false, error: "No such item" };
  const room = doc.rooms.find((r) => r.id === f.roomId);
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
  return { ok: false, error: `No free space in ${room?.name} for another ${FURNITURE[f.type].label.toLowerCase()}` };
}

export function setFinish(doc: EditorDoc, roomId: string, patch: Pick<Partial<Room>, "floor" | "wall">): EditorDoc {
  return { ...doc, rooms: doc.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)) };
}

export function setRoomMaterials(
  doc: EditorDoc,
  roomId: string,
  patch: Pick<Partial<Room>, "wallMat" | "ceilingMat">,
): EditorDoc {
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
        PART_INFO[p.type].mount === "ceiling"
          ? { ...p, position: [p.position[0], r3(h - 0.05), p.position[2]] }
          : p.position[1] > h - 0.3
            ? { ...p, position: [p.position[0], r3(h - 0.3), p.position[2]] }
            : p,
      ),
    },
  };
}

export const ceilingOf = (doc: EditorDoc) => doc.ceilingM ?? CEILING;
