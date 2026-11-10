# WireLab PH — Build Spec

The MVP is done when WireLab reproduces the golden house below exactly. Every value is enforced by tests in `src/engine/engine.test.ts`; a phase is done when its tests pass.

> **Draft rules.** All PEC values live in `src/engine/rules.ts` and must be confirmed by a licensed PEE before release. WireLab is a design aid; a PEE signs the plan.

## Scope (MVP)

One-storey residential, single-phase 230 V, one panelboard, up to ~15 branch circuits. Out of scope: three-phase, multi-storey, commercial, short-circuit studies.

## Definition of done

- [x] Draw the golden house's 6 rooms and place all 31 parts (30 outlets + panel) in under 10 minutes
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
6. Main = all circuit loads + 25% of the largest motor; main breaker = next standard ≥ main current, and never below the largest branch breaker.
7. Every aircon needs its own appliance circuit.

## Editor rules (step 3)

- Rooms snap to a 0.5 m grid, are at least 1 m × 1 m, and may share walls but not overlap.
- Parts go inside a room. Lights mount on the ceiling; outlets, aircon, water heater and panel snap to the nearest wall at 0.3 m (1.1 m in kitchens), 2.1 m, 1.8 m and 1.5 m.
- One panelboard per house; placing another moves it.
- Auto-circuits: lights up to 12 per circuit, outlets up to 8, every aircon or water heater on its own circuit.
- Run length = panel → up to ceiling → across → down to the farthest part, rounded up to 0.5 m.
- Acceptance: rebuilding the golden house in the editor gives the same loads, breakers, wires and main as the spec, with no warnings.

## Wiring rules (step 4)

- Each circuit leaves the panel once and daisy-chains device to device (nearest next device), unless the user sets the order with the Wire tool.
- Devices on the same wall connect through the wall; otherwise the conduit goes up to the ceiling, across (x, then z) and down. A junction box sits at each ceiling drop.
- Voltage drop = Σ 2 · I_downstream · L_segment · R per segment (only the load still flowing past that segment).
- Switches mount at 1.4 m, ride on the lighting circuit of their room, and a room with lights but no switch raises a `NO-SWITCH` design warning.
- Materials: line + neutral at circuit wire size, ground 2.0 mm² up to 20 A (3.5 mm² up to 60 A); wire = run + 0.3 m per device; conduit in 3 m lengths; utility boxes per wall device; octagonal boxes per light and per ceiling drop.

## Editing rules (Tinkercad-style)

- Moving a room carries its parts; moves and resizes snap to the chosen grid (0.1–1 m) and are refused if rooms would overlap.
- Resizing keeps every wall part on its own wall and clamps parts inside the new outline.
- Rotate turns a room 90° clockwise about its centre; parts follow to the matching wall.
- Moving a part into another room re-snaps it to that room's nearest wall and keeps any custom mounting height.
- Mounting-height ranges: outlet 0.2–1.5 m, switch 1.0–1.6 m, aircon 1.8–2.5 m, water heater 1.5–2.2 m, panel 1.2–1.8 m.
- Duplicating a part offsets it 0.5 m along its wall; duplicating a room copies its parts into the first free spot beside it.

## Interior rules

- Furniture stays inside its room; dropping, moving, rotating or resizing pushes it back inside the walls.
- Each piece has width, depth and height limits (e.g. double bed 1.2–2.0 m wide); values outside are refused.
- Rooms carry their furniture when moved, rotated (position and facing), duplicated or deleted.
- Ceiling height is 2.4–3.6 m. Lights follow the ceiling, and every ceiling-routed wire run grows by the height change on the way up and on the way down.

## Build order (worked backward)

1. **PEC engine + tests** — done when `npm test` is green. ✅
2. **Live demo** — golden house in 3D, load schedule, must-fail toggles, breaker-trip demo. ✅
3. **Editor** — draw rooms on a grid, place parts with snapping. ✅ (tests: `src/editor/editor.test.ts`)
4. **Wiring** — daisy-chained circuits, hand-drawn wiring order, per-segment voltage drop, switches, materials. ✅ (tests: `src/editor/wiring.test.ts`)
5. **Tinkercad-style editing** — shape library with drag-and-drop, select/move/resize/rotate/duplicate, properties panel, shortcuts, redo, snap setting, view presets. ✅ (tests: `src/editor/transform.test.ts`)
6. **Interior + render** — furniture (14 pieces, sized within limits, recoloured, rotated), floor finish and wall paint per room, custom room size, ceiling height 2.4–3.6 m (lengthens ceiling-routed wire), render mode with shadows, day/night lighting, cutaway walls and PNG export. ✅ (tests: `src/editor/interior.test.ts`)
7. **Outputs** — PDF load schedule, single-line diagram, BOM with PHP prices.

Each step is one instruction: "make the tests for step N pass, following SPEC.md".
