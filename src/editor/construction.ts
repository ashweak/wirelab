/**
 * Construction materials and quantity estimates.
 *
 * Sources for the masonry figures (Philippine practice):
 * - AEDO Construction, "Bill of materials for a house": 12.5 CHB per m² of wall face for
 *   100 mm and 150 mm; mortar cement 0.50 / 0.65 bags (40 kg) and sand 0.035 / 0.045 m³ per m².
 *   https://aedoconstruction.com/blog/bill-of-materials-house-philippines/
 * - AEDO, AAC block prices: 8.33 pieces per m² for a 600 × 200 mm face.
 *   https://aedoconstruction.com/blog/aac-blocks-price-per-piece-philippines-2026/
 * - PRC architecture review notes: gypsum board on metal furring is the common ceiling;
 *   fiber cement where moisture and fire resistance are needed.
 *   https://open-exam-prep.com/study-guides/ph-prc-architecture/building-materials-construction/building-materials-specifications
 * Board, tile and brick counts are derived from their sizes; all quantities are planning
 * figures with waste allowances, not a substitute for a quantity surveyor's take-off.
 */
import { CEILING } from "@/data/goldenHouse";
import { FURNITURE } from "./interior";
import type { EditorDoc, Room } from "./parts";

export interface QtyLine {
  item: string;
  qty: number;
  unit: string;
}

export interface WallMaterial {
  id: string;
  label: string;
  /** Finished thickness of the wall (m). */
  thickness: number;
  color: string;
  note: string;
  /** Quantities for `area` m² of wall face whose run (length) is `run` m and height `h`. */
  qty: (area: number, run: number, h: number) => QtyLine[];
}

const WASTE = 1.05;
const BOARD_M2 = 1.22 * 2.44; // 4 × 8 ft sheet
const c1 = (v: number) => Math.round(v * 10) / 10;
const c2 = (v: number) => Math.round(v * 100) / 100;

const masonry = (label: string, perM2: number, cement: number, sand: number) =>
  (area: number): QtyLine[] => [
    { item: `${label} blocks`, qty: Math.ceil(area * perM2 * WASTE), unit: "pcs" },
    { item: "Cement, 40 kg (mortar)", qty: Math.ceil(area * cement), unit: "bags" },
    { item: "Sand (mortar)", qty: c2(area * sand), unit: "m³" },
    { item: "Cement plaster, both faces", qty: c1(area * 2), unit: "m²" },
  ];

const boarded = (board: string, stud: string) =>
  (area: number, run: number, h: number): QtyLine[] => [
    { item: `${board}, 4 × 8 ft (both faces)`, qty: Math.ceil(((area * 2) / BOARD_M2) * 1.1), unit: "sheets" },
    { item: `${stud}, ${h.toFixed(1)} m (at 0.6 m)`, qty: Math.ceil(run / 0.6) + 1, unit: "pcs" },
    { item: "Joint tape + compound", qty: c1(area * 2), unit: "m²" },
  ];

