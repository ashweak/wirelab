import type { Part, Project } from "@/engine/types";

/** Rooms of the golden test house: 10 m x 8 m = 80 m², ceiling 2.7 m. */
export const ROOMS = [
  { id: "living", name: "Living", x: 0, z: 0, w: 5, d: 4 },
  { id: "kitchen", name: "Kitchen", x: 5, z: 0, w: 3.5, d: 4 },
  { id: "bath", name: "Bath", x: 8.5, z: 0, w: 1.5, d: 4 },
  { id: "bed1", name: "Bedroom 1", x: 0, z: 4, w: 3.5, d: 4 },
  { id: "bed2", name: "Bedroom 2", x: 3.5, z: 4, w: 3.5, d: 4 },
  { id: "bed3", name: "Bedroom 3", x: 7, z: 4, w: 3, d: 4 },
] as const;

export const CEILING = 2.7;
export const PANEL_POSITION: [number, number, number] = [0.15, 1.5, 0.6];

type RoomId = (typeof ROOMS)[number]["id"];

const room = (id: RoomId) => ROOMS.find((r) => r.id === id)!;

/** Evenly spaced ceiling lights across a room. */
function lights(id: RoomId, n: number): Part[] {
  const r = room(id);
  return Array.from({ length: n }, (_, i) => ({
    id: `L-${id}-${i + 1}`,
    type: "lighting_outlet" as const,
    room: id,
    position: [r.x + (r.w * (i + 1)) / (n + 1), CEILING - 0.05, r.z + r.d / 2] as [
      number,
      number,
      number,
    ],
  }));
}

/** Outlets spread along a room's walls at the given height. */
function outlets(id: RoomId, n: number, h = 0.3): Part[] {
  const r = room(id);
  const spots: [number, number][] = [
    [r.x + 0.08, r.z + r.d * 0.3],
    [r.x + r.w - 0.08, r.z + r.d * 0.7],
    [r.x + r.w * 0.3, r.z + 0.08],
    [r.x + r.w * 0.7, r.z + r.d - 0.08],
  ];
  return Array.from({ length: n }, (_, i) => {
    const [x, z] = spots[i % 4];
    const shift = i >= 4 ? 0.6 : 0;
    return {
      id: `CO-${id}-${i + 1}`,
      type: "convenience_outlet" as const,
      room: id,
      position: [x + (i % 4 >= 2 ? shift : 0), h, z + (i % 4 < 2 ? shift : 0)] as [
        number,
        number,
        number,
      ],
    };
  });
}

export function goldenHouse(): Project {
  return {
    name: "Golden test house — 3-bedroom bungalow, 80 m²",
    feederRunM: 10,
    circuits: [
      {
        id: "C1",
        name: "C1 Lighting",
        kind: "lighting",
        runM: 25,
        parts: [
          ...lights("living", 3),
          ...lights("kitchen", 2),
          ...lights("bath", 1),
          ...lights("bed1", 2),
          ...lights("bed2", 2),
          ...lights("bed3", 2),
        ],
      },
      {
        id: "C2",
        name: "C2 Outlets, living + kitchen",
        kind: "outlet",
        runM: 18,
        parts: [...outlets("living", 4), ...outlets("kitchen", 4, 1.1)],
      },
      {
        id: "C3",
        name: "C3 Outlets, bedrooms",
        kind: "outlet",
        runM: 22,
        parts: [...outlets("bed1", 3), ...outlets("bed2", 3), ...outlets("bed3", 2)],
      },
      {
        id: "C4",
        name: "C4 Aircon 1.5 HP",
        kind: "appliance",
        runM: 15,
        parts: [
          { id: "AC-bed1", type: "aircon_outlet", room: "bed1", va: 1800, motor: true, position: [1.75, 2.1, 7.9] },
        ],
      },
      {
        id: "C5",
        name: "C5 Water heater",
        kind: "appliance",
        runM: 20,
        parts: [
          { id: "WH-bath", type: "appliance_outlet", room: "bath", va: 3500, position: [9.9, 1.8, 2] },
        ],
      },
    ],
  };
}
