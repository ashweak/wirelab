import type { Project } from "@/engine/types";
import { goldenHouse } from "./goldenHouse";

export interface Scenario {
  id: string;
  label: string;
  note: string;
  build: () => Project;
}

const secondAircon = (p: Project) => {
  p.circuits[2].parts.push({
    id: "AC-bed2",
    type: "aircon_outlet",
    room: "bed2",
    va: 1800,
    motor: true,
    position: [5.25, 2.1, 7.9],
  });
  return p;
};

export const SCENARIOS: Scenario[] = [
  {
    id: "golden",
    label: "Golden house",
    note: "The reference design. Every check passes.",
    build: goldenHouse,
  },
  {
    id: "vd-fail",
    label: "Fail: long heater run",
    note: "C5 water heater moved to a 45 m run on 3.5 mm².",
    build: () => {
      const p = goldenHouse();
      p.circuits[4].runM = 45;
      return p;
    },
  },
  {
    id: "vd-fixed",
    label: "Fix: upsize to 5.5 mm²",
    note: "Same 45 m run, wire upsized as the engine suggests.",
    build: () => {
      const p = goldenHouse();
      p.circuits[4].runM = 45;
      p.circuits[4].wireMm2 = 5.5;
      return p;
    },
  },
  {
    id: "ac-fail",
    label: "Fail: aircon on outlets",
    note: "A second 1.5 HP aircon plugged into bedroom outlet circuit C3.",
    build: () => secondAircon(goldenHouse()),
  },
  {
    id: "ac-fixed",
    label: "Fix: dedicated circuit",
    note: "The second aircon moved to its own circuit C6.",
    build: () => {
      const p = secondAircon(goldenHouse());
      const ac = p.circuits[2].parts.pop()!;
      p.circuits.push({ id: "C6", name: "C6 Aircon 2", kind: "appliance", runM: 18, parts: [ac] });
      return p;
    },
  },
  {
    id: "wire-fail",
    label: "Fail: thin outlet wire",
    note: "C2 outlets wired with 2.0 mm² behind a 20 A breaker.",
    build: () => {
      const p = goldenHouse();
      p.circuits[1].wireMm2 = 2.0;
      return p;
    },
  },
];

/** Plug-in appliances for the breaker-trip demo, watts at 230 V. */
export const DEMO_APPLIANCES = [
  { id: "kettle", name: "Electric kettle", watts: 1500 },
  { id: "iron", name: "Flat iron", watts: 1000 },
  { id: "dryer", name: "Hair dryer", watts: 1200 },
  { id: "heater", name: "Space heater", watts: 1500 },
  { id: "laptop", name: "Laptop + monitor", watts: 150 },
  { id: "fan", name: "Stand fan", watts: 60 },
];
