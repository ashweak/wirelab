
export type RoomKind = "living" | "kitchen" | "bath" | "bedroom" | "other";
export type EditorPartType =
  | "panel"
  | "light"
  | "downlight"
  | "wall_lamp"
  | "ceiling_fan"
  | "exhaust_fan"
  | "emergency_light"
  | "smoke_detector"
  | "doorbell"
  | "switch"
  | "switch_3way"
  | "outlet"
  | "gfci_outlet"
  | "outdoor_outlet"
  | "floor_outlet"
  | "aircon"
  | "water_heater"
  | "range_outlet"
  | "ref_outlet"
  | "washer_outlet"
  | "water_pump"
  | "ev_charger"
  | "data_outlet"
  | "tv_outlet"
  | "cctv";
export type V3 = [number, number, number];

export type FloorKind =
  | "tile"
  | "porcelain60"
  | "granite"
  | "marble"
  | "vinyl"
  | "wood"
  | "parquet"
  | "concrete"
  | "epoxy"
  | "carpet";

export interface Room {
  id: string;
  name: string;
  kind: RoomKind;
  x: number;
  z: number;
  w: number;
  d: number;
  floor?: { kind: FloorKind; color: string };
  /** Wall paint colour. */
  wall?: string;
  /** Wall system id (see WALL_MATERIALS); CHB 4" when absent. */
  wallMat?: string;
  /** Ceiling system id (see CEILING_MATERIALS); gypsum when absent. */
  ceilingMat?: string;
  /** Floor-to-ceiling height of this room (m); the project ceiling when absent. */
  h?: number;
  /** Finished wall thickness (m), plaster included; the wall system's when absent. */
  wallT?: number;
  /** Floor tile / plank size (m, square); the finish's standard size when absent. */
  tile?: number;
}

/** Catalogue key, e.g. "bed_double" or "car_sedan" (see FURNITURE in interior.ts). */
export type FurnitureType = string;

export interface Furniture {
  id: string;
  type: FurnitureType;
  /** Room it stands in, or "" when outdoors. */
  roomId: string;
  /** Centre of the footprint on the floor. */
  x: number;
  z: number;
  rot: 0 | 90 | 180 | 270;
  w: number;
  d: number;
  h: number;
  color: string;
  /** Height of its underside above the floor (m), e.g. a window sill; catalogue default when absent. */
  y?: number;
}

export interface EditorPart {
  id: string;
  type: EditorPartType;
  roomId: string;
  position: V3;
  /** Order set by the Wire tool; parts without it are chained automatically. */
  seq?: number;
  /** Custom mounting height (m) set in the properties panel. */
  height?: number;
  /** Custom body size [width, height, depth] (m); the model's standard size when absent. */
  size?: V3;
}

export interface Draft {
  entities: import("@/cad/geometry").Entity[];
  layers: import("@/cad/geometry").Layer[];
  current: string;
}

export interface EditorDoc {
  /** AutoCAD-style drafting layer: lines, polylines, walls, text, dimensions. */
  draft?: Draft;
  rooms: Room[];
  parts: EditorPart[];
  feederRunM: number;
  furniture?: Furniture[];
  /** Floor-to-ceiling height (m); 2.7 when absent. */
  ceilingM?: number;
  /**
   * Conduit runs the user has re-routed, keyed "fromId>toId" ("panel" for the panel).
   * Values are the bend points between the two devices; absent = automatic route.
   */
  routes?: Record<string, V3[]>;
}

/** Which circuit a device rides on. "none" = low-voltage, not on a breaker. */
export type CircuitClass = "panel" | "lighting" | "outlet" | "dedicated" | "none";
export type Mount = "ceiling" | "wall" | "floor";
export type DeviceModel =
  | "panel"
  | "fixture"
  | "downlight"
  | "sconce"
  | "fan"
  | "exhaust"
  | "emergency"
  | "detector"
  | "plate"
  | "aircon"
  | "heater"
  | "box"
  | "camera";

