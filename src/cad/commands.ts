/**
 * AutoCAD-style command engine. Pure: takes the current state plus one input
 * (a picked point, typed text, or Enter) and returns the next state and the edits to make.
 */
import {
  angleOf,
  arc3,
  dist,
  hitTest,
  mirror,
  move,
  offset,
  parsePoint,
  rotate,
  scale,
  type Entity,
  type Pt,
} from "./geometry";

export interface CadState {
  cmd: string | null;
  step: number;
  pts: Pt[];
  /** Entities the command works on (snapshot of the selection). */
  sel: string[];
  /** Command-specific values (distance, ids drawn so far, picked entity…). */
  data: { ids?: string[]; d?: number; target?: string };
  prompt: string;
  last?: string;
}

export interface CadCtx {
  entities: Entity[];
  selection: string[];
  layer: string;
  wall: { t: number; mat: string };
  textHeight: number;
  cursor?: Pt | null;
}

export interface CadInput {
  point?: Pt;
  text?: string;
  enter?: boolean;
}

export interface CadResult {
  state: CadState;
  add?: Entity[];
  remove?: string[];
  replace?: Entity[];
  message?: string;
  /** The UI should let the user pick objects (selection phase). */
  selecting?: boolean;
}

export const ALIASES: Record<string, string> = {
  L: "LINE", LINE: "LINE",
  PL: "PLINE", PLINE: "PLINE",
  REC: "RECTANG", RECTANG: "RECTANG", RECTANGLE: "RECTANG",
  C: "CIRCLE", CIRCLE: "CIRCLE",
  A: "ARC", ARC: "ARC",
  W: "WALL", WALL: "WALL",
  T: "TEXT", DT: "TEXT", TEXT: "TEXT", MT: "TEXT", MTEXT: "TEXT",
  DLI: "DIMLINEAR", DIM: "DIMLINEAR", DIMLINEAR: "DIMLINEAR", DAL: "DIMLINEAR",
  DI: "DIST", DIST: "DIST",
  M: "MOVE", MOVE: "MOVE",
  CO: "COPY", CP: "COPY", COPY: "COPY",
  RO: "ROTATE", ROTATE: "ROTATE",
  MI: "MIRROR", MIRROR: "MIRROR",
  SC: "SCALE", SCALE: "SCALE",
  O: "OFFSET", OFFSET: "OFFSET",
  E: "ERASE", ERASE: "ERASE", DEL: "ERASE",
  HELP: "HELP", "?": "HELP",
};

export const COMMAND_HELP: [string, string][] = [
  ["LINE (L)", "Draw line segments; C closes, U undoes the last"],
  ["PLINE (PL)", "Polyline; Enter finishes, C closes"],
  ["WALL (W)", "Walls with the current wall system"],
  ["RECTANG (REC)", "Rectangle from two corners"],
  ["CIRCLE (C)", "Centre, then radius point or value"],
  ["ARC (A)", "Arc through three points"],
  ["TEXT (T)", "Place text"],
  ["DIMLINEAR (DLI)", "Dimension two points, then its offset"],
  ["DIST (DI)", "Distance and angle between two points"],
  ["MOVE (M) / COPY (CO)", "Base point, then destination"],
  ["ROTATE (RO)", "Base point, then angle in degrees"],
  ["MIRROR (MI)", "Two points of the mirror line"],
  ["SCALE (SC)", "Base point, then factor"],
  ["OFFSET (O)", "Distance, object, side"],
  ["ERASE (E)", "Delete selected objects"],
];

let n = 0;
const uid = () => `e${Date.now().toString(36)}${(n++).toString(36)}`;

export const initial = (): CadState => ({ cmd: null, step: 0, pts: [], sel: [], data: {}, prompt: "Command:" });

const done = (s: CadState, extra: Partial<CadResult> = {}): CadResult => ({
  state: { ...initial(), last: s.cmd ?? s.last },
  ...extra,
});

