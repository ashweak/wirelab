"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PlanView from "./PlanView";
import type { SceneCircuit, SceneDevice } from "./sceneData";
import { PAPERS, SCALES, layoutSheet, pageSize, type Extents, type Orientation, type SheetLayout } from "@/print/paper";
import { bbox } from "@/cad/geometry";
import type { Draft, EditorDoc } from "@/editor/parts";
import type { Schedule } from "@/engine/types";
import type { Estimate } from "@/editor/construction";
import type { MaterialLine } from "@/editor/wiring";

const noop = () => {};

/** Characters the standard PDF fonts cannot show. */
export const pdfText = (s: string) =>
  s
    .replace(/≈/g, "~")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/→/g, "->")
    .replace(/₃/g, "3")
    .replace(/✓/g, "OK")
    .replace(/[^\x00-\xFF—–’‘“”•…]/g, "");

export function extentsOf(doc: EditorDoc, draft?: Draft): Extents {
  const xs: number[] = [];
  const zs: number[] = [];
  for (const r of doc.rooms) xs.push(r.x, r.x + r.w), zs.push(r.z, r.z + r.d);
  for (const f of doc.furniture ?? []) xs.push(f.x - f.w / 2, f.x + f.w / 2), zs.push(f.z - f.d / 2, f.z + f.d / 2);
  for (const q of doc.parts) xs.push(q.position[0]), zs.push(q.position[2]);
  for (const e of draft?.entities ?? []) {
    const [a, b] = bbox(e);
    xs.push(a[0], b[0]);
    zs.push(a[1], b[1]);
  }
  if (!xs.length) return { minX: 0, maxX: 10, minZ: 0, maxZ: 8 };
  // a little breathing room for dimension strings
  return { minX: Math.min(...xs) - 0.8, maxX: Math.max(...xs) + 0.8, minZ: Math.min(...zs) - 0.8, maxZ: Math.max(...zs) + 0.8 };
}

export interface PdfSource {
  doc: EditorDoc;
  draft: Draft;
  circuits: SceneCircuit[];
  schedule: Schedule | null;
  panel: SceneDevice | null;
  loose: SceneDevice[];
  title: string;
  bom: MaterialLine[];
  est: Estimate;
  capture3d: (() => string | null) | null;
}

type Sheets = { floor: boolean; circuit: boolean; tables: boolean; view3d: boolean };

