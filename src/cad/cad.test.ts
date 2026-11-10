import { describe, expect, it } from "vitest";
import {
  area,
  findSnap,
  hitTest,
  length,
  mirror,
  move,
  offset,
  ortho,
  parsePoint,
  rotate,
  scale,
  selectInRect,
  type Entity,
} from "./geometry";
import { initial, run, type CadCtx, type CadState } from "./commands";

const line = (id: string, a: [number, number], b: [number, number]): Entity => ({ id, layer: "0", kind: "line", a, b });

describe("coordinate input (AutoCAD style, Y up)", () => {
  const last: [number, number] = [2, -1];
  it("absolute x,y", () => expect(parsePoint("3,4", last, null)).toEqual([3, -4]));
  it("relative @dx,dy", () => expect(parsePoint("@1,2", last, null)).toEqual([3, -3]));
  it("polar @len<angle", () => {
    const p = parsePoint("@2<90", last, null)!;
    expect(p[0]).toBeCloseTo(2, 9);
    expect(p[1]).toBeCloseTo(-3, 9);
  });
  it("direct distance along the cursor direction", () => {
    expect(parsePoint("5", [0, 0], [10, 0])).toEqual([5, 0]);
  });
  it("rejects nonsense", () => expect(parsePoint("abc", last, null)).toBeNull());
});

describe("ortho and snaps", () => {
  it("ortho keeps the larger axis", () => {
    expect(ortho([0, 0], [5, 1])).toEqual([5, 0]);
    expect(ortho([0, 0], [1, -4])).toEqual([0, -4]);
  });

  const ents = [line("a", [0, 0], [4, 0]), line("b", [2, -2], [2, 4]), { id: "c", layer: "0", kind: "circle", c: [10, 0], r: 1 } as Entity];
  it("finds endpoints, midpoints, intersections and centres", () => {
    expect(findSnap([0.1, 0.05], ents, 0.3)).toMatchObject({ pt: [0, 0], kind: "endpoint" });
    expect(findSnap([1.95, 0.1], ents, 0.3)).toMatchObject({ pt: [2, 0], kind: "intersection" });
    expect(findSnap([3.1, 0.6], ents, 0.3)).toBeNull();
    expect(findSnap([10.1, 0.1], ents, 0.3)).toMatchObject({ pt: [10, 0], kind: "center" });
    expect(findSnap([2.05, 1.05], ents, 0.3)).toMatchObject({ pt: [2, 1], kind: "midpoint" });
  });
});

describe("geometry", () => {
  it("measures length and area", () => {
    expect(length(line("x", [0, 0], [3, 4]))).toBe(5);
    expect(area({ id: "p", layer: "0", kind: "pline", pts: [[0, 0], [4, 0], [4, 3], [0, 3]], closed: true })).toBe(12);
  });

  it("hit-tests near a line", () => {
    expect(hitTest(line("x", [0, 0], [4, 0]), [2, 0.05], 0.1)).toBe(true);
    expect(hitTest(line("x", [0, 0], [4, 0]), [2, 0.5], 0.1)).toBe(false);
  });

  it("moves, rotates, mirrors and scales", () => {
    const l = line("x", [1, 0], [2, 0]);
    expect(move(l, 1, 1)).toMatchObject({ a: [2, 1], b: [3, 1] });
    const r = rotate(l, [0, 0], Math.PI / 2) as Extract<Entity, { kind: "line" }>;
    expect(r.a[0]).toBeCloseTo(0, 9);
    expect(r.a[1]).toBeCloseTo(-1, 9); // 90° CCW in CAD (Y up) = -z on the plan
    expect(mirror(l, [0, -5], [0, 5])).toMatchObject({ a: [-1, 0], b: [-2, 0] });
    expect(scale(l, [0, 0], 2)).toMatchObject({ a: [2, 0], b: [4, 0] });
  });

  it("offsets a line toward the picked side", () => {
    const o = offset(line("x", [0, 0], [4, 0]), 0.5, [2, 3]) as Extract<Entity, { kind: "line" }>;
    expect(o.a).toEqual([0, 0.5]);
    expect(o.b).toEqual([4, 0.5]);
  });

  it("selects by window (fully inside) and crossing (touching)", () => {
    const ents = [line("in", [1, 1], [2, 1]), line("cross", [1, 2], [5, 2])];
    expect(selectInRect(ents, [0, 0], [3, 3], false)).toEqual(["in"]);
    expect(selectInRect(ents, [0, 0], [3, 3], true).sort()).toEqual(["cross", "in"]);
  });
});

