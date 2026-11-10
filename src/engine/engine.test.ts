import { describe, expect, it } from "vitest";
import { goldenHouse } from "@/data/goldenHouse";
import { computeSchedule } from "./engine";

// Expected values come from SPEC.md "Golden test house" (draft rules, PEE to confirm).
const GOLDEN = [
  { id: "C1", loadVA: 1200, currentA: 5.2, breakerA: 15, wireMm2: 2.0, dropPct: 1.0 },
  { id: "C2", loadVA: 1440, currentA: 6.3, breakerA: 20, wireMm2: 3.5, dropPct: 0.5 },
  { id: "C3", loadVA: 1440, currentA: 6.3, breakerA: 20, wireMm2: 3.5, dropPct: 0.6 },
  { id: "C4", loadVA: 1800, currentA: 7.8, breakerA: 20, wireMm2: 3.5, dropPct: 0.5 },
  { id: "C5", loadVA: 3500, currentA: 15.2, breakerA: 20, wireMm2: 3.5, dropPct: 1.4 },
];

describe("golden house", () => {
  const s = computeSchedule(goldenHouse());

  it("has 30 parts on 5 circuits", () => {
    expect(s.circuits).toHaveLength(5);
    expect(goldenHouse().circuits.flatMap((c) => c.parts)).toHaveLength(30);
  });

  it.each(GOLDEN)("$id matches the load schedule", (g) => {
    const c = s.circuits.find((x) => x.id === g.id)!;
    expect(c.loadVA).toBe(g.loadVA);
    expect(c.currentA).toBe(g.currentA);
    expect(c.breakerA).toBe(g.breakerA);
    expect(c.wireMm2).toBe(g.wireMm2);
    expect(c.dropPct).toBe(g.dropPct);
  });

  it("sizes the main and feeder", () => {
    expect(s.main.loadVA).toBe(9830);
    expect(s.main.currentA).toBe(42.7);
    expect(s.main.breakerA).toBe(50);
    expect(s.main.feederMm2).toBe(8.0);
  });

  it("raises no warnings", () => {
    expect(s.checks).toEqual([]);
  });
});

describe("must-fail cases", () => {
  it("C5 at 45 m breaks the 3% branch drop and 5.5 mm² fixes it", () => {
    const p = goldenHouse();
    p.circuits[4].runM = 45;
    const bad = computeSchedule(p);
    const w = bad.checks.find((c) => c.code === "VD-BRANCH-3")!;
    expect(w.targetId).toBe("C5");
    expect(bad.circuits[4].dropPct).toBe(3.1);
    expect(w.fix).toBe("Upsize C5 Water heater to 5.5 mm²");

    p.circuits[4].wireMm2 = 5.5;
    const fixed = computeSchedule(p);
    expect(fixed.circuits[4].dropPct).toBe(2.0);
    expect(fixed.checks).toEqual([]);
  });

  it("a second aircon on C3 needs a dedicated circuit", () => {
    const p = goldenHouse();
    p.circuits[2].parts.push({
      id: "AC-bed2",
      type: "aircon_outlet",
      room: "bed2",
      va: 1800,
      motor: true,
    });
    const bad = computeSchedule(p);
    expect(bad.checks.map((c) => c.code)).toContain("DEDICATED-CIRCUIT");

    const ac = p.circuits[2].parts.pop()!;
    p.circuits.push({ id: "C6", name: "C6 Aircon 2", kind: "appliance", runM: 18, parts: [ac] });
    expect(computeSchedule(p).checks).toEqual([]);
  });

  it("2.0 mm² on C2 is undersized and 3.5 mm² fixes it", () => {
    const p = goldenHouse();
    p.circuits[1].wireMm2 = 2.0;
    const bad = computeSchedule(p);
    const w = bad.checks.find((c) => c.code === "WIRE-UNDERSIZED")!;
    expect(w.targetId).toBe("C2");
    expect(w.fix).toBe("Use 3.5 mm²");

    p.circuits[1].wireMm2 = 3.5;
    expect(computeSchedule(p).checks).toEqual([]);
  });

  it("a breaker below the required size is an overload", () => {
    const p = goldenHouse();
    p.circuits[4].breakerA = 15;
    p.circuits[4].wireMm2 = 3.5;
    expect(computeSchedule(p).checks.map((c) => c.code)).toContain("OVERLOAD");
  });
});
