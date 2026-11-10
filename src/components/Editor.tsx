"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { computeSchedule } from "@/engine/engine";
import {
  PART_INFO,
  ROOM_KINDS,
  addPart,
  goldenEditorDoc,
  makeRoom,
  roomAt,
  snap,
  snapPart,
  toProject,
  type EditorDoc,
  type EditorPartType,
  type RoomKind,
} from "@/editor/editor";
import { ChecksView, H2, ScheduleTable } from "./ScheduleView";
import type { V3 } from "./HouseScene";

const HouseScene = dynamic(() => import("./HouseScene"), { ssr: false });

type Tool = "orbit" | "room" | "erase" | EditorPartType;

const STORAGE_KEY = "wirelab.editor.v1";
const EMPTY: EditorDoc = { rooms: [], parts: [], feederRunM: 10 };
const PART_TOOLS: EditorPartType[] = ["panel", "light", "outlet", "aircon", "water_heater"];

const HINTS: Record<string, string> = {
  orbit: "Drag to orbit, scroll to zoom, right-drag to pan.",
  room: "Drag on the grid to draw a room (snaps to 0.5 m).",
  erase: "Click a part to remove it, or click an empty spot in a room to remove the room.",
  part: "Click inside a room. Wall parts snap to the nearest wall at code mounting height.",
};

function load(): EditorDoc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EditorDoc) : EMPTY;
  } catch {
    return EMPTY;
  }
}

