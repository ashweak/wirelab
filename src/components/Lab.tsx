"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { computeSchedule } from "@/engine/engine";
import { RULES } from "@/engine/rules";
import { DEMO_APPLIANCES, SCENARIOS } from "@/data/scenarios";
import { colorFor } from "./colors";

const HouseScene = dynamic(() => import("./HouseScene"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center font-mono text-xs text-slate-500">
      Loading 3D house…
    </div>
  ),
});

const DEMO_CIRCUIT = "C3";

export default function Lab() {
  const [scenarioId, setScenarioId] = useState("golden");
  const [focus, setFocus] = useState<string | null>(null);
  const [plugged, setPlugged] = useState<Set<string>>(new Set());
  const [tripped, setTripped] = useState(false);

  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;
  const project = useMemo(() => scenario.build(), [scenario]);
  const schedule = useMemo(() => computeSchedule(project), [project]);
  const faulty = useMemo(() => new Set(schedule.checks.map((c) => c.targetId)), [schedule]);

  const demoBreaker = schedule.circuits.find((c) => c.id === DEMO_CIRCUIT)!.breakerA;
  const demoWatts = DEMO_APPLIANCES.filter((a) => plugged.has(a.id)).reduce((s, a) => s + a.watts, 0);
  const demoAmps = demoWatts / RULES.voltage;
  const overload = demoAmps > demoBreaker;

  const toggle = (id: string) => {
    if (tripped) return;
    const next = new Set(plugged);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPlugged(next);
    const amps =
      DEMO_APPLIANCES.filter((a) => next.has(a.id)).reduce((s, a) => s + a.watts, 0) / RULES.voltage;
    if (amps > demoBreaker) setTripped(true);
  };

  const reset = () => {
    setPlugged(new Set());
    setTripped(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#08111b] text-slate-200">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-tight text-white">
            WireLab <span className="text-amber-400">PH</span>
          </h1>
          <p className="text-xs text-slate-400">
            3D residential wiring lab with Philippine Electrical Code checks — live demo
          </p>
        </div>
        <p className="max-w-md text-right text-[11px] leading-snug text-amber-300/80">
          Draft rules ({RULES.version}). A design aid only — values must be confirmed by a
          licensed PEE.
        </p>
      </header>

      <main className="grid flex-1 gap-0 lg:grid-cols-[1fr_460px]">
        <section className="relative h-[55vh] border-b border-slate-800 lg:h-auto lg:border-b-0 lg:border-r">
          <HouseScene
            project={project}
            faulty={faulty}
            tripped={tripped ? new Set([DEMO_CIRCUIT]) : new Set()}
            focus={focus}
          />
          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
            {schedule.circuits.map((c) => (
              <span
                key={c.id}
                className="rounded border border-slate-700 bg-slate-900/80 px-2 py-0.5 font-mono text-[10px]"
                style={{ color: faulty.has(c.id) ? "#ef4444" : colorFor(c.id) }}
              >
                ● {c.id}
              </span>
            ))}
          </div>
          <p className="pointer-events-none absolute bottom-3 left-3 font-mono text-[10px] text-slate-500">
            Drag to orbit · scroll to zoom · spheres = lights, cubes = outlets
          </p>
        </section>

        <aside className="flex flex-col gap-5 overflow-y-auto p-5 lg:max-h-[calc(100vh-73px)]">
          <div>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Scenario
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setScenarioId(s.id);
                    reset();
                  }}
                  className={`rounded-md border px-2.5 py-1 text-xs transition ${
                    s.id === scenarioId
                      ? "border-amber-400 bg-amber-400/10 text-amber-300"
                      : "border-slate-700 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">{scenario.note}</p>
          </div>

          <div>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              PEC checks
            </h2>
            {schedule.checks.length === 0 ? (
              <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                ✓ All checks pass
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {schedule.checks.map((c, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-xs font-bold text-red-300">{c.code}</span>
                    <p className="text-slate-200">{c.message}</p>
                    <p className="text-xs text-amber-300">Fix: {c.fix}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Load schedule
            </h2>
            <div className="overflow-x-auto rounded-md border border-slate-800">
              <table className="w-full font-mono text-[11px]">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Ckt</th>
                    <th className="px-2 py-1.5 text-right">VA</th>
                    <th className="px-2 py-1.5 text-right">A</th>
                    <th className="px-2 py-1.5 text-right">Brkr</th>
                    <th className="px-2 py-1.5 text-right">mm²</th>
                    <th className="px-2 py-1.5 text-right">m</th>
                    <th className="px-2 py-1.5 text-right">VD</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.circuits.map((c) => (
                    <tr
                      key={c.id}
                      onMouseEnter={() => setFocus(c.id)}
                      onMouseLeave={() => setFocus(null)}
                      className={`cursor-default border-t border-slate-800 hover:bg-slate-800/50 ${
                        faulty.has(c.id) ? "text-red-300" : ""
                      }`}
                      title={c.name}
                    >
                      <td className="px-2 py-1.5" style={{ color: colorFor(c.id) }}>
                        {c.id}
                      </td>
                      <td className="px-2 py-1.5 text-right">{c.loadVA.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-right">{c.currentA.toFixed(1)}</td>
                      <td className="px-2 py-1.5 text-right">{c.breakerA}</td>
                      <td className="px-2 py-1.5 text-right">{c.wireMm2.toFixed(1)}</td>
                      <td className="px-2 py-1.5 text-right">{c.runM}</td>
                      <td
                        className={`px-2 py-1.5 text-right ${
                          c.dropPct > RULES.maxBranchDropPct ? "font-bold text-red-400" : ""
                        }`}
                      >
                        {c.dropPct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-700 bg-slate-900 font-bold text-white">
                    <td className="px-2 py-1.5">Main</td>
                    <td className="px-2 py-1.5 text-right">{schedule.main.loadVA.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right">{schedule.main.currentA.toFixed(1)}</td>
                    <td className="px-2 py-1.5 text-right">{schedule.main.breakerA}</td>
                    <td className="px-2 py-1.5 text-right">{schedule.main.feederMm2.toFixed(1)}</td>
                    <td className="px-2 py-1.5 text-right">{project.feederRunM}</td>
                    <td className="px-2 py-1.5 text-right">{schedule.main.dropPct.toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Hover a row to isolate its circuit in 3D. Main includes 25% of the largest motor load.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Demo mode · plug loads into C3
            </h2>
            <div
              className={`rounded-md border px-3 py-3 ${
                tripped ? "border-red-500/60 bg-red-500/10" : "border-slate-800 bg-slate-900/60"
              }`}
            >
              <div className="mb-2 flex items-baseline justify-between font-mono">
                <span className="text-xs text-slate-400">Bedroom outlets current</span>
                <span className={`text-sm font-bold ${overload ? "text-red-400" : "text-emerald-300"}`}>
                  {demoAmps.toFixed(1)} A / {demoBreaker} A
                </span>
              </div>
              <div className="mb-3 h-2 overflow-hidden rounded bg-slate-800">
                <div
                  className={`h-full transition-all ${overload ? "bg-red-500" : "bg-emerald-400"}`}
                  style={{ width: `${Math.min(100, (demoAmps / demoBreaker) * 100)}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {DEMO_APPLIANCES.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => toggle(a.id)}
                    disabled={tripped}
                    className={`rounded border px-2 py-1 text-left text-xs transition disabled:opacity-50 ${
                      plugged.has(a.id)
                        ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200"
                        : "border-slate-700 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    {a.name} <span className="font-mono text-slate-500">{a.watts} W</span>
                  </button>
                ))}
              </div>
              {tripped && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-red-300">
                    ⚡ C3 breaker tripped — bedroom outlets are dead.
                  </p>
                  <button
                    onClick={reset}
                    className="rounded bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-900 hover:bg-white"
                  >
                    Unplug all &amp; reset
                  </button>
                </div>
              )}
            </div>
          </div>

          <footer className="mt-auto border-t border-slate-800 pt-3 text-[11px] text-slate-500">
            Built by Lance Agua ·{" "}
            <a className="underline hover:text-slate-300" href="https://github.com/ashweak/wirelab">
              Source on GitHub
            </a>{" "}
            · Next.js, TypeScript, React Three Fiber
          </footer>
        </aside>
      </main>
    </div>
  );
}
