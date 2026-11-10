import type { PartType } from "@/engine/types";

export type RoomKind = "living" | "kitchen" | "bath" | "bedroom" | "other";
export type EditorPartType = "light" | "switch" | "outlet" | "aircon" | "water_heater" | "panel";
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
  /** Order set by the Wire tool; parts without it are chained automatically. */
  seq?: number;
}

export interface EditorDoc {
  rooms: Room[];
  parts: EditorPart[];
  feederRunM: number;
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

export const isWallPart = (t: EditorPartType) => t !== "light";