const PROMPTS: Record<string, string[]> = {
  LINE: ["LINE Specify first point:", "Specify next point or [Close/Undo]:"],
  WALL: ["WALL Specify start point:", "Specify next point or [Close/Undo]:"],
  PLINE: ["PLINE Specify start point:", "Specify next point or [Close] (Enter to finish):"],
  RECTANG: ["RECTANG Specify first corner:", "Specify other corner or @width,height:"],
  CIRCLE: ["CIRCLE Specify center point:", "Specify radius (value or point):"],
  ARC: ["ARC Specify start point:", "Specify second point:", "Specify end point:"],
  TEXT: ["TEXT Specify insertion point:", "Enter text:"],
  DIMLINEAR: ["DIMLINEAR Specify first point:", "Specify second point:", "Specify dimension line location:"],
  DIST: ["DIST Specify first point:", "Specify second point:"],
  MOVE: ["MOVE Specify base point:", "Specify second point or @dx,dy:"],
  COPY: ["COPY Specify base point:", "Specify second point (Enter to finish):"],
  ROTATE: ["ROTATE Specify base point:", "Specify rotation angle (degrees) or point:"],
  MIRROR: ["MIRROR Specify first point of mirror line:", "Specify second point of mirror line:"],
  SCALE: ["SCALE Specify base point:", "Specify scale factor:"],
  OFFSET: ["OFFSET Specify offset distance:", "Select object to offset (Enter to finish):", "Specify point on side to offset:"],
};
const NEEDS_SELECTION = new Set(["MOVE", "COPY", "ROTATE", "MIRROR", "SCALE", "ERASE"]);

function start(name: string, s: CadState, ctx: CadCtx): CadResult {
  const cmd = ALIASES[name.toUpperCase()];
  if (!cmd) return { state: s, message: `Unknown command "${name}". Type HELP for the list.` };
  if (cmd === "HELP")
    return { state: { ...initial(), last: s.last }, message: COMMAND_HELP.map(([a, b]) => `${a}: ${b}`).join("\n") };
  if (NEEDS_SELECTION.has(cmd)) {
    if (!ctx.selection.length)
      return {
        state: { ...initial(), cmd, step: -1, prompt: `${cmd} Select objects (Enter when done):` },
        selecting: true,
      };
    if (cmd === "ERASE") return done({ ...s, cmd }, { remove: [...ctx.selection], message: `${ctx.selection.length} erased` });
    return { state: { ...initial(), cmd, sel: [...ctx.selection], prompt: PROMPTS[cmd][0] } };
  }
  return { state: { ...initial(), cmd, prompt: PROMPTS[cmd][0] } };
}

const numeric = (t?: string) => (t !== undefined && /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t.trim()) ? Number(t) : null);