describe("commands", () => {
  const ctx = (over: Partial<CadCtx> = {}): CadCtx => ({
    entities: [],
    selection: [],
    layer: "0",
    wall: { t: 0.15, mat: "chb150" },
    textHeight: 0.25,
    ...over,
  });
  const go = (state: CadState, input: { point?: [number, number]; text?: string; enter?: boolean }, c = ctx()) =>
    run(state, input, c);

  it("LINE draws connected segments and C closes", () => {
    let s = go(initial(), { text: "L" }).state;
    const out: Entity[] = [];
    for (const p of [
      [0, 0],
      [4, 0],
      [4, -3],
    ] as [number, number][]) {
      const r = go(s, { point: p });
      s = r.state;
      out.push(...(r.add ?? []));
    }
    const r = go(s, { text: "C" });
    out.push(...(r.add ?? []));
    expect(out.map((e) => e.kind)).toEqual(["line", "line", "line"]);
    expect(r.state.cmd).toBeNull();
    expect((out[2] as Extract<Entity, { kind: "line" }>).b).toEqual([0, 0]);
  });

  it("LINE accepts typed coordinates", () => {
    let s = go(initial(), { text: "LINE" }).state;
    s = go(s, { text: "0,0" }).state;
    const r = go(s, { text: "@3<0" });
    expect(r.add![0]).toMatchObject({ kind: "line", a: [0, 0], b: [3, 0] });
  });

  it("RECTANG makes a closed polyline", () => {
    let s = go(initial(), { text: "REC" }).state;
    s = go(s, { point: [0, 0] }).state;
    const r = go(s, { point: [2, 1] });
    expect(r.add![0]).toMatchObject({ kind: "pline", closed: true });
    expect(area(r.add![0])).toBe(2);
  });

  it("CIRCLE takes a typed radius", () => {
    let s = go(initial(), { text: "C" }).state;
    s = go(s, { point: [1, 1] }).state;
    expect(go(s, { text: "0.5" }).add![0]).toMatchObject({ kind: "circle", c: [1, 1], r: 0.5 });
  });

  it("WALL draws thick wall segments with the current wall system", () => {
    let s = go(initial(), { text: "W" }).state;
    s = go(s, { point: [0, 0] }).state;
    expect(go(s, { point: [5, 0] }).add![0]).toMatchObject({ kind: "wall", a: [0, 0], b: [5, 0], t: 0.15, mat: "chb150" });
  });

  it("MOVE uses the selection, a base point and a typed displacement", () => {
    const c = ctx({ entities: [line("x", [0, 0], [1, 0])], selection: ["x"] });
    let s = go(initial(), { text: "M" }, c).state;
    s = go(s, { point: [0, 0] }, c).state;
    const r = go(s, { text: "@2,0" }, c);
    expect(r.replace![0]).toMatchObject({ a: [2, 0], b: [3, 0] });
  });

  it("ROTATE takes an angle in degrees", () => {
    const c = ctx({ entities: [line("x", [1, 0], [2, 0])], selection: ["x"] });
    let s = go(initial(), { text: "RO" }, c).state;
    s = go(s, { point: [0, 0] }, c).state;
    const r = go(s, { text: "180" }, c);
    const e = r.replace![0] as Extract<Entity, { kind: "line" }>;
    expect(e.a[0]).toBeCloseTo(-1, 9);
  });

  it("OFFSET copies a line at a distance on the picked side", () => {
    const c = ctx({ entities: [line("x", [0, 0], [4, 0])] });
    let s = go(initial(), { text: "O" }, c).state;
    s = go(s, { text: "1" }, c).state;
    s = go(s, { point: [2, 0.02] }, c).state;
    const r = go(s, { point: [2, -3] }, c);
    expect(r.add![0]).toMatchObject({ kind: "line", a: [0, -1], b: [4, -1] });
  });

  it("DIST reports distance and angle", () => {
    let s = go(initial(), { text: "DI" }).state;
    s = go(s, { point: [0, 0] }).state;
    expect(go(s, { point: [3, -4] }).message).toBe("Distance = 5.000 m, Angle = 53.1°, ΔX = 3.000, ΔY = 4.000");
  });

  it("ERASE removes the selection", () => {
    const c = ctx({ entities: [line("x", [0, 0], [1, 0])], selection: ["x"] });
    expect(go(initial(), { text: "E" }, c).remove).toEqual(["x"]);
  });

  it("unknown commands are reported", () => {
    expect(go(initial(), { text: "FLY" }).message).toBe('Unknown command "FLY". Type HELP for the list.');
  });
});
