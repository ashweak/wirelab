"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { CEILING_COLOR, itemInfo, type InvItem } from "./ItemPreview";
import { FURNITURE } from "@/editor/interior";
import { FLOOR_MATERIALS, WALL_MATERIALS } from "@/editor/construction";
import { PART_INFO } from "@/editor/parts";
import { useThumb } from "./Thumbnails";

const ThumbnailFactory = dynamic(() => import("./Thumbnails"), { ssr: false });
export { ThumbnailFactory };

const ItemPreview = dynamic(() => import("./ItemPreview"), { ssr: false });

/** How long the cursor must rest on a slot before the 3D preview opens (ms). */
export const HOVER_MS = 600;

const shade = (hex: string, k: number) => {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
};

/** Little isometric block in the item's proportions and colour. */
function IsoBlock({ w, d, h, color }: { w: number; d: number; h: number; color: string }) {
  const m = Math.max(w, d, h);
  const [a, b, c] = [w / m, d / m, h / m].map((v) => Math.max(v, 0.12));
  const S = 13;
  const cx = 16;
  const iso = (x: number, z: number, y: number): string =>
    `${(cx + (x - z) * 0.866 * S).toFixed(1)},${(17 + (x + z) * 0.5 * S - y * S * 1.1 - (c * S * 1.1 - (a + b) * 0.5 * S) / 2 + 2).toFixed(1)}`;
  const top = [iso(0, 0, c), iso(a, 0, c), iso(a, b, c), iso(0, b, c)].join(" ");
  const left = [iso(0, b, c), iso(a, b, c), iso(a, b, 0), iso(0, b, 0)].join(" ");
  const right = [iso(a, 0, c), iso(a, b, c), iso(a, b, 0), iso(a, 0, 0)].join(" ");
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
      <polygon points={left} fill={shade(color, 0.72)} />
      <polygon points={right} fill={shade(color, 0.88)} />
      <polygon points={top} fill={shade(color, 1.08)} />
    </svg>
  );
}

/** Rendered icon of the real model, with the flat swatch while it is being drawn. */
function Icon({ item }: { item: InvItem }) {
  const src = useThumb(item);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" draggable={false} className="h-[38px] w-[38px] object-contain drop-shadow-[1px_2px_0_rgba(0,0,0,0.35)]" /> : <Swatch item={item} />;
}

function Swatch({ item }: { item: InvItem }) {
  if (item.kind === "furniture") {
    const f = FURNITURE[item.id];
    return <IsoBlock w={f.w} d={f.d} h={f.h} color={f.color} />;
  }
  if (item.kind === "part") {
    return <span className="text-lg leading-none text-amber-300">{GLYPH[PART_INFO[item.id].model] ?? "•"}</span>;
  }
  if (item.kind === "wall") {
    const m = WALL_MATERIALS.find((x) => x.id === item.id)!;
    return (
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect x="2" y="4" width="28" height="24" fill={m.color} />
        {[10, 16, 22].map((y) => (
          <line key={y} x1="2" x2="30" y1={y} y2={y} stroke="#0006" />
        ))}
        {[
          [9, 4, 10],
          [23, 4, 10],
          [16, 10, 16],
          [9, 16, 22],
          [23, 16, 22],
          [16, 22, 28],
        ].map(([x, y1, y2], i) => (
          <line key={i} x1={x} x2={x} y1={y1} y2={y2} stroke="#0006" />
        ))}
      </svg>
    );
  }
  const color =
    item.kind === "floor" ? FLOOR_MATERIALS.find((x) => x.id === item.id)!.color : (CEILING_COLOR[item.id] ?? "#eee");
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
      <polygon points="16,6 30,13 16,20 2,13" fill={color} stroke="#0005" />
      <polygon points="2,13 16,20 16,24 2,17" fill={shade(color, 0.7)} />
      <polygon points="16,20 30,13 30,17 16,24" fill={shade(color, 0.85)} />
      {item.kind === "floor" && <path d="M9,9.5 L23,16.5 M23,9.5 L9,16.5" stroke="#0003" />}
    </svg>
  );
}

