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
  FURNITURE_GROUPS,
  SIZE_LIMITS,
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
  setRoomMaterials,
} from "@/editor/interior";
import { PART_TYPES, type Draft, type FloorKind, type FurnitureType } from "@/editor/parts";
import { ChecksView, EstimateView, H2, MaterialsTable, ScheduleTable } from "./ScheduleView";
import { CEILING_MATERIALS, FLOOR_MATERIALS, WALL_MATERIALS, WALL_OF, estimate } from "@/editor/construction";
import type { Corner, SceneApi, ViewMode, ViewName } from "./HouseScene";
import { deviceFor, sceneCircuits } from "./sceneData";
import { ViewToggle } from "./ViewToggle";
import PlanView, { type PlanApi } from "./PlanView";
import ErrorBoundary from "./ErrorBoundary";
import PdfDialog from "./PdfExport";
import ProjectsDialog from "./ProjectsDialog";
import * as store from "@/store/projects";
import { SlotGrid, itemLabel, useItemPreview } from "./Inventory";
import type { InvItem } from "./ItemPreview";
import {
  DEFAULT_LAYERS,
  area as cadArea,
  findSnap,
  hitTest,
  length as cadLength,
  ortho as cadOrtho,
  selectInRect,
  snapCandidates,
  type Pt,
  type SnapKind,
} from "@/cad/geometry";
import { initial, preview as cadPreviewOf, run as cadRun, type CadCtx, type CadResult, type CadState } from "@/cad/commands";

const HouseScene = dynamic(() => import("./HouseScene"), { ssr: false });

type Tool = "select" | "room" | "wire" | "measure" | "draft" | `place:${EditorPartType}` | `preset:${string}` | `furn:${FurnitureType}`;
type Selection = { kind: "room" | "part" | "furniture"; id: string } | null;
type Drag =
  | { kind: "room"; id: string; start: [number, number]; origin: EditorDoc; moved: boolean }
  | { kind: "part"; id: string; start: [number, number]; origin: EditorDoc; moved: boolean }
  | { kind: "furniture"; id: string; start: [number, number]; origin: EditorDoc; moved: boolean }
  | { kind: "resize"; id: string; corner: Corner; origin: EditorDoc; moved: boolean }
  | { kind: "draw"; start: [number, number] };

const EMPTY: EditorDoc = { rooms: [], parts: [], feederRunM: 10 };
const MODEL_ICON: Record<string, string> = {
  panel: "▣",
  fixture: "◉",
  downlight: "•",
  sconce: "◐",
  fan: "✢",
  exhaust: "▦",
  emergency: "⚠",
  detector: "◎",
  plate: "⊡",
  aircon: "❄",
  heater: "♨",
  box: "▤",
  camera: "◘",
};
const PART_GROUPS = ["Panel", "Lighting", "Switches", "Power", "Appliances", "Low voltage"] as const;
const SNAPS = [0.1, 0.25, 0.5, 1];
const DND = "application/x-wirelab";

const HINT: Record<string, string> = {
  select:
    "Click to select · drag to move · drag the white corners to resize · drag empty space to orbit · Del delete · Ctrl+D duplicate · R rotate",
  room: "Drag on the grid to draw a room.",
  wire: "Click devices in the order the wire should run from the panel. Unclicked devices chain to the nearest one.",
  place: "Click inside a room to place. Wall parts snap to the nearest wall. Esc to stop.",
  preset: "Click on the grid to drop the room. Esc to stop.",
  furn: "Click to place. Doors and windows snap onto the nearest wall. R rotates, Esc to stop.",
  measure: "Click a start point, then an end point. The distance shows on screen. Esc clears.",
  draft: "Drafting: type a command (L, PL, W, REC, C, A, T, DLI, M, CO, RO, MI, SC, O, E, DI, HELP). Drag left→right = window, right→left = crossing. F3 OSNAP · F8 ORTHO · F9 SNAP.",
};

/** Drop anything an older or hand-edited file has that this version doesn't know. */
function sanitize(d: Partial<EditorDoc>): EditorDoc {
  return {
    ...d,
    feederRunM: typeof d.feederRunM === "number" ? d.feederRunM : 10,
    rooms: Array.isArray(d.rooms) ? d.rooms.filter((r) => r && typeof r.x === "number" && r.w > 0 && r.d > 0) : [],
    parts: Array.isArray(d.parts) ? d.parts.filter((p) => p && PART_INFO[p.type] && Array.isArray(p.position)) : [],
    furniture: Array.isArray(d.furniture) ? d.furniture.filter((f) => f && FURNITURE[f.type]) : [],
  } as EditorDoc;
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

function Group({
  title,
  count,
  open,
  toggle,
  children,
}: {
  title: string;
  count: number;
  open: Set<string>;
  toggle: (g: string) => void;
  children: React.ReactNode;
}) {
  const isOpen = open.has(title);
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => toggle(title)}
        className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-200"
        aria-expanded={isOpen}
      >
        <span>
          {isOpen ? "▾" : "▸"} {title}
        </span>
        <span className="font-mono text-slate-600">{count}</span>
      </button>
      {isOpen && children}
    </div>
  );
}

