import { describe, expect, it } from "vitest";
import { computeSchedule } from "@/engine/engine";
import { addPart, toProject, type EditorDoc } from "./editor";
import { FURNITURE, SIZE_LIMITS, addFurniture, moveFurniture, resizeFurniture } from "./interior";
import { PART_INFO, PART_TYPES, type EditorPartType } from "./parts";
import { designChecks, materials } from "./wiring";

const ok = (r: { ok: true; doc: EditorDoc } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

/** Living room 6 x 5 with the panel on the left wall. */
function room(kind: "living" | "bath" = "living"): EditorDoc {
  return ok(
    addPart(
      { rooms: [{ id: "r1", name: "Room 1", kind, x: 0, z: 0, w: 6, d: 5 }], parts: [], feederRunM: 10 },
      "panel",
      0.2,
      1,
    ),
  );
}
const place = (doc: EditorDoc, t: EditorPartType, x: number, z: number) => ok(addPart(doc, t, x, z));

describe("furniture catalogue", () => {
  const items = Object.entries(FURNITURE);

  it("has a broad architect's library including people and vehicles", () => {
    expect(items.length).toBeGreaterThanOrEqual(70);
    const groups = new Set(items.map(([, s]) => s.group));
    for (const g of ["Bedroom", "Living", "Kitchen", "Bath", "Office", "Architecture", "Outdoor", "People", "Vehicles"])
      expect(groups).toContain(g);
  });

  it("gives every item sane default dimensions", () => {
    for (const [, s] of items) {
      expect(s.w).toBeGreaterThan(0);
      expect(s.d).toBeGreaterThan(0);
      expect(s.h).toBeGreaterThan(0);
      expect(s.label.length).toBeGreaterThan(2);
    }
  });

  it("uses true-to-life sizes for people and vehicles", () => {
    expect(FURNITURE.person_man.h).toBeCloseTo(1.75, 2);
    expect(FURNITURE.car_sedan.w).toBeGreaterThan(4);
    expect(FURNITURE.jeepney.w).toBeGreaterThan(5);
  });
});

describe("open sizing", () => {
  it("accepts any size up to the global maximum", () => {
    const d = ok(addFurniture(room(), "sofa", 3, 2.5, 0.1));
    const id = d.furniture![0].id;
    expect(ok(resizeFurniture(d, id, { w: 5.8, h: 3 })).furniture![0]).toMatchObject({ w: 5.8, h: 3 });
    const r = resizeFurniture(d, id, { w: SIZE_LIMITS.w[1] + 1 });
    expect(!r.ok && r.error).toBe(`Width must be ${SIZE_LIMITS.w[0]}–${SIZE_LIMITS.w[1]} m`);
  });
});

describe("outdoor items", () => {
  it("places vehicles, people and trees outside any room without clamping", () => {
    const d = ok(addFurniture(room(), "car_sedan", 12, 3, 0.1));
    expect(d.furniture![0]).toMatchObject({ roomId: "", x: 12, z: 3 });
    const moved = ok(moveFurniture(d, d.furniture![0].id, 15.5, -4, 0.1));
    expect(moved.furniture![0]).toMatchObject({ roomId: "", x: 15.5, z: -4 });
  });

  it("leaves an item that is bigger than the room where it was dropped", () => {
    const d = ok(addFurniture(room(), "truck", 3, 2.5, 0.1));
    expect(d.furniture![0]).toMatchObject({ roomId: "", x: 3, z: 2.5 });
  });

  it("still keeps indoor furniture inside the room it lands in", () => {
    const d = ok(addFurniture(room(), "bed_king", 5.9, 2.5, 0.1));
    const b = d.furniture![0];
    expect(b.roomId).toBe("r1");
    expect(b.x + b.w / 2).toBeLessThanOrEqual(6 + 1e-9);
  });
});

describe("electrical devices", () => {
  it("covers lighting, power, dedicated appliances and low-voltage", () => {
    expect(PART_TYPES.length).toBeGreaterThanOrEqual(24);
    const circuits = new Set(PART_TYPES.map((t) => PART_INFO[t].circuit));
    expect([...circuits].sort()).toEqual(["dedicated", "lighting", "none", "outlet", "panel"]);
  });

  it("puts fans and downlights on the lighting circuit, GFCI on outlets, big loads on their own", () => {
    let d = room();
    d = place(d, "light", 3, 2.5);
    d = place(d, "ceiling_fan", 2, 2.5);
    d = place(d, "downlight", 4, 2.5);
    d = place(d, "switch", 0.2, 3);
    d = place(d, "gfci_outlet", 3, 4.9);
    d = place(d, "range_outlet", 5, 4.9);
    d = place(d, "ev_charger", 5.9, 1);
    d = place(d, "data_outlet", 1, 4.9);
    const r = toProject(d);
    if (!r.ok) throw new Error(r.error);
    const kinds = r.project.circuits.map((c) => [c.kind, c.parts.length]);
    expect(kinds).toEqual([
      ["lighting", 4],
      ["outlet", 1],
      ["appliance", 1],
      ["appliance", 1],
    ]);
    const s = computeSchedule(r.project);
    expect(s.circuits[0].loadVA).toBe(100 + 75 + 15);
    // 7,400 VA EV charger: 32.2 A x 1.25 -> 50 A breaker on 8.0 mm²
    expect(s.circuits[3]).toMatchObject({ breakerA: 50, wireMm2: 8.0 });
    expect(s.checks).toEqual([]);
  });

  it("lists low-voltage devices in materials without putting them on a breaker", () => {
    let d = room();
    d = place(d, "outlet", 3, 4.9);
    d = place(d, "data_outlet", 1, 4.9);
    d = place(d, "cctv", 5, 4.9);
    const m = materials(d);
    expect(m.find((x) => x.item === "Data outlet (RJ45)")?.qty).toBe(1);
    expect(m.find((x) => x.item === "CCTV camera")?.qty).toBe(1);
    expect(m.filter((x) => x.item.startsWith("Circuit breaker")).reduce((s, x) => s + x.qty, 0)).toBe(1);
  });

  it("mounts ceiling devices on the ceiling and floor outlets on the floor", () => {
    const d = place(place(room(), "smoke_detector", 3, 2), "floor_outlet", 3, 3);
    expect(d.parts.find((p) => p.type === "smoke_detector")!.position[1]).toBe(2.65);
    expect(d.parts.find((p) => p.type === "floor_outlet")!.position).toEqual([3, 0.02, 3]);
  });

  it("warns when a bathroom outlet is not GFCI", () => {
    const d = place(room("bath"), "outlet", 3, 4.9);
    expect(designChecks(d).map((c) => c.code)).toContain("GFCI-BATH");
    const g = place(room("bath"), "gfci_outlet", 3, 4.9);
    expect(designChecks(g).map((c) => c.code)).not.toContain("GFCI-BATH");
  });

  it("treats every lighting load as needing a switch", () => {
    const d = place(room(), "ceiling_fan", 3, 2.5);
    expect(designChecks(d).map((c) => c.code)).toEqual(["NO-SWITCH"]);
  });
});
