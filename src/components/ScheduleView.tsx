"use client";

import { RULES } from "@/engine/rules";
import type { Schedule } from "@/engine/types";
import { colorFor } from "./colors";

export const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">{children}</h2>
);

export function ChecksView({ schedule }: { schedule: Schedule }) {
  return (
    <div>
      <H2>PEC checks</H2>
      {schedule.checks.length === 0 ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          ✓ All checks pass
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {schedule.checks.map((c, i) => (
            <li key={i} className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
              <span className="font-mono text-xs font-bold text-red-300">{c.code}</span>
              <p className="text-slate-200">{c.message}</p>
              <p className="text-xs text-amber-300">Fix: {c.fix}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ScheduleTable({
  schedule,
  feederRunM,
  onFocus,
}: {
  schedule: Schedule;
  feederRunM: number;
  onFocus: (id: string | null) => void;
}) {
  const faulty = new Set(schedule.checks.map((c) => c.targetId));
  return (
    <div>
      <H2>Load schedule</H2>
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
                onMouseEnter={() => onFocus(c.id)}
                onMouseLeave={() => onFocus(null)}
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
              <td className="px-2 py-1.5 text-right">{feederRunM}</td>
              <td className="px-2 py-1.5 text-right">{schedule.main.dropPct.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">
        Hover a row to isolate its circuit in 3D. Main includes 25% of the largest motor load.
      </p>
    </div>
  );
}
