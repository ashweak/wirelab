"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeSchedule } from "@/engine/engine";
import {
  HEIGHT_RANGE,
  PART_INFO,
  ROOM_KINDS,
  addPart,
  goldenEditorDoc,
  makeRoom,
  resetWiring,
  roomAt,
  snap,
  snapPart,
  toProject,
  wireNext,
  type EditorDoc,
  type EditorPartType,
  type RoomKind,
} from "@/editor/editor";
import {
  ROOM_PRESETS,
  deleteItems,
  duplicatePart,
  duplicateRoom,
  movePart,
  moveRoom,
  placePreset,
  resizeRoom,
  rotateRoom,
  setPartHeight,
  updateRoom,
} from "@/editor/transform";
import { designChecks, materials } from "@/editor/wiring";
import {
  CEILING_RANGE,
  FLOOR_KINDS,
  FURNITURE,
  WALL_PAINTS,
  addFurniture,
  ceilingOf,
  defaultFinish,
  duplicateFurniture,
  moveFurniture,
  resizeFurniture,
  rotateFurniture,
  setCeiling,
  setFinish,
  setFurnitureColor,
} from "@/editor/interior";
import type { FloorKind, FurnitureType } from "@/editor/parts";
import { ChecksView, H2, MaterialsTable, ScheduleTable } from "./ScheduleView";
import type { Corner, SceneApi, ViewMode, ViewName } from "./HouseScene";
import { deviceFor, sceneCircuits } from "./sceneData";
import { ViewToggle } from "./ViewToggle";

const HouseScene = dynamic(() => import("./HouseScene"), { ssr: false });

type Tool = "select" | "room" | "wire" | `place:${EditorPartType}` | `preset:${string}` | `furn:${FurnitureType}`;
type Selection = { kind: "room" | "part" | "furniture"; id: string } | null;
type Drag =
  | { kind: "room"; id: string; start: [number, number]; origin: EditorDoc; moved: boolean }
  | { kind: "part"; id: string; start: [number, number]; origin: EditorDoc; moved: boolean }
  | { kind: "furniture"; id: string; start: [number, number]; origin: EditorDoc; moved: boolean }
  | { kind: "resize"; id: string; corner: Corner; origin: EditorDoc; moved: boolean }
  | { kind: "draw"; start: [number, number] };

const STORAGE_KEY = "wirelab.editor.v1";
const EMPTY: EditorDoc = { rooms: [], parts: [], feederRunM: 10 };
const PART_TYPES: EditorPartType[] = ["panel", "light", "switch", "outlet", "aircon", "water_heater"];
const PART_ICON: Record<EditorPartType, string> = {
  panel: "▣",
  light: "◉",
  switch: "⏻",
  outlet: "⊡",
  aircon: "❄",
  water_heater: "♨",
};
const SNAPS = [0.1, 0.25, 0.5, 1];
const DND = "application/x-wirelab";

const HINT: Record<string, string> = {
  select:
    "Click to select · drag to move · drag the white corners to resize · drag empty space to orbit · Del delete · Ctrl+D duplicate · R rotate",
  room: "Drag on the grid to draw a room.",
  wire: "Click devices in the order the wire should run from the panel. Unclicked devices chain to the nearest one.",
  place: "Click inside a room to place. Wall parts snap to the nearest wall. Esc to stop.",
  preset: "Click on the grid to drop the room. Esc to stop.",
  furn: "Click inside a room to place. It stays inside the walls. R rotates, Esc to stop.",
};

function load(): EditorDoc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EditorDoc) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function Num({
  label,
  value,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  step: number;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(String(value));
  }
  const commit = () => {
    const v = Number(text);
    if (Number.isFinite(v) && v !== value) onCommit(v);
    // Show the current value again; if the change was accepted the new value replaces it on the next render.
    setText(String(value));
  };
  return (
    <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wider text-slate-500">
      {label}
      <input
        type="number"
        step={step}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs normal-case tracking-normal text-slate-200"
      />
    </label>
  );
}

