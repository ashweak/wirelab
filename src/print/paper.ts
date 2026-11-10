/** Paper sizes and drawing-scale maths for PDF export (all sizes in millimetres, portrait). */
export interface Paper {
  id: string;
  label: string;
  group: string;
  w: number;
  h: number;
}

export const PAPERS: Paper[] = [
  { id: "A4", label: "A4 · 210 × 297 mm", group: "ISO A", w: 210, h: 297 },
  { id: "A3", label: "A3 · 297 × 420 mm", group: "ISO A", w: 297, h: 420 },
  { id: "A2", label: "A2 · 420 × 594 mm", group: "ISO A", w: 420, h: 594 },
  { id: "A1", label: "A1 · 594 × 841 mm", group: "ISO A", w: 594, h: 841 },
  { id: "A0", label: "A0 · 841 × 1189 mm", group: "ISO A", w: 841, h: 1189 },
  { id: "B4", label: "B4 · 250 × 353 mm", group: "ISO B", w: 250, h: 353 },
  { id: "B3", label: "B3 · 353 × 500 mm", group: "ISO B", w: 353, h: 500 },
  { id: "LETTER", label: "Letter · 8.5 × 11 in", group: "US", w: 215.9, h: 279.4 },
  { id: "LEGAL", label: "Legal · 8.5 × 14 in", group: "US", w: 215.9, h: 355.6 },
  { id: "LONG", label: "Long bond (PH) · 8.5 × 13 in", group: "US", w: 215.9, h: 330.2 },
  { id: "TABLOID", label: "Tabloid / Ledger · 11 × 17 in", group: "US", w: 279.4, h: 431.8 },
  { id: "ARCH_A", label: "ARCH A · 9 × 12 in", group: "Architectural", w: 228.6, h: 304.8 },
  { id: "ARCH_B", label: "ARCH B · 12 × 18 in", group: "Architectural", w: 304.8, h: 457.2 },
  { id: "ARCH_C", label: "ARCH C · 18 × 24 in", group: "Architectural", w: 457.2, h: 609.6 },
  { id: "ARCH_D", label: "ARCH D · 24 × 36 in", group: "Architectural", w: 609.6, h: 914.4 },
  { id: "ARCH_E", label: "ARCH E · 36 × 48 in", group: "Architectural", w: 914.4, h: 1219.2 },
  { id: "ANSI_C", label: "ANSI C · 17 × 22 in", group: "Engineering", w: 431.8, h: 558.8 },
  { id: "ANSI_D", label: "ANSI D · 22 × 34 in", group: "Engineering", w: 558.8, h: 863.6 },
  { id: "ANSI_E", label: "ANSI E · 34 × 44 in", group: "Engineering", w: 863.6, h: 1117.6 },
];

/** Common architectural plan scales (1:N). */
export const SCALES = [10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 500, 1000];

/** SVG pixels per paper millimetre used when composing a sheet. */
export const PX_PER_MM = 3.5;

export type Orientation = "landscape" | "portrait";

export function pageSize(p: Paper, o: Orientation): { w: number; h: number } {
  const [a, b] = [Math.min(p.w, p.h), Math.max(p.w, p.h)];
  return o === "landscape" ? { w: b, h: a } : { w: a, h: b };
}

export interface Extents {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface SheetLayout {
  /** Sheet size in SVG px. */
  w: number;
  h: number;
  /** Plan pixels per metre. */
  k: number;
  ox: number;
  oy: number;
  /** Drawing scale 1:N. */
  scale: number;
  /** False when a fixed scale was asked for and the drawing does not fit. */
  fits: boolean;
}

/**
 * Lay a plan onto a sheet. The drawing area leaves margins for the border, title block
 * and (on circuit plans) the legend. With scale "fit" the largest standard scale that
 * fits is chosen, so the printed drawing can be measured with a scale rule.
 */
export function layoutSheet(
  page: { w: number; h: number },
  ext: Extents,
  opts: { scale: number | "fit"; legend: boolean },
): SheetLayout {
  const w = page.w * PX_PER_MM;
  const h = page.h * PX_PER_MM;
  const left = 40;
  const top = 50;
  const right = opts.legend ? 270 : 50;
  const bottom = 150;
  const availW = Math.max(50, w - left - right);
  const availH = Math.max(50, h - top - bottom);
  const spanX = Math.max(ext.maxX - ext.minX, 0.5);
  const spanZ = Math.max(ext.maxZ - ext.minZ, 0.5);
  const kFit = Math.min(availW / spanX, availH / spanZ);
  // k (px per m) for a scale 1:N: 1 m = 1000/N mm on paper = 1000·PX_PER_MM/N px
  const kOf = (n: number) => (1000 * PX_PER_MM) / n;
  let scale: number;
  if (opts.scale === "fit") scale = SCALES.find((n) => kOf(n) <= kFit) ?? SCALES[SCALES.length - 1];
  else scale = opts.scale;
  const k = kOf(scale);
  const fits = k <= kFit + 1e-9;
  const ox = left + (availW - spanX * k) / 2 - ext.minX * k;
  const oy = top + (availH - spanZ * k) / 2 - ext.minZ * k;
  return { w, h, k, ox, oy, scale, fits };
}
