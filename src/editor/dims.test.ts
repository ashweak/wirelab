import { describe, expect, it } from "vitest";
import { goldenEditorDoc } from "./editor";
import { setFurnitureElevation, setPartSize, setRoomDims, setRoomHeight } from "./interior";
import { estimate, tileSize, wallThickness } from "./construction";
import { nominalSize, routeCeiling, sizeScale, PART_INFO } from "./parts";
import { toProject } from "./editor";

const ok = <T,>(r: { ok: true; doc: T } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe("custom sizes", () => {
  const doc = goldenEditorDoc();
  const room = doc.rooms[0];

  it("room height moves its ceiling lights and lowers the conduit level", () => {
    const d = ok(setRoomHeight(doc, room.id, 2.4));
    const light = d.parts.find((p) => p.roomId === room.id && PART_INFO[p.type].mount === "ceiling");
    if (light) expect(light.position[1]).toBeCloseTo(2.35);
    expect(routeCeiling(d, 2.7)).toBe(2.4);
    expect(setRoomHeight(doc, room.id, 1).ok).toBe(false);
    expect(ok(setRoomHeight(d, room.id, undefined)).rooms[0].h).toBeUndefined();
  });

  it("taller rooms need more wall material", () => {
    const base = estimate(doc).walls.reduce((s, w) => s + w.areaM2, 0);
    const tall = estimate(ok(setRoomHeight(doc, room.id, 4))).walls.reduce((s, w) => s + w.areaM2, 0);
    expect(tall).toBeGreaterThan(base);
  });

  it("custom tile size changes the tile count and label", () => {
    const tiled = doc.rooms.find((r) => tileSize(r) !== null)!;
    const d = ok(setRoomDims(doc, tiled.id, { tile: 0.6 }));
    const g = estimate(d).floors.find((f) => f.label.includes("60 × 60 cm"));
    expect(g).toBeTruthy();
    expect(tileSize(d.rooms.find((r) => r.id === tiled.id)!)).toBe(0.6);
  });

  it("wall thickness is clamped and resettable", () => {
    const d = ok(setRoomDims(doc, room.id, { wallT: 5 }));
    expect(wallThickness(d.rooms[0])).toBe(1);
    expect(wallThickness(ok(setRoomDims(d, room.id, { wallT: null })).rooms[0])).toBe(0.1);
  });

  it("furniture elevation and device size are stored and clamped", () => {
    const f = doc.furniture![0];
    expect(ok(setFurnitureElevation(doc, f.id, 1.2)).furniture![0].y).toBe(1.2);
    const p = doc.parts[1];
    const d = ok(setPartSize(doc, p.id, [0.5, 9, 0.001]));
    expect(d.parts[1].size).toEqual([0.5, 3, 0.02]);
    const n = nominalSize(p.type);
    expect(sizeScale(p.type, [n[0] * 2, n[1], n[2]])).toEqual([2, 1, 1]);
  });

  it("still builds a valid project after resizing", () => {
    const d = ok(setRoomHeight(doc, room.id, 3.2));
    expect(toProject(d).ok).toBe(true);
  });
});