export interface PartSpec {
  label: string;
  group: "Panel" | "Lighting" | "Switches" | "Power" | "Appliances" | "Low voltage";
  va: number;
  circuit: CircuitClass;
  mount: Mount;
  /** Default mounting height for wall devices (m). */
  height?: number;
  /** Allowed mounting-height range for wall devices (m). */
  range?: [number, number];
  motor?: boolean;
  model: DeviceModel;
  /** Name on the bill of materials. */
  bom: string;
}

export const PART_INFO: Record<EditorPartType, PartSpec> = {
  panel: { label: "Panelboard", group: "Panel", va: 0, circuit: "panel", mount: "wall", height: 1.5, range: [1.2, 1.8], model: "panel", bom: "Panelboard" },
  light: { label: "Ceiling light", group: "Lighting", va: 100, circuit: "lighting", mount: "ceiling", model: "fixture", bom: "Lighting outlet (ceiling)" },
  downlight: { label: "LED downlight", group: "Lighting", va: 15, circuit: "lighting", mount: "ceiling", model: "downlight", bom: "LED downlight (pin light)" },
  wall_lamp: { label: "Wall lamp", group: "Lighting", va: 40, circuit: "lighting", mount: "wall", height: 1.8, range: [1.5, 2.4], model: "sconce", bom: "Wall lamp (sconce)" },
  ceiling_fan: { label: "Ceiling fan", group: "Lighting", va: 75, circuit: "lighting", mount: "ceiling", model: "fan", bom: "Ceiling fan outlet" },
  exhaust_fan: { label: "Exhaust fan", group: "Lighting", va: 40, circuit: "lighting", mount: "ceiling", model: "exhaust", bom: "Exhaust fan" },
  emergency_light: { label: "Emergency light", group: "Lighting", va: 20, circuit: "lighting", mount: "wall", height: 2.2, range: [1.8, 2.6], model: "emergency", bom: "Emergency light" },
  smoke_detector: { label: "Smoke detector", group: "Lighting", va: 5, circuit: "lighting", mount: "ceiling", model: "detector", bom: "Smoke detector" },
  doorbell: { label: "Doorbell", group: "Switches", va: 10, circuit: "lighting", mount: "wall", height: 1.4, range: [1.0, 1.6], model: "plate", bom: "Doorbell + push button" },
  switch: { label: "Switch", group: "Switches", va: 0, circuit: "lighting", mount: "wall", height: 1.4, range: [1.0, 1.6], model: "plate", bom: "Wall switch, 1-gang" },
  switch_3way: { label: "3-way switch", group: "Switches", va: 0, circuit: "lighting", mount: "wall", height: 1.4, range: [1.0, 1.6], model: "plate", bom: "Wall switch, 3-way" },
  outlet: { label: "Outlet", group: "Power", va: 180, circuit: "outlet", mount: "wall", height: 0.3, range: [0.2, 1.5], model: "plate", bom: "Duplex convenience outlet" },
  gfci_outlet: { label: "GFCI outlet", group: "Power", va: 180, circuit: "outlet", mount: "wall", height: 1.1, range: [0.2, 1.5], model: "plate", bom: "GFCI outlet" },
  outdoor_outlet: { label: "Weatherproof outlet", group: "Power", va: 180, circuit: "outlet", mount: "wall", height: 0.45, range: [0.3, 1.5], model: "plate", bom: "Weatherproof outlet" },
  floor_outlet: { label: "Floor outlet", group: "Power", va: 180, circuit: "outlet", mount: "floor", model: "plate", bom: "Floor outlet box" },
  aircon: { label: "Aircon 1.5 HP", group: "Appliances", va: 1800, circuit: "dedicated", mount: "wall", height: 2.1, range: [1.8, 2.5], motor: true, model: "aircon", bom: "Aircon outlet, 20 A" },
  water_heater: { label: "Water heater", group: "Appliances", va: 3500, circuit: "dedicated", mount: "wall", height: 1.8, range: [1.5, 2.2], model: "heater", bom: "Water heater outlet" },
  range_outlet: { label: "Range / cooktop", group: "Appliances", va: 6000, circuit: "dedicated", mount: "wall", height: 0.3, range: [0.2, 1.2], model: "plate", bom: "Range outlet, 2-pole 40 A" },
  ref_outlet: { label: "Refrigerator outlet", group: "Appliances", va: 300, circuit: "dedicated", mount: "wall", height: 0.3, range: [0.2, 1.8], motor: true, model: "plate", bom: "Refrigerator outlet" },
  washer_outlet: { label: "Washing machine", group: "Appliances", va: 1000, circuit: "dedicated", mount: "wall", height: 1.0, range: [0.3, 1.5], motor: true, model: "plate", bom: "Washing machine outlet" },
  water_pump: { label: "Water pump 1 HP", group: "Appliances", va: 1100, circuit: "dedicated", mount: "wall", height: 0.6, range: [0.3, 1.5], motor: true, model: "box", bom: "Water pump disconnect + outlet" },
  ev_charger: { label: "EV charger 7.4 kW", group: "Appliances", va: 7400, circuit: "dedicated", mount: "wall", height: 1.2, range: [0.8, 1.5], model: "box", bom: "EV charger (wallbox)" },
  data_outlet: { label: "Data outlet", group: "Low voltage", va: 0, circuit: "none", mount: "wall", height: 0.3, range: [0.2, 1.5], model: "plate", bom: "Data outlet (RJ45)" },
  tv_outlet: { label: "TV outlet", group: "Low voltage", va: 0, circuit: "none", mount: "wall", height: 0.3, range: [0.2, 1.8], model: "plate", bom: "TV / CATV outlet" },
  cctv: { label: "CCTV camera", group: "Low voltage", va: 0, circuit: "none", mount: "wall", height: 2.4, range: [2.0, 3.0], model: "camera", bom: "CCTV camera" },
};

