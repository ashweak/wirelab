import { describe, expect, it } from "vitest";
import type { EditorDoc } from "./editor";
import { addFurniture } from "./interior";
import {
  CEILING_MATERIALS,
  FLOOR_MATERIALS,
  WALL_MATERIALS,
  estimate,
  roomSides,
  wallRunLength,
} from "./construction";

const ok = (r: { ok: true; doc: EditorDoc } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const doc = (rooms: EditorDoc["rooms"]): EditorDoc => ({ rooms, parts: [], feederRunM: 10 });
const R1 = { id: "a", name: "Bedroom 1", kind: "bedroom" as const, x: 0, z: 0, w: 4, d: 3 };
const R2 = { id: "b", name: "Bath 1", kind: "bath" as const, x: 4, z: 0, w: 3, d: 3 };

describe("material library", () => {
  it("covers the common Philippine wall systems with real thicknesses", () => {
    const ids = WALL_MATERIALS.map((m) => m.id);
    for (const id of ["chb100", "chb150", "concrete150", "aac100", "brick100", "drywall", "fibercement", "plywood"])
      expect(ids).toContain(id);
    expect(WALL_MATERIALS.find((m) => m.id === "chb100")!.thickness).toBe(0.1);
    expect(WALL_MATERIALS.find((m) => m.id === "chb150")!.thickness).toBe(0.15);
  });

  it("covers floor finishes and ceilings", () => {
    expect(FLOOR_MATERIALS.length).toBeGreaterThanOrEqual(9);
    expect(CEILING_MATERIALS.map((m) => m.id)).toEqual(expect.arrayContaining(["gypsum", "fibercement", "pvc"]));
  });
});

describe("walls", () => {
  it("knows which sides are shared and which are exterior", () => {
    const s = roomSides([R1, R2]);
    expect(s.a).toMatchObject({ left: false, right: true, front: false, back: false });
    expect(s.b).toMatchObject({ left: true, right: false });
  });

  it("counts a shared wall once", () => {
    expect(wallRunLength([R1])).toBeCloseTo(14, 6);
    expect(wallRunLength([R1, R2])).toBeCloseTo(14 + 12 - 3, 6);
  });
});

describe("estimate", () => {
  it("deducts door and window openings from wall area", () => {
    let d = doc([R1]);
    d = ok(addFurniture(d, "door", 2, 0.1, 0.1));
    d = ok(addFurniture(d, "window", 2, 2.9, 0.1));
    const e = estimate(d);
    const w = e.walls.find((x) => x.material === "chb100")!;
    // 14 m x 2.7 m = 37.8, minus door 0.9 x 2.1 and window 1.2 x 1.2
    expect(w.areaM2).toBeCloseTo(37.8 - 1.89 - 1.44, 2);
  });

  it("uses 12.5 CHB/m² + 5% waste, 0.5 bags and 0.035 m³ sand per m² for 4-inch CHB", () => {
    const d = doc([{ ...R1, w: 2, d: 2 }]); // 8 m run x 2.7 = 21.6 m²
    const w = estimate({ ...d, ceilingM: 2.7 }).walls[0];
    expect(w.areaM2).toBeCloseTo(21.6, 6);
    const q = Object.fromEntries(w.items.map((i) => [i.item, i.qty]));
    expect(q["CHB 4\" (100 mm) blocks"]).toBe(Math.ceil(21.6 * 12.5 * 1.05));
    expect(q["Cement, 40 kg (mortar)"]).toBe(Math.ceil(21.6 * 0.5));
    expect(q["Sand (mortar)"]).toBeCloseTo(0.76, 2);
    expect(q["Cement plaster, both faces"]).toBeCloseTo(43.2, 1);
  });

  it("counts floor tiles by size with 5% waste", () => {
    const d = { ...doc([{ ...R1, floor: { kind: "porcelain60" as const, color: "#ddd" } }]) };
    const f = estimate(d).floors.find((x) => x.material === "porcelain60")!;
    expect(f.areaM2).toBe(12);
    expect(f.items.find((i) => i.item.startsWith("Porcelain tile"))!.qty).toBe(Math.ceil((12 / 0.36) * 1.05));
  });

  it("sizes the ceiling in boards", () => {
    const c = estimate(doc([R1])).ceilings[0];
    expect(c.areaM2).toBe(12);
    // 4 x 8 ft board = 2.9768 m², 10% waste
    expect(c.items[0].qty).toBe(Math.ceil((12 / 2.9768) * 1.1));
  });
});

describe("doors and windows snap into walls", () => {
  it("lines a window up on the nearest wall", () => {
    const back = ok(addFurniture(doc([R1]), "window", 1.5, 2.8, 0.1)).furniture![0];
    expect(back).toMatchObject({ z: 3, rot: 0, x: 1.5 });
    const left = ok(addFurniture(doc([R1]), "door", 0.2, 1.5, 0.1)).furniture![0];
    expect(left).toMatchObject({ x: 0, rot: 90, z: 1.5 });
  });

  it("keeps the opening fully on the wall", () => {
    const f = ok(addFurniture(doc([R1]), "wide_window", 3.9, 2.9, 0.1)).furniture![0];
    expect(f.x + f.w / 2).toBeLessThanOrEqual(4 + 1e-9);
  });
});

describe("drafted walls", () => {
  it("adds WALL entities to the estimate by material", () => {
    const d: EditorDoc = {
      rooms: [],
      parts: [],
      feederRunM: 10,
      draft: {
        current: "0",
        layers: [],
        entities: [{ id: "w1", layer: "A-WALL", kind: "wall", a: [0, 0], b: [5, 0], t: 0.15, mat: "chb150" }],
      },
    };
    const w = estimate(d).walls.find((x) => x.material === "chb150")!;
    expect(w.areaM2).toBeCloseTo(5 * 2.7, 6);
  });
});
