/**
 * Hand-routed conduit. A route is the list of bend points between two chained devices;
 * the first edit copies the automatic route so the user starts from what they see.
 */
import type { EditorDoc, V3 } from "./parts";

const interior = (path: V3[]) => path.slice(1, -1);
const round = (v: number) => Math.round(v * 1000) / 1000;
const r3 = (p: V3): V3 => [round(p[0]), round(p[1]), round(p[2])];

function withRoute(doc: EditorDoc, key: string, pts: V3[]): EditorDoc {
  return { ...doc, routes: { ...(doc.routes ?? {}), [key]: pts.map(r3) } };
}

/** Bend points currently in force (custom, else from the automatic path). */
export const bendsOf = (doc: EditorDoc, key: string, path: V3[]) => doc.routes?.[key] ?? interior(path);

/** Move bend `i` (0-based among the bends). */
export function moveBend(doc: EditorDoc, key: string, path: V3[], i: number, p: V3): EditorDoc {
  const pts = [...bendsOf(doc, key, path)];
  if (i < 0 || i >= pts.length) return doc;
  pts[i] = p;
  return withRoute(doc, key, pts);
}

/** Distance from p to segment ab and the closest point on it. */
function closest(p: V3, a: V3, b: V3): { d: number; q: V3 } {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / len2)) : 0;
  const q: V3 = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  return { d: Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), q };
}

/**
 * Add a bend on the run nearest to `at`. Plan clicks have no height, so pass `flat` to
 * measure in x/z only and take the height of the run at that spot.
 */
export function addBend(doc: EditorDoc, key: string, path: V3[], at: V3, flat = false): { doc: EditorDoc; index: number } {
  const full = [path[0], ...bendsOf(doc, key, path), path[path.length - 1]];
  let best = { seg: 0, d: Infinity, q: at as V3 };
  for (let s = 1; s < full.length; s++) {
    const a = full[s - 1];
    const b = full[s];
    const c = flat ? closest([at[0], 0, at[2]], [a[0], 0, a[2]], [b[0], 0, b[2]]) : closest(at, a, b);
    if (c.d < best.d) {
      // height along the run at that spot
      const t = Math.hypot(c.q[0] - a[0], c.q[2] - a[2]) / (Math.hypot(b[0] - a[0], b[2] - a[2]) || 1);
      const q: V3 = flat ? [c.q[0], a[1] + (b[1] - a[1]) * t, c.q[2]] : c.q;
      best = { seg: s, d: c.d, q };
    }
  }
  const pts = [...bendsOf(doc, key, path)];
  pts.splice(best.seg - 1, 0, best.q);
  return { doc: withRoute(doc, key, pts), index: best.seg - 1 };
}

export function removeBend(doc: EditorDoc, key: string, path: V3[], i: number): EditorDoc {
  const pts = bendsOf(doc, key, path).filter((_, j) => j !== i);
  return withRoute(doc, key, pts);
}

export function resetRoute(doc: EditorDoc, key: string): EditorDoc {
  if (!doc.routes?.[key]) return doc;
  const routes = { ...doc.routes };
  delete routes[key];
  return { ...doc, routes };
}

/** Drop routes that no longer join two chained devices (after deletes or re-wiring). */
export function pruneRoutes(doc: EditorDoc, liveKeys: Set<string>): EditorDoc {
  if (!doc.routes) return doc;
  const keep = Object.entries(doc.routes).filter(([k]) => liveKeys.has(k));
  if (keep.length === Object.keys(doc.routes).length) return doc;
  return { ...doc, routes: Object.fromEntries(keep) };
}