export const WALL_MATERIALS: WallMaterial[] = [
  { id: "chb100", label: 'CHB 4" (100 mm)', thickness: 0.1, color: "#bdb8ad", note: "Most common interior/exterior wall in the Philippines", qty: masonry('CHB 4" (100 mm)', 12.5, 0.5, 0.035) },
  { id: "chb150", label: 'CHB 6" (150 mm)', thickness: 0.15, color: "#b3ada0", note: "Exterior and load-bearing walls, firewalls", qty: masonry('CHB 6" (150 mm)', 12.5, 0.65, 0.045) },
  {
    id: "aac100",
    label: "AAC block (100 mm)",
    thickness: 0.1,
    color: "#e4e1da",
    note: "Lightweight autoclaved block, 600 × 200 mm face, thin-bed adhesive",
    qty: (area) => [
      { item: "AAC blocks 600 × 200 × 100", qty: Math.ceil(area * 8.33 * WASTE), unit: "pcs" },
      { item: "Thin-bed adhesive, 40 kg", qty: Math.ceil(area / 6), unit: "bags" },
      { item: "Skim coat, both faces", qty: c1(area * 2), unit: "m²" },
    ],
  },
  {
    id: "brick100",
    label: "Clay brick (half-brick)",
    thickness: 0.1,
    color: "#a8553a",
    note: "215 × 65 mm bricks with 10 mm joints ≈ 59 per m²",
    qty: (area) => [
      { item: "Clay bricks 215 × 102 × 65", qty: Math.ceil(area * 59.3 * WASTE), unit: "pcs" },
      { item: "Mortar (cement + sand)", qty: c2(area * 0.022), unit: "m³" },
    ],
  },
  {
    id: "concrete150",
    label: "Cast-in-place concrete (150 mm)",
    thickness: 0.15,
    color: "#a9aaa6",
    note: "Shear walls, retaining walls, wet areas",
    qty: (area) => [
      { item: "Concrete (ready-mix)", qty: c2(area * 0.15 * WASTE), unit: "m³" },
      { item: "Formwork, both faces", qty: c1(area * 2), unit: "m²" },
    ],
  },
  { id: "drywall", label: "Gypsum drywall on metal studs", thickness: 0.1, color: "#ecebe6", note: "Dry partition, 12 mm board each face", qty: boarded("Gypsum board 12 mm", "Metal stud") },
  { id: "fibercement", label: "Fiber cement board on metal studs", thickness: 0.1, color: "#d9d6cf", note: "Moisture- and fire-resistant partition", qty: boarded("Fiber cement board 6 mm", "Metal stud") },
  { id: "plywood", label: "Plywood on wood studs", thickness: 0.09, color: "#c9a77a", note: "Light partition, ½\" marine plywood", qty: boarded('Marine plywood ½"', "Wood stud 2 × 3") },
];

export { FLOOR_MATERIALS, type FloorMaterial } from "./floors";
import { FLOOR_MATERIALS } from "./floors";

export interface CeilingMaterial {
  id: string;
  label: string;
  note: string;
}

export const CEILING_MATERIALS: CeilingMaterial[] = [
  { id: "gypsum", label: "Gypsum board 9 mm on metal furring", note: "Most common interior ceiling" },
  { id: "moisture_gypsum", label: "Moisture-resistant gypsum", note: "Toilets and kitchens" },
  { id: "fibercement", label: "Fiber cement board 4.5 mm", note: "Moisture and fire resistance" },
  { id: "pvc", label: "PVC ceiling panel", note: "No painting needed" },
  { id: "wood_tg", label: "Tongue-and-groove wood", note: "Traditional Filipino look" },
  { id: "acoustic", label: "Acoustic ceiling tile 60 × 60", note: "Offices, classrooms" },
];

export const WALL_OF = (r: Room) => WALL_MATERIALS.find((m) => m.id === (r.wallMat ?? "chb100")) ?? WALL_MATERIALS[0];

type Side = "left" | "right" | "front" | "back";
const EPS = 1e-6;

/** Overlap length of [a0,a1] and [b0,b1]. */
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** Length of each side of `r` that another room shares. */
function sharedLengths(r: Room, others: Room[]): Record<Side, number> {
  const out = { left: 0, right: 0, front: 0, back: 0 };
  for (const o of others) {
    if (o.id === r.id) continue;
    const zOver = overlap(r.z, r.z + r.d, o.z, o.z + o.d);
    const xOver = overlap(r.x, r.x + r.w, o.x, o.x + o.w);
    if (Math.abs(o.x + o.w - r.x) < EPS) out.left += zOver;
    if (Math.abs(o.x - (r.x + r.w)) < EPS) out.right += zOver;
    if (Math.abs(o.z + o.d - r.z) < EPS) out.front += xOver;
    if (Math.abs(o.z - (r.z + r.d)) < EPS) out.back += xOver;
  }
  return out;
}

/** For each room, whether each side is (at least partly) shared with another room. */
export function roomSides(rooms: Room[]): Record<string, Record<Side, boolean>> {
  return Object.fromEntries(
    rooms.map((r) => {
      const s = sharedLengths(r, rooms);
      return [r.id, { left: s.left > EPS, right: s.right > EPS, front: s.front > EPS, back: s.back > EPS }];
    }),
  );
}

/** Wall length of each room, counting a shared wall only for the room listed first. */
function runsByRoom(rooms: Room[]): Map<string, number> {
  const runs = new Map<string, number>();
  rooms.forEach((r, i) => {
    const s = sharedLengths(r, rooms.slice(0, i));
    const perimeter = 2 * (r.w + r.d);
    runs.set(r.id, perimeter - (s.left + s.right + s.front + s.back));
  });
  return runs;
}

