import { RULES, type Rules } from "./rules";
import type {
  CheckResult,
  Circuit,
  CircuitResult,
  Part,
  Project,
  Schedule,
} from "./types";

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export function partVA(part: Part, rules: Rules = RULES): number {
  if (part.va !== undefined) return part.va;
  if (part.type === "lighting_outlet") return rules.defaultVA.lighting_outlet;
  if (part.type === "convenience_outlet") return rules.defaultVA.convenience_outlet;
  throw new Error(`Part ${part.id} (${part.type}) needs a nameplate VA`);
}

/** Smallest standard breaker >= amps, never below the minimum. */
export function nextBreaker(amps: number, min: number, rules: Rules = RULES): number {
  const b = rules.standardBreakers.find((r) => r >= amps && r >= min);
  if (b === undefined) throw new Error(`No standard breaker for ${amps} A`);
  return b;
}

/** Smallest wire allowed behind the breaker, never below the minimum. */
export function wireFor(breakerA: number, minMm2: number, rules: Rules = RULES): number {
  const w = rules.wires.find((x) => x.maxBreaker >= breakerA && x.mm2 >= minMm2);
  if (w === undefined) throw new Error(`No wire for a ${breakerA} A breaker`);
  return w.mm2;
}

export function wireData(mm2: number, rules: Rules = RULES) {
  const w = rules.wires.find((x) => x.mm2 === mm2);
  if (w === undefined) throw new Error(`Unknown wire size ${mm2} mm²`);
  return w;
}

/** Two-wire single-phase voltage drop: VD = 2·I·L·R. */
export function voltageDrop(currentA: number, runM: number, mm2: number, rules: Rules = RULES) {
  const dropV = 2 * currentA * runM * wireData(mm2, rules).ohmPerM;
  return { dropV, dropPct: (dropV / rules.voltage) * 100 };
}

export function computeCircuit(c: Circuit, rules: Rules = RULES): CircuitResult {
  const min = rules.minimums[c.kind];
  const loadVA = c.parts.reduce((s, p) => s + partVA(p, rules), 0);
  const currentA = loadVA / rules.voltage;
  const requiredBreakerA = nextBreaker(currentA * rules.branchBreakerFactor, min.breaker, rules);
  const breakerA = c.breakerA ?? requiredBreakerA;
  const requiredWireMm2 = wireFor(breakerA, min.wire, rules);
  const wireMm2 = c.wireMm2 ?? requiredWireMm2;
  const { dropV, dropPct } = voltageDrop(currentA, c.runM, wireMm2, rules);
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    loadVA,
    currentA: round(currentA),
    requiredBreakerA,
    breakerA,
    requiredWireMm2,
    wireMm2,
    runM: c.runM,
    dropV: round(dropV, 2),
    dropPct: round(dropPct),
  };
}

function checkCircuit(c: Circuit, r: CircuitResult, rules: Rules): CheckResult[] {
  const out: CheckResult[] = [];
  const min = rules.minimums[c.kind];

  if (r.breakerA < r.requiredBreakerA) {
    out.push({
      code: "OVERLOAD",
      severity: "error",
      targetId: c.id,
      message: `${c.name}: ${r.loadVA} VA needs a ${r.requiredBreakerA} A breaker, has ${r.breakerA} A`,
      fix: `Use a ${r.requiredBreakerA} A breaker or split the circuit`,
    });
  }

  const allowed = wireData(r.wireMm2, rules).maxBreaker;
  if (r.wireMm2 < min.wire || allowed < r.breakerA) {
    const need = wireFor(r.breakerA, min.wire, rules);
    out.push({
      code: "WIRE-UNDERSIZED",
      severity: "error",
      targetId: c.id,
      message: `${c.name}: ${r.wireMm2} mm² is too small for a ${r.breakerA} A ${c.kind} circuit`,
      fix: `Use ${need} mm²`,
    });
  }

  if (r.dropPct > rules.maxBranchDropPct) {
    const better = rules.wires.find(
      (w) =>
        w.mm2 > r.wireMm2 &&
        voltageDrop(r.loadVA / rules.voltage, r.runM, w.mm2, rules).dropPct <=
          rules.maxBranchDropPct,
    );
    out.push({
      code: "VD-BRANCH-3",
      severity: "error",
      targetId: c.id,
      message: `${c.name}: voltage drop ${r.dropPct}% is over the ${rules.maxBranchDropPct}% limit`,
      fix: better ? `Upsize ${c.name} to ${better.mm2} mm²` : "Shorten the run or split the circuit",
    });
  }

  const motors = c.parts.filter((p) => p.motor);
  if (motors.length > 0 && (c.parts.length > 1 || c.kind !== "appliance")) {
    out.push({
      code: "DEDICATED-CIRCUIT",
      severity: "error",
      targetId: c.id,
      message: `${c.name}: aircon shares the circuit with other loads`,
      fix: "Give each aircon its own appliance circuit",
    });
  }

  return out;
}

export function computeSchedule(project: Project, rules: Rules = RULES): Schedule {
  const circuits = project.circuits.map((c) => computeCircuit(c, rules));
  const checks = project.circuits.flatMap((c, i) => checkCircuit(c, circuits[i], rules));

  const motorVAs = project.circuits.flatMap((c) =>
    c.parts.filter((p) => p.motor).map((p) => partVA(p, rules)),
  );
  const largestMotor = motorVAs.length ? Math.max(...motorVAs) : 0;
  const loadVA =
    circuits.reduce((s, c) => s + c.loadVA, 0) + largestMotor * rules.largestMotorExtra;
  const currentA = loadVA / rules.voltage;
  // The main must be at least as large as the largest branch breaker it feeds.
  const largestBranch = Math.max(rules.minimums.feeder.breaker, ...circuits.map((c) => c.breakerA));
  const breakerA = nextBreaker(currentA, largestBranch, rules);
  const feederMm2 = wireFor(breakerA, rules.minimums.feeder.wire, rules);
  const { dropPct } = voltageDrop(currentA, project.feederRunM, feederMm2, rules);

  circuits.forEach((c) => {
    const total = c.dropPct + dropPct;
    if (total > rules.maxTotalDropPct) {
      checks.push({
        code: "VD-TOTAL-5",
        severity: "error",
        targetId: c.id,
        message: `${c.name}: feeder + branch drop ${round(total)}% is over ${rules.maxTotalDropPct}%`,
        fix: "Upsize the feeder or the branch wire",
      });
    }
  });

  return {
    circuits,
    main: {
      loadVA: round(loadVA, 0),
      currentA: round(currentA),
      breakerA,
      feederMm2,
      dropPct: round(dropPct),
    },
    checks,
  };
}