export function run(state: CadState, input: CadInput, ctx: CadCtx): CadResult {
  const s = state;
  const text = input.text?.trim();

  // ---- idle: start a command (Enter repeats the last one) ----
  if (!s.cmd) {
    if (text) return start(text, s, ctx);
    if (input.enter && s.last) return start(s.last, s, ctx);
    return { state: s };
  }

  // ---- selection phase for edit commands ----
  if (s.step === -1) {
    if (input.enter || text === "") {
      if (!ctx.selection.length) return done(s, { message: "Nothing selected" });
      if (s.cmd === "ERASE") return done(s, { remove: [...ctx.selection], message: `${ctx.selection.length} erased` });
      return { state: { ...s, step: 0, sel: [...ctx.selection], prompt: PROMPTS[s.cmd][0] } };
    }
    return { state: s, selecting: true };
  }

  const last = s.pts.at(-1) ?? null;
  const upper = text?.toUpperCase();
  // A typed value: point for most prompts, plain text for TEXT content.
  const pt: Pt | null = input.point ?? (text && !(s.cmd === "TEXT" && s.step === 1) ? parsePoint(text, last, ctx.cursor ?? null) : null);
  const ids = s.data.ids ?? [];
  const base = { layer: ctx.layer };
  const sel = () => ctx.entities.filter((e) => s.sel.includes(e.id));

  switch (s.cmd) {
    case "LINE":
    case "WALL": {
      const make = (a: Pt, b: Pt): Entity =>
        s.cmd === "WALL"
          ? { id: uid(), ...base, layer: ctx.layer === "0" ? "A-WALL" : ctx.layer, kind: "wall", a, b, t: ctx.wall.t, mat: ctx.wall.mat }
          : { id: uid(), ...base, kind: "line", a, b };
      if (upper === "C" && s.pts.length >= 3) return done(s, { add: [make(last!, s.pts[0])] });
      if (upper === "U" && ids.length) {
        return {
          state: { ...s, pts: s.pts.slice(0, -1), data: { ids: ids.slice(0, -1) } },
          remove: [ids.at(-1)!],
        };
      }
      if (input.enter || text === "") return done(s);
      if (!pt) return { state: s, message: "Invalid point. Use x,y  @dx,dy  @length<angle  or a distance." };
      if (!last) return { state: { ...s, step: 1, pts: [pt], prompt: PROMPTS[s.cmd][1] } };
      if (dist(last, pt) < 1e-9) return { state: s };
      const e = make(last, pt);
      return { state: { ...s, pts: [...s.pts, pt], data: { ids: [...ids, e.id] } }, add: [e] };
    }
    case "PLINE": {
      if ((upper === "C" && s.pts.length >= 3) || ((input.enter || text === "") && s.pts.length >= 2))
        return done(s, { add: [{ id: uid(), ...base, kind: "pline", pts: s.pts, closed: upper === "C" }] });
      if (input.enter || text === "") return done(s);
      if (!pt) return { state: s, message: "Invalid point" };
      return { state: { ...s, step: 1, pts: [...s.pts, pt], prompt: PROMPTS.PLINE[1] } };
    }
    case "RECTANG": {
      if (input.enter || text === "") return done(s);
      if (!pt) return { state: s, message: "Invalid point" };
      if (!last) return { state: { ...s, step: 1, pts: [pt], prompt: PROMPTS.RECTANG[1] } };
      const [a, b] = [last, pt];
      return done(s, {
        add: [{ id: uid(), ...base, kind: "pline", closed: true, pts: [a, [b[0], a[1]], b, [a[0], b[1]]] }],
      });
    }
    case "CIRCLE": {
      if (input.enter || text === "") return done(s);
      if (!last) {
        if (!pt) return { state: s, message: "Invalid point" };
        return { state: { ...s, step: 1, pts: [pt], prompt: PROMPTS.CIRCLE[1] } };
      }
      const r = numeric(text) ?? (input.point ? dist(last, input.point) : null);
      if (!r || r <= 0) return { state: s, message: "Radius must be positive" };
      return done(s, { add: [{ id: uid(), ...base, kind: "circle", c: last, r }] });
    }
    case "ARC": {
      if (input.enter || text === "") return done(s);
      if (!pt) return { state: s, message: "Invalid point" };
      if (s.pts.length < 2) return { state: { ...s, step: s.pts.length + 1, pts: [...s.pts, pt], prompt: PROMPTS.ARC[s.pts.length + 1] } };
      const a = arc3(s.pts[0], s.pts[1], pt);
      if (!a) return { state: s, message: "Points are in a straight line" };
      return done(s, { add: [{ id: uid(), ...base, kind: "arc", ...a }] });
    }
    case "TEXT": {
      if (s.step === 0) {
        if (input.enter || text === "") return done(s);
        if (!pt) return { state: s, message: "Invalid point" };
        return { state: { ...s, step: 1, pts: [pt], prompt: PROMPTS.TEXT[1] } };
      }
      if (!text) return done(s);
      return done(s, {
        add: [{ id: uid(), layer: ctx.layer === "0" ? "A-ANNO" : ctx.layer, kind: "text", p: s.pts[0], text: input.text!, h: ctx.textHeight }],
      });
    }
    case "DIMLINEAR": {
      if (input.enter || text === "") return done(s);
      if (!pt) return { state: s, message: "Invalid point" };
      if (s.pts.length < 2) return { state: { ...s, step: s.pts.length + 1, pts: [...s.pts, pt], prompt: PROMPTS.DIMLINEAR[s.pts.length + 1] } };
      const [a, b] = s.pts;
      const L = dist(a, b) || 1;
      // Left normal of a→b in CAD sense (Y up) = (−dy, dx); in plan coords (dz, −dx)… expressed directly:
      const nx = (b[1] - a[1]) / L;
      const nz = -(b[0] - a[0]) / L;
      const off = (pt[0] - a[0]) * nx + (pt[1] - a[1]) * nz;
      return done(s, { add: [{ id: uid(), layer: ctx.layer === "0" ? "A-DIMS" : ctx.layer, kind: "dim", a, b, off }] });
    }
    case "DIST": {
      if (input.enter || text === "") return done(s);
      if (!pt) return { state: s, message: "Invalid point" };
      if (!last) return { state: { ...s, step: 1, pts: [pt], prompt: PROMPTS.DIST[1] } };
      const d = dist(last, pt);
      const ang = ((angleOf(last, pt) * 180) / Math.PI + 360) % 360;
      return done(s, {
        message: `Distance = ${d.toFixed(3)} m, Angle = ${ang.toFixed(1)}°, ΔX = ${(pt[0] - last[0]).toFixed(3)}, ΔY = ${(last[1] - pt[1]).toFixed(3)}`,
      });
    }
    case "MOVE":
    case "COPY": {
      if (input.enter || text === "") return done(s);
      if (!pt) return { state: s, message: "Invalid point" };
      if (s.step === 0) return { state: { ...s, step: 1, pts: [pt], prompt: PROMPTS[s.cmd][1] } };
      const dx = pt[0] - s.pts[0][0];
      const dz = pt[1] - s.pts[0][1];
      if (s.cmd === "MOVE") return done(s, { replace: sel().map((e) => move(e, dx, dz)) });
      return { state: s, add: sel().map((e) => ({ ...move(e, dx, dz), id: uid() })) };
    }
    case "ROTATE": {
      if (input.enter || text === "") return done(s);
      if (s.step === 0) {
        if (!pt) return { state: s, message: "Invalid point" };
        return { state: { ...s, step: 1, pts: [pt], prompt: PROMPTS.ROTATE[1] } };
      }
      const deg = numeric(text);
      const ang = deg !== null ? (deg * Math.PI) / 180 : input.point ? angleOf(s.pts[0], input.point) : null;
      if (ang === null) return { state: s, message: "Enter an angle in degrees" };
      return done(s, { replace: sel().map((e) => rotate(e, s.pts[0], ang)) });
    }
    case "SCALE": {
      if (input.enter || text === "") return done(s);
      if (s.step === 0) {
        if (!pt) return { state: s, message: "Invalid point" };
        return { state: { ...s, step: 1, pts: [pt], prompt: PROMPTS.SCALE[1] } };
      }
      const k = numeric(text);
      if (!k || k <= 0) return { state: s, message: "Scale factor must be positive" };
      return done(s, { replace: sel().map((e) => scale(e, s.pts[0], k)) });
    }
    case "MIRROR": {
      if (input.enter || text === "") return done(s);
      if (!pt) return { state: s, message: "Invalid point" };
      if (!last) return { state: { ...s, step: 1, pts: [pt], prompt: PROMPTS.MIRROR[1] } };
      if (dist(last, pt) < 1e-9) return { state: s };
      return done(s, { add: sel().map((e) => ({ ...mirror(e, last, pt), id: uid() })) });
    }
    case "OFFSET": {
      if (s.step === 0) {
        const d = numeric(text);
        if (d === null || d <= 0) return input.enter ? done(s) : { state: s, message: "Enter a positive distance" };
        return { state: { ...s, step: 1, data: { d }, prompt: PROMPTS.OFFSET[1] } };
      }
      if (input.enter || text === "") return done(s);
      if (s.step === 1) {
        if (!input.point) return { state: s };
        const hit = ctx.entities.find((e) => hitTest(e, input.point!, 0.15));
        if (!hit) return { state: s, message: "No object there" };
        return { state: { ...s, step: 2, data: { ...s.data, target: hit.id }, prompt: PROMPTS.OFFSET[2] } };
      }
      const target = ctx.entities.find((e) => e.id === s.data.target);
      if (!target || !pt) return { state: s };
      const o = offset(target, s.data.d!, pt);
      return {
        state: { ...s, step: 1, data: { d: s.data.d }, prompt: PROMPTS.OFFSET[1] },
        ...(o ? { add: [{ ...o, id: uid() }] } : { message: "Can't offset that object" }),
      };
    }
  }
  return done(s);
}