export const wallRunLength = (rooms: Room[]) => [...runsByRoom(rooms).values()].reduce((a, b) => a + b, 0);

export interface EstimateGroup {
  material: string;
  label: string;
  areaM2: number;
  items: QtyLine[];
}

export interface Estimate {
  walls: EstimateGroup[];
  floors: EstimateGroup[];
  ceilings: EstimateGroup[];
  openings: QtyLine[];
}

export function estimate(doc: EditorDoc): Estimate {
  const h = doc.ceilingM ?? CEILING;
  const runs = runsByRoom(doc.rooms);
  const openingArea = new Map<string, number>();
  const openings = new Map<string, number>();
  for (const f of doc.furniture ?? []) {
    if (!FURNITURE[f.type]?.wallMount) continue;
    openingArea.set(f.roomId, (openingArea.get(f.roomId) ?? 0) + f.w * f.h);
    const label = FURNITURE[f.type].label;
    openings.set(label, (openings.get(label) ?? 0) + 1);
  }

  const wallAgg = new Map<string, { area: number; run: number }>();
  for (const r of doc.rooms) {
    const m = WALL_OF(r);
    const run = runs.get(r.id) ?? 0;
    const area = Math.max(0, run * h - (openingArea.get(r.id) ?? 0));
    const cur = wallAgg.get(m.id) ?? { area: 0, run: 0 };
    wallAgg.set(m.id, { area: cur.area + area, run: cur.run + run });
  }
  // Walls drawn line by line with the WALL command.
  for (const e of doc.draft?.entities ?? []) {
    if (e.kind !== "wall") continue;
    const run = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    const id = WALL_MATERIALS.some((m) => m.id === e.mat) ? e.mat : "chb100";
    const cur = wallAgg.get(id) ?? { area: 0, run: 0 };
    wallAgg.set(id, { area: cur.area + run * h, run: cur.run + run });
  }
  const walls = [...wallAgg].map(([id, { area, run }]) => {
    const m = WALL_MATERIALS.find((x) => x.id === id)!;
    return { material: id, label: m.label, areaM2: c2(area), items: m.qty(area, run, h) };
  });

  const floorAgg = new Map<string, number>();
  for (const r of doc.rooms) {
    const id = r.floor?.kind ?? "tile";
    floorAgg.set(id, (floorAgg.get(id) ?? 0) + r.w * r.d);
  }
  const floors = [...floorAgg].map(([id, area]) => {
    const m = FLOOR_MATERIALS.find((x) => x.id === id) ?? FLOOR_MATERIALS[0];
    const items: QtyLine[] = m.unit
      ? [
          { item: m.label, qty: Math.ceil((area / (m.unit[0] * m.unit[1])) * WASTE), unit: "pcs" },
          ...(m.id === "carpet" ? [] : [{ item: "Tile adhesive, 25 kg", qty: Math.ceil(area / 4), unit: "bags" }]),
        ]
      : [{ item: m.label, qty: c1(area * (m.id === "concrete" || m.id === "epoxy" ? 1 : WASTE)), unit: "m²" }];
    return { material: id, label: m.label, areaM2: c2(area), items };
  });

  const ceilAgg = new Map<string, number>();
  for (const r of doc.rooms) {
    const id = r.ceilingMat ?? "gypsum";
    ceilAgg.set(id, (ceilAgg.get(id) ?? 0) + r.w * r.d);
  }
  const ceilings = [...ceilAgg].map(([id, area]) => {
    const m = CEILING_MATERIALS.find((x) => x.id === id) ?? CEILING_MATERIALS[0];
    const boards = id === "gypsum" || id === "moisture_gypsum" || id === "fibercement";
    return {
      material: id,
      label: m.label,
      areaM2: c2(area),
      items: boards
        ? [{ item: `${m.label.split(" on ")[0]}, 4 × 8 ft`, qty: Math.ceil((area / BOARD_M2) * 1.1), unit: "sheets" }]
        : [{ item: m.label, qty: c1(area * 1.1), unit: "m²" }],
    };
  });

  return {
    walls,
    floors,
    ceilings,
    openings: [...openings].map(([item, qty]) => ({ item, qty, unit: "pcs" })),
  };
}
