import { describe, expect, it } from "vitest";
import { PAPERS, PX_PER_MM, layoutSheet, pageSize } from "./paper";

const house = { minX: 0, maxX: 10, minZ: 0, maxZ: 8 };
const A = (id: string) => PAPERS.find((p) => p.id === id)!;

describe("paper", () => {
  it("swaps sides for orientation", () => {
    expect(pageSize(A("A4"), "landscape")).toEqual({ w: 297, h: 210 });
    expect(pageSize(A("A4"), "portrait")).toEqual({ w: 210, h: 297 });
  });
  it("picks the largest standard scale that fits", () => {
    const a3 = layoutSheet(pageSize(A("A3"), "landscape"), house, { scale: "fit", legend: false });
    expect(a3.scale).toBe(50);
    const a4 = layoutSheet(pageSize(A("A4"), "landscape"), house, { scale: "fit", legend: false });
    expect(a4.scale).toBe(75);
    expect(a4.fits).toBe(true);
  });
  it("keeps true scale: 1 m at 1:100 is 10 mm of paper", () => {
    const l = layoutSheet(pageSize(A("A4"), "landscape"), house, { scale: 100, legend: false });
    expect(l.k / PX_PER_MM).toBeCloseTo(10);
  });
  it("flags a fixed scale that is too large", () => {
    const l = layoutSheet(pageSize(A("A4"), "portrait"), house, { scale: 20, legend: false });
    expect(l.fits).toBe(false);
  });
  it("centres the drawing", () => {
    const l = layoutSheet({ w: 400, h: 300 }, house, { scale: 100, legend: false });
    const midX = l.ox + 5 * l.k;
    expect(midX).toBeCloseTo(40 + (l.w - 90) / 2);
  });
  it("lists the common sheet families", () => {
    for (const id of ["A4", "A3", "A2", "A1", "A0", "LETTER", "LEGAL", "LONG", "TABLOID", "ARCH_D", "ANSI_D"]) expect(A(id)).toBeTruthy();
  });
});
