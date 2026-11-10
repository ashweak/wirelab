/**
 * Draft PEC 2017 rule set (residential, single-phase).
 * DRAFT — every value here must be confirmed by a licensed PEE before release.
 * Kept as data so values can be corrected without touching engine code.
 */
export const RULES = {
  version: "draft-2026.11",
  voltage: 230,
  /** Standard breaker ratings, amperes. */
  standardBreakers: [15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 125, 150],
  /** Branch breaker must be >= this factor x load current (continuous load). */
  branchBreakerFactor: 1.25,
  /** Extra load added at the main: this share of the largest motor load. */
  largestMotorExtra: 0.25,
  /** Voltage drop limits, percent. */
  maxBranchDropPct: 3,
  maxTotalDropPct: 5,
  /** Default VA per part type. */
  defaultVA: {
    lighting_outlet: 100,
    convenience_outlet: 180,
  },
  /** Minimum breaker (A) and wire (mm²) by circuit kind. */
  minimums: {
    lighting: { breaker: 15, wire: 2.0 },
    outlet: { breaker: 20, wire: 3.5 },
    appliance: { breaker: 20, wire: 3.5 },
    feeder: { breaker: 15, wire: 2.0 },
  },
  /**
   * Copper THHN conductors: size (mm²), largest breaker it may sit behind (A),
   * resistance (ohm per metre). Approximate values — PEE to confirm.
   */
  wires: [
    { mm2: 2.0, maxBreaker: 15, ohmPerM: 0.0089 },
    { mm2: 3.5, maxBreaker: 20, ohmPerM: 0.00524 },
    { mm2: 5.5, maxBreaker: 30, ohmPerM: 0.00334 },
    { mm2: 8.0, maxBreaker: 50, ohmPerM: 0.0023 },
    { mm2: 14, maxBreaker: 70, ohmPerM: 0.00131 },
    { mm2: 22, maxBreaker: 90, ohmPerM: 0.00084 },
    { mm2: 30, maxBreaker: 110, ohmPerM: 0.00062 },
  ],
} as const;

export type Rules = typeof RULES;