export const GLYPH: Record<string, string> = {
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

export const itemLabel = (item: InvItem) =>
  item.kind === "part" ? PART_INFO[item.id].label : itemInfo(item).title;

/** Hover-to-preview: one shared floating 3D view for every slot. */
export function useItemPreview() {
  const [shown, setShown] = useState<{ item: InvItem; x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const timer = useRef<number | null>(null);
  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const bind = useCallback(
    (item: InvItem) => ({
      onMouseEnter: (e: React.MouseEvent) => {
        clear();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        timer.current = window.setTimeout(() => {
          setMounted(true);
          setShown({ item, x: r.right + 10, y: Math.max(8, Math.min(window.innerHeight - 290, r.top - 60)) });
        }, HOVER_MS);
      },
      onMouseLeave: () => {
        clear();
        setShown(null);
      },
      onMouseDown: () => {
        clear();
        setShown(null);
      },
    }),
    [],
  );
  const info = shown ? (shown.item.kind === "part" ? partInfo(shown.item.id) : itemInfo(shown.item)) : null;
  const popover = mounted ? (
    <div
      role="tooltip"
      data-testid="item-preview"
      className="pointer-events-none fixed z-50 w-56 overflow-hidden rounded-md border-2 border-[#373737] bg-[#1b1530] shadow-2xl"
      style={{ left: shown?.x ?? -9999, top: shown?.y ?? -9999, visibility: shown ? "visible" : "hidden", outline: "2px solid #2a0f5a" }}
    >
      <div className="h-48 w-full">{shown && <ItemPreview item={shown.item} />}</div>
      {info && (
        <div className="px-2 py-1.5 font-mono text-[11px]">
          <p className="font-semibold text-white">{info.title}</p>
          {info.lines.map((l, i) => (
            <p key={i} className={i === 0 ? "text-sky-300" : "text-slate-400"}>
              {l}
            </p>
          ))}
          <p className="mt-0.5 text-[9px] text-slate-500">↻ rotating 360°</p>
        </div>
      )}
    </div>
  ) : null;
  return { bind, popover, shown: shown?.item ?? null };
}

function partInfo(t: InvItem["id"]) {
  const p = PART_INFO[t as keyof typeof PART_INFO];
  return {
    title: p.label,
    lines: [p.va ? `${p.va} VA · ${p.circuit} circuit` : `no load · ${p.circuit}`, `${p.group}`],
  };
}

/** A Minecraft-style inventory grid of square slots. */
export function SlotGrid({
  items,
  isActive,
  onPick,
  dragData,
  bind,
}: {
  items: InvItem[];
  isActive: (item: InvItem) => boolean;
  onPick: (item: InvItem) => void;
  dragData?: (item: InvItem) => string | null;
  bind: (item: InvItem) => Record<string, unknown>;
}) {
  return (
    <div className="grid grid-cols-4 gap-[3px] rounded-sm bg-[#8b8b8b] p-[3px] shadow-[inset_2px_2px_0_#373737,inset_-2px_-2px_0_#fff8]">
      {items.map((item) => {
        const active = isActive(item);
        const data = dragData?.(item);
        return (
          <button
            key={`${item.kind}-${item.id}`}
            draggable={!!data}
            onDragStart={data ? (e) => e.dataTransfer.setData("application/x-wirelab", data) : undefined}
            onClick={() => onPick(item)}
            aria-label={itemLabel(item)}
            data-slot={`${item.kind}:${item.id}`}
            className={`flex aspect-square items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_#373737,inset_-2px_-2px_0_#ffffff] transition hover:bg-[#c5c5c5] ${
              active ? "outline outline-2 -outline-offset-2 outline-amber-400" : ""
            }`}
            {...bind(item)}
          >
            <Icon item={item} />
          </button>
        );
      })}
    </div>
  );
}
