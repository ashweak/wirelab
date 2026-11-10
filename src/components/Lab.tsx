"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { computeSchedule } from "@/engine/engine";
import { RULES } from "@/engine/rules";
import { PANEL_POSITION, ROOMS } from "@/data/goldenHouse";
import { DEMO_APPLIANCES, SCENARIOS } from "@/data/scenarios";
import { colorFor } from "./colors";
import { ChecksView, H2, ScheduleTable } from "./ScheduleView";
import Editor from "./Editor";
import { sceneCircuits } from "./sceneData";
import { ViewToggle } from "./ViewToggle";
import type { ViewMode } from "./HouseScene";

const HouseScene = dynamic(() => import("./HouseScene"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center font-mono text-xs text-slate-500">Loading 3D house…</div>
  ),
});

const DEMO_CIRCUIT = "C3";

function Demo() {
  const [scenarioId, setScenarioId] = useState("golden");
  const [focus, setFocus] = useState<string | null>(null);
  const [plugged, setPlugged] = useState<Set<string>>(new Set());
  const [tripped, setTripped] = useState(false);
  const [view, setView] = useState<ViewMode>("real");

  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;
  const project = useMemo(() => scenario.build(), [scenario]);
  const schedule = useMemo(() => computeSchedule(project), [project]);
  const faulty = useMemo(() => new Set(schedule.checks.map((c) => c.targetId)), [schedule]);
  const circuits = useMemo(() => sceneCircuits(PANEL_POSITION, project.circuits, [...ROOMS]), [project]);

  const demoBreaker = schedule.circuits.find((c) => c.id === DEMO_CIRCUIT)!.breakerA;
  const ampsOf = (set: Set<string>) =>
    DEMO_APPLIANCES.filter((a) => set.has(a.id)).reduce((s, a) => s + a.watts, 0) / RULES.voltage;
  const demoAmps = ampsOf(plugged);
  const overload = demoAmps > demoBreaker;

  const toggle = (id: string) => {
    if (tripped) return;
    const next = new Set(plugged);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPlugged(next);
    if (ampsOf(next) > demoBreaker) setTripped(true);
  };
  const reset = () => {
    setPlugged(new Set());
    setTripped(false);
  };

  return (
    <main className="grid flex-1 lg:grid-cols-[1fr_460px]">
      <section className="relative h-[55vh] border-b border-slate-800 lg:h-auto lg:border-b-0 lg:border-r">
        <HouseScene
          rooms={[...ROOMS]}
          panel={{ id: "panel", position: PANEL_POSITION, facing: Math.PI / 2 }}
          circuits={circuits}
          faulty={faulty}
          tripped={tripped ? new Set([DEMO_CIRCUIT]) : new Set()}
          focus={focus}
          view={view}
        />
        <ViewToggle view={view} setView={setView} />
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
          Drag to orbit · scroll to zoom · right-drag to pan · orange = PVC conduit
        </p>
      </section>

      <aside className="flex flex-col gap-5 overflow-y-auto p-5 lg:max-h-[calc(100vh-118px)]">
        <div>
          <H2>Scenario</H2>
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

        <ChecksView schedule={schedule} />
        <ScheduleTable schedule={schedule} feederRunM={project.feederRunM} onFocus={setFocus} />

        <div>
          <H2>Demo mode · plug loads into C3</H2>
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
                <p className="text-sm font-semibold text-red-300">⚡ C3 breaker tripped — bedroom outlets are dead.</p>
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
      </aside>
    </main>
  );
}

export default function Lab() {
  const [tab, setTab] = useState<"demo" | "editor">("demo");

  return (
    <div className="flex min-h-screen flex-col bg-[#08111b] text-slate-200">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-tight text-white">
            WireLab <span className="text-amber-400">PH</span>
          </h1>
          <p className="text-xs text-slate-400">
            3D residential wiring lab with Philippine Electrical Code checks
          </p>
        </div>
        <p className="max-w-md text-right text-[11px] leading-snug text-amber-300/80">
          Draft rules ({RULES.version}). A design aid only — values must be confirmed by a licensed PEE.
        </p>
      </header>

      <nav className="flex items-center gap-1 border-b border-slate-800 px-5" role="tablist">
        {(
          [
            ["demo", "Golden house demo"],
            ["editor", "Design your own"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm transition ${
              tab === id ? "border-amber-400 text-white" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
        <a
          href="https://github.com/ashweak/wirelab"
          className="ml-auto py-2.5 text-xs text-slate-500 hover:text-slate-300"
        >
          Source on GitHub ↗
        </a>
      </nav>

      {tab === "demo" ? <Demo /> : <Editor />}
    </div>
  );
}
