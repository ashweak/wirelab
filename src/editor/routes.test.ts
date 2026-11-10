import { describe, expect, it } from "vitest";
import { addBend, bendsOf, moveBend, pruneRoutes, removeBend, resetRoute } from "./routes";
import { chainHops, routeKey } from "./wiring";
import { goldenEditorDoc, toProject } from "./editor";
import type { EditorDoc, V3 } from "./parts";

const auto: V3[] = [
  [0, 1.2, 0],
  [0, 2.6, 0],
  [4, 2.6, 0],
  [4, 2.6, 3],
  [4, 2.6, 3],
];
const base: EditorDoc = { rooms: [], parts: [], feederRunM: 10 };
const K = "a>b";

describe("hand-routed conduit", () => {
  it("first edit copies the automatic bends", () => {
    const d = moveBend(base, K, auto, 1, [3, 2.6, 1]);
    expect(d.routes![K]).toEqual([
      [0, 2.6, 0],
      [3, 2.6, 1],
      [4, 2.6, 3],
    ]);
  });
  it("adds a bend on the nearest run, at that run's height (plan click)", () => {
    const { doc, index } = addBend(base, K, auto, [2, 0, 0.1], true);
    expect(index).toBe(1);
    expect(doc.routes![K][1]).toEqual([2, 2.6, 0]);
  });
  it("removes and resets", () => {
    const d = removeBend(moveBend(base, K, auto, 0, [0, 2.6, 0]), K, auto, 0);
    expect(bendsOf(d, K, auto)).toHaveLength(2);
    expect(resetRoute(d, K).routes).toEqual({});
  });
  it("prunes stale routes", () => {
    const d = moveBend(base, K, auto, 0, [0, 2.5, 0]);
    expect(pruneRoutes(d, new Set()).routes).toEqual({});
    expect(pruneRoutes(d, new Set([K]))).toBe(d);
  });
  it("custom route length feeds the run length and voltage drop", () => {
    const hops = chainHops([0, 1.5, 0], [{ id: "x", position: [3, 1.2, 0] }], 2.7, undefined, {
      panelId: "panel",
      routes: { [routeKey("panel", "x")]: [[0, 2.6, 0], [0, 2.6, 4], [3, 2.6, 4], [3, 2.6, 0]] },
    });
    expect(hops[0].custom).toBe(true);
    expect(hops[0].lengthM).toBeCloseTo(1.1 + 4 + 3 + 4 + 1.4);
  });
  it("re-routing a golden-house hop lengthens its circuit", () => {
    const doc = goldenEditorDoc();
    const before = toProject(doc);
    if (!before.ok) throw new Error();
    const c = before.project.circuits[0];
    const key = routeKey("panel", c.parts[0].id);
    const far = moveBend(doc, key, [[0, 0, 0], [0, 2.62, 0], [0, 0, 0]], 0, [0, 2.62, 20]);
    const after = toProject(far);
    if (!after.ok) throw new Error();
    expect(after.project.circuits[0].runM).toBeGreaterThan(c.runM + 20);
  });
});