export default function Editor() {
  const [doc, setDocState] = useState<EditorDoc>(EMPTY);
  const [draft, setDraft] = useState<EditorDoc | null>(null);
  const [past, setPast] = useState<EditorDoc[]>([]);
  const [future, setFuture] = useState<EditorDoc[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [roomKind, setRoomKind] = useState<RoomKind>("bedroom");
  const [selection, setSelection] = useState<Selection>(null);
  const [step, setStep] = useState(0.5);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("real");
  const [clipboard, setClipboard] = useState<Selection>(null);
  const [mode, setMode] = useState<"edit" | "render">("edit");
  const [lighting, setLighting] = useState<"day" | "night">("day");
  const [cutaway, setCutaway] = useState(true);
  const [showWiring, setShowWiring] = useState(false);
  const [custom, setCustom] = useState({ w: 3.5, d: 3, kind: "bedroom" as RoomKind });
  const api = useRef<SceneApi | null>(null);
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

  const shown = draft ?? doc;
  const say = useCallback((text: string, bad = false) => setMessage({ text, bad }), []);
  const commit = useCallback(
    (next: EditorDoc, from: EditorDoc = doc) => {
      setPast((h) => [...h.slice(-79), from]);
      setFuture([]);
      setDocState(next);
    },
    [doc],
  );
  const apply = (r: { ok: true; doc: EditorDoc } | { ok: false; error: string }, ok?: string) => {
    if (!r.ok) return say(r.error, true);
    commit(r.doc);
    if (ok) say(ok);
  };
  const undo = useCallback(() => {
    const prev = past.at(-1);
    if (!prev) return;
    setPast((h) => h.slice(0, -1));
    setFuture((f) => [doc, ...f]);
    setDocState(prev);
  }, [past, doc]);
  const redo = useCallback(() => {
    const next = future[0];
    if (!next) return;
    setFuture((f) => f.slice(1));
    setPast((h) => [...h, doc]);
    setDocState(next);
  }, [future, doc]);

  // ----- derived data -----
  const built = useMemo(() => toProject(shown), [shown]);
  const schedule = useMemo(() => (built.ok ? computeSchedule(built.project) : null), [built]);
  const faulty = useMemo(() => new Set(schedule?.checks.map((c) => c.targetId) ?? []), [schedule]);
  const panelPart = shown.parts.find((p) => p.type === "panel");
  const panel = useMemo(() => (panelPart ? deviceFor(panelPart, shown.rooms) : null), [panelPart, shown.rooms]);
  const tags = useMemo(
    () => new Map(shown.parts.filter((p) => p.seq !== undefined).map((p) => [p.id, String(p.seq)])),
    [shown.parts],
  );
  const ceiling = ceilingOf(shown);
  const circuits = useMemo(
    () =>
      built.ok && panel ? sceneCircuits(panel.position, built.project.circuits, shown.rooms, tags, ceiling) : [],
    [built, panel, shown.rooms, tags, ceiling],
  );
  const extraChecks = useMemo(() => designChecks(doc), [doc]);
  const bom = useMemo(() => materials(doc), [doc]);
  const wired = doc.parts.some((p) => p.seq !== undefined);
  const selRoom = selection?.kind === "room" ? shown.rooms.find((r) => r.id === selection.id) : undefined;
  const selPart = selection?.kind === "part" ? shown.parts.find((p) => p.id === selection.id) : undefined;
  const selFurn =
    selection?.kind === "furniture" ? (shown.furniture ?? []).find((f) => f.id === selection.id) : undefined;
  const furnType = tool.startsWith("furn:") ? (tool.slice(5) as FurnitureType) : null;

  const placeType = tool.startsWith("place:") ? (tool.slice(6) as EditorPartType) : null;
  const preset = useMemo(
    () =>
      tool === "preset:custom"
        ? { id: "custom", label: `Custom ${custom.w} × ${custom.d}`, ...custom }
        : tool.startsWith("preset:")
          ? ROOM_PRESETS.find((p) => p.id === tool.slice(7))
          : undefined,
    [tool, custom],
  );

  // ----- ghosts / previews -----
  const preview = useMemo(() => {
    if (drag?.kind === "draw" && hover) {
      const b: [number, number] = [snap(hover[0], step), snap(hover[1], step)];
      return {
        x: Math.min(drag.start[0], b[0]),
        z: Math.min(drag.start[1], b[1]),
        w: Math.abs(b[0] - drag.start[0]),
        d: Math.abs(b[1] - drag.start[1]),
        ok: makeRoom(drag.start, b, roomKind, doc.rooms).ok,
      };
    }
    if (preset && hover) {
      const r = placePreset(doc, preset, hover[0], hover[1], step);
      return {
        x: snap(hover[0] - preset.w / 2, step),
        z: snap(hover[1] - preset.d / 2, step),
        w: preset.w,
        d: preset.d,
        ok: r.ok,
      };
    }
    return null;
  }, [drag, hover, step, roomKind, doc, preset]);

  const ghost = useMemo(() => {
    if (!placeType || !hover) return null;
    const room = roomAt(doc.rooms, hover[0], hover[1]);
    if (!room) return null;
    return deviceFor(
      {
        id: "ghost",
        type: placeType,
        roomId: room.id,
        position: snapPart(placeType, room, snap(hover[0], Math.min(step, 0.25)), snap(hover[1], Math.min(step, 0.25))),
      },
      doc.rooms,
    );
  }, [placeType, hover, doc.rooms, step]);

  // ----- pointer handlers from the scene -----
  const onRoomDown = (id: string, x: number, z: number) => {
    if (tool === "select") {
      setSelection({ kind: "room", id });
      setDrag({ kind: "room", id, start: [x, z], origin: doc, moved: false });
    } else onFloorDown(x, z);
  };
  const onPartDown = (id: string, x: number, z: number) => {
    if (tool === "wire") {
      const part = doc.parts.find((p) => p.id === id);
      if (!part || part.type === "panel") return say("Wiring always starts at the panel — click the devices", true);
      const next = wireNext(doc, id);
      commit(next);
      return say(`Wired ${PART_INFO[part.type].label} as #${next.parts.find((p) => p.id === id)!.seq}`);
    }
    if (tool !== "select") return;
    setSelection({ kind: "part", id });
    setDrag({ kind: "part", id, start: [x, z], origin: doc, moved: false });
  };
  const onFurnitureDown = (id: string, x: number, z: number) => {
    if (tool !== "select") return;
    setSelection({ kind: "furniture", id });
    setDrag({ kind: "furniture", id, start: [x, z], origin: doc, moved: false });
  };
  const onHandleDown = (id: string, corner: Corner) =>
    setDrag({ kind: "resize", id, corner, origin: doc, moved: false });

  const onFloorDown = (x: number, z: number) => {
    if (tool === "room") setDrag({ kind: "draw", start: [snap(x, step), snap(z, step)] });
  };
  const onFloorMove = (x: number, z: number) => setHover([x, z]);
  const onFloorUp = (x: number, z: number) => {
    if (drag?.kind === "draw") {
      const r = makeRoom(drag.start, [snap(x, step), snap(z, step)], roomKind, doc.rooms);
      setDrag(null);
      if (!r.ok) return say(r.error, true);
      commit({ ...doc, rooms: [...doc.rooms, r.room] });
      setSelection({ kind: "room", id: r.room.id });
      say(`Added ${r.room.name} (${r.room.w} m × ${r.room.d} m)`);
    } else if (placeType) {
      const s = Math.min(step, 0.25);
      apply(addPart(doc, placeType, snap(x, s), snap(z, s)), `Placed ${PART_INFO[placeType].label}`);
    } else if (furnType) {
      const r = addFurniture(doc, furnType, x, z, Math.min(step, 0.1));
      apply(r, `Placed ${FURNITURE[furnType].label}`);
      if (r.ok) setSelection({ kind: "furniture", id: r.doc.furniture!.at(-1)!.id });
    } else if (preset) {
      const r = placePreset(doc, preset, x, z, step);
      apply(r, `Added ${preset.label}`);
      if (r.ok) {
        setSelection({ kind: "room", id: r.doc.rooms.at(-1)!.id });
        setTool("select");
      }
    } else if (tool === "select" && !drag) {
      setSelection(null);
    }
  };

  const onDragMove = (x: number, z: number) => {
    setHover([x, z]);
    if (!drag || drag.kind === "draw") return;
    let r: { ok: true; doc: EditorDoc } | { ok: false; error: string };
    if (drag.kind === "room") r = moveRoom(drag.origin, drag.id, x - drag.start[0], z - drag.start[1], step);
    else if (drag.kind === "furniture") {
      const f = drag.origin.furniture!.find((q) => q.id === drag.id)!;
      r = moveFurniture(drag.origin, drag.id, f.x + x - drag.start[0], f.z + z - drag.start[1], Math.min(step, 0.1));
    } else if (drag.kind === "part") {
      const s = Math.min(step, 0.25);
      r = movePart(drag.origin, drag.id, snap(x, s), snap(z, s));
    } else {
      const room = drag.origin.rooms.find((q) => q.id === drag.id)!;
      const fx = drag.corner.includes("w") ? room.x + room.w : room.x;
      const fz = drag.corner.startsWith("n") ? room.z + room.d : room.z;
      const px = snap(x, step);
      const pz = snap(z, step);
      r = resizeRoom(drag.origin, drag.id, {
        x: Math.min(fx, px),
        z: Math.min(fz, pz),
        w: Math.abs(px - fx),
        d: Math.abs(pz - fz),
      });
    }
    if (r.ok) {
      setDraft(r.doc);
      if (!drag.moved) setDrag({ ...drag, moved: true });
    }
  };
  const onDragEnd = () => {
    if (drag && drag.kind !== "draw" && draft && drag.moved) {
      commit(draft, drag.origin);
      const what = drag.kind === "resize" ? "Resized" : "Moved";
      say(
        `${what} ${
          drag.kind === "part"
            ? "part"
            : drag.kind === "furniture"
              ? FURNITURE[drag.origin.furniture!.find((f) => f.id === drag.id)!.type].label
              : drag.origin.rooms.find((r) => r.id === drag.id)?.name
        }`,
      );
    }
    setDraft(null);
    if (drag?.kind !== "draw") setDrag(null);
  };

  // ----- actions on the selection -----
  const del = useCallback(() => {
    if (!selection) return;
    commit(deleteItems(doc, [selection.id]));
    say(selection.kind === "room" ? "Deleted room and its contents" : "Deleted");
    setSelection(null);
  }, [selection, doc, commit, say]);
  const duplicate = useCallback(
    (sel: Selection = selection) => {
      if (!sel) return;
      const r =
        sel.kind === "room"
          ? duplicateRoom(doc, sel.id)
          : sel.kind === "furniture"
            ? duplicateFurniture(doc, sel.id)
            : duplicatePart(doc, sel.id);
      if (!r.ok) return say(r.error, true);
      commit(r.doc);
      const added =
        sel.kind === "room" ? r.doc.rooms.at(-1)! : sel.kind === "furniture" ? r.doc.furniture!.at(-1)! : r.doc.parts.at(-1)!;
      setSelection({ kind: sel.kind, id: added.id });
      say("Duplicated");
    },
    [selection, doc, commit, say],
  );
  const rotate = useCallback(() => {
    if (!selection || selection.kind === "part") return;
    const r = selection.kind === "room" ? rotateRoom(doc, selection.id) : rotateFurniture(doc, selection.id);
    if (!r.ok) return say(r.error, true);
    commit(r.doc);
    say("Rotated 90°");
  }, [selection, doc, commit, say]);
  const nudge = useCallback(
    (dx: number, dz: number) => {
      if (!selection) return;
      if (selection.kind === "room") {
        const r = moveRoom(doc, selection.id, dx * step, dz * step, step);
        if (r.ok) commit(r.doc);
        else say(r.error, true);
      } else if (selection.kind === "furniture") {
        const f = doc.furniture?.find((q) => q.id === selection.id);
        if (!f) return;
        const r = moveFurniture(doc, f.id, f.x + dx * Math.min(step, 0.1), f.z + dz * Math.min(step, 0.1), 0.01);
        if (r.ok) commit(r.doc);
      } else {
        const p = doc.parts.find((q) => q.id === selection.id);
        if (!p) return;
        const r = movePart(doc, p.id, p.position[0] + dx * step, p.position[2] + dz * step);
        if (r.ok) commit(r.doc);
      }
    },
    [selection, doc, step, commit, say],
  );

  // ----- keyboard shortcuts -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (k === "y" || (k === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (mod && k === "d") {
        e.preventDefault();
        duplicate();
      } else if (mod && k === "c") setClipboard(selection);
      else if (mod && k === "v") duplicate(clipboard);
      else if (e.key === "Delete" || e.key === "Backspace") del();
      else if (e.key === "Escape") {
        setTool("select");
        setSelection(null);
        setDrag(null);
      } else if (k === "r" && !mod) rotate();
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]!;
        nudge(d[0], d[1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, duplicate, del, rotate, nudge, selection, clipboard]);

  // ----- drag & drop from the library -----
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData(DND);
    if (!raw) return;
    const item = JSON.parse(raw) as { kind: "preset" | "part" | "furniture"; id: string };
    const at = api.current?.floorAt(e.clientX, e.clientY);
    if (!at) return;
    if (item.kind === "furniture") {
      const t = item.id as FurnitureType;
      const r = addFurniture(doc, t, at[0], at[1], Math.min(step, 0.1));
      apply(r, `Placed ${FURNITURE[t].label}`);
      if (r.ok) setSelection({ kind: "furniture", id: r.doc.furniture!.at(-1)!.id });
    } else if (item.kind === "preset") {
      const p =
        item.id === "custom"
          ? { id: "custom", label: `Custom ${custom.w} × ${custom.d}`, ...custom }
          : ROOM_PRESETS.find((q) => q.id === item.id)!;
      const r = placePreset(doc, p, at[0], at[1], step);
      apply(r, `Added ${p.label}`);
      if (r.ok) setSelection({ kind: "room", id: r.doc.rooms.at(-1)!.id });
    } else {
      const t = item.id as EditorPartType;
      const s = Math.min(step, 0.25);
      const r = addPart(doc, t, snap(at[0], s), snap(at[1], s));
      apply(r, `Placed ${PART_INFO[t].label}`);
      if (r.ok) setSelection({ kind: "part", id: r.doc.parts.at(-1)!.id });
    }
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
      commit({ ...d, feederRunM: d.feederRunM ?? 10 });
      setSelection(null);
      say(`Loaded ${file.name}`);
    } catch {
      say("That file isn't a WireLab house", true);
    }
  };

  const btn = (active: boolean) =>
    `rounded-md border px-2.5 py-1 text-xs transition ${
      active ? "border-amber-400 bg-amber-400/10 text-amber-300" : "border-slate-700 text-slate-300 hover:border-slate-500"
    }`;
  const tile = (active: boolean) =>
    `flex w-full cursor-grab items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] transition active:cursor-grabbing ${
      active ? "border-amber-400 bg-amber-400/10 text-amber-200" : "border-slate-700 bg-slate-900/90 text-slate-300 hover:border-slate-500"
    }`;
  const hintKey = tool.startsWith("place:")
    ? "place"
    : tool.startsWith("preset:")
      ? "preset"
      : tool.startsWith("furn:")
        ? "furn"
        : tool;
  const saveImage = () => {
    const url = api.current?.capture();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `wirelab-${mode}-${lighting}.png`;
    a.click();
  };

  return (
    <main className="grid flex-1 lg:grid-cols-[1fr_440px]">
      <section
        className="relative h-[70vh] border-b border-slate-800 lg:h-auto lg:border-b-0 lg:border-r"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <HouseScene
          rooms={shown.rooms}
          panel={panel}
          circuits={circuits}
          loose={built.ok ? [] : shown.parts.filter((p) => p.type !== "panel").map((p) => deviceFor(p, shown.rooms))}
          faulty={faulty}
          tripped={new Set()}
          focus={focus}
          view={view}
          camera={[5, 16, 15]}
          furniture={shown.furniture}
          ceiling={ceiling}
          mode={mode}
          lighting={lighting}
          cutaway={cutaway}
          showWiring={showWiring}
          editor={{
            onFurnitureDown,
            rotate: tool === "select" || tool === "wire",
            selection,
            dragging: !!drag && drag.kind !== "draw",
            onRoomDown,
            onPartDown,
            onHandleDown,
            onFloorDown,
            onFloorMove,
            onFloorUp,
            onDragMove,
            onDragEnd,
            preview,
            ghost,
            apiRef: api,
          }}
        />

        {/* Toolbar */}
        <div className="absolute left-3 right-3 top-3 flex flex-wrap items-center gap-1.5">
          {(
            [
              ["select", "↖ Select"],
              ["room", "▭ Draw room"],
              ["wire", "〰 Wire"],
            ] as const
          ).map(([t, label]) => (
            <button key={t} onClick={() => setTool(t)} className={`${btn(tool === t)} bg-slate-900/90`}>
              {label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-slate-700" />
          <button onClick={undo} disabled={!past.length} className={`${btn(false)} bg-slate-900/90 disabled:opacity-40`} title="Ctrl+Z">
            ↶
          </button>
          <button onClick={redo} disabled={!future.length} className={`${btn(false)} bg-slate-900/90 disabled:opacity-40`} title="Ctrl+Shift+Z">
            ↷
          </button>
          <label className="ml-1 flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/90 px-2 py-1 text-xs text-slate-400">
            Snap
            <select
              value={step}
              onChange={(e) => setStep(Number(e.target.value))}
              className="bg-transparent font-mono text-slate-200 outline-none"
            >
              {SNAPS.map((s) => (
                <option key={s} value={s} className="bg-slate-900">
                  {s} m
                </option>
              ))}
            </select>
          </label>
          <div className="ml-auto flex overflow-hidden rounded-md border border-amber-400/60 text-[11px]">
            {(["edit", "render"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2.5 py-1 capitalize ${mode === m ? "bg-amber-400 text-slate-900" : "bg-slate-900/90 text-slate-300"}`}
              >
                {m === "edit" ? "✎ Edit" : "◐ Render"}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-md border border-slate-700 text-[11px]">
            {(["home", "top", "front", "fit"] as ViewName[]).map((v) => (
              <button
                key={v}
                onClick={() => api.current?.setView(v)}
                className="bg-slate-900/90 px-2 py-1 capitalize text-slate-300 hover:bg-slate-800"
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {mode === "render" && (
          <div className="absolute right-3 top-12 flex flex-wrap items-center justify-end gap-1.5 text-[11px]">
            <div className="flex overflow-hidden rounded-md border border-slate-700">
              {(["day", "night"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLighting(l)}
                  className={`px-2.5 py-1 ${lighting === l ? "bg-slate-200 text-slate-900" : "bg-slate-900/90 text-slate-300"}`}
                >
                  {l === "day" ? "☀ Day" : "☾ Night"}
                </button>
              ))}
            </div>
            <button onClick={() => setCutaway(!cutaway)} className={`${btn(cutaway)} bg-slate-900/90`}>
              Cutaway walls
            </button>
            <button onClick={() => setShowWiring(!showWiring)} className={`${btn(showWiring)} bg-slate-900/90`}>
              Show wiring
            </button>
            <button onClick={saveImage} className={`${btn(false)} bg-slate-900/90`}>
              ⤓ Save image
            </button>
          </div>
        )}

        {/* Shape library */}
        <div className="absolute bottom-14 left-3 top-14 flex w-40 flex-col gap-3 overflow-y-auto pr-1">
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Rooms</p>
            {ROOM_PRESETS.map((p) => (
              <button
                key={p.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData(DND, JSON.stringify({ kind: "preset", id: p.id }))}
                onClick={() => setTool(`preset:${p.id}`)}
                className={tile(tool === `preset:${p.id}`)}
              >
                <span
                  className="inline-block shrink-0 border border-current"
                  style={{ width: p.w * 5, height: p.d * 5 }}
                />
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1 rounded-md border border-slate-700 bg-slate-900/90 p-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Custom room</p>
            <div className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
              <input
                type="number"
                min={1}
                max={20}
                step={0.5}
                value={custom.w}
                onChange={(e) => setCustom({ ...custom, w: Math.max(1, Number(e.target.value) || 1) })}
                className="w-12 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-slate-200"
                aria-label="Custom room width (m)"
              />
              ×
              <input
                type="number"
                min={1}
                max={20}
                step={0.5}
                value={custom.d}
                onChange={(e) => setCustom({ ...custom, d: Math.max(1, Number(e.target.value) || 1) })}
                className="w-12 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-slate-200"
                aria-label="Custom room depth (m)"
              />
              m
            </div>
            <select
              value={custom.kind}
              onChange={(e) => setCustom({ ...custom, kind: e.target.value as RoomKind })}
              className="rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-[11px] text-slate-200"
              aria-label="Custom room type"
            >
              {ROOM_KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
            <button
              draggable
              onDragStart={(e) => e.dataTransfer.setData(DND, JSON.stringify({ kind: "preset", id: "custom" }))}
              onClick={() => setTool("preset:custom")}
              className={tile(tool === "preset:custom")}
            >
              ＋ Drop {custom.w} × {custom.d} m
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Furniture</p>
            {(Object.keys(FURNITURE) as FurnitureType[]).map((t) => (
              <button
                key={t}
                draggable
                onDragStart={(e) => e.dataTransfer.setData(DND, JSON.stringify({ kind: "furniture", id: t }))}
                onClick={() => setTool(`furn:${t}`)}
                className={tile(tool === `furn:${t}`)}
              >
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: FURNITURE[t].color }} />
                {FURNITURE[t].label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Electrical</p>
            {PART_TYPES.map((t) => (
              <button
                key={t}
                draggable
                onDragStart={(e) => e.dataTransfer.setData(DND, JSON.stringify({ kind: "part", id: t }))}
                onClick={() => setTool(`place:${t}`)}
                className={tile(tool === `place:${t}`)}
              >
                <span className="w-4 text-center text-sm">{PART_ICON[t]}</span>
                {PART_INFO[t].label}
              </button>
            ))}
          </div>
          <p className="text-[10px] leading-snug text-slate-500">Drag onto the plane, or click then click to place.</p>
        </div>

        <ViewToggle view={view} setView={setView} />
        <p className="pointer-events-none absolute bottom-3 left-3 right-56 font-mono text-[10px] text-slate-400">
          {HINT[hintKey]}
        </p>
      </section>

      <aside className="flex flex-col gap-5 overflow-y-auto p-5 lg:max-h-[calc(100vh-118px)]">
        {message && (
          <p
            className={`rounded-md border px-3 py-2 text-sm ${
              message.bad ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-slate-700 bg-slate-900 text-slate-300"
            }`}
          >
            {message.text}
          </p>
        )}

        {tool === "room" && (
          <div>
            <H2>Room type to draw</H2>
            <div className="flex flex-wrap gap-1.5">
              {ROOM_KINDS.map((k) => (
                <button key={k.kind} onClick={() => setRoomKind(k.kind)} className={btn(roomKind === k.kind)}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {selRoom && (
          <div className="rounded-md border border-amber-400/40 bg-amber-400/5 p-3">
            <H2>Selected room</H2>
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 flex flex-col gap-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                Name
                <input
                  value={selRoom.name}
                  onChange={(e) => setDocState(updateRoom(doc, selRoom.id, { name: e.target.value }))}
                  onFocus={() => commit(doc)}
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs normal-case tracking-normal text-slate-200"
                />
              </label>
              <label className="col-span-2 flex flex-col gap-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                Type
                <select
                  value={selRoom.kind}
                  onChange={(e) => commit(updateRoom(doc, selRoom.id, { kind: e.target.value as RoomKind }))}
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs normal-case tracking-normal text-slate-200"
                >
                  {ROOM_KINDS.map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>
              <Num label="X (m)" value={selRoom.x} step={step} onCommit={(v) => apply(moveRoom(doc, selRoom.id, v - selRoom.x, 0, 0.01))} />
              <Num label="Z (m)" value={selRoom.z} step={step} onCommit={(v) => apply(moveRoom(doc, selRoom.id, 0, v - selRoom.z, 0.01))} />
              <Num label="Width (m)" value={selRoom.w} step={step} onCommit={(v) => apply(resizeRoom(doc, selRoom.id, { ...selRoom, w: v }))} />
              <Num label="Depth (m)" value={selRoom.d} step={step} onCommit={(v) => apply(resizeRoom(doc, selRoom.id, { ...selRoom, d: v }))} />
            </div>
            <p className="mt-2 font-mono text-[11px] text-slate-500">
              {(selRoom.w * selRoom.d).toFixed(1)} m² · {doc.parts.filter((p) => p.roomId === selRoom.id).length} parts ·{" "}
              {(doc.furniture ?? []).filter((f) => f.roomId === selRoom.id).length} furniture
            </p>
            {(() => {
              const fin = defaultFinish(selRoom);
              const floor = selRoom.floor ?? fin.floor;
              const wall = selRoom.wall ?? fin.wall;
              return (
                <div className="mt-3 flex flex-col gap-2">
                  <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                    Floor
                    <div className="flex gap-1.5">
                      <select
                        value={floor.kind}
                        onChange={(e) => {
                          const k = e.target.value as FloorKind;
                          commit(setFinish(doc, selRoom.id, { floor: { kind: k, color: FLOOR_KINDS.find((f) => f.kind === k)!.color } }));
                        }}
                        className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs normal-case tracking-normal text-slate-200"
                      >
                        {FLOOR_KINDS.map((f) => (
                          <option key={f.kind} value={f.kind}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="color"
                        value={floor.color}
                        onChange={(e) => setDocState(setFinish(doc, selRoom.id, { floor: { ...floor, color: e.target.value } }))}
                        onFocus={() => commit(doc)}
                        className="h-7 w-9 cursor-pointer rounded border border-slate-700 bg-slate-900"
                        aria-label="Floor colour"
                      />
                    </div>
                  </label>
                  <div className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                    Wall paint
                    <div className="flex flex-wrap items-center gap-1">
                      {WALL_PAINTS.map((c) => (
                        <button
                          key={c}
                          onClick={() => commit(setFinish(doc, selRoom.id, { wall: c }))}
                          className={`h-6 w-6 rounded border ${wall === c ? "border-amber-400 ring-1 ring-amber-400" : "border-slate-600"}`}
                          style={{ background: c }}
                          aria-label={`Paint ${c}`}
                        />
                      ))}
                      <input
                        type="color"
                        value={wall}
                        onChange={(e) => setDocState(setFinish(doc, selRoom.id, { wall: e.target.value }))}
                        onFocus={() => commit(doc)}
                        className="h-6 w-8 cursor-pointer rounded border border-slate-700 bg-slate-900"
                        aria-label="Custom wall colour"
                      />
                    </div>
                  </div>
                </div>
              );
            })()}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button onClick={rotate} className={btn(false)} title="R">
                ⟳ Rotate 90°
              </button>
              <button onClick={() => duplicate()} className={btn(false)} title="Ctrl+D">
                ⧉ Duplicate
              </button>
              <button onClick={del} className={`${btn(false)} hover:border-red-500 hover:text-red-300`} title="Delete">
                ✕ Delete
              </button>
            </div>
          </div>
        )}

        {selPart && (
          <div className="rounded-md border border-amber-400/40 bg-amber-400/5 p-3">
            <H2>Selected part</H2>
            <p className="text-sm text-slate-200">
              {PART_INFO[selPart.type].label}
              <span className="text-slate-500"> · {shown.rooms.find((r) => r.id === selPart.roomId)?.name}</span>
            </p>
            <p className="font-mono text-[11px] text-slate-500">
              x {selPart.position[0].toFixed(2)} · z {selPart.position[2].toFixed(2)} ·{" "}
              {PART_INFO[selPart.type].va > 0 ? `${PART_INFO[selPart.type].va} VA` : "no load"}
              {selPart.seq !== undefined && ` · wire #${selPart.seq}`}
            </p>
            {HEIGHT_RANGE[selPart.type] && (
              <div className="mt-2 w-40">
                <Num
                  label={`Mounting height (m), ${HEIGHT_RANGE[selPart.type]!.join("–")}`}
                  value={selPart.position[1]}
                  step={0.05}
                  onCommit={(v) => apply(setPartHeight(doc, selPart.id, v))}
                />
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selPart.type !== "panel" && (
                <button onClick={() => duplicate()} className={btn(false)} title="Ctrl+D">
                  ⧉ Duplicate
                </button>
              )}
              <button onClick={del} className={`${btn(false)} hover:border-red-500 hover:text-red-300`} title="Delete">
                ✕ Delete
              </button>
            </div>
          </div>
        )}

        {selFurn && (
          <div className="rounded-md border border-amber-400/40 bg-amber-400/5 p-3">
            <H2>Selected furniture</H2>
            <p className="text-sm text-slate-200">
              {FURNITURE[selFurn.type].label}
              <span className="text-slate-500"> · {shown.rooms.find((r) => r.id === selFurn.roomId)?.name}</span>
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["w", "d", "h"] as const).map((k) => (
                <Num
                  key={k}
                  label={`${{ w: "Width", d: "Depth", h: "Height" }[k]} (m)`}
                  value={selFurn[k]}
                  step={0.05}
                  onCommit={(v) => apply(resizeFurniture(doc, selFurn.id, { [k]: v }))}
                />
              ))}
            </div>
            <p className="mt-1 font-mono text-[10px] text-slate-500">
              W {FURNITURE[selFurn.type].limits.w.join("–")} · D {FURNITURE[selFurn.type].limits.d.join("–")} · H{" "}
              {FURNITURE[selFurn.type].limits.h.join("–")} m · facing {selFurn.rot}°
            </p>
            <label className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
              Colour
              <input
                type="color"
                value={selFurn.color}
                onChange={(e) => setDocState(setFurnitureColor(doc, selFurn.id, e.target.value))}
                onFocus={() => commit(doc)}
                className="h-7 w-10 cursor-pointer rounded border border-slate-700 bg-slate-900"
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button onClick={rotate} className={btn(false)} title="R">
                ⟳ Rotate 90°
              </button>
              <button onClick={() => duplicate()} className={btn(false)} title="Ctrl+D">
                ⧉ Duplicate
              </button>
              <button onClick={del} className={`${btn(false)} hover:border-red-500 hover:text-red-300`} title="Delete">
                ✕ Delete
              </button>
            </div>
          </div>
        )}

        <div>
          <H2>Project</H2>
          <p className="font-mono text-xs text-slate-400">
            {doc.rooms.length} rooms · {doc.rooms.reduce((s, r) => s + r.w * r.d, 0).toFixed(1)} m² ·{" "}
            {doc.parts.length} parts
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              onClick={() => {
                commit(goldenEditorDoc());
                setSelection(null);
                say("Loaded the golden test house");
              }}
              className={btn(false)}
            >
              Load golden house
            </button>
            <button
              onClick={() => {
                commit(EMPTY);
                setSelection(null);
                say("New blank project");
              }}
              className={btn(false)}
            >
              New
            </button>
            {wired && (
              <button
                onClick={() => {
                  commit(resetWiring(doc));
                  say("Wiring order reset to automatic");
                }}
                className={btn(false)}
              >
                Reset wiring
              </button>
            )}
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
              onChange={(e) => commit({ ...doc, feederRunM: Math.max(1, Number(e.target.value) || 1) })}
              className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-slate-200"
            />
          </label>
          <div className="mt-2 w-48">
            <Num
              label={`Ceiling height (m), ${CEILING_RANGE.join("–")}`}
              value={ceiling}
              step={0.1}
              onCommit={(v) => apply(setCeiling(doc, v), `Ceiling set to ${v} m — wire runs updated`)}
            />
          </div>
        </div>

        {built.ok && schedule ? (
          built.project.circuits.length ? (
            <>
              <ChecksView schedule={schedule} extra={extraChecks} />
              <ScheduleTable schedule={schedule} feederRunM={doc.feederRunM} onFocus={setFocus} />
              <p className="-mt-3 text-[11px] text-slate-500">
                Each circuit is daisy-chained from the panel: devices on the same wall connect through the wall,
                others go up to the ceiling and back down. Voltage drop is summed per segment using only the load
                still downstream. Lights up to 12 per circuit, outlets up to 8, appliances on their own.
              </p>
              <MaterialsTable lines={bom} />
            </>
          ) : (
            <p className="text-sm text-slate-400">Add lights, outlets or appliances to see the load schedule.</p>
          )
        ) : (
          <p className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
            {doc.rooms.length === 0
              ? "Drag a room from the library onto the plane, or use Draw room."
              : !built.ok
                ? `${built.error} — the load schedule appears once the panel is in.`
                : ""}
          </p>
        )}
      </aside>
    </main>
  );
}