export default function PdfDialog({ src, onClose, onDone }: { src: PdfSource; onClose: () => void; onDone: (msg: string, bad?: boolean) => void }) {
  const [paperId, setPaperId] = useState("A3");
  const [orient, setOrient] = useState<Orientation>("landscape");
  const [scale, setScale] = useState<number | "fit">("fit");
  const [sheets, setSheets] = useState<Sheets>({ floor: true, circuit: true, tables: true, view3d: !!src.capture3d });
  const [name, setName] = useState(src.title.replace(/[\\/:*?"<>|]/g, "").trim() || "wirelab-plans");
  const [job, setJob] = useState<{ floor: SheetLayout; circuit: SheetLayout } | null>(null);
  const floorRef = useRef<HTMLDivElement>(null);
  const circRef = useRef<HTMLDivElement>(null);

  const paper = PAPERS.find((p) => p.id === paperId)!;
  const page = pageSize(paper, orient);
  const ext = useMemo(() => extentsOf(src.doc, src.draft), [src.doc, src.draft]);
  const floorL = layoutSheet(page, ext, { scale, legend: false });
  const circL = layoutSheet(page, ext, { scale, legend: true });
  const groups = [...new Set(PAPERS.map((p) => p.group))];
  const date = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    const go = async () => {
      // let the hidden sheets paint
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      try {
        const [{ jsPDF }, { svg2pdf }, at] = await Promise.all([import("jspdf"), import("svg2pdf.js"), import("jspdf-autotable")]);
        const autoTable = at.default;
        const pdf = new jsPDF({ orientation: orient, unit: "mm", format: [page.w, page.h] });
        let first = true;
        const newPage = () => {
          if (!first) pdf.addPage([page.w, page.h], orient);
          first = false;
        };
        const plan = async (el: HTMLDivElement | null, l: SheetLayout) => {
          const svg = el?.querySelector("svg");
          if (!svg) return;
          const clone = svg.cloneNode(true) as SVGSVGElement;
          clone.setAttribute("viewBox", `0 0 ${l.w} ${l.h}`);
          newPage();
          await svg2pdf(clone, pdf, { x: 0, y: 0, width: page.w, height: page.h });
        };
        if (sheets.floor) await plan(floorRef.current, job.floor);
        if (sheets.circuit && src.schedule) await plan(circRef.current, job.circuit);

        const M = 12;
        const heading = (t: string, y: number) => {
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(12);
          pdf.text(pdfText(t), M, y);
          pdf.setFont("helvetica", "normal");
        };
        const table = (title: string, head: string[], body: (string | number)[][]) => {
          const last = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
          let y = last ? last.finalY + 10 : M + 14;
          if (y > page.h - 40) {
            pdf.addPage([page.w, page.h], orient);
            y = M + 6;
          }
          heading(title, y);
          autoTable(pdf, {
            startY: y + 3,
            head: [head.map(pdfText)],
            body: body.map((r) => r.map((c) => pdfText(String(c)))),
            margin: { left: M, right: M },
            theme: "grid",
            styles: { fontSize: 8, cellPadding: 1.4 },
            headStyles: { fillColor: [31, 41, 51] },
          });
        };
        if (sheets.tables) {
          newPage();
          pdf.setFontSize(9);
          pdf.text(pdfText(`${src.title} · Schedules, materials and estimate · ${date}`), M, M);
          pdf.text("Draft rules - a design aid only; values must be confirmed by a licensed PEE.", M, M + 4);
          (pdf as unknown as { lastAutoTable?: unknown }).lastAutoTable = undefined;
          const s = src.schedule;
          if (s) {
            table(
              "Load schedule",
              ["Ckt", "Description", "VA", "A", "Breaker", "Wire mm²", "Run m", "VD %"],
              [
                ...s.circuits.map((c) => [c.id, c.name, c.loadVA, c.currentA.toFixed(1), `${c.breakerA} A`, c.wireMm2.toFixed(1), c.runM.toFixed(1), c.dropPct.toFixed(1)]),
                ["Main", "Service entrance", s.main.loadVA, s.main.currentA.toFixed(1), `${s.main.breakerA} A`, s.main.feederMm2.toFixed(1), "", s.main.dropPct.toFixed(1)],
              ],
            );
            table(
              "PEC checks",
              ["Code", "Severity", "Finding", "Fix"],
              s.checks.length ? s.checks.map((c) => [c.code, c.severity, c.message, c.fix]) : [["-", "ok", "All checks pass", ""]],
            );
          }
          if (src.bom.length) table("Electrical rough-in materials", ["Item", "Qty", "Unit"], src.bom.map((m) => [m.item, m.qty, m.unit]));
          const groupsRows = (gs: Estimate["walls"]) => gs.flatMap((g) => g.items.map((i) => [g.label, g.areaM2.toFixed(1), i.item, i.qty, i.unit]));
          const est = [...groupsRows(src.est.walls), ...groupsRows(src.est.floors), ...groupsRows(src.est.ceilings)];
          if (est.length) table("Construction estimate", ["System", "Area m²", "Item", "Qty", "Unit"], est);
          if (src.est.openings.length) table("Doors and windows", ["Item", "Qty", "Unit"], src.est.openings.map((o) => [o.item, o.qty, o.unit]));
        }
        const shot = sheets.view3d ? src.capture3d?.() : null;
        if (shot) {
          newPage();
          const img = new Image();
          img.src = shot;
          await img.decode();
          const maxW = page.w - 24;
          const maxH = page.h - 30;
          const r = Math.min(maxW / img.width, maxH / img.height);
          pdf.setFontSize(11);
          pdf.text(pdfText(`${src.title} · 3D view`), 12, 12);
          pdf.addImage(shot, "PNG", (page.w - img.width * r) / 2, 18, img.width * r, img.height * r);
        }
        if (first) throw new Error("Pick at least one sheet");
        if (!cancelled) {
          pdf.save(`${name || "wirelab"}.pdf`);
          onDone(`Saved ${name || "wirelab"}.pdf · ${paper.id} ${orient}${sheets.floor || sheets.circuit ? ` · 1:${job.floor.scale}` : ""}`);
          onClose();
        }
      } catch (e) {
        onDone(`PDF export failed: ${(e as Error).message}`, true);
      } finally {
        if (!cancelled) setJob(null);
      }
    };
    go();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  const planProps = (mode: "floor" | "circuit", l: SheetLayout, sheet: string) => (
    <PlanView
      doc={src.doc}
      mode={mode}
      circuits={src.circuits}
      schedule={src.schedule}
      panel={src.panel}
      loose={src.loose}
      selection={null}
      dragging={false}
      panOnEmpty={false}
      preview={null}
      ghost={null}
      measure={null}
      title={src.title}
      onRoomDown={noop}
      onPartDown={noop}
      onFurnitureDown={noop}
      onHandleDown={noop}
      onFloorDown={noop}
      onFloorMove={noop}
      onFloorUp={noop}
      onDragMove={noop}
      onDragEnd={noop}
      cad={{ active: false, draft: src.draft, selection: [], preview: [], cursor: null, last: null, onHover: noop, onClick: noop, onWindow: noop }}
      print={{ k: l.k, ox: l.ox, oy: l.oy, w: l.w, h: l.h, sheet, scale: `1:${l.scale}`, date }}
    />
  );

  const sel = "rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200";
  const lab = "flex flex-col gap-1 text-[10px] uppercase tracking-wider text-slate-500";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-label="Export PDF" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 p-4 text-slate-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Export PDF</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={`${lab} col-span-2`}>
            Paper
            <select value={paperId} onChange={(e) => setPaperId(e.target.value)} className={sel} aria-label="Paper size">
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {PAPERS.filter((p) => p.group === g).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className={lab}>
            Orientation
            <select value={orient} onChange={(e) => setOrient(e.target.value as Orientation)} className={sel} aria-label="Orientation">
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          </label>
          <label className={lab}>
            Plan scale
            <select
              value={String(scale)}
              onChange={(e) => setScale(e.target.value === "fit" ? "fit" : Number(e.target.value))}
              className={sel}
              aria-label="Plan scale"
            >
              <option value="fit">Fit to sheet (standard)</option>
              {SCALES.map((n) => (
                <option key={n} value={n}>
                  1:{n}
                </option>
              ))}
            </select>
          </label>
          <div className="col-span-2 flex flex-col gap-1 text-xs">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Sheets</p>
            {(
              [
                ["floor", "A-1 Floor plan"],
                ["circuit", "E-1 Electrical / circuit plan"],
                ["tables", "Load schedule, PEC checks, materials and estimate"],
                ["view3d", src.capture3d ? "3D view (current camera)" : "3D view — open the 3D view first"],
              ] as [keyof Sheets, string][]
            ).map(([k, label]) => (
              <label key={k} className={`flex items-center gap-2 ${k === "view3d" && !src.capture3d ? "text-slate-600" : ""}`}>
                <input
                  type="checkbox"
                  checked={sheets[k]}
                  disabled={(k === "view3d" && !src.capture3d) || (k === "circuit" && !src.schedule)}
                  onChange={(e) => setSheets({ ...sheets, [k]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          <label className={`${lab} col-span-2`}>
            File name
            <input value={name} onChange={(e) => setName(e.target.value.replace(/[\\/:*?"<>|]/g, ""))} className={sel} aria-label="File name" />
          </label>
        </div>
        <p className={`mt-3 font-mono text-[11px] ${floorL.fits ? "text-sky-300" : "text-amber-300"}`}>
          {page.w.toFixed(0)} × {page.h.toFixed(0)} mm · plans at 1:{floorL.scale}
          {floorL.fits ? "" : " — too big for this sheet; pick a smaller scale or larger paper"}
        </p>
        <button
          onClick={() => setJob({ floor: floorL, circuit: circL })}
          disabled={!!job}
          className="mt-3 w-full rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-300 disabled:opacity-60"
        >
          {job ? "Building PDF…" : "⤓ Download PDF"}
        </button>
      </div>
      {job && (
        <div aria-hidden style={{ position: "fixed", left: -200000, top: 0, pointerEvents: "none" }}>
          <div ref={floorRef} style={{ width: job.floor.w, height: job.floor.h }}>
            {sheets.floor && planProps("floor", job.floor, "A-1 · Floor plan")}
          </div>
          <div ref={circRef} style={{ width: job.circuit.w, height: job.circuit.h }}>
            {sheets.circuit && src.schedule && planProps("circuit", job.circuit, "E-1 · Electrical plan")}
          </div>
        </div>
      )}
    </div>
  );
}
