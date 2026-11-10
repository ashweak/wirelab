export type CircuitKind = "lighting" | "outlet" | "appliance";

export type PartType =
  | "lighting_outlet"
  | "convenience_outlet"
  | "aircon_outlet"
  | "appliance_outlet"
  | "switch";

export interface Part {
  id: string;
  type: PartType;
  room: string;
  /** Overrides the default VA (required for aircon/appliance outlets). */
  va?: number;
  /** True for motor loads such as aircon. */
  motor?: boolean;
  /** Position in the house, metres (x, y = height, z). */
  position?: [number, number, number];
}

export interface Circuit {
  id: string;
  name: string;
  kind: CircuitKind;
  parts: Part[];
  /** One-way length from panel to farthest part, metres. */
  runM: number;
  /**
   * Optional daisy-chain segments, panel first. When present, voltage drop is
   * summed per segment using only the load downstream of it, and runM = total length.
   */
  segments?: { lengthM: number; downstreamVA: number }[];
  /** Optional overrides; the engine sizes them when absent. */
  breakerA?: number;
  wireMm2?: number;
}

export interface Project {
  name: string;
  feederRunM: number;
  circuits: Circuit[];
}

export type Severity = "error" | "warning";

export interface CheckResult {
  code: string;
  severity: Severity;
  targetId: string;
  message: string;
  fix: string;
}

export interface CircuitResult {
  id: string;
  name: string;
  kind: CircuitKind;
  loadVA: number;
  currentA: number;
  requiredBreakerA: number;
  breakerA: number;
  requiredWireMm2: number;
  wireMm2: number;
  runM: number;
  dropV: number;
  dropPct: number;
}

export interface MainResult {
  loadVA: number;
  currentA: number;
  breakerA: number;
  feederMm2: number;
  dropPct: number;
}

export interface Schedule {
  circuits: CircuitResult[];
  main: MainResult;
  checks: CheckResult[];
}