/** Rubber-band preview of what the next click would create. */
export function preview(s: CadState, cursor: Pt | null, ctx: CadCtx): Entity[] {
  if (!s.cmd || !cursor) return [];
  const last = s.pts.at(-1);
  const b = { id: "preview", layer: ctx.layer };
  switch (s.cmd) {
    case "LINE":
    case "DIST":
    case "MIRROR":
      return last ? [{ ...b, kind: "line", a: last, b: cursor }] : [];
    case "WALL":
      return last ? [{ ...b, layer: "A-WALL", kind: "wall", a: last, b: cursor, t: ctx.wall.t, mat: ctx.wall.mat }] : [];
    case "PLINE":
      return s.pts.length ? [{ ...b, kind: "pline", pts: [...s.pts, cursor], closed: false }] : [];
    case "RECTANG":
      return last ? [{ ...b, kind: "pline", closed: true, pts: [last, [cursor[0], last[1]], cursor, [last[0], cursor[1]]] }] : [];
    case "CIRCLE":
      return last ? [{ ...b, kind: "circle", c: last, r: Math.max(0.01, dist(last, cursor)) }] : [];
    case "ARC": {
      if (s.pts.length === 1) return [{ ...b, kind: "line", a: s.pts[0], b: cursor }];
      if (s.pts.length === 2) {
        const a = arc3(s.pts[0], s.pts[1], cursor);
        return a ? [{ ...b, kind: "arc", ...a }] : [];
      }
      return [];
    }
    case "DIMLINEAR": {
      if (s.pts.length === 1) return [{ ...b, kind: "line", a: s.pts[0], b: cursor }];
      if (s.pts.length === 2) {
        const [a, q] = s.pts;
        const L = dist(a, q) || 1;
        const off = (cursor[0] - a[0]) * ((q[1] - a[1]) / L) + (cursor[1] - a[1]) * (-(q[0] - a[0]) / L);
        return [{ ...b, kind: "dim", a, b: q, off }];
      }
      return [];
    }
    case "MOVE":
    case "COPY":
      if (s.step !== 1) return [];
      return ctx.entities
        .filter((e) => s.sel.includes(e.id))
        .map((e) => ({ ...move(e, cursor[0] - s.pts[0][0], cursor[1] - s.pts[0][1]), id: `preview-${e.id}` }));
    case "ROTATE":
      if (s.step !== 1) return [];
      return ctx.entities
        .filter((e) => s.sel.includes(e.id))
        .map((e) => ({ ...rotate(e, s.pts[0], angleOf(s.pts[0], cursor)), id: `preview-${e.id}` }));
  }
  return [];
}
