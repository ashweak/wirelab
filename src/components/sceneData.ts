import type { Circuit } from "@/engine/types";
import { facing, type EditorPartType, type V3 } from "@/editor/editor";
import { chainOrder, chainPaths, dropPoints } from "@/editor/wiring";

export interface SceneRoom {
  id: string;
  name: string;
  kind?: import("@/editor/parts").RoomKind;
  floor?: import("@/editor/parts").Room["floor"];
  wall?: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface SceneDevice {
  id: string;
  type: EditorPartType;
  position: V3;
  facing: number;
  /** Small label next to the device (wire order). */
  tag?: string;
}

export interface SceneCircuit {
  id: string;
  devices: SceneDevice[];
  paths: V3[][];
  drops: V3[];
}

const FROM_ENGINE: Record<string, EditorPartType> = {
  lighting_outlet: "light",
  convenience_outlet: "outlet",
  aircon_outlet: "aircon",
  appliance_outlet: "water_heater",
  switch: "switch",
};

export function deviceFor(
  p: { id: string; type: string; position: V3; room?: string; roomId?: string },
  rooms: SceneRoom[],
  tag?: string,
): SceneDevice {
  const room = rooms.find((r) => r.id === (p.roomId ?? p.room));
  return {
    id: p.id,
    type: (FROM_ENGINE[p.type] ?? p.type) as EditorPartType,
    position: p.position,
    facing: room ? facing(p.position, room) : 0,
    tag,
  };
}

/** Chain each circuit (already ordered for editor projects) and build conduit paths. */
export function sceneCircuits(
  panel: V3,
  circuits: Circuit[],
  rooms: SceneRoom[],
  tags: Map<string, string> = new Map(),
  ceiling?: number,
): SceneCircuit[] {
  return circuits.map((c) => {
    const placed = c.parts.filter((p) => p.position) as (Circuit["parts"][number] & { position: V3 })[];
    const ordered = c.segments ? placed : chainOrder(panel, placed, ceiling);
    const paths = chainPaths(panel, ordered, ceiling);
    return {
      id: c.id,
      devices: ordered.map((p) => deviceFor(p, rooms, tags.get(p.id))),
      paths,
      drops: dropPoints(paths, ceiling),
    };
  });
}
