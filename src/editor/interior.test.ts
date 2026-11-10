import { describe, expect, it } from "vitest";
import { computeSchedule } from "@/engine/engine";
import { addPart, toProject, type EditorDoc } from "./editor";
import {
  FURNITURE,
  addFurniture,
  duplicateFurniture,
  footprint,
  moveFurniture,
  resizeFurniture,
  rotateFurniture,
  setCeiling,
  setFinish,
} from "./interior";
import { deleteItems, duplicateRoom, moveRoom, rotateRoom } from "./transform";
import { segLength } from "./wiring";

/** Bedroom 4 x 3 with a panel on the left wall, an outlet on the back wall and a light. */
function base(): EditorDoc {
  let doc: EditorDoc = {
    rooms: [{ id: "r1", name: "Bedroom 1", kind: "bedroom", x: 0, z: 0, w: 4, d: 3 }],
    parts: [],
    feederRunM: 10,
  };
  for (const [t, x, z] of [
    ["panel", 0.2, 1],
    ["outlet", 2, 2.9],
    ["light", 2, 1.5],
  ] as const) {
    const r = addPart(doc, t, x, z);
    if (!r.ok) throw new Error(r.error);
    doc = r.doc;
  }
  return doc;
}
const ok = (r: { ok: true; doc: EditorDoc } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const bed = (d: EditorDoc) => d.furniture!.find((f) => f.type === "bed_double")!;

describe("furniture", () => {
  it("drops with catalogue defaults, snapped and kept inside the room", () => {
    const d = ok(addFurniture(base(), "bed_double", 3.9, 1.4, 0.1));
    const b = bed(d);
    expect(b).toMatchObject({ roomId: "r1", rot: 0, w: 1.5, d: 2.0, h: FURNITURE.bed_double.h });
    // 1.5 m wide bed pushed in so its right edge meets the wall at x = 4
    expect(b.x).toBe(3.25);
    expect(b.z).toBe(1.4);
  });

  it("places furniture outdoors when dropped outside every room", () => {
    const d = ok(addFurniture(base(), "sofa", 9, 9, 0.1));
    expect(d.furniture![0]).toMatchObject({ roomId: "", x: 9, z: 9 });
  });

  it("rotates 90° and swaps its footprint, staying inside", () => {
    const placed = ok(addFurniture(base(), "bed_double", 2, 1.5, 0.1));
    const turned = ok(rotateFurniture(placed, bed(placed).id));
    expect(bed(turned).rot).toBe(90);
    expect(footprint(bed(turned))).toEqual({ w: 2.0, d: 1.5 });
  });

  it("resizes freely within the global limits", () => {
    const placed = ok(addFurniture(base(), "bed_double", 2, 1.5, 0.1));
    const big = ok(resizeFurniture(placed, bed(placed).id, { w: 1.8 }));
    expect(bed(big).w).toBe(1.8);
    const r = resizeFurniture(placed, bed(placed).id, { h: 0.01 });
    expect(!r.ok && r.error).toBe("Height must be 0.02–15 m");
  });

  it("moves into another room", () => {
    const d = ok(addFurniture(base(), "sofa", 2, 1.5, 0.1));
    d.rooms.push({ id: "r2", name: "Living 1", kind: "living", x: 4, z: 0, w: 5, d: 4 });
    const s = d.furniture![0];
    const m = ok(moveFurniture(d, s.id, 6.5, 2, 0.1));
    expect(m.furniture![0]).toMatchObject({ roomId: "r2", x: 6.5, z: 2 });
  });
});

describe("duplicate furniture", () => {
  it("puts the copy beside the original, never on top of it", () => {
    const d = ok(addFurniture(base(), "chair", 3.7, 1.5, 0.1));
    const c = d.furniture![0];
    const two = ok(duplicateFurniture(d, c.id));
    expect(two.furniture![1].x).toBeCloseTo(c.x - 0.55, 5);
    expect(two.furniture![1].z).toBe(c.z);
  });
});

describe("rooms carry their furniture", () => {
  const withBed = () => ok(addFurniture(base(), "bed_double", 2, 1.5, 0.1));

  it("on move", () => {
    const d = ok(moveRoom(withBed(), "r1", 1, 0, 0.5));
    expect(bed(d).x).toBe(3);
  });

  it("on rotate (position and orientation)", () => {
    const d = ok(rotateRoom(withBed(), "r1"));
    expect(bed(d)).toMatchObject({ x: 2, z: 1.5, rot: 90 });
  });

  it("on duplicate and delete", () => {
    const dup = ok(duplicateRoom(withBed(), "r1"));
    expect(dup.furniture).toHaveLength(2);
    expect(dup.furniture![1].roomId).toBe(dup.rooms[1].id);
    expect(deleteItems(dup, ["r1"]).furniture).toHaveLength(1);
  });
});

describe("finishes", () => {
  it("stores floor finish and wall paint per room", () => {
    const d = setFinish(base(), "r1", { floor: { kind: "wood", color: "#a0703c" }, wall: "#e8e1d4" });
    expect(d.rooms[0]).toMatchObject({ floor: { kind: "wood", color: "#a0703c" }, wall: "#e8e1d4" });
  });
});

describe("ceiling height", () => {
  it("raises lights and lengthens ceiling-routed wire", () => {
    const d = base();
    const panel = d.parts.find((p) => p.type === "panel")!;
    const outlet = d.parts.find((p) => p.type === "outlet")!;
    const before = segLength(panel.position, outlet.position);
    const tall = ok(setCeiling(d, 3.0));
    expect(tall.ceilingM).toBe(3.0);
    expect(tall.parts.find((p) => p.type === "light")!.position[1]).toBe(2.95);
    // 0.3 m more up from the panel and 0.3 m more down to the outlet
    expect(segLength(panel.position, outlet.position, 3.0)).toBeCloseTo(before + 0.6, 5);

    const run = (doc: EditorDoc) => {
      const r = toProject(doc);
      if (!r.ok) throw new Error();
      return computeSchedule(r.project).circuits.find((c) => c.kind === "outlet")!.runM;
    };
    expect(run(tall)).toBeCloseTo(run(d) + 0.6, 1);
  });

  it("must be 2.4–3.6 m", () => {
    const r = setCeiling(base(), 2);
    expect(!r.ok && r.error).toBe("Ceiling height must be 2.4–3.6 m");
  });
});