export default function Editor() {
  const [doc, setDocState] = useState<EditorDoc>(EMPTY);
  const [history, setHistory] = useState<EditorDoc[]>([]);
  const [tool, setTool] = useState<Tool>("room");
  const [roomKind, setRoomKind] = useState<RoomKind>("bedroom");
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [start, setStart] = useState<[number, number] | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    // Restore the saved drawing after mount (localStorage is browser-only).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDocState(load());
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    } catch {
      /* storage unavailable: keep working in memory */
    }
  }, [doc]);

  const setDoc = (next: EditorDoc) => {
    setHistory((h) => [...h.slice(-49), doc]);
    setDocState(next);
  };
  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setDocState(prev);
  };
  const say = (text: string, bad = false) => setMessage({ text, bad });

  const built = useMemo(() => toProject(doc), [doc]);
  const schedule = useMemo(() => (built.ok ? computeSchedule(built.project) : null), [built]);
  const faulty = useMemo(() => new Set(schedule?.checks.map((c) => c.targetId) ?? []), [schedule]);
  const panel = doc.parts.find((p) => p.type === "panel")?.position ?? null;

  const isPartTool = (t: Tool): t is EditorPartType => PART_TOOLS.includes(t as EditorPartType);

  // Preview rectangle while drawing a room.
  const preview = useMemo(() => {
    if (tool !== "room" || !start || !hover) return null;
    const b: [number, number] = [snap(hover[0]), snap(hover[1])];
    return {
      x: Math.min(start[0], b[0]),
      z: Math.min(start[1], b[1]),
      w: Math.abs(b[0] - start[0]),
      d: Math.abs(b[1] - start[1]),
      ok: makeRoom(start, b, roomKind, doc.rooms).ok,
    };
  }, [tool, start, hover, roomKind, doc.rooms]);

  // Ghost of the part under the cursor.
  const ghost = useMemo(() => {
    if (!isPartTool(tool) || !hover) return null;
    const room = roomAt(doc.rooms, hover[0], hover[1]);
    if (!room) return null;
    return { type: tool, position: snapPart(tool, room, snap(hover[0], 0.25), snap(hover[1], 0.25)) as V3 };
  }, [tool, hover, doc.rooms]);

  const onFloorDown = (x: number, z: number) => {
    if (tool === "room") setStart([snap(x), snap(z)]);
  };
  const onFloorMove = (x: number, z: number) => setHover([x, z]);
  const onFloorUp = (x: number, z: number) => {
    if (tool === "room" && start) {
      const r = makeRoom(start, [snap(x), snap(z)], roomKind, doc.rooms);
      setStart(null);
      if (!r.ok) return say(r.error, true);
      setDoc({ ...doc, rooms: [...doc.rooms, r.room] });
      say(`Added ${r.room.name} (${r.room.w} m × ${r.room.d} m)`);
    } else if (isPartTool(tool)) {
      const r = addPart(doc, tool, snap(x, 0.25), snap(z, 0.25));
      if (!r.ok) return say(r.error, true);
      setDoc(r.doc);
      say(`Placed ${PART_INFO[tool].label}`);
    } else if (tool === "erase") {
      const room = roomAt(doc.rooms, x, z);
      if (!room) return;
      setDoc({
        ...doc,
        rooms: doc.rooms.filter((r) => r.id !== room.id),
        parts: doc.parts.filter((p) => p.roomId !== room.id),
      });
      say(`Removed ${room.name} and its parts`);
    }
  };
  const onPartClick = (id: string) => {
    if (tool !== "erase") return;
    const target = id === "__panel__" ? doc.parts.find((p) => p.type === "panel")?.id : id;
    setDoc({ ...doc, parts: doc.parts.filter((p) => p.id !== target) });
    say("Removed part");
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "wirelab-house.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (file: File) => {
    try {
      const d = JSON.parse(await file.text()) as EditorDoc;
      if (!Array.isArray(d.rooms) || !Array.isArray(d.parts)) throw new Error();
      setDoc({ ...d, feederRunM: d.feederRunM ?? 10 });
      say(`Loaded ${file.name}`);
    } catch {
      say("That file isn't a WireLab house", true);
    }
  };

  const counts = PART_TOOLS.map((t) => ({ t, n: doc.parts.filter((p) => p.type === t).length }));
  const btn = (active: boolean) =>
    `rounded-md border px-2.5 py-1 text-xs transition ${
      active ? "border-amber-400 bg-amber-400/10 text-amber-300" : "border-slate-700 text-slate-300 hover:border-slate-500"
    }`;

  return (
    <main className="grid flex-1 lg:grid-cols-[1fr_460px]">
      <section className="relative h-[60vh] border-b border-slate-800 lg:h-auto lg:border-b-0 lg:border-r">
        <HouseScene
          rooms={doc.rooms}
          panel={panel}
          circuits={built.ok ? built.project.circuits : []}
          loose={built.ok ? [] : doc.parts.filter((p) => p.type !== "panel")}
          faulty={faulty}
          tripped={new Set()}
          focus={focus}
          camera={[5, 17, 12]}
          editor={{
            rotate: tool === "orbit",
            onFloorDown,
            onFloorMove,
            onFloorUp,
            onPartClick,
            preview,
            ghost,
          }}
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {(["orbit", "room", "erase"] as Tool[]).map((t) => (
            <button key={t} onClick={() => setTool(t)} className={`${btn(tool === t)} bg-slate-900/80 capitalize`}>
              {t === "orbit" ? "↻ Orbit" : t === "room" ? "▭ Room" : "✕ Erase"}
            </button>
          ))}
          {PART_TOOLS.map((t) => (
            <button key={t} onClick={() => setTool(t)} className={`${btn(tool === t)} bg-slate-900/80`}>
              {PART_INFO[t].label}
            </button>
          ))}
        </div>
        <p className="pointer-events-none absolute bottom-3 left-3 right-3 font-mono text-[10px] text-slate-400">
          {HINTS[isPartTool(tool) ? "part" : tool]}
        </p>
      </section>

      <aside className="flex flex-col gap-5 overflow-y-auto p-5 lg:max-h-[calc(100vh-118px)]">
        {tool === "room" && (
          <div>
            <H2>Room type</H2>
            <div className="flex flex-wrap gap-1.5">
              {ROOM_KINDS.map((k) => (
                <button key={k.kind} onClick={() => setRoomKind(k.kind)} className={btn(roomKind === k.kind)}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {message && (
          <p
            className={`rounded-md border px-3 py-2 text-sm ${
              message.bad ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-slate-700 bg-slate-900 text-slate-300"
            }`}
          >
            {message.text}
          </p>
        )}

        <div>
          <H2>Drawing</H2>
          <p className="font-mono text-xs text-slate-400">
            {doc.rooms.length} rooms ·{" "}
            {counts
              .filter((c) => c.n > 0)
              .map((c) => `${c.n} ${PART_INFO[c.t].label.toLowerCase()}`)
              .join(" · ") || "no parts"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button onClick={undo} disabled={!history.length} className={`${btn(false)} disabled:opacity-40`}>
              ↶ Undo
            </button>
            <button
              onClick={() => {
                setDoc(goldenEditorDoc());
                say("Loaded the golden test house");
              }}
              className={btn(false)}
            >
              Load golden house
            </button>
            <button
              onClick={() => {
                setDoc(EMPTY);
                say("Cleared the drawing");
              }}
              className={btn(false)}
            >
              Clear
            </button>
            <button onClick={exportJson} className={btn(false)}>
              Export JSON
            </button>
            <button onClick={() => fileRef.current?.click()} className={btn(false)}>
              Import JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJson(f);
                e.target.value = "";
              }}
            />
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
            Feeder run from meter (m)
            <input
              type="number"
              min={1}
              max={200}
              value={doc.feederRunM}
              onChange={(e) => setDoc({ ...doc, feederRunM: Math.max(1, Number(e.target.value) || 1) })}
              className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-slate-200"
            />
          </label>
        </div>

        {built.ok && schedule ? (
          built.project.circuits.length ? (
            <>
              <ChecksView schedule={schedule} />
              <ScheduleTable schedule={schedule} feederRunM={doc.feederRunM} onFocus={setFocus} />
              <p className="-mt-3 text-[11px] text-slate-500">
                Circuits are grouped automatically: lights up to 12 per circuit, outlets up to 8, and every
                aircon or water heater on its own circuit. Run length is measured along the 3D wire path.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400">Add lights, outlets or appliances to see the load schedule.</p>
          )
        ) : (
          <p className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
            {doc.rooms.length === 0
              ? "Start by drawing a room."
              : !built.ok
                ? `${built.error} — the load schedule appears once the panel is in.`
                : ""}
          </p>
        )}
      </aside>
    </main>
  );
}