export default function Editor() {
  const [doc, setDocState] = useState<EditorDoc>(EMPTY);
  const [dragDoc, setDragDoc] = useState<EditorDoc | null>(null);
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
  const [viewKind, setViewKind] = useState<"3d" | "floor" | "circuit">("3d");
  const [measure, setMeasure] = useState<{ a: [number, number]; b: [number, number]; live: boolean } | null>(null);
  const planApi = useRef<PlanApi | null>(null);
  const [cad, setCad] = useState<CadState>(initial());
  const [cadSel, setCadSel] = useState<string[]>([]);
  const [cadLog, setCadLog] = useState<string[]>([
    "WireLab drafting. Type a command and press Enter or Space — L, PL, W, REC, C, A, T, DLI, DI, M, CO, RO, MI, SC, O, E — or HELP.",
  ]);
  const [cadCursor, setCadCursor] = useState<{ raw: Pt; pt: Pt; snap: SnapKind | null } | null>(null);
  const [toggles, setToggles] = useState({ osnap: true, ortho: false, snap: false });
  const [wallMat, setWallMat] = useState("chb100");
  const [cmdText, setCmdText] = useState("");
  const cmdRef = useRef<HTMLInputElement>(null);
  const [lighting, setLighting] = useState<"day" | "night">("day");
  const [cutaway, setCutaway] = useState(true);
  const [showWiring, setShowWiring] = useState(false);
  const [custom, setCustom] = useState({ w: 3.5, d: 3, kind: "bedroom" as RoomKind });
  const [query, setQuery] = useState("");
  const [pdfOpen, setPdfOpen] = useState(false);
  const [libView, setLibView] = useState<"slots" | "list">("slots");
  const preview3d = useItemPreview();
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(["Rooms", "⚡ Lighting", "⚡ Power"]));
  const toggleGroup = (g: string) =>
    setOpenGroups((o) => {
      const n = new Set(o);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });
  const match = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  const api = useRef<SceneApi | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  const [meta, setMeta] = useState<store.ProjectMeta | null>(null);
  const [projects, setProjects] = useState<store.ProjectMeta[]>([]);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const kv = (): store.KV | null => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  };
  const refreshList = () => {
    const k = kv();
    if (k) setProjects(store.listProjects(k));
  };
  useEffect(() => {
    // Restore the last project after mount (localStorage is browser-only).
    const k = kv();
    if (k) {
      try {
        const b = store.bootProject(k, EMPTY);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDocState(sanitize(b.doc));
        setMeta(b.meta);
        setProjects(store.listProjects(k));
      } catch {
        setSaveState("error");
      }
    }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current || !meta) return;
    setSaveState("saving");
    const t = window.setTimeout(() => {
      const k = kv();
      try {
        if (!k) throw new Error();
        store.saveProject(k, meta.id, doc);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [doc, meta]);
  const switchTo = (m: store.ProjectMeta, d: EditorDoc, msg: string) => {
    setMeta(m);
    setDocState(sanitize(d));
    setPast([]);
    setFuture([]);
    setSelection(null);
    setCad(initial());
    setCadSel([]);
    refreshList();
    say(msg);
  };
  const openProject = (id: string) => {
    const k = kv();
    const d = k && store.loadProject<EditorDoc>(k, id);
    const m = projects.find((p) => p.id === id);
    if (!k || !d || !m) return say("That project couldn't be opened", true);
    store.setCurrent(k, id);
    switchTo(m, d, `Opened ${m.name}`);
    setProjectsOpen(false);
  };
  const newProject = (template: "blank" | "golden") => {
    const k = kv();
    if (!k) return say("This browser blocks storage, so projects can't be saved", true);
    const d = template === "golden" ? goldenEditorDoc() : EMPTY;
    const m = store.createProject(k, template === "golden" ? "Sample house" : "Untitled project", d);
    switchTo(m, d, template === "golden" ? "New project from the sample house" : "New blank project");
    setProjectsOpen(false);
  };

  const shown = dragDoc ?? doc;
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
  const draft: Draft = shown.draft ?? { entities: [], layers: DEFAULT_LAYERS, current: "0" };
  const cadActive = viewKind !== "3d" && (tool === "draft" || cad.cmd !== null);
  const blocked = new Set(draft.layers.filter((l) => l.locked || !l.on).map((l) => l.name));
  const pickable = draft.entities.filter((e) => !blocked.has(e.layer));
  const snapCands = useMemo(() => {
    const visible = draft.entities.filter((e) => draft.layers.find((l) => l.name === e.layer)?.on !== false);
    const roomPts = shown.rooms.flatMap((r) => [
      { pt: [r.x, r.z] as Pt, kind: "endpoint" as const },
      { pt: [r.x + r.w, r.z] as Pt, kind: "endpoint" as const },
      { pt: [r.x, r.z + r.d] as Pt, kind: "endpoint" as const },
      { pt: [r.x + r.w, r.z + r.d] as Pt, kind: "endpoint" as const },
      { pt: [r.x + r.w / 2, r.z] as Pt, kind: "midpoint" as const },
      { pt: [r.x + r.w / 2, r.z + r.d] as Pt, kind: "midpoint" as const },
      { pt: [r.x, r.z + r.d / 2] as Pt, kind: "midpoint" as const },
      { pt: [r.x + r.w, r.z + r.d / 2] as Pt, kind: "midpoint" as const },
    ]);
    return [...snapCandidates(visible), ...roomPts];
  }, [draft.entities, draft.layers, shown.rooms]);
  const cadCtx = (): CadCtx => {
    const m = WALL_MATERIALS.find((x) => x.id === wallMat) ?? WALL_MATERIALS[0];
    return {
      entities: draft.entities,
      selection: cadSel,
      layer: draft.current,
      wall: { t: m.thickness, mat: m.id },
      textHeight: 0.25,
      cursor: cadCursor?.pt ?? null,
    };
  };
  const cadPreview = useMemo(
    () => (cadActive ? cadPreviewOf(cad, cadCursor?.pt ?? null, cadCtx()) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cad, cadCursor, cadActive, draft.entities, wallMat],
  );
  const circuits = useMemo(
    () =>
      built.ok && panel ? sceneCircuits(panel.position, built.project.circuits, shown.rooms, tags, ceiling) : [],
    [built, panel, shown.rooms, tags, ceiling],
  );
  const extraChecks = useMemo(() => designChecks(doc), [doc]);
  const bom = useMemo(() => materials(doc), [doc]);
  const est = useMemo(() => estimate(doc), [doc]);
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
  const onFloorMove = (x: number, z: number) => {
    setHover([x, z]);
    if (tool === "measure" && measure?.live) setMeasure({ ...measure, b: [snap(x, 0.05), snap(z, 0.05)] });
  };
  const onFloorUp = (x: number, z: number) => {
    if (tool === "measure") {
      const pt: [number, number] = [snap(x, 0.05), snap(z, 0.05)];
      if (!measure || !measure.live) setMeasure({ a: pt, b: pt, live: true });
      else {
        setMeasure({ ...measure, b: pt, live: false });
        say(`Measured ${Math.hypot(pt[0] - measure.a[0], pt[1] - measure.a[1]).toFixed(2)} m`);
      }
      return;
    }
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
      setDragDoc(r.doc);
      if (!drag.moved) setDrag({ ...drag, moved: true });
    }
  };
  const onDragEnd = () => {
    if (drag && drag.kind !== "draw" && dragDoc && drag.moved) {
      commit(dragDoc, drag.origin);
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
    setDragDoc(null);
    if (drag?.kind !== "draw") setDrag(null);
  };

  // ----- drafting (AutoCAD-style) -----
  const log = (...lines: string[]) => setCadLog((l) => [...l, ...lines].slice(-60));
  const resolve = (raw: Pt, k: number) => {
    const last = cad.pts.at(-1) ?? null;
    if (toggles.osnap) {
      const hit = findSnap(raw, [], 12 / k, snapCands);
      if (hit) return { raw, pt: hit.pt, snap: hit.kind };
    }
    let pt = raw;
    if (toggles.snap) pt = [snap(pt[0], step), snap(pt[1], step)];
    if (toggles.ortho && last && cad.cmd) pt = cadOrtho(last, pt);
    return { raw, pt, snap: null };
  };
  const applyCad = (r: CadResult) => {
    if (r.add || r.remove || r.replace) {
      const gone = new Set(r.remove ?? []);
      const repl = new Map((r.replace ?? []).map((e) => [e.id, e]));
      const entities = [...draft.entities.filter((e) => !gone.has(e.id)).map((e) => repl.get(e.id) ?? e), ...(r.add ?? [])];
      commit({ ...doc, draft: { ...draft, entities } });
      if (r.remove) setCadSel((sel) => sel.filter((id) => !gone.has(id)));
    }
    if (r.message) log(...r.message.split("\n"));
    if (!r.state.cmd && cad.cmd) setCadSel([]);
    setCad(r.state);
  };
  const cadText = (raw: string) => {
    const t = raw.trim();
    const up = t.toUpperCase();
    log(`${cad.prompt} ${t}`);
    if (!cad.cmd) {
      if (up === "U" || up === "UNDO") return undo();
      if (up === "REDO") return redo();
      if (up === "Z" || up === "ZOOM" || up === "ZE") return planApi.current?.fit();
      if (up === "OSNAP" || up === "OS") return setToggles((x) => ({ ...x, osnap: !x.osnap }));
      if (up === "ORTHO") return setToggles((x) => ({ ...x, ortho: !x.ortho }));
      if (up === "SNAP" || up === "SN") return setToggles((x) => ({ ...x, snap: !x.snap }));
      if (up === "LA" || up === "LAYER") return say("Layers are in the panel on the right");
    }
    applyCad(t === "" ? cadRun(cad, { enter: true }, cadCtx()) : cadRun(cad, { text: raw }, cadCtx()));
  };
  const onCadHover = (raw: Pt, k: number) => setCadCursor(resolve(raw, k));
  const onCadClick = (raw: Pt, k: number, shift: boolean) => {
    const c = resolve(raw, k);
    if (cad.cmd && cad.step !== -1) return applyCad(cadRun(cad, { point: c.pt }, cadCtx()));
    const hit = pickable.find((e) => hitTest(e, raw, 6 / k));
    if (hit) setCadSel((sel) => (shift ? sel.filter((id) => id !== hit.id) : sel.includes(hit.id) ? sel : [...sel, hit.id]));
    else if (!shift && !cad.cmd) setCadSel([]);
  };
  const onCadWindow = (a: Pt, b: Pt, crossing: boolean, shift: boolean) => {
    const ids = selectInRect(pickable, a, b, crossing);
    setCadSel((sel) => (shift ? sel.filter((id) => !ids.includes(id)) : [...new Set([...sel, ...ids])]));
  };
  const setDraft = (patch: Partial<Draft>) => commit({ ...doc, draft: { ...draft, ...patch } });

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
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (viewKind !== "3d" && ["F3", "F8", "F9"].includes(e.key)) {
        e.preventDefault();
        const key = { F3: "osnap", F8: "ortho", F9: "snap" }[e.key as "F3"] as "osnap";
        setToggles((x) => ({ ...x, [key]: !x[key] }));
        return;
      }
      if (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
      if (viewKind !== "3d" && (tool === "draft" || cad.cmd)) {
        if (e.key === "Escape") {
          setCad(initial());
          setCadSel([]);
          log("*Cancel*");
          return;
        }
        if ((e.key === "Delete" || e.key === "Backspace") && cadSel.length) {
          e.preventDefault();
          applyCad(cadRun(initial(), { text: "E" }, cadCtx()));
          return;
        }
        if (!mod && (e.key.length === 1 || e.key === "Enter")) {
          e.preventDefault();
          cmdRef.current?.focus();
          if (e.key === "Enter" || e.key === " ") cadText("");
          else setCmdText((x) => x + e.key);
          return;
        }
      }
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
        setMeasure(null);
      } else if (k === "r" && !mod) rotate();
      else if (k === "m" && !mod) setTool("measure");
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]!;
        nudge(d[0], d[1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, duplicate, del, rotate, nudge, selection, clipboard, viewKind, tool, cad, cadSel, draft]);

  // ----- drag & drop from the library -----
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData(DND);
    if (!raw) return;
    const item = JSON.parse(raw) as { kind: "preset" | "part" | "furniture" | "material"; id: string };
    const at = viewKind === "3d" ? api.current?.floorAt(e.clientX, e.clientY) : planApi.current?.floorAt(e.clientX, e.clientY);
    if (!at) return;
    if (item.kind === "material") {
      const [kind, id] = item.id.split(":");
      const room = roomAt(doc.rooms, at[0], at[1]);
      if (room) setSelection({ kind: "room", id: room.id });
      applyMaterial({ kind, id } as InvItem, room?.id);
    } else if (item.kind === "furniture") {
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

  const fileName = (meta?.name ?? "wirelab").replace(/[\\/:*?"<>|]/g, "").trim() || "wirelab";
  const exportJson = () => {
    const blob = new Blob([store.toFile({ name: meta?.name ?? "WireLab project" }, doc)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName}${store.FILE_EXT}`;
    a.click();
    URL.revokeObjectURL(a.href);
    say(`Saved ${a.download}`);
  };
  const importJson = async (file: File) => {
    try {
      const f = store.fromFile(await file.text(), file.name);
      const d = sanitize(f.doc as Partial<EditorDoc>);
      const k = kv();
      if (!k) {
        commit(d);
        return say(`Loaded ${file.name} (not saved: storage blocked)`, true);
      }
      const m = store.createProject(k, f.name, d);
      switchTo(m, d, `Opened ${file.name} as a new project`);
      setProjectsOpen(false);
    } catch {
      say("That file isn't a WireLab project", true);
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
  const partTile = (t: EditorPartType) => (
    <button
      key={`p-${t}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData(DND, JSON.stringify({ kind: "part", id: t }))}
      onClick={() => setTool(`place:${t}`)}
      className={tile(tool === `place:${t}`)}
      title={`${PART_INFO[t].label} · ${PART_INFO[t].va ? `${PART_INFO[t].va} VA` : "no load"} · ${PART_INFO[t].circuit} circuit`}
    >
      <span className="w-4 text-center text-sm">{MODEL_ICON[PART_INFO[t].model] ?? "•"}</span>
      {PART_INFO[t].label}
    </button>
  );
  const furnTile = (t: FurnitureType) => (
    <button
      key={`f-${t}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData(DND, JSON.stringify({ kind: "furniture", id: t }))}
      onClick={() => setTool(`furn:${t}`)}
      className={tile(tool === `furn:${t}`)}
      title={`${FURNITURE[t].label} · ${FURNITURE[t].w} × ${FURNITURE[t].d} × ${FURNITURE[t].h} m`}
    >
      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: FURNITURE[t].color }} />
      {FURNITURE[t].label}
    </button>
  );
  const applyMaterial = (item: InvItem, roomId: string | undefined) => {
    const room = shown.rooms.find((r) => r.id === roomId);
    if (!room) return say("Select a room first, then click a material — or drag the material onto a room", true);
    if (item.kind === "wall") commit(setRoomMaterials(doc, room.id, { wallMat: item.id }));
    else if (item.kind === "ceiling") commit(setRoomMaterials(doc, room.id, { ceilingMat: item.id }));
    else if (item.kind === "floor")
      commit(setFinish(doc, room.id, { floor: { kind: item.id, color: FLOOR_MATERIALS.find((f) => f.id === item.id)!.color } }));
    else return;
    say(`${room.name}: ${itemLabel(item)}`);
  };
  const isMaterial = (i: InvItem) => i.kind === "wall" || i.kind === "floor" || i.kind === "ceiling";
  const slotActive = (i: InvItem) =>
    i.kind === "part"
      ? tool === `place:${i.id}`
      : i.kind === "furniture"
        ? tool === `furn:${i.id}`
        : !!selRoom &&
          ((i.kind === "wall" && (selRoom.wallMat ?? "chb100") === i.id) ||
            (i.kind === "ceiling" && (selRoom.ceilingMat ?? "gypsum") === i.id) ||
            (i.kind === "floor" && selRoom.floor?.kind === i.id));
  const slotPick = (i: InvItem) =>
    i.kind === "part" ? setTool(`place:${i.id}`) : i.kind === "furniture" ? setTool(`furn:${i.id}`) : applyMaterial(i, selRoom?.id);
  const slotDrag = (i: InvItem) =>
    JSON.stringify(isMaterial(i) ? { kind: "material", id: `${i.kind}:${i.id}` } : { kind: i.kind, id: i.id });
  const slots = (items: InvItem[]) => (
    <SlotGrid items={items} isActive={slotActive} onPick={slotPick} dragData={slotDrag} bind={preview3d.bind} />
  );
  const MATERIAL_GROUPS: [string, InvItem[]][] = [
    ["🧱 Wall systems", WALL_MATERIALS.map((m) => ({ kind: "wall", id: m.id }))],
    ["▦ Floor finishes", FLOOR_MATERIALS.map((m) => ({ kind: "floor", id: m.id }))],
    ["▭ Ceilings", CEILING_MATERIALS.map((m) => ({ kind: "ceiling", id: m.id }))],
  ];
  const hintKey = tool.startsWith("place:")
    ? "place"
    : tool.startsWith("preset:")
      ? "preset"
      : tool.startsWith("furn:")
        ? "furn"
        : tool;
  const selLabel = selRoom
    ? selRoom.name
    : selFurn
      ? FURNITURE[selFurn.type]?.label
      : selPart
        ? PART_INFO[selPart.type].label
        : null;
  const selectionBar = selLabel ? (
    <div className="flex items-center gap-1 rounded-lg border border-amber-400/70 bg-slate-950/95 px-1.5 py-1 text-[11px] text-slate-200 shadow-lg">
      <span className="max-w-32 truncate px-1 font-semibold text-amber-300">{selLabel}</span>
      {!selPart && (
        <button onClick={rotate} className="rounded px-1.5 py-0.5 hover:bg-slate-800" title="Rotate 90° (R)">
          ⟳ Rotate
        </button>
      )}
      {selPart?.type !== "panel" && (
        <button onClick={() => duplicate()} className="rounded px-1.5 py-0.5 hover:bg-slate-800" title="Duplicate (Ctrl+D)">
          ⧉ Copy
        </button>
      )}
      {selPart && HEIGHT_RANGE[selPart.type] && (
        <>
          <button onClick={() => apply(setPartHeight(doc, selPart.id, Math.round((selPart.position[1] - 0.1) * 100) / 100))} className="rounded px-1.5 py-0.5 hover:bg-slate-800" title="Lower 10 cm">
            ↓
          </button>
          <span className="font-mono text-slate-400">{selPart.position[1].toFixed(2)} m</span>
          <button onClick={() => apply(setPartHeight(doc, selPart.id, Math.round((selPart.position[1] + 0.1) * 100) / 100))} className="rounded px-1.5 py-0.5 hover:bg-slate-800" title="Raise 10 cm">
            ↑
          </button>
        </>
      )}
      {selFurn && (
        <span className="font-mono text-slate-400">
          {selFurn.w.toFixed(2)}×{selFurn.d.toFixed(2)}×{selFurn.h.toFixed(2)}
        </span>
      )}
      {selRoom && (
        <span className="font-mono text-slate-400">
          {selRoom.w.toFixed(2)}×{selRoom.d.toFixed(2)} m
        </span>
      )}
      <button onClick={del} className="rounded px-1.5 py-0.5 text-red-300 hover:bg-red-500/20" title="Delete (Del)">
        ✕
      </button>
      <button onClick={() => setSelection(null)} className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-800" title="Deselect (Esc)">
        ○
      </button>
    </div>
  ) : null;
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
        {viewKind !== "3d" ? (
          <PlanView
            doc={shown}
            mode={viewKind}
            circuits={circuits}
            schedule={schedule}
            panel={panel}
            loose={built.ok ? [] : shown.parts.filter((q) => q.type !== "panel").map((q) => deviceFor(q, shown.rooms))}
            selection={selection}
            dragging={!!drag && drag.kind !== "draw"}
            panOnEmpty={tool === "select" || tool === "wire"}
            preview={preview}
            ghost={ghost}
            measure={measure}
            title={meta?.name ?? "WireLab project"}
            toolbar={selectionBar}
            apiRef={planApi}
            onRoomDown={onRoomDown}
            onPartDown={onPartDown}
            onFurnitureDown={onFurnitureDown}
            onHandleDown={onHandleDown}
            onFloorDown={onFloorDown}
            onFloorMove={onFloorMove}
            onFloorUp={onFloorUp}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            cad={{
              active: cadActive,
              draft,
              selection: cadSel,
              preview: cadPreview,
              cursor: cadCursor,
              last: cad.cmd ? (cad.pts.at(-1) ?? null) : null,
              onHover: onCadHover,
              onClick: onCadClick,
              onWindow: onCadWindow,
            }}
          />
        ) : (
        <ErrorBoundary label="The 3D view" onReset={() => setViewKind("3d")}>
        <HouseScene
          measure={measure}
          draft={draft.entities.filter((e) => draft.layers.find((l) => l.name === e.layer)?.on !== false)}
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
        </ErrorBoundary>
        )}
        {viewKind === "3d" && selectionBar && (
          <div className="absolute left-1/2 top-24 z-20 -translate-x-1/2">{selectionBar}</div>
        )}

        {/* Toolbar */}
        <div className="absolute left-3 right-3 top-3 flex flex-wrap items-center gap-1.5">
          {(
            [
              ["select", "↖ Select"],
              ["room", "▭ Draw room"],
              ["wire", "〰 Wire"],
              ["measure", "📏 Measure"],
              ["draft", "✏ Draft"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => {
                setTool(t);
                if (t === "draft" && viewKind === "3d") setViewKind("floor");
              }}
              className={`${btn(tool === t)} bg-slate-900/90`}
            >
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
          <div className="ml-auto flex overflow-hidden rounded-md border border-sky-400/60 text-[11px]">
            {(
              [
                ["3d", "◆ 3D"],
                ["floor", "▦ Floor plan"],
                ["circuit", "⚡ Circuit plan"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setViewKind(v)}
                className={`px-2.5 py-1 ${viewKind === v ? "bg-sky-400 text-slate-900" : "bg-slate-900/90 text-slate-300"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {viewKind === "3d" ? (
            <>
              <div className="flex overflow-hidden rounded-md border border-amber-400/60 text-[11px]">
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
            </>
          ) : (
            <button onClick={() => planApi.current?.fit()} className={`${btn(false)} bg-slate-900/90`}>
              ⤢ Fit sheet
            </button>
          )}
          <button onClick={() => setPdfOpen(true)} className={`${btn(false)} bg-slate-900/90`} title="Export plans, schedules and 3D view to PDF">
            ⎙ PDF
          </button>
        </div>
        {projectsOpen && (
          <ProjectsDialog
            list={projects}
            current={meta?.id ?? null}
            onOpen={openProject}
            onNew={newProject}
            onRename={(id, name) => {
              const k = kv();
              if (!k) return;
              store.renameProject(k, id, name);
              if (meta?.id === id && name.trim()) setMeta({ ...meta, name: name.trim() });
              refreshList();
            }}
            onDuplicate={(id) => {
              const k = kv();
              const m = k && store.duplicateProject(k, id);
              if (m && k) switchTo(m, store.loadProject<EditorDoc>(k, m.id)!, `Duplicated as ${m.name}`);
            }}
            onDelete={(id) => {
              const k = kv();
              if (!k) return;
              store.deleteProject(k, id);
              if (meta?.id === id) {
                const b = store.bootProject(k, EMPTY);
                switchTo(b.meta, b.doc, `Deleted. Opened ${b.meta.name}`);
              } else refreshList();
            }}
            onImport={() => fileRef.current?.click()}
            onClose={() => setProjectsOpen(false)}
          />
        )}
        {pdfOpen && (
          <PdfDialog
            src={{
              doc: shown,
              draft,
              circuits,
              schedule,
              panel,
              loose: built.ok ? [] : shown.parts.filter((q) => q.type !== "panel").map((q) => deviceFor(q, shown.rooms)),
              title: meta?.name ?? "WireLab project",
              bom,
              est,
              capture3d: viewKind === "3d" ? () => api.current?.capture() ?? null : null,
            }}
            onClose={() => setPdfOpen(false)}
            onDone={(m, bad) => say(m, bad)}
          />
        )}

        {viewKind === "3d" && mode === "render" && (
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
        <div className={`absolute bottom-14 left-3 ${viewKind === "3d" ? "top-24" : "top-14"} flex w-48 flex-col gap-2 overflow-y-auto pr-1`}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search library…"
            className="sticky top-0 z-10 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500"
          />
          <div className="flex overflow-hidden rounded border border-slate-700 text-[10px]">
            {(
              [
                ["slots", "▦ Inventory"],
                ["list", "☰ List"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setLibView(v)}
                className={`flex-1 px-2 py-0.5 ${libView === v ? "bg-amber-400/20 text-amber-200" : "bg-slate-900/90 text-slate-400"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {query.trim() ? (
            <div className="flex flex-col gap-1">
              {[
                ...ROOM_PRESETS.filter((p) => match(p.label)).map((p) => (
                  <button
                    key={`r-${p.id}`}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData(DND, JSON.stringify({ kind: "preset", id: p.id }))}
                    onClick={() => setTool(`preset:${p.id}`)}
                    className={tile(tool === `preset:${p.id}`)}
                  >
                    ▭ {p.label}
                  </button>
                )),
                ...PART_TYPES.filter((t) => match(PART_INFO[t].label) || match(PART_INFO[t].group)).map((t) => partTile(t)),
                ...Object.keys(FURNITURE)
                  .filter((t) => match(FURNITURE[t].label) || match(FURNITURE[t].group))
                  .map((t) => furnTile(t)),
              ]}
              <p className="text-[10px] text-slate-500">Showing matches for “{query}”.</p>
            </div>
          ) : (
            <>
              <Group title="Rooms" open={openGroups} toggle={toggleGroup} count={ROOM_PRESETS.length + 1}>
                {ROOM_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData(DND, JSON.stringify({ kind: "preset", id: p.id }))}
                    onClick={() => setTool(`preset:${p.id}`)}
                    className={tile(tool === `preset:${p.id}`)}
                  >
                    <span className="inline-block shrink-0 border border-current" style={{ width: p.w * 5, height: p.d * 5 }} />
                    {p.label}
                  </button>
                ))}
                <div className="flex flex-col gap-1 rounded-md border border-slate-700 bg-slate-900/90 p-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Custom size</p>
                  <div className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                    <input
                      type="number"
                      min={1}
                      max={30}
                      step={0.5}
                      value={custom.w}
                      onChange={(e) => setCustom({ ...custom, w: Math.min(30, Math.max(1, Number(e.target.value) || 1)) })}
                      className="w-14 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-slate-200"
                      aria-label="Custom room width (m)"
                    />
                    ×
                    <input
                      type="number"
                      min={1}
                      max={30}
                      step={0.5}
                      value={custom.d}
                      onChange={(e) => setCustom({ ...custom, d: Math.min(30, Math.max(1, Number(e.target.value) || 1)) })}
                      className="w-14 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-slate-200"
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
              </Group>
              {PART_GROUPS.map((g) => {
                const items = PART_TYPES.filter((t) => PART_INFO[t].group === g);
                return (
                  <Group key={g} title={`⚡ ${g}`} open={openGroups} toggle={toggleGroup} count={items.length}>
                    {libView === "slots" ? slots(items.map((id) => ({ kind: "part", id }))) : items.map((t) => partTile(t))}
                  </Group>
                );
              })}
              {FURNITURE_GROUPS.map((g) => {
                const items = Object.keys(FURNITURE).filter((t) => FURNITURE[t].group === g);
                return (
                  <Group key={g} title={g} open={openGroups} toggle={toggleGroup} count={items.length}>
                    {libView === "slots" ? slots(items.map((id) => ({ kind: "furniture", id }))) : items.map((t) => furnTile(t))}
                  </Group>
                );
              })}
              {MATERIAL_GROUPS.map(([g, items]) => (
                <Group key={g} title={g} open={openGroups} toggle={toggleGroup} count={items.length}>
                  {slots(items)}
                </Group>
              ))}
            </>
          )}
          <p className="text-[10px] leading-snug text-slate-500">
            Drag onto the plane, or click then click to place. People, vehicles and trees can go outside rooms.
          </p>
        </div>

        {viewKind !== "3d" && (
          <div className="absolute bottom-11 left-56 z-10 w-[min(560px,calc(100%-560px))] flex flex-col overflow-hidden rounded-md border border-slate-700 bg-slate-950/95 font-mono text-[11px] text-slate-300 shadow-lg">
            <div className="max-h-20 overflow-y-auto px-2 py-1 leading-snug text-slate-400">
              {cadLog.slice(-6).map((l, i) => (
                <div key={i} className="whitespace-pre-wrap">
                  {l}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-slate-800 px-2 py-1">
              <span className="min-w-0 truncate text-amber-300" title={cad.prompt}>{cad.prompt}</span>
              <input
                ref={cmdRef}
                value={cmdText}
                onChange={(e) => setCmdText(e.target.value)}
                onFocus={() => tool !== "draft" && setTool("draft")}
                onKeyDown={(e) => {
                  const inText = cad.cmd === "TEXT" && cad.step === 1;
                  if (e.key === "Enter" || (e.key === " " && !inText)) {
                    e.preventDefault();
                    cadText(cmdText);
                    setCmdText("");
                  } else if (e.key === "Escape") {
                    setCad(initial());
                    setCadSel([]);
                    setCmdText("");
                    log("*Cancel*");
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="type a command…"
                className="min-w-[90px] flex-1 bg-transparent text-slate-100 outline-none placeholder:text-slate-600"
                aria-label="Command line"
              />
              {(
                [
                  ["osnap", "OSNAP", "F3"],
                  ["ortho", "ORTHO", "F8"],
                  ["snap", "SNAP", "F9"],
                ] as const
              ).map(([key, label, fk]) => (
                <button
                  key={key}
                  onClick={() => setToggles((x) => ({ ...x, [key]: !x[key] }))}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${toggles[key] ? "bg-sky-500/30 text-sky-200" : "text-slate-500"}`}
                  title={`${label} (${fk})`}
                >
                  {label}
                </button>
              ))}
              {cadCursor && (
                <span className="shrink-0 text-slate-500">
                  {cadCursor.pt[0].toFixed(2)}, {(0 - cadCursor.pt[1]).toFixed(2)}
                </span>
              )}
            </div>
          </div>
        )}
        {viewKind === "3d" && <ViewToggle view={view} setView={setView} />}
        <p
          className={`pointer-events-none absolute bottom-3 left-3 font-mono text-[10px] ${
            viewKind === "3d" ? "right-56 text-slate-400" : "right-72 text-slate-500"
          }`}
        >
          {HINT[hintKey]}
        </p>
        {preview3d.popover}
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

        {viewKind !== "3d" && (
          <div className="rounded-md border border-sky-400/30 bg-sky-400/5 p-3">
            <H2>Drafting · layers</H2>
            <table className="w-full text-[11px]">
              <tbody>
                {draft.layers.map((l) => (
                  <tr key={l.name} className="border-t border-slate-800 first:border-t-0">
                    <td className="py-1">
                      <input
                        type="radio"
                        name="current-layer"
                        checked={draft.current === l.name}
                        onChange={() => setDraft({ current: l.name })}
                        aria-label={`Make ${l.name} current`}
                      />
                    </td>
                    <td>
                      <input
                        type="color"
                        value={l.color}
                        onChange={(e) =>
                          setDraft({ layers: draft.layers.map((q) => (q.name === l.name ? { ...q, color: e.target.value } : q)) })
                        }
                        className="h-4 w-5 cursor-pointer border-0 bg-transparent p-0"
                        aria-label={`${l.name} colour`}
                      />
                    </td>
                    <td className="font-mono text-slate-200">{l.name}</td>
                    <td className="text-right font-mono text-slate-500">{draft.entities.filter((e) => e.layer === l.name).length}</td>
                    <td className="text-right">
                      <button
                        onClick={() => setDraft({ layers: draft.layers.map((q) => (q.name === l.name ? { ...q, on: !q.on } : q)) })}
                        className={l.on ? "text-slate-200" : "text-slate-600"}
                        title={l.on ? "Turn off" : "Turn on"}
                      >
                        {l.on ? "◉" : "○"}
                      </button>
                      <button
                        onClick={() => setDraft({ layers: draft.layers.map((q) => (q.name === l.name ? { ...q, locked: !q.locked } : q)) })}
                        className={`ml-2 ${l.locked ? "text-amber-300" : "text-slate-600"}`}
                        title={l.locked ? "Unlock" : "Lock"}
                      >
                        {l.locked ? "🔒" : "🔓"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              onClick={() => {
                const name = `LAYER-${draft.layers.length}`;
                setDraft({ layers: [...draft.layers, { name, color: "#475569", on: true, locked: false }], current: name });
              }}
              className={`${btn(false)} mt-2`}
            >
              ＋ New layer
            </button>
            <label className="mt-3 flex flex-col gap-0.5 text-[10px] uppercase tracking-wider text-slate-500">
              Wall system for the WALL command
              <select
                value={wallMat}
                onChange={(e) => setWallMat(e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs normal-case tracking-normal text-slate-200"
              >
                {WALL_MATERIALS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} · {Math.round(m.thickness * 1000)} mm
                  </option>
                ))}
              </select>
            </label>
            {cadSel.length > 0 && (
              <div className="mt-3 rounded border border-amber-400/40 p-2 text-[11px]">
                <p className="font-semibold text-amber-300">
                  {cadSel.length} drafted object{cadSel.length > 1 ? "s" : ""} selected
                </p>
                <p className="font-mono text-slate-400">
                  Length {draft.entities.filter((e) => cadSel.includes(e.id)).reduce((sum, e) => sum + cadLength(e), 0).toFixed(3)} m
                  {cadSel.length === 1 &&
                    cadArea(draft.entities.find((e) => e.id === cadSel[0])!) > 0 &&
                    ` · Area ${cadArea(draft.entities.find((e) => e.id === cadSel[0])!).toFixed(3)} m²`}
                </p>
                <label className="mt-1 flex items-center gap-2 text-slate-400">
                  Layer
                  <select
                    onChange={(e) =>
                      setDraft({
                        entities: draft.entities.map((x) => (cadSel.includes(x.id) ? { ...x, layer: e.target.value } : x)),
                      })
                    }
                    value=""
                    className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-slate-200"
                  >
                    <option value="" disabled>
                      move to…
                    </option>
                    {draft.layers.map((l) => (
                      <option key={l.name} value={l.name}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-1 text-slate-500">Type M, CO, RO, MI, SC or E to edit them, or press Delete.</p>
              </div>
            )}
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
                  <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                    Wall system
                    <select
                      value={selRoom.wallMat ?? "chb100"}
                      onChange={(e) => commit(setRoomMaterials(doc, selRoom.id, { wallMat: e.target.value }))}
                      className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs normal-case tracking-normal text-slate-200"
                    >
                      {WALL_MATERIALS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label} · {Math.round(m.thickness * 1000)} mm
                        </option>
                      ))}
                    </select>
                    <span className="normal-case tracking-normal text-slate-500">{WALL_OF(selRoom).note}</span>
                  </label>
                  <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                    Ceiling
                    <select
                      value={selRoom.ceilingMat ?? "gypsum"}
                      onChange={(e) => commit(setRoomMaterials(doc, selRoom.id, { ceilingMat: e.target.value }))}
                      className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs normal-case tracking-normal text-slate-200"
                    >
                      {CEILING_MATERIALS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
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
              <span className="text-slate-500"> · {shown.rooms.find((r) => r.id === selFurn.roomId)?.name ?? "Outdoors"}</span>
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
              Any size: W/D {SIZE_LIMITS.w.join("–")} m · H {SIZE_LIMITS.h.join("–")} m · facing {selFurn.rot}°
              {selFurn.roomId === "" && " · outdoors"}
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
          <div className="mb-1 flex items-center gap-2">
            <input
              key={meta?.id}
              defaultValue={meta?.name ?? ""}
              onBlur={(e) => {
                const k = kv();
                if (!meta || !k || !e.target.value.trim() || e.target.value === meta.name) return;
                store.renameProject(k, meta.id, e.target.value);
                setMeta({ ...meta, name: e.target.value.trim() });
                refreshList();
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-slate-100 hover:border-slate-700 focus:border-slate-600 focus:bg-slate-900"
              aria-label="Project name"
            />
            <span
              className={`shrink-0 font-mono text-[10px] ${saveState === "error" ? "text-red-400" : "text-slate-500"}`}
              title={saveState === "error" ? "Browser storage is full or blocked — use Save file to keep your work" : "Saved in this browser"}
            >
              {saveState === "saved" ? "✓ saved" : saveState === "saving" ? "saving…" : "⚠ not saved"}
            </span>
          </div>
          <p className="font-mono text-xs text-slate-400">
            {doc.rooms.length} rooms · {doc.rooms.reduce((s, r) => s + r.w * r.d, 0).toFixed(1)} m² ·{" "}
            {doc.parts.length} parts
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button onClick={() => (refreshList(), setProjectsOpen(true))} className={btn(false)}>
              📁 Projects
            </button>
            <button onClick={() => newProject("blank")} className={btn(false)}>
              New
            </button>
            <button
              onClick={() => {
                commit(goldenEditorDoc());
                setSelection(null);
                say("Loaded the sample house into this project (Undo to go back)");
              }}
              className={btn(false)}
            >
              Load sample house
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
              ⤓ Save file
            </button>
            <button onClick={() => setPdfOpen(true)} className={btn(false)}>
              Export PDF
            </button>
            <button onClick={() => fileRef.current?.click()} className={btn(false)}>
              ⤒ Open file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".wirelab,.json,application/json"
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
              <EstimateView est={est} />
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
