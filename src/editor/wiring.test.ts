import { describe, expect, it } from "vitest";
import { computeCircuit } from "@/engine/engine";
import { addPart, goldenEditorDoc, resetWiring, toProject, wireNext, type EditorDoc, type EditorPart } from "./editor";
import { chainOrder, designChecks, materials, segLength } from "./wiring";

/** 4 m x 4 m bedroom, panel on the left wall, two outlets on the back wall 1 m apart. */
function smallHouse(): EditorDoc {
  let doc: EditorDoc = {
    rooms: [{ id: "r1", name: "Bedroom 1", kind: "bedroom", x: 0, z: 0, w: 4, d: 4 }],
    parts: [],
    feederRunM: 10,
  };
  for (const [t, x, z] of [
    ["panel", 0.2, 1],
    ["outlet", 2, 3.9],
    ["outlet", 3, 3.9],
  ] as const) {
    const r = addPart(doc, t, x, z);
    if (!r.ok) throw new Error(r.error);
    doc = r.doc;
  }
  return doc;
}
const outlets = (d: EditorDoc) => d.parts.filter((p) => p.type === "outlet");

describe("segment routing", () => {
  it("runs through the wall between devices on the same wall", () => {
    const [a, b] = outlets(smallHouse());
    expect(segLength(a.position, b.position)).toBeCloseTo(1, 5);
  });

  it("goes up to the ceiling, across, and down otherwise", () => {
    const d = smallHouse();
    const panel = d.parts[0];
    // up 1.2 + across 1.92 + 2.92 + down 2.4
    expect(segLength(panel.position, outlets(d)[0].position)).toBeCloseTo(8.44, 5);
  });
});

describe("daisy chain", () => {
  it("chains from the panel to the nearest device, then onward", () => {
    const d = smallHouse();
    const [o1, o2] = outlets(d);
    expect(chainOrder(d.parts[0].position, [o2, o1]).map((p) => p.id)).toEqual([o1.id, o2.id]);
  });

  it("follows a hand-drawn order when the user wires it", () => {
    const d = smallHouse();
    const [o1, o2] = outlets(d);
    const wired: EditorPart[] = [
      { ...o1, seq: 2 },
      { ...o2, seq: 1 },
    ];
    expect(chainOrder(d.parts[0].position, wired).map((p) => p.id)).toEqual([o2.id, o1.id]);
  });

  it("gives the engine segment lengths with downstream load", () => {
    const r = toProject(smallHouse());
    if (!r.ok) throw new Error(r.error);
    const c = r.project.circuits[0];
    expect(c.segments!.map((s) => Math.round(s.lengthM * 100) / 100)).toEqual([8.44, 1]);
    expect(c.segments!.map((s) => s.downstreamVA)).toEqual([360, 180]);
    expect(c.runM).toBe(9.4);
  });
});

describe("distributed voltage drop", () => {
  it("sums each segment's drop using only the current still flowing", () => {
    const r = computeCircuit({
      id: "C1",
      name: "C1",
      kind: "outlet",
      runM: 0,
      parts: [
        { id: "a", type: "convenience_outlet", room: "r" },
        { id: "b", type: "convenience_outlet", room: "r" },
      ],
      segments: [
        { lengthM: 10, downstreamVA: 360 },
        { lengthM: 5, downstreamVA: 180 },
      ],
    });
    // 2·(360/230)·10·0.00524 + 2·(180/230)·5·0.00524 = 0.205 V
    expect(r.dropV).toBe(0.21);
    expect(r.dropPct).toBe(0.1);
    expect(r.runM).toBe(15);
  });
});

describe("design checks", () => {
  it("warns when a room with lights has no switch", () => {
    let d = smallHouse();
    const lit = addPart(d, "light", 2, 2);
    if (!lit.ok) throw new Error();
    d = lit.doc;
    expect(designChecks(d).map((c) => [c.code, c.severity])).toEqual([["NO-SWITCH", "warning"]]);
    const sw = addPart(d, "switch", 0.2, 3);
    if (!sw.ok) throw new Error();
    expect(designChecks(sw.doc)).toEqual([]);
  });
});

describe("materials", () => {
  it("lists wire, conduit, boxes and breakers for the run", () => {
    const m = materials(smallHouse());
    const qty = (item: string) => m.find((x) => x.item === item)?.qty;
    // 9.44 m of run, 2 devices with 0.3 m tails each
    expect(qty("THHN 3.5 mm² wire (line + neutral)")).toBe(21);
    expect(qty("THHN 2.0 mm² wire, green (ground)")).toBe(11);
    expect(qty("PVC conduit 15 mm (½\"), 3 m length")).toBe(4);
    expect(qty("Utility box 2\" × 4\"")).toBe(2);
    expect(qty("Octagonal junction box")).toBe(1);
    expect(qty("Duplex convenience outlet")).toBe(2);
    expect(qty("Circuit breaker 20 A, 2-pole")).toBe(1);
  });
});

describe("golden house", () => {
  it("still rebuilds with no engine or design warnings", () => {
    const d = goldenEditorDoc();
    const r = toProject(d);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.circuits.every((c) => c.segments?.length === c.parts.length)).toBe(true);
    expect(designChecks(d)).toEqual([]);
  });
});

describe("wire tool", () => {
  it("numbers devices in click order and reset clears it", () => {
    const d = smallHouse();
    const [o1, o2] = outlets(d);
    const wired = wireNext(wireNext(d, o2.id), o1.id);
    expect(outlets(wired).map((p) => p.seq)).toEqual([2, 1]);
    const r = toProject(wired);
    if (!r.ok) throw new Error();
    expect(r.project.circuits[0].parts.map((p) => p.id)).toEqual([o2.id, o1.id]);
    expect(r.project.circuits[0].runM).toBe(10.4);
    expect(outlets(resetWiring(wired)).every((p) => p.seq === undefined)).toBe(true);
  });
});
