import { describe, expect, it } from "vitest";
import { addPart, type EditorDoc } from "./editor";
import {
  deleteItems,
  duplicatePart,
  duplicateRoom,
  movePart,
  moveRoom,
  placePreset,
  resizeRoom,
  rotateRoom,
  setPartHeight,
  ROOM_PRESETS,
} from "./transform";

/** Bedroom 4 x 3 at the origin with an outlet on the back wall and a ceiling light. */
function base(): EditorDoc {
  let doc: EditorDoc = {
    rooms: [{ id: "r1", name: "Bedroom 1", kind: "bedroom", x: 0, z: 0, w: 4, d: 3 }],
    parts: [],
    feederRunM: 10,
  };
  for (const [t, x, z] of [
    ["outlet", 2, 2.9],
    ["light", 2, 1.5],
  ] as const) {
    const r = addPart(doc, t, x, z);
    if (!r.ok) throw new Error(r.error);
    doc = r.doc;
  }
  return doc;
}
const outlet = (d: EditorDoc) => d.parts.find((p) => p.type === "outlet")!;
const light = (d: EditorDoc) => d.parts.find((p) => p.type === "light")!;
const ok = <T,>(r: { ok: true; doc: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe("move room", () => {
  it("moves the room and everything in it, snapped to the grid", () => {
    const d = ok(moveRoom(base(), "r1", 1.3, 0.6, 0.5));
    expect(d.rooms[0]).toMatchObject({ x: 1.5, z: 0.5 });
    expect(outlet(d).position).toEqual([3.5, 0.3, 3.42]);
    expect(light(d).position).toEqual([3.5, 2.65, 2]);
  });

  it("refuses to move onto another room", () => {
    const d = base();
    d.rooms.push({ id: "r2", name: "Bath 1", kind: "bath", x: 5, z: 0, w: 2, d: 2 });
    const r = moveRoom(d, "r1", 2, 0, 0.5);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe("Rooms can't overlap");
  });
});

describe("resize room", () => {
  it("keeps wall parts on their wall and lights inside", () => {
    const d = ok(resizeRoom(base(), "r1", { x: 0, z: 0, w: 3, d: 5 }));
    expect(d.rooms[0]).toMatchObject({ w: 3, d: 5 });
    // outlet was on the back wall (z = 3) -> now on the back wall at z = 5
    expect(outlet(d).position).toEqual([2, 0.3, 4.92]);
    expect(light(d).position).toEqual([2, 2.65, 1.5]);
  });

  it("clamps parts that would fall outside a smaller room", () => {
    const d = ok(resizeRoom(base(), "r1", { x: 0, z: 0, w: 1.5, d: 3 }));
    expect(outlet(d).position[0]).toBe(1.3);
    expect(light(d).position[0]).toBe(1.3);
  });

  it("enforces the 1 m minimum", () => {
    expect(resizeRoom(base(), "r1", { x: 0, z: 0, w: 0.5, d: 3 }).ok).toBe(false);
  });
});

describe("rotate room", () => {
  it("turns the room 90° about its centre and carries the parts to the matching wall", () => {
    const d = ok(rotateRoom(base(), "r1"));
    // centre (2, 1.5); 4 x 3 becomes 3 x 4
    expect(d.rooms[0]).toMatchObject({ x: 0.5, z: -0.5, w: 3, d: 4 });
    // back wall (+z) rotates clockwise to the left wall (-x)
    expect(outlet(d).position).toEqual([0.58, 0.3, 1.5]);
    expect(light(d).position).toEqual([2, 2.65, 1.5]);
  });
});

describe("parts", () => {
  it("moves a part to another room and re-snaps it to the nearest wall", () => {
    const d = base();
    d.rooms.push({ id: "r2", name: "Bath 1", kind: "bath", x: 4, z: 0, w: 2, d: 2 });
    const m = ok(movePart(d, outlet(d).id, 5.9, 1));
    expect(outlet(m).roomId).toBe("r2");
    expect(outlet(m).position).toEqual([5.92, 0.3, 1]);
  });

  it("keeps a custom mounting height when moved", () => {
    const b = base();
    const d = ok(setPartHeight(b, outlet(b).id, 1.2));
    const id = outlet(d).id;
    expect(outlet(d).position[1]).toBe(1.2);
    expect(outlet(ok(movePart(d, id, 0.1, 1))).position).toEqual([0.08, 1.2, 1]);
  });

  it("rejects mounting heights outside the part's range", () => {
    const b = base();
    const r = setPartHeight(b, outlet(b).id, 2.4);
    expect(!r.ok && r.error).toBe("Outlet height must be 0.2–1.5 m");
  });

  it("duplicates a part 0.5 m along its wall with no wiring order", () => {
    const d = base();
    const o = { ...outlet(d), seq: 3 };
    d.parts = d.parts.map((p) => (p.id === o.id ? o : p));
    const r = ok(duplicatePart(d, o.id));
    const copies = r.parts.filter((p) => p.type === "outlet");
    expect(copies).toHaveLength(2);
    expect(copies[1].position).toEqual([2.5, 0.3, 2.92]);
    expect(copies[1].seq).toBeUndefined();
    expect(copies[1].id).not.toBe(o.id);
  });
});

describe("duplicate, delete, presets", () => {
  it("duplicates a room with its parts into the next free spot", () => {
    const d = ok(duplicateRoom(base(), "r1"));
    expect(d.rooms).toHaveLength(2);
    expect(d.rooms[1]).toMatchObject({ x: 4, z: 0, w: 4, d: 3, name: "Bedroom 2" });
    expect(d.parts.filter((p) => p.roomId === d.rooms[1].id)).toHaveLength(2);
  });

  it("deleting a room deletes its parts", () => {
    const d = deleteItems(base(), ["r1"]);
    expect(d.rooms).toHaveLength(0);
    expect(d.parts).toHaveLength(0);
  });

  it("drops a preset room centred on the cursor", () => {
    const preset = ROOM_PRESETS.find((p) => p.id === "bath")!;
    const d = ok(placePreset(base(), preset, 6.1, 1.2, 0.5));
    expect(d.rooms[1]).toMatchObject({ kind: "bath", x: 5, z: 0, w: 2, d: 2, name: "Bath 1" });
    expect(placePreset(base(), preset, 2, 1, 0.5).ok).toBe(false);
  });
});
