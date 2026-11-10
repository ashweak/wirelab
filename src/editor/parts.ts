import type { PartType } from "@/engine/types";

export type RoomKind = "living" | "kitchen" | "bath" | "bedroom" | "other";
export type EditorPartType = "light" | "switch" | "outlet" | "aircon" | "water_heater" | "panel";
export type V3 = [number, number, number];

export type FloorKind = "tile" | "wood" | "concrete" | "vinyl";

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
}

export type FurnitureType =
  | "bed_single"
  | "bed_double"
  | "sofa"
  | "coffee_table"
  | "dining_table"
  | "chair"
  | "desk"
  | "wardrobe"
  | "tv_stand"
  | "counter"
  | "fridge"
  | "toilet"
  | "vanity"
  | "shower";

export interface Furniture {
  id: string;
  type: FurnitureType;
  roomId: string;
  /** Centre of the footprint on the floor. */
  x: number;
  z: number;
  rot: 0 | 90 | 180 | 270;
  w: number;
  d: number;
  h: number;
  color: string;
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
}

export interface EditorDoc {
  rooms: Room[];
  parts: EditorPart[];
  feederRunM: number;
  furniture?: Furniture[];
  /** Floor-to-ceiling height (m); 2.7 when absent. */
  ceilingM?: number;
}

export const PART_INFO: Record<
  EditorPartType,
  { label: string; va: number; motor?: boolean; engineType?: PartType; height?: number }
> = {
  panel: { label: "Panelboard", va: 0, height: 1.5 },
  light: { label: "Light", va: 100, engineType: "lighting_outlet" },
  switch: { label: "Switch", va: 0, engineType: "switch", height: 1.4 },
  outlet: { label: "Outlet", va: 180, engineType: "convenience_outlet", height: 0.3 },
  aircon: { label: "Aircon 1.5 HP", va: 1800, motor: true, engineType: "aircon_outlet", height: 2.1 },
  water_heater: { label: "Water heater", va: 3500, engineType: "appliance_outlet", height: 1.8 },
};

/** Allowed mounting-height range per wall part (m). */
export const HEIGHT_RANGE: Partial<Record<EditorPartType, [number, number]>> = {
  outlet: [0.2, 1.5],
  switch: [1.0, 1.6],
  aircon: [1.8, 2.5],
  water_heater: [1.5, 2.2],
  panel: [1.2, 1.8],
};

export const isWallPart = (t: EditorPartType) => t !== "light";
