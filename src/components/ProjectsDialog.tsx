"use client";

import { useState } from "react";
import type { ProjectMeta } from "@/store/projects";

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

export default function ProjectsDialog({
  list,
  current,
  onOpen,
  onNew,
  onRename,
  onDuplicate,
  onDelete,
  onImport,
  onClose,
}: {
  list: ProjectMeta[];
  current: string | null;
  onOpen: (id: string) => void;
  onNew: (template: "blank" | "golden") => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onImport: () => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const shown = list.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const b = "rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-500";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-label="Projects" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-lg border border-slate-700 bg-slate-950 p-4 text-slate-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Projects</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button onClick={() => onNew("blank")} className="rounded-md bg-amber-400 px-2.5 py-1 text-xs font-semibold text-slate-900 hover:bg-amber-300">
            ＋ New blank project
          </button>
          <button onClick={() => onNew("golden")} className={b}>
            ＋ From sample house
          </button>
          <button onClick={onImport} className={b}>
            ⤒ Open file…
          </button>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects…"
            className="ml-auto w-40 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
            aria-label="Search projects"
          />
        </div>
        <ul className="flex-1 divide-y divide-slate-800 overflow-y-auto rounded border border-slate-800">
          {shown.map((p) => (
            <li key={p.id} className={`flex items-center gap-3 px-3 py-2 ${p.id === current ? "bg-amber-400/5" : ""}`}>
              <div className="min-w-0 flex-1">
                {editing === p.id ? (
                  <input
                    autoFocus
                    defaultValue={p.name}
                    onBlur={(e) => {
                      onRename(p.id, e.target.value);
                      setEditing(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="w-full rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 text-sm"
                    aria-label="Project name"
                  />
                ) : (
                  <button onClick={() => onOpen(p.id)} className="block w-full truncate text-left text-sm hover:text-amber-300" title="Open">
                    {p.name}
                    {p.id === current && <span className="ml-2 text-[10px] text-amber-300">open</span>}
                  </button>
                )}
                <p className="font-mono text-[10px] text-slate-500">
                  {p.rooms} rooms · {p.parts} parts · edited {ago(p.updatedAt)}
                </p>
              </div>
              {confirm === p.id ? (
                <span className="flex items-center gap-1.5 text-[11px]">
                  Delete?
                  <button onClick={() => (onDelete(p.id), setConfirm(null))} className="rounded bg-red-500/80 px-2 py-0.5 text-white">
                    Yes
                  </button>
                  <button onClick={() => setConfirm(null)} className={b}>
                    No
                  </button>
                </span>
              ) : (
                <span className="flex gap-1 text-[11px]">
                  <button onClick={() => setEditing(p.id)} className={b} title="Rename">
                    ✎
                  </button>
                  <button onClick={() => onDuplicate(p.id)} className={b} title="Duplicate">
                    ⧉
                  </button>
                  <button onClick={() => setConfirm(p.id)} className={b} title="Delete">
                    🗑
                  </button>
                </span>
              )}
            </li>
          ))}
          {!shown.length && <li className="px-3 py-6 text-center text-xs text-slate-500">No projects match.</li>}
        </ul>
        <p className="mt-3 text-[10px] leading-snug text-slate-500">
          Projects are saved automatically in this browser only. Use “Save file” to keep a copy or move it to another computer —
          clearing browser data deletes them.
        </p>
      </div>
    </div>
  );
}