export const PART_TYPES = Object.keys(PART_INFO) as EditorPartType[];

/** Allowed mounting-height range per wall part (m). */
export const HEIGHT_RANGE: Partial<Record<EditorPartType, [number, number]>> = Object.fromEntries(
  PART_TYPES.filter((t) => PART_INFO[t].range).map((t) => [t, PART_INFO[t].range!]),
);

export const isCeiling = (t: EditorPartType) => PART_INFO[t].mount === "ceiling";
export const isFloor = (t: EditorPartType) => PART_INFO[t].mount === "floor";
/** Lighting loads that need a wall switch in their room. */
export const isLightingLoad = (t: EditorPartType) =>
  PART_INFO[t].circuit === "lighting" && !["switch", "switch_3way", "doorbell", "smoke_detector", "emergency_light"].includes(t);

export const isWallPart = (t: EditorPartType) => PART_INFO[t].mount === "wall";

/** Standard body size [width, height, depth] (m) of each device model, for custom sizing. */
const MODEL_SIZE: Record<string, V3> = {
  fixture: [0.4, 0.07, 0.4],
  downlight: [0.18, 0.03, 0.18],
  fan: [1.1, 0.3, 1.1],
  exhaust: [0.28, 0.03, 0.28],
  detector: [0.16, 0.04, 0.16],
  sconce: [0.2, 0.2, 0.16],
  emergency: [0.35, 0.12, 0.12],
  camera: [0.09, 0.09, 0.2],
  box: [0.32, 0.42, 0.14],
  plate: [0.17, 0.25, 0.03],
  aircon: [0.85, 0.29, 0.2],
  heater: [0.3, 0.45, 0.12],
  panel: [0.42, 0.55, 0.1],
};

export function nominalSize(type: EditorPartType): V3 {
  if (type === "range_outlet") return [0.25, 0.25, 0.03];
  return MODEL_SIZE[PART_INFO[type].model] ?? [0.2, 0.2, 0.1];
}

/** Per-axis scale of a device drawn at a custom size. */
export function sizeScale(type: EditorPartType, size?: V3): V3 {
  if (!size) return [1, 1, 1];
  const n = nominalSize(type);
  return [size[0] / n[0], size[1] / n[1], size[2] / n[2]];
}

/**
 * Height conduit runs at: the lowest ceiling in the house, so a run never passes above a
 * room's ceiling. `project` is the project ceiling height.
 */
export function routeCeiling(doc: Pick<EditorDoc, "rooms">, project: number): number {
  return Math.min(project, ...doc.rooms.map((r) => r.h ?? Infinity));
}
