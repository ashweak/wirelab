"use client";

import type { ViewMode } from "./HouseScene";

export function ViewToggle({ view, setView }: { view: ViewMode; setView: (v: ViewMode) => void }) {
  return (
    <div className="absolute bottom-3 right-3 flex overflow-hidden rounded-md border border-slate-700 text-[11px]">
      {(
        [
          ["real", "Real colors"],
          ["circuit", "Circuit colors"],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          onClick={() => setView(v)}
          className={`px-2.5 py-1 ${view === v ? "bg-slate-200 text-slate-900" : "bg-slate-900/80 text-slate-300"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

