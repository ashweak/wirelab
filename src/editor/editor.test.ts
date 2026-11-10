import { describe, expect, it } from "vitest";
import { computeSchedule } from "@/engine/engine";
import { goldenHouse } from "@/data/goldenHouse";
import {
  addPart,
  goldenEditorDoc,
  makeRoom,
  routeLength,
  snap,
  snapPart,
  toProject,
  type EditorDoc,
} from "./editor";

const empty = (): EditorDoc => ({ rooms: [], parts: [], feederRunM: 10 });

describe("grid snapping", () => {
  it("snaps to 0.5 m", () => {
    expect(snap(0.26)).toBe(0.5);
    expect(snap(0.24)).toBe(0);
    expect(snap(3.74)).toBe(3.5);
  });
});

describe("rooms", () => {
  it("normalizes a rectangle dragged in any direction", () => {
    const r = makeRoom([5, 4], [0, 0], "living", []);
    expect(r.ok && r.room).toMatchObject({ x: 0, z: 0, w: 5, d: 4, kind: "living", name: "Living 1" });
  });

  it("rejects rooms smaller than 1 m x 1 m", () => {
    const r = makeRoom([0, 0], [0.5, 3], "bath", []);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe("A room must be at least 1 m × 1 m");
  });

  it("rejects overlapping rooms but allows shared walls", () => {
    const a = makeRoom([0, 0], [4, 4], "bedroom", []);
    if (!a.ok) throw new Error();
    expect(makeRoom([3, 3], [6, 6], "bedroom", [a.room]).ok).toBe(false);
    const b = makeRoom([4, 0], [7, 4], "bedroom", [a.room]);
    expect(b.ok && b.room.name).toBe("Bedroom 2");
  });
});

describe("part snapping", () => {
  const room = { id: "r1", name: "Kitchen 1", kind: "kitchen" as const, x: 0, z: 0, w: 5, d: 4 };

  it("puts lights on the ceiling", () => {
    expect(snapPart("light", room, 2, 2)).toEqual([2, 2.65, 2]);
  });

  it("puts outlets on the nearest wall, 1.1 m high in kitchens", () => {
    expect(snapPart("outlet", room, 4.6, 2)).toEqual([4.92, 1.1, 2]);
    expect(snapPart("outlet", { ...room, kind: "bedroom" }, 2, 0.3)).toEqual([2, 0.3, 0.08]);
  });

  it("mounts aircon at 2.1 m and the panel at 1.5 m", () => {
    expect(snapPart("aircon", room, 0.4, 2)[1]).toBe(2.1);
    expect(snapPart("panel", room, 0.4, 2)).toEqual([0.08, 1.5, 2]);
  });

  it("only places parts inside a room", () => {
    const doc = { ...empty(), rooms: [room] };
    expect(addPart(doc, "light", 7, 7).ok).toBe(false);
    const r = addPart(doc, "light", 2, 2);
    expect(r.ok && r.doc.parts).toHaveLength(1);
  });

  it("keeps a single panel", () => {
    let doc: EditorDoc = { ...empty(), rooms: [room] };
    for (const z of [1, 3]) {
      const r = addPart(doc, "panel", 0.2, z);
      if (r.ok) doc = r.doc;
    }
    expect(doc.parts.filter((p) => p.type === "panel")).toHaveLength(1);
    expect(doc.parts[0].position[2]).toBe(3);
  });
});

describe("wire routing", () => {
  it("measures panel -> ceiling -> across -> down", () => {
    // up 1.2 + across 4.85 + 3.4 + down 2.4 = 11.85
    expect(routeLength([0.15, 1.5, 0.6], [5, 0.3, 4])).toBeCloseTo(11.85, 5);
  });
});

describe("auto circuits", () => {
  const room = { id: "r1", name: "Living 1", kind: "living" as const, x: 0, z: 0, w: 6, d: 5 };
  const withPanel = (): EditorDoc => {
    const r = addPart({ ...empty(), rooms: [room] }, "panel", 0.2, 1);
    if (!r.ok) throw new Error(r.error);
    return r.doc;
  };

  it("needs a panel", () => {
    const r = toProject({ ...empty(), rooms: [room] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe("Place a panelboard first");
  });

  it("splits outlets into circuits of at most 8", () => {
    let doc = withPanel();
    for (let i = 0; i < 9; i++) {
      const r = addPart(doc, "outlet", 0.5 + i * 0.5, 4.8);
      if (r.ok) doc = r.doc;
    }
    const r = toProject(doc);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.circuits.map((c) => c.parts.length)).toEqual([8, 1]);
    expect(r.project.circuits.map((c) => c.kind)).toEqual(["outlet", "outlet"]);
  });

  it("gives every aircon its own circuit", () => {
    let doc = withPanel();
    for (const x of [2, 4]) {
      const r = addPart(doc, "aircon", x, 4.8);
      if (r.ok) doc = r.doc;
    }
    const r = toProject(doc);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.circuits).toHaveLength(2);
    expect(computeSchedule(r.project).checks).toEqual([]);
  });

  it("rebuilds the golden house with the same loads, breakers and wires", () => {
    const r = toProject(goldenEditorDoc());
    if (!r.ok) throw new Error(r.error);
    const got = computeSchedule(r.project);
    const want = computeSchedule(goldenHouse());
    const pick = (s: typeof got) =>
      s.circuits.map(({ loadVA, breakerA, wireMm2, kind }) => ({ loadVA, breakerA, wireMm2, kind }));
    expect(pick(got)).toEqual(pick(want));
    expect(got.main.loadVA).toBe(want.main.loadVA);
    expect(got.main.breakerA).toBe(want.main.breakerA);
    expect(got.checks).toEqual([]);
  });
});
