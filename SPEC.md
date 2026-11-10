# WireLab PH — Build Spec

The MVP is done when WireLab reproduces the golden house below exactly. Every value is enforced by tests in `src/engine/engine.test.ts`; a phase is done when its tests pass.

> **Draft rules.** All PEC values live in `src/engine/rules.ts` and must be confirmed by a licensed PEE before release. WireLab is a design aid; a PEE signs the plan.

## Scope (MVP)

One-storey residential, single-phase 230 V, one panelboard, up to ~15 branch circuits. Out of scope: three-phase, multi-storey, commercial, short-circuit studies.

## Definition of done

- [ ] Draw the golden house's 6 rooms and place all 31 parts (30 outlets + panel) in under 10 minutes
- [x] Every part sits on exactly one of 5 circuits back to one panel
- [x] Load schedule matches the table below to the nearest 1 VA and 0.1 A
- [x] All must-fail cases raise the named warning, and the suggested fix clears it
- [x] Demo mode: plugging loads into C3 past 20 A trips its breaker on screen
- [ ] Export gives a PDF load schedule, a single-line diagram and a BOM in PHP

## Golden test house

3-bedroom bungalow, 80 m² (10 m × 8 m), 230 V single-phase.

| Circuit | Parts | Load (VA) | Current (A) | Breaker (A) | Wire (mm²) | Run (m) | Voltage drop |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 Lighting | 12 lighting outlets × 100 VA | 1,200 | 5.2 | 15 | 2.0 | 25 | 1.0% |
| C2 Outlets, living + kitchen | 8 outlets × 180 VA | 1,440 | 6.3 | 20 | 3.5 | 18 | 0.5% |
| C3 Outlets, bedrooms | 8 outlets × 180 VA | 1,440 | 6.3 | 20 | 3.5 | 22 | 0.6% |
| C4 Aircon 1.5 HP | 1 outlet, 1,800 VA | 1,800 | 7.8 | 20 | 3.5 | 15 | 0.5% |
| C5 Water heater | 1 outlet, 3,500 VA | 3,500 | 15.2 | 20 | 3.5 | 20 | 1.4% |
| Main | 5 circuits + 25% of largest motor | 9,830 | 42.7 | 50 | 8.0 feeder | 10 | — |

## Must-fail cases

| Change | Expected warning | Fix that clears it |
| --- | --- | --- |
| C5 run to 45 m | `VD-BRANCH-3` (3.1% > 3%) | Upsize C5 to 5.5 mm² (2.0%) |
| Second 1.5 HP aircon on C3 | `DEDICATED-CIRCUIT` | Give the aircon its own circuit |
| C2 wire set to 2.0 mm² | `WIRE-UNDERSIZED` | Use 3.5 mm² |
| C5 breaker set to 15 A | `OVERLOAD` | Use the required 20 A |

## Engine rules (draft)

1. Circuit load = sum of part VA (100 VA per lighting outlet, 180 VA per convenience outlet, nameplate for appliances).
2. Current I = VA / 230.
3. Branch breaker = smallest standard rating ≥ 1.25 × I, minimum 15 A lighting / 20 A outlets and appliances.
4. Wire = smallest conductor allowed behind the breaker; minimum 2.0 mm² lighting, 3.5 mm² outlets and appliances.
5. Voltage drop %VD = 2·I·L·R / 230 × 100; ≤ 3% branch, ≤ 5% feeder + branch.
6. Main = all circuit loads + 25% of the largest motor; main breaker = next standard ≥ main current.
7. Every aircon needs its own appliance circuit.

## Build order (worked backward)

1. **PEC engine + tests** — done when `npm test` is green. ✅
2. **Live demo** — golden house in 3D, load schedule, must-fail toggles, breaker-trip demo. ✅
3. **Editor** — draw rooms on a grid, place parts with snapping.
4. **Wiring** — draw wire paths in 3D; run length measured from the path.
5. **Outputs** — PDF load schedule, single-line diagram, BOM with PHP prices.

Each step is one instruction: "make the tests for step N pass, following SPEC.md".
